import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { scrapeBDNS } from "./services/bdns-scraper";
import { fetchTEDGrants } from "./services/ted-scraper";

// Importamos node-cron y tu función del BOE
import cron from "node-cron";
import { fetchDailyBOE } from "./services/boe-scraper";

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  try {
    console.log("[STARTUP] 1. Iniciando servidor...");
    await registerRoutes(httpServer, app);
    console.log("[STARTUP] 2. Rutas registradas correctamente.");

    // === CONFIGURACIÓN DEL CRON JOB ===
    cron.schedule("0 8 * * *", async () => {
      log("⏰ [CRON] Iniciando la descarga diaria...", "cron");
      try {
        await fetchDailyBOE();
        log("✅ [CRON] BOE completado.", "cron");
      } catch (error) { log(`❌ [CRON] Error BOE: ${error}`, "cron"); }

      try {
        await scrapeBDNS();
        log("✅ [CRON] BDNS completado.", "cron");
      } catch (error) { log(`❌ [CRON] Error BDNS: ${error}`, "cron"); }

      try {
        await fetchTEDGrants();
        log("✅ [CRON] TED completado.", "cron");
      } catch (error) { log(`❌ [CRON] Error TED: ${error}`, "cron"); }
    }, { timezone: "Europe/Madrid" });

    log("📅 Cron job programado para las 08:00 AM (Europe/Madrid).", "cron");
    // ===================================

    app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";
      console.error("Internal Server Error:", err);
      if (res.headersSent) return next(err);
      return res.status(status).json({ message });
    });

    if (process.env.NODE_ENV === "production") {
      console.log("[STARTUP] 3. Configurando estáticos para producción...");
      serveStatic(app);
    } else {
      console.log("[STARTUP] 3. Configurando Vite para desarrollo...");
      const { setupVite } = await import("./vite");
      await setupVite(httpServer, app);
    }

    console.log("[STARTUP] 4. Intentando exponer el puerto...");
    const PORT = process.env.PORT || 5000;
    httpServer.listen(Number(PORT), "0.0.0.0", () => {
      console.log(`[STARTUP] ✅ ÉXITO: Servidor escuchando en el puerto ${PORT}`);
      log(`serving on port ${PORT}`);
    });

    httpServer.on("error", (err) => {
      console.error("[STARTUP] ❌ Error en el servidor HTTP:", err);
    });

  } catch (error) {
    console.error("[STARTUP] ❌ Error FATAL durante el arranque:", error);
    process.exit(1); // Forzamos el cierre para que Replit registre el error
  }
})();