// Browser port of manifold/ui/widgets/dropdown.lua's retained main and
// overlay display lists. Selected indices at this host boundary are zero-based.
import { brighten, drawText, fillRoundedRect, rgba } from "./compact-slider.js";

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

function contextFor(canvas, width, height, visualScale) {
  const ratio = Math.min((devicePixelRatio || 1) * visualScale, 3);
  const pixelWidth = Math.round(width * ratio);
  const pixelHeight = Math.round(height * ratio);
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, width, height);
  return ctx;
}

function strokeRoundedRect(ctx, x, y, width, height, radius, color, thickness) {
  if (width <= 0 || height <= 0 || thickness <= 0) return;
  ctx.strokeStyle = rgba(color);
  ctx.lineWidth = thickness;
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  ctx.stroke();
}

export function mountDropdown(element, spec, root) {
  const canvas = document.createElement("canvas");
  element.append(canvas);
  element.tabIndex = 0;
  element.setAttribute("role", "combobox");
  element.setAttribute("aria-haspopup", "listbox");
  element.setAttribute("aria-expanded", "false");
  element.setAttribute("aria-label", spec.id.replaceAll("_", " "));
  const overlay = document.createElement("div");
  overlay.className = "project-dropdown-overlay";
  overlay.hidden = true;
  overlay.setAttribute("role", "listbox");
  overlay.setAttribute("aria-label", `${spec.id.replaceAll("_", " ")} options`);
  const overlayCanvas = document.createElement("canvas");
  overlay.append(overlayCanvas);
  root.append(overlay);

  let options = spec.options ?? [];
  let selected = 0;
  let scrollRow = 0;
  let opened = false;
  let hovered = false;
  let onChange = () => {};
  const radius = spec.radius ?? 6;
  const maxRows = spec.maxVisibleRows ?? 10;
  const color = spec.style?.colour ?? "#38bdf8";
  const background = spec.style?.bg ?? "#1e293b";
  const border = spec.style?.border;
  const borderWidth = spec.style?.borderWidth ?? 1;
  const itemHeight = 30;

  const scaleOf = (target) => target.getBoundingClientRect().width /
    Math.max(1, target.clientWidth);

  function paint() {
    const width = element.clientWidth;
    const height = element.clientHeight;
    if (!width || !height) return;
    const ctx = contextFor(canvas, width, height, scaleOf(element));
    const bg = hovered ? brighten(background, 15) : background;
    const borderColor = border ?? brighten(bg, 30);
    fillRoundedRect(ctx, 1, 1, Math.floor(width - 2), Math.floor(height - 2), radius, bg);
    strokeRoundedRect(ctx, 1, 1, Math.floor(width - 2), Math.floor(height - 2), radius, borderColor, borderWidth);
    strokeRoundedRect(ctx, 1, 1, Math.floor(width - 2), Math.floor(height - 2), radius, borderColor, borderWidth);
    drawText(ctx, options[selected] ?? "---", 10, 0, Math.max(0, Math.floor(width - 30)), height, 0xffe2e8f0, "left", 12);
    drawText(ctx, opened ? "▲" : "▼", Math.floor(width - 22), 0, 16, height, 0xff94a3b8, "center", 10);
  }

  function paintOverlay() {
    if (!opened) return;
    const width = overlay.clientWidth;
    const height = overlay.clientHeight;
    const visibleRows = Math.max(1, Math.min(options.length, maxRows));
    const ctx = contextFor(overlayCanvas, width, height, scaleOf(overlay));
    fillRoundedRect(ctx, 2, 2, width, height, radius, 0x40000000);
    fillRoundedRect(ctx, 0, 0, Math.max(0, width - 2), Math.max(0, height - 2), radius, 0xff1e293b);
    strokeRoundedRect(ctx, 0, 0, Math.max(0, width - 2), Math.max(0, height - 2), radius, border ?? 0xff475569, 1);
    const hasScroll = options.length > visibleRows;
    const scrollbarWidth = hasScroll ? 14 : 0;
    const textWidth = width - 24 - scrollbarWidth;
    for (let row = 0; row < visibleRows && scrollRow + row < options.length; row++) {
      const index = scrollRow + row;
      const y = 2 + row * itemHeight;
      const active = index === selected;
      if (active) fillRoundedRect(ctx, 2, y, Math.max(0, width - 6), itemHeight, 4, 0xff334155);
      drawText(ctx, String(options[index]), 12, y, Math.max(0, textWidth), itemHeight,
        active ? color : 0xffe2e8f0, "left", 12);
    }
    if (hasScroll) {
      const trackX = width - scrollbarWidth - 6;
      const trackY = 4;
      const trackHeight = height - 10;
      const travel = Math.max(1, trackHeight - 28);
      const thumbHeight = Math.max(18, Math.floor(visibleRows / options.length * travel));
      const maxScroll = Math.max(1, options.length - visibleRows);
      const thumbY = trackY + 14 + Math.floor((travel - thumbHeight) * scrollRow / maxScroll);
      fillRoundedRect(ctx, trackX, trackY, scrollbarWidth, trackHeight, 4, 0xff0f172a);
      strokeRoundedRect(ctx, trackX, trackY, scrollbarWidth, trackHeight, 4, 0xff334155, 1);
      drawText(ctx, "▲", trackX, trackY + 1, scrollbarWidth, 12,
        scrollRow > 0 ? 0xffcbd5e1 : 0xff475569, "center", 9);
      drawText(ctx, "▼", trackX, trackY + trackHeight - 13, scrollbarWidth, 12,
        scrollRow + visibleRows < options.length ? 0xffcbd5e1 : 0xff475569, "center", 9);
      fillRoundedRect(ctx, trackX + 2, thumbY, Math.max(6, scrollbarWidth - 4), thumbHeight, 3, 0xff38bdf8);
      if (scrollRow > 0) fillRoundedRect(ctx, 2, 2, Math.max(0, width - 6), 12, 3, 0x221e40af);
      if (scrollRow + visibleRows < options.length) {
        fillRoundedRect(ctx, 2, height - 16, Math.max(0, width - 6), 12, 3, 0x221e40af);
      }
    }
  }

  function close() {
    opened = false;
    overlay.hidden = true;
    element.setAttribute("aria-expanded", "false");
    paint();
  }

  function open() {
    if (!options.length) return;
    opened = true;
    const visibleRows = Math.max(1, Math.min(options.length, maxRows));
    const width = Math.max(220, element.clientWidth);
    const height = visibleRows * itemHeight + 4;
    const maxScroll = Math.max(0, options.length - visibleRows);
    if (selected < scrollRow) scrollRow = selected;
    if (selected >= scrollRow + visibleRows) scrollRow = selected - visibleRows + 1;
    scrollRow = clamp(scrollRow, 0, maxScroll);
    const x = Math.min(element.offsetLeft, Math.max(0, root.clientWidth - width));
    let y = element.offsetTop + element.clientHeight;
    if (y + height > root.clientHeight) y = element.offsetTop - height;
    y = clamp(y, 0, Math.max(0, root.clientHeight - height));
    Object.assign(overlay.style, {
      left: `${Math.floor(x)}px`, top: `${Math.floor(y)}px`,
      width: `${width}px`, height: `${height}px`,
    });
    overlay.hidden = false;
    element.setAttribute("aria-expanded", "true");
    paint();
    paintOverlay();
  }

  function setSelected(index, emit = false) {
    const next = clamp(Math.floor(Number(index)), 0, Math.max(0, options.length - 1));
    if (!Number.isFinite(next) || selected === next) return;
    selected = next;
    element.dataset.value = String(selected);
    element.setAttribute("aria-valuetext", options[selected] ?? "---");
    paint();
    if (opened) paintOverlay();
    if (emit) onChange(selected);
  }

  element.addEventListener("click", () => opened ? close() : open());
  element.addEventListener("pointerenter", () => { hovered = true; paint(); });
  element.addEventListener("pointerleave", () => { hovered = false; paint(); });
  overlay.addEventListener("pointerdown", (event) => {
    const bounds = overlay.getBoundingClientRect();
    const y = (event.clientY - bounds.top) / scaleOf(overlay);
    const row = Math.floor((y - 2) / itemHeight);
    if (row >= 0 && row < Math.min(options.length, maxRows)) {
      setSelected(scrollRow + row, true);
    }
    close();
    event.preventDefault();
  });
  overlay.addEventListener("wheel", (event) => {
    const rows = Math.max(1, Math.min(options.length, maxRows));
    scrollRow = clamp(scrollRow + Math.sign(event.deltaY), 0, Math.max(0, options.length - rows));
    paintOverlay();
    event.preventDefault();
  }, { passive: false });
  element.addEventListener("keydown", (event) => {
    if (event.key === "Escape") close();
    else if (event.key === "Enter" || event.key === " ") opened ? close() : open();
    else if (event.key === "Home") setSelected(0, true);
    else if (event.key === "End") setSelected(options.length - 1, true);
    else if (event.key === "ArrowDown") setSelected(selected + 1, true);
    else if (event.key === "ArrowUp") setSelected(selected - 1, true);
    else return;
    event.preventDefault();
  });
  const closeOnOutsidePointer = (event) => {
    if (opened && !element.contains(event.target) && !overlay.contains(event.target)) close();
  };
  document.addEventListener("pointerdown", closeOnOutsidePointer);
  element.dataset.value = "0";
  element.dataset.optionCount = String(options.length);
  element.setAttribute("aria-valuetext", options[0] ?? "---");
  return {
    paint,
    setOptions(next) {
      options = [...next];
      element.dataset.optionCount = String(options.length);
      selected = clamp(selected, 0, Math.max(0, options.length - 1));
      scrollRow = 0;
      element.dataset.value = String(selected);
      element.setAttribute("aria-valuetext", options[selected] ?? "---");
      paint();
      if (opened) paintOverlay();
    },
    setSelected,
    selected: () => selected,
    onChange(callback) { onChange = callback; },
    close,
    destroy() {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      overlay.remove();
    },
  };
}
