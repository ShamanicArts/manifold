import "./fx-module.css";
import project from "../../projects/standalone-fx-module/project.json";
import layout from "../../projects/standalone-fx-module/ui.json";
import { BrowserAudioHost } from "./audio/browser-host.js";
import { PluginControlHost } from "./audio/plugin-control-host.js";
import {
  captureStandaloneFxState,
  captureFxProjectState,
  parseFxProjectState,
  parseStandaloneFxState,
} from "./state/standalone-fx.js";
import { mountProjectUi } from "./widgets/project-ui.js";
import { DEFAULTS, LABELS, VISUAL_NAMES } from "./widgets/fx-slot-data.js";
import { drawText, fillRoundedRect } from "./widgets/compact-slider.js";

const byId = (id) => document.getElementById(id);
const editorMode = new URLSearchParams(location.search).has("editor");
if (editorMode) document.body.classList.add("plugin-editor");
const ui = mountProjectUi(byId("plugin-content"), layout);
const typeSelect = ui.control("type_dropdown");
const typeNames = ui.spec("type_dropdown").options;
const xSelect = ui.control("xy_x_dropdown");
const ySelect = ui.control("xy_y_dropdown");
const pad = ui.element("xy_pad");
const graph = ui.element("filter_graph");
const dots = ui.element("visual_mode_dots");
const values = new Map(
  project.parameters.map((parameter) => [parameter.id, parameter.default]),
);
let typeValues = new Map(DEFAULTS.map((entry, type) => [type, [...entry]]));
let view = editorMode ? "split" : innerWidth < 620 ? "compact" : "split";
let visualMode = "xy";
let xAxis = 0;
let yAxis = 1;
let dragging = false;
let busy = false;
const meterSamples = new Float32Array(1024);
const audio = editorMode ? new PluginControlHost() : new BrowserAudioHost((message) => {
  byId("status").textContent = message;
});
const clamp = (value) => Math.max(0, Math.min(1, Number(value)));
const currentType = () => values.get(0);
const labels = () => LABELS[currentType()];
const current = (index) => values.get(index + 2);
const hasGraph = () => currentType() === 5 || currentType() === 6;
const accent = () =>
  currentType() === 5 ? "#a78bfa" : currentType() === 6 ? "#4ade80" : "#22d3ee";
const status = (message) => {
  byId("status").textContent = message;
};

function applyLayout() {
  const width = layout.widths[view];
  const available = byId("plugin-stage").clientWidth - 28;
  const scale = editorMode ? 1 : Math.max(0.5, Math.min(1.7, available / width));
  byId("plugin-viewport").style.width = `${Math.round(width * scale)}px`;
  byId("plugin-viewport").style.height = `${
    Math.round(layout.height * scale)
  }px`;
  byId("plugin-shell").style.width = `${width}px`;
  byId("plugin-shell").style.transform = `scale(${scale})`;
  ui.layout(view);
  for (const button of document.querySelectorAll("[data-view]")) {
    button.setAttribute("aria-pressed", String(button.dataset.view === view));
  }
  byId("plugin-shell").dataset.view = view;
  syncVisualMode();
}

function syncSlider(id) {
  ui.control(id === 1 ? "mix_knob" : `param${id - 1}`)
    .setValue(values.get(id));
}

function writeControl(id, value) {
  const normalized = clamp(value);
  values.set(id, normalized);
  if (id >= 2) typeValues.get(currentType())[id - 2] = normalized;
  audio.setParameter(id, normalized);
  syncSlider(id);
  drawVisuals();
}

function syncWidgetValues() {
  const names = labels();
  typeSelect.setSelected(currentType());
  for (const [select, axis] of [[xSelect, xAxis], [ySelect, yAxis]]) {
    select.setOptions(names);
    select.setSelected(Math.min(axis, names.length - 1));
  }
  xAxis = xSelect.selected();
  yAxis = ySelect.selected();
  syncSlider(1);
  for (let index = 0; index < 5; index++) {
    const id = index + 2;
    const widget = ui.element(`param${index + 1}`);
    ui.control(`param${index + 1}`)
      .setLabel(names[index] ?? `P${index + 1}`);
    widget.dataset.unused = String(index >= names.length);
    syncSlider(id);
  }
  syncVisualMode();
}

