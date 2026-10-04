import { inventoryData, cargarEquipos, cargarUCIS } from "./data.js";
import { API_BASE } from "./config.js";

let equiposDATA = await cargarEquipos();
const ucisDATA = await cargarUCIS();

const RAW_DATA = inventoryData;

const TODAY = new Date();
TODAY.setHours(0, 0, 0, 0);

const UCI_LIST = ucisDATA.map((uci) => uci.nombre);

const UCI_META = {};

ucisDATA.forEach((uci) => {
  const palabras = uci.nombre.trim().split(/\s+/);
  const shortName = palabras[1] || uci.nombre;

  UCI_META[uci.nombre] = {
    short: shortName,
    icon: "siren",
  };
});

const ALERT_WINDOW_DAYS = 30;

function parseDate(str) {
  if (!str) return null;
  const d = new Date(str + "T00:00:00");
  return isNaN(d.getTime()) ? null : d;
}
function daysBetween(date) {
  if (!date) return null;
  return Math.round((date.getTime() - TODAY.getTime()) / 86400000);
}
function fmtDateHuman(str) {
  if (str === "FUERA DE SERVICIO") return "Fuera de servicio";
  const d = parseDate(str);
  if (!d) return "No aplica";
  return d.toLocaleDateString("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
function fmtDateShort(str) {
  const d = parseDate(str);
  if (!d) return "—";
  return {
    day: d.toLocaleDateString("es-CO", { day: "2-digit" }),
    mon: d.toLocaleDateString("es-CO", { month: "short" }).replace(".", ""),
  };
}

function statusForDate(dateStr) {
  const d = parseDate(dateStr);
  if (!d) return { status: "na", days: null };
  const days = daysBetween(d);
  if (days < 0) return { status: "rojo", days };
  if (days <= ALERT_WINDOW_DAYS) return { status: "amarillo", days };
  return { status: "verde", days };
}

const STATUS_RANK = { rojo: 3, amarillo: 2, verde: 1, fuera: 0, na: 0 };
function isFueraDeServicio(item) {
  return (
    item.mttoProximo === "FUERA DE SERVICIO" ||
    item.proximaCalibracion === "FUERA DE SERVICIO" ||
    item.mttoRealizado === "FUERA DE SERVICIO" ||
    item.calibracion === "FUERA DE SERVICIO" ||
    item.frecuenciaMtto === "FUERA DE SERVICIO"
  );
}
function overallStatus(item) {
  if (isFueraDeServicio(item))
    return { status: "fuera", days: null, kind: "fuera" };
  const mtto = statusForDate(item.mttoProximo);
  const cal = statusForDate(item.proximaCalibracion);
  const worst =
    STATUS_RANK[mtto.status] >= STATUS_RANK[cal.status] ? mtto : cal;

  if (mtto.status === "na" && cal.status !== "na")
    return { ...cal, kind: "calibracion" };
  if (cal.status === "na" && mtto.status !== "na")
    return { ...mtto, kind: "mantenimiento" };
  if (mtto.status === "na" && cal.status === "na")
    return { status: "na", days: null, kind: "ninguno" };
  return {
    ...worst,
    kind: worst === mtto ? "mantenimiento" : "calibracion",
  };
}
function internalCode(item) {
  if (
    item.placa &&
    item.placa !== "NO REGISTRA" &&
    item.placa !== "NO REGISTRA "
  )
    return String(item.placa);
  if (item.serie) return String(item.serie);
  return "S/N-" + item.id;
}

function responsableMtto(item) {
  const tieneMtto =
    parseDate(item.mttoProximo) || parseDate(item.mttoRealizado);
  if (!tieneMtto) return "No aplica";
  const marca = (item.marca || "").toUpperCase();
  return marca.includes("DRAGER") || marca.includes("DRÄGER")
    ? "Dräger"
    : "Ingeniería Biomédica";
}

function responsableCal(item) {
  const tieneCal =
    parseDate(item.proximaCalibracion) || parseDate(item.calibracion);
  return tieneCal ? "Celsius" : "No aplica";
}

const OVERRIDES_KEY = "homi_overrides_v1";
const NEW_ITEMS_KEY = "homi_new_items_v1";
const FB_CONFIG_KEY = "homi_firebase_config_v1";
const FB_PATH = "homi_ucis_dashboard";

function loadOverrides() {
  try {
    return JSON.parse(localStorage.getItem(OVERRIDES_KEY) || "{}");
  } catch (e) {
    return {};
  }
}

let OVERRIDES = loadOverrides();

function loadNewItems() {
  try {
    return JSON.parse(localStorage.getItem(NEW_ITEMS_KEY) || "[]");
  } catch (e) {
    return [];
  }
}

let NEW_ITEMS = loadNewItems();

/* ========== Sincronización multi-computador (Firebase Realtime Database) ========== */
let fbApp = null;
let fbDb = null;
let fbRef = null;
let fbListenerAttached = false;
let syncApplyingRemote = false;
let lastRemoteStamp = 0;

const FIREBASE_CONFIG = null;

function loadFirebaseConfig() {
  try {
    return JSON.parse(localStorage.getItem(FB_CONFIG_KEY) || "null");
  } catch (e) {
    return null;
  }
}
function saveFirebaseConfig(cfg) {
  try {
    if (cfg) localStorage.setItem(FB_CONFIG_KEY, JSON.stringify(cfg));
    else localStorage.removeItem(FB_CONFIG_KEY);
  } catch (e) {}
}

function setSyncUI(state, label) {
  const chip = document.getElementById("syncChip");
  const lbl = document.getElementById("syncLabel");
  if (!chip || !lbl) return;
  chip.classList.remove("online", "syncing", "error");
  if (state) chip.classList.add(state);
  lbl.textContent = label;
}

function showSyncToast(msg) {
  const t = document.getElementById("syncToast");
  if (!t) return;
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(showSyncToast._timer);
  showSyncToast._timer = setTimeout(() => t.classList.remove("show"), 3200);
}

function pushToCloud() {
  if (!fbRef || syncApplyingRemote) return;
  const payload = {
    overrides: OVERRIDES,
    newItems: NEW_ITEMS,
    updatedAt: Date.now(),
    updatedBy:
      typeof navigator !== "undefined" && navigator.userAgent
        ? navigator.userAgent.slice(0, 80)
        : "unknown",
  };

  lastRemoteStamp = payload.updatedAt;
  setSyncUI("syncing", "Sincronizando…");
  fbRef
    .set(payload)
    .then(() => {
      setSyncUI("online", "En línea");
    })
    .catch((err) => {
      console.error("Error subiendo a Firebase", err);
      setSyncUI("error", "Error sync");
      showSyncToast("No se pudo sincronizar: " + (err.message || err));
    });
}

function applyRemotePayload(payload) {
  if (!payload || typeof payload !== "object") return;
  const stamp = payload.updatedAt || 0;
  if (stamp && stamp === lastRemoteStamp) return;
  lastRemoteStamp = stamp;
  syncApplyingRemote = true;
  try {
    OVERRIDES =
      payload.overrides && typeof payload.overrides === "object"
        ? payload.overrides
        : {};
    NEW_ITEMS = Array.isArray(payload.newItems) ? payload.newItems : [];

    saveOverridesToStorage(OVERRIDES);
    saveNewItemsToStorage(NEW_ITEMS);
    DATA = buildData();
    renderAll();
    showSyncToast("Inventario actualizado desde otro computador");
  } finally {
    syncApplyingRemote = false;
  }
}

function connectFirebase(config) {
  console.log("Conectando a Firebase con config", config);
  if (!config || !config.apiKey || !config.databaseURL) {
    throw new Error("Falta apiKey o databaseURL en la configuración");
  }

  disconnectFirebase(false);
  if (!firebase.apps.length) {
    fbApp = firebase.initializeApp(config);
  } else {
    fbApp = firebase.app();
  }
  fbDb = firebase.database();
  fbRef = fbDb.ref(FB_PATH);
  setSyncUI("syncing", "Conectando…");

  fbRef.on(
    "value",
    (snap) => {
      const val = snap.val();
      if (val === null) {
        pushToCloud();
        setSyncUI("online", "En línea");
        return;
      }

      const remoteStamp = val.updatedAt || 0;
      if (remoteStamp !== lastRemoteStamp) {
        applyRemotePayload(val);
      }
      setSyncUI("online", "En línea");
    },
    (err) => {
      console.error("Firebase listener error", err);
      setSyncUI("error", "Error sync");
      showSyncToast("Error de sincronización: " + (err.message || err));
    },
  );
  fbListenerAttached = true;
  saveFirebaseConfig(config);
}

function disconnectFirebase(clearConfig) {
  if (fbRef && fbListenerAttached) {
    try {
      fbRef.off();
    } catch (e) {}
  }
  fbRef = null;
  fbDb = null;
  fbListenerAttached = false;
  lastRemoteStamp = 0;
  if (clearConfig) saveFirebaseConfig(null);
  setSyncUI("", "Local");
}

function saveOverridesToStorage(ov) {
  try {
    localStorage.setItem(OVERRIDES_KEY, JSON.stringify(ov));
  } catch (e) {
    console.warn("No se pudo guardar en localStorage", e);
  }
  pushToCloud();
}
function saveNewItemsToStorage(items) {
  try {
    localStorage.setItem(NEW_ITEMS_KEY, JSON.stringify(items));
  } catch (e) {
    console.warn("No se pudo guardar en localStorage", e);
  }
  pushToCloud();
}

function openSyncModal() {}
function closeSyncModal() {}

(function initSyncUI() {
  function bind() {
    const chip = document.getElementById("syncChip");
    if (chip) chip.addEventListener("click", openSyncModal);
    const closeBtn = document.getElementById("syncModalClose");
    if (closeBtn) closeBtn.addEventListener("click", closeSyncModal);
    const overlay = document.getElementById("syncOverlay");
    if (overlay) overlay.addEventListener("click", closeSyncModal);

    const connectBtn = document.getElementById("syncConnectBtn");
    if (connectBtn)
      connectBtn.addEventListener("click", () => {
        const raw = (
          document.getElementById("firebaseConfigInput").value || ""
        ).trim();
        if (!raw) {
          document.getElementById("syncStatusMsg").textContent =
            "Pega la configuración de Firebase primero.";
          return;
        }
        try {
          const cfg = JSON.parse(raw);
          connectFirebase(cfg);
          document.getElementById("syncStatusMsg").textContent =
            "Conectado. Los cambios se compartirán con los demás computadores.";
          showSyncToast("Sincronización activada");
          setTimeout(closeSyncModal, 800);
        } catch (err) {
          document.getElementById("syncStatusMsg").textContent =
            "JSON inválido: " + err.message;
          setSyncUI("error", "Error config");
        }
      });

    const discBtn = document.getElementById("syncDisconnectBtn");
    if (discBtn)
      discBtn.addEventListener("click", () => {
        disconnectFirebase(true);
        document.getElementById("syncStatusMsg").textContent =
          "Desconectado. Solo se guarda en este computador.";
        showSyncToast("Modo local activado");
      });

    const saved =
      typeof FIREBASE_CONFIG !== "undefined" &&
      FIREBASE_CONFIG &&
      FIREBASE_CONFIG.apiKey
        ? FIREBASE_CONFIG
        : loadFirebaseConfig();
    if (saved && saved.apiKey && saved.databaseURL) {
      try {
        connectFirebase(saved);
      } catch (err) {
        console.warn("No se pudo auto-conectar Firebase", err);
      }
    }
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind);
  } else {
    bind();
  }
})();

// function buildData() {
//   const combined = [...RAW_DATA, ...NEW_ITEMS];
//   console.log(combined);
//   return combined.map((raw) => {
//     const item = { ...raw, ...(OVERRIDES[raw.id] || {}) };
//     const mtto = statusForDate(item.mttoProximo);
//     const cal = statusForDate(item.proximaCalibracion);
//     const overall = overallStatus(item);
//     return {
//       ...item,
//       _mtto: mtto,
//       _cal: cal,
//       _overall: overall,
//       _code: internalCode(item),
//     };
//   });
// }

// Función para obtener y procesar toda la información desde el Backend
async function buildData() {
  try {
    // 1. Consultar la API principal de equipos
    const response = await fetch(`${API_BASE}/equipos/all`);

    if (!response.ok) {
      throw new Error(`Error al obtener equipos: ${response.statusText}`);
    }

    const equiposMTC = await response.json();

    // 2. Mapear la información para agregar las propiedades calculadas
    return equiposMTC.map((raw) => {
      // Adaptamos los nombres de la API a los que usa la interfaz
      const item = {
        ...raw,
        ubicacion: raw.uci, // SERVICIO = nombre de la UCI
        modulo: raw.ubicacion || "", // UBICACIÓN = ubicación específica
        registroInvima: raw.registro_invima || "",
        clasificacionInvima: raw.clasificacion_invima || "",
        codigoCalibracion: raw.certificado_calibracion || "",
        frecuenciaMtto: raw.frecuencia || "",
      };

      // Fuera de servicio: la interfaz lo representa con ese texto en las fechas;
      // se conservan las fechas reales en _orig para poder editarlas.
      if (String(raw.fuera_servicio) === "1") {
        item._orig = {
          mttoRealizado: item.mttoRealizado,
          mttoProximo: item.mttoProximo,
          frecuenciaMtto: item.frecuenciaMtto,
          calibracion: item.calibracion,
          proximaCalibracion: item.proximaCalibracion,
        };
        item.mttoRealizado = "FUERA DE SERVICIO";
        item.mttoProximo = "FUERA DE SERVICIO";
        item.frecuenciaMtto = "FUERA DE SERVICIO";
        item.calibracion = "FUERA DE SERVICIO";
        item.proximaCalibracion = "FUERA DE SERVICIO";
      }

      // Extraemos o calculamos los estados basados en las respuestas del servidor
      const mtto = statusForDate(item.mttoProximo);
      const cal = statusForDate(item.proximaCalibracion);
      const overall = overallStatus(item);

      return {
        ...item,
        // Mantienes la misma interfaz con guion bajo que ya usa tu vista/UI
        _mtto: mtto,
        _cal: cal,
        _overall: overall,
        _code: internalCode(item),
      };
    });
  } catch (error) {
    console.error("Error cargando los datos desde la BD:", error);
    return [];
  }
}

// Ejemplo de uso para recargar la UI:
async function reloadApp() {
  const DATA = await buildDataFromDatabase();
  renderAll(DATA); // O tu función encargada de pintar en pantalla
}

let DATA = await buildData();

const STATUS_COLOR = {
  rojo: "var(--crit-500)",
  amarillo: "var(--warn-500)",
  verde: "var(--ok-500)",
  fuera: "var(--off-500)",
  na: "var(--na-500)",
};
const STATUS_LABEL = {
  rojo: "Vencido",
  amarillo: "Próximo",
  verde: "Ejecutado",
  fuera: "Fuera de servicio",
  na: "No aplica",
};

const ICONS = {
  baby: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8"><circle cx="12" cy="8" r="4"/><path d="M8 14c-2.5 1-4 3-4 5.5V21h16v-1.5c0-2.5-1.5-4.5-4-5.5"/><path d="M9.5 8.5c0 1 1 2 2.5 2s2.5-1 2.5-2"/></svg>',
  flame:
    '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8"><path d="M12 2c1 3-2 4-2 7a4 4 0 0 0 8 0c0-1.5-.7-2.2-1.2-3 .3 2-.8 3-2 3-1.5 0-2-1.3-1-3 .8-1.6 0-3-1.8-4Z"/><path d="M8 14a4 4 0 0 0 8 0c0-1-.4-1.7-1-2.3.2 1.3-.6 2.3-1.8 2.3-1.2 0-1.6-1-1.2-2C11.4 12.6 8 12.5 8 14Z" opacity="0"/><path d="M6.5 13c-.8 1.4-1.2 2.7-1.2 4a6.7 6.7 0 0 0 13.4 0c0-1.6-.5-2.7-1.2-3.7.2 2-1 3.4-2.6 3.4-1.8 0-2.6-1.5-1.6-3.4"/></svg>',
  siren:
    '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8"><path d="M12 2v2M4.2 6.2l1.4 1.4M2 13h2M19.8 6.2l-1.4 1.4M22 13h-2"/><path d="M6 13a6 6 0 0 1 12 0v6H6z"/><path d="M4 21h16"/></svg>',
  wrench:
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a4 4 0 1 0-5.4 5.4L2 19l3 3 7.3-7.3a4 4 0 0 0 5.4-5.4l-2.8 2.8-2-2 2.8-2.8Z"/></svg>',
  gauge:
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21a9 9 0 1 0-9-9"/><path d="M12 12 16 8"/><path d="M12 3v2M3 12h2M12 21v-2M21 12h-2"/></svg>',
  cal: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4.5" width="18" height="16" rx="2"/><path d="M3 9h18M8 3v3M16 3v3"/></svg>',
  history:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5M12 8v5l3 2"/></svg>',
};

function tickClock() {
  const now = new Date();
  document.getElementById("clockTime").textContent = now.toLocaleTimeString(
    "es-CO",
    { hour12: false },
  );
  document.getElementById("clockDate").textContent = now.toLocaleDateString(
    "es-CO",
    {
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric",
    },
  );
}
tickClock();
setInterval(tickClock, 1000);

const state = { search: "", statusFilter: "all", activeUci: "ALL" };

function computeGlobalStats(items) {
  const total = items.length;
  const rojo = items.filter((i) => i._overall.status === "rojo").length;
  const amarillo = items.filter((i) => i._overall.status === "amarillo").length;
  const verde = items.filter((i) => i._overall.status === "verde").length;
  const fuera = items.filter((i) => i._overall.status === "fuera").length;
  const na = items.filter((i) => i._overall.status === "na").length;
  const cumplimiento = total ? Math.round(((total - rojo) / total) * 100) : 100;
  return { total, rojo, amarillo, verde, fuera, na, cumplimiento };
}

function renderVitals() {
  const s = computeGlobalStats(DATA);
  const el = document.getElementById("vitalsStrip");
  el.innerHTML = `
    <div class="vital">
      <div class="vital-label"><span class="sq" style="background:var(--cyan-400)"></span>Equipos monitoreados</div>
      <div class="vital-value">${s.total}<small>uds</small></div>
      <div class="vital-sub">3 UCIs intermedias · HOMI</div>
    </div>
    <div class="vital ok">
      <div class="vital-label"><span class="sq" style="background:#5FE0A5"></span>Cumplimiento global</div>
      <div class="vital-value">${s.cumplimiento}<small>%</small></div>
      <div class="vital-sub">Equipos al día vs. programados</div>
    </div>
    <div class="vital crit">
      <div class="vital-label"><span class="sq" style="background:#F58080"></span>Vencidos</div>
      <div class="vital-value">${s.rojo}<small>equipos</small></div>
      <div class="vital-sub">Requieren acción inmediata</div>
    </div>
    <div class="vital warn">
      <div class="vital-label"><span class="sq" style="background:#F7C25F"></span>Próximos (≤30 días)</div>
      <div class="vital-value">${s.amarillo}<small>equipos</small></div>
      <div class="vital-sub">Ventana de alerta preventiva</div>
    </div>
    <div class="vital">
      <div class="vital-label"><span class="sq" style="background:#5FE0A5"></span>Ejecutado</div>
      <div class="vital-value">${s.verde}<small>equipos</small></div>
      <div class="vital-sub">Sin acción requerida</div>
    </div>
    <div class="vital">
      <div class="vital-label"><span class="sq" style="background:#8FA0AD"></span>Fuera de servicio</div>
      <div class="vital-value">${s.fuera}<small>equipos</small></div>
      <div class="vital-sub">No disponible para uso clínico</div>
    </div>
  `;
}

function renderAlerts() {
  const critItems = DATA.filter(
    (i) => i._overall.status === "rojo" || i._overall.status === "amarillo",
  ).sort((a, b) => (a._overall.days ?? 0) - (b._overall.days ?? 0));
  document.getElementById("alertCount").textContent = critItems.length;
  const scroll = document.getElementById("alertScroll");
  if (critItems.length === 0) {
    scroll.innerHTML = `<div class="alert-empty">No hay alertas activas — todos los equipos están dentro del rango seguro.</div>`;
    return;
  }
  scroll.innerHTML = critItems
    .slice(0, 40)
    .map((i) => {
      const cls = i._overall.status === "rojo" ? "crit" : "warn";
      const kindLabel =
        i._overall.kind === "calibracion" ? "Calibración" : "Mantenimiento";
      const dueDate =
        i._overall.kind === "calibracion"
          ? i.proximaCalibracion
          : i.mttoProximo;
      const daysTxt =
        i._overall.status === "rojo"
          ? `Vencido hace ${Math.abs(i._overall.days)} d`
          : `Vence en ${i._overall.days} d`;
      const resp =
        i._overall.kind === "calibracion"
          ? responsableCal(i)
          : responsableMtto(i);
      return `
      <div class="alert-card ${cls}" data-id="${i.id}" tabindex="0" role="button" aria-label="Ver detalle de ${escapeHtml(i.equipo)}">
        <div class="a-top">
          <div>
            <div class="a-eq">${escapeHtml(i.equipo)}</div>
            <div class="a-uci">${UCI_META[i.uci].short} · ${escapeHtml(i._code)}</div>
          </div>
          <span class="badge ${cls}">${daysTxt}</span>
        </div>
        <div class="a-meta"><span>${kindLabel} · ${escapeHtml(resp)}</span><b>${fmtDateHuman(dueDate)}</b></div>
      </div>`;
    })
    .join("");
  scroll.querySelectorAll(".alert-card").forEach((card) => {
    const open = () => {
      const id = card.dataset.id;
      const item = DATA.find((d) => String(d.id) === String(id));
      if (item) openDetailModal(item);
    };
    card.addEventListener("click", open);
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        open();
      }
    });
  });
}

