// Direct browser port of manifold/ui/widgets/slider.lua's compact retained
// display list and mouse mapping. The Canvas commands below follow that list.
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const round = (value) => Math.floor(value + 0.5);

export function rgba(argb) {
  if (typeof argb === "string") return argb;
  const value = argb;
  return `rgba(${(value >>> 16) & 255},${(value >>> 8) & 255},${value & 255},${((value >>> 24) & 255) / 255})`;
}

export function brighten(hex, amount) {
  const value = Number.parseInt(hex.slice(1), 16);
  const channels = [16, 8, 0].map((shift) =>
    Math.min(255, ((value >>> shift) & 255) + amount));
  return `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

export function fillRoundedRect(ctx, x, y, width, height, radius, color) {
  if (width <= 0 || height <= 0) return;
  ctx.fillStyle = rgba(color);
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, Math.min(radius, width / 2, height / 2));
  ctx.fill();
}

export function drawText(ctx, text, x, y, width, height, color, align, fontSize) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, width, height);
  ctx.clip();
  ctx.font = `${fontSize}px sans-serif`;
  ctx.textBaseline = "top";
  ctx.fillStyle = rgba(color);
  // RuntimeNodeRenderer.cpp applies a 4px text inset on both alignments.
  const measured = ctx.measureText(text);
  const textX = align === "right"
    ? x + Math.max(0, width - measured.width - 4)
    : align === "center"
      ? x + Math.max(0, (width - measured.width) / 2)
      : x + 4;
  const textY = y + Math.max(0, (height - fontSize) / 2);
  ctx.fillText(text, textX, textY);
  ctx.restore();
}

export function mountCompactSlider(element, spec) {
  const canvas = document.createElement("canvas");
  element.append(canvas);
  element.tabIndex = 0;
  element.setAttribute("role", "slider");
  element.setAttribute("aria-orientation", "horizontal");
  element.style.touchAction = "none";
  const min = spec.min ?? 0;
  const max = spec.max ?? 1;
  const step = spec.step ?? 0;
  const defaultValue = spec.value ?? min;
  let value = defaultValue;
  let label = spec.label ?? "";
  let hovered = false;
  let dragging = false;
  let onChange = () => {};

  function formatValue() {
    const suffix = spec.suffix ?? "";
    if (step >= 1) return `${round(value)}${suffix}`;
    if (Math.abs(value) >= 1000) return `${value.toFixed(0)}${suffix}`;
    if (Math.abs(value) >= 100) return `${value.toFixed(1)}${suffix}`;
    return `${value.toFixed(2)}${suffix}`;
  }

  function paint() {
    const width = element.clientWidth;
    const height = element.clientHeight;
    if (!width || !height) return;
    const scale = element.getBoundingClientRect().width / width;
    const ratio = Math.min((devicePixelRatio || 1) * scale, 3);
    const pixelWidth = Math.round(width * ratio);
    const pixelHeight = Math.round(height * ratio);
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    const ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const fill = dragging
      ? brighten(spec.style.colour, 20)
      : hovered ? brighten(spec.style.colour, 10) : spec.style.colour;
    const baseT = clamp((value - min) / Math.max(0.001, max - min), 0, 1);
    const fontSize = Math.min(10, Math.max(7, height - 4));
    fillRoundedRect(ctx, 0, 0, width, height, 2, spec.style.bg);
    fillRoundedRect(ctx, 0, 0, Math.max(0, round(width * baseT)), height, 2, fill);
    fillRoundedRect(ctx, 0, 0, width, height, 2, hovered ? 0x50000000 : 0x44000000);
    if (label) {
      drawText(ctx, label, 4, 1, Math.max(1, width - 6), height, 0xb0000000, "left", fontSize);
      drawText(ctx, label, 3, 0, Math.max(1, width - 6), height, 0xfff8fafc, "left", fontSize);
    }
    if (spec.showValue !== false) {
      const formatted = formatValue();
      drawText(ctx, formatted, 4, 1, Math.max(1, width - 6), height, 0xb0000000, "right", fontSize);
      drawText(ctx, formatted, 3, 0, Math.max(1, width - 6), height, 0xffe2e8f0, "right", fontSize);
    }
  }

  function setValue(next, emit = false) {
    const numeric = Number(next);
    if (!Number.isFinite(numeric)) return;
    const normalized = clamp(numeric, min, max);
    if (normalized === value) return;
    value = normalized;
    element.setAttribute("aria-valuenow", String(value));
    element.setAttribute("aria-valuetext", formatValue());
    paint();
    if (emit) onChange(value);
  }

  function valueFromPointer(event) {
    const bounds = element.getBoundingClientRect();
    const fraction = clamp((event.clientX - bounds.left) / Math.max(1, bounds.width), 0, 1);
    const raw = min + fraction * (max - min);
    const snapped = step > 0 ? round(raw / step) * step : raw;
    setValue(clamp(snapped, min, max), true);
  }

  element.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    dragging = true;
    element.setPointerCapture(event.pointerId);
    valueFromPointer(event);
    paint();
  });
  element.addEventListener("pointermove", (event) => {
    if (dragging) valueFromPointer(event);
  });
  for (const name of ["pointerup", "pointercancel", "lostpointercapture"]) {
    element.addEventListener(name, () => {
      dragging = false;
      paint();
    });
  }
  element.addEventListener("pointerenter", () => { hovered = true; paint(); });
  element.addEventListener("pointerleave", () => { hovered = false; paint(); });
  element.addEventListener("dblclick", () => setValue(defaultValue, true));
  element.addEventListener("keydown", (event) => {
    const increment = step || (max - min) / 100;
    const delta = event.key === "ArrowRight" || event.key === "ArrowUp"
      ? increment : event.key === "ArrowLeft" || event.key === "ArrowDown"
        ? -increment : 0;
    if (delta) setValue(clamp(round((value + delta) / increment) * increment, min, max), true);
    else if (event.key === "Home") setValue(min, true);
    else if (event.key === "End") setValue(max, true);
    else return;
    event.preventDefault();
  });
  element.setAttribute("aria-valuemin", String(min));
  element.setAttribute("aria-valuemax", String(max));
  element.setAttribute("aria-valuenow", String(value));
  element.setAttribute("aria-valuetext", formatValue());
  element.setAttribute("aria-label", label);
  return {
    setValue,
    setLabel(next) {
      label = String(next ?? "");
      element.setAttribute("aria-label", label);
      paint();
    },
    onChange(callback) { onChange = callback; },
    paint,
  };
}
