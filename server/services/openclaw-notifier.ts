// server/services/openclaw-notifier.ts

export async function notifyAgentOfMatch(grant: any, matchScore: number, matchReason: string) {
  // La URL del webhook de OpenClaw (por defecto suele correr en el puerto 19001 o el que configures)
  const webhookUrl = process.env.OPENCLAW_WEBHOOK_URL || "http://localhost:19001/hooks/wake";

  // Preparamos el contexto exacto que el agente necesita leer
  const prompt = `
¡Alerta! Se ha detectado una nueva subvención con alta compatibilidad (${matchScore}%).

DATOS DE LA SUBVENCIÓN:
- Origen: ${grant.source || 'Desconocido'}
- Título: ${grant.titulo}
- Organismo: ${grant.organoConvocante || grant.departamento || grant.pais}
- ID: ${grant.identificador || grant.codigoBDNS || grant.id}

ANÁLISIS DE COMPATIBILIDAD:
${matchReason}

Por favor, revisa esto y procede con el siguiente paso en tu Skill.
  `;

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      // OpenClaw espera un campo 'text' y podemos forzar el modo 'now' para que despierte ya
      body: JSON.stringify({ 
        text: prompt,
        mode: "now" 
      })
    });

    if (!response.ok) {
      console.warn(`[OpenClaw] El agente no respondió correctamente: ${response.status}`);
    } else {
      console.log(`[OpenClaw] Agente notificado con éxito sobre la subvención: ${grant.titulo}`);
    }
  } catch (error) {
    console.error("[OpenClaw] Error de conexión con el agente:", error);
  }
}