function selectType(type) {
  if (!Number.isInteger(type) || type < 0 || type >= typeNames.length) return;
  const previousHadGraph = hasGraph();
  typeValues.set(currentType(), [0, 1, 2, 3, 4].map(current));
  values.set(0, type);
  audio.setParameter(0, type);
  typeValues.get(type).forEach((value, index) => {
    values.set(index + 2, value);
    if (!editorMode) audio.setParameter(index + 2, value);
  });
  if (hasGraph() && !previousHadGraph) visualMode = "graph";
  if (!hasGraph()) visualMode = "xy";
  syncWidgetValues();
  status(`${typeNames[type]} selected.`);
}

function syncVisualMode() {
  graph.hidden = !hasGraph() || visualMode !== "graph";
  pad.hidden = hasGraph() && visualMode !== "xy";
  dots.hidden = !hasGraph();
  for (const dot of dots.querySelectorAll("button")) {
    dot.dataset.active = String(dot.dataset.mode === visualMode);
  }
  drawVisuals();
}

function contextFor(element) {
  const canvas = element.querySelector("canvas");
  const width = element.clientWidth;
  const height = element.clientHeight;
  if (!width || !height) return null;
  const scale = element.getBoundingClientRect().width / width;
  const ratio = Math.min((devicePixelRatio || 1) * scale, 3);
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  const context = canvas.getContext("2d");
  context.scale(ratio, ratio);
  return { context, width, height };
}

function line(ctx, x1, y1, x2, y2, color, thickness = 1) {
  ctx.strokeStyle = color;
  ctx.lineWidth = thickness;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function panelBackground(ctx, width, height) {
  ctx.fillStyle = "#0d1420";
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "#1a1a3a";
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, width - 1, height - 1);
}

function drawXY() {
  const surface = contextFor(pad);
  if (!surface) return;
  const { context: ctx, width: w, height: h } = surface;
  const xValue = current(xAxis), yValue = current(yAxis);
  const x = Math.floor(xValue * w);
  const y = Math.floor((1 - yValue) * h);
  const color = accent();
  panelBackground(ctx, w, h);
  drawText(ctx, VISUAL_NAMES[currentType()], 4, 2, w - 8, 16,
    color, "left", 11);
  for (let i = 1; i < 4; i++) {
    line(ctx, Math.floor(w * i / 4), 0, Math.floor(w * i / 4), h, "#1a1a3a");
    line(ctx, 0, Math.floor(h * i / 4), w, Math.floor(h * i / 4), "#1a1a3a");
  }
  line(ctx, x, 0, x, h, `${color}44`);
  line(ctx, 0, y, w, y, `${color}44`);
  ctx.fillStyle = `${color}18`;
  ctx.fillRect(0, y, x, h - y);
  const radius = dragging ? 8 : 6;
  if (dragging) fillRoundedRect(ctx, x - radius - 3, y - radius - 3,
    (radius + 3) * 2, (radius + 3) * 2, radius + 3, `${color}33`);
  fillRoundedRect(ctx, x - radius, y - radius, radius * 2, radius * 2,
    radius, dragging ? color : "#ffffff");
  drawText(ctx, `${labels()[xAxis]}: ${Math.floor(xValue * 100 + .5)}%`,
    4, h - 14, Math.floor(w * .5), 12, `${color}88`, "left", 9);
  drawText(ctx, `${labels()[yAxis]}: ${Math.floor(yValue * 100 + .5)}%`,
    Math.floor(w * .5), 2, Math.floor(w * .5) - 4, 12,
    `${color}88`, "left", 9);
}

function magnitude(freq, cutoff, resonance) {
  const omega = freq / cutoff;
  if (omega < 0.1) return 1;
  if (omega > 10) return 0;
  const q = Math.max(0.5, resonance * 2);
  return 1 /
    Math.sqrt(Math.max(1e-10, (1 - omega ** 2) ** 2 + (omega / q) ** 2));
}

