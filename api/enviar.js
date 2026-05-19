// API: POST /api/enviar
// 1. Guarda las respuestas en Airtable
// 2. Genera un PDF profesional con la rueda completa
// 3. Adjunta el PDF al registro como archivo (campo "PDF Rueda")

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
  const PDF_API_KEY = process.env.PDF_API_KEY;

  if (!AIRTABLE_TOKEN || !AIRTABLE_BASE_ID) {
    return res.status(500).json({ error: "Configuración del servidor incompleta" });
  }

  const airtableHeaders = {
    "Authorization": `Bearer ${AIRTABLE_TOKEN}`,
    "Content-Type": "application/json"
  };

  // ============ PASO 1: Guardar respuestas en Airtable ============
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
    const updateUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Ruedas/${ruedaId}`;
    const resp = await fetch(updateUrl, {
      method: "PATCH",
      headers: airtableHeaders,
      body: JSON.stringify({ fields })
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error("Error actualizando Airtable:", errText);
      return res.status(500).json({ error: "Error guardando los datos" });
    }

    // Le devolvemos OK al cliente INMEDIATAMENTE — la generación del PDF
    // sigue corriendo en background para no hacerlo esperar
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Error guardando:", err);
    return res.status(500).json({ error: "Error inesperado del servidor" });
  }

  // ============ PASO 2: Generar PDF en background ============
  // (solo si PDF_API_KEY está configurada — si no, se omite silenciosamente)
  if (!PDF_API_KEY) {
    console.log("PDF_API_KEY no configurada, omitiendo generación de PDF");
    return;
  }

  try {
    // Re-leer el registro para obtener cliente, tipo de rueda, fecha, etc.
    const ruedaResp = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Ruedas/${ruedaId}`,
      { headers: airtableHeaders }
    );
    const ruedaData = await ruedaResp.json();
    const tipoRueda = ruedaData.fields["Tipo de rueda"];

    // Configuración de la rueda
    const configFilter = encodeURIComponent(`{Tipo de rueda}="${tipoRueda}"`);
    const configResp = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent("Configuración de Ruedas")}?filterByFormula=${configFilter}&maxRecords=1`,
      { headers: airtableHeaders }
    );
    const configData = await configResp.json();
    const config = configData.records[0].fields;

    // Cliente
    let nombreCliente = "Cliente";
    if (ruedaData.fields["Cliente"] && ruedaData.fields["Cliente"][0]) {
      const clienteResp = await fetch(
        `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Clientes/${ruedaData.fields["Cliente"][0]}`,
        { headers: airtableHeaders }
      );
      const clienteData = await clienteResp.json();
      nombreCliente = clienteData.fields["Nombre completo"] || "Cliente";
    }

    // Armar listado de segmentos con sus valores
    const numSegmentos = config["Número de segmentos"] || 0;
    const segmentosCompletos = [];
    for (let i = 1; i <= numSegmentos; i++) {
      const nombreKey = `Segmento_${String(i).padStart(2, "0")}_nombre`;
      const valorKey = `Segmento_${String(i).padStart(2, "0")}`;
      const nombre = config[nombreKey];
      const valor = ruedaData.fields[valorKey];
      if (nombre && valor !== undefined && valor !== null) {
        segmentosCompletos.push({ nombre, valor });
      }
    }

    // Datos para el PDF
    const fechaEnvio = ruedaData.fields["Fecha de envío"]
      ? new Date(ruedaData.fields["Fecha de envío"])
      : new Date();
    const fechaTexto = fechaEnvio.toLocaleDateString("es-GT", {
      day: "numeric", month: "long", year: "numeric"
    });
    const promedio = ruedaData.fields["Promedio"] || "—";
    const segMasBajo = ruedaData.fields["Segmento más bajo"] || "—";
    const segMasAlto = ruedaData.fields["Segmento más alto"] || "—";
    const colorPrincipal = config["Color principal"] || "#1D9E75";
    const escalaInvertida = !!config["Escala invertida"];

    const reflexionesData = {
      r1: ruedaData.fields["Reflexión_1_Sentimiento"] || "",
      r2: ruedaData.fields["Reflexión_2_Equilibrio"] || "",
      r3: ruedaData.fields["Reflexión_3_Cambios"] || "",
      r4: ruedaData.fields["Reflexión_4_Consecuencias"] || "",
      r5: ruedaData.fields["Reflexión_5_Impacto"] || ""
    };

    // Generar HTML del PDF
    const html = generarHtmlPdf({
      nombreCliente,
      tipoRueda,
      fechaTexto,
      segmentos: segmentosCompletos,
      promedio,
      segMasBajo,
      segMasAlto,
      colorPrincipal,
      escalaInvertida,
      reflexiones: reflexionesData
    });

    // Llamar a PDFShift
    const pdfResp = await fetch("https://api.pdfshift.io/v3/convert/pdf", {
      method: "POST",
      headers: {
        "Authorization": "Basic " + Buffer.from("api:" + PDF_API_KEY).toString("base64"),
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        source: html,
        format: "A4",
        margin: "20mm",
        landscape: false
      })
    });

    if (!pdfResp.ok) {
      const err = await pdfResp.text();
      console.error("Error generando PDF:", err);
      return;
    }

    const pdfBuffer = await pdfResp.arrayBuffer();
    const pdfBase64 = Buffer.from(pdfBuffer).toString("base64");

    // Subir el PDF a Airtable como attachment usando el endpoint de upload
    // Necesitamos generar un data URL temporal para que Airtable lo descargue
    const fileName = `Rueda-${tipoRueda}-${nombreCliente.replace(/\s+/g, "_")}-${fechaEnvio.toISOString().slice(0,10)}.pdf`;

    const uploadResp = await fetch(
      `https://content.airtable.com/v0/${AIRTABLE_BASE_ID}/${ruedaId}/PDF%20Rueda/uploadAttachment`,
      {
        method: "POST",
        headers: airtableHeaders,
        body: JSON.stringify({
          contentType: "application/pdf",
          file: pdfBase64,
          filename: fileName
        })
      }
    );

    if (!uploadResp.ok) {
      const err = await uploadResp.text();
      console.error("Error subiendo PDF a Airtable:", err);
    } else {
      console.log("PDF adjuntado correctamente:", fileName);
    }
  } catch (err) {
    console.error("Error en generación de PDF:", err);
  }
}

