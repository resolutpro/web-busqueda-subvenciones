import OpenAI from "openai";
import { Company } from "@shared/schema";
// import { notifyAgentOfMatch } from "./openclaw-notifier"; // Descomentar cuando lo uses

const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY 
});

// Función para auto-detectar el origen leyendo los campos de la base de datos
function detectSource(grantDetails: any): 'BDNS' | 'BOE' | 'TED' | 'Desconocido' {
  if (grantDetails.codigoBDNS) return 'BDNS';
  if (grantDetails.departamento) return 'BOE';
  if (grantDetails.pais) return 'TED';
  return 'Desconocido';
}

// ============================================================================
// FUNCIÓN 1: checkGrantWithAI
// ============================================================================
export async function checkGrantWithAI(grantDetails: any, companies: {id: number, name: string, description: string}[]) {
  try {
    const prompt = `
    Actúa como un Auditor Senior de Subvenciones Públicas y Ayudas Estatales. Tu trabajo es analizar convocatorias y determinar si aplican a un listado de empresas.

    ERES EXTREMADAMENTE RIGUROSO Y CONSERVADOR. Tienes estrictamente prohibido forzar encajes. Un "falso positivo" es un error crítico.

    REGLAS DE EXCLUSIÓN ESTRICTAS (Descarte Automático):
    1. UBICACIÓN GEOGRÁFICA: Si la convocatoria es regional/local y la empresa no tiene sede allí -> DESCARTAR.
    2. TAMAÑO DE LA EMPRESA: Si exige PYME y es Gran Empresa (o viceversa) -> DESCARTAR.
    3. OBJETO: Lo que hace la empresa debe cuadrar directamente con la finalidad de la ayuda.
    4. ROL DE BENEFICIARIO DIRECTO: La empresa debe ser el destinatario final para mejorar SU PROPIO negocio. DESCARTA INMEDIATAMENTE a la empresa si solo cuadra porque puede ofrecer servicios de consultoría, gestión o formación a terceros.

    Perfiles de las empresas:
    ${JSON.stringify(companies)}

    Detalles de la convocatoria:
    ${JSON.stringify(grantDetails)}

    TAREA: Evalúa CADA empresa. Si una empresa falla en UNA SOLA regla, OMÍTELA completamente del resultado JSON para ahorrar tokens.

    Responde estrictamente en formato JSON con esta estructura:
    {
      "matches": [
        {
          "companyId": id_de_la_empresa,
          "companyName": "nombre de la empresa",
          "cuadra": true,
          "razon": "Justificación objetiva detallando cómo cumple con Ubicación, Tamaño, Sector y Objeto."
        }
      ]
    }
    `;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0, // CRÍTICO: Cero creatividad
    });

    const content = response.choices[0].message.content;
    const result = content ? JSON.parse(content) : { matches: [] };

    if (result.matches && result.matches.length > 0) {
      const source = detectSource(grantDetails);
      const reasonText = result.matches
        .map((m: any) => `- EMPRESA: ${m.companyName} (ID: ${m.companyId})\n  MOTIVO: ${m.razon}`)
        .join("\n\n");
      // await notifyAgentOfMatch(source, grantDetails, reasonText);
    }

    return result;
  } catch (error) {
    console.error("Error al consultar a OpenAI (checkGrantWithAI):", error);
    return { matches: [] };
  }
}

// ============================================================================
// FUNCIÓN 2: checkGrantForMultipleCompaniesWithAI
// ============================================================================
export async function checkGrantForMultipleCompaniesWithAI(grantDetails: any, companies: Company[]) {
  try {
    const companiesInfo = companies.map(c => 
      `Empresa ID: ${c.id} | Nombre: ${c.name} | Sector/CNAE: ${c.cnae} | Tamaño: ${c.size} | Descripción/Requisitos: "${c.description}"`
    ).join("\n\n");

    const prompt = `
    Actúa como un Auditor Senior de Subvenciones Públicas y Ayudas Estatales. Tu trabajo es analizar convocatorias y determinar si aplican a un listado de empresas.

    ERES EXTREMADAMENTE RIGUROSO Y CONSERVADOR. Tienes estrictamente prohibido forzar encajes. Un "falso positivo" es un error crítico.

    REGLAS DE EXCLUSIÓN ESTRICTAS (Descarte Automático):
    1. UBICACIÓN GEOGRÁFICA: Si la convocatoria es regional/local y la empresa no tiene sede allí -> DESCARTAR.
    2. TAMAÑO DE LA EMPRESA: Si exige PYME y es Gran Empresa (o viceversa) -> DESCARTAR.
    3. OBJETO: Lo que hace la empresa debe cuadrar directamente con la finalidad de la ayuda.
    4. ROL DE BENEFICIARIO DIRECTO: La empresa debe ser el destinatario final para mejorar SU PROPIO negocio. DESCARTA INMEDIATAMENTE a la empresa si solo cuadra porque puede ofrecer servicios de consultoría, gestión o formación a terceros.

    Perfiles de las empresas:
    ---
    ${companiesInfo}
    ---

    Detalles de la convocatoria:
    ---
    ${JSON.stringify(grantDetails)}
    ---

    TAREA: Evalúa CADA empresa. Si una empresa falla en UNA SOLA regla, no la incluyas.

    Responde estrictamente en formato JSON. Si ninguna cumple, devuelve un array vacío [].
    Estructura requerida:
    {
      "evaluaciones": [
        {
          "companyId": <ID numérico de la empresa>,
          "cuadra": true,
          "razon": "Justificación objetiva detallando cómo cumple con Ubicación, Tamaño, Sector y Objeto."
        }
      ]
    }
    `;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini", // Cambiado de deepseek a gpt-4o-mini
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0, // Añadida la temperatura a 0
    });

    const content = response.choices[0].message.content;
    const result = content ? JSON.parse(content) : { evaluaciones: [] };

    if (result.evaluaciones && result.evaluaciones.length > 0) {
      const source = detectSource(grantDetails);
      const reasonText = result.evaluaciones
        .map((evalData: any) => {
          const comp = companies.find(c => c.id === evalData.companyId);
          const nombreEmpresa = comp ? comp.name : `ID Desconocido (${evalData.companyId})`;
          return `- EMPRESA: ${nombreEmpresa}\n  MOTIVO: ${evalData.razon}`;
        })
        .join("\n\n");
      // await notifyAgentOfMatch(source, grantDetails, reasonText);
    }

    return result;
  } catch (error) {
    console.error("Error al consultar a OpenAI en bulk:", error);
    return { evaluaciones: [] };
  }
}