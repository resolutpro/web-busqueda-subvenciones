import OpenAI from "openai";
import { Company } from "@shared/schema";
import { notifyAgentOfMatch } from "./openclaw-notifier";

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

export async function checkGrantWithAI(grantDetails: any, companies: {id: number, name: string, description: string}[]) {
  try {
    const prompt = `
      Actúa como un experto en subvenciones. Tengo esta nueva convocatoria:
      ${JSON.stringify(grantDetails)}

      Y tengo esta lista de empresas con sus perfiles:
      ${JSON.stringify(companies)}

      Evalúa la subvención contra CADA empresa. 
      Responde estrictamente en formato JSON.

      IMPORTANTE: Devuelve en el array "matches" ÚNICAMENTE las empresas para las que la subvención sea relevante y cumplan los requisitos. 
      Si una empresa NO cuadra (es descartada), OMÍTELA completamente del resultado JSON para ahorrar tokens.

      Estructura esperada:
      {
        "matches": [
          {
            "companyId": id_de_la_empresa,
            "companyName": "nombre de la empresa",
            "cuadra": true,
            "razon": "Explicación detallada y útil de por qué cuadra perfectamente."
          }
        ]
      }
    `;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    });

    const content = response.choices[0].message.content;
    const result = content ? JSON.parse(content) : { matches: [] };

      // --- NUEVA LÓGICA DE NOTIFICACIÓN ---
      if (result.matches && result.matches.length > 0) {
        const source = detectSource(grantDetails);

        // Creamos un texto legible uniendo todas las empresas que hicieron match
        const reasonText = result.matches
          .map((m: any) => `- EMPRESA: ${m.companyName} (ID: ${m.companyId})\n  MOTIVO: ${m.razon}`)
          .join("\n\n");

        // Disparamos el webhook hacia OpenClaw
        await notifyAgentOfMatch(source, grantDetails, reasonText);
      }
      // ------------------------------------

      return result;
    } catch (error) {
    console.error("Error al consultar a DeepSeek:", error);
    return { matches: [] };
  }
}

export async function evaluateGrantRelevance(titulo: string, tipo: string) {
  try {
    const prompt = `
      Actúa como un experto en subvenciones. Tengo el siguiente título de un ${tipo}:
      "${titulo}"

      ¿Es este anuncio relevante para una empresa que busca subvenciones o ayudas públicas? 
      Responde estrictamente en formato JSON con la siguiente estructura:
      {
        "isRelevant": boolean,
        "razon": "breve explicación de por qué es relevante o no"
      }
    `;

    const response = await openai.chat.completions.create({
      model: "deepseek-chat", // 3️⃣ CAMBIO AQUÍ
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    });

    const content = response.choices[0].message.content;
    if (content) {
      return JSON.parse(content);
    }
    return { isRelevant: false, razon: "Respuesta vacía de la IA" };
  } catch (error) {
    console.error("Error al consultar a DeepSeek:", error);
    return { isRelevant: false, razon: "Error de conexión con la IA" };
  }
}

export async function checkGrantForMultipleCompaniesWithAI(grantDetails: any, companies: Company[]) {
  try {
    const companiesInfo = companies.map(c => 
      `Empresa ID: ${c.id} | Nombre: ${c.name} | Sector/CNAE: ${c.cnae} | Tamaño: ${c.size} | Descripción/Requisitos: "${c.description}"`
    ).join("\n\n");

    const prompt = `
      Actúa como un experto en subvenciones. Tengo las siguientes empresas bajo mi gestión:

      ${companiesInfo}

      Y he extraído esta información de una nueva convocatoria de la BDNS:
      ${JSON.stringify(grantDetails)}

      ¿Cumple esta subvención con los requisitos de alguna de estas empresas? 
      Evalúa CADA empresa individualmente.

      Responde estrictamente en formato JSON.
      IMPORTANTE: Devuelve en el array "evaluaciones" ÚNICAMENTE las empresas que SÍ cumplen los requisitos. Si una empresa no cuadra, no la incluyas en el array bajo ningún concepto.

      Estructura esperada:
      {
        "evaluaciones": [
          {
            "companyId": <ID numérico de la empresa>,
            "cuadra": true,
            "razon": "breve explicación de por qué cuadra para esta empresa en concreto"
          }
        ]
      }
    `;

    const response = await openai.chat.completions.create({
      model: "deepseek-chat", // 4️⃣ CAMBIO AQUÍ
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    });

    const content = response.choices[0].message.content;
    const result = content ? JSON.parse(content) : { evaluaciones: [] };

    // --- NUEVA LÓGICA DE NOTIFICACIÓN ---
    if (result.evaluaciones && result.evaluaciones.length > 0) {
      const source = detectSource(grantDetails);

      const reasonText = result.evaluaciones
        .map((evalData: any) => {
          const comp = companies.find(c => c.id === evalData.companyId);
          const nombreEmpresa = comp ? comp.name : `ID Desconocido (${evalData.companyId})`;
          return `- EMPRESA: ${nombreEmpresa}\n  MOTIVO: ${evalData.razon}`;
        })
        .join("\n\n");

      await notifyAgentOfMatch(source, grantDetails, reasonText);
    }
    // ------------------------------------

    return result;
  } catch (error) {
    console.error("Error al consultar a DeepSeek en bulk:", error);
    return { evaluaciones: [] };
  }
}