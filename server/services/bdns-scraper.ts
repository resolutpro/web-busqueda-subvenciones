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
  { 
    id: 'C', 
    nombre: 'Administración del Estado', 
    seleccionarEspecificos: 'ALL'
  },
  { 
    id: 'A', 
    nombre: 'Comunidades autónomas', 
    seleccionarEspecificos: [
      'ANDALUCÍA', 'ARAGÓN', 'CASTILLA Y LEÓN', 'COMUNITAT VALENCIANA', 'EXTREMADURA', 'GALICIA'
    ] 
  },
  { 
    id: 'L', 
    nombre: 'Entidades locales', 
    seleccionarEspecificos: [
      // Andalucía
      'ALMERÍA', 'CÁDIZ', 'CÓRDOBA', 'GRANADA', 'HUELVA', 'JAÉN', 'MÁLAGA', 'SEVILLA',
      // Aragón
      'HUESCA', 'TERUEL', 'ZARAGOZA',
      // Castilla y León
      'ÁVILA', 'BURGOS', 'LEÓN', 'PALENCIA', 'SALAMANCA', 'SEGOVIA', 'SORIA', 'VALLADOLID', 'ZAMORA',
      // Comunitat Valenciana
      'ALACANT / ALICANTE', 'CASTELLÓ / CASTELLÓN', 'VALÈNCIA / VALENCIA',
      // Extremadura
      'BADAJOZ', 'CÁCERES',
      // Galicia
      'A CORUÑA', 'LUGO', 'OURENSE', 'PONTEVEDRA'
    ] 
  },
  { 
    id: 'O', 
    nombre: 'Otros órganos', 
    seleccionarEspecificos: 'ALL'
  }
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
    // Limpieza de procesos zombie de Chromium antes de empezar
    try {
      console.log("🧹 Limpiando procesos de Chromium colgados en memoria...");
      execSync("pkill -f chromium");
      execSync("pkill -f chrome");
    } catch (e) {
      // Es normal que dé error si no hay ningún proceso abierto, lo ignoramos.
    }
    
    // 1. Buscamos la ruta de la forma más segura posible en Replit
    let chromiumPath = process.env.PUPPETEER_EXECUTABLE_PATH || "";
    if (!chromiumPath) {
      try { 
        chromiumPath = execSync("which chromium").toString().trim(); 
      } catch (e) { 
        chromiumPath = "/nix/var/nix/profiles/default/bin/chromium"; 
      }
    }

    console.log(`🚀 Intentando abrir Chromium en la ruta: ${chromiumPath}`);

    const browser = await puppeteer.launch({
      headless: true,
      executablePath: chromiumPath,
      pipe: true, // ⚠️ LA SOLUCIÓN MÁGICA: Usa tuberías internas de Linux en lugar de puertos de red
      env: {
        ...process.env,
        DBUS_SESSION_BUS_ADDRESS: '/dev/null' // 🛑 Apaga completamente los intentos de conexión al D-Bus
      },
      args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox', 
        '--disable-dev-shm-usage', 
        '--disable-gpu',
        '--no-zygote',
        '--disable-software-rasterizer',
        // NOTA: Hemos eliminado '--remote-debugging-port' porque ahora usamos 'pipe: true'
        '--disable-features=dbus',
        '--disable-background-networking',
        '--disable-extensions',
        '--mute-audio',
        '--no-first-run',
        '--disable-default-apps'
      ]
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

      // === NUEVO: Obtenemos el límite específico para este modo ===
      const stateKey = `highest_bdns_code_${modo.id}`;
      const stateRecord = await db.query.scrapingState.findFirst({
        where: eq(scrapingState.key, stateKey),
      });
      const stopCodeLimit = stateRecord ? parseInt(stateRecord.value, 10) : 0;
      let highestCodeThisSession = stopCodeLimit;

      console.log(`📍 Último código procesado para ${modo.nombre}: ${stopCodeLimit}`);

      // --- NUEVO: Bloqueamos imágenes y recursos pesados en la página principal ---
      // Solo lo hacemos si no se ha activado ya en esta página
      try {
        await page.setRequestInterception(true);
        page.on('request', (req) => {
          // Dejamos pasar los estilos (CSS) porque Angular a veces los necesita para los clics
          if (['image', 'font', 'media'].includes(req.resourceType())) {
            req.abort();
          } else {
            req.continue();
          }
        });
      } catch (e) {
        // Ignoramos el error si la intercepción ya estaba activada en pasadas del bucle
      }

      // 1. Ir a la web desde cero (Cambiamos networkidle2 por domcontentloaded y damos 90 seg)
      console.log("🌐 Conectando a la web de BDNS...");
      await page.goto("https://www.infosubvenciones.es/bdnstrans/GE/es/convocatorias", { 
        waitUntil: "domcontentloaded", 
        timeout: 90000 // Le damos 90 segundos porque el servidor del Estado a veces va muy lento
      });

      // Esperamos generosamente a que Angular termine de pintar los menús
      await new Promise(resolve => setTimeout(resolve, 8000));

      try {
        // 2. Abrir el panel de "Órgano convocante"
        await page.evaluate(() => {
          const headers = Array.from(document.querySelectorAll('mat-expansion-panel-header'));
          const panelOrgano = headers.find(h => h.textContent?.includes('Órgano convocante'));
          if (panelOrgano && !panelOrgano.classList.contains('mat-expanded')) {
            (panelOrgano as HTMLElement).click();
          }
        });
        await new Promise(resolve => setTimeout(resolve, 1500)); 

        // 3. Seleccionar el Radio Button (C, A, L, O)
        await page.evaluate((radioValue) => {
          const radioInput = document.querySelector(`input[type="radio"][value="${radioValue}"]`);
          if (radioInput) {
            const radioContainer = radioInput.closest('mat-radio-button')?.querySelector('label');
            if (radioContainer) (radioContainer as HTMLElement).click();
          }
        }, modo.id);

        console.log(`🔘 Seleccionado radio button: ${modo.nombre}`);
        await new Promise(resolve => setTimeout(resolve, 3000)); 

        // 4. Marcar los checkboxes pertinentes (o todos)
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

        // 5. Clicar en "Filtrar"
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

        for (let i = 0; i < convocatoriasPagina.length; i++) {
          const convocatoria = convocatoriasPagina[i];
          if (!convocatoria) continue;

          const currentCode = parseInt(convocatoria.codigoBDNS, 10);
          const currentDate = parseBDNSDate(convocatoria.fechaRegistro);

          // === Aquí la validación se hace con el límite propio de esta categoría ===
          if (currentCode <= stopCodeLimit) {
            console.log(`🛑 Deteniendo: Código BDNS ${currentCode} ya procesado en [${modo.nombre}].`);
            keepScraping = false;
            break; 
          }

          if (currentDate && currentDate < oneMonthAgo) {
            console.log(`🛑 Deteniendo: Fecha antigua (más de 1 mes).`);
            keepScraping = false;
            break; 
          }

          console.log(`[${i+1}/${convocatoriasPagina.length}] Analizando ${convocatoria.codigoBDNS}...`);

          if (convocatoria.urlDetalle) {
            const detailPage = await browser.newPage();
            try {
              await detailPage.setRequestInterception(true);
              detailPage.on('request', (req) => {
                if (['image', 'stylesheet', 'font', 'media'].includes(req.resourceType())) {
                  req.abort();
                } else {
                  req.continue();
                }
              });
              
              await detailPage.goto(convocatoria.urlDetalle, { waitUntil: "domcontentloaded", timeout: 60000 });
              await new Promise(resolve => setTimeout(resolve, 2000));

              const detallesExtraidos = await detailPage.evaluate(() => {
                // Lista exacta de los campos que te interesan
                const camposInteres = [
                  "Órgano convocante", 
                  "Sede electrónica para la presentación de solicitudes",
                  "Código BDNS", 
                  "Mecanismo de Recuperación y Resiliencia", 
                  "Fecha de registro",
                  "Tipo de convocatoria", 
                  "Presupuesto total de la convocatoria", 
                  "Instrumento de ayuda",
                  "Título de la convocatoria en español", 
                  "Tipo de beneficiario elegible",
                  "Sector económico del beneficiario", 
                  "Región de impacto", 
                  "Finalidad (política de gasto)",
                  "Título de las Bases reguladoras", 
                  "Dirección electrónica de las bases reguladoras",
                  "¿El extracto de la convocatoria se publica en diario oficial?",
                  "¿Se puede solicitar indefinidamente?", 
                  "Fecha de inicio del periodo de solicitud",
                  "SA Number (Referencia de ayuda de estado)", 
                  "SA Number (Enlace UE)",
                  "Cofinanciado con Fondos UE", 
                  "Sector de productos", 
                  "Reglamento (UE)", 
                  "Objetivos"
                ];

                const res: Record<string, string> = {};
                const titulos = document.querySelectorAll('.titulo-campo');

                titulos.forEach(titulo => {
                  // 1. Extraer y limpiar el título del campo (quitando el punto '·' y estandarizando espacios)
                  let clave = (titulo.textContent || "").replace('·', '').trim();
                  clave = clave.replace(/\s+/g, ' '); // Evitar dobles espacios que rompan el match

                  if (!clave) return;

                  // 2. Extraer el valor del siguiente elemento HTML
                  const elementoValor = titulo.nextElementSibling as HTMLElement;
                  let valor = "";

                  if (elementoValor) {
                    // Usar innerText permite capturar los diferentes <div> anidados (como en Órgano convocante)
                    valor = elementoValor.innerText || elementoValor.textContent || "";

                    // Reemplazar los saltos de línea internos por " - " para que quede legible y en una línea
                    valor = valor.replace(/\n+/g, ' - ').replace(/\s+/g, ' ').trim();

                    // Limpiar guiones residuales al inicio o final
                    if (valor.startsWith('- ')) valor = valor.substring(2);
                    if (valor.endsWith(' -')) valor = valor.substring(0, valor.length - 2);
                  }

                  // 3. Guardar el campo si coincide con la lista de interés (o puedes quitar el 'if' para guardarlos absolutamente todos)
                  if (camposInteres.includes(clave)) {
                    res[clave] = valor || "";
                  } else {
                    // Guardamos por defecto los demás también por si añaden campos nuevos útiles
                    res[clave] = valor || "";
                  }
                });

                return res;
              });

              const infoCompleta = { ...convocatoria, ...detallesExtraidos };

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
                await db.insert(bdnsGrants).values({
                  codigoBDNS: convocatoria.codigoBDNS,
                  titulo: convocatoria.titulo,
                  organoConvocante: convocatoria.organoConvocante,
                  fechaRegistro: currentDate,
                  urlDetalle: convocatoria.urlDetalle,
                  detallesExtraidos: detallesExtraidos, 
                  iaAnalisis: iaAnalisisMasivo
                });
              }

            } catch (err: any) {
              console.error(`   ❌ Error detalle ${convocatoria.codigoBDNS}: ${err.message}`);
            } finally {
              await detailPage.close();

              // === Guardamos el progreso específico en la DB ===
              if (currentCode > highestCodeThisSession) {
                highestCodeThisSession = currentCode;
                await db.insert(scrapingState).values({ key: stateKey, value: highestCodeThisSession.toString() })
                  .onConflictDoUpdate({ target: scrapingState.key, set: { value: highestCodeThisSession.toString(), updatedAt: new Date() } });
              }
            }
          }
        } 

        if (keepScraping) {
          const SELECTOR_BOTON_SIGUIENTE = 'button.mat-paginator-navigation-next'; 
          const estaDeshabilitado = await page.$('button.mat-paginator-navigation-next[disabled], button.mat-paginator-navigation-next.mat-button-disabled');

          if (!estaDeshabilitado) {
            try {
              await page.evaluate((sel) => { (document.querySelector(sel) as HTMLElement)?.click(); }, SELECTOR_BOTON_SIGUIENTE);
              await new Promise(resolve => setTimeout(resolve, 6000));
              pageCounter++;
            } catch (e) { keepScraping = false; }
          } else {
            keepScraping = false; 
          }
        }
      } 
    } // Fin Bucle de Modos

    console.log(`\n🎉 Scraping completado para todas las secciones.`);

    await db.insert(scrapingState).values({ key: "last_bdns_sync", value: new Date().toISOString() })
      .onConflictDoUpdate({ target: scrapingState.key, set: { value: new Date().toISOString(), updatedAt: new Date() }});

    await browser.close();

  } catch (error) {
    console.error("💀 Error CRÍTICO:", error);
  }
}