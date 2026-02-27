import puppeteer from "puppeteer";
import { storage } from "../storage";
import { execSync } from "child_process"; //

export async function scrapeBDNS() {
  console.log("🚀 Iniciando scraping BDNS...");

  try {
    // 1. Intentar obtener la ruta de Chromium directamente del sistema
    let chromiumPath = "";
    try {
      // Ejecutamos 'which chromium' igual que lo hiciste en la consola
      chromiumPath = execSync("which chromium").toString().trim();
      console.log(`📍 Chromium detectado en sistema: ${chromiumPath}`);
    } catch (e) {
      console.error("⚠️ 'which chromium' falló en Node, probando fallback...");
      chromiumPath = "chromium"; // Fallback: confiar en el PATH
    }

    // 2. Configuración de lanzamiento optimizada para Replit
    const browser = await puppeteer.launch({
      headless: true,
      executablePath: chromiumPath || '/nix/var/nix/profiles/default/bin/chromium',
      args: [
        '--no-sandbox',             // Requerido en entornos containerizados
        '--disable-setuid-sandbox', // Requerido en entornos containerizados
        '--disable-dev-shm-usage',  // Evita errores de memoria compartida
        '--disable-gpu',
        '--single-process',         // Ahorra recursos
        '--no-zygote'
      ]
    });

    console.log("✅ Navegador lanzado correctamente.");

    // ... Resto de tu lógica de navegación ...
    const page = await browser.newPage();

    try {
      await page.goto(
        "https://www.infosubvenciones.es/bdnstrans/GE/es/convocatorias",
        { waitUntil: "networkidle2", timeout: 60000 }
      );
      console.log("📄 Página cargada.");


      console.log("⏳ Esperando 5 segundos a que el servidor de BDNS devuelva los datos...");
      // Esta es la forma moderna de hacer un "sleep" en Node.js
      await new Promise(resolve => setTimeout(resolve, 5000));

      // 📸 Tomamos la foto DESPUÉS de los 5 segundos
      await page.screenshot({ path: 'captura-bdns.png', fullPage: true });
      console.log("📸 Captura guardada. Revisa si ahora se ven los datos.");
      // 📸 HACER UNA CAPTURA DE PANTALLA:
      await page.screenshot({ path: 'captura-bdns.png', fullPage: true });
      console.log("📸 Captura de pantalla guardada como captura-bdns.png");
      // 2. Extraemos los datos y los enlaces
      const convocatorias = await page.evaluate(() => {
        // Seleccionamos todas las filas de datos
        const filas = Array.from(document.querySelectorAll('table tbody tr'));

        return filas.map(fila => {
          const columnas = fila.querySelectorAll('td');

          // Ignoramos filas que no tengan suficientes columnas (ej. filas vacías o separadores)
          if (columnas.length < 3) return null; 

          // OJO: Tendrás que ajustar los índices [0], [1], [2] según el orden real de las columnas
          const celdaCodigo = columnas[0];
          const celdaAdministracion = columnas[1]; 
          const celdaDepartamento = columnas[2]; 
          const celdaOrgano = columnas[3]; 
          const celdaFechaRegistro = columnas[4];
          const celdaTitulo = columnas[5];


          // Buscamos el enlace dentro de la celda del título
          const etiquetaEnlace = celdaTitulo.querySelector('a');

          return {
            codigoBDNS: celdaCodigo.innerText.trim(),
            titulo: celdaTitulo.innerText.trim(),
            organoConvocante: celdaOrgano.innerText.trim(),
            urlDetalle: etiquetaEnlace ? etiquetaEnlace.href : null
          };
        }).filter(item => item !== null); // Limpiamos los nulos
      });

      console.log(`🔍 Se han extraído ${convocatorias.length} convocatorias.`);
      console.log("📄 Ejemplo de la primera:", convocatorias[0]);

      console.log(`\n🚀 Iniciando extracción de detalles para ${convocatorias.length} convocatorias...`);

      // Usamos un bucle for...of (NO uses .forEach con await, no funciona bien en Puppeteer)
      for (let i = 0; i < convocatorias.length; i++) {
        const convocatoria = convocatorias[i];

        // Si por algún motivo no hay URL, nos la saltamos
        if (!convocatoria.urlDetalle) continue;

        console.log(`[${i + 1}/${convocatorias.length}] Entrando a la subvención ${convocatoria.codigoBDNS}...`);

        try {
          // 1. Navegar a la página de detalle
          await page.goto(convocatoria.urlDetalle, { waitUntil: "networkidle2", timeout: 30000 });

          // 2. Esperamos un par de segundos para asegurar que carguen los datos dinámicos del detalle
          await new Promise(resolve => setTimeout(resolve, 2000));

          const camposABuscar = {
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

          const scriptNavegador = `
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

              // Inicializamos vacío
              for (let clave in campos) {
                resultados[clave] = "";
              }

              // Buscamos en el DOM (usamos bucles 'for' clásicos, nada de cosas modernas que rompan el compilador)
              const titulos = document.querySelectorAll('.titulo-campo');

              for (let i = 0; i < titulos.length; i++) {
                const titulo = titulos[i];
                const textoTitulo = titulo.textContent || "";

                const nodoValor = titulo.nextElementSibling;
                const valorExtraido = nodoValor ? nodoValor.textContent.trim() : "";

                for (let clave in campos) {
                  if (textoTitulo.includes(campos[clave])) {
                    resultados[clave] = valorExtraido;
                  }
                }
              }

              return resultados;
            })();
          `;

          // Le pasamos el string de texto a Puppeteer. Chrome lo leerá y lo ejecutará sin errores.
          const detalles = await page.evaluate(scriptNavegador);

          // 4. Juntamos la información básica con los detalles nuevos
          convocatorias[i] = {
            ...convocatoria,  // Lo que ya teníamos (título, órgano, etc.)
            ...detalles       // Lo nuevo (descripción, presupuesto, etc.)
          };

          console.log(`   ✅ Extraído: Presupuesto -> ${detalles.sedeElectronica ? 'Encontrado' : 'Vacío'}`);

        } catch (error) {
          console.error(`   ❌ Error al extraer el detalle de ${convocatoria.codigoBDNS}:`, error.message);
        }
      }

      console.log("\n🎉 ¡Extracción completa!");
      console.log("📄 Ejemplo de la primera convocatoria con todos sus detalles:", convocatorias[0]);

    } catch (pageError) {
      console.error("❌ Error navegando en la página:", pageError);
    } finally {
      await browser.close();
    }

  } catch (error) {
    console.error("💀 Error CRÍTICO al lanzar Puppeteer:");
    console.error(error);
  }
}