function miniRingSVG(pct, size = 44) {
  const r = size / 2 - 4,
    c = 2 * Math.PI * r,
    off = c - (pct / 100) * c;
  const color = pct >= 90 ? "#1C9A5B" : pct >= 70 ? "#E09A11" : "#D64545";
  return `<svg class="ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="#EAF0F3" stroke-width="4.5"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="4.5"
      stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${off}"
      transform="rotate(-90 ${size / 2} ${size / 2})"/>
    <text x="50%" y="52%" text-anchor="middle" dominant-baseline="middle" font-family="IBM Plex Mono" font-size="11.5" font-weight="700" fill="#0D2233">${pct}</text>
  </svg>`;
}

function renderUciTabs() {
  const box = document.getElementById("uciTabs");
  const allStats = computeGlobalStats(DATA);
  let html = `<button class="uci-tab ${state.activeUci === "ALL" ? "active" : ""}" data-uci="ALL">
      ${miniRingSVG(allStats.cumplimiento)}
      <div class="uci-tab-text"><div class="t1">Todas las UCIs</div><div class="t2"><b>${allStats.total}</b> equipos · ${allStats.rojo} vencidos</div></div>
    </button>`;
  UCI_LIST.forEach((uci) => {
    const items = DATA.filter((i) => i.uci === uci);
    const s = computeGlobalStats(items);
    html += `<button class="uci-tab ${state.activeUci === uci ? "active" : ""}" data-uci="${uci}">
      ${miniRingSVG(s.cumplimiento)}
      <div class="uci-tab-text"><div class="t1">${uci}</div><div class="t2"><b>${s.total}</b> equipos · ${s.rojo} vencidos</div></div>
    </button>`;
  });
  box.innerHTML = html;
  box.querySelectorAll(".uci-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.activeUci = btn.dataset.uci;
      renderAll();
    });
  });
}

