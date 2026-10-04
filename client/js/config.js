// URL base del backend.
// - En local (localhost / 127.0.0.1) usa el servidor PHP en el puerto 8000.
// - En producción usa la URL del servicio "homi-api" en Render.
//   >>> Si Render te asigna otra URL, cámbiala SOLO aquí. <<<
const RENDER_API_URL = "https://homi-api-2ftq.onrender.com";

const isLocal = ["localhost", "127.0.0.1", ""].includes(location.hostname);

export const API_BASE = isLocal ? "http://localhost:8000" : RENDER_API_URL;
