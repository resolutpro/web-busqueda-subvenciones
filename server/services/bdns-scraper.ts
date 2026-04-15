import puppeteer from "puppeteer";
import { execSync } from "child_process";
import { db } from "../db"; 
import { bdnsGrants, scrapingState, companies } from "../../shared/schema";
import { eq } from "drizzle-orm";
import { checkGrantWithAI } from "./ai-evaluator";

// Auxiliar para parsear fechas DD/MM/YYYY
function parseBDNSDate(dateStr: string) {
  if (!dateStr || dateStr === "") return null;
  const [day, month, year] = dateStr.split('/');
  return new Date(`${year}-${month}-${day}`);
}

// DEFINICIÓN DE LOS 4 FILTROS EXCLUYENTES
const MODOS_BUSQUEDA = [
  { id: 'C', nombre: 'Administración del Estado', seleccionarEspecificos: 'ALL' },
  { id: 'A', nombre: 'Comunidades autónomas', seleccionarEspecificos: [ 'ANDALUCÍA', 'ARAGÓN', 'CASTILLA Y LEÓN', 'COMUNITAT VALENCIANA', 'EXTREMADURA', 'GALICIA' ] },
  { id: 'L', nombre: 'Entidades locales', seleccionarEspecificos: [ 'ALMERÍA', 'CÁDIZ', 'CÓRDOBA', 'GRANADA', 'HUELVA', 'JAÉN', 'MÁLAGA', 'SEVILLA', 'HUESCA', 'TERUEL', 'ZARAGOZA', 'ÁVILA', 'BURGOS', 'LEÓN', 'PALENCIA', 'SALAMANCA', 'SEGOVIA', 'SORIA', 'VALLADOLID', 'ZAMORA', 'ALACANT / ALICANTE', 'CASTELLÓ / CASTELLÓN', 'VALÈNCIA / VALENCIA', 'BADAJOZ', 'CÁCERES', 'A CORUÑA', 'LUGO', 'OURENSE', 'PONTEVEDRA' ] },
  { id: 'O', nombre: 'Otros órganos', seleccionarEspecificos: 'ALL' }
];

// LISTA DE IDENTIDADES (USER-AGENTS) PARA EVADIR EL BLOQUEO
const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 11.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Edge/123.0.0.0 Safari/537.36"
];

