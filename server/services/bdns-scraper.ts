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

export async function scrapeBDNS() {
  console.log("🚀 Iniciando scraping BDNS (Modo Paginación + Perfil Dinámico + Guardado Continuo)...");

  // 1. Obtener estado para saber dónde parar (Límite histórico de la última vez)
  const stateRecord = await db.query.scrapingState.findFirst({
    where: eq(scrapingState.key, "highest_bdns_code"),
  });
  const stopCodeLimit = stateRecord ? parseInt(stateRecord.value, 10) : 0;
  let highestCodeThisSession = stopCodeLimit; // Esta variable subirá en tiempo real

  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

  // 2. OBTENER REQUISITOS DESDE LA TABLA 'companies' (Guardado en /profile)
  // Para el scraper general, usamos el primer perfil configurado. 
  // (Si fuera multitenant, habría que cruzar cada subvención con todas las empresas)
  const empresa = await db.query.companies.findFirst();
  let misRequisitos = "Soy una empresa que busca subvenciones."; // Fallback

  if (empresa) {
    misRequisitos = `Soy una empresa llamada "${empresa.name}". 
    Tamaño: ${empresa.size || 'No definido'}. 
    Ubicación: ${empresa.location || 'No definida'}. 
    Sector/CNAE: ${empresa.cnae || 'No definido'}. 
    A qué me dedico y mis objetivos: ${empresa.description}`;
  }

  console.log(`\n📝 Requisitos cargados para la IA:\n"${misRequisitos}"\n`);

  try {
    let chromiumPath = "";
    try {
      chromiumPath = execSync("which chromium").toString().trim();
    } catch (e) {
      chromiumPath = "chromium";
    }

    const browser = await puppeteer.launch({
      headless: true,
      executablePath: chromiumPath || '/nix/var/nix/profiles/default/bin/chromium',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--single-process', '--no-zygote']
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 }); 

    await page.goto("https://www.infosubvenciones.es/bdnstrans/GE/es/convocatorias", { waitUntil: "networkidle2", timeout: 60000 });

    // Espera inicial generosa para carga AJAX
    await new Promise(resolve => setTimeout(resolve, 8000));

    let keepScraping = true;
    let pageCounter = 1;

    // BUCLE PRINCIPAL DE PAGINACIÓN
    while (keepScraping) {
      console.log(`\n📄 --- Procesando Página ${pageCounter} ---`);

      // Extraer TODAS las convocatorias visibles
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

      // Procesar una por una las convocatorias de la página
      for (let i = 0; i < convocatoriasPagina.length; i++) {
        const convocatoria = convocatoriasPagina[i];
        if (!convocatoria) continue;

        const currentCode = parseInt(convocatoria.codigoBDNS, 10);
        const currentDate = parseBDNSDate(convocatoria.fechaRegistro);

        // --- CONDICIONES DE PARADA ---
        // Parada 1: Ya existe en BD (Código menor o igual al límite histórico de la vez anterior)
        if (currentCode <= stopCodeLimit) {
          console.log(`🛑 Deteniendo: Código BDNS ${currentCode} ya fue procesado en sesiones anteriores.`);
          keepScraping = false;
          break; // Salir del bucle FOR
        }

        // Parada 2: Fecha más antigua de un año
        if (currentDate && currentDate < oneYearAgo) {
          console.log(`🛑 Deteniendo: Fecha ${convocatoria.fechaRegistro} es más antigua de 1 año.`);
          keepScraping = false;
          break; // Salir del bucle FOR
        }

        console.log(`[${i+1}/${convocatoriasPagina.length}] Analizando subvención ${convocatoria.codigoBDNS}...`);

        if (convocatoria.urlDetalle) {
          const detailPage = await browser.newPage();
          try {
            await detailPage.goto(convocatoria.urlDetalle, { waitUntil: "networkidle2", timeout: 30000 });
            await new Promise(resolve => setTimeout(resolve, 2000));

            const scriptDetalle = `
              (() => {
                const campos = {
                  codigoBDNS: 'Código BDNS',
                  sedeElectronica: 'Sede electrónica para la presentación de solicitudes', 
                  organoConvocante: 'Órgano convocante', 
                  mecanismoRecuperacion: 'Mecanismo de Recuperación y Resiliencia', 
                  fechaRegistro: 'Fecha de registro', 
                  tipoConvocatoria: 'Tipo de convocatoria', 
                  presupuestoTotal: 'Presupuesto total de la convocatoria', 
                  instrAyuda: 'Instrumento de ayuda', 
                  tituloConv: 'Título de la convocatoria en español', 
                  tipoBeneficiario: 'Tipo de beneficiario elegible', 
                  sectorEconomico: 'Sector económico del beneficiario', 
                  regionImpacto: 'Región de impacto', 
                  finPolitica: 'Finalidad (política de gasto)', 
                  tituloBases: 'Título de las Bases reguladoras', 
                  dirBasesReg: 'Dirección electrónica de las bases reguladoras'
                };
                const resultados = {};
                for (let clave in campos) resultados[clave] = "";
                const titulos = document.querySelectorAll('.titulo-campo');
                for (let i = 0; i < titulos.length; i++) {
                  const titulo = titulos[i];
                  const valorExtraido = titulo.nextElementSibling ? titulo.nextElementSibling.textContent.trim() : "";
                  for (let clave in campos) {
                    if ((titulo.textContent || "").includes(campos[clave])) resultados[clave] = valorExtraido;
                  }
                }
                return resultados;
              })();
            `;

            const detallesExtraidos = await detailPage.evaluate(scriptDetalle);
            const infoCompleta = { ...convocatoria, ...detallesExtraidos };

            // CONSULTA IA
            const iaResult = await checkGrantWithAI(infoCompleta, misRequisitos);

            if (iaResult.cuadra) {
              console.log(`   ✅ ¡CUADRA! Guardando: ${convocatoria.codigoBDNS}`);
              try {
                await db.insert(bdnsGrants).values({
                  codigoBDNS: convocatoria.codigoBDNS,
                  titulo: convocatoria.titulo,
                  organoConvocante: convocatoria.organoConvocante,
                  fechaRegistro: currentDate,
                  urlDetalle: convocatoria.urlDetalle,
                  detallesExtraidos: detallesExtraidos, 
                  iaAnalisis: iaResult
                });
              } catch (dbErr) { console.error("Error DB:", dbErr); }
            } else {
              console.log(`   ❌ No cuadra. Razón IA: ${iaResult.razon}`);
            }

          } catch (err: any) {
             console.error(`   ❌ Error detalle ${convocatoria.codigoBDNS}:`, err.message);
          } finally {
            await detailPage.close();

            // --- GUARDADO CONTINUO EN BD DEL PROGRESO (POR CADA SUBVENCIÓN) ---
            if (currentCode > highestCodeThisSession) {
              highestCodeThisSession = currentCode;
              try {
                await db.insert(scrapingState)
                  .values({ key: "highest_bdns_code", value: highestCodeThisSession.toString() })
                  .onConflictDoUpdate({
                    target: scrapingState.key,
                    set: { value: highestCodeThisSession.toString(), updatedAt: new Date() }
                  });
                console.log(`   💾 Progreso asegurado en BD. Nuevo tope: ${highestCodeThisSession}`);
              } catch (stateErr) {
                console.error("   ❌ Error guardando el estado:", stateErr);
              }
            }
            // -----------------------------------------------------------------
          }
        }
      } // Fin del bucle FOR (procesar filas de la página)

      // LOGICA DE CAMBIO DE PÁGINA (Material UI Angular)
      if (keepScraping) {
        console.log("➡️ Intentando pasar a la siguiente página...");

        const SELECTOR_BOTON_SIGUIENTE = 'button.mat-paginator-navigation-next'; 
        const SELECTOR_BOTON_DESHABILITADO = 'button.mat-paginator-navigation-next[disabled], button.mat-paginator-navigation-next.mat-button-disabled';

        const botonSiguiente = await page.$(SELECTOR_BOTON_SIGUIENTE);
        const estaDeshabilitado = await page.$(SELECTOR_BOTON_DESHABILITADO);

        if (botonSiguiente && !estaDeshabilitado) {
          try {
            await page.evaluate((selector) => {
              const btn = document.querySelector(selector);
              if (btn) btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, SELECTOR_BOTON_SIGUIENTE);

            await new Promise(resolve => setTimeout(resolve, 1500));

            await page.evaluate((selector) => {
               const btn = document.querySelector(selector) as HTMLElement;
               if (btn) btn.click();
            }, SELECTOR_BOTON_SIGUIENTE);

            console.log("✅ Clic en 'Siguiente' realizado.");
            await new Promise(resolve => setTimeout(resolve, 6000));
            pageCounter++;
          } catch (clickErr) {
            console.error("❌ Error al clicar en 'Siguiente':", clickErr);
            keepScraping = false; 
          }
        } else {
          console.log("🛑 No hay más páginas disponibles (Botón 'Siguiente' no encontrado o deshabilitado).");
          keepScraping = false; 
        }
      }

    } // Fin del bucle WHILE

    console.log(`\n🎉 Scraping completado. Último código verificado asegurado: ${highestCodeThisSession}`);
    await browser.close();

  } catch (error) {
    console.error("💀 Error CRÍTICO:", error);
  }
}