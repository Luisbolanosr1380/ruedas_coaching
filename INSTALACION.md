# Ruedas de Coaching — Guía de instalación

## Estructura del proyecto

```
ruedas-app/
├── api/
│   ├── rueda.js       ← API: lee una rueda desde Airtable
│   └── enviar.js      ← API: guarda las respuestas del cliente
├── public/
│   └── index.html     ← La interfaz que ve el cliente (todo en un archivo)
├── package.json
└── vercel.json        ← Config para que las URLs queden bonitas
```

## Pasos para ponerlo en línea

### 1. Subir el código a GitHub

1. Crea un repositorio nuevo en GitHub (puede ser privado), llámalo `ruedas-coaching`.
2. Sube los 5 archivos (con la misma estructura de carpetas de arriba).

### 2. Conectarlo a Vercel

1. Entra a https://vercel.com → **Add New** → **Project**.
2. Importa el repositorio `ruedas-coaching`.
3. En las opciones de configuración, NO toques nada del framework — Vercel detecta automáticamente que es un proyecto estático con APIs.
4. Antes de hacer click en **Deploy**, expande **Environment Variables** y agrega las tres del paso siguiente.

### 3. Configurar las 3 variables de entorno

Estas son las llaves que conectan la app con Airtable. Sin ellas no funciona.

| Variable | Cómo obtenerla |
|---|---|
| `AIRTABLE_TOKEN` | Ver paso 4 |
| `AIRTABLE_BASE_ID` | Ver paso 5 |

### 4. Generar el AIRTABLE_TOKEN

1. Entra a https://airtable.com/create/tokens
2. Click en **Create new token**.
3. Nombre: `Ruedas de Coaching App`
4. Scopes (marca los dos):
   - `data.records:read`
   - `data.records:write`
5. Access: agrega la base que creaste para las ruedas.
6. Click **Create token** y **copia el valor inmediatamente** (no lo vuelves a ver).
7. Pégalo como valor de `AIRTABLE_TOKEN` en Vercel.

### 5. Obtener el AIRTABLE_BASE_ID

1. Abre tu base de Airtable.
2. Click en **Help** (arriba a la derecha) → **API documentation**.
3. La URL en el navegador tiene este formato: `https://airtable.com/appXXXXXXXXXXXXXX/api/docs`
4. El `appXXXXXXXXXXXXXX` (empieza con "app") es tu Base ID.
5. Pégalo como valor de `AIRTABLE_BASE_ID` en Vercel.

### 6. Deploy

Click en **Deploy**. En 1-2 minutos Vercel te da una URL del tipo `https://ruedas-coaching-xxx.vercel.app`.

## Cómo usarlo con un cliente

1. En Airtable, en la tabla **Ruedas**, crea un registro nuevo:
   - Selecciona el Cliente
   - Selecciona el Tipo de rueda (Vida o Estrés)
   - Estado: "Pendiente envío"
2. Airtable autogenera el campo **Token de acceso** y **URL del formulario**.
3. Copia esa URL (debería verse algo como `https://ruedas-coaching-xxx.vercel.app/rueda/recXXX-12345`).
4. Envíasela al cliente por correo o WhatsApp.
5. Cuando el cliente la llene, los datos aparecen automáticamente en el registro.

## Notas técnicas importantes

- El campo "URL del formulario" en Airtable debe construirse con tu dominio de Vercel real. La fórmula que pusiste como ejemplo (`https://tu-dominio.com/rueda/...`) hay que cambiarla a `https://TU-DOMINIO-REAL.vercel.app/rueda/...`.
- El token NO está expuesto en el navegador. Toda la comunicación con Airtable pasa por las funciones de Vercel (`/api/rueda` y `/api/enviar`).
- Si después conectas un dominio propio, solo actualizas la fórmula en Airtable.