export async function scrapeBDNS() {
  console.log("🚀 Iniciando scraping BDNS (Filtros Órgano Convocante + Multi-Empresa)...");

  const oneMonthAgo = new Date();
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

  const todasLasEmpresas = await db.select().from(companies);
  if (todasLasEmpresas.length === 0) {
    console.log("\n⚠️ [BDNS] No hay empresas registradas. Deteniendo scraper.\n");
    return;
  }

  const arrayEmpresasIA = todasLasEmpresas.map(e => ({
    id: e.id,
    name: e.name,
    description: `Tamaño: ${e.size || 'No definido'}. Ubicación: ${e.location || 'No definida'}. Sector/CNAE: ${e.cnae || 'No definido'}. Actividad: ${e.description}`
  }));

  try {
    let chromiumPath = "";
    try { chromiumPath = execSync("which chromium").toString().trim(); } 
    catch (e) { chromiumPath = "chromium"; }

    const browser = await puppeteer.launch({
      headless: true,
      executablePath: chromiumPath || '/nix/var/nix/profiles/default/bin/chromium',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 }); 

    // ==========================================
    // BUCLE EXTERNO: POR CADA MODO DE BÚSQUEDA
    // ==========================================
    for (const modo of MODOS_BUSQUEDA) {
      console.log(`\n======================================================`);
      console.log(`🔎 INICIANDO BÚSQUEDA PARA: ${modo.nombre}`);
      console.log(`======================================================\n`);

      const stateKey = `highest_bdns_code_${modo.id}`;
      const stateRecord = await db.query.scrapingState.findFirst({
        where: eq(scrapingState.key, stateKey),
      });
      const stopCodeLimit = stateRecord ? parseInt(stateRecord.value, 10) : 0;
      let highestCodeThisSession = stopCodeLimit;

      console.log(`📍 Último código procesado para ${modo.nombre}: ${stopCodeLimit}`);

      // 1. Ir a la web desde cero
      await page.goto("https://www.infosubvenciones.es/bdnstrans/GE/es/convocatorias", { waitUntil: "networkidle2", timeout: 60000 });
      await new Promise(resolve => setTimeout(resolve, 5000));

      try {
        await page.evaluate(() => {
          const headers = Array.from(document.querySelectorAll('mat-expansion-panel-header'));
          const panelOrgano = headers.find(h => h.textContent?.includes('Órgano convocante'));
          if (panelOrgano && !panelOrgano.classList.contains('mat-expanded')) {
            (panelOrgano as HTMLElement).click();
          }
        });
        await new Promise(resolve => setTimeout(resolve, 1500)); 

        await page.evaluate((radioValue) => {
          const radioInput = document.querySelector(`input[type="radio"][value="${radioValue}"]`);
          if (radioInput) {
            const radioContainer = radioInput.closest('mat-radio-button')?.querySelector('label');
            if (radioContainer) (radioContainer as HTMLElement).click();
          }
        }, modo.id);

        console.log(`🔘 Seleccionado radio button: ${modo.nombre}`);
        await new Promise(resolve => setTimeout(resolve, 3000)); 

        if (modo.seleccionarEspecificos) {
          console.log(`☑️ Aplicando checkboxes para ${modo.nombre}...`);

          await page.evaluate((elementosDeseados) => {
            const nodos = document.querySelectorAll('mat-tree-node');

            for (let i = 0; i < nodos.length; i++) {
              const nodo = nodos[i];
              const labelElement = nodo.querySelector('.mat-checkbox-label');
              if (!labelElement) continue;

              const textoCheckbox = labelElement.textContent?.trim().toUpperCase() || "";
              const checkbox = nodo.querySelector('mat-checkbox');
              const isChecked = checkbox?.classList.contains('mat-checkbox-checked');

              let deberiaEstarMarcado = false;
              if (elementosDeseados === 'ALL') {
                deberiaEstarMarcado = true; 
              } else if (Array.isArray(elementosDeseados)) {
                deberiaEstarMarcado = (elementosDeseados as string[]).includes(textoCheckbox);
              }

              if (isChecked !== deberiaEstarMarcado) {
                const labelClickable = nodo.querySelector('label.mat-checkbox-layout');
                if (labelClickable) (labelClickable as HTMLElement).click();
              }
            }
          }, modo.seleccionarEspecificos);

          await new Promise(resolve => setTimeout(resolve, 3000));
        }

        console.log("🖱️ Haciendo clic en 'Filtrar'...");
        await page.evaluate(() => {
          const botones = Array.from(document.querySelectorAll('button'));
          const btnFiltrar = botones.find(btn => btn.textContent?.toLowerCase().includes('filtrar'));
          if (btnFiltrar) (btnFiltrar as HTMLElement).click();
        });

        await new Promise(resolve => setTimeout(resolve, 8000));

      } catch (err) {
        console.error(`❌ Error configurando filtros para ${modo.nombre}. Saltando a la siguiente sección.`, err);
        continue; 
      }

      // ==========================================
      // BUCLE INTERNO: PAGINACIÓN DE RESULTADOS
      // ==========================================
      let keepScraping = true;
      let pageCounter = 1;

      while (keepScraping) {
        console.log(`\n📄 [${modo.nombre}] --- Procesando Página ${pageCounter} ---`);

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

        console.log(`🔍 Encontradas ${convocatoriasPagina.length} convocatorias en esta página.`);

        if (convocatoriasPagina.length === 0) {
          console.log(`🛑 No hay resultados para ${modo.nombre}. Terminando paginación.`);
          break;
        }

        const subvencionesAInsertarEnEstaPagina = [];
        let updatedHighestCode = highestCodeThisSession;

        for (let i = 0; i < convocatoriasPagina.length; i++) {
          const convocatoria = convocatoriasPagina[i];
          if (!convocatoria) continue;

          const codigoLimpio = convocatoria.codigoBDNS.replace(/\D/g, '');
          const currentCode = parseInt(codigoLimpio, 10);
          const currentDate = parseBDNSDate(convocatoria.fechaRegistro);

          if (isNaN(currentCode)) continue;

          if (currentDate && currentDate < oneMonthAgo) {
            console.log(`🛑 Deteniendo: Fecha antigua en [${modo.nombre}].`);
            keepScraping = false;
            break; 
          }

          if (currentCode <= stopCodeLimit) {
            console.log(`⏭️ Saltando: Código BDNS ${currentCode} ya procesado.`);
            continue; 
          }

          console.log(`[${i+1}/${convocatoriasPagina.length}] Analizando ${currentCode}...`);

          if (convocatoria.urlDetalle) {

            // ✅ PAUSA ALEATORIA "JITTER" (Entre 4 y 9 segundos)
            const pausaHumana = Math.floor(Math.random() * 5000) + 4000;
            console.log(`   ⏳ Pausa humana de ${(pausaHumana/1000).toFixed(1)}s...`);
            await new Promise(resolve => setTimeout(resolve, pausaHumana));

            let detallesExtraidos: any = null;
            let extraccionExitosa = false;
            let intentos = 0;
            const maxIntentos = 3; 

            // 1. BUCLE DE EXTRACCIÓN WEB BLINDADO Y AISLADO
            while (!extraccionExitosa && intentos < maxIntentos) {
              intentos++;
              let context: any = null;
              let detailPage: any = null; 

              try {
                // ✅ MAGIA DE INCÓGNITO: Versión moderna de createBrowserContext
                context = await browser.createBrowserContext();
                detailPage = await context.newPage();

                // ✅ ROTACIÓN DE IDENTIDAD: Seleccionamos un Agente aleatorio
                const randomUserAgent = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
                await detailPage.setUserAgent(randomUserAgent);

                await detailPage.setRequestInterception(true);
                detailPage.on('request', (req: any) => {
                  const type = req.resourceType();
                  if (type === 'image' || type === 'stylesheet' || type === 'font' || type === 'media') {
                    req.abort().catch(() => {}); 
                  } else {
                    req.continue().catch(() => {});
                  }
                });

                if (intentos > 1) {
                  console.log(`   ⚠️ Reintento ${intentos}/${maxIntentos}. Enfriando conexión 12s...`);
                  await new Promise(resolve => setTimeout(resolve, 12000)); 
                }

                // Subimos el timeout absoluto a 90 segundos
                await detailPage.goto(convocatoria.urlDetalle, { waitUntil: "domcontentloaded", timeout: 90000 });
                await new Promise(resolve => setTimeout(resolve, 3000));

                detallesExtraidos = await detailPage.evaluate(() => {
                  const camposInteres = [ 
                    "Órgano convocante", "Sede electrónica para la presentación de solicitudes", 
                    "Código BDNS", "Mecanismo de Recuperación y Resiliencia", "Fecha de registro", 
                    "Tipo de convocatoria", "Presupuesto total de la convocatoria", "Instrumento de ayuda", 
                    "Título de la convocatoria en español", "Tipo de beneficiario elegible", 
                    "Sector económico del beneficiario", "Región de impacto", "Finalidad (política de gasto)", 
                    "Título de las Bases reguladoras", "Dirección electrónica de las bases reguladoras", 
                    "¿El extracto de la convocatoria se publica en diario oficial?", 
                    "¿Se puede solicitar indefinidamente?", "Fecha de inicio del periodo de solicitud", 
                    "SA Number (Referencia de ayuda de estado)", "SA Number (Enlace UE)", 
                    "Cofinanciado con Fondos UE", "Sector de productos", "Reglamento (UE)", "Objetivos" 
                  ];
                  const res: Record<string, string> = {};
                  const titulos = document.querySelectorAll('.titulo-campo');

                  titulos.forEach(titulo => {
                    let clave = (titulo.textContent || "").replace('·', '').trim().replace(/\s+/g, ' '); 
                    if (!clave) return;

                    const elementoValor = titulo.nextElementSibling as HTMLElement;
                    let valor = "";
                    if (elementoValor) {
                      valor = elementoValor.innerText || elementoValor.textContent || "";
                      valor = valor.replace(/\n+/g, ' - ').replace(/\s+/g, ' ').trim();
                      if (valor.startsWith('- ')) valor = valor.substring(2);
                      if (valor.endsWith(' -')) valor = substring(0, valor.length - 2);
                    }
                    res[clave] = valor || "";
                  });
                  return res;
                });

                extraccionExitosa = true; 

              } catch (err: any) {
                 console.error(`   ❌ Error web en (${currentCode}): ${err.message}`);
              } finally {
                // ✅ LIMPIEZA ABSOLUTA: Cerramos pestaña y contexto
                if (detailPage && !detailPage.isClosed()) await detailPage.close().catch(() => {});
                if (context) await context.close().catch(() => {});
              }
            }

            // 2. FASE DE IA BLINDADA
            if (extraccionExitosa && detallesExtraidos) {
               const infoCompleta = { ...convocatoria, codigoBDNS: codigoLimpio, ...detallesExtraidos };

               try {
                 let algunaEmpresaCuadra = false;
                 let iaAnalisisMasivo = await checkGrantWithAI(infoCompleta, arrayEmpresasIA);
                 const matchesArray = iaAnalisisMasivo.matches || iaAnalisisMasivo.evaluaciones || [];
                 iaAnalisisMasivo.matches = matchesArray;

                 for (const match of matchesArray) {
                   if (match.cuadra) {
                     algunaEmpresaCuadra = true;
                     console.log(`   ✅ CUADRA para: ${match.companyName || match.companyId}`);
                   }
                 }

                 if (algunaEmpresaCuadra) {
                   subvencionesAInsertarEnEstaPagina.push({
                     codigoBDNS: codigoLimpio, 
                     titulo: convocatoria.titulo,
                     organoConvocante: convocatoria.organoConvocante,
                     fechaRegistro: currentDate,
                     urlDetalle: convocatoria.urlDetalle,
                     detallesExtraidos: detallesExtraidos, 
                     iaAnalisis: iaAnalisisMasivo
                   });
                   console.log(`   ⏳ Añadida a la cola de inserción de esta página.`);
                 }
               } catch (iaErr: any) {
                 console.error(`   ❌ Error de la IA evaluando ${currentCode}:`, iaErr.message);
               }

               if (currentCode > updatedHighestCode) {
                 updatedHighestCode = currentCode;
               }
            } else {
               console.log(`   ⏭️ Saltando convocatoria ${currentCode} tras fallar la extracción.`);
            }
          }
        } // Fin For elementos de la página

        // ==========================================
        // INSERCIÓN MASIVA AL TERMINAR LA PÁGINA
        // ==========================================
        if (subvencionesAInsertarEnEstaPagina.length > 0) {
          try {
            console.log(`\n💾 [BDNS - ${modo.nombre}] Insertando ${subvencionesAInsertarEnEstaPagina.length} subvenciones en BD...`);
            await db.insert(bdnsGrants).values(subvencionesAInsertarEnEstaPagina);
          } catch (dbErr) {
            console.error("❌ Error guardando bloque en BD:", dbErr);
          }
        }

        if (updatedHighestCode > highestCodeThisSession) {
          highestCodeThisSession = updatedHighestCode;
          try {
            await db.insert(scrapingState).values({ key: stateKey, value: highestCodeThisSession.toString() })
              .onConflictDoUpdate({ target: scrapingState.key, set: { value: highestCodeThisSession.toString(), updatedAt: new Date() } });
          } catch (err) {}
        }

        // Lógica de Paginación
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
          } catch (err) {
            keepScraping = false;
          }
        }
      } 
    } // Fin Bucle de Modos

    console.log(`\n🎉 Scraping BDNS completado para todas las secciones.`);
    await db.insert(scrapingState).values({ key: "last_bdns_sync", value: new Date().toISOString() })
      .onConflictDoUpdate({ target: scrapingState.key, set: { value: new Date().toISOString(), updatedAt: new Date() }});

    await browser.close();

  } catch (error) {
    console.error("💀 Error CRÍTICO (Nivel Superior):", error);
  }
}