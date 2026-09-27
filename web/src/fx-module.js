import "./fx-module.css";
import project from "../../projects/standalone-fx-slice/project.json";
import { BrowserAudioHost } from "./audio/browser-host.js";
import {
  captureStandaloneFxState,
  parseStandaloneFxState,
} from "./state/standalone-fx.js";

// Labels and initial slot values come from the legacy FX widget behavior and
// the corresponding Rust EffectSlot defaults. The DSP remains in Rust/Wasm.
const LABELS = [
  ["Rate", "Depth", "Feedback", "Spread", "Voices"],
  ["Rate", "Depth", "Feedback", "Spread", "Stages"],
  ["Drive", "Curve", "Output", "Bias"],
  ["Threshold", "Ratio", "Attack", "Release", "Knee"],
  ["Width", "MonoLow"],
  ["Cutoff", "Reso"],
  ["Cutoff", "Reso", "Drive"],
  ["Room", "Damp"],
  ["Time", "Feedback"],
  ["Taps", "Feedback"],
  ["Pitch", "Window", "Feedback"],
  ["Grain", "Density", "Position", "Spray"],
  ["Freq", "Depth", "Spread"],
  ["Vowel", "Shift", "Reso", "Drive"],
  ["Low", "High", "Mid"],
  ["Threshold", "Drive", "Release", "SoftClip"],
  ["Attack", "Sustain", "Sensitivity"],
  ["Bits", "Rate", "Output"],
  ["Size", "Pitch", "Feedback", "Filter"],
  ["Time", "Window", "Feedback"],
  ["Length", "Gate", "Prob", "Filter"],
];
const TYPE_NAMES = [
  "Chorus",
  "Phaser",
  "WaveShaper",
  "Compressor",
  "Stereo Widener",
  "Filter",
  "SVF Filter",
  "Reverb",
  "Stereo Delay",
  "Multitap",
  "Pitch Shift",
  "Granulator",
  "Ring Mod",
  "Formant",
  "EQ",
  "Limiter",
  "Transient",
  "BitCrusher",
  "Shimmer",
  "Reverse Delay",
  "Stutter",
];
const DEFAULTS = [
  [.5, .5, .2, .6, .4],
  [.5, .5, .4, .5, .4],
  [.3, 0, .7, .5, .5],
  [.4, .3, .1, .3, .5],
  [.6, .4, .5, .5, .5],
  [.5, .2, .5, .5, .5],
  [.5, .4, .1, .5, .5],
  [.5, .4, .5, .5, .5],
  [.3, .3, .5, .5, .5],
  [.3, .3, .5, .5, .5],
  [.5, .5, .2, .5, .5],
  [.3, .4, .6, .25, .5],
  [.3, 1, .2, .5, .5],
  [0, .5, .4, .3, .5],
  [.5, .5, .5, .5, .5],
  [.5, .3, .4, .4, .5],
  [.5, .5, .5, .5, .5],
  [.3, .12, .55, .5, .5],
  [.6, .75, .7, .5, .5],
  [.2, .25, .47, .5, .5],
  [.05, .8, .8, .25, .5],
];
const COLORS = [
  ["#4ade80", "#102317"],
  ["#22d3ee", "#08212a"],
  ["#38bdf8", "#0b1c2e"],
  ["#a78bfa", "#1e1b33"],
  ["#f472b6", "#2b1020"],
  ["#fbbf24", "#2b2008"],
];
const byId = (id) => document.getElementById(id);
const status = byId("status");
const typeSelect = byId("effect-type");
const xSelect = byId("x-axis");
const ySelect = byId("y-axis");
const pad = byId("xy-pad");
const canvas = byId("xy-canvas");
const values = new Map(
  project.parameters.map((parameter) => [parameter.id, parameter.default]),
);
let typeValues = new Map(DEFAULTS.map((entry, type) => [type, [...entry]]));
let xAxis = 0;
let yAxis = 1;
let dragging = false;
let busy = false;
const audio = new BrowserAudioHost((message) => {
  status.textContent = message;
});
const meterSamples = new Float32Array(1024);

