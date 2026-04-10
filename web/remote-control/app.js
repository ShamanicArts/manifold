const STORAGE_KEY = "manifold.remote.connection.v1";
const SURFACE_KEY_PREFIX = "manifold.remote.surface.v1:";

const state = {
  host: "127.0.0.1",
  port: 9011,
  hostInfo: null,
  uiMeta: null,
  paramMeta: new Map(),
  tree: null,
  endpoints: [],
  filteredEndpoints: [],
  endpointMap: new Map(),
  values: new Map(),
  ws: null,
  activeTab: "generic",
  search: "",
  currentSurface: [],
  layout: null,
  layoutState: {},
  baseUrl: "",
  wsUrl: "",
};

const dom = {
  connectForm: document.querySelector("#connectForm"),
  hostInput: document.querySelector("#hostInput"),
  portInput: document.querySelector("#portInput"),
  refreshButton: document.querySelector("#refreshButton"),
  statusText: document.querySelector("#statusText"),
  connectionMeta: document.querySelector("#connectionMeta"),
  endpointList: document.querySelector("#endpointList"),
  genericGroups: document.querySelector("#genericGroups"),
  layoutRoot: document.querySelector("#layoutRoot"),
  customSurface: document.querySelector("#customSurface"),
  searchInput: document.querySelector("#searchInput"),
  reloadLayoutButton: document.querySelector("#reloadLayoutButton"),
  saveSurfaceButton: document.querySelector("#saveSurfaceButton"),
  clearSurfaceButton: document.querySelector("#clearSurfaceButton"),
  tabButtons: Array.from(document.querySelectorAll(".tab-button")),
  tabPanels: {
    generic: document.querySelector("#genericTab"),
    layout: document.querySelector("#layoutTab"),
    custom: document.querySelector("#customTab"),
  },
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function prettyLabel(text) {
  return String(text || "")
    .replace(/^\/+/, "")
    .split("/")
    .pop()
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatValue(value) {
  if (typeof value === "number") {
    if (Number.isInteger(value)) return String(value);
    return value.toFixed(Math.abs(value) >= 100 ? 1 : 3).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
  }
  if (typeof value === "boolean") return value ? "On" : "Off";
  if (value == null) return "—";
  if (Array.isArray(value)) return value.map(formatValue).join(", ");
  return String(value);
}

function getSurfaceStorageKey() {
  return `${SURFACE_KEY_PREFIX}${state.host}:${state.port}`;
}

function getLayoutStateValue(key, fallback) {
  if (!key) return fallback;
  return state.layoutState[key] ?? fallback;
}

function setLayoutStateValue(key, value) {
  if (!key) return;
  state.layoutState[key] = value;
}

function loadSavedConnection() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (saved && saved.host && saved.port) {
      state.host = saved.host;
      state.port = saved.port;
    }
  } catch (error) {
    console.warn("failed to load connection prefs", error);
  }
}

function saveConnection() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ host: state.host, port: state.port }));
}

function loadSurface() {
  try {
    const raw = localStorage.getItem(getSurfaceStorageKey());
    state.currentSurface = raw ? JSON.parse(raw) : [];
  } catch (error) {
    console.warn("failed to load custom surface", error);
    state.currentSurface = [];
  }
}

function saveSurface() {
  localStorage.setItem(getSurfaceStorageKey(), JSON.stringify(state.currentSurface));
  setStatus(`Saved custom surface for ${state.host}:${state.port}`, "ok");
}

function setStatus(text, kind = "") {
  dom.statusText.textContent = text;
  dom.statusText.className = kind === "error" ? "state-error" : kind === "ok" ? "state-ok" : "";
}

function updateConnectionMeta() {
  const meta = [];
  if (state.uiMeta?.name) meta.push(state.uiMeta.name);
  else if (state.hostInfo?.NAME) meta.push(state.hostInfo.NAME);
  if (state.hostInfo?.OSC_PORT) meta.push(`OSC ${state.hostInfo.OSC_PORT}`);
  if (state.hostInfo?.WS_PORT) meta.push(`WS ${state.hostInfo.WS_PORT}`);
  meta.push(`${state.endpoints.length} endpoints`);
  dom.connectionMeta.textContent = meta.join(" • ");
}

function buildParamMetaMap(uiMeta) {
  const map = new Map();
  const params = uiMeta?.plugin?.params;
  if (!Array.isArray(params)) {
    return map;
  }
  params.forEach((param) => {
    if (param && typeof param.path === "string" && param.path) {
      map.set(param.path, param);
    }
  });
  return map;
}

function mergeMetadataIntoEndpoints(endpoints) {
  return endpoints.map((endpoint) => {
    const meta = state.paramMeta.get(endpoint.path);
    if (!meta) {
      return endpoint;
    }
    const merged = { ...endpoint };
    merged.meta = meta;
    merged.label = meta.hostParamName || meta.label || endpoint.label;
    merged.description = meta.description || endpoint.description;
    merged.kind = meta.hostParamKind || meta.kind || endpoint.kind;
    merged.choices = Array.isArray(meta.choices) ? meta.choices : endpoint.choices;
    merged.defaultValue = meta.default;
    merged.skew = meta.skew;
    merged.unit = meta.unit || meta.suffix || endpoint.unit;
    return merged;
  });
}

function groupKeyForPath(path) {
  const parts = String(path || "").split("/").filter(Boolean);
  if (parts.length <= 2) return `/${parts.join("/")}`;
  if (parts[0] === "plugin" && parts[1] === "params") {
    return parts.length > 3 ? `/plugin/params/${parts[2]}` : "/plugin/params";
  }
  return `/${parts.slice(0, Math.min(parts.length - 1, 3)).join("/")}`;
}

function hasRange(endpoint) {
  return Array.isArray(endpoint.range) && endpoint.range.length > 0;
}

function getRange(endpoint) {
  const item = hasRange(endpoint) ? endpoint.range[0] : null;
  return {
    min: item && Number.isFinite(Number(item.MIN)) ? Number(item.MIN) : 0,
    max: item && Number.isFinite(Number(item.MAX)) ? Number(item.MAX) : 1,
  };
}

function isWritable(endpoint) {
  return endpoint.access === 2 || endpoint.access === 3;
}

function isReadable(endpoint) {
  return endpoint.access === 1 || endpoint.access === 3;
}

function isBooleanish(endpoint) {
  const { min, max } = getRange(endpoint);
  const haystack = `${endpoint.label || ""} ${endpoint.description || ""} ${endpoint.path || ""}`.toLowerCase();
  const kind = String(endpoint.kind || endpoint.meta?.hostParamKind || "").toLowerCase();
  return endpoint.type === "T"
    || endpoint.type === "F"
    || kind === "bool"
    || (min === 0 && max === 1 && /\b(enable|enabled|bypass|toggle|on|off|mute|solo|link)\b/.test(haystack));
}

