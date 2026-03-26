import { db } from "../db";
import { tedGrants, scrapingState, companies } from "../../shared/schema";
import { eq } from "drizzle-orm";
// Importamos la nueva función masiva
import { checkGrantWithAI, checkGrantForMultipleCompaniesWithAI } from "./ai-evaluator";

// Función auxiliar para extraer datos seguros de la API de F&T
function extractFTText(field: any, defaultValue: string = "No especificado"): string {
  if (!field) return defaultValue;
  if (typeof field === "string") return field;
  if (Array.isArray(field)) return extractFTText(field[0], defaultValue);
  if (typeof field === "object") {
    const values = Object.values(field);
    return values.length > 0 ? String(values[0]) : defaultValue;
  }
  return String(field);
}

export async function fetchTEDGrants() {
  console.log("\n🇪🇺 🚀 INICIANDO SINCRONIZACIÓN CON F&T (SUBVENCIONES EUROPEAS) 🚀 🇪🇺");

  // 1. Obtener TODAS las empresas para la evaluación masiva con IA
  const todasLasEmpresas = await db.select().from(companies);

  if (todasLasEmpresas.length === 0) {
    console.log("\n⚠️ [F&T] No hay empresas registradas. Se hará scraping pero no habrá coincidencias por IA.\n");
  } else {
    console.log(`\n📝 [F&T] Se han cargado ${todasLasEmpresas.length} empresas para evaluación masiva.\n`);
  }

  try {
    // 2. Endpoint oficial de SEDIA (Funding & Tenders)
    const url = "https://api.tech.ec.europa.eu/search-api/prod/rest/search?apiKey=SEDIA&text=***&pageSize=10&pageNumber=1";

    // 3. Payload pidiendo SOLO Ayudas/Subvenciones Abiertas
    const payload = {
      "bool": {
        "must": [
          { "terms": { "type": ["1", "2"] } }, // 1 y 2 = Grants (Ayudas y Topics)
          { "terms": { "status": ["31094501", "31094502"] } } // 31094501 = Open, 31094502 = Forthcoming
        ]
      }
    };

    console.log(`📡 Conectando a la API de Subvenciones (SEDIA)...`);

    // 4. Petición POST a la Comisión Europea
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Error en F&T: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const resultados = data.results || [];

    console.log(`\n📥 Se encontraron ${resultados.length} convocatorias de subvenciones abiertas en Europa.`);

    // 5. Procesar los resultados
    for (let i = 0; i < resultados.length; i++) {
      const item = resultados[i];
      // La API de F&T puede devolver los datos sueltos o dentro de "metadata"
      const meta = item.metadata || item; 

      const identificadorRaw = extractFTText(meta.identifier, `FT-${Date.now()}-${i}`);

      const grant = {
        identificador: identificadorRaw,
        titulo: extractFTText(meta.title, "Subvención Europea sin título"),
        pais: "Unión Europea", // Las ayudas europeas suelen ser transnacionales o para cualquier país miembro
        fecha: new Date(), 
        url: `https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/topic-details/${identificadorRaw.toLowerCase()}`,
        // En F&T no hay CPV, usamos el nombre del Programa (ej. Horizon, LIFE, Erasmus)
        cpv: extractFTText(meta.programmeDivision, "Programa de la UE") 
      };

      console.log(`\n[F&T ${i+1}/${resultados.length}] Analizando: ${grant.identificador} - ${grant.titulo.substring(0, 80)}...`);

      // Comprobar si ya la tenemos
      const existe = await db.query.tedGrants.findFirst({
        where: eq(tedGrants.identificador, grant.identificador)
      });

      if (existe) {
        console.log(`   ⏭️ Ya existe en la BD. Saltando...`);
        continue;
      }

      console.log(`   🤖 Evaluando compatibilidad con la IA para múltiples empresas...`);

      // ==========================================
      // NUEVA LÓGICA DE CONSULTA IA MASIVA
      // ==========================================
      let algunaEmpresaCuadra = false;
      let iaAnalisisMasivo: any = { evaluaciones: [] };

      if (todasLasEmpresas.length > 0) {
        iaAnalisisMasivo = await checkGrantForMultipleCompaniesWithAI(grant, todasLasEmpresas);

        for (const evaluacion of iaAnalisisMasivo.evaluaciones) {
          if (evaluacion.cuadra) {
            algunaEmpresaCuadra = true;
            console.log(`   ✅ ¡CUADRA para la empresa ID ${evaluacion.companyId}! Razón: ${evaluacion.razon}`);
          }
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
            detallesExtraidos: { programa: grant.cpv }, // Guardamos el programa en lugar del CPV
            aiAnalysis: iaAnalisisMasivo // Guardamos el JSON con el veredicto de todas las empresas
          });
          console.log(`   💾 Guardada en base de datos porque cuadra con al menos una empresa.`);
        } catch (dbErr) {
          console.error("   ❌ Error guardando:", dbErr);
        }
      } else {
        console.log(`   ❌ Descartada por la IA: No encaja con ninguna de las empresas registradas.`);
      }
      // ==========================================
    }

    // Actualizar estado
    await db.insert(scrapingState)
      .values({ key: "last_ted_sync", value: new Date().toISOString() })
      .onConflictDoUpdate({
        target: scrapingState.key,
        set: { value: new Date().toISOString(), updatedAt: new Date() }
      });

    console.log("\n🎉 Sincronización de Subvenciones F&T finalizada.");

  } catch (error) {
    console.error("💀 Error crítico en F&T:", error);
    throw error;
  }
}