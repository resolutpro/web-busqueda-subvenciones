import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { execSync } from "child_process";
import { db } from "../db"; 
import { bdnsGrants, scrapingState, companies } from "../../shared/schema";
import { eq } from "drizzle-orm";
import { checkGrantWithAI } from "./ai-evaluator";

// Aplicamos camuflaje avanzado
puppeteer.use(StealthPlugin());

function parseBDNSDate(dateStr: string) {
  if (!dateStr || dateStr === "") return null;
  const [day, month, year] = dateStr.split('/');
  return new Date(`${year}-${month}-${day}`);
}

const MODOS_BUSQUEDA = [
  { id: 'C', nombre: 'Administración del Estado', seleccionarEspecificos: 'ALL' },
  { id: 'A', nombre: 'Comunidades autónomas', seleccionarEspecificos: [ 'ANDALUCÍA', 'ARAGÓN', 'CASTILLA Y LEÓN', 'COMUNITAT VALENCIANA', 'EXTREMADURA', 'GALICIA' ] },
  { id: 'L', nombre: 'Entidades locales', seleccionarEspecificos: [ 'ALMERÍA', 'CÁDIZ', 'CÓRDOBA', 'GRANADA', 'HUELVA', 'JAÉN', 'MÁLAGA', 'SEVILLA', 'HUESCA', 'TERUEL', 'ZARAGOZA', 'ÁVILA', 'BURGOS', 'LEÓN', 'PALENCIA', 'SALAMANCA', 'SEGOVIA', 'SORIA', 'VALLADOLID', 'ZAMORA', 'ALACANT / ALICANTE', 'CASTELLÓ / CASTELLÓN', 'VALÈNCIA / VALENCIA', 'BADAJOZ', 'CÁCERES', 'A CORUÑA', 'LUGO', 'OURENSE', 'PONTEVEDRA' ] },
  { id: 'O', nombre: 'Otros órganos', seleccionarEspecificos: 'ALL' }
];

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0"
];

let isBdnsScrapingRunning = false;

