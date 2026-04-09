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

  // === PREPARAMOS EL NAVEGADOR INVISIBLE (PUPPETEER) ===
  let chromiumPath = "";
  try { chromiumPath = execSync("which chromium").toString().trim(); } 
  catch (e) { chromiumPath = "chromium"; }

  const browser = await puppeteer.launch({
    headless: true,
    executablePath: chromiumPath || '/nix/var/nix/profiles/default/bin/chromium',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
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

        // Caso A: Viene de EuropeAid (ej: europeaid/186264/dd/act/lk)
        if (identificadorRaw.toLowerCase().includes('europeaid')) {
          const match = identificadorRaw.match(/\d{5,6}/); // Saca el "186264"
          if (match) {
            idLimpio = `${match[0]}PROSPECTSEN`;
            urlGenerada = `https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/prospect-details/${idLimpio}`;
          }
        } 
        // Caso B: Es un Prospect normal (Tipo 8)
        else if (typeId === "8" || identificadorRaw.toUpperCase().includes('PROSPECT')) {
          idLimpio = identificadorRaw.toUpperCase().includes("PROSPECTSEN") 
            ? identificadorRaw : `${identificadorRaw}PROSPECTSEN`;
          urlGenerada = `https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/prospect-details/${idLimpio}`;
        } 
        // Caso C: Tender normal
        else if (typeId === "2") {
          urlGenerada = `https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/tender-details/${identificadorRaw.toLowerCase()}`;
        } 
        // Caso D: Grant normal
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

        // ========================================================
        // 2. NUEVO: DEEP SCRAPING DE LA PÁGINA WEB (PUPPETEER)
        // ========================================================
        console.log(`   🌐 Navegando a la web oficial: ${urlGenerada}`);
        let textoWebCompleto = extractFTText(grantItem.summary, "Sin resumen"); // Fallback

        const detailPage = await browser.newPage();
        try {
          await detailPage.goto(urlGenerada, { waitUntil: "networkidle2", timeout: 45000 });
          // Esperamos a que Angular pinte la web
          await new Promise(resolve => setTimeout(resolve, 4000));

          const textoExtraido = await detailPage.evaluate(() => {
            // 1. Buscamos el contenedor más central posible
            const mainBox = document.querySelector('app-prospect-details') 
              || document.querySelector('app-topic-details')
              || document.querySelector('.eui-main-content')
              || document.body;

            // Hacemos una copia invisible para poder "romperla" sin afectar la navegación
            const clone = mainBox.cloneNode(true) as HTMLElement;

            // 2. ¡Destrucción de basura web! Eliminamos nodos HTML de navegación, cookies y pie de página
            const basuras = [
              'header', 'footer', 'nav', 'eui-header', 'eui-footer', 
              '.eui-cookie-consent', '#cookie-banner', '.eui-global-menu',
              'app-internal-navigation'
            ];
            basuras.forEach(selector => {
              const elementos = clone.querySelectorAll(selector);
              elementos.forEach(el => el.remove());
            });

            let text = clone.innerText || "";

            // 3. Normalizamos los saltos de línea y espacios
            text = text.replace(/\s+/g, ' ');

            // 4. Filtro Regex: Eliminamos frases hechas que se hayan colado en el texto plano
            const filtrosTexto = [
              /This site uses cookies.*?Accept only essential cookies/gi,
              /EU F&T Portal Sign in EN Home.*?Calls for proposals/gi,
              /Internal navigation.*?Submission service/gi,
              /© \d{4} European Commission.*/gi,
              /\| About \| Accessibility \| Free text search.*/gi,
              /Start submission Start submission/gi
            ];

            filtrosTexto.forEach(regex => {
              text = text.replace(regex, '');
            });

            return text.trim();
          });

          // Si después de limpiar nos queda texto útil, lo usamos. 
          // Si nos queda vacío, usamos el resumen de la API para no enviar algo en blanco a la IA.
          if (textoExtraido && textoExtraido.length > 50) {
            textoWebCompleto = textoExtraido;
            console.log(`   ✅ Extraída la web limpia: ${textoWebCompleto.substring(0, 100)}...`);
          } else {
            console.log(`   ⚠️ Web sin descripción detallada tras limpieza, se usará la API.`);
          }
        } catch (err: any) {
          console.error(`   ❌ Error al renderizar la web, usando API: ${err.message}`);
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
           console.log(`   ❌ Descartada por la IA: No encaja con ninguna empresa.`);
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