function drawGraph() {
  if (!hasGraph()) return;
  const surface = contextFor(graph);
  if (!surface) return;
  const { context: ctx, width: w, height: h } = surface;
  const low = Math.log(80), high = Math.log(16000), dbRange = 14;
  const cutoff = Math.exp(low + current(0) * (high - low));
  const resonance = 0.1 + current(1) * 1.9;
  panelBackground(ctx, w, h);
  const color = accent();
  drawText(ctx, VISUAL_NAMES[currentType()], 4, 2, w - 8, 16,
    color, "left", 11);
  for (const freq of [100, 500, 1000, 5000, 10000]) {
    const x = Math.floor((Math.log(freq) - low) / (high - low) * w);
    line(ctx, x, 0, x, h, "#1a1a3a");
  }
  for (const db of [-24, -12, 0, 12, 24]) {
    const y = Math.floor(h * 0.5 - db / dbRange * h * 0.45);
    if (y >= 0 && y <= h) {
      line(ctx, 0, y, w, y, db === 0 ? "#1f2b4d" : "#1a1a3a");
    }
  }
  const cutoffX = Math.floor(current(0) * w);
  line(ctx, cutoffX, 0, cutoffX, h, `${color}60`);
  const count = Math.max(60, Math.min(w, 200));
  const zeroY = Math.floor(h * .5);
  let previous;
  for (let i = 0; i <= count; i++) {
    const x = Math.floor(i / count * w);
    const freq = Math.exp(low + x / w * (high - low));
    const db = Math.max(
      -dbRange,
      Math.min(
        dbRange,
        20 * Math.log10(magnitude(freq, cutoff, resonance) + 1e-10),
      ),
    );
    const y = Math.max(1, Math.min(h - 1, h * 0.5 - db / dbRange * h * 0.45));
    const pixelY = Math.floor(y);
    if (i > 0) line(ctx, x, pixelY, x, zeroY, `${color}20`, Math.max(1, Math.ceil(w / count)));
    if (previous) line(ctx, previous.x, previous.y, x, pixelY, color, 2);
    previous = { x, y: pixelY };
  }
  const peak = Math.max(
    -dbRange,
    Math.min(
      dbRange,
      20 * Math.log10(magnitude(cutoff, cutoff, resonance) + 1e-10),
    ),
  );
  const y = Math.floor(h * .5 - peak / dbRange * h * .45);
  const radius = dragging ? 7 : 5;
  if (dragging) fillRoundedRect(ctx, cutoffX - radius - 3, y - radius - 3,
    (radius + 3) * 2, (radius + 3) * 2, radius + 3, `${color}44`);
  fillRoundedRect(ctx, cutoffX - radius, y - radius, radius * 2, radius * 2,
    radius, dragging ? color : "#ffffff");
}

function drawVisuals() {
  drawXY();
  drawGraph();
}
function applySurface(event, element) {
  const bounds = element.getBoundingClientRect();
  writeControl(xAxis + 2, (event.clientX - bounds.left) / bounds.width);
  writeControl(yAxis + 2, 1 - (event.clientY - bounds.top) / bounds.height);
}
for (const surface of [pad, graph]) {
  surface.addEventListener("pointerdown", (event) => {
    dragging = true;
    surface.setPointerCapture(event.pointerId);
    applySurface(event, surface);
  });
  surface.addEventListener("pointermove", (event) => {
    if (dragging) applySurface(event, surface);
  });
  for (const name of ["pointerup", "pointercancel"]) {
    surface.addEventListener(name, () => {
      dragging = false;
      drawVisuals();
    });
  }
  surface.addEventListener("keydown", (event) => {
    const amount = event.shiftKey ? .05 : .01;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      writeControl(
        xAxis + 2,
        current(xAxis) + (event.key === "ArrowRight" ? amount : -amount),
      );
    } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      writeControl(
        yAxis + 2,
        current(yAxis) + (event.key === "ArrowUp" ? amount : -amount),
      );
    } else return;
    event.preventDefault();
  });
}
for (const dot of dots.querySelectorAll("button")) {
  dot.addEventListener("click", () => {
    visualMode = dot.dataset.mode;
    syncVisualMode();
  });
}
typeSelect.onChange((type) => selectType(type));
xSelect.onChange((axis) => {
  xAxis = axis;
  drawVisuals();
});
ySelect.onChange((axis) => {
  yAxis = axis;
  drawVisuals();
});
for (let id = 1; id <= 6; id++) {
  ui.control(id === 1 ? "mix_knob" : `param${id - 1}`)
    .onChange((value) => writeControl(id, value));
}
for (const button of document.querySelectorAll("[data-view]")) {
  button.addEventListener("click", () => {
    view = button.dataset.view;
    applyLayout();
  });
}
new ResizeObserver(applyLayout).observe(byId("plugin-stage"));
byId("settings-toggle").addEventListener("click", () => {
  byId("settings-overlay").hidden = !byId("settings-overlay").hidden;
});
byId("settings-close").addEventListener("click", () => {
  byId("settings-overlay").hidden = true;
});

