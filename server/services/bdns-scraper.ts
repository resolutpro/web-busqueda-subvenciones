import puppeteer from "puppeteer";
import { storage } from "../storage";

export async function scrapeBDNS() {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  try {
    // Navegación a la base de datos nacional
    await page.goto(
      "https://www.infosubvenciones.es/bdnstrans/GE/es/convocatorias",
      {
        waitUntil: "networkidle2",
      },
    );

    // 1. Aquí iría la lógica para interactuar con los filtros (fecha, ámbito, etc.)
    // 2. Extracción de las filas de la tabla de resultados

    const convocatorias = await page.evaluate(() => {
      // Lógica de selector DOM para extraer:
      // ID BDNS, Título, Organismo, Importe, Fecha Fin
      return []; // Array de objetos extraídos
    });

    for (const conv of convocatorias) {
      await storage.upsertGrant({
        bdnsId: conv.id,
        title: conv.titulo,
        organismo: conv.organismo,
        scope: "Nacional", // O detectar según el organismo
        endDate: new Date(conv.fechaFin),
        budget: conv.importe,
        rawText: conv.descripcion,
        tags: [], // Lógica opcional para generar tags mediante IA más tarde
      });
    }
  } catch (error) {
    console.error("Error en el scraping de BDNS:", error);
  } finally {
    await browser.close();
  }
}
