import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { execSync } from "child_process";
import { db } from "../db"; 
import { bdnsGrants, scrapingState, companies } from "../../shared/schema";
import { eq } from "drizzle-orm";
import { checkGrantWithAI } from "./ai-evaluator";

puppeteer.use(StealthPlugin());

function parseBDNSDate(dateStr: string) {
  if (!dateStr || dateStr === "") return null;
  const [day, month, year] = dateStr.split('/');
  return new Date(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10));
}

function aniquilarZombis() {
  console.log("   🔨 [SISTEMA] Ejecutando limpieza de RAM y Disco...");
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
  let shouldKamikaze = false;

  console.log("🚀 Iniciando BDNS (KAMIKAZE + PROXIES ROTATIVOS ORDENADOS)...");

  aniquilarZombis();

  console.log("   [DEBUG] 1/5 - Preparando Proxy...");
  let currentProxyIndex = 1;
  try {
    const proxyStateRecord = await db.query.scrapingState.findFirst({ where: eq(scrapingState.key, "current_proxy_index") });
    if (proxyStateRecord) currentProxyIndex = parseInt(proxyStateRecord.value, 10);
  } catch (e) {
    console.error("   ❌ Error leyendo índice de proxy, usando 1 por defecto.");
  }

  let proxyString = process.env[`WEBSHARE_PROXIES_${currentProxyIndex}`];

  if (!proxyString) {
    currentProxyIndex = 1;
    proxyString = process.env[`WEBSHARE_PROXIES_${currentProxyIndex}`];
  }

  let currentProxy: any = null;
  if (proxyString) {
    const partes = proxyString.split(':').map(p => p.trim());
    if (partes.length >= 4) {
      currentProxy = { host: partes[0], port: partes[1], user: partes[2], pass: partes[3] };
      console.log(`🕵️‍♂️ Máscara Proxy activada [ÍNDICE ${currentProxyIndex}]: Usando IP ${currentProxy.host}:${currentProxy.port}`);
    } else {
      console.log(`⚠️ ATENCIÓN: El formato de WEBSHARE_PROXIES_${currentProxyIndex} es incorrecto.`);
    }
  } else {
    console.log(`⚠️ ATENCIÓN: No hay variables WEBSHARE_PROXIES_X. Navegando al descubierto.`);
  }

  // 🔥 AQUÍ ESTÁ EL CAMBIO A 2 DÍAS DE ANTIGÜEDAD 🔥
  const fechaLimite = new Date();
  fechaLimite.setDate(fechaLimite.getDate() - 2); // Restamos 2 días
  fechaLimite.setHours(0, 0, 0, 0); 
  console.log(`\n📅 Límite de antigüedad establecido a 2 días -> ${fechaLimite.toLocaleDateString('es-ES')}`);

  console.log("   [DEBUG] 2/5 - Comprobando base de datos de empresas...");
  let todasLasEmpresas = [];
  try {
    todasLasEmpresas = await db.select().from(companies);
  } catch (e) {
    console.error("   🛑 Error crítico conectando con PostgreSQL.");
    isBdnsScrapingRunning = false;
    return;
  }

  if (todasLasEmpresas.length === 0) {
    console.log("   🛑 [DEBUG] ERROR: No hay empresas registradas en la Base de Datos. El bot aborta.");
    isBdnsScrapingRunning = false;
    return;
  }
  console.log(`   [DEBUG] 3/5 - Encontradas ${todasLasEmpresas.length} empresas activas.`);

  console.log("   [DEBUG] 4/5 - Pre-cargando progreso desde la Base de Datos...");
  const stopCodeLimits: Record<string, number> = {};
  for (const modo of MODOS_BUSQUEDA) {
    const stateKey = `highest_bdns_code_${modo.id}`;
    try {
      const stateRecord = await db.query.scrapingState.findFirst({ where: eq(scrapingState.key, stateKey) });
      stopCodeLimits[modo.id] = stateRecord ? parseInt(stateRecord.value, 10) : 0;
    } catch (e) {
      console.error(`   ❌ Error leyendo estado BDNS de ${modo.id}. Asumiendo 0.`);
      stopCodeLimits[modo.id] = 0;
    }
  }

  let browser: any = null;
  let chromiumPath = "";
  try { chromiumPath = execSync("which chromium").toString().trim(); } 
  catch (e) { chromiumPath = "chromium"; }

  const browserArgs = [
    '--no-sandbox', 
    '--disable-setuid-sandbox', 
    '--disable-dev-shm-usage', 
    '--disable-gpu',
    '--js-flags="--max-old-space-size=256"'
  ];

  if (currentProxy) {
    browserArgs.push(`--proxy-server=http://${currentProxy.host}:${currentProxy.port}`);
  }

  const puppeteerOptions = {
    headless: true,
    executablePath: chromiumPath || '/nix/var/nix/profiles/default/bin/chromium',
    timeout: 120000, 
    protocolTimeout: 240000,
    args: browserArgs
  };

  try {
    console.log("   [DEBUG] 5/5 - Encendiendo el motor de Chromium con Puppeteer...");
    browser = await puppeteer.launch(puppeteerOptions as any);

    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log("   ✅ [DEBUG] Motor Chromium encendido correctamente. Entrando al bucle principal.");

    for (const modo of MODOS_BUSQUEDA) {
      if (shouldKamikaze) break; 

      console.log(`\n======================================================`);
      console.log(`🔎 BÚSQUEDA: ${modo.nombre}`);
      console.log(`======================================================\n`);

      let highestCodeThisSession = stopCodeLimits[modo.id];

      let tablePage = await browser.newPage();

      if (currentProxy && currentProxy.user && currentProxy.pass) {
        await tablePage.authenticate({ username: currentProxy.user, password: currentProxy.pass });
      }

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
        console.log(`❌ Error al cargar la página principal. Proxy muerto o WAF detectado.`);
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
            // 🔥 AQUÍ SE COMPRUEBA CONTRA EL NUEVO LÍMITE DE 2 DÍAS 🔥
            if (currentDate < fechaLimite) {
              keepScraping = false;
              break; 
            }
          }

          if (currentCode > highestCodeThisSession) {
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
      console.log(`✅ [FASE 1] Extraídos ${enlacesAProcesar.length} enlaces de los últimos 2 días.\n`);

      if (enlacesAProcesar.length === 0) continue;

      console.log(`🚀 [FASE 2] Iniciando extracción de detalles...`);

      const subvencionesAInsertar = [];

      for (let i = 0; i < enlacesAProcesar.length; i++) {

        const tiempoTranscurrido = Date.now() - GLOBAL_START_TIME;
        if (tiempoTranscurrido > 240000) {
           console.log(`\n⏰ ¡TIEMPO LÍMITE ALCANZADO! (4 minutos). Nos inmolamos.`);
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

          if (currentProxy && currentProxy.user && currentProxy.pass) {
            await detailPage.authenticate({ username: currentProxy.user, password: currentProxy.pass });
          }

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
           console.error(`   ❌ El proxy falló o el cortafuegos interceptó. Activando Kamikaze.`);
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
                const stateKey = `highest_bdns_code_${modo.id}`;
                await db.insert(scrapingState).values({ key: stateKey, value: highestCodeThisSession.toString() })
                  .onConflictDoUpdate({ target: scrapingState.key, set: { value: highestCodeThisSession.toString(), updatedAt: new Date() } });
             } catch(e) {
                console.error("   ⚠️ No se pudo guardar el progreso de este enlace en BD, pero seguimos.");
             }
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
    if (error.message.includes("WAF_BLOCK") || error.message.includes("Timeout") || error.message.includes("net::ERR")) {
       console.log("\n🛑 [SISTEMA] El Proxy fue bloqueado, timeout o red fallida. Nos inmolamos.");
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

       const nextProxyIndex = currentProxyIndex + 1;
       try {
         await db.insert(scrapingState).values({ key: "current_proxy_index", value: nextProxyIndex.toString() })
           .onConflictDoUpdate({ target: scrapingState.key, set: { value: nextProxyIndex.toString(), updatedAt: new Date() } });
       } catch(e) {
         console.error("No se pudo rotar el proxy en BD", e);
       }

       console.log(`🔄 El próximo arranque usará el proxy WEBSHARE_PROXIES_${nextProxyIndex}`);
       console.log("===============================================================");

       try {
         await db.insert(scrapingState).values({ key: "kamikaze_resume", value: "true" })
           .onConflictDoUpdate({ target: scrapingState.key, set: { value: "true", updatedAt: new Date() } });
       } catch (e) {}

       process.exit(1); 
    } else {
       try {
         await db.insert(scrapingState).values({ key: "kamikaze_resume", value: "false" })
           .onConflictDoUpdate({ target: scrapingState.key, set: { value: "false", updatedAt: new Date() } });
       } catch (e) {}

       console.log("🔓 Cerrojo liberado. Sistema en reposo.");
    }
  }
}