function syncEngine() {
  const running = audio.running;
  byId("audio-toggle").textContent = running ? "Stop audio" : "Start audio";
  byId("engine-indicator").textContent = running ? "Rust/Wasm live" : "Idle";
  byId("input-source").disabled = running;
  byId("open-state").disabled = running;
}
function drawMeter() {
  if (audio.running && audio.analyser) {
    audio.analyser.getFloatTimeDomainData(meterSamples);
    let energy = 0;
    for (const sample of meterSamples) energy += sample * sample;
    const rms = Math.sqrt(energy / meterSamples.length);
    const db = rms > 0 ? 20 * Math.log10(rms) : -Infinity;
    byId("output-meter").style.width = `${
      Math.max(0, Math.min(100, (db + 60) / 60 * 100))
    }%`;
    byId("output-db").textContent = Number.isFinite(db)
      ? `${db.toFixed(1)} dB`
      : "−∞ dB";
  } else {
    byId("output-meter").style.width = "0%";
    byId("output-db").textContent = "−∞ dB";
  }
  requestAnimationFrame(drawMeter);
}
byId("audio-toggle").addEventListener("click", async () => {
  if (busy) return;
  busy = true;
  try {
    if (audio.running) {
      await audio.stop();
      status("Audio stopped.");
    } else {
      status("Preparing Rust/Wasm effect graph…");
      await audio.start(byId("input-source").value, values, project);
    }
  } catch (error) {
    status(`Audio could not start: ${error.message}`);
  } finally {
    busy = false;
    syncEngine();
  }
});
function downloadState(state, filename) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(state, null, 2)], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
byId("save-state").addEventListener("click", () => {
  downloadState(captureStandaloneFxState(values, typeValues), "manifold-standalone-fx.json");
  status("Standalone FX state saved.");
});
byId("save-host-state").addEventListener("click", () => {
  downloadState(captureFxProjectState(project, values, typeValues), "manifold-standalone-fx-host.json");
  status("Host project saved. Its JSON state can also be reopened here.");
});
function applySavedState(state) {
  typeValues = new Map(
    Object.entries(state.typeParameters).map((
      [type, controls],
    ) => [Number(type), [...controls]]),
  );
  values.set(0, state.hostParameters.type);
  values.set(1, state.hostParameters.mix);
  for (let i = 0; i < 5; i++) {
    values.set(i + 2, state.hostParameters[`p/${i}`]);
  }
  visualMode = hasGraph() ? "graph" : "xy";
  syncWidgetValues();
}
if (editorMode) {
  window.manifoldEditorReceive = (document) => {
    const state = document.id === "manifold.standalone-fx-module"
      ? parseFxProjectState(document) : parseStandaloneFxState(document);
    applySavedState(state);
  };
}
byId("open-state").addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    if (audio.running) throw new Error("Stop audio before opening state.");
    const document = JSON.parse(await file.text());
    const state = document.id === "manifold.standalone-fx-module"
      ? parseFxProjectState(document) : parseStandaloneFxState(document);
    applySavedState(state);
    status(`Opened ${file.name}.`);
  } catch (error) {
    status(`State rejected: ${error.message}`);
  } finally {
    event.target.value = "";
  }
});
byId("reset-state").addEventListener("click", () => {
  typeValues = new Map(DEFAULTS.map((entry, type) => [type, [...entry]]));
  values.set(0, 0);
  values.set(1, 0);
  audio.setParameter(0, 0);
  audio.setParameter(1, 0);
  DEFAULTS[0].forEach((value, i) => {
    values.set(i + 2, value);
    audio.setParameter(i + 2, value);
  });
  visualMode = "xy";
  syncWidgetValues();
  status("Original Chorus defaults restored. Raise Mix to hear the effect.");
});
syncWidgetValues();
applyLayout();
if (!editorMode) {
  syncEngine();
  drawMeter();
}
