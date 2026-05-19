// API: POST /api/enviar
// Recibe las respuestas del cliente y actualiza el registro en Airtable

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método no permitido" });
  }

  const { ruedaId, segmentos, reflexiones } = req.body || {};

  if (!ruedaId || !segmentos) {
    return res.status(400).json({ error: "Faltan datos" });
  }

  const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
  const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;

  if (!AIRTABLE_TOKEN || !AIRTABLE_BASE_ID) {
    return res.status(500).json({ error: "Configuración del servidor incompleta" });
  }

  // Armar el objeto fields para Airtable
  const fields = {};
  for (let i = 1; i <= 13; i++) {
    const key = `Segmento_${String(i).padStart(2, "0")}`;
    if (segmentos[i] !== undefined && segmentos[i] !== null) {
      fields[key] = Number(segmentos[i]);
    }
  }

  if (reflexiones) {
    if (reflexiones.r1) fields["Reflexión_1_Sentimiento"] = reflexiones.r1;
    if (reflexiones.r2) fields["Reflexión_2_Equilibrio"] = reflexiones.r2;
    if (reflexiones.r3) fields["Reflexión_3_Cambios"] = reflexiones.r3;
    if (reflexiones.r4) fields["Reflexión_4_Consecuencias"] = reflexiones.r4;
    if (reflexiones.r5) fields["Reflexión_5_Impacto"] = reflexiones.r5;
  }

  fields["Estado"] = "Completada";

  try {
    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Ruedas/${ruedaId}`;
    const resp = await fetch(url, {
      method: "PATCH",
      headers: {
        "Authorization": `Bearer ${AIRTABLE_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ fields })
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error("Error actualizando Airtable:", errText);
      return res.status(500).json({ error: "Error guardando los datos" });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Error inesperado:", err);
    return res.status(500).json({ error: "Error inesperado del servidor" });
  }
}
