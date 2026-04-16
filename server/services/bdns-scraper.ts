import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { execSync } from "child_process";
import { db } from "../db"; 
import { bdnsGrants, scrapingState, companies } from "../../shared/schema";
import { eq } from "drizzle-orm";
import { checkGrantWithAI } from "./ai-evaluator";

// Aplicamos el camuflaje para que no detecten a Puppeteer
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

let isBdnsScrapingRunning = false;

export async function scrapeBDNS() {
  if (isBdnsScrapingRunning) {
    console.log("⚠️ [BDNS] Intento bloqueado: Ya hay un proceso ejecutándose.");
    return;
  }

  isBdnsScrapingRunning = true;
  console.log("🚀 Iniciando scraping BDNS (TÉCNICA AVANZADA: FETCH INTERNO + PARÁSITO)...");

  console.log("🧹 Limpiando RAM del servidor...");
  try { execSync("pkill -f chromium"); } catch (e) {}
  try { execSync("pkill -f chrome"); } catch (e) {}

  const oneMonthAgo = new Date();
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

  const todasLasEmpresas = await db.select().from(companies);
  if (todasLasEmpresas.length === 0) {
    console.log("\n⚠️ [BDNS] No hay empresas registradas. Deteniendo scraper.\n");
    isBdnsScrapingRunning = false;
    return;
  }

  const arrayEmpresasIA = todasLasEmpresas.map(e => ({
    id: e.id, name: e.name, description: `Tamaño: ${e.size || 'No definido'}. Actividad: ${e.description}`
  }));

  let browser: any = null;

  try {
    let chromiumPath = "";
    try { chromiumPath = execSync("which chromium").toString().trim(); } 
    catch (e) { chromiumPath = "chromium"; }

    // Usamos 1 SOLO navegador. Consumo de RAM plano y estable.
    browser = await puppeteer.launch({
      headless: true,
      executablePath: chromiumPath || '/nix/var/nix/profiles/default/bin/chromium',
      args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox', 
        '--disable-dev-shm-usage', 
        '--disable-gpu',
        '--js-flags="--max-old-space-size=256"'
      ]
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 }); 

    for (const modo of MODOS_BUSQUEDA) {
      console.log(`\n======================================================`);
      console.log(`🔎 BÚSQUEDA: ${modo.nombre}`);
      console.log(`======================================================\n`);

      const stateKey = `highest_bdns_code_${modo.id}`;
      const stateRecord = await db.query.scrapingState.findFirst({ where: eq(scrapingState.key, stateKey) });
      const stopCodeLimit = stateRecord ? parseInt(stateRecord.value, 10) : 0;
      let highestCodeThisSession = stopCodeLimit;

      console.log(`📍 Último código procesado: ${stopCodeLimit}`);

      await page.goto("https://www.infosubvenciones.es/bdnstrans/GE/es/convocatorias", { waitUntil: "networkidle2", timeout: 60000 });
      await new Promise(resolve => setTimeout(resolve, 5000));

      // Configuración de filtros (se mantiene igual)
      try {
        await page.evaluate(() => {
          const headers = Array.from(document.querySelectorAll('mat-expansion-panel-header'));
          const panelOrgano = headers.find(h => h.textContent?.includes('Órgano convocante'));
          if (panelOrgano && !panelOrgano.classList.contains('mat-expanded')) (panelOrgano as HTMLElement).click();
        });
        await new Promise(resolve => setTimeout(resolve, 1500)); 

        await page.evaluate((radioValue) => {
          const radioInput = document.querySelector(`input[type="radio"][value="${radioValue}"]`);
          if (radioInput) {
            const radioContainer = radioInput.closest('mat-radio-button')?.querySelector('label');
            if (radioContainer) (radioContainer as HTMLElement).click();
          }
        }, modo.id);
        await new Promise(resolve => setTimeout(resolve, 3000)); 

        if (modo.seleccionarEspecificos) {
          await page.evaluate((elementosDeseados) => {
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

        await page.evaluate(() => {
          const botones = Array.from(document.querySelectorAll('button'));
          const btnFiltrar = botones.find(btn => btn.textContent?.toLowerCase().includes('filtrar'));
          if (btnFiltrar) (btnFiltrar as HTMLElement).click();
        });
        await new Promise(resolve => setTimeout(resolve, 8000));

      } catch (err) {
        console.error(`❌ Error en filtros. Saltando sección.`);
        continue; 
      }

      let keepScraping = true;
      let pageCounter = 1;

      // =========================================================================
      // BUCLE PRINCIPAL: LECTURA Y EXTRACCIÓN IN-PAGE (Sin navegaciones)
      // =========================================================================
      while (keepScraping) {
        console.log(`\n📄 Leyendo tabla página ${pageCounter}...`);

        const convocatoriasPagina = await page.evaluate(() => {
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

        const subvencionesAInsertar = [];
        let updatedHighestCode = highestCodeThisSession;

        // Procesamos la página actual
        for (let i = 0; i < convocatoriasPagina.length; i++) {
          const convocatoria = convocatoriasPagina[i];
          if (!convocatoria || !convocatoria.urlDetalle) continue;

          const codigoLimpio = convocatoria.codigoBDNS.replace(/\D/g, '');
          const currentCode = parseInt(codigoLimpio, 10);
          const currentDate = parseBDNSDate(convocatoria.fechaRegistro);

          if (isNaN(currentCode)) continue;

          // Freno temporal
          if (currentDate && currentDate < oneMonthAgo) {
            console.log(`   🛑 Fecha antigua alcanzada. Finalizando paginación.`);
            keepScraping = false;
            break; 
          }

          if (currentCode <= stopCodeLimit) continue; 

          console.log(`[${i+1}/${convocatoriasPagina.length}] Extrayendo detalle BDNS ${currentCode}...`);

          // Pausa humana muy ligera, como usamos peticiones de fondo el WAF es más permisivo
          await new Promise(r => setTimeout(r, Math.random() * 3000 + 4000));

          let detallesExtraidos: any = null;
          let intentos = 0;

          // 🚀 MAGIA PURA: Inyectamos código en la tabla para que ELLA MISMA robe los datos
          while (!detallesExtraidos && intentos < 3) {
            intentos++;
            try {
              if (intentos > 1) {
                console.log(`   🚨 Reintento ${intentos}/3. Durmiendo 45s por precaución...`);
                await new Promise(r => setTimeout(r, 45000));
              }

              detallesExtraidos = await page.evaluate(async (url) => {
                // TÉCNICA 1: Fetch Nativo (100x más rápido, invisible para alarmas de navegación)
                try {
                  const res = await fetch(url);
                  const html = await res.text();
                  const parser = new DOMParser();
                  const doc = parser.parseFromString(html, 'text/html');
                  const titulos = doc.querySelectorAll('.titulo-campo');

                  if (titulos.length > 0) {
                    const datos: Record<string, string> = {};
                    titulos.forEach(titulo => {
                      let clave = (titulo.textContent || "").replace('·', '').trim().replace(/\s+/g, ' '); 
                      if (!clave) return;
                      const elementoValor = titulo.nextElementSibling as HTMLElement;
                      if (elementoValor) {
                        let valor = elementoValor.innerText || elementoValor.textContent || "";
                        valor = valor.replace(/\n+/g, ' - ').replace(/\s+/g, ' ').trim();
                        if (valor.startsWith('- ')) valor = valor.substring(2);
                        if (valor.endsWith(' -')) valor = valor.substring(0, valor.length - 2);
                        datos[clave] = valor;
                      }
                    });
                    return datos;
                  }
                } catch(e) {}

                // TÉCNICA 2 (Fallback): Iframe Parásito. Si el fetch falla, inyectamos un Iframe oculto.
                return new Promise((resolve) => {
                  const iframe = document.createElement('iframe');
                  iframe.style.display = 'none';
                  iframe.src = url;

                  const timer = setTimeout(() => {
                    iframe.remove();
                    resolve(null);
                  }, 25000);

                  let checkInterval: any;
                  iframe.onload = () => {
                    let attempts = 0;
                    checkInterval = setInterval(() => {
                      attempts++;
                      try {
                        const doc = iframe.contentDocument || iframe.contentWindow?.document;
                        if (doc && doc.querySelectorAll('.titulo-campo').length > 0) {
                          clearInterval(checkInterval);
                          clearTimeout(timer);
                          const datos: Record<string, string> = {};
                          const titulos = doc.querySelectorAll('.titulo-campo');
                          titulos.forEach(titulo => {
                            let clave = (titulo.textContent || "").replace('·', '').trim().replace(/\s+/g, ' '); 
                            if (!clave) return;
                            const elementoValor = titulo.nextElementSibling as HTMLElement;
                            if (elementoValor) {
                              let valor = elementoValor.innerText || elementoValor.textContent || "";
                              valor = valor.replace(/\n+/g, ' - ').replace(/\s+/g, ' ').trim();
                              if (valor.startsWith('- ')) valor = valor.substring(2);
                              if (valor.endsWith(' -')) valor = valor.substring(0, valor.length - 2);
                              datos[clave] = valor;
                            }
                          });
                          iframe.remove();
                          resolve(datos);
                        }
                      } catch(e) {}

                      if (attempts > 30) { // 15 segundos límite
                        clearInterval(checkInterval);
                        clearTimeout(timer);
                        iframe.remove();
                        resolve(null);
                      }
                    }, 500);
                  };
                  document.body.appendChild(iframe);
                });
              }, convocatoria.urlDetalle);

            } catch (err: any) {
               console.error(`   ❌ Error web interno: ${err.message}`);
            }
          }

          // Procesamiento (Mock o IA Real)
          if (detallesExtraidos) {
             const infoCompleta = { ...convocatoria, codigoBDNS: codigoLimpio, ...detallesExtraidos };

             try {
               console.log(`   🤖 [MODO PRUEBA] IA desactivada. Simulando rechazo automático...`);
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
                   codigoBDNS: codigoLimpio, 
                   titulo: convocatoria.titulo,
                   organoConvocante: convocatoria.organoConvocante,
                   fechaRegistro: currentDate,
                   urlDetalle: convocatoria.urlDetalle,
                   detallesExtraidos: detallesExtraidos, 
                   iaAnalisis: iaAnalisisMasivo
                 });
                 console.log(`   ⏳ Añadida a cola.`);
               }
             } catch (iaErr: any) {}

             if (currentCode > updatedHighestCode) {
               updatedHighestCode = currentCode;
               try {
                  await db.insert(scrapingState).values({ key: stateKey, value: updatedHighestCode.toString() })
                    .onConflictDoUpdate({ target: scrapingState.key, set: { value: updatedHighestCode.toString(), updatedAt: new Date() } });
               } catch(e) {}
             }
          } else {
             console.log(`   ⏭️ Saltado tras fallar extracción invisible.`);
          }
        } // Fin de lectura de filas en la página actual

        // GUARDADO EN BD AL FINAL DE CADA PÁGINA
        if (subvencionesAInsertar.length > 0) {
          try {
            console.log(`\n💾 Insertando ${subvencionesAInsertar.length} subvenciones en BD...`);
            await db.insert(bdnsGrants).values(subvencionesAInsertar);
          } catch (dbErr) {}
        }

        if (updatedHighestCode > highestCodeThisSession) {
          highestCodeThisSession = updatedHighestCode;
        }

        // AVANZAR DE PÁGINA
        if (keepScraping) {
          const SELECTOR_BOTON_SIGUIENTE = 'button.mat-paginator-navigation-next'; 
          try {
            const estaDeshabilitado = await page.$('button.mat-paginator-navigation-next[disabled], button.mat-paginator-navigation-next.mat-button-disabled');
            if (!estaDeshabilitado) {
              await page.evaluate((sel) => { (document.querySelector(sel) as HTMLElement)?.click(); }, SELECTOR_BOTON_SIGUIENTE);
              await new Promise(resolve => setTimeout(resolve, 6000));
              pageCounter++;
            } else {
              keepScraping = false; 
            }
          } catch (err) { keepScraping = false; }
        }
      } 
    } 

    console.log(`\n🎉 Scraping BDNS completado.`);
    await db.insert(scrapingState).values({ key: "last_bdns_sync", value: new Date().toISOString() })
      .onConflictDoUpdate({ target: scrapingState.key, set: { value: new Date().toISOString(), updatedAt: new Date() }});

  } catch (error) {
    console.error("💀 Error CRÍTICO (Nivel Superior):", error);
  } finally {
    isBdnsScrapingRunning = false;
    if (browser) await browser.close().catch(() => {});
    console.log("🔓 Cerrojo liberado. Sistema limpio.");
  }
}