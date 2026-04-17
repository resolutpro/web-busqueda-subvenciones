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
  let shouldKamikaze = false;

  console.log("🚀 Iniciando BDNS (MODO BERSERKER: VELOCIDAD MÁXIMA + COLA DE ENLACES)...");

  aniquilarZombis();

  // =========================================================================
  // 1. CARGA DE PROXY ROTATIVO
  // =========================================================================
  let currentProxyIndex = 1;
  try {
    const proxyStateRecord = await db.query.scrapingState.findFirst({ where: eq(scrapingState.key, "current_proxy_index") });
    if (proxyStateRecord) currentProxyIndex = parseInt(proxyStateRecord.value, 10);
  } catch (e) {}

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
    }
  }

  // =========================================================================
  // 2. RECUPERAR COLA DE ENLACES PENDIENTES
  // =========================================================================
  let colaEnlaces: any[] = [];
  try {
    const colaRecord = await db.query.scrapingState.findFirst({ where: eq(scrapingState.key, "bdns_pending_queue") });
    if (colaRecord && colaRecord.value) {
      colaEnlaces = JSON.parse(colaRecord.value);
    }
  } catch (e) {
    console.log("   ⚠️ No se pudo leer la cola de enlaces previa. Se creará una nueva.");
  }

  // Límite de 2 días de antigüedad
  const fechaLimite = new Date();
  fechaLimite.setDate(fechaLimite.getDate() - 2);
  fechaLimite.setHours(0, 0, 0, 0); 

  const todasLasEmpresas = await db.select().from(companies);
  if (todasLasEmpresas.length === 0) {
    isBdnsScrapingRunning = false;
    return;
  }

  // Cargar límites de cada modo para no repetir
  const stopCodeLimits: Record<string, number> = {};
  for (const modo of MODOS_BUSQUEDA) {
    try {
      const stateKey = `highest_bdns_code_${modo.id}`;
      const stateRecord = await db.query.scrapingState.findFirst({ where: eq(scrapingState.key, stateKey) });
      stopCodeLimits[modo.id] = stateRecord ? parseInt(stateRecord.value, 10) : 0;
    } catch (e) { stopCodeLimits[modo.id] = 0; }
  }

  let browser: any = null;
  let chromiumPath = "";
  try { chromiumPath = execSync("which chromium").toString().trim(); } 
  catch (e) { chromiumPath = "chromium"; }

  const browserArgs = [
    '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--js-flags="--max-old-space-size=256"'
  ];
  if (currentProxy) browserArgs.push(`--proxy-server=http://${currentProxy.host}:${currentProxy.port}`);

  const puppeteerOptions = {
    headless: true, executablePath: chromiumPath || '/nix/var/nix/profiles/default/bin/chromium', timeout: 120000, protocolTimeout: 240000, args: browserArgs
  };

  try {
    browser = await puppeteer.launch(puppeteerOptions as any);
    await new Promise(resolve => setTimeout(resolve, 2000)); // Breve respiro para el procesador

    // =========================================================================
    // FASE 1: LLENAR LA COLA (Solo si está vacía)
    // =========================================================================
    if (colaEnlaces.length === 0) {
      console.log(`\n📭 La cola de enlaces está vacía. Iniciando FASE 1: Buscar nuevas subvenciones...`);

      let tablePage = await browser.newPage();
      if (currentProxy?.user) await tablePage.authenticate({ username: currentProxy.user, password: currentProxy.pass });
      await tablePage.setViewport({ width: 1280, height: 800 }); 
      await tablePage.setRequestInterception(true);
      tablePage.on('request', (req: any) => {
        if (['image', 'stylesheet', 'font', 'media'].includes(req.resourceType())) req.abort().catch(() => {}); else req.continue().catch(() => {});
      });

      try {
        await tablePage.goto("https://www.infosubvenciones.es/bdnstrans/GE/es/convocatorias", { waitUntil: "domcontentloaded", timeout: 60000 });
        await new Promise(resolve => setTimeout(resolve, 5000));
      } catch (e) {
        console.log(`❌ WAF o Proxy lento al cargar la tabla principal.`);
        throw new Error("WAF_BLOCK"); 
      }

      for (const modo of MODOS_BUSQUEDA) {
        if (shouldKamikaze) break;
        console.log(`\n🔎 Explorando: ${modo.nombre}`);

        try {
          await tablePage.evaluate(() => {
            const panelOrgano = Array.from(document.querySelectorAll('mat-expansion-panel-header')).find(h => h.textContent?.includes('Órgano convocante'));
            if (panelOrgano && !panelOrgano.classList.contains('mat-expanded')) (panelOrgano as HTMLElement).click();
          });
          await new Promise(resolve => setTimeout(resolve, 1000)); 

          await tablePage.evaluate((radioValue) => {
            const radioContainer = document.querySelector(`input[type="radio"][value="${radioValue}"]`)?.closest('mat-radio-button')?.querySelector('label');
            if (radioContainer) (radioContainer as HTMLElement).click();
          }, modo.id);
          await new Promise(resolve => setTimeout(resolve, 2000)); 

          if (modo.seleccionarEspecificos) {
            await tablePage.evaluate((elementosDeseados) => {
              document.querySelectorAll('mat-tree-node').forEach(nodo => {
                const labelElement = nodo.querySelector('.mat-checkbox-label');
                if (!labelElement) return;
                const texto = labelElement.textContent?.trim().toUpperCase() || "";
                const isChecked = nodo.querySelector('mat-checkbox')?.classList.contains('mat-checkbox-checked');
                let debeEstar = (elementosDeseados === 'ALL') || (Array.isArray(elementosDeseados) && elementosDeseados.includes(texto));
                if (isChecked !== debeEstar) (nodo.querySelector('label.mat-checkbox-layout') as HTMLElement)?.click();
              });
            }, modo.seleccionarEspecificos);
            await new Promise(resolve => setTimeout(resolve, 2000));
          }

          await tablePage.evaluate(() => {
            const btnFiltrar = Array.from(document.querySelectorAll('button')).find(btn => btn.textContent?.toLowerCase().includes('filtrar'));
            if (btnFiltrar) (btnFiltrar as HTMLElement).click();
          });
          await new Promise(resolve => setTimeout(resolve, 6000)); // Carga de la tabla

          let keepScraping = true;
          let pageCounter = 1;

          while (keepScraping) {
            const convocatoriasPagina = await tablePage.evaluate(() => {
              return Array.from(document.querySelectorAll('table tbody tr')).map(fila => {
                const columnas = fila.querySelectorAll('td');
                if (columnas.length < 3 || columnas[0].innerText.includes("Cargando")) return null; 
                return {
                  codigoBDNS: columnas[0].innerText.trim(),
                  fechaRegistro: columnas[4].innerText.trim(),
                  titulo: columnas[5].innerText.trim(),
                  organoConvocante: columnas[3].innerText.trim(),
                  urlDetalle: columnas[5].querySelector('a')?.href || null
                };
              }).filter(item => item !== null);
            });

            if (convocatoriasPagina.length === 0) break;

            for (const conv of convocatoriasPagina) {
              if (!conv || !conv.urlDetalle) continue;

              const codigoLimpio = conv.codigoBDNS.replace(/\D/g, '');
              const currentCode = parseInt(codigoLimpio, 10);
              const currentDate = parseBDNSDate(conv.fechaRegistro);

              if (isNaN(currentCode)) continue;
              if (currentDate && currentDate < fechaLimite) { keepScraping = false; break; }

              if (currentCode > stopCodeLimits[modo.id]) {
                 // GUARDAMOS EN LA COLA AÑADIENDO EL MODO PARA LUEGO ACTUALIZAR SU LÍMITE
                 colaEnlaces.push({ ...conv, currentCode, codigoLimpio, fechaIso: currentDate?.toISOString(), modoId: modo.id });
              }
            }

            if (!keepScraping) break;

            const estaDeshabilitado = await tablePage.$('button.mat-paginator-navigation-next[disabled], button.mat-paginator-navigation-next.mat-button-disabled');
            if (!estaDeshabilitado) {
              await tablePage.evaluate(() => (document.querySelector('button.mat-paginator-navigation-next') as HTMLElement)?.click());
              await new Promise(resolve => setTimeout(resolve, 3000));
              pageCounter++;
            } else { keepScraping = false; }
          }
        } catch (err) {
           console.log(`   ❌ Bloqueo detectado navegando la tabla de ${modo.nombre}. Guardamos lo que llevamos y abortamos.`);
           shouldKamikaze = true;
           break;
        }
      }

      await tablePage.close().catch(()=>{});

      // Ordenamos la cola del más antiguo al más nuevo
      colaEnlaces.reverse();

      // Guardamos la cola en la base de datos por si morimos en la Fase 2
      await db.insert(scrapingState).values({ key: "bdns_pending_queue", value: JSON.stringify(colaEnlaces) })
        .onConflictDoUpdate({ target: scrapingState.key, set: { value: JSON.stringify(colaEnlaces), updatedAt: new Date() } });

      console.log(`✅ [FASE 1 COMPLETADA] Guardados ${colaEnlaces.length} enlaces nuevos en la cola de la BD.\n`);
    } else {
      console.log(`\n📬 [FASE 1 OMITIDA] Hay ${colaEnlaces.length} enlaces en la cola pendientes de procesar.\n`);
    }

    // =========================================================================
    // FASE 2: PROCESAR LA COLA A MÁXIMA VELOCIDAD (CERO PAUSAS HUMANAS)
    // =========================================================================
    if (colaEnlaces.length > 0 && !shouldKamikaze) {
      console.log(`🚀 [FASE 2] Iniciando procesamiento a MÁXIMA VELOCIDAD...`);

      const subvencionesAInsertar = [];
      let procesadosExitosamente = 0;

      for (let i = 0; i < colaEnlaces.length; i++) {
        const conv = colaEnlaces[i];
        console.log(`[${i+1}/${colaEnlaces.length}] Extrayendo BDNS ${conv.currentCode}...`);

        let detallesExtraidos: any = null;
        let context: any = null;
        let detailPage: any = null;

        try {
          context = await browser.createBrowserContext();
          detailPage = await context.newPage();

          if (currentProxy?.user) await detailPage.authenticate({ username: currentProxy.user, password: currentProxy.pass });
          await detailPage.setRequestInterception(true);
          detailPage.on('request', (req: any) => {
            if (['image', 'stylesheet', 'font', 'media'].includes(req.resourceType())) req.abort().catch(() => {}); else req.continue().catch(() => {});
          });

          // TIMEOUT REDUCIDO: Si en 25s no carga, el proxy no vale, kamikaze.
          await detailPage.goto(conv.urlDetalle, { waitUntil: "domcontentloaded", timeout: 25000 });
          await detailPage.waitForSelector('.titulo-campo', { timeout: 15000 });

          detallesExtraidos = await detailPage.evaluate(() => {
            const res: Record<string, string> = {};
            document.querySelectorAll('.titulo-campo').forEach(titulo => {
              let clave = (titulo.textContent || "").replace('·', '').trim().replace(/\s+/g, ' '); 
              if (!clave) return;
              const elementoValor = titulo.nextElementSibling as HTMLElement;
              if (elementoValor) {
                let valor = elementoValor.innerText || elementoValor.textContent || "";
                res[clave] = valor.replace(/\n+/g, ' - ').replace(/\s+/g, ' ').replace(/^- | -$/g, '').trim();
              }
            });
            return res;
          });

        } catch (err: any) {
           console.error(`   ❌ WAF o Proxy caído. Interrumpiendo ataque.`);
           shouldKamikaze = true;
           break; // Rompemos el bucle de Fase 2
        } finally {
          if (detailPage) await detailPage.close().catch(()=>{});
          if (context) await context.close().catch(()=>{});
        }

        // Si llegamos aquí, la extracción fue un éxito
        procesadosExitosamente++;

        const infoCompleta = { ...conv, codigoBDNS: conv.codigoLimpio, currentDate: new Date(conv.fechaIso), ...detallesExtraidos };

        try {
          console.log(`   🤖 [MODO PRUEBA] IA desactivada. Simulando rechazo...`);
          let algunaEmpresaCuadra = false;
          let iaAnalisisMasivo: any = { matches: [], evaluaciones: [] };

          if (algunaEmpresaCuadra) {
            subvencionesAInsertar.push({
              codigoBDNS: conv.codigoLimpio, titulo: conv.titulo, organoConvocante: conv.organoConvocante,
              fechaRegistro: infoCompleta.currentDate, urlDetalle: conv.urlDetalle, detallesExtraidos, iaAnalisis: iaAnalisisMasivo
            });
          }
        } catch (e) {}

        // Actualizamos el ID máximo de ese modo de búsqueda para no repetirlo nunca más
        if (conv.currentCode > stopCodeLimits[conv.modoId]) {
          stopCodeLimits[conv.modoId] = conv.currentCode;
          try {
             await db.insert(scrapingState).values({ key: `highest_bdns_code_${conv.modoId}`, value: conv.currentCode.toString() })
               .onConflictDoUpdate({ target: scrapingState.key, set: { value: conv.currentCode.toString(), updatedAt: new Date() } });
          } catch(e) {}
        }
      } // Fin Bucle Cola

      // =========================================================================
      // 3. GUARDADO FINAL Y LIMPIEZA DE COLA
      // =========================================================================
      if (subvencionesAInsertar.length > 0) {
        console.log(`\n💾 Insertando ${subvencionesAInsertar.length} subvenciones maestras en BD...`);
        try { await db.insert(bdnsGrants).values(subvencionesAInsertar); } catch (e) {}
      }

      // Borramos de la cola los elementos que SÍ hemos procesado con éxito
      const colaRestante = colaEnlaces.slice(procesadosExitosamente);
      await db.insert(scrapingState).values({ key: "bdns_pending_queue", value: JSON.stringify(colaRestante) })
        .onConflictDoUpdate({ target: scrapingState.key, set: { value: JSON.stringify(colaRestante), updatedAt: new Date() } });

      console.log(`🗑️ Cola actualizada: Quedan ${colaRestante.length} pendientes en BD.`);
    }

    if (!shouldKamikaze) {
      console.log(`\n🎉 BERSERKER COMPLETADO. No quedan enlaces pendientes.`);
      await db.insert(scrapingState).values({ key: "last_bdns_sync", value: new Date().toISOString() })
        .onConflictDoUpdate({ target: scrapingState.key, set: { value: new Date().toISOString(), updatedAt: new Date() }});
    }

  } catch (error: any) {
    if (error.message === "WAF_BLOCK") {
       console.log("\n🛑 [SISTEMA] Nos inmolamos para forzar un reinicio de Proxy y Servidor.");
       shouldKamikaze = true;
    } else {
       console.error("💀 Error CRÍTICO:", error);
    }
  } finally {
    isBdnsScrapingRunning = false;

    if (browser) await browser.close().catch(() => {});

    if (shouldKamikaze) {
       console.log("===============================================================");
       console.log("💥 KAMIKAZE INICIADO: CAMBIANDO DE PROXY Y REINICIANDO 💥");

       const nextProxyIndex = currentProxyIndex + 1;
       try {
         await db.insert(scrapingState).values({ key: "current_proxy_index", value: nextProxyIndex.toString() })
           .onConflictDoUpdate({ target: scrapingState.key, set: { value: nextProxyIndex.toString(), updatedAt: new Date() } });
       } catch(e) {}

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