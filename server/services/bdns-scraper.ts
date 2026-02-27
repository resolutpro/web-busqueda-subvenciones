import puppeteer from "puppeteer";
import { storage } from "../storage";
import { execSync } from "child_process"; //

export async function scrapeBDNS() {
  console.log("🚀 Iniciando scraping BDNS...");

  try {
    // 1. Intentar obtener la ruta de Chromium directamente del sistema
    let chromiumPath = "";
    try {
      // Ejecutamos 'which chromium' igual que lo hiciste en la consola
      chromiumPath = execSync("which chromium").toString().trim();
      console.log(`📍 Chromium detectado en sistema: ${chromiumPath}`);
    } catch (e) {
      console.error("⚠️ 'which chromium' falló en Node, probando fallback...");
      chromiumPath = "chromium"; // Fallback: confiar en el PATH
    }

    // 2. Configuración de lanzamiento optimizada para Replit
    const browser = await puppeteer.launch({
      headless: true,
      executablePath: chromiumPath || '/nix/var/nix/profiles/default/bin/chromium',
      args: [
        '--no-sandbox',             // Requerido en entornos containerizados
        '--disable-setuid-sandbox', // Requerido en entornos containerizados
        '--disable-dev-shm-usage',  // Evita errores de memoria compartida
        '--disable-gpu',
        '--single-process',         // Ahorra recursos
        '--no-zygote'
      ]
    });

    console.log("✅ Navegador lanzado correctamente.");

    // ... Resto de tu lógica de navegación ...
    const page = await browser.newPage();

    try {
      await page.goto(
        "https://www.infosubvenciones.es/bdnstrans/GE/es/convocatorias",
        { waitUntil: "networkidle2", timeout: 60000 }
      );
      console.log("📄 Página cargada.");

      // Aquí va tu lógica de extracción (puedes copiar la que tenías)
      const convocatorias = await page.evaluate(() => {
        return []; 
      });

      // Ejemplo de guardado (vacío por ahora)
      console.log(`🔍 Encontradas ${convocatorias.length} convocatorias.`);

    } catch (pageError) {
      console.error("❌ Error navegando en la página:", pageError);
    } finally {
      await browser.close();
    }

  } catch (error) {
    console.error("💀 Error CRÍTICO al lanzar Puppeteer:");
    console.error(error);
  }
}