function currentType() {
  return values.get(0);
}
function currentLabels() {
  return LABELS[currentType()];
}
function currentControl(index) {
  return values.get(index + 2);
}
function clamp(value) {
  return Math.min(1, Math.max(0, Number(value)));
}
function displayValue(index, normalized) {
  if (currentType() === 0 && index === 0) {
    return `${(0.08 + 2.32 * normalized).toFixed(2)} Hz`;
  }
  if (currentType() === 0 && index === 4) {
    return String(
      Math.min(4, Math.max(1, Math.floor(1 + 5 * normalized + .5))),
    );
  }
  return `${Math.round(normalized * 100)}%`;
}
function setStatus(message) {
  status.textContent = message;
}

function writeControl(id, value) {
  const normalized = clamp(value);
  values.set(id, normalized);
  if (id >= 2) typeValues.get(currentType())[id - 2] = normalized;
  audio.setParameter(id, normalized);
  const row = byId(`control-${id}`);
  if (row) {
    const range = row.querySelector("input");
    range.value = String(normalized);
    range.style.setProperty("--fill", `${normalized * 100}%`);
    row.querySelector("output").textContent = id === 1
      ? `${Math.round(normalized * 100)}%`
      : displayValue(id - 2, normalized);
  }
  drawPad();
}

function addControl(id, label, index) {
  const row = document.createElement("div");
  row.className = "compact-control";
  row.id = `control-${id}`;
  const [accent, tint] = COLORS[index];
  row.style.setProperty("--accent", accent);
  row.style.setProperty("--tint", tint);
  const controlLabel = document.createElement("label");
  controlLabel.htmlFor = `range-${id}`;
  controlLabel.textContent = label;
  controlLabel.title = label;
  const range = document.createElement("input");
  range.type = "range";
  range.id = `range-${id}`;
  range.min = "0";
  range.max = "1";
  range.step = "0.001";
  range.value = String(values.get(id));
  range.style.setProperty("--fill", `${values.get(id) * 100}%`);
  range.setAttribute("aria-label", label);
  const output = document.createElement("output");
  output.htmlFor = range.id;
  output.textContent = id === 1
    ? `${Math.round(values.get(id) * 100)}%`
    : displayValue(id - 2, values.get(id));
  range.addEventListener("input", () => writeControl(id, range.value));
  row.append(controlLabel, range, output);
  return row;
}

function renderControls() {
  const labels = currentLabels();
  for (const [select, current] of [[xSelect, xAxis], [ySelect, yAxis]]) {
    select.replaceChildren(...labels.map((label, index) => {
      const option = new Option(label, String(index));
      return option;
    }));
    select.value = String(Math.min(current, labels.length - 1));
  }
  xAxis = Number(xSelect.value);
  yAxis = Number(ySelect.value);
  byId("control-list").replaceChildren(
    addControl(1, "Mix", 0),
    ...labels.map((label, index) => addControl(index + 2, label, index + 1)),
  );
  byId("visual-title").textContent = TYPE_NAMES[currentType()].toUpperCase();
  drawPad();
}

function selectType(type) {
  if (!Number.isInteger(type) || type < 0 || type >= LABELS.length) return;
  typeValues.set(currentType(), [0, 1, 2, 3, 4].map(currentControl));
  values.set(0, type);
  typeSelect.value = String(type);
  audio.setParameter(0, type);
  const restored = typeValues.get(type);
  for (let index = 0; index < 5; index++) {
    values.set(index + 2, restored[index]);
    audio.setParameter(index + 2, restored[index]);
  }
  renderControls();
  setStatus(
    `${TYPE_NAMES[type]} selected · settings restored for this effect.`,
  );
}

function drawPad() {
  const width = pad.clientWidth;
  const height = pad.clientHeight;
  if (!width || !height) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  const x = currentControl(xAxis) * width;
  const y = (1 - currentControl(yAxis)) * height;
  ctx.fillStyle = "#0d1420";
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "#24334a";
  ctx.lineWidth = 1;
  for (let i = 1; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(width * i / 4, 0);
    ctx.lineTo(width * i / 4, height);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, height * i / 4);
    ctx.lineTo(width, height * i / 4);
    ctx.stroke();
  }
  ctx.fillStyle = "#22d3ee1e";
  ctx.fillRect(0, y, x, height - y);
  ctx.strokeStyle = "#22d3ee80";
  ctx.beginPath();
  ctx.moveTo(x, 0);
  ctx.lineTo(x, height);
  ctx.moveTo(0, y);
  ctx.lineTo(width, y);
  ctx.stroke();
  ctx.fillStyle = dragging ? "#22d3ee" : "#f5ffff";
  ctx.beginPath();
  ctx.arc(x, y, dragging ? 8 : 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#86d2dc";
  ctx.font = "10px ui-monospace, monospace";
  ctx.fillText(
    `${currentLabels()[xAxis]}: ${Math.round(currentControl(xAxis) * 100)}%`,
    7,
    height - 8,
  );
  ctx.textAlign = "right";
  ctx.fillText(
    `${currentLabels()[yAxis]}: ${Math.round(currentControl(yAxis) * 100)}%`,
    width - 7,
    31,
  );
}

