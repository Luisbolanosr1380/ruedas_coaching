// API: GET /api/rueda?token=XXX
// Devuelve los datos de la rueda y su configuración para que el front la renderice

export default async function handler(req, res) {
  const { token } = req.query;

  if (!token) {
    return res.status(400).json({ error: "Falta el token" });
  }

  const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
  const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;

  if (!AIRTABLE_TOKEN || !AIRTABLE_BASE_ID) {
    return res.status(500).json({ error: "Configuración del servidor incompleta" });
  }

  const headers = {
    "Authorization": `Bearer ${AIRTABLE_TOKEN}`,
    "Content-Type": "application/json"
  };

  try {
    // 1. Buscar la Rueda por su token
    const filterFormula = encodeURIComponent(`{Token de acceso}="${token}"`);
    const ruedaUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Ruedas?filterByFormula=${filterFormula}&maxRecords=1`;

    const ruedaResp = await fetch(ruedaUrl, { headers });
    if (!ruedaResp.ok) {
      const errText = await ruedaResp.text();
      console.error("Error consultando Ruedas:", errText);
      return res.status(500).json({ error: "Error consultando la rueda" });
    }
    const ruedaData = await ruedaResp.json();

    if (!ruedaData.records || ruedaData.records.length === 0) {
      return res.status(404).json({ error: "Rueda no encontrada o link inválido" });
    }

    const rueda = ruedaData.records[0];
    const tipoRueda = rueda.fields["Tipo de rueda"];

    // Si ya fue completada, mostrarlo
    if (rueda.fields["Estado"] === "Completada") {
      return res.status(200).json({
        completada: true,
        mensaje: "Esta rueda ya fue completada. Si necesitas hacer cambios, contacta a tu coach."
      });
    }

    // 2. Buscar la configuración del tipo de rueda
    const configFilter = encodeURIComponent(`{Tipo de rueda}="${tipoRueda}"`);
    const configUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent("Configuración de Ruedas")}?filterByFormula=${configFilter}&maxRecords=1`;

    const configResp = await fetch(configUrl, { headers });
    if (!configResp.ok) {
      const errText = await configResp.text();
      console.error("Error consultando Configuración:", errText);
      return res.status(500).json({ error: "Error consultando la configuración" });
    }
    const configData = await configResp.json();

    if (!configData.records || configData.records.length === 0) {
      return res.status(404).json({ error: `No hay configuración para el tipo "${tipoRueda}"` });
    }

    const config = configData.records[0].fields;

    // 3. Armar el listado de segmentos a renderizar
    const numSegmentos = config["Número de segmentos"] || 0;
    const segmentos = [];
    for (let i = 1; i <= numSegmentos; i++) {
      const key = `Segmento_${String(i).padStart(2, "0")}_nombre`;
      const nombre = config[key];
      if (nombre) {
        segmentos.push({ indice: i, nombre });
      }
    }

    // 4. Obtener el nombre del cliente (campo enlazado)
    let nombreCliente = "";
    if (rueda.fields["Cliente"] && rueda.fields["Cliente"][0]) {
      const clienteUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Clientes/${rueda.fields["Cliente"][0]}`;
      const clienteResp = await fetch(clienteUrl, { headers });
      if (clienteResp.ok) {
        const clienteData = await clienteResp.json();
        nombreCliente = clienteData.fields["Nombre completo"] || "";
      }
    }

    // 5. Responder con todo lo necesario para el front
    return res.status(200).json({
      ruedaId: rueda.id,
      tipoRueda,
      nombreCliente,
      descripcion: config["Descripción introductoria"] || "",
      colorPrincipal: config["Color principal"] || "#1D9E75",
      escalaInvertida: !!config["Escala invertida"],
      segmentos
    });
  } catch (err) {
    console.error("Error inesperado:", err);
    return res.status(500).json({ error: "Error inesperado del servidor" });
  }
}