function inferWidgetType(endpoint) {
  const originalPath = String(endpoint.path || "");
  const path = originalPath.toLowerCase();
  const yCandidate = originalPath.endsWith("/x")
    ? originalPath.replace(/\/x$/, "/y")
    : originalPath.endsWith("/mix_x")
      ? originalPath.replace(/\/mix_x$/, "/mix_y")
      : "";
  if (yCandidate && state.endpointMap.has(yCandidate)) {
    return "xy-x";
  }
  if (path.endsWith("/y") || path.endsWith("/mix_y")) {
    return "xy-y";
  }
  if (Array.isArray(endpoint.choices) && endpoint.choices.length > 0) return "choice";
  if (isBooleanish(endpoint)) return "toggle";
  if (endpoint.type === "i") return "slider-int";
  if (endpoint.type === "f") return "slider";
  return hasRange(endpoint) ? "slider" : "readout";
}

function flattenOscTree(node, bucket = []) {
  if (!node || typeof node !== "object") return bucket;
  if (node.TYPE) {
    const endpoint = {
      path: node.FULL_PATH,
      type: node.TYPE,
      access: Number(node.ACCESS || 0),
      description: node.DESCRIPTION || "",
      range: Array.isArray(node.RANGE) ? node.RANGE : [],
      fullPath: node.FULL_PATH,
      label: prettyLabel(node.FULL_PATH),
      group: groupKeyForPath(node.FULL_PATH),
    };
    bucket.push(endpoint);
  }
  if (node.CONTENTS && typeof node.CONTENTS === "object") {
    Object.values(node.CONTENTS).forEach((child) => flattenOscTree(child, bucket));
  }
  return bucket;
}

function decodeOscString(bytes, offset) {
  let end = offset;
  while (end < bytes.length && bytes[end] !== 0) end += 1;
  const value = new TextDecoder().decode(bytes.slice(offset, end));
  const next = (end + 4) & ~3;
  return { value, next };
}

function readInt32(bytes, offset) {
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getInt32(0, false);
}

function readFloat32(bytes, offset) {
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getFloat32(0, false);
}

function decodeOscPacket(buffer) {
  const bytes = new Uint8Array(buffer);
  if (!bytes.length) return null;

  const pathPart = decodeOscString(bytes, 0);
  const typePart = decodeOscString(bytes, pathPart.next);
  const path = pathPart.value;
  const tags = typePart.value.startsWith(",") ? typePart.value.slice(1) : typePart.value;
  let offset = typePart.next;
  const args = [];

  for (const tag of tags) {
    if (tag === "f") {
      args.push(readFloat32(bytes, offset));
      offset += 4;
    } else if (tag === "i") {
      args.push(readInt32(bytes, offset));
      offset += 4;
    } else if (tag === "s") {
      const strPart = decodeOscString(bytes, offset);
      args.push(strPart.value);
      offset = strPart.next;
    } else if (tag === "T") {
      args.push(true);
    } else if (tag === "F") {
      args.push(false);
    } else if (tag === "N") {
      args.push(null);
    } else {
      console.warn("unsupported OSC type tag", tag, path);
      return null;
    }
  }

  return { path, args };
}

async function fetchJson(url, options = undefined) {
  const response = await fetch(url, options);
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (error) {
    throw new Error(`Invalid JSON from ${url}: ${text.slice(0, 200)}`);
  }
  if (!response.ok) {
    const message = data?.error || data?.result || response.statusText;
    throw new Error(message);
  }
  return data;
}

async function queryValue(path) {
  const data = await fetchJson(`${state.baseUrl}/osc${path}`);
  return data?.VALUE;
}

async function sendCommand(command) {
  const data = await fetchJson(`${state.baseUrl}/api/command`, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: command,
  });
  if (!data?.ok) {
    throw new Error(data?.result || "command failed");
  }
  return data;
}

async function writeValue(path, value, endpoint) {
  const widgetType = inferWidgetType(endpoint);
  const normalized = widgetType === "toggle" ? (value ? 1 : 0) : value;
  await sendCommand(`SET ${path} ${normalized}`);
  state.values.set(path, widgetType === "toggle" ? Boolean(value) : value);
}

async function triggerPath(path) {
  await sendCommand(`TRIGGER ${path}`);
}

