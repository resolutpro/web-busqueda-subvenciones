// server/services/openclaw-notifier.ts

export async function notifyAgentOfMatch(source: string, grantData: any, matchReason: string) {
  // 1. Usamos el endpoint de AGENTE, no el de WAKE
  const webhookUrl = "http://178.104.134.24:18789/hooks/agent";
  const token = process.env.OPENCLAW_TOKEN;

  // 2. Creamos el mensaje estructurado que el agente entiende
  const message = `
ORIGEN: REPLIT_AUTOMATION
TIPO_FUENTE: ${source}
MOTIVO_MATCH: ${matchReason}
DATOS_JSON: ${JSON.stringify(grantData)}
  `.trim();

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}` 
      },
      body: JSON.stringify({ 
        agentId: "subvenciones_agent", // Tu agente específico
        message: message,
        wakeMode: "now"
      })
    });

    const result = await response.json();
    console.log("Agente activado:", result);
  } catch (error) {
    console.error("Error notificando al agente:", error);
  }
}