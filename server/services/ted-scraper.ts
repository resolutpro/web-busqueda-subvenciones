import puppeteer from "puppeteer";
import { execSync } from "child_process";
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
  console.log("\n🇪🇺 🚀 INICIANDO SINCRONIZACIÓN CON F&T (MODO DEEP SCRAPING) 🚀 🇪🇺");

  const todasLasEmpresas = await db.select().from(companies);

  if (todasLasEmpresas.length === 0) {
    console.log("\n⚠️ [F&T] No hay empresas registradas. Deteniendo scraper.\n");
    return; 
  }

  const arrayEmpresasIA = todasLasEmpresas.map(e => ({
    id: e.id,
    name: e.name,
    description: `Tamaño:d ${e.size || 'No definido'}. Ubicación: ${e.location || 'No definida'}. Sector/CNAE: ${e.cnae || 'No definido'}. Actividad: ${e.description}`
  }));

  // Limpieza de procesos zombie de Chromium antes de empezar
  try {
    console.log("🧹 Limpiando procesos de Chromium colgados en memoria...");
    execSync("pkill -f chromium");
    execSync("pkill -f chrome");
  } catch (e) {
    // Es normal que dé error si no hay ningún proceso abierto, lo ignoramos.
  }
  // === PREPARAMOS EL NAVEGADOR INVISIBLE (PUPPETEER) ===
  // 1. Buscamos la ruta de la forma más segura posible en Replit
  let chromiumPath = process.env.PUPPETEER_EXECUTABLE_PATH || "";
  if (!chromiumPath) {
    try { 
      chromiumPath = execSync("which chromium").toString().trim(); 
    } catch (e) { 
      chromiumPath = "/nix/var/nix/profiles/default/bin/chromium"; 
    }
  }

  // 2. Lanzamos Puppeteer con los argumentos optimizados para evitar el crasheo
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: chromiumPath,
    args: [
      '--no-sandbox', 
      '--disable-setuid-sandbox', 
      '--disable-dev-shm-usage', // Vital para contenedores con poca RAM
      '--disable-gpu',
      '--no-zygote',
      '--disable-software-rasterizer', // Evita crasheos gráficos en Linux
      '--remote-debugging-port=9222'   // SOLUCIÓN AL WS TIMEOUT: Forza un puerto seguro
      // ⚠️ Nota: Nos aseguramos de NO incluir '--single-process' aquí
    ]
  });

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

    const sortObj = { field: "startDate", order: "DESC" };
    const displayFields = ["type","identifier","reference","callccm2Id","title","status","caName","identifier","projectAcronym","startDate","deadlineDate","deadlineModel","frameworkProgramme","typesOfAction", "description", "objective"];

    let page = 1;
    let keepFetching = true;
    let totalProcesadas = 0;

    while (keepFetching) {
      console.log(`\n📄 --- Descargando Página ${page} de SEDIA ---`);
      const url = `https://api.tech.ec.europa.eu/search-api/prod/rest/search?apiKey=SEDIA&text=***&pageSize=50&pageNumber=${page}`;

      const formData = new FormData();
      formData.append("query", new Blob([JSON.stringify(queryObj)], { type: "application/json" }), "blob");
      formData.append("sort", new Blob([JSON.stringify(sortObj)], { type: "application/json" }), "blob");
      formData.append("languages", new Blob(['["en"]'], { type: "application/json" }), "blob");
      formData.append("displayFields", new Blob([JSON.stringify(displayFields)], { type: "application/json" }), "blob");

      const response = await fetch(url, {
        method: "POST",
        headers: { "Accept": "application/json, text/plain, */*" },
        body: formData
      });

      if (!response.ok) throw new Error(`Error F&T pág ${page}: ${response.status}`);
      const data = await response.json();
      let resultados = data.results || [];

      if (resultados.length === 0) {
        console.log(`🛑 Fin de la búsqueda en la página ${page}.`);
        keepFetching = false; break; 
      }

      for (let i = 0; i < resultados.length; i++) {
        const grantItem = resultados[i];
        const meta = grantItem.metadata || grantItem; 
        const identificadorRaw = extractFTText(meta.identifier || grantItem.identifier, `FT-${Date.now()}-${i}`);
        const tituloReal = extractFTText(meta.callTitle, extractFTText(grantItem.summary, "Subvención Europea"));
        const typeId = String(grantItem.type || meta.type || "1");

        // ========================================================
        // 1. ARREGLO DE URLS: MAGIA PARA EUROPEAID Y PROSPECTS
        // ========================================================
        let urlGenerada = "";
        let idLimpio = identificadorRaw;

        // EXTRAEMOS EL ID NUMÉRICO INTERNO (Necesario para los competitive calls)
        const ccm2Id = extractFTText(meta.callccm2Id || grantItem.callccm2Id, identificadorRaw);

        // Caso A: Viene de EuropeAid (ej: europeaid/186264/dd/act/lk)
        if (identificadorRaw.toLowerCase().includes('europeaid')) {
          const match = identificadorRaw.match(/\d{5,6}/); // Saca el "186264"
          if (match) {
            idLimpio = `${match[0]}PROSPECTSEN`;
            urlGenerada = `https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/prospect-details/${idLimpio}`;
          }
        } 
        // Caso B: Es explícitamente un Prospect (por el texto del identificador)
        else if (identificadorRaw.toUpperCase().includes('PROSPECT')) {
          idLimpio = identificadorRaw.toUpperCase().includes("PROSPECTSEN") 
            ? identificadorRaw : `${identificadorRaw}PROSPECTSEN`;
          urlGenerada = `https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/prospect-details/${idLimpio}`;
        } 
        // Caso C: Llamadas competitivas (Cascade Funding) - Tipo 8 genérico
        else if (typeId === "8") {
          // Usamos el ccm2Id numérico (ej: 13848) en lugar del string (SMP-COSME-...)
          urlGenerada = `https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/competitive-calls-cs/${ccm2Id}`;
        } 
        // Caso D: Tender normal (Tipo 2)
        else if (typeId === "2") {
          urlGenerada = `https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/tender-details/${identificadorRaw.toLowerCase()}`;
        } 
        // Caso E: Grant normal (Tipo 1 u otros)
        else {
          urlGenerada = `https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/topic-details/${identificadorRaw.toLowerCase()}`;
        }

        
        const deadlineRaw = extractFTText(meta.deadlineDate || grantItem.deadlineDate, "");
        totalProcesadas++;
        console.log(`\n[F&T ${totalProcesadas}] Analizando: ${tituloReal.substring(0, 60)}...`);

        if (deadlineRaw) {
          const deadline = new Date(deadlineRaw);
          if (deadline < new Date()) {
            console.log(`   ⏭️ Descartada: Cierre expirado (${deadlineRaw}).`);
            continue; 
          }
        }

        const existe = await db.query.tedGrants.findFirst({
          where: eq(tedGrants.identificador, idLimpio)
        });

        if (existe) {
          console.log(`   ⏭️ Ya existe en BD. Saltando...`);
          continue;
        }

        const descartada = await db.query.scrapingState.findFirst({
          where: eq(scrapingState.key, `discarded_ted_${idLimpio}`)
        });

        if (descartada) {
          console.log(`   ⏭️ Ya fue evaluada y DESCARTADA anteriormente. Saltando...`);
          continue; 
        }

        // ========================================================
        // 2. NUEVO: DEEP SCRAPING OPTIMIZADO (LISTA BLANCA)
        // ========================================================
        console.log(`   🌐 Navegando a la web oficial: ${urlGenerada}`);
        let textoWebCompleto = extractFTText(grantItem.summary, "Sin resumen"); 

        const detailPage = await browser.newPage();
        try {
          // Cambiamos networkidle2 por domcontentloaded para evitar que los errores internos 
          // de Angular (como __name is not defined) aborten el scraping
          await detailPage.setRequestInterception(true);
          detailPage.on('request', (req) => {
            if (['image', 'stylesheet', 'font', 'media'].includes(req.resourceType())) {
              req.abort();
            } else {
              req.continue();
            }
          });

          
          await detailPage.goto(urlGenerada, { waitUntil: "domcontentloaded", timeout: 45000 });

          // Esperamos generosamente a que Angular pinte los datos en pantalla
          await new Promise(resolve => setTimeout(resolve, 6000));

          const textoExtraido = await detailPage.evaluate(() => {
            // ⚠️ CÓDIGO LINEAL SIN FUNCIONES INTERNAS ⚠️
            // Al evitar funciones internas, evitamos que Vite/esbuild inyecte el helper "__name" que causa el crasheo.

            // 1. Capturamos los nodos (buscando primero por ID y luego por la Clase de Angular)
            let nGen = document.querySelector('#scroll-gi');
            if (!nGen) {
              let aux = document.querySelector('.scroll-gi');
              if (aux) nGen = aux.closest('eui-card') || aux.closest('.eui-card') || aux.parentElement;
            }

            let nDesc = document.querySelector('#scroll-sep');
            if (!nDesc) {
              let aux = document.querySelector('.scroll-sep');
              if (aux) nDesc = aux.closest('eui-card') || aux.closest('.eui-card') || aux.parentElement;
            }

            let nTask = document.querySelector('#scroll-td');
            if (!nTask) {
              let aux = document.querySelector('.scroll-td');
              if (aux) nTask = aux.closest('eui-card') || aux.closest('.eui-card') || aux.parentElement;
            }

            let nInfo = document.querySelector('#scroll-fi');
            if (!nInfo) {
              let aux = document.querySelector('.scroll-fi');
              if (aux) nInfo = aux.closest('eui-card') || aux.closest('.eui-card') || aux.parentElement;
            }

            if (!nGen && !nDesc && !nTask) return null;

            // 2. Limpieza de nodos (con bucles clásicos en lugar de .map o funciones auxiliares)
            const secciones = [nGen, nDesc, nTask, nInfo];
            const textos = [];

            for (let i = 0; i < secciones.length; i++) {
              let el = secciones[i];
              if (!el) {
                textos.push("");
                continue;
              }
              // Clonamos y limpiamos
              let clone = el.cloneNode(true) as HTMLElement;
              let basuras = clone.querySelectorAll('button, eui-icon-svg, .eui-icon, svg, sedia-show-more');
              for (let j = 0; j < basuras.length; j++) {
                basuras[j].remove();
              }
              textos.push(clone.innerText || clone.textContent || "");
            }

            // 3. Montamos el prompt final estructurado para la IA
            return `
              --- INFORMACIÓN GENERAL ---
              ${textos[0]}

              --- DESCRIPCIÓN Y PROCESO ---
              ${textos[1]}
              ${textos[2] ? '\n--- DESCRIPCIÓN DE LA TAREA (TASK) ---\n' + textos[2] : ''}

              --- ENLACES ADICIONALES ---
              ${textos[3]}
            `.replace(/\s+/g, ' ').trim();
          });

          if (textoExtraido && textoExtraido.length > 100) {
            textoWebCompleto = textoExtraido;
            console.log(`   ✅ Extraída información web exitosamente (${textoWebCompleto.length} caracteres).`);
          } else {
            console.log(`   ⚠️ No se encontró la estructura HTML esperada, usando resumen de la API.`);
          }
        } catch (err: any) {
          console.error(`   ❌ Error en scraping de la web: ${err.message}`);
        } finally {
          await detailPage.close();
        }

        const grant = {
          identificador: idLimpio,
          titulo: tituloReal, 
          pais: "Unión Europea", 
          fecha: new Date(extractFTText(meta.startDate, new Date().toISOString())), 
          url: urlGenerada,
          cpv: extractFTText(meta.frameworkProgramme || grantItem.frameworkProgramme, "Programa de la UE"),
          descripcion: textoWebCompleto // Pasamos todo el texto raspado a la IA
        };

        // ==========================================
        // 🚀 BLOQUE DE IA 🚀
        // ==========================================
        console.log(`   🤖 Evaluando ${arrayEmpresasIA.length} empresas con la IA...`);
        let algunaEmpresaCuadra = false;
        let iaAnalisisMasivo = await checkGrantWithAI(grant, arrayEmpresasIA);

        const matchesArray = iaAnalisisMasivo.matches || iaAnalisisMasivo.evaluaciones || [];
        iaAnalisisMasivo.matches = matchesArray;

        for (const match of matchesArray) {
          if (match.cuadra) {
            algunaEmpresaCuadra = true;
            console.log(`   ✅ ¡CUADRA para la empresa: ${match.companyName || match.companyId}! Razón: ${match.razon.substring(0,50)}...`);
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
           // 3. NUEVO: Si la IA la rechaza, la metemos en la lista negra para siempre
           console.log(`   ❌ Descartada por la IA. Guardando en lista negra para no volver a evaluarla.`);
           try {
             await db.insert(scrapingState).values({
               key: `discarded_ted_${idLimpio}`,
               value: 'true'
             }).onConflictDoNothing(); // onConflictDoNothing evita errores si ya existiera por algún motivo
           } catch (err) {
             console.error("   ❌ Error guardando en lista negra:", err);
           }
        }
      } 

      if (resultados.length < 50) {
        console.log(`🛑 Fin de los resultados en SEDIA.`);
        keepFetching = false;
      } else {
        page++; 
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    } 

    await db.insert(scrapingState)
      .values({ key: "last_ted_sync", value: new Date().toISOString() })
      .onConflictDoUpdate({
        target: scrapingState.key,
        set: { value: new Date().toISOString(), updatedAt: new Date() }
      });

  } catch (error) {
    console.error("💀 Error crítico en F&T:", error);
    throw error;
  } finally {
    // Muy importante cerrar el navegador al terminar para no colapsar la memoria RAM del servidor
    await browser.close();
  }
}