export async function scrapeBDNS() {
  if (isBdnsScrapingRunning) {
    console.log("⚠️ [BDNS] Proceso bloqueado: Ya hay un scraping en curso.");
    return;
  }

  isBdnsScrapingRunning = true;
  console.log("🚀 Iniciando BDNS (ESTRATEGIA DEFINITIVA: MICRO-LOTES CON DESCANSO)...");

  console.log("🧹 Limpiando RAM...");
  try { execSync("pkill -f chromium"); } catch (e) {}
  try { execSync("pkill -f chrome"); } catch (e) {}

  const oneMonthAgo = new Date();
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

  const todasLasEmpresas = await db.select().from(companies);
  if (todasLasEmpresas.length === 0) {
    isBdnsScrapingRunning = false;
    return;
  }

  const arrayEmpresasIA = todasLasEmpresas.map(e => ({
    id: e.id, name: e.name, description: `Tamaño: ${e.size}. Actividad: ${e.description}`
  }));

  let chromiumPath = "";
  try { chromiumPath = execSync("which chromium").toString().trim(); } 
  catch (e) { chromiumPath = "chromium"; }

  const browserArgs = [
    '--no-sandbox', 
    '--disable-setuid-sandbox', 
    '--disable-dev-shm-usage', 
    '--disable-gpu',
    '--single-process',
    '--no-zygote'
  ];

  try {
    for (const modo of MODOS_BUSQUEDA) {
      console.log(`\n======================================================`);
      console.log(`🔎 BÚSQUEDA: ${modo.nombre}`);
      console.log(`======================================================\n`);

      const stateKey = `highest_bdns_code_${modo.id}`;
      const stateRecord = await db.query.scrapingState.findFirst({ where: eq(scrapingState.key, stateKey) });
      const stopCodeLimit = stateRecord ? parseInt(stateRecord.value, 10) : 0;
      let highestCodeThisSession = stopCodeLimit;

      // =========================================================================
      // FASE 1: RECOPILAR ENLACES (Sin leer detalles)
      // =========================================================================
      let tableBrowser = await puppeteer.launch({ headless: true, executablePath: chromiumPath, args: browserArgs });
      let tablePage = await tableBrowser.newPage();

      await tablePage.goto("https://www.infosubvenciones.es/bdnstrans/GE/es/convocatorias", { waitUntil: "networkidle2", timeout: 60000 });
      await new Promise(resolve => setTimeout(resolve, 5000));

      try {
        await tablePage.evaluate(() => {
          const headers = Array.from(document.querySelectorAll('mat-expansion-panel-header'));
          const panelOrgano = headers.find(h => h.textContent?.includes('Órgano convocante'));
          if (panelOrgano && !panelOrgano.classList.contains('mat-expanded')) (panelOrgano as HTMLElement).click();
        });
        await new Promise(resolve => setTimeout(resolve, 1500)); 

        await tablePage.evaluate((radioValue) => {
          const radioInput = document.querySelector(`input[type="radio"][value="${radioValue}"]`);
          if (radioInput) {
            const radioContainer = radioInput.closest('mat-radio-button')?.querySelector('label');
            if (radioContainer) (radioContainer as HTMLElement).click();
          }
        }, modo.id);
        await new Promise(resolve => setTimeout(resolve, 3000)); 

        if (modo.seleccionarEspecificos) {
          await tablePage.evaluate((elementosDeseados) => {
            const nodos = document.querySelectorAll('mat-tree-node');
            for (let i = 0; i < nodos.length; i++) {
              const nodo = nodos[i];
              const labelElement = nodo.querySelector('.mat-checkbox-label');
              if (!labelElement) continue;
              const textoCheckbox = labelElement.textContent?.trim().toUpperCase() || "";
              const checkbox = nodo.querySelector('mat-checkbox');
              const isChecked = checkbox?.classList.contains('mat-checkbox-checked');
              let deberiaEstarMarcado = (elementosDeseados === 'ALL') || (Array.isArray(elementosDeseados) && elementosDeseados.includes(textoCheckbox));
              if (isChecked !== deberiaEstarMarcado) {
                const labelClickable = nodo.querySelector('label.mat-checkbox-layout');
                if (labelClickable) (labelClickable as HTMLElement).click();
              }
            }
          }, modo.seleccionarEspecificos);
          await new Promise(resolve => setTimeout(resolve, 3000));
        }

        await tablePage.evaluate(() => {
          const botones = Array.from(document.querySelectorAll('button'));
          const btnFiltrar = botones.find(btn => btn.textContent?.toLowerCase().includes('filtrar'));
          if (btnFiltrar) (btnFiltrar as HTMLElement).click();
        });
        await new Promise(resolve => setTimeout(resolve, 8000));
      } catch (err) {
        await tableBrowser.close().catch(()=>{});
        continue; 
      }

      let keepScraping = true;
      let enlacesAProcesar = [];

      while (keepScraping) {
        const convocatoriasPagina = await tablePage.evaluate(() => {
          const filas = Array.from(document.querySelectorAll('table tbody tr'));
          return filas.map(fila => {
            const columnas = fila.querySelectorAll('td');
            if (columnas.length < 3 || columnas[0].innerText.includes("Cargando")) return null; 
            const etiquetaEnlace = columnas[5].querySelector('a');
            return {
              codigoBDNS: columnas[0].innerText.trim(),
              fechaRegistro: columnas[4].innerText.trim(),
              titulo: columnas[5].innerText.trim(),
              organoConvocante: columnas[3].innerText.trim(),
              urlDetalle: etiquetaEnlace ? etiquetaEnlace.href : null
            };
          }).filter(item => item !== null);
        });

        if (convocatoriasPagina.length === 0) break;

        for (const convocatoria of convocatoriasPagina) {
          if (!convocatoria || !convocatoria.urlDetalle) continue;

          const codigoLimpio = convocatoria.codigoBDNS.replace(/\D/g, '');
          const currentCode = parseInt(codigoLimpio, 10);
          const currentDate = parseBDNSDate(convocatoria.fechaRegistro);

          if (isNaN(currentCode)) continue;
          if (currentDate && currentDate < oneMonthAgo) {
            keepScraping = false; break; 
          }
          if (currentCode > stopCodeLimit) {
             enlacesAProcesar.push({ ...convocatoria, currentCode, codigoLimpio, currentDate });
          }
        }

        if (keepScraping) {
          try {
            const estaDeshabilitado = await tablePage.$('button.mat-paginator-navigation-next[disabled], button.mat-paginator-navigation-next.mat-button-disabled');
            if (!estaDeshabilitado) {
              await tablePage.evaluate(() => { (document.querySelector('button.mat-paginator-navigation-next') as HTMLElement)?.click(); });
              await new Promise(resolve => setTimeout(resolve, 4000));
            } else { keepScraping = false; }
          } catch (err) { keepScraping = false; }
        }
      } 

      await tableBrowser.close().catch(()=>{}); // Cerramos el navegador de la tabla

      if (enlacesAProcesar.length === 0) {
        console.log(`✅ No hay subvenciones nuevas en esta sección.`);
        continue;
      }

      // 🔄 MAGIA: Damos la vuelta a los enlaces. Empezamos por el más viejo. 
      // Si nos bloquean o crashea, guardará por dónde iba de forma segura.
      enlacesAProcesar.reverse();
      console.log(`✅ [FASE 1] Extraídos ${enlacesAProcesar.length} enlaces. Procesando del más antiguo al más nuevo...`);

      // =========================================================================
      // FASE 2: MICRO-LOTES CON DESCANSO PARA EVADIR EL WAF (CORTAFUEGOS)
      // =========================================================================
      const TAMANO_LOTE = 15; // Leeremos de 15 en 15

      for (let i = 0; i < enlacesAProcesar.length; i += TAMANO_LOTE) {
        const lote = enlacesAProcesar.slice(i, i + TAMANO_LOTE);
        console.log(`\n📦 --- Iniciando LOTE de ${lote.length} subvenciones ---`);

        // Abrimos un navegador limpio solo para este lote
        let batchBrowser = await puppeteer.launch({ headless: true, executablePath: chromiumPath, args: browserArgs });
        const subvencionesAInsertar = [];

        for (const conv of lote) {
          console.log(`   📄 Leyendo BDNS ${conv.currentCode}...`);
          let detallesExtraidos: any = null;

          try {
            const detailPage = await batchBrowser.newPage();
            const randomUserAgent = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
            await detailPage.setUserAgent(randomUserAgent);

            await detailPage.setRequestInterception(true);
            detailPage.on('request', (req: any) => {
              if (['image', 'stylesheet', 'font', 'media'].includes(req.resourceType())) req.abort().catch(()=>{}); 
              else req.continue().catch(()=>{});
            });

            await detailPage.goto(conv.urlDetalle, { waitUntil: "domcontentloaded", timeout: 45000 });
            await new Promise(resolve => setTimeout(resolve, 2000));

            detallesExtraidos = await detailPage.evaluate(() => {
              const res: Record<string, string> = {};
              const titulos = document.querySelectorAll('.titulo-campo');
              titulos.forEach(titulo => {
                let clave = (titulo.textContent || "").replace('·', '').trim().replace(/\s+/g, ' '); 
                if (!clave) return;
                const elementoValor = titulo.nextElementSibling as HTMLElement;
                if (elementoValor) {
                  let valor = elementoValor.innerText || elementoValor.textContent || "";
                  valor = valor.replace(/\n+/g, ' - ').replace(/\s+/g, ' ').trim();
                  if (valor.startsWith('- ')) valor = valor.substring(2);
                  if (valor.endsWith(' -')) valor = valor.substring(0, valor.length - 2);
                  res[clave] = valor;
                }
              });
              return res;
            });
            await detailPage.close().catch(()=>{});

            // Pausa humana entre clics dentro del lote
            await new Promise(r => setTimeout(r, Math.random() * 4000 + 4000));

          } catch (err: any) {
             console.error(`   ❌ Error al leer web: ${err.message}`);
          }

          if (detallesExtraidos && Object.keys(detallesExtraidos).length > 0) {
             const infoCompleta = { ...conv, codigoBDNS: conv.codigoLimpio, ...detallesExtraidos };

             try {
               console.log(`   🤖 [MODO PRUEBA] IA desactivada. Simulando rechazo...`);
               let iaAnalisisMasivo: any = { matches: [], evaluaciones: [] };
               let algunaEmpresaCuadra = false;

               /* === CÓDIGO IA (DESCOMENTAR CUANDO ESTÉ LISTO) ===
               let iaAnalisisMasivo = await checkGrantWithAI(infoCompleta, arrayEmpresasIA);
               iaAnalisisMasivo.matches = iaAnalisisMasivo.matches || iaAnalisisMasivo.evaluaciones || [];
               for (const match of iaAnalisisMasivo.matches) {
                 if (match.cuadra) { algunaEmpresaCuadra = true; console.log(`   ✅ CUADRA para: ${match.companyName}`); }
               }
               ============================================================= */

               if (algunaEmpresaCuadra) {
                 subvencionesAInsertar.push({
                   codigoBDNS: conv.codigoLimpio, titulo: conv.titulo, organoConvocante: conv.organoConvocante,
                   fechaRegistro: conv.currentDate, urlDetalle: conv.urlDetalle,
                   detallesExtraidos: detallesExtraidos, iaAnalisis: iaAnalisisMasivo
                 });
               }
             } catch (iaErr: any) {}

             if (conv.currentCode > highestCodeThisSession) {
                highestCodeThisSession = conv.currentCode;
                try {
                  await db.insert(scrapingState).values({ key: stateKey, value: highestCodeThisSession.toString() })
                    .onConflictDoUpdate({ target: scrapingState.key, set: { value: highestCodeThisSession.toString(), updatedAt: new Date() } });
                } catch(e) {}
             }
          }
        } // Fin del lote actual

        // Guardamos en BD lo que hayamos sacado en este lote
        if (subvencionesAInsertar.length > 0) {
          try {
            await db.insert(bdnsGrants).values(subvencionesAInsertar);
            console.log(`   💾 Guardadas ${subvencionesAInsertar.length} en Base de Datos.`);
          } catch (dbErr) {}
        }

        // Cerramos el navegador para liberar RAM
        await batchBrowser.close().catch(()=>{});

        // ☕ LA PAUSA DEL CAFÉ (Si quedan más lotes por procesar)
        if (i + TAMANO_LOTE < enlacesAProcesar.length) {
           console.log(`\n☕ Lote terminado. Tomando un descanso de 2 MINUTOS para que el firewall olvide nuestra IP...`);
           await new Promise(resolve => setTimeout(resolve, 120000)); 
        }
      } 
    } 

    console.log(`\n🎉 Scraping BDNS completado exitosamente.`);
    await db.insert(scrapingState).values({ key: "last_bdns_sync", value: new Date().toISOString() })
      .onConflictDoUpdate({ target: scrapingState.key, set: { value: new Date().toISOString(), updatedAt: new Date() }});

  } catch (error) {
    console.error("💀 Error CRÍTICO (Nivel Superior):", error);
  } finally {
    isBdnsScrapingRunning = false;
    console.log("🔓 Cerrojo liberado. Sistema listo para próxima ejecución.");
  }
}