function applyPad(event) {
  const bounds = pad.getBoundingClientRect();
  writeControl(xAxis + 2, (event.clientX - bounds.left) / bounds.width);
  writeControl(yAxis + 2, 1 - (event.clientY - bounds.top) / bounds.height);
}

function syncEngine() {
  const running = audio.running;
  byId("audio-toggle").textContent = running ? "Stop audio" : "Start audio";
  byId("engine-indicator").textContent = running ? "Rust/Wasm live" : "Idle";
  byId("engine-indicator").dataset.running = String(running);
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

typeSelect.replaceChildren(
  ...TYPE_NAMES.map((label, type) => new Option(label, String(type))),
);
typeSelect.value = "0";
typeSelect.addEventListener(
  "change",
  () => selectType(Number(typeSelect.value)),
);
xSelect.addEventListener("change", () => {
  xAxis = Number(xSelect.value);
  drawPad();
});
ySelect.addEventListener("change", () => {
  yAxis = Number(ySelect.value);
  drawPad();
});
pad.addEventListener("pointerdown", (event) => {
  dragging = true;
  pad.setPointerCapture(event.pointerId);
  applyPad(event);
});
pad.addEventListener("pointermove", (event) => {
  if (dragging) applyPad(event);
});
pad.addEventListener("pointerup", () => {
  dragging = false;
  drawPad();
});
pad.addEventListener("pointercancel", () => {
  dragging = false;
  drawPad();
});
pad.addEventListener("keydown", (event) => {
  const amount = event.shiftKey ? .05 : .01;
  if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
    writeControl(
      xAxis + 2,
      currentControl(xAxis) + (event.key === "ArrowRight" ? amount : -amount),
    );
  } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
    writeControl(
      yAxis + 2,
      currentControl(yAxis) + (event.key === "ArrowUp" ? amount : -amount),
    );
  } else return;
  event.preventDefault();
});
new ResizeObserver(drawPad).observe(pad);
byId("audio-toggle").addEventListener("click", async () => {
  if (busy) return;
  busy = true;
  try {
    if (audio.running) {
      await audio.stop();
      setStatus("Audio stopped. State can be opened now.");
    } else {
      setStatus("Preparing Rust/Wasm effect graph…");
      await audio.start(byId("input-source").value, values, project);
    }
  } catch (error) {
    setStatus(`Audio could not start: ${error.message}`);
  } finally {
    busy = false;
    syncEngine();
  }
});
byId("save-state").addEventListener("click", () => {
  const state = captureStandaloneFxState(values, typeValues);
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(state, null, 2)], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = "manifold-standalone-fx.json";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
  setStatus(
    `Saved ${TYPE_NAMES[currentType()]} and the settings for all 21 effects.`,
  );
});
byId("open-state").addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    if (audio.running) throw new Error("Stop audio before opening state.");
    const state = parseStandaloneFxState(JSON.parse(await file.text()));
    typeValues = new Map(
      Object.entries(state.typeParameters).map((
        [type, controls],
      ) => [Number(type), [...controls]]),
    );
    values.set(0, state.hostParameters.type);
    values.set(1, state.hostParameters.mix);
    for (let index = 0; index < 5; index++) {
      values.set(index + 2, state.hostParameters[`p/${index}`]);
    }
    typeSelect.value = String(currentType());
    renderControls();
    setStatus(`Opened ${file.name} · ${TYPE_NAMES[currentType()]} selected.`);
  } catch (error) {
    setStatus(`State rejected: ${error.message}`);
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
  DEFAULTS[0].forEach((value, index) => {
    values.set(index + 2, value);
    audio.setParameter(index + 2, value);
  });
  typeSelect.value = "0";
  renderControls();
  setStatus(
    "Original Standalone FX defaults restored. Raise Mix to audition Chorus.",
  );
});

renderControls();
syncEngine();
drawMeter();
