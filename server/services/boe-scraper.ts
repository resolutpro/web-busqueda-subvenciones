import { db } from "../db";
import { boeGrants, scrapingState } from "../../shared/schema";
import { eq } from "drizzle-orm";
// Asume que tienes un servicio de IA exportado
import { checkGrantWithAI, evaluateGrantRelevance } from "./ai-evaluator";

export async function fetchDailyBOE() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  const fechaBOE = `${year}${month}${day}`; // Formato AAAAMMDD 

  try {
    // Petición a la API REST del BOE 
    const response = await fetch(`https://boe.es/datosabiertos/api/boe/sumario/${fechaBOE}`, {
      method: "GET",
      headers: {
        "Accept": "application/json" // Solicitamos JSON explícitamente
      }
    });

    if (!response.ok) {
      if (response.status === 404) {
        console.log("El sumario del BOE de hoy aún no está publicado o no existe.");
        return;
      }
      throw new Error(`Error API BOE: ${response.status}`);
    }

    const json = await response.json();
    const data = json.data;

    // El sumario puede tener múltiples diarios (ej. si hay extraordinarios)
    // Aseguramos que tratamos 'diario' como un array.
    const diarios = Array.isArray(data.sumario.diario) ? data.sumario.diario : [data.sumario.diario];

    for (const diario of diarios) {
      const secciones = Array.isArray(diario.seccion) ? diario.seccion : [diario.seccion];

      // Filtramos la sección 5 (Anuncios)
      const seccionAnuncios = secciones.find((s: any) => s.codigo === "5" || s.codigo === "5B");
      if (!seccionAnuncios) continue;

      const departamentos = Array.isArray(seccionAnuncios.departamento) ? seccionAnuncios.departamento : [seccionAnuncios.departamento];

      for (const depto of departamentos) {
        // Dependiendo de la estructura JSON devuelta, los items pueden colgar de epígrafe o directamente del departamento
        let items: any[] = [];

        if (depto.epigrafe) {
           const epigrafes = Array.isArray(depto.epigrafe) ? depto.epigrafe : [depto.epigrafe];
           for (const epi of epigrafes) {
             if (epi.item) items = items.concat(Array.isArray(epi.item) ? epi.item : [epi.item]);
           }
        } else if (depto.item) {
           items = items.concat(Array.isArray(depto.item) ? depto.item : [depto.item]);
        }

        for (const item of items) {
          const identificador = item.identificador;
          const titulo = item.titulo;
          const urlPdf = typeof item.url_pdf === 'object' ? item.url_pdf.texto : item.url_pdf; // Extraer URL del PDF
          const urlHtml = item.url_html;

          // Verificar si ya existe en BBDD
          const existing = await db.select().from(boeGrants).where(eq(boeGrants.identificador, identificador));
          if (existing.length > 0) continue;

          // Filtrado por IA
          const aiResult = await evaluateGrantRelevance(titulo, "Anuncio BOE");

          if (aiResult.isRelevant) {
            await db.insert(boeGrants).values({
              identificador,
              titulo,
              departamento: depto.nombre,
              fechaPublicacion: today,
              urlPdf: urlPdf,
              urlHtml: urlHtml,
              aiAnalysis: aiResult,
            });
          }
        }
      }
    }

    // Actualizar la fecha de última consulta en la base de datos
    await db.insert(scrapingState)
      .values({ key: 'last_boe_sync', value: today.toISOString() })
      .onConflictDoUpdate({ target: scrapingState.key, set: { value: today.toISOString(), updatedAt: new Date() } });

  } catch (error) {
    console.error("Error en la extracción del BOE:", error);
  }
}