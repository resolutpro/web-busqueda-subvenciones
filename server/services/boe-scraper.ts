import { db } from "../db";
import { boeGrants, scrapingState, companies } from "../../shared/schema";
import { eq } from "drizzle-orm";
// Asegúrate de importar la nueva función masiva
import { evaluateGrantRelevance, checkGrantForMultipleCompaniesWithAI } from "./ai-evaluator";

export async function fetchDailyBOE() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  const fechaBOE = `${year}${month}${day}`; // Formato AAAAMMDD 

  // 1. Cargar todas las empresas registradas para evaluarlas de golpe
  const todasLasEmpresas = await db.select().from(companies);
  if (todasLasEmpresas.length === 0) {
    console.log("\n⚠️ [BOE] No hay empresas registradas. Se procesará el BOE pero no habrá coincidencias.\n");
  } else {
    console.log(`\n🚀 [BOE] Iniciando scraping del BOE para ${todasLasEmpresas.length} empresas...\n`);
  }

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

      // Filtramos la sección 5 (Anuncios) - Aquí suelen estar las convocatorias
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

          // --------------------------------------------------------------------------------
          // PASO 1: Filtrado General (Ahorro de tokens)
          // Solo preguntamos si el título parece una subvención o ayuda en general, 
          // descartando notificaciones de multas, embargos, etc.
          // --------------------------------------------------------------------------------
          const aiResult = await evaluateGrantRelevance(titulo, "Anuncio BOE");

          if (aiResult.isRelevant) {
            console.log(`\n📄 [BOE] Posible subvención detectada: ${identificador}`);
            console.log(`   Título: ${titulo.substring(0, 100)}...`);

            // --------------------------------------------------------------------------------
            // PASO 2: Consulta Masiva (Multi-empresa)
            // Ya sabemos que es una ayuda. Ahora preguntamos a la IA a qué empresa le cuadra.
            // --------------------------------------------------------------------------------
            let algunaEmpresaCuadra = false;
            let iaAnalisisMasivo: any = { evaluaciones: [] };

            if (todasLasEmpresas.length > 0) {
              // Empaquetamos la info que tenemos para enviarla a la IA
              const infoSubvencion = {
                identificador,
                titulo,
                departamento: depto.nombre,
                urlHtml
              };

              iaAnalisisMasivo = await checkGrantForMultipleCompaniesWithAI(infoSubvencion, todasLasEmpresas);

              for (const evaluacion of iaAnalisisMasivo.evaluaciones) {
                if (evaluacion.cuadra) {
                  algunaEmpresaCuadra = true;
                  console.log(`   ✅ ¡CUADRA para la empresa ID ${evaluacion.companyId}! Razón: ${evaluacion.razon}`);
                }
              }
            }

            // Solo guardamos en la tabla de subvenciones si le ha servido a alguna empresa
            if (algunaEmpresaCuadra) {
              console.log(`   💾 Guardando anuncio del BOE en BBDD porque le cuadra a alguna empresa.`);
              await db.insert(boeGrants).values({
                identificador,
                titulo,
                departamento: depto.nombre,
                fechaPublicacion: today,
                urlPdf: urlPdf,
                urlHtml: urlHtml,
                aiAnalysis: iaAnalisisMasivo, // Guardamos el JSON completo con las evaluaciones por empresa
              });
            } else {
              console.log(`   ❌ Es una subvención genérica, pero no encaja con ninguna de nuestras empresas registradas.`);
            }
          }
        }
      }
    }

    // Actualizar la fecha de última consulta en la base de datos
    await db.insert(scrapingState)
      .values({ key: 'last_boe_sync', value: today.toISOString() })
      .onConflictDoUpdate({ target: scrapingState.key, set: { value: today.toISOString(), updatedAt: new Date() } });

    console.log("\n🎉 [BOE] Sincronización completada con éxito.");

  } catch (error) {
    console.error("Error en la extracción del BOE:", error);
  }
}