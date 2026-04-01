import { db } from "../db";
import { tedGrants, scrapingState, companies } from "../../shared/schema";
import { eq } from "drizzle-orm";
import { checkGrantWithAI } from "./ai-evaluator";

// Función auxiliar para extraer datos seguros de la API de F&T
function extractFTText(field: any, defaultValue: string = "No especificado"): string {
  if (field === null || field === undefined) return defaultValue;
  if (typeof field === "string") return field;
  if (Array.isArray(field)) return extractFTText(field[0], defaultValue);
  if (typeof field === "object") {
    const values = Object.values(field);
    return values.length > 0 ? String(values[0]) : defaultValue;
  }
  return String(field);
}

export async function fetchTEDGrants() {
  console.log("\n🇪🇺 🚀 INICIANDO SINCRONIZACIÓN CON F&T (MODO PAGINACIÓN COMPLETA) 🚀 🇪🇺");

  // 1. Obtener TODAS las empresas
  const todasLasEmpresas = await db.select().from(companies);

  if (todasLasEmpresas.length === 0) {
    console.log("\n⚠️ [F&T] No hay empresas registradas. Deteniendo scraper.\n");
    return; 
  }

  const arrayEmpresasIA = todasLasEmpresas.map(e => ({
    id: e.id,
    name: e.name,
    description: `Tamaño: ${e.size || 'No definido'}. Ubicación: ${e.location || 'No definida'}. Sector/CNAE: ${e.cnae || 'No definido'}. Actividad: ${e.description}`
  }));

  try {
    const queryObj = {
      bool: {
        must: [
          { terms: { type: ["1", "2", "8"] } }, 
          { terms: { status: ["31094502"] } }, // Solo "Open for submission"
          { term: { programmePeriod: "2021 - 2027" } }
        ]
      }
    };

    const sortObj = {
      field: "startDate", 
      order: "DESC"
    };

    const displayFields = ["type","identifier","reference","callccm2Id","title","status","caName","identifier","projectAcronym","startDate","deadlineDate","deadlineModel","frameworkProgramme","typesOfAction", "description", "objective"];

    // VARIABLES PARA LA PAGINACIÓN
    let page = 1;
    let keepFetching = true;
    let totalProcesadas = 0;

    // 🔥 BUCLE WHILE: Se ejecutará hasta que no queden más páginas 🔥
    while (keepFetching) {
      console.log(`\n📄 --- Descargando Página ${page} de SEDIA ---`);

      // Añadimos la variable ${page} dinámicamente a la URL
      const url = `https://api.tech.ec.europa.eu/search-api/prod/rest/search?apiKey=SEDIA&text=***&pageSize=50&pageNumber=${page}`;

      const formData = new FormData();
      formData.append("query", new Blob([JSON.stringify(queryObj)], { type: "application/json" }), "blob");
      formData.append("sort", new Blob([JSON.stringify(sortObj)], { type: "application/json" }), "blob");
      formData.append("languages", new Blob(['["en"]'], { type: "application/json" }), "blob");
      formData.append("displayFields", new Blob([JSON.stringify(displayFields)], { type: "application/json" }), "blob");

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Accept": "application/json, text/plain, */*"
        },
        body: formData
      });

      if (!response.ok) {
        throw new Error(`Error en F&T al pedir página ${page}: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      let resultados = data.results || [];

      if (resultados.length === 0) {
        console.log(`🛑 No hay más resultados en la página ${page}. Fin de la búsqueda.`);
        keepFetching = false;
        break; // Salimos del bucle while
      }

      console.log(`📥 Procesando ${resultados.length} convocatorias de esta página...`);

      // 7. Procesar los resultados de la página actual
      for (let i = 0; i < resultados.length; i++) {
        const grantItem = resultados[i];
        const meta = grantItem.metadata || grantItem; 
        const identificadorRaw = extractFTText(meta.identifier || grantItem.identifier, `FT-${Date.now()}-${i}`);
        const tituloReal = extractFTText(meta.callTitle, extractFTText(grantItem.summary, "Subvención Europea"));

        const descripcionHTML = extractFTText(
          meta.description, 
          extractFTText(
            meta.objective, 
            extractFTText(grantItem.summary, extractFTText(grantItem.content, "Sin descripción disponible"))
          )
        );

        const deadlineRaw = extractFTText(meta.deadlineDate || grantItem.deadlineDate, "");

        const grant = {
          identificador: identificadorRaw,
          titulo: tituloReal, 
          pais: "Unión Europea", 
          fecha: new Date(extractFTText(meta.startDate, new Date().toISOString())), 
          url: `https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/topic-details/${identificadorRaw.toLowerCase()}`,
          cpv: extractFTText(meta.frameworkProgramme || grantItem.frameworkProgramme, "Programa de la UE"),
          descripcion: descripcionHTML
        };

        totalProcesadas++;
        console.log(`\n[F&T ${totalProcesadas} Global] Analizando: ${grant.identificador} - ${grant.titulo.substring(0, 80)}...`);

        if (deadlineRaw) {
          const deadline = new Date(deadlineRaw);
          if (deadline < new Date()) {
            console.log(`   ⏭️ Descartada en local: La fecha límite de cierre ya pasó (${deadlineRaw}).`);
            continue; 
          }
        }

        const existe = await db.query.tedGrants.findFirst({
          where: eq(tedGrants.identificador, grant.identificador)
        });

        if (existe) {
          console.log(`   ⏭️ Ya existe en la BD. Saltando...`);
          continue;
        }

        // ==========================================
        // 🚀 BLOQUE DE IA 🚀
        // ==========================================
        console.log(`   🤖 Evaluando compatibilidad con la IA...`);
        let algunaEmpresaCuadra = false;

        let iaAnalisisMasivo = await checkGrantWithAI(grant, arrayEmpresasIA);

        const matchesArray = iaAnalisisMasivo.matches || iaAnalisisMasivo.evaluaciones || [];
        iaAnalisisMasivo.matches = matchesArray;

        for (const match of matchesArray) {
          if (match.cuadra) {
            algunaEmpresaCuadra = true;
            console.log(`   ✅ ¡CUADRA para la empresa: ${match.companyName || match.companyId}! Razón: ${match.razon}`);
          }
        }

        if (algunaEmpresaCuadra) { 
          try {
            await db.insert(tedGrants).values({
              identificador: grant.identificador,
              titulo: grant.titulo,
              pais: grant.pais,
              fechaPublicacion: grant.fecha,
              urlDetalle: grant.url,
              detallesExtraidos: { 
                programa: grant.cpv,
                fechaCierre: deadlineRaw, 
                descripcion: grant.descripcion 
              }, 
              aiAnalysis: iaAnalisisMasivo 
            });
            console.log(`   💾 Guardado correctamente en Base de Datos.`);
          } catch (dbErr) {
            console.error("   ❌ Error guardando:", dbErr);
          }
        } else {
           console.log(`   ❌ Descartada por la IA: No encaja con ninguna empresa.`);
        }
        // ==========================================
      } // Fin del for de la página actual

      // Condición para pasar a la siguiente página
      if (resultados.length < 50) {
        console.log(`🛑 Esta página trajo menos de 50 resultados (${resultados.length}). Ya no hay más páginas.`);
        keepFetching = false;
      } else {
        page++; // Sumamos 1 a la página para la siguiente vuelta del bucle
        console.log(`➡️ Pasando a la página ${page}...`);
        // Pausa de 2 segundos para no saturar el servidor de Europa
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

    } // Fin del bucle while

    // Guardar estado de sincronización al terminar TODAS las páginas
    await db.insert(scrapingState)
      .values({ key: "last_ted_sync", value: new Date().toISOString() })
      .onConflictDoUpdate({
        target: scrapingState.key,
        set: { value: new Date().toISOString(), updatedAt: new Date() }
      });

    console.log(`\n🎉 Sincronización de F&T finalizada totalmente. Se evaluaron ${totalProcesadas} convocatorias.`);

  } catch (error) {
    console.error("💀 Error crítico en F&T:", error);
    throw error;
  }
}