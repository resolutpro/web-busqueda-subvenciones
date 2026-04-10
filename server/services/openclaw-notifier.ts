export async function notifyAgentOfMatch(source: string, grantData: any, matchReason: string) {
  const webhookUrl = "http://178.104.134.24:18789/hooks-privado-88xqz/subvenciones";
  const token = process.env.OPENCLAW_HOOKS_TOKEN;

  // 1. TEXTO LEGIBLE (Esto es lo que verá el grupo de Telegram si es VÁLIDA)
  const textPayload = `
🚨 **Posible Subvención Detectada**
📍 Fuente: ${source}
🏷 Título: ${grantData.titulo || 'Sin título'}
💡 Motivo del Match: ${matchReason}
🔗 Enlace: ${grantData.url || grantData.urlDetalle || 'No disponible'}
  `.trim();

  // 2. ID ESTABLE (Buscamos la propiedad correcta según el origen del scraper)
  const uniqueId = grantData.identificador || grantData.codigoBDNS || grantData.id || Date.now().toString();

  // 3. EL NUEVO PAYLOAD EXACTO PARA OPENCLAW (id, text, rawJson)
  const payloadBody = { 
    id: uniqueId,
    text: textPayload,
    rawJson: JSON.stringify(grantData) // 👈 El agente usará esto en la sombra para evaluar y crear carpetas
  };

  console.log("\n=== 🚀 ENVIANDO DATOS A OPENCLAW ===");
  console.log("URL Destino:", webhookUrl);
  console.log("ID Único:", uniqueId);
  console.log("Token detectado en ENV:", token ? "SÍ ✅" : "NO ❌");
  console.log("======================================\n");

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}` 
      },
      body: JSON.stringify(payloadBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Error devuelto por OpenClaw (Status: ${response.status}):`, errorText);
      return; 
    }

    const result = await response.json();
    console.log("✅ Notificación recibida con éxito por OpenClaw:", result);

  } catch (error) {
    console.error("❌ Error crítico de red notificando al agente:", error);
  }
}