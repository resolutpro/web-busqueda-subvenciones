import { db } from "../db";
import { boeGrants, scrapingState, companies } from "../../shared/schema";
import { eq } from "drizzle-orm";
import { checkGrantWithAI, evaluateGrantRelevance } from "./ai-evaluator";

// 🛠️ NUEVO: Función para comparar identificadores (ej. BOE-B-2024-999 vs BOE-B-2024-1000)
// Extrae el año y el número final para compararlos matemáticamente y no alfabéticamente.
function compareBoeIds(id1: string, id2: string) {
  if (!id1) return -1;
  if (!id2) return 1;
  const parts1 = id1.split('-');
  const parts2 = id2.split('-');

  const year1 = parseInt(parts1[2] || '0');
  const year2 = parseInt(parts2[2] || '0');

  // Si son de años distintos, gana el año mayor
  if (year1 !== year2) return year1 - year2;

  // Si son del mismo año, gana el número correlativo mayor
  const num1 = parseInt(parts1[3] || '0');
  const num2 = parseInt(parts2[3] || '0');
  return num1 - num2;
}


export async function fetchDailyBOE(targetDate: Date = new Date()) {
  const year = targetDate.getFullYear();
  const month = String(targetDate.getMonth() + 1).padStart(2, '0');
  const day = String(targetDate.getDate()).padStart(2, '0');
  const fechaBOE = `${year}${month}${day}`; 

  // 1. Obtener el último identificador más alto guardado
  const stateRecord = await db.select().from(scrapingState).where(eq(scrapingState.key, 'highest_boe_id')).limit(1);
  const lastBoeId = stateRecord[0]?.value || null;

  // 2. Cargar todas las empresas registradas
  const todasLasEmpresas = await db.select().from(companies);

  if (todasLasEmpresas.length === 0) {
    console.log("\n⚠️ [BOE] No hay empresas registradas. Deteniendo scraper para ahorrar peticiones a la IA.\n");
    return;
  }

  const arrayEmpresasIA = todasLasEmpresas.map(e => ({
    id: e.id,
    name: e.name,
    description: `Tamaño: ${e.size || 'No definido'}. Ubicación: ${e.location || 'No definida'}. Sector/CNAE: ${e.cnae || 'No definido'}. Actividad: ${e.description}`
  }));

  console.log(`\n🚀 [BOE] Iniciando scraping del BOE para ${arrayEmpresasIA.length} empresas...\n`);

  try {
    const response = await fetch(`https://boe.es/datosabiertos/api/boe/sumario/${fechaBOE}`, {
      method: "GET",
      headers: { "Accept": "application/json" }
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
    const diarios = Array.isArray(data.sumario.diario) ? data.sumario.diario : [data.sumario.diario];

    // --------------------------------------------------------------------------------
    // 3. FASE DE RECOPILACIÓN PREVIA Y CÁLCULO DEL ID MÁXIMO
    // --------------------------------------------------------------------------------
    let currentMaxId = "";
    const allItems: any[] = [];

    for (const diario of diarios) {
      const secciones = Array.isArray(diario.seccion) ? diario.seccion : [diario.seccion];
      const seccionAnuncios = secciones.find((s: any) => s.codigo === "5" || s.codigo === "5B");
      if (!seccionAnuncios) continue;

      const departamentos = Array.isArray(seccionAnuncios.departamento) ? seccionAnuncios.departamento : [seccionAnuncios.departamento];

      for (const depto of departamentos) {
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
          // Inyectamos el nombre del departamento en el item para tenerlo a mano luego
          item._departamentoNombre = depto.nombre;
          allItems.push(item);

          // Calculamos si este ID es el mayor visto hoy
          const id = item.identificador;
          if (!currentMaxId || compareBoeIds(id, currentMaxId) > 0) {
             currentMaxId = id;
          }
        }
      }
    }

    if (allItems.length === 0) {
       console.log("No hay anuncios relevantes en el BOE de hoy.");
       return;
    }

    // --------------------------------------------------------------------------------
    // 4. VERIFICACIÓN DE ESTADO (EL CORTAFUEGOS)
    // --------------------------------------------------------------------------------
    if (lastBoeId && currentMaxId) {
        if (compareBoeIds(currentMaxId, lastBoeId) <= 0) {
            console.log(`\n✅ [BOE] Ya está al día (Último ID procesado: ${lastBoeId}). Omitiendo análisis para ahorrar peticiones a la IA.`);
            return; // ⛔ Cortamos la función aquí para no hacer NADA MÁS.
        }
    }

    // --------------------------------------------------------------------------------
    // 5. PROCESAMIENTO CON LA IA (Solo llega aquí si hay nuevos identificadores)
    // --------------------------------------------------------------------------------
    for (const item of allItems) {
      const identificador = item.identificador;
      const titulo = item.titulo;
      const urlPdf = typeof item.url_pdf === 'object' ? item.url_pdf.texto : item.url_pdf;
      const urlHtml = item.url_html;
      const deptoNombre = item._departamentoNombre; // Lo recuperamos

      const existing = await db.select().from(boeGrants).where(eq(boeGrants.identificador, identificador));
      if (existing.length > 0) continue;

      const aiResult = await evaluateGrantRelevance(titulo, "Anuncio BOE");

      if (aiResult.isRelevant) {
        console.log(`\n📄 [BOE] Posible subvención detectada: ${identificador}`);

        let algunaEmpresaCuadra = false;
        const infoSubvencion = { identificador, titulo, departamento: deptoNombre, urlHtml };

        let iaAnalisisMasivo = await checkGrantWithAI(infoSubvencion, arrayEmpresasIA);
        const matchesArray = iaAnalisisMasivo.matches || iaAnalisisMasivo.evaluaciones || [];
        iaAnalisisMasivo.matches = matchesArray; 

        for (const match of matchesArray) {
          if (match.cuadra) {
            algunaEmpresaCuadra = true;
            console.log(`   ✅ ¡CUADRA para la empresa: ${match.companyName || match.companyId}!`);
          }
        }

        if (algunaEmpresaCuadra) {
          await db.insert(boeGrants).values({
            identificador,
            titulo,
            departamento: deptoNombre,
            fechaPublicacion: targetDate, // Se guarda con la fecha que hemos consultado
            urlPdf: urlPdf,
            urlHtml: urlHtml,
            aiAnalysis: iaAnalisisMasivo, 
          });
        }
      }
    }

    // --------------------------------------------------------------------------------
    // 6. ACTUALIZAR LOS ESTADOS EN BD AL TERMINAR
    // --------------------------------------------------------------------------------
    if (currentMaxId) {
      // Guardar el identificador récord
      await db.insert(scrapingState)
        .values({ key: 'highest_boe_id', value: currentMaxId })
        .onConflictDoUpdate({ target: scrapingState.key, set: { value: currentMaxId, updatedAt: new Date() } });
    }

    // Actualizar la fecha de última sincronización
    await db.insert(scrapingState)
      .values({ key: 'last_boe_sync', value: new Date().toISOString() })
      .onConflictDoUpdate({ target: scrapingState.key, set: { value: new Date().toISOString(), updatedAt: new Date() } });

    console.log(`\n🎉 [BOE] Sincronización completada con éxito. Nuevo ID máximo: ${currentMaxId}`);

  } catch (error) {
    console.error("Error en la extracción del BOE:", error);
  }
}