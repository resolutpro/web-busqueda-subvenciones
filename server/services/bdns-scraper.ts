import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { execSync } from "child_process";
import { db } from "../db"; 
import { bdnsGrants, scrapingState, companies } from "../../shared/schema";
import { eq } from "drizzle-orm";
import { checkGrantWithAI } from "./ai-evaluator";

// Aplicamos el camuflaje
puppeteer.use(StealthPlugin());

function parseBDNSDate(dateStr: string) {
  if (!dateStr || dateStr === "") return null;
  const [day, month, year] = dateStr.split('/');
  return new Date(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10));
}

// Limpieza básica de procesos en caso de que queden zombis al arrancar
function aniquilarZombis() {
  console.log("   🔨 [SISTEMA] Ejecutando limpieza inicial de RAM...");
  try { execSync("pkill -9 -f chromium"); } catch (e) {}
  try { execSync("pkill -9 -f chrome"); } catch (e) {}
  try { execSync("rm -rf /tmp/puppeteer*"); } catch (e) {}
}

const MODOS_BUSQUEDA = [
  { id: 'C', nombre: 'Administración del Estado', seleccionarEspecificos: 'ALL' },
  { id: 'A', nombre: 'Comunidades autónomas', seleccionarEspecificos: [ 'ANDALUCÍA', 'ARAGÓN', 'CASTILLA Y LEÓN', 'COMUNITAT VALENCIANA', 'EXTREMADURA', 'GALICIA' ] },
  { id: 'L', nombre: 'Entidades locales', seleccionarEspecificos: [ 'ALMERÍA', 'CÁDIZ', 'CÓRDOBA', 'GRANADA', 'HUELVA', 'JAÉN', 'MÁLAGA', 'SEVILLA', 'HUESCA', 'TERUEL', 'ZARAGOZA', 'ÁVILA', 'BURGOS', 'LEÓN', 'PALENCIA', 'SALAMANCA', 'SEGOVIA', 'SORIA', 'VALLADOLID', 'ZAMORA', 'ALACANT / ALICANTE', 'CASTELLÓ / CASTELLÓN', 'VALÈNCIA / VALENCIA', 'BADAJOZ', 'CÁCERES', 'A CORUÑA', 'LUGO', 'OURENSE', 'PONTEVEDRA' ] },
  { id: 'O', nombre: 'Otros órganos', seleccionarEspecificos: 'ALL' }
];

let isBdnsScrapingRunning = false;