let sectionTab = {};

function filteredItemsFor(uci) {
  return DATA.filter((i) => {
    if (uci !== "ALL" && i.uci !== uci) return false;
    if (
      state.statusFilter !== "all" &&
      i._overall.status !== state.statusFilter
    )
      return false;
    if (state.search) {
      const q = state.search.toLowerCase();
      const hay =
        `${i.equipo} ${i.marca} ${i.modelo} ${i.serie} ${i.placa} ${i.codigoCalibracion} ${i._code}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function sectionsToRender() {
  const base = state.activeUci === "ALL" ? UCI_LIST : [state.activeUci];

  if (state.search || state.statusFilter !== "all") {
    return base.filter((uci) => filteredItemsFor(uci).length > 0);
  }
  return base;
}

function escapeHtml(str) {
  return String(str ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c],
  );
}

function renderUciSections() {
  const container = document.getElementById("uciSectionsContainer");
  const ucis = sectionsToRender();
  if (ucis.length === 0) {
    container.innerHTML = `<div class="alert-panel"><div class="alert-empty">No se encontraron equipos que coincidan con "${escapeHtml(state.search)}"${state.statusFilter !== "all" ? " con el filtro de estado seleccionado" : ""}.</div></div>`;
    return;
  }
  container.innerHTML = ucis.map((uci) => sectionSkeleton(uci)).join("");

  ucis.forEach((uci) => {
    try {
      const items = filteredItemsFor(uci);
      const allUciItems = DATA.filter((i) => i.uci === uci);
      drawSubGauge(`mtto-${slug(uci)}`, computeSubStats(allUciItems, "mtto"));
      drawSubGauge(`cal-${slug(uci)}`, computeSubStats(allUciItems, "cal"));
      renderStatPills(uci, computeGlobalStats(allUciItems));
      if (!sectionTab[uci]) sectionTab[uci] = "tabla";
      renderSubtabContent(uci, items);

      document
        .querySelectorAll(
          `.uci-section[data-section="${cssEscape(uci)}"] .subtab`,
        )
        .forEach((btn) => {
          btn.addEventListener("click", () => {
            sectionTab[uci] = btn.dataset.tab;
            document
              .querySelectorAll(
                `.uci-section[data-section="${cssEscape(uci)}"] .subtab`,
              )
              .forEach((b) => b.classList.toggle("active", b === btn));
            renderSubtabContent(uci, filteredItemsFor(uci));
          });
        });
    } catch (err) {
      console.error("Error renderizando sección", uci, err);
      const host = document.getElementById(`content-${slug(uci)}`);
      if (host)
        host.innerHTML = `<div class="alert-empty">Ocurrió un error mostrando esta sección. Recarga la página.</div>`;
    }
  });
}

function cssEscape(str) {
  return str.replace(/"/g, '\\"');
}

function sectionSkeleton(uci) {
  const meta = UCI_META[uci];
  return `
  <div class="uci-section" data-section="${escapeHtml(uci)}">
    <div class="uci-section-head">
      <div class="uci-title-block">
        <div class="uci-icon">${ICONS[meta.icon]}</div>
        <div class="uci-title">
          <h3>${uci}</h3>
          <p>Plan de mantenimiento preventivo y calibración biomédica</p>
        </div>
      </div>
      <div class="uci-stats" id="pills-${slug(uci)}"></div>
    </div>
    <div class="uci-body">
      <div class="uci-gauge-col">
        <div class="gauge-block">
          <div class="gauge-block-title">Mantenimiento</div>
          <div class="gauge-wrap-sm" id="gaugewrap-mtto-${slug(uci)}"></div>
          <div class="gauge-legend-sm" id="legend-mtto-${slug(uci)}"></div>
        </div>
        <div class="gauge-block">
          <div class="gauge-block-title">Calibración</div>
          <div class="gauge-wrap-sm" id="gaugewrap-cal-${slug(uci)}"></div>
          <div class="gauge-legend-sm" id="legend-cal-${slug(uci)}"></div>
        </div>
      </div>
      <div class="uci-content-col">
        <div class="subtabs">
          <button class="subtab ${sectionTab[uci] !== "calendario" && sectionTab[uci] !== "historial" ? "active" : ""}" data-tab="tabla">Inventario y estado</button>
          <button class="subtab ${sectionTab[uci] === "calendario" ? "active" : ""}" data-tab="calendario">Próximos mantenimientos</button>
          <button class="subtab ${sectionTab[uci] === "historial" ? "active" : ""}" data-tab="historial">Próximas calibraciones</button>
        </div>
        <div id="content-${slug(uci)}"></div>
      </div>
    </div>
  </div>`;
}

function slug(s) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-");
}

function renderStatPills(uci, s) {
  document.getElementById(`pills-${slug(uci)}`).innerHTML = `
    <div class="stat-pill"><span class="sq" style="background:var(--crit-500)"></span>Vencidos<b>${s.rojo}</b></div>
    <div class="stat-pill"><span class="sq" style="background:var(--warn-500)"></span>Próximos<b>${s.amarillo}</b></div>
    <div class="stat-pill"><span class="sq" style="background:var(--ok-500)"></span>Ejecutado<b>${s.verde}</b></div>
    ${s.fuera > 0 ? `<div class="stat-pill"><span class="sq" style="background:var(--off-500)"></span>Fuera de servicio<b>${s.fuera}</b></div>` : ""}
  `;
}

function donutSVG(segments, size, thickness) {
  const r = size / 2 - thickness / 2;
  const c = 2 * Math.PI * r;
  const total = segments.reduce((a, s) => a + s.value, 0);
  if (total <= 0) {
    return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="#EAF0F3" stroke-width="${thickness}"/>
    </svg>`;
  }
  let acc = 0;
  const arcs = segments
    .filter((s) => s.value > 0)
    .map((seg) => {
      const frac = seg.value / total;
      const dash = Math.max(
        frac * c - (segments.filter((s) => s.value > 0).length > 1 ? 2 : 0),
        0,
      );
      const rotate = -90 + (acc / total) * 360;
      acc += seg.value;
      return `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${seg.color}" stroke-width="${thickness}"
      stroke-dasharray="${dash} ${c - dash}" stroke-linecap="round"
      transform="rotate(${rotate} ${size / 2} ${size / 2})"/>`;
    })
    .join("");
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="#EAF0F3" stroke-width="${thickness}"/>
    ${arcs}
  </svg>`;
}

function computeSubStats(items, kind) {
  const total = items.length;
  let rojo = 0,
    amarillo = 0,
    verde = 0,
    fuera = 0,
    na = 0;
  items.forEach((i) => {
    const st = subStatus(i, kind).status;
    if (st === "rojo") rojo++;
    else if (st === "amarillo") amarillo++;
    else if (st === "verde") verde++;
    else if (st === "fuera") fuera++;
    else na++;
  });
  const cumplimiento = total ? Math.round(((total - rojo) / total) * 100) : 100;
  return { total, rojo, amarillo, verde, fuera, na, cumplimiento };
}

function drawSubGauge(prefix, s) {
  const wrap = document.getElementById(`gaugewrap-${prefix}`);
  if (!wrap) return;
  wrap.innerHTML = donutSVG(
    [
      { value: s.verde + s.na, color: "#1C9A5B" },
      { value: s.amarillo, color: "#E09A11" },
      { value: s.rojo, color: "#D64545" },
      { value: s.fuera, color: "#5B6B7A" },
    ],
    132,
    14,
  );
  const center = document.createElement("div");
  center.className = "gauge-center-sm";
  center.innerHTML = `<div class="pct-sm">${s.cumplimiento}%</div>`;
  wrap.appendChild(center);
  document.getElementById(`legend-${prefix}`).innerHTML = `
    <div class="row"><span class="sq" style="background:var(--ok-500)"></span>Ejecutado<b>${s.verde}</b></div>
    <div class="row"><span class="sq" style="background:var(--warn-500)"></span>Próximo<b>${s.amarillo}</b></div>
    <div class="row"><span class="sq" style="background:var(--crit-500)"></span>Vencido<b>${s.rojo}</b></div>
    ${s.fuera > 0 ? `<div class="row"><span class="sq" style="background:var(--off-500)"></span>Fuera<b>${s.fuera}</b></div>` : ""}
    ${s.na > 0 ? `<div class="row"><span class="sq" style="background:var(--na-500)"></span>No aplica<b>${s.na}</b></div>` : ""}
  `;
}

let tableSort = { key: "_mtto", dir: 1 };

function renderSubtabContent(uci, items) {
  const tab = sectionTab[uci] || "tabla";
  const host = document.getElementById(`content-${slug(uci)}`);
  if (!host) return;
  if (tab === "tabla") host.innerHTML = tableHtml(items);
  if (tab === "calendario") host.innerHTML = calendarHtml(items);
  if (tab === "historial") host.innerHTML = historyHtml(items);

  if (tab === "tabla") {
    bindRowExpand(host);
    host.querySelectorAll("thead th[data-key]").forEach((th) => {
      th.addEventListener("click", () => {
        const key = th.dataset.key;
        tableSort.dir = tableSort.key === key ? -tableSort.dir : 1;
        tableSort.key = key;
        host.innerHTML = tableHtml(items);
        rebindSort(uci, items, host);
      });
    });
  }
}
function rebindSort(uci, items, host) {
  bindRowExpand(host);
  host.querySelectorAll("thead th[data-key]").forEach((th) => {
    th.addEventListener("click", () => {
      const key = th.dataset.key;
      tableSort.dir = tableSort.key === key ? -tableSort.dir : 1;
      tableSort.key = key;
      host.innerHTML = tableHtml(items);
      rebindSort(uci, items, host);
    });
  });
}

function bindRowExpand(host) {
  host.querySelectorAll("tr.eq-row").forEach((tr) => {
    const open = () => {
      const id = tr.dataset.id;
      const item = DATA.find((d) => String(d.id) === String(id));
      if (item) openDetailModal(item);
    };
    tr.addEventListener("click", open);
    tr.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        open();
      }
    });
  });
}

function sortItems(items) {
  const { key, dir } = tableSort;
  return [...items].sort((a, b) => {
    let va, vb;
    if (key === "_overall") {
      va = STATUS_RANK[a._overall.status];
      vb = STATUS_RANK[b._overall.status];
    } else if (key === "_mtto") {
      va = STATUS_RANK[subStatus(a, "mtto").status];
      vb = STATUS_RANK[subStatus(b, "mtto").status];
    } else if (key === "_cal") {
      va = STATUS_RANK[subStatus(a, "cal").status];
      vb = STATUS_RANK[subStatus(b, "cal").status];
    } else if (key === "mttoProximo" || key === "proximaCalibracion") {
      va = a[key] || "9999";
      vb = b[key] || "9999";
    } else {
      va = (a[key] ?? "").toString().toLowerCase();
      vb = (b[key] ?? "").toString().toLowerCase();
    }
    if (va < vb) return -1 * dir;
    if (va > vb) return 1 * dir;
    return 0;
  });
}

function tableHtml(items) {
  if (items.length === 0) {
    return `<div class="table-scroll table-scroll-y"><table class="eq-table"><thead>${tableHeader()}</thead><tbody>
      <tr class="empty-row"><td colspan="10">No hay equipos que coincidan con el filtro actual.</td></tr>
    </tbody></table></div>`;
  }
  const sorted = sortItems(items);
  return `<div class="table-scroll table-scroll-y"><table class="eq-table"><thead>${tableHeader()}</thead><tbody>
    ${sorted.map(rowHtml).join("")}
  </tbody></table></div><div class="table-count">${items.length} equipo${items.length === 1 ? "" : "s"} listados · haz clic en un equipo para ver el detalle completo</div>`;
}
function subStatus(item, kind) {
  if (item._overall.status === "fuera") return { status: "fuera", days: null };
  return kind === "mtto" ? item._mtto : item._cal;
}
function tableHeader() {
  const cols = [
    ["equipo", "EQUIPO"],
    ["modulo", "UBICACIÓN"],
    ["mttoProximo", "PRÓXIMO MTTO PREVENTIVO A EJECUTAR"],
    ["_mtto", "ESTADO DE EJECUCIÓN MTTO"],
    ["proximaCalibracion", "FECHA PRÓXIMO ASEGURAMIENTO METROLÓGICO"],
    ["_cal", "ESTADO DE EJECUCIÓN CALIBRACIÓN"],
    ["codigoCalibracion", "NÚMERO DE CERTIFICADO DE ASEGURAMIENTO METROLÓGICO"],
    ["registroInvima", "N° de registro INVIMA"],
    ["clasificacionInvima", "Clasificación de registro INVIMA"],
  ];
  return `<tr>${cols.map(([k, l]) => `<th data-key="${k}">${l}<span class="arrow">${tableSort.key === k ? (tableSort.dir > 0 ? "▲" : "▼") : ""}</span></th>`).join("")}<th>Responsable Mtto.</th><th>Responsable Cal.</th></tr>`;
}
function rowHtml(i) {
  const stMtto = subStatus(i, "mtto");
  const stCal = subStatus(i, "cal");
  return `<tr class="eq-row" data-id="${i.id}" tabindex="0" aria-label="Ver detalle de ${escapeHtml(i.equipo)}">
    <td><span class="expand-ic">▸</span><span class="eq-name-wrap"><div class="eq-name">${escapeHtml(i.equipo)}</div><div class="eq-sub">${escapeHtml(i.marca)} ${escapeHtml(i.modelo)} · ${escapeHtml(i._code)}</div></span></td>
    <td class="mono">${escapeHtml(i.modulo)}</td>
    <td>${fmtDateHuman(i.mttoProximo)}<br>${daysTagHtml(i._mtto)}</td>
    <td><span class="dot-status"><span class="d" style="background:${STATUS_COLOR[stMtto.status]}"></span>${STATUS_LABEL[stMtto.status]}</span></td>
    <td>${fmtDateHuman(i.proximaCalibracion)}<br>${daysTagHtml(i._cal)}</td>
    <td><span class="dot-status"><span class="d" style="background:${STATUS_COLOR[stCal.status]}"></span>${STATUS_LABEL[stCal.status]}</span></td>
    <td class="mono">${escapeHtml(i.codigoCalibracion || "—")}</td>
    <td class="mono">${escapeHtml(i.registroInvima || "—")}</td>
    <td>${escapeHtml(i.clasificacionInvima || "—")}</td>
    <td>${escapeHtml(responsableMtto(i))}</td>
    <td>${escapeHtml(responsableCal(i))}</td>
  </tr>`;
}

function detailPanelHtml(i) {
  const rows = [
    ["SERVICIO", i.ubicacion],
    ["UBICACIÓN", i.modulo],
    ["MARCA", i.marca],
    ["MODELO", i.modelo],
    ["SERIE", i.serie],
    ["PLACA", i.placa],
    ["ÚLTIMO MTTO PREVENTIVO EJECUTADO", fmtDateHuman(i.mttoRealizado)],
    ["PRÓXIMO MTTO PREVENTIVO A EJECUTAR", fmtDateHuman(i.mttoProximo)],
    ["FRECUENCIA MTTO DE EJECUCIÓN", i.frecuenciaMtto],
    [
      "FECHA ÚLTIMO ASEGURAMIENTO METROLÓGICO EJECUTADO",
      fmtDateHuman(i.calibracion),
    ],
    [
      "FECHA PRÓXIMO ASEGURAMIENTO METROLÓGICO",
      fmtDateHuman(i.proximaCalibracion),
    ],
    [
      "NÚMERO DE CERTIFICADO DE ASEGURAMIENTO METROLÓGICO",
      i.codigoCalibracion || "—",
    ],
    ["N° de registro INVIMA", i.registroInvima || "—"],
    ["Clasificación de registro INVIMA", i.clasificacionInvima || "—"],
    ["Responsable mantenimiento", responsableMtto(i)],
    ["Responsable calibración", responsableCal(i)],
  ];
  return `<div class="eq-detail-grid">${rows
    .map(
      ([l, v]) => `
    <div class="eq-detail-item"><span class="l">${escapeHtml(l)}</span><span class="v">${escapeHtml(v ?? "") || "—"}</span></div>`,
    )
    .join("")}
  </div>`;
}
function daysTagHtml(st) {
  if (st.status === "fuera")
    return `<span class="days-tag fuera">Fuera de servicio</span>`;
  if (st.status === "na") return `<span class="days-tag na">No aplica</span>`;
  const cls =
    st.status === "rojo" ? "crit" : st.status === "amarillo" ? "warn" : "ok";
  const txt =
    st.days < 0 ? `Vencido ${Math.abs(st.days)}d` : `${st.days} d restantes`;
  return `<span class="days-tag ${cls}">${txt}</span>`;
}

function calendarHtml(items) {
  const upcoming = items
    .filter((i) => i.mttoProximo && parseDate(i.mttoProximo))
    .sort((a, b) => a.mttoProximo.localeCompare(b.mttoProximo))
    .slice(0, 60);
  if (upcoming.length === 0)
    return `<div class="alert-empty">Sin mantenimientos programados.</div>`;
  return `<div class="calendar-strip">${upcoming
    .map((i) => {
      const d = fmtDateShort(i.mttoProximo);
      const st = i._mtto;
      return `<div class="cal-item">
      <div class="cal-date" style="background:${st.status === "rojo" ? "var(--crit-500)" : st.status === "amarillo" ? "var(--warn-500)" : "var(--navy-900)"}">${d.day}<span class="mn">${d.mon}</span></div>
      <div class="cal-info"><div class="n">${escapeHtml(i.equipo)}</div><div class="m">${escapeHtml(i._code)} · Frecuencia ${escapeHtml(i.frecuenciaMtto || "—")}</div></div>
      ${daysTagHtml(st)}
    </div>`;
    })
    .join("")}</div>`;
}

function historyHtml(items) {
  const cal = items
    .filter((i) => i.calibracion && parseDate(i.calibracion))
    .sort((a, b) => b.calibracion.localeCompare(a.calibracion))
    .slice(0, 60);
  if (cal.length === 0)
    return `<div class="alert-empty">Sin registros de calibración para este filtro.</div>`;
  return `<div class="hist-list">${cal
    .map(
      (i) => `
    <div class="hist-item">
      <div class="hist-icon">${ICONS.cal}</div>
      <div class="hist-info"><div class="n">${escapeHtml(i.equipo)} <span style="color:var(--ink-400);font-weight:500;">· ${escapeHtml(i._code)}</span></div>
      <div class="m">Última calibración ${fmtDateHuman(i.calibracion)} · N° certificado aseguramiento metrológico ${escapeHtml(i.codigoCalibracion || "—")} · Próxima ${fmtDateHuman(i.proximaCalibracion)}</div></div>
    </div>`,
    )
    .join("")}</div>`;
}

function renderAll() {
  renderVitals();
  renderAlerts();
  renderUciTabs();
  renderUciSections();
  document.getElementById("footerCount").textContent = DATA.length;
}

document.getElementById("globalSearch").addEventListener("input", (e) => {
  state.search = e.target.value.trim();

  if (state.search) {
    state.activeUci = "ALL";
  }
  renderUciTabs();
  renderUciSections();
});
document.querySelectorAll("#statusFilter button").forEach((btn) => {
  btn.addEventListener("click", () => {
    state.statusFilter = btn.dataset.f;
    document
      .querySelectorAll("#statusFilter button")
      .forEach((b) => b.classList.toggle("active", b === btn));
    renderUciSections();
  });
});

const EDIT_FIELDS = [
  { key: "equipo", label: "EQUIPO", type: "text" },
  { key: "marca", label: "MARCA", type: "text" },
  { key: "modelo", label: "MODELO", type: "text" },
  { key: "serie", label: "SERIE", type: "text" },
  { key: "placa", label: "PLACA", type: "text" },
  { key: "modulo", label: "UBICACIÓN", type: "text" },
  { key: "registroInvima", label: "N° de registro INVIMA", type: "text" },
  {
    key: "clasificacionInvima",
    label: "Clasificación de registro INVIMA",
    type: "text",
  },
  {
    key: "mttoRealizado",
    label: "ÚLTIMO MTTO PREVENTIVO EJECUTADO",
    type: "date",
  },
  {
    key: "mttoProximo",
    label: "PRÓXIMO MTTO PREVENTIVO A EJECUTAR",
    type: "date",
  },
  {
    key: "frecuenciaMtto",
    label: "FRECUENCIA MTTO DE EJECUCIÓN",
    type: "text",
  },
  {
    key: "calibracion",
    label: "FECHA ÚLTIMO ASEGURAMIENTO METROLÓGICO EJECUTADO",
    type: "date",
  },
  {
    key: "proximaCalibracion",
    label: "FECHA PRÓXIMO ASEGURAMIENTO METROLÓGICO",
    type: "date",
  },
  {
    key: "codigoCalibracion",
    label: "NÚMERO DE CERTIFICADO DE ASEGURAMIENTO METROLÓGICO",
    type: "text",
  },
];

function dateFieldValue(v) {
  return v && parseDate(v) ? v : "";
}

function statusBadgesHtml(item) {
  const stMtto = subStatus(item, "mtto");
  const stCal = subStatus(item, "cal");
  return `<div class="modal-status-row">
    <span class="modal-status-pill"><span class="d" style="background:${STATUS_COLOR[stMtto.status]}"></span>Mantenimiento: ${STATUS_LABEL[stMtto.status]}</span>
    <span class="modal-status-pill"><span class="d" style="background:${STATUS_COLOR[stCal.status]}"></span>Calibración: ${STATUS_LABEL[stCal.status]}</span>
  </div>`;
}

function editFormHtml(item) {
  const isOOS = item._overall.status === "fuera";
  const uciOptions = ucisDATA
    .map(
      (u) =>
        `<option value="${escapeHtml(u.id)}" ${u.nombre === item.uci ? "selected" : ""}>${escapeHtml(UCI_META[u.nombre].short)}</option>`,
    )
    .join("");
  const fieldsHtml = EDIT_FIELDS.map((f) => {
    // En equipos fuera de servicio se muestran las fechas reales guardadas, no el texto
    const raw = item._orig && f.key in item._orig ? item._orig[f.key] : item[f.key];
    const val =
      f.type === "date"
        ? dateFieldValue(raw)
        : raw === null || raw === undefined
          ? ""
          : String(raw);
    return `<div class="edit-field">
      <label for="edit-${f.key}">${escapeHtml(f.label)}</label>
      <input type="${f.type === "date" ? "date" : "text"}" id="edit-${f.key}" value="${escapeHtml(val)}">
    </div>`;
  }).join("");
  return `
    <div class="edit-oos-row">
      <input type="checkbox" id="edit-oos" ${isOOS ? "checked" : ""}>
      <label for="edit-oos">Marcar equipo como fuera de servicio</label>
    </div>
    <div class="edit-grid">
      <div class="edit-field">
        <label for="edit-uci">UCI</label>
        <select id="edit-uci">${uciOptions}</select>
      </div>
      ${fieldsHtml}
    </div>
    <div class="edit-note">.</div>
  `;
}

let currentModalItem = null;
let modalMode = "view";

function renderModalView(item) {
  currentModalItem = item;
  modalMode = "view";
  document.getElementById("detailModalTitle").textContent = item.equipo;
  document.getElementById("detailModalSub").textContent =
    `${UCI_META[item.uci].short} · ${item._code}`;
  document.getElementById("detailModalBody").innerHTML =
    statusBadgesHtml(item) + detailPanelHtml(item);
  document.getElementById("detailModalActions").innerHTML = `
    <button class="dm-btn danger" onclick="window.deleteEquipo()">Eliminar</button>
    <button class="dm-btn primary" onclick="window.enterEditMode()">Editar</button>
  `;
}

function renderModalEdit(item) {
  currentModalItem = item;
  modalMode = "edit";
  document.getElementById("detailModalTitle").textContent =
    `Editar: ${item.equipo}`;
  document.getElementById("detailModalSub").textContent =
    `${UCI_META[item.uci].short} · ${item._code}`;
  document.getElementById("detailModalBody").innerHTML = editFormHtml(item);
  document.getElementById("detailModalActions").innerHTML = `
    <button class="dm-btn ghost" onclick="window.cancelEdit()">Cancelar</button>
    <button class="dm-btn primary" onclick="window.saveEditForm()">Guardar</button>
  `;
}

function renderModalCreate(item) {
  currentModalItem = item;
  modalMode = "create";
  document.getElementById("detailModalTitle").textContent =
    "Agregar nuevo equipo";
  document.getElementById("detailModalSub").textContent =
    "Completa los datos del equipo";
  document.getElementById("detailModalBody").innerHTML = editFormHtml(item);
  document.getElementById("detailModalActions").innerHTML = `
    <button class="dm-btn ghost" onclick="window.closeDetailModalPublic()">Cancelar</button>
    <button class="dm-btn primary" onclick="window.saveNewEquipmentCopy()">Guardar equipo</button>
  `;
}

let lastFocusBeforeModal = null;
function showModal() {
  lastFocusBeforeModal = document.activeElement;
  document.getElementById("detailOverlay").classList.add("open");
  const modal = document.getElementById("detailModal");
  modal.classList.add("open");
  modal.focus();
}
function openDetailModal(item) {
  renderModalView(item);
  showModal();
}
function openCreateModal() {
  const blank = {
    id: null,
    uci: UCI_LIST[0],
    ubicacion: "",
    modulo: "",
    equipo: "",
    marca: "",
    modelo: "",
    serie: "",
    placa: "",
    mttoRealizado: null,
    mttoProximo: null,
    frecuenciaMtto: "ANUAL",
    calibracion: null,
    proximaCalibracion: null,
    codigoCalibracion: "",
    registroInvima: "",
    clasificacionInvima: "",
    _mtto: { status: "na", days: null },
    _cal: { status: "na", days: null },
    _overall: { status: "na", days: null, kind: "ninguno" },
    _code: "",
  };
  renderModalCreate(blank);
  showModal();
}
function closeDetailModal() {
  document.getElementById("detailOverlay").classList.remove("open");
  document.getElementById("detailModal").classList.remove("open");
  if (lastFocusBeforeModal && lastFocusBeforeModal.focus) {
    lastFocusBeforeModal.focus();
    lastFocusBeforeModal = null;
  }
}
window.closeDetailModalPublic = closeDetailModal;
document
  .getElementById("detailModalClose")
  .addEventListener("click", closeDetailModal);
document
  .getElementById("detailOverlay")
  .addEventListener("click", closeDetailModal);
document
  .getElementById("addEquipoBtn")
  .addEventListener("click", openCreateModal);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeDetailModal();
});

window.enterEditMode = function () {
  if (currentModalItem) renderModalEdit(currentModalItem);
};
window.cancelEdit = function () {
  if (currentModalItem) renderModalView(currentModalItem);
};
function readEditFormValues() {
  const uciEl = document.getElementById("edit-uci");
  const oosEl = document.getElementById("edit-oos");
  const oos = oosEl ? oosEl.checked : false;
  const values = { uci: uciEl ? uciEl.value : UCI_LIST[0] };
  EDIT_FIELDS.forEach((f) => {
    const el = document.getElementById(`edit-${f.key}`);
    if (!el) return;
    const val = el.value.trim();
    values[f.key] = f.type === "date" && !val ? null : val;
  });
  values.fueraServicio = oos;
  return values;
}

// Llamada a la API: devuelve el JSON o lanza Error con el mensaje que envía el servidor
async function apiPost(path, body) {
  let resp;
  try {
    resp = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error(
      "No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.",
    );
  }
  let data = null;
  try {
    data = await resp.json();
  } catch {
    /* respuesta sin JSON */
  }
  if (!resp.ok) {
    throw new Error(data?.error || `Error del servidor (${resp.status})`);
  }
  return data;
}

// Cuerpo anidado que entiende la API (equipo + mantenimiento + calibración)
function buildEquipoPayload(values, id) {
  const equipo = {
    uci_id: values.uci,
    ubicacion: values.modulo || "",
    equipo: values.equipo,
    marca: values.marca || "",
    modelo: values.modelo || "",
    serie: values.serie || "",
    placa: values.placa || "",
    registro_invima: values.registroInvima || "",
    clasificacion_invima: values.clasificacionInvima || "",
    fuera_servicio: !!values.fueraServicio,
  };
  if (id) equipo.id = id;
  return {
    equipo,
    mantenimiento: {
      frecuencia: values.frecuenciaMtto || "",
      fecha_realizado: values.mttoRealizado,
      fecha_proxima: values.mttoProximo,
    },
    calibracion: {
      fecha_realizada: values.calibracion,
      fecha_proxima: values.proximaCalibracion,
      certificado_calibracion: values.codigoCalibracion || "",
    },
  };
}
window.saveEditForm = async function () {
  if (!currentModalItem) return;
  const id = currentModalItem.id;
  const values = readEditFormValues();
  if (!values.equipo) {
    alert("El nombre del equipo es obligatorio");
    return;
  }
  try {
    await apiPost("/equipos/actualizar", buildEquipoPayload(values, id));
    DATA = await buildData();
    renderAll();
    const fresh = DATA.find((d) => String(d.id) === String(id));
    if (fresh) renderModalView(fresh);
    else closeDetailModal();
  } catch (error) {
    console.error("Hubo un problema al actualizar el equipo:", error);
    alert("No se pudo guardar los cambios: " + error.message);
  }
};

window.deleteEquipo = async function () {
  if (!currentModalItem || currentModalItem.id == null) return;
  const item = currentModalItem;
  if (
    !confirm(
      `¿Eliminar el equipo "${item.equipo}" (${item._code})? Se borrarán también su mantenimiento y calibración. Esta acción no se puede deshacer.`,
    )
  )
    return;
  try {
    await apiPost("/equipos/eliminar", { id: item.id });
    closeDetailModal();
    DATA = await buildData();
    renderAll();
  } catch (error) {
    console.error("Hubo un problema al eliminar el equipo:", error);
    alert("No se pudo eliminar el equipo: " + error.message);
  }
};

// window.saveNewEquipment = function () {
//   const values = readEditFormValues();
//   if (!values.equipo) {
//     alert("Por favor escribe al menos el nombre del equipo.");
//     return;
//   }
//   const newId = "new-" + Date.now() + "-" + Math.floor(Math.random() * 1000);
//   const newItem = {
//     id: newId,
//     uci: values.uci,
//     ubicacion: values.uci.toUpperCase(),
//     modulo: values.modulo || "",
//     equipo: values.equipo,
//     marca: values.marca || "",
//     modelo: values.modelo || "",
//     serie: values.serie || "",
//     placa: values.placa || "",
//     mttoRealizado: values.mttoRealizado,
//     mttoProximo: values.mttoProximo,
//     frecuenciaMtto: values.frecuenciaMtto || "",
//     calibracion: values.calibracion,
//     proximaCalibracion: values.proximaCalibracion,
//     codigoCalibracion: values.codigoCalibracion || "",
//     registroInvima: values.registroInvima || "",
//     clasificacionInvima: values.clasificacionInvima || "",
//   };
//   NEW_ITEMS.push(newItem);
//   saveNewItemsToStorage(NEW_ITEMS);
//   DATA = buildData();
//   renderAll();
//   const fresh = DATA.find((d) => d.id === newId);
//   if (fresh) renderModalView(fresh);
// };

window.saveNewEquipmentCopy = async function () {
  const values = readEditFormValues();

  if (!values.equipo) {
    alert("El nombre del equipo es obligatorio");
    return;
  }

  try {
    await apiPost("/equipos/crear", buildEquipoPayload(values));
    closeDetailModal();
    DATA = await buildData();
    renderAll();
    alert("Equipo guardado correctamente.");
  } catch (error) {
    console.error("Hubo un problema al enviar el equipo:", error);
    alert("No se pudo guardar el equipo: " + error.message);
  }
};

let GEMINI_KEY = "";
const aiDrawer = document.getElementById("aiDrawer");
const aiOverlay = document.getElementById("aiOverlay");

function openAi() {
  aiDrawer.classList.add("open");
  aiOverlay.classList.add("open");
}
function closeAi() {
  aiDrawer.classList.remove("open");
  aiOverlay.classList.remove("open");
}
document.getElementById("openAiBtn").addEventListener("click", openAi);
document.getElementById("closeAiBtn").addEventListener("click", closeAi);
aiOverlay.addEventListener("click", closeAi);

document.getElementById("saveKeyBtn").addEventListener("click", () => {
  const v = document.getElementById("geminiKeyInput").value.trim();
  if (v) {
    GEMINI_KEY = v;
    document.getElementById("aiKeyBox").style.display = "none";
    pushBotMsg(
      'Clave guardada para esta sesión. Ya puedes preguntar sobre el inventario, por ejemplo: "¿Qué equipos requieren calibración en los próximos 30 días en P1?"',
    );
  }
});

const EXAMPLE_QUERIES = [
  "¿Qué equipos están vencidos en Neonatal?",
  "¿Qué se calibra en los próximos 30 días en P1?",
  "Resume el cumplimiento por UCI",
  "¿Qué monitores Dräger hay en Quemados?",
];
document.getElementById("aiChips").innerHTML = EXAMPLE_QUERIES.map(
  (q) =>
    `<button class="ai-chip" data-q="${escapeHtml(q)}">${escapeHtml(q)}</button>`,
).join("");
document.querySelectorAll(".ai-chip").forEach((chip) =>
  chip.addEventListener("click", () => {
    sendAiQuery(chip.dataset.q);
  }),
);

function pushUserMsg(text) {
  const chat = document.getElementById("aiChat");
  chat.insertAdjacentHTML(
    "beforeend",
    `<div class="ai-msg user">${escapeHtml(text)}</div>`,
  );
  chat.scrollTop = chat.scrollHeight;
}
function pushBotMsg(text, isErr) {
  const chat = document.getElementById("aiChat");
  chat.insertAdjacentHTML(
    "beforeend",
    `<div class="ai-msg bot${isErr ? " err" : ""}">${escapeHtml(text)}</div>`,
  );
  chat.scrollTop = chat.scrollHeight;
}
function pushLoading() {
  const chat = document.getElementById("aiChat");
  const el = document.createElement("div");
  el.className = "ai-msg bot loading";
  el.innerHTML = `<span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span>`;
  chat.appendChild(el);
  chat.scrollTop = chat.scrollHeight;
  return el;
}

function buildInventoryContext() {
  const lines = DATA.map((i) => {
    return `${i.equipo} | UCI:${UCI_META[i.uci].short} | Cod:${i._code} | Marca:${i.marca} ${i.modelo} | ProxMtto:${i.mttoProximo || "NA"}(${i._mtto.status}) | ProxCal:${i.proximaCalibracion || "NA"}(${i._cal.status}) | Riesgo:${i.clasificacionInvima || "NA"} | RespMtto:${responsableMtto(i)} | RespCal:${responsableCal(i)}`;
  });
  const s = computeGlobalStats(DATA);
  const header = `Resumen global: ${s.total} equipos · Cumplimiento ${s.cumplimiento}% · Vencidos ${s.rojo} · Próximos(<=15d) ${s.amarillo} · Ejecutado ${s.verde}. Fecha de hoy: ${TODAY.toISOString().slice(0, 10)}. Regla de responsables: el mantenimiento de equipos marca Dräger lo ejecuta el fabricante Dräger; el resto del parque lo cubre Ingeniería Biomédica interna; todas las calibraciones metrológicas las ejecuta la empresa Celsius.`;
  return header + "\n" + lines.join("\n");
}

async function sendAiQuery(query) {
  if (!query) return;
  pushUserMsg(query);
  document.getElementById("aiInput").value = "";

  if (!GEMINI_KEY) {
    pushBotMsg(
      "Para usar el asistente conecta primero tu clave de API de Google Gemini en el panel superior. Mientras tanto, aquí tienes un resumen calculado localmente:\n\n" +
        localFallbackAnswer(query),
    );
    return;
  }

  const loadingEl = pushLoading();
  try {
    const context = buildInventoryContext();
    const prompt = `Eres el asistente de Ingeniería Biomédica del Hospital La Misericordia (HOMI). Responde en español, de forma breve, clara y accionable, usando SOLO los datos de inventario proporcionados a continuación. Si mencionas equipos, incluye su código y fecha relevante. Si la pregunta no puede responderse con estos datos, dilo explícitamente.\n\nINVENTARIO:\n${context}\n\nPREGUNTA DEL USUARIO:\n${query}`;

    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(GEMINI_KEY)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
        }),
      },
    );
    const data = await resp.json();
    loadingEl.remove();
    if (!resp.ok) {
      const msg =
        data?.error?.message ||
        "Error desconocido al contactar la API de Gemini.";
      pushBotMsg(
        `No se pudo obtener respuesta de Gemini (${resp.status}): ${msg}`,
        true,
      );
      return;
    }
    const text =
      data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") ||
      "La API no devolvió contenido de respuesta.";
    pushBotMsg(text);
  } catch (err) {
    loadingEl.remove();
    pushBotMsg(
      "No fue posible conectar con la API de Gemini desde este navegador (posible bloqueo de red o CORS). Respuesta calculada localmente:\n\n" +
        localFallbackAnswer(query),
      true,
    );
  }
}

function localFallbackAnswer(query) {
  const q = query.toLowerCase();
  const uciMatch = UCI_LIST.find((u) =>
    q.includes(UCI_META[u].short.toLowerCase()),
  );
  let pool = uciMatch ? DATA.filter((i) => i.uci === uciMatch) : DATA;
  if (q.includes("venc")) {
    pool = pool.filter((i) => i._overall.status === "rojo");
    if (pool.length === 0)
      return (
        "No hay equipos vencidos" +
        (uciMatch ? ` en ${UCI_META[uciMatch].short}` : "") +
        "."
      );
    return pool
      .slice(0, 15)
      .map(
        (i) =>
          `• ${i.equipo} (${i._code}) — ${i._overall.kind === "calibracion" ? "calibración" : "mantenimiento"} vencido hace ${Math.abs(i._overall.days)} días`,
      )
      .join("\n");
  }
  if (
    q.includes("30 día") ||
    q.includes("30 dias") ||
    q.includes("próximo") ||
    q.includes("proximo")
  ) {
    pool = pool.filter(
      (i) =>
        (i._mtto.status !== "na" && i._mtto.days <= 30 && i._mtto.days >= 0) ||
        (i._cal.status !== "na" && i._cal.days <= 30 && i._cal.days >= 0),
    );
    if (pool.length === 0)
      return (
        "No hay mantenimientos ni calibraciones en los próximos 30 días" +
        (uciMatch ? ` en ${UCI_META[uciMatch].short}` : "") +
        "."
      );
    return pool
      .slice(0, 15)
      .map(
        (i) =>
          `• ${i.equipo} (${i._code}) — próx. mtto ${fmtDateHuman(i.mttoProximo)}, próx. cal ${fmtDateHuman(i.proximaCalibracion)}`,
      )
      .join("\n");
  }
  if (q.includes("resum") || q.includes("cumplim")) {
    return UCI_LIST.map((u) => {
      const s = computeGlobalStats(DATA.filter((i) => i.uci === u));
      return `${UCI_META[u].short}: ${s.cumplimiento}% cumplimiento · ${s.total} equipos · ${s.rojo} vencidos · ${s.amarillo} próximos`;
    }).join("\n");
  }
  return 'No pude interpretar la consulta sin una clave de Gemini activa. Prueba con palabras como "vencidos", "próximos 30 días" o "resumen de cumplimiento", o conecta tu clave de API para consultas libres.';
}

document
  .getElementById("aiSendBtn")
  .addEventListener("click", () =>
    sendAiQuery(document.getElementById("aiInput").value.trim()),
  );
document.getElementById("aiInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendAiQuery(document.getElementById("aiInput").value.trim());
  }
});

pushBotMsg(
  "Hola, soy el asistente de mantenimiento de HOMI. Puedo responder preguntas sobre el inventario de equipos biomédicos de las UCIs Intermedias (Neonatal, Quemados y P1): vencimientos, calibraciones próximas, cumplimiento por unidad y más. Conecta tu clave de Gemini para consultas libres, o usa las sugerencias rápidas.",
);

// Primer pintado con los datos traídos de la API
renderAll();