async function hydrateCurrentValues() {
  const readable = state.endpoints.filter((endpoint) => isReadable(endpoint));
  const concurrency = 12;
  let index = 0;

  async function worker() {
    while (index < readable.length) {
      const current = readable[index++];
      try {
        const value = await queryValue(current.path);
        if (value !== undefined) {
          state.values.set(current.path, value);
        }
      } catch (error) {
        console.warn("value query failed", current.path, error);
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
}

function closeSocket() {
  if (state.ws) {
    try {
      state.ws.close();
    } catch (error) {
      console.warn("ws close failed", error);
    }
  }
  state.ws = null;
}

function connectWebSocket() {
  closeSocket();
  const socket = new WebSocket(state.wsUrl);
  socket.binaryType = "arraybuffer";

  socket.addEventListener("open", () => {
    setStatus(`Connected to ${state.host}:${state.port}`, "ok");
    state.endpoints.forEach((endpoint) => {
      if (isReadable(endpoint)) {
        socket.send(JSON.stringify({ COMMAND: "LISTEN", DATA: endpoint.path }));
      }
    });
  });

  socket.addEventListener("message", (event) => {
    if (typeof event.data === "string") {
      console.debug("text ws message", event.data);
      return;
    }
    const decoded = decodeOscPacket(event.data);
    if (!decoded) return;
    state.values.set(decoded.path, decoded.args.length <= 1 ? decoded.args[0] : decoded.args);
    renderActiveViews();
  });

  socket.addEventListener("close", () => {
    if (state.ws === socket) {
      setStatus(`Socket closed for ${state.host}:${state.port}`);
      state.ws = null;
    }
  });

  socket.addEventListener("error", () => {
    setStatus(`Socket error on ${state.wsUrl}`, "error");
  });

  state.ws = socket;
}

function makeElement(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function usesLogScale(endpoint) {
  const { min, max } = getRange(endpoint);
  const key = `${endpoint.path || ""} ${endpoint.label || ""} ${endpoint.description || ""}`.toLowerCase();
  if (endpoint.meta?.display === "log") return true;
  if (typeof endpoint.skew === "number" && endpoint.skew > 0 && endpoint.skew < 0.9 && min > 0) return true;
  return min > 0 && max / Math.max(min, 1e-9) >= 50 && /(freq|frequency|cutoff|hz)/.test(key);
}

function formatEndpointValue(endpoint, value) {
  if (value == null) return "—";
  const choices = Array.isArray(endpoint.choices) ? endpoint.choices : null;
  if (choices && choices.length > 0) {
    const { min } = getRange(endpoint);
    const idx = Math.max(0, Math.min(choices.length - 1, Math.round(Number(value) - min)));
    return choices[idx] ?? formatValue(value);
  }
  const base = formatValue(value);
  const unit = endpoint.unit;
  if (!unit) return base;
  return `${base}${String(unit).startsWith(" ") ? unit : ` ${unit}`}`;
}

function sliderPositionFromValue(endpoint, value) {
  const { min, max } = getRange(endpoint);
  if (max === min) return 0;
  const numeric = clamp(toNumber(value, endpoint.defaultValue ?? min), min, max);
  if (usesLogScale(endpoint)) {
    const safeMin = Math.max(min, 1e-6);
    const safeMax = Math.max(max, safeMin * 1.0001);
    const safeValue = clamp(numeric, safeMin, safeMax);
    return clamp((Math.log(safeValue) - Math.log(safeMin)) / (Math.log(safeMax) - Math.log(safeMin)), 0, 1);
  }
  return clamp((numeric - min) / (max - min), 0, 1);
}

function sliderValueFromPosition(endpoint, position) {
  const { min, max } = getRange(endpoint);
  const t = clamp(position, 0, 1);
  let value;
  if (usesLogScale(endpoint)) {
    const safeMin = Math.max(min, 1e-6);
    const safeMax = Math.max(max, safeMin * 1.0001);
    value = Math.exp(Math.log(safeMin) + t * (Math.log(safeMax) - Math.log(safeMin)));
  } else {
    value = min + t * (max - min);
  }
  const kind = inferWidgetType(endpoint);
  if (kind === "slider-int" || endpoint.kind === "choice") {
    return Math.round(value);
  }
  return value;
}

function buildCompactSliderControl(endpoint) {
  const path = endpoint.path;
  const value = state.values.get(path);
  const readableValue = value !== undefined ? value : (endpoint.defaultValue ?? getRange(endpoint).min);
  const position = sliderPositionFromValue(endpoint, readableValue);

  const wrap = makeElement("div", "slider-wrap");
  const shell = makeElement("label", "compact-slider-shell");
  const fill = makeElement("div", "compact-slider-fill");
  const input = document.createElement("input");
  input.type = "range";
  input.min = "0";
  input.max = "1000";
  input.step = "1";
  input.className = "compact-slider-input";
  input.value = String(Math.round(position * 1000));
  input.disabled = !isWritable(endpoint);

  const overlay = makeElement("div", "compact-slider-overlay");
  const label = makeElement("span", "compact-slider-label", endpoint.label || prettyLabel(path));
  const readout = makeElement("span", "compact-slider-value", formatEndpointValue(endpoint, readableValue));
  overlay.append(label, readout);

  const updatePreview = () => {
    const pos = Number(input.value) / 1000;
    const actual = sliderValueFromPosition(endpoint, pos);
    shell.style.setProperty("--fill", `${clamp(pos, 0, 1) * 100}%`);
    readout.textContent = formatEndpointValue(endpoint, actual);
  };

  let queuedValue = null;
  let sending = false;
  const flushLiveWrite = async () => {
    if (sending || queuedValue == null) return;
    sending = true;
    while (queuedValue != null) {
      const nextValue = queuedValue;
      queuedValue = null;
      try {
        await writeValue(path, nextValue, endpoint);
      } catch (error) {
        setStatus(`Write failed: ${error.message}`, "error");
      }
    }
    sending = false;
  };

  input.addEventListener("input", () => {
    updatePreview();
    const nextValue = sliderValueFromPosition(endpoint, Number(input.value) / 1000);
    state.values.set(path, nextValue);
    queuedValue = nextValue;
    void flushLiveWrite();
  });

  shell.style.setProperty("--fill", `${position * 100}%`);
  shell.append(fill, input, overlay);
  wrap.append(shell);
  return wrap;
}

function buildChoiceControl(endpoint, options = null, disabled = false) {
  const wrap = makeElement("div", "choice-wrap");
  const select = document.createElement("select");
  select.className = "compact-select";
  const choices = Array.isArray(options) && options.length > 0 ? options : (Array.isArray(endpoint.choices) ? endpoint.choices : []);
  const { min } = getRange(endpoint);
  const value = state.values.get(endpoint.path);
  const currentIndex = Math.max(0, Math.min(Math.max(choices.length - 1, 0), Math.round(toNumber(value, endpoint.defaultValue ?? min) - min)));

  choices.forEach((choice, index) => {
    const option = document.createElement("option");
    option.value = String(min + index);
    option.textContent = String(choice);
    if (index === currentIndex) option.selected = true;
    select.append(option);
  });

  select.disabled = disabled || !isWritable(endpoint);
  select.addEventListener("change", async () => {
    try {
      await writeValue(endpoint.path, Number(select.value), endpoint);
      renderActiveViews();
    } catch (error) {
      setStatus(`Write failed: ${error.message}`, "error");
    }
  });

  wrap.append(select);
  return wrap;
}

function buildFilterGraphControl(bindConfig, style = {}) {
  const panel = makeElement("div", "filter-graph-shell");
  const canvas = document.createElement("canvas");
  canvas.width = 452;
  canvas.height = 376;
  panel.append(canvas);

  const accent = style.accent || "#a78bfa";
  const typeValue = toNumber(state.values.get(bindConfig.typePath), 0);
  const cutoff = toNumber(state.values.get(bindConfig.cutoffPath), 3200);
  const resonance = toNumber(state.values.get(bindConfig.resonancePath), 0.75);
  const minFreq = 80;
  const maxFreq = 16000;
  const minReso = 0.1;
  const maxReso = 2.0;
  const logMin = Math.log(minFreq);
  const logMax = Math.log(maxFreq);
  const dbRange = 14;

  const ctx2d = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  ctx2d.clearRect(0, 0, width, height);
  ctx2d.fillStyle = style.bg || "#0d1420";
  ctx2d.fillRect(0, 0, width, height);
  ctx2d.strokeStyle = "#1a1a3a";
  ctx2d.lineWidth = 1;

  [100, 500, 1000, 5000, 10000].forEach((f) => {
    const x = (Math.log(f) - logMin) / (logMax - logMin) * width;
    ctx2d.beginPath();
    ctx2d.moveTo(x, 0);
    ctx2d.lineTo(x, height);
    ctx2d.stroke();
  });

  [-24, -12, 0, 12, 24].forEach((db) => {
    const y = height * 0.5 - (db / dbRange) * height * 0.45;
    ctx2d.strokeStyle = db === 0 ? "#1f2b4d" : "#1a1a3a";
    ctx2d.beginPath();
    ctx2d.moveTo(0, y);
    ctx2d.lineTo(width, y);
    ctx2d.stroke();
  });

  const svfMagnitude = (freq, cutoffHz, resonanceValue, filterType) => {
    const safeCutoff = Math.max(minFreq, cutoffHz);
    const w = freq / safeCutoff;
    if (w < 0.1) {
      if (filterType === 0) return 1.0;
      if (filterType === 3) return 1.0;
      return 0.0;
    }
    if (w > 10) {
      if (filterType === 2 || filterType === 3) return 1.0;
      return 0.0;
    }
    const w2 = w * w;
    const q = Math.max(0.5, resonanceValue * 2);
    const denom = Math.max(1e-10, (1 - w2) * (1 - w2) + (w / q) * (w / q));
    if (filterType === 0) return 1.0 / Math.sqrt(denom);
    if (filterType === 1) return (w / q) / Math.sqrt(denom);
    if (filterType === 2) return w2 / Math.sqrt(denom);
    if (filterType === 3) return Math.sqrt(((1 - w2) * (1 - w2)) / denom);
    return 1.0;
  };

  const cutoffX = (Math.log(Math.max(minFreq, Math.min(maxFreq, cutoff))) - logMin) / (logMax - logMin) * width;
  ctx2d.strokeStyle = accent;
  ctx2d.globalAlpha = 0.35;
  ctx2d.beginPath();
  ctx2d.moveTo(cutoffX, 0);
  ctx2d.lineTo(cutoffX, height);
  ctx2d.stroke();
  ctx2d.globalAlpha = 1;

  ctx2d.strokeStyle = accent;
  ctx2d.lineWidth = 2;
  ctx2d.beginPath();
  for (let i = 0; i <= 180; i += 1) {
    const t = i / 180;
    const freq = Math.exp(logMin + t * (logMax - logMin));
    const mag = svfMagnitude(freq, cutoff, clamp(resonance, minReso, maxReso), Math.round(typeValue));
    const db = clamp((20 * Math.log10(mag + 1e-10)), -dbRange, dbRange);
    const x = t * width;
    const y = height * 0.5 - (db / dbRange) * height * 0.45;
    if (i === 0) ctx2d.moveTo(x, y);
    else ctx2d.lineTo(x, y);
  }
  ctx2d.stroke();

  return panel;
}

function buildEqGraphControl(bindConfig, style = {}) {
  const panel = makeElement("div", "filter-graph-shell");
  const canvas = document.createElement("canvas");
  canvas.width = 904;
  canvas.height = 216;
  panel.append(canvas);

  const ctx2d = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  const minFreq = 20;
  const maxFreq = 20000;
  const logMin = Math.log(minFreq);
  const logMax = Math.log(maxFreq);
  const minGain = -24;
  const maxGain = 24;
  const minQ = 0.1;
  const maxQ = 24;
  const selectedBand = Number(getLayoutStateValue(bindConfig.selectedBandStateKey || "selectedBand", 1));
  const sampleRate = 48000;
  const bandBase = bindConfig.bandBasePath || "/plugin/params/band";
  const bandColors = ["#f87171", "#fb923c", "#fbbf24", "#4ade80", "#2dd4bf", "#38bdf8", "#a78bfa", "#f472b6"];

  const BAND_TYPE = {
    Peak: 0,
    LowShelf: 1,
    HighShelf: 2,
    LowPass: 3,
    HighPass: 4,
    Notch: 5,
    BandPass: 6,
  };

  const freqToX = (freq) => ((Math.log(clamp(freq, minFreq, maxFreq)) - logMin) / (logMax - logMin)) * width;
  const gainToY = (gain) => (1 - ((clamp(gain, minGain, maxGain) - minGain) / (maxGain - minGain))) * height;
  const qToY = (q) => {
    const lmin = Math.log(minQ);
    const lmax = Math.log(maxQ);
    const norm = (Math.log(clamp(q, minQ, maxQ)) - lmin) / (lmax - lmin);
    return (1 - norm) * height;
  };

  const makePeak = (freq, q, gainDb) => {
    const A = 10 ** (gainDb / 40);
    const w0 = 2 * Math.PI * freq / sampleRate;
    const cosw0 = Math.cos(w0);
    const alpha = Math.sin(w0) / (2 * q);
    const b0 = 1 + alpha * A;
    const b1 = -2 * cosw0;
    const b2 = 1 - alpha * A;
    const a0 = 1 + alpha / A;
    const a1 = -2 * cosw0;
    const a2 = 1 - alpha / A;
    return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
  };
  const makeLowShelf = (freq, gainDb) => {
    const A = 10 ** (gainDb / 40);
    const w0 = 2 * Math.PI * freq / sampleRate;
    const cosw0 = Math.cos(w0);
    const sinw0 = Math.sin(w0);
    const alpha = sinw0 / 2 * Math.sqrt(A);
    const b0 = A * ((A + 1) - (A - 1) * cosw0 + 2 * alpha);
    const b1 = 2 * A * ((A - 1) - (A + 1) * cosw0);
    const b2 = A * ((A + 1) - (A - 1) * cosw0 - 2 * alpha);
    const a0 = (A + 1) + (A - 1) * cosw0 + 2 * alpha;
    const a1 = -2 * ((A - 1) + (A + 1) * cosw0);
    const a2 = (A + 1) + (A - 1) * cosw0 - 2 * alpha;
    return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
  };
  const makeHighShelf = (freq, gainDb) => {
    const A = 10 ** (gainDb / 40);
    const w0 = 2 * Math.PI * freq / sampleRate;
    const cosw0 = Math.cos(w0);
    const sinw0 = Math.sin(w0);
    const alpha = sinw0 / 2 * Math.sqrt(A);
    const b0 = A * ((A + 1) + (A - 1) * cosw0 + 2 * alpha);
    const b1 = -2 * A * ((A - 1) + (A + 1) * cosw0);
    const b2 = A * ((A + 1) + (A - 1) * cosw0 - 2 * alpha);
    const a0 = (A + 1) - (A - 1) * cosw0 + 2 * alpha;
    const a1 = 2 * ((A - 1) - (A + 1) * cosw0);
    const a2 = (A + 1) - (A - 1) * cosw0 - 2 * alpha;
    return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
  };
  const makeLowPass = (freq, q) => {
    const w0 = 2 * Math.PI * freq / sampleRate;
    const cosw0 = Math.cos(w0);
    const alpha = Math.sin(w0) / (2 * q);
    const b0 = (1 - cosw0) * 0.5;
    const b1 = 1 - cosw0;
    const b2 = (1 - cosw0) * 0.5;
    const a0 = 1 + alpha;
    const a1 = -2 * cosw0;
    const a2 = 1 - alpha;
    return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
  };
  const makeHighPass = (freq, q) => {
    const w0 = 2 * Math.PI * freq / sampleRate;
    const cosw0 = Math.cos(w0);
    const alpha = Math.sin(w0) / (2 * q);
    const b0 = (1 + cosw0) * 0.5;
    const b1 = -(1 + cosw0);
    const b2 = (1 + cosw0) * 0.5;
    const a0 = 1 + alpha;
    const a1 = -2 * cosw0;
    const a2 = 1 - alpha;
    return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
  };
  const makeNotch = (freq, q) => {
    const w0 = 2 * Math.PI * freq / sampleRate;
    const cosw0 = Math.cos(w0);
    const alpha = Math.sin(w0) / (2 * q);
    const b0 = 1;
    const b1 = -2 * cosw0;
    const b2 = 1;
    const a0 = 1 + alpha;
    const a1 = -2 * cosw0;
    const a2 = 1 - alpha;
    return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
  };
  const makeBandPass = (freq, q) => {
    const w0 = 2 * Math.PI * freq / sampleRate;
    const cosw0 = Math.cos(w0);
    const alpha = Math.sin(w0) / (2 * q);
    const b0 = alpha;
    const b1 = 0;
    const b2 = -alpha;
    const a0 = 1 + alpha;
    const a1 = -2 * cosw0;
    const a2 = 1 - alpha;
    return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
  };
  const makeCoeffs = (band) => {
    if (band.type === BAND_TYPE.LowShelf) return makeLowShelf(band.freq, band.gain);
    if (band.type === BAND_TYPE.HighShelf) return makeHighShelf(band.freq, band.gain);
    if (band.type === BAND_TYPE.LowPass) return makeLowPass(band.freq, band.q);
    if (band.type === BAND_TYPE.HighPass) return makeHighPass(band.freq, band.q);
    if (band.type === BAND_TYPE.Notch) return makeNotch(band.freq, band.q);
    if (band.type === BAND_TYPE.BandPass) return makeBandPass(band.freq, band.q);
    return makePeak(band.freq, band.q, band.gain);
  };
  const magnitudeForCoeffs = (coeffs, freq) => {
    const w = 2 * Math.PI * freq / sampleRate;
    const cos1 = Math.cos(w);
    const sin1 = Math.sin(w);
    const cos2 = Math.cos(2 * w);
    const sin2 = Math.sin(2 * w);
    const nr = coeffs.b0 + coeffs.b1 * cos1 + coeffs.b2 * cos2;
    const ni = -(coeffs.b1 * sin1 + coeffs.b2 * sin2);
    const dr = 1 + coeffs.a1 * cos1 + coeffs.a2 * cos2;
    const di = -(coeffs.a1 * sin1 + coeffs.a2 * sin2);
    const num = Math.sqrt(nr * nr + ni * ni);
    const den = Math.sqrt(dr * dr + di * di);
    return den <= 1e-9 ? 1 : num / den;
  };

  const bands = [];
  for (let i = 1; i <= 8; i += 1) {
    const enabled = Boolean(toNumber(state.values.get(`${bandBase}/${i}/enabled`), i === 1 || i === 8 ? 1 : 0));
    const type = Math.round(toNumber(state.values.get(`${bandBase}/${i}/type`), i === 1 ? 1 : i === 8 ? 2 : 0));
    const freq = toNumber(state.values.get(`${bandBase}/${i}/freq`), [60,120,250,500,1000,2500,6000,12000][i-1]);
    const gain = toNumber(state.values.get(`${bandBase}/${i}/gain`), 0);
    const q = toNumber(state.values.get(`${bandBase}/${i}/q`), i === 1 || i === 8 ? 0.8 : 1.0);
    bands.push({ enabled, type, freq, gain, q });
  }

  ctx2d.clearRect(0, 0, width, height);
  ctx2d.fillStyle = style.bg || "#0a0a1a";
  ctx2d.fillRect(0, 0, width, height);
  [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000].forEach((f) => {
    const x = freqToX(f);
    ctx2d.strokeStyle = "#1a1a3a";
    ctx2d.beginPath(); ctx2d.moveTo(x, 0); ctx2d.lineTo(x, height); ctx2d.stroke();
  });
  [-18, -12, -6, 0, 6, 12, 18].forEach((db) => {
    const y = gainToY(db);
    ctx2d.strokeStyle = db === 0 ? "#334155" : "#1a1a3a";
    ctx2d.beginPath(); ctx2d.moveTo(0, y); ctx2d.lineTo(width, y); ctx2d.stroke();
  });

  ctx2d.strokeStyle = style.accent || "#22d3ee";
  ctx2d.lineWidth = 2;
  ctx2d.beginPath();
  for (let x = 0; x < width; x += 1) {
    const freq = Math.exp(logMin + (x / width) * (logMax - logMin));
    let mag = 1;
    bands.forEach((band) => {
      if (band.enabled) mag *= magnitudeForCoeffs(makeCoeffs(band), freq);
    });
    const db = clamp(20 * Math.log10(Math.max(mag, 1e-9)), -18, 18);
    const y = gainToY(db);
    if (x === 0) ctx2d.moveTo(x, y);
    else ctx2d.lineTo(x, y);
  }
  ctx2d.stroke();

  bands.forEach((band, idx) => {
    if (!band.enabled) return;
    const x = freqToX(band.freq);
    const y = (band.type === BAND_TYPE.Peak || band.type === BAND_TYPE.LowShelf || band.type === BAND_TYPE.HighShelf)
      ? gainToY(band.gain)
      : qToY(band.q);
    const selected = idx + 1 === selectedBand;
    ctx2d.fillStyle = bandColors[idx];
    ctx2d.beginPath();
    ctx2d.arc(x, y, selected ? 7 : 5, 0, Math.PI * 2);
    ctx2d.fill();
    ctx2d.strokeStyle = selected ? "#ffffff" : "#0f172a";
    ctx2d.lineWidth = selected ? 2 : 1;
    ctx2d.stroke();
  });

  return panel;
}

function buildControl(endpoint, overrideWidgetType = null, options = {}) {
  const path = endpoint.path;
  const showPath = options.showPath !== false;
  let widgetType = overrideWidgetType || inferWidgetType(endpoint);
  if (widgetType === "xy-y") {
    return null;
  }
  if (widgetType === "dropdown") widgetType = "choice";
  if (widgetType === "knob" || widgetType === "vslider") widgetType = "slider";

  const controlCard = makeElement("div", "control-card");
  if (showPath) {
    controlCard.append(makeElement("div", "control-path", path));
  }

  if (widgetType === "toggle") {
    const row = makeElement("button", "toggle-pill", `${endpoint.label || prettyLabel(path)} • ${formatEndpointValue(endpoint, state.values.get(path))}`);
    row.disabled = !isWritable(endpoint);
    row.addEventListener("click", async () => {
      try {
        await writeValue(path, !Boolean(state.values.get(path)), endpoint);
        renderActiveViews();
      } catch (error) {
        setStatus(`Write failed: ${error.message}`, "error");
      }
    });
    controlCard.append(row);
    return controlCard;
  }

  if (widgetType === "choice") {
    controlCard.append(buildChoiceControl(endpoint, options.choices, options.disabled));
    return controlCard;
  }

  if (widgetType === "xy-x") {
    const yPath = path.endsWith("/x") ? path.replace(/\/x$/, "/y") : path.replace(/\/mix_x$/, "/mix_y");
    const yEndpoint = state.endpointMap.get(yPath);
    const yValue = toNumber(state.values.get(yPath), hasRange(yEndpoint) ? getRange(yEndpoint).min : 0);
    const xValue = toNumber(state.values.get(path), endpoint.defaultValue ?? getRange(endpoint).min);
    const xRange = getRange(endpoint);
    const yRange = getRange(yEndpoint || { range: [{ MIN: 0, MAX: 1 }] });

    const wrap = makeElement("div", "xy-wrap");
    const pad = makeElement("div", "xy-pad");
    const handle = makeElement("div", "xy-handle");
    const xNorm = xRange.max === xRange.min ? 0 : (xValue - xRange.min) / (xRange.max - xRange.min);
    const yNorm = yRange.max === yRange.min ? 0 : (yValue - yRange.min) / (yRange.max - yRange.min);
    handle.style.left = `${clamp(xNorm, 0, 1) * 100}%`;
    handle.style.top = `${(1 - clamp(yNorm, 0, 1)) * 100}%`;
    pad.append(handle);

    const commitPointer = async (event) => {
      if (!yEndpoint) return;
      const rect = pad.getBoundingClientRect();
      const px = clamp((event.clientX - rect.left) / rect.width, 0, 1);
      const py = clamp((event.clientY - rect.top) / rect.height, 0, 1);
      const nextX = xRange.min + px * (xRange.max - xRange.min);
      const nextY = yRange.min + (1 - py) * (yRange.max - yRange.min);
      handle.style.left = `${px * 100}%`;
      handle.style.top = `${py * 100}%`;
      state.values.set(path, nextX);
      state.values.set(yPath, nextY);
      try {
        await Promise.all([
          writeValue(path, nextX, endpoint),
          writeValue(yPath, nextY, yEndpoint),
        ]);
      } catch (error) {
        setStatus(`XY write failed: ${error.message}`, "error");
      }
    };

    let dragging = false;
    pad.addEventListener("pointerdown", (event) => {
      dragging = true;
      pad.setPointerCapture(event.pointerId);
      commitPointer(event);
    });
    pad.addEventListener("pointermove", (event) => {
      if (dragging) commitPointer(event);
    });
    pad.addEventListener("pointerup", () => { dragging = false; });
    pad.addEventListener("pointercancel", () => { dragging = false; });

    const values = makeElement("div", "xy-values");
    values.append(
      makeElement("span", "", `${endpoint.label || "X"}: ${formatEndpointValue(endpoint, xValue)}`),
      makeElement("span", "", `${yEndpoint?.label || "Y"}: ${formatEndpointValue(yEndpoint || {}, yValue)}`),
    );
    wrap.append(pad, values);
    controlCard.append(wrap);
    return controlCard;
  }

  if (widgetType === "readout") {
    controlCard.append(makeElement("div", "value-readout big", formatEndpointValue(endpoint, state.values.get(path))));
    if (isWritable(endpoint)) {
      const trigger = makeElement("button", "secondary", "Trigger");
      trigger.addEventListener("click", async () => {
        try {
          await triggerPath(path);
        } catch (error) {
          setStatus(`Trigger failed: ${error.message}`, "error");
        }
      });
      controlCard.append(trigger);
    }
    return controlCard;
  }

  controlCard.append(buildCompactSliderControl(endpoint));
  return controlCard;
}

function renderEndpointBrowser() {
  const container = dom.endpointList;
  container.innerHTML = "";
  const endpoints = state.filteredEndpoints;

  if (!endpoints.length) {
    container.className = "endpoint-list empty-state";
    container.textContent = state.endpoints.length ? "No parameters match the current search." : "Connect to an OSCQuery target.";
    return;
  }

  container.className = "endpoint-list";
  endpoints.forEach((endpoint) => {
    const row = makeElement("div", "endpoint-row");
    const titleRow = makeElement("div", "title-row");
    const titleBlock = makeElement("div");
    titleBlock.append(makeElement("strong", "", endpoint.label), makeElement("div", "path", endpoint.path));

    const addButton = makeElement("button", "secondary", "Add");
    addButton.addEventListener("click", () => addSurfaceWidget(endpoint));
    titleRow.append(titleBlock, addButton);

    const meta = makeElement("div", "meta");
    meta.append(
      makeElement("span", "badge", endpoint.type || "?"),
      makeElement("span", "badge", endpoint.group),
      makeElement("span", "badge", isWritable(endpoint) ? "write" : "read"),
    );
    if (hasRange(endpoint)) {
      const { min, max } = getRange(endpoint);
      meta.append(makeElement("span", "badge", `${formatValue(min)} → ${formatValue(max)}`));
    }

    const desc = makeElement("div", "muted", endpoint.description || "No description");
    row.append(titleRow, meta, desc);
    container.append(row);
  });
}

function renderGenericGroups() {
  const container = dom.genericGroups;
  container.innerHTML = "";
  if (!state.filteredEndpoints.length) {
    container.className = "groups-grid empty-state";
    container.textContent = state.endpoints.length ? "No generic controls match the current search." : "No endpoint data yet.";
    return;
  }

  const groups = new Map();
  state.filteredEndpoints.forEach((endpoint) => {
    const type = inferWidgetType(endpoint);
    if (type === "xy-y") return;
    const key = endpoint.group || "/";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(endpoint);
  });

  container.className = "groups-grid";
  Array.from(groups.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .forEach(([groupName, endpoints]) => {
      const card = makeElement("article", "group-card");
      const header = makeElement("div", "group-header");
      header.append(makeElement("strong", "", groupName), makeElement("span", "badge", `${endpoints.length}`));
      card.append(header);

      const grid = makeElement("div", "controls-grid");
      endpoints.sort((a, b) => a.path.localeCompare(b.path)).forEach((endpoint) => {
        const control = buildControl(endpoint);
        if (control) grid.append(control);
      });
      card.append(grid);
      container.append(card);
    });
}

function resolveLayoutBindPath(bind) {
  if (!bind || typeof bind !== "object") return null;
  if (typeof bind.path === "string" && bind.path) {
    return bind.path;
  }
  if (typeof bind.pathTemplate === "string" && bind.pathTemplate) {
    const stateKey = bind.stateKey || "selectedBand";
    const tokenValue = String(getLayoutStateValue(stateKey, bind.defaultValue ?? 1));
    return bind.pathTemplate.replace(/__band__/g, tokenValue);
  }
  return null;
}

function buildLocalChoiceControl(node) {
  const wrap = makeElement("div", "choice-wrap");
  const select = document.createElement("select");
  select.className = "compact-select";
  const options = Array.isArray(node.options) ? node.options : [];
  const stateKey = node.stateKey || node.bind?.stateKey || node.id;
  const currentValue = Number(getLayoutStateValue(stateKey, node.defaultValue ?? 1));
  options.forEach((choice, index) => {
    const option = document.createElement("option");
    option.value = String(index + 1);
    option.textContent = String(choice);
    if (index + 1 === currentValue) option.selected = true;
    select.append(option);
  });
  select.addEventListener("change", () => {
    setLayoutStateValue(stateKey, Number(select.value));
    renderLoadedLayout();
  });
  wrap.append(select);
  return wrap;
}

function renderLayoutNode(node, parent, inheritedStyle = {}) {
  const type = String(node.type || node.TYPE || "panel").toLowerCase();
  const element = makeElement("div", `layout-node ${type}`);
  const style = { ...(node.style || {}), ...inheritedStyle };
  const x = toNumber(node.x, 0);
  const y = toNumber(node.y, 0);
  const w = toNumber(node.w, 0);
  const h = toNumber(node.h, 0);

  element.style.left = `${x}px`;
  element.style.top = `${y}px`;
  if (w > 0) element.style.width = `${w}px`;
  if (h > 0) element.style.height = `${h}px`;
  if (style.bg || style.background) element.style.background = style.bg || style.background;
  if (style.border) element.style.borderColor = style.border;
  if (style.borderWidth != null) element.style.borderWidth = `${style.borderWidth}px`;
  if (style.radius != null) element.style.borderRadius = `${style.radius}px`;
  if (style.colour || style.color) element.style.color = style.colour || style.color;
  if (style.fontSize != null) element.style.fontSize = `${style.fontSize}px`;
  if (style.opacity != null) element.style.opacity = `${style.opacity}`;

  if (type === "label") {
    element.textContent = node.props?.text || node.text || node.label || node.id || "";
  } else {
    const content = makeElement("div", "layout-content");
    const bindPath = resolveLayoutBindPath(node.bind) || node.path || node.props?.path || null;
    const bindEndpoint = bindPath ? state.endpointMap.get(bindPath) || {
      path: bindPath,
      label: node.label || prettyLabel(bindPath),
      type: "f",
      access: 3,
      description: node.description || "",
      range: [{ MIN: 0, MAX: 1 }],
    } : null;

    if (type === "panel" && node.label) {
      content.append(makeElement("strong", "", node.label));
    } else if (type === "filter-graph" && node.bind) {
      content.append(buildFilterGraphControl(node.bind, style));
    } else if (type === "eq-graph" && node.bind) {
      content.append(buildEqGraphControl(node.bind, style));
    } else if (type === "xy" && node.bind?.xPath && node.bind?.yPath) {
      const xEndpoint = state.endpointMap.get(node.bind.xPath) || {
        path: node.bind.xPath,
        label: node.label || prettyLabel(node.bind.xPath),
        type: "f",
        access: 3,
        description: node.description || "",
        range: [{ MIN: 0, MAX: 1 }],
      };
      content.append(buildControl(xEndpoint, "xy-x", { showPath: false }));
    } else if (type === "dropdown" && node.stateKey && Array.isArray(node.options)) {
      content.append(buildLocalChoiceControl(node));
    } else if (bindEndpoint) {
      const requestedWidgetType = type === "knob" ? "slider" : type === "vslider" ? "slider" : type;
      const control = buildControl(bindEndpoint, requestedWidgetType === "button" ? "readout" : requestedWidgetType, {
        showPath: false,
        choices: node.options,
        disabled: node.disabled === true,
      });
      if (control) content.append(control);
    } else if (type === "dropdown" && Array.isArray(node.options)) {
      const staticEndpoint = {
        path: `static:${node.id || 'dropdown'}`,
        label: node.label || prettyLabel(node.id || 'dropdown'),
        access: 0,
        choices: node.options,
        range: [{ MIN: 0, MAX: Math.max(0, node.options.length - 1) }],
      };
      content.append(buildControl(staticEndpoint, "choice", { showPath: false, choices: node.options, disabled: true }));
    } else if (node.label || node.id) {
      content.append(makeElement("div", "muted", node.label || node.id));
    }

    element.append(content);
  }

  parent.append(element);
  if (Array.isArray(node.children)) {
    node.children.forEach((child) => renderLayoutNode(child, element));
  }
}

function renderLoadedLayout() {
  if (!state.layout) {
    dom.layoutRoot.className = "layout-root empty-state";
    dom.layoutRoot.innerHTML = "This target does not expose <code>/ui/layout</code> yet.";
    return;
  }

  dom.layoutRoot.innerHTML = "";
  dom.layoutRoot.className = "layout-root";
  const root = state.layout.root || state.layout;
  if (state.layout.defaultState && typeof state.layout.defaultState === "object") {
    Object.entries(state.layout.defaultState).forEach(([key, value]) => {
      if (state.layoutState[key] == null) {
        state.layoutState[key] = value;
      }
    });
  }
  const stage = makeElement("div", "layout-stage");
  stage.style.width = `${toNumber(root.w, 920)}px`;
  stage.style.height = `${toNumber(root.h, 360)}px`;
  dom.layoutRoot.append(stage);
  renderLayoutNode(root, stage);
}

async function loadLayout() {
  dom.layoutRoot.innerHTML = "";
  try {
    const layout = await fetchJson(`${state.baseUrl}/ui/layout`);
    if (!layout || layout.error) {
      throw new Error(layout?.error || "layout unavailable");
    }
    state.layout = layout;
    state.layoutState = {};
    renderLoadedLayout();
  } catch (error) {
    state.layout = null;
    state.layoutState = {};
    dom.layoutRoot.className = "layout-root empty-state";
    dom.layoutRoot.innerHTML = `This target does not expose <code>/ui/layout</code> yet.<br><span class="muted">${error.message}</span>`;
  }
}

function addSurfaceWidget(endpoint) {
  const existing = state.currentSurface.find((item) => item.path === endpoint.path);
  if (existing) {
    setStatus(`${endpoint.label} is already on the custom surface`);
    return;
  }
  const type = inferWidgetType(endpoint);
  if (type === "xy-y") {
    setStatus("Add the X endpoint for XY pairs, not the Y half", "error");
    return;
  }
  state.currentSurface.push({
    id: crypto.randomUUID(),
    path: endpoint.path,
    widgetType: type === "xy-x" ? "xy-x" : type,
    title: endpoint.label,
  });
  renderCustomSurface();
}

function removeSurfaceWidget(id) {
  state.currentSurface = state.currentSurface.filter((item) => item.id !== id);
  renderCustomSurface();
}

function renderCustomSurface() {
  const container = dom.customSurface;
  container.innerHTML = "";
  if (!state.currentSurface.length) {
    container.className = "custom-surface empty-state";
    container.textContent = "Add parameters from the left browser to build a custom control page.";
    return;
  }

  container.className = "custom-surface";
  state.currentSurface.forEach((widget) => {
    const endpoint = state.endpointMap.get(widget.path);
    if (!endpoint) return;

    const article = makeElement("article", "surface-widget");
    const header = makeElement("div", "header");
    const titleRow = makeElement("div", "title-row");
    const titleBlock = makeElement("div");
    titleBlock.append(makeElement("strong", "", widget.title || endpoint.label), makeElement("div", "path", endpoint.path));
    const removeButton = makeElement("button", "danger", "Remove");
    removeButton.addEventListener("click", () => removeSurfaceWidget(widget.id));
    titleRow.append(titleBlock, removeButton);
    header.append(titleRow);

    const body = makeElement("div", "body");
    const options = makeElement("div", "widget-options");
    const typeSelect = document.createElement("select");
    ["slider", "slider-int", "choice", "toggle", "readout", "xy-x"].forEach((type) => {
      const option = document.createElement("option");
      option.value = type;
      option.textContent = type === "xy-x" ? "xy" : type === "choice" ? "dropdown" : type;
      if (widget.widgetType === type) option.selected = true;
      typeSelect.append(option);
    });
    typeSelect.addEventListener("change", () => {
      widget.widgetType = typeSelect.value;
      renderCustomSurface();
    });

    const titleInput = document.createElement("input");
    titleInput.type = "text";
    titleInput.value = widget.title || endpoint.label;
    titleInput.placeholder = endpoint.label;
    titleInput.addEventListener("change", () => {
      widget.title = titleInput.value.trim() || endpoint.label;
      renderCustomSurface();
    });

    options.append(typeSelect, titleInput);
    body.append(options);

    const control = buildControl({ ...endpoint, label: widget.title || endpoint.label }, widget.widgetType);
    if (control) body.append(control);
    article.append(header, body);
    container.append(article);
  });
}

function renderActiveViews() {
  renderEndpointBrowser();
  renderGenericGroups();
  if (state.activeTab === "custom") renderCustomSurface();
  if (state.activeTab === "layout" && state.layout) renderLoadedLayout();
}

function applySearchFilter() {
  const q = state.search.trim().toLowerCase();
  if (!q) {
    state.filteredEndpoints = [...state.endpoints];
  } else {
    state.filteredEndpoints = state.endpoints.filter((endpoint) => {
      return endpoint.path.toLowerCase().includes(q)
        || endpoint.label.toLowerCase().includes(q)
        || String(endpoint.description || "").toLowerCase().includes(q);
    });
  }
  renderActiveViews();
}

function setActiveTab(tabId) {
  state.activeTab = tabId;
  dom.tabButtons.forEach((button) => button.classList.toggle("active", button.dataset.tab === tabId));
  Object.entries(dom.tabPanels).forEach(([id, panel]) => panel.classList.toggle("active", id === tabId));
  if (tabId === "layout") {
    loadLayout();
  } else if (tabId === "custom") {
    renderCustomSurface();
  }
}

async function connect() {
  state.host = dom.hostInput.value.trim() || "127.0.0.1";
  state.port = clamp(toNumber(dom.portInput.value, 9011), 1, 65535);
  saveConnection();
  loadSurface();
  closeSocket();

  state.baseUrl = `http://${state.host}:${state.port}`;
  setStatus(`Connecting to ${state.baseUrl}...`);

  try {
    const [hostInfo, tree, uiMeta] = await Promise.all([
      fetchJson(`${state.baseUrl}/?HOST_INFO`),
      fetchJson(`${state.baseUrl}/`),
      fetchJson(`${state.baseUrl}/ui/meta`).catch(() => null),
    ]);

    state.hostInfo = hostInfo;
    state.uiMeta = uiMeta;
    state.paramMeta = buildParamMetaMap(uiMeta);
    state.tree = tree;
    state.wsUrl = `ws://${state.host}:${Number(hostInfo?.WS_PORT || state.port)}`;
    state.endpoints = mergeMetadataIntoEndpoints(flattenOscTree(tree))
      .sort((a, b) => a.path.localeCompare(b.path));
    state.endpointMap = new Map(state.endpoints.map((endpoint) => [endpoint.path, endpoint]));
    state.values = new Map();
    state.layout = null;
    updateConnectionMeta();
    applySearchFilter();
    await hydrateCurrentValues();
    connectWebSocket();
    renderActiveViews();
    if (state.activeTab === "layout") {
      await loadLayout();
    }
  } catch (error) {
    console.error(error);
    setStatus(`Connection failed: ${error.message}`, "error");
    dom.connectionMeta.textContent = "";
    state.uiMeta = null;
    state.paramMeta = new Map();
    state.endpoints = [];
    state.filteredEndpoints = [];
    state.endpointMap = new Map();
    state.values = new Map();
    renderActiveViews();
  }
}

function bindEvents() {
  dom.connectForm.addEventListener("submit", (event) => {
    event.preventDefault();
    connect();
  });

  dom.refreshButton.addEventListener("click", () => connect());
  dom.searchInput.addEventListener("input", () => {
    state.search = dom.searchInput.value;
    applySearchFilter();
  });

  dom.reloadLayoutButton.addEventListener("click", () => loadLayout());
  dom.saveSurfaceButton.addEventListener("click", () => saveSurface());
  dom.clearSurfaceButton.addEventListener("click", () => {
    state.currentSurface = [];
    renderCustomSurface();
  });

  dom.tabButtons.forEach((button) => {
    button.addEventListener("click", () => setActiveTab(button.dataset.tab));
  });

  window.addEventListener("beforeunload", () => closeSocket());
}

function init() {
  loadSavedConnection();
  dom.hostInput.value = state.host;
  dom.portInput.value = String(state.port);
  loadSurface();
  bindEvents();
  renderEndpointBrowser();
  renderGenericGroups();
  renderCustomSurface();
}

init();
