import OpenAI from "openai";
import { Company } from "@shared/schema";

// Asegúrate de tener OPENAI_API_KEY en tus variables de entorno (.env)
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function checkGrantWithAI(grantDetails: any, companies: {id: number, name: string, description: string}[]) {
  try {
    // OPTIMIZACIÓN: Quitamos el null, 2 para minificar el JSON y ahorrar miles de tokens de entrada
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
      model: "gpt-4o-mini", // Mantenemos el modelo económico
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    });

    const content = response.choices[0].message.content;
    return content ? JSON.parse(content) : { matches: [] };
  } catch (error) {
    console.error("Error al consultar a OpenAI:", error);
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
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    });

    const content = response.choices[0].message.content;
    if (content) {
      return JSON.parse(content);
    }
    return { isRelevant: false, razon: "Respuesta vacía de la IA" };
  } catch (error) {
    console.error("Error al consultar a OpenAI:", error);
    return { isRelevant: false, razon: "Error de conexión con la IA" };
  }
}


export async function checkGrantForMultipleCompaniesWithAI(grantDetails: any, companies: Company[]) {
  try {
    const companiesInfo = companies.map(c => 
      `Empresa ID: ${c.id} | Nombre: ${c.name} | Sector/CNAE: ${c.cnae} | Tamaño: ${c.size} | Descripción/Requisitos: "${c.description}"`
    ).join("\n\n");

    // OPTIMIZACIÓN: JSON.stringify sin null, 2 y prompt restrictivo
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
      model: "gpt-4o-mini", 
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    });

    const content = response.choices[0].message.content;
    if (content) {
      return JSON.parse(content);
    }
    return { evaluaciones: [] };
  } catch (error) {
    console.error("Error al consultar a OpenAI en bulk:", error);
    return { evaluaciones: [] };
  }
}