export async function scrapeBDNS() {
  if (isBdnsScrapingRunning) {
    console.log("⚠️ [BDNS] Intento bloqueado: Ya hay un proceso ejecutándose.");
    return;
  }

  isBdnsScrapingRunning = true;
  const GLOBAL_START_TIME = Date.now();
  let shouldKamikaze = false; // <--- LA NUEVA BANDERA DEL REINICIO

  console.log("🚀 Iniciando BDNS (ESTRATEGIA KAMIKAZE: REINICIO DE SERVIDOR AL DETECTAR BLOQUEO)...");

  aniquilarZombis();

  const oneMonthAgo = new Date();
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
  oneMonthAgo.setHours(0, 0, 0, 0); 

  const todasLasEmpresas = await db.select().from(companies);
  if (todasLasEmpresas.length === 0) {
    isBdnsScrapingRunning = false;
    return;
  }

  let browser: any = null;
  let chromiumPath = "";
  try { chromiumPath = execSync("which chromium").toString().trim(); } 
  catch (e) { chromiumPath = "chromium"; }

  const puppeteerOptions = {
    headless: true,
    executablePath: chromiumPath || '/nix/var/nix/profiles/default/bin/chromium',
    timeout: 120000, 
    protocolTimeout: 240000,
    args: [
      '--no-sandbox', 
      '--disable-setuid-sandbox', 
      '--disable-dev-shm-usage', 
      '--disable-gpu',
      '--js-flags="--max-old-space-size=256"'
    ]
  };

  try {
    browser = await puppeteer.launch(puppeteerOptions as any);

    for (const modo of MODOS_BUSQUEDA) {
      if (shouldKamikaze) break; 

      console.log(`\n======================================================`);
      console.log(`🔎 BÚSQUEDA: ${modo.nombre}`);
      console.log(`======================================================\n`);

      const stateKey = `highest_bdns_code_${modo.id}`;
      const stateRecord = await db.query.scrapingState.findFirst({ where: eq(scrapingState.key, stateKey) });
      const stopCodeLimit = stateRecord ? parseInt(stateRecord.value, 10) : 0;
      let highestCodeThisSession = stopCodeLimit;

      let tablePage = await browser.newPage();
      await tablePage.setViewport({ width: 1280, height: 800 }); 

      await tablePage.setRequestInterception(true);
      tablePage.on('request', (req: any) => {
        if (['image', 'stylesheet', 'font', 'media'].includes(req.resourceType())) {
          req.abort().catch(() => {}); 
        } else {
          req.continue().catch(() => {});
        }
      });

      try {
        await tablePage.goto("https://www.infosubvenciones.es/bdnstrans/GE/es/convocatorias", { waitUntil: "domcontentloaded", timeout: 60000 });
        await new Promise(resolve => setTimeout(resolve, 5000));
      } catch (navError) {
        console.log(`❌ Error al cargar la página principal. WAF detectado al instante.`);
        throw new Error("WAF_BLOCK"); 
      }

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
        await tablePage.close().catch(()=>{});
        continue; 
      }

      let keepScraping = true;
      let pageCounter = 1;
      const enlacesAProcesar = [];

      while (keepScraping) {
        console.log(`   📄 Leyendo tabla página ${pageCounter}...`);

        const convocatoriasPagina = await tablePage.evaluate(() => {
          const filas = Array.from(document.querySelectorAll('table tbody tr'));
          return filas.map(fila => {
            const columnas = fila.querySelectorAll('td');
            if (columnas.length < 3 || columnas[0].innerText.includes("Cargando")) return null; 
            const celdaCodigo = columnas[0];
            const celdaFechaRegistro = columnas[4]; 
            const celdaTitulo = columnas[5];
            const etiquetaEnlace = celdaTitulo.querySelector('a');

            return {
              codigoBDNS: celdaCodigo.innerText.trim(),
              fechaRegistro: celdaFechaRegistro.innerText.trim(),
              titulo: celdaTitulo.innerText.trim(),
              organoConvocante: columnas[3].innerText.trim(),
              urlDetalle: etiquetaEnlace ? etiquetaEnlace.href : null
            };
          }).filter(item => item !== null);
        });

        if (convocatoriasPagina.length === 0) {
          keepScraping = false; break;
        }

        for (const convocatoria of convocatoriasPagina) {
          if (!convocatoria || !convocatoria.urlDetalle) continue;

          const codigoLimpio = convocatoria.codigoBDNS.replace(/\D/g, '');
          const currentCode = parseInt(codigoLimpio, 10);
          const currentDate = parseBDNSDate(convocatoria.fechaRegistro);

          if (isNaN(currentCode)) continue;

          if (currentDate) {
            if (currentDate < oneMonthAgo) {
              keepScraping = false;
              break; 
            }
          }

          if (currentCode > stopCodeLimit) {
             enlacesAProcesar.push({ ...convocatoria, currentCode, codigoLimpio, currentDate });
          }
        }

        if (!keepScraping) break;

        if (keepScraping) {
          const SELECTOR_BOTON_SIGUIENTE = 'button.mat-paginator-navigation-next'; 
          try {
            const estaDeshabilitado = await tablePage.$('button.mat-paginator-navigation-next[disabled], button.mat-paginator-navigation-next.mat-button-disabled');
            if (!estaDeshabilitado) {
              await tablePage.evaluate((sel) => { (document.querySelector(sel) as HTMLElement)?.click(); }, SELECTOR_BOTON_SIGUIENTE);
              await new Promise(resolve => setTimeout(resolve, 3000));
              pageCounter++;
            } else {
              keepScraping = false; 
            }
          } catch (err) { keepScraping = false; }
        }
      } 

      await tablePage.close().catch(()=>{});

      enlacesAProcesar.reverse(); 
      console.log(`✅ [FASE 1] Extraídos ${enlacesAProcesar.length} enlaces.\n`);

      if (enlacesAProcesar.length === 0) continue;

      console.log(`🚀 [FASE 2] Iniciando extracción de detalles...`);

      const subvencionesAInsertar = [];

      for (let i = 0; i < enlacesAProcesar.length; i++) {

        const tiempoTranscurrido = Date.now() - GLOBAL_START_TIME;
        if (tiempoTranscurrido > 240000) {
           console.log(`\n⏰ ¡LÍMITE DE 4 MINUTOS! Activando protocolo Kamikaze.`);
           shouldKamikaze = true; 
           break; 
        }

        const conv = enlacesAProcesar[i];
        console.log(`[${i+1}/${enlacesAProcesar.length}] Leyendo detalle BDNS ${conv.currentCode}...`);

        const pausaHumana = Math.floor(Math.random() * 30000) + 20000;
        await new Promise(resolve => setTimeout(resolve, pausaHumana));

        let detallesExtraidos: any = null;
        let extraccionExitosa = false;
        let context: any = null;
        let detailPage: any = null;

        try {
          context = await browser.createBrowserContext();
          detailPage = await context.newPage();

          await detailPage.setRequestInterception(true);
          detailPage.on('request', (req: any) => {
            if (['image', 'stylesheet', 'font', 'media'].includes(req.resourceType())) {
              req.abort().catch(() => {}); 
            } else {
              req.continue().catch(() => {});
            }
          });

          await detailPage.goto(conv.urlDetalle, { waitUntil: "domcontentloaded", timeout: 45000 });
          await detailPage.waitForSelector('.titulo-campo', { timeout: 30000 });

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

          extraccionExitosa = true; 
          await new Promise(r => setTimeout(r, Math.random() * 2000 + 2000));

        } catch (err: any) {
           console.error(`   ❌ Cortafuegos interceptó (Timeout). Activando Kamikaze.`);
           throw new Error("WAF_BLOCK");
        } finally {
          if (detailPage && !detailPage.isClosed()) await detailPage.close().catch(()=>{});
          if (context) await context.close().catch(()=>{});
        }

        if (extraccionExitosa && detallesExtraidos) {
           const infoCompleta = { ...conv, codigoBDNS: conv.codigoLimpio, ...detallesExtraidos };

           try {
             console.log(`   🤖 [MODO PRUEBA] IA desactivada. Simulando rechazo...`);
             let algunaEmpresaCuadra = false;
             let iaAnalisisMasivo: any = { matches: [], evaluaciones: [] };

             /* === DESCOMENTAR PARA ACTIVAR IA REAL ===
             let iaAnalisisMasivo = await checkGrantWithAI(infoCompleta, arrayEmpresasIA);
             const matchesArray = iaAnalisisMasivo.matches || iaAnalisisMasivo.evaluaciones || [];
             iaAnalisisMasivo.matches = matchesArray;
             for (const match of matchesArray) {
               if (match.cuadra) {
                 algunaEmpresaCuadra = true;
                 console.log(`   ✅ CUADRA para: ${match.companyName || match.companyId}`);
               }
             }
             ============================================================= */

             if (algunaEmpresaCuadra) {
               subvencionesAInsertar.push({
                 codigoBDNS: conv.codigoLimpio, 
                 titulo: conv.titulo,
                 organoConvocante: conv.organoConvocante,
                 fechaRegistro: conv.currentDate,
                 urlDetalle: conv.urlDetalle,
                 detallesExtraidos: detallesExtraidos, 
                 iaAnalisis: iaAnalisisMasivo
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
      } 

      if (subvencionesAInsertar.length > 0) {
        try {
          await db.insert(bdnsGrants).values(subvencionesAInsertar);
        } catch (dbErr) {}
      }
    } 

    if (!shouldKamikaze) {
      console.log(`\n🎉 Scraping BDNS completado al 100%.`);
      await db.insert(scrapingState).values({ key: "last_bdns_sync", value: new Date().toISOString() })
        .onConflictDoUpdate({ target: scrapingState.key, set: { value: new Date().toISOString(), updatedAt: new Date() }});
    }

  } catch (error: any) {
    if (error.message.includes("WAF_BLOCK") || error.message.includes("Timeout")) {
       console.log("\n🛑 [SISTEMA] Cortafuegos detectado. Nos inmolamos para conseguir una nueva IP.");
       shouldKamikaze = true;
    } else {
       console.error("💀 Error CRÍTICO:", error);
    }
  } finally {
    isBdnsScrapingRunning = false;

    if (browser) await browser.close().catch(() => {});

    if (shouldKamikaze) {
       console.log("===============================================================");
       console.log("💥 ESTRATEGIA KAMIKAZE INICIADA 💥");
       console.log("===============================================================");

       // 👇 1. DEJAMOS LA NOTA EN LA BASE DE DATOS ANTES DE MORIR 👇
       await db.insert(scrapingState).values({ key: "kamikaze_resume", value: "true" })
         .onConflictDoUpdate({ target: scrapingState.key, set: { value: "true", updatedAt: new Date() } });

       process.exit(1); 
    } else {
       // 👇 2. SI HA TERMINADO BIEN, BORRAMOS LA NOTA 👇
       await db.insert(scrapingState).values({ key: "kamikaze_resume", value: "false" })
         .onConflictDoUpdate({ target: scrapingState.key, set: { value: "false", updatedAt: new Date() } });

       console.log("🔓 Cerrojo liberado. Sistema en reposo.");
    }
  }
}