// ============ HTML del PDF ============
function generarHtmlPdf(data) {
  const {
    nombreCliente, tipoRueda, fechaTexto, segmentos,
    promedio, segMasBajo, segMasAlto, colorPrincipal, escalaInvertida,
    reflexiones
  } = data;

  // Calcular puntos del radar SVG
  const n = segmentos.length;
  const cx = 250, cy = 250, maxR = 170;

  const dataPts = segmentos.map((s, i) => {
    const a = (Math.PI * 2 * i) / n - Math.PI / 2;
    const r = (s.valor / 10) * maxR;
    return [
      (cx + Math.cos(a) * r).toFixed(1),
      (cy + Math.sin(a) * r).toFixed(1)
    ];
  });

  let svgRings = "";
  [2, 4, 6, 8, 10].forEach(level => {
    const r = (level / 10) * maxR;
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = (Math.PI * 2 * i) / n - Math.PI / 2;
      pts.push((cx + Math.cos(a) * r).toFixed(1) + "," + (cy + Math.sin(a) * r).toFixed(1));
    }
    const opacity = level === 10 ? 0.3 : 0.12;
    svgRings += `<polygon points="${pts.join(' ')}" fill="none" stroke="#000" stroke-opacity="${opacity}" stroke-width="0.6" />`;
  });

  let svgAxes = "";
  for (let i = 0; i < n; i++) {
    const a = (Math.PI * 2 * i) / n - Math.PI / 2;
    svgAxes += `<line x1="${cx}" y1="${cy}" x2="${(cx + Math.cos(a) * maxR).toFixed(1)}" y2="${(cy + Math.sin(a) * maxR).toFixed(1)}" stroke="#000" stroke-opacity="0.1" stroke-width="0.6" />`;
  }

  let svgLabels = "";
  for (let i = 0; i < n; i++) {
    const a = (Math.PI * 2 * i) / n - Math.PI / 2;
    const lr = maxR + 32;
    const x = cx + Math.cos(a) * lr;
    const y = cy + Math.sin(a) * lr;
    const anchor = Math.abs(Math.cos(a)) < 0.25 ? "middle" : Math.cos(a) > 0 ? "start" : "end";
    const words = segmentos[i].nombre.split(' ');
    let line1, line2 = '';
    if (words.length <= 2) {
      line1 = segmentos[i].nombre;
    } else {
      const mid = Math.ceil(words.length / 2);
      line1 = words.slice(0, mid).join(' ');
      line2 = words.slice(mid).join(' ');
    }
    svgLabels += `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="${anchor}" font-size="12" font-weight="600" fill="#1A1A1A" font-family="Helvetica, Arial, sans-serif">
      <tspan x="${x.toFixed(1)}" dy="0">${escapeHtml(line1)}</tspan>
      ${line2 ? `<tspan x="${x.toFixed(1)}" dy="14" font-weight="500" fill="#595959">${escapeHtml(line2)}</tspan>` : ''}
    </text>
    <text x="${(cx + Math.cos(a) * (maxR + 14)).toFixed(1)}" y="${(cy + Math.sin(a) * (maxR + 14)).toFixed(1)}" text-anchor="middle" font-size="10" fill="${colorPrincipal}" font-weight="700" font-family="Helvetica, Arial, sans-serif" dominant-baseline="middle">${segmentos[i].valor}</text>`;
  }

  const polygonData = `<polygon points="${dataPts.map(p => p.join(',')).join(' ')}" fill="${colorPrincipal}" fill-opacity="0.2" stroke="${colorPrincipal}" stroke-width="2.5" stroke-linejoin="round" />`;
  const polygonDots = dataPts.map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="4" fill="${colorPrincipal}" stroke="#fff" stroke-width="1.5" />`).join("");

  const filaPuntuacion = (s) => `
    <tr>
      <td style="padding: 10px 14px; border-bottom: 1px solid #EAEAE5; font-size: 13px;">${escapeHtml(s.nombre)}</td>
      <td style="padding: 10px 14px; border-bottom: 1px solid #EAEAE5; text-align: right;">
        <span style="display: inline-block; background: ${hexToRgba(colorPrincipal, 0.12)}; color: ${colorPrincipal}; font-weight: 700; padding: 4px 12px; border-radius: 100px; font-size: 13px; min-width: 28px;">${s.valor}</span>
      </td>
    </tr>`;

  const bloqueReflexion = (titulo, contenido) => {
    if (!contenido || !contenido.trim()) return "";
    return `
      <div style="margin-bottom: 18px; page-break-inside: avoid;">
        <p style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.6px; color: #8A8A8A; margin: 0 0 6px; font-weight: 600;">${escapeHtml(titulo)}</p>
        <p style="font-size: 13px; color: #1A1A1A; margin: 0; line-height: 1.65; background: #FAFAF7; padding: 12px 14px; border-radius: 8px; border-left: 3px solid ${colorPrincipal};">${escapeHtml(contenido).replace(/\n/g, '<br>')}</p>
      </div>`;
  };

  const notaEscala = escalaInvertida
    ? `<p style="font-size: 11px; color: #8A8A8A; margin: 8px 0 0; font-style: italic;">Nota: en la Rueda del Estrés, una puntuación alta indica mayor nivel de estrés en esa área.</p>`
    : "";

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Rueda de ${escapeHtml(tipoRueda)} - ${escapeHtml(nombreCliente)}</title>
<style>
  @page { size: A4; margin: 18mm; }
  * { box-sizing: border-box; }
  body {
    font-family: Helvetica, Arial, sans-serif;
    color: #1A1A1A;
    margin: 0;
    padding: 0;
    line-height: 1.5;
  }
  .header {
    border-bottom: 3px solid ${colorPrincipal};
    padding-bottom: 20px;
    margin-bottom: 30px;
  }
  .header .badge {
    display: inline-block;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 1px;
    text-transform: uppercase;
    color: ${colorPrincipal};
    background: ${hexToRgba(colorPrincipal, 0.12)};
    padding: 5px 12px;
    border-radius: 100px;
    margin-bottom: 12px;
  }
  .header h1 { font-size: 28px; font-weight: 700; margin: 0 0 6px; letter-spacing: -0.01em; }
  .header .meta { font-size: 13px; color: #595959; margin: 0; }
  .meta strong { color: #1A1A1A; font-weight: 600; }

  .stats {
    display: flex;
    gap: 12px;
    margin-bottom: 24px;
  }
  .stat {
    flex: 1;
    background: #FAFAF7;
    border-radius: 10px;
    padding: 14px;
    text-align: center;
  }
  .stat-label {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.6px;
    color: #8A8A8A;
    margin-bottom: 4px;
    font-weight: 600;
  }
  .stat-value {
    font-size: 18px;
    font-weight: 700;
    color: #1A1A1A;
  }
  .stat-value.small { font-size: 13px; line-height: 1.3; }

  .seccion {
    margin-bottom: 28px;
    page-break-inside: avoid;
  }
  .seccion-titulo {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    color: ${colorPrincipal};
    font-weight: 700;
    margin: 0 0 14px;
    padding-bottom: 6px;
    border-bottom: 1px solid #EAEAE5;
  }

  .radar-container {
    text-align: center;
    background: #FAFAF7;
    border-radius: 12px;
    padding: 12px;
  }
  svg { display: block; margin: 0 auto; max-width: 100%; height: auto; }

  table.puntuaciones {
    width: 100%;
    border-collapse: collapse;
    background: #FFFFFF;
  }

  .footer {
    margin-top: 40px;
    padding-top: 16px;
    border-top: 1px solid #EAEAE5;
    font-size: 10px;
    color: #8A8A8A;
    text-align: center;
  }
</style>
</head>
<body>

<div class="header">
  <span class="badge">Rueda de ${escapeHtml(tipoRueda)}</span>
  <h1>${escapeHtml(nombreCliente)}</h1>
  <p class="meta">Fecha de la evaluación: <strong>${escapeHtml(fechaTexto)}</strong></p>
</div>

<div class="stats">
  <div class="stat">
    <div class="stat-label">Promedio general</div>
    <div class="stat-value">${promedio}</div>
  </div>
  <div class="stat">
    <div class="stat-label">${escalaInvertida ? 'Más estresante' : 'Más baja'}</div>
    <div class="stat-value small">${escapeHtml(String(segMasBajo))}</div>
  </div>
  <div class="stat">
    <div class="stat-label">${escalaInvertida ? 'Menos estresante' : 'Más alta'}</div>
    <div class="stat-value small">${escapeHtml(String(segMasAlto))}</div>
  </div>
</div>

<div class="seccion">
  <h2 class="seccion-titulo">Visualización de la rueda</h2>
  <div class="radar-container">
    <svg viewBox="0 0 500 500" width="420" height="420">
      ${svgRings}
      ${svgAxes}
      ${polygonData}
      ${polygonDots}
      ${svgLabels}
    </svg>
  </div>
  ${notaEscala}
</div>

<div class="seccion" style="page-break-before: auto;">
  <h2 class="seccion-titulo">Puntuaciones detalladas</h2>
  <table class="puntuaciones">
    ${segmentos.map(filaPuntuacion).join("")}
  </table>
</div>

<div class="seccion" style="page-break-before: always;">
  <h2 class="seccion-titulo">Reflexiones del cliente</h2>
  ${bloqueReflexion("¿Cómo te sientes acerca de tus resultados?", reflexiones.r1)}
  ${bloqueReflexion("¿Tu rueda está bien equilibrada o desequilibrada?", reflexiones.r2)}
  ${bloqueReflexion("¿Qué hábitos o rutinas podrías cambiar para mejorar tus resultados?", reflexiones.r3)}
  ${bloqueReflexion("Si no cambias nada, ¿cuáles son las consecuencias a largo plazo?", reflexiones.r4)}
  ${bloqueReflexion("¿Cómo repercutirían positivamente estos cambios en tu vida, a corto y largo plazo?", reflexiones.r5)}
</div>

<div class="footer">
  Documento generado automáticamente • Material de coaching confidencial
</div>

</body>
</html>`;
}

function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function hexToRgba(hex, alpha) {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
