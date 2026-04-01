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
  await registerRoutes(httpServer, app);

  // === CONFIGURACIÓN DEL CRON JOB ===
  cron.schedule("0 8 * * *", async () => {
    log("⏰ [CRON] Iniciando la descarga diaria del BOE...", "cron");
    try {
      await fetchDailyBOE();
      log("✅ [CRON] Descarga y procesamiento del BOE completado con éxito.", "cron");
    } catch (error) {
      log(`❌ [CRON] Error procesando el BOE: ${error}`, "cron");
    }

    try {
      await scrapeBDNS();
      log("✅ [CRON] Descarga y procesamiento de BDNS completado con éxito.", "cron");
    } catch (error) {
      log(`❌ [CRON] Error procesando BDNS: ${error}`, "cron");
    }

    try {
      await fetchTEDGrants();
      log("✅ [CRON] Descarga y procesamiento de TED completado con éxito.", "cron");
    } catch (error) {
      log(`❌ [CRON] Error procesando TED: ${error}`, "cron");
    }

    
  }, {
    timezone: "Europe/Madrid"
  });

  log("📅 Cron job del BOE programado para las 08:00 AM (Europe/Madrid).", "cron");
  // ===================================

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})();