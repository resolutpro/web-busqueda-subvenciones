export async function notifyAgentOfMatch(source: string, grantData: any, matchReason: string) {
  const webhookUrl = "http://178.104.134.24:18789/hooks-privado-88xqz/subvenciones";
  const token = process.env.OPENCLAW_HOOKS_TOKEN;

  const textPayload = `
URL/Fuente: ${source}
Motivo: ${matchReason}
Datos: ${JSON.stringify(grantData, null, 2)}
  `.trim();

  // Guardamos el body en una variable para poder imprimirlo por consola
  const payloadBody = { 
    id: grantData.codigoBDNS || Date.now().toString(),
    text: textPayload
  };

  // 👇 --- NUEVOS LOGS PARA VER QUÉ SE ESTÁ ENVIANDO EXACTAMENTE --- 👇
  console.log("\n=== 🚀 ENVIANDO DATOS A OPENCLAW ===");
  console.log("URL Destino:", webhookUrl);
  console.log("Token detectado en ENV:", token ? "SÍ ✅" : "NO ❌");
  console.log("Cuerpo del mensaje (Payload):", JSON.stringify(payloadBody, null, 2));
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

    // Comprobamos si OpenClaw nos da un error (ej. 404 Not Found)
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Error devuelto por OpenClaw (Status: ${response.status}):`, errorText);
      return; // Salimos para no intentar hacer JSON.parse de un error
    }

    const result = await response.json();
    console.log("✅ Notificación recibida con éxito por OpenClaw:", result);

  } catch (error) {
    console.error("❌ Error crítico de red notificando al agente:", error);
  }
}