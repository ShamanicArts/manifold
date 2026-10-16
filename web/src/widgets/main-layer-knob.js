// Canvas port of manifold/ui/widgets/knob.lua's retained display list.
// Main's Vol and Speed controls use the original 60 × 108 layout.
import { brighten } from './compact-slider.js';

function darken(hex, amount) {
  const value = Number.parseInt(hex.slice(1), 16);
  const channels = [16, 8, 0].map(shift => Math.max(0, ((value >>> shift) & 255) - amount));
  return `#${channels.map(channel => channel.toString(16).padStart(2, '0')).join('')}`;
}

function circle(ctx, cx, cy, radius, color) {
  ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.stroke();
}

function arc(ctx, cx, cy, radius, start, end, color) {
  ctx.beginPath();
  ctx.arc(cx, cy, radius, (start - 90) * Math.PI / 180, (end - 90) * Math.PI / 180);
  ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.stroke();
}

export function drawMainLayerKnob(canvas, value, min, max, label, color) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  const cx = w / 2, cy = h * .42, radius = Math.min(w, h) * .32;
  const background = '#1e293b';
  const fraction = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const end = -135 + fraction * 270;
  ctx.clearRect(0, 0, w, h);

  circle(ctx, cx, cy, radius * 1.02, darken(background, 6));
  circle(ctx, cx, cy, radius * 1.02 - 1, background);
  circle(ctx, cx, cy, radius * .66, brighten(background, 6));
  for (const scale of [.96, .91, .86])
    arc(ctx, cx, cy, radius * scale, -135, 135, darken(background, 18));
  if (fraction > 0) {
    arc(ctx, cx, cy, radius * .96 + 1, -135, end, `${color}22`);
    arc(ctx, cx, cy, radius * .96, -135, end, color);
    arc(ctx, cx, cy, radius * .91, -135, end, color);
    arc(ctx, cx, cy, radius * .86, -135, end, brighten(color, 18));
  }

  const angle = (end - 90) * Math.PI / 180;
  const length = radius * .78;
  const ix = cx + Math.cos(angle) * length * .25;
  const iy = cy + Math.sin(angle) * length * .25;
  const px = cx + Math.cos(angle) * length;
  const py = cy + Math.sin(angle) * length;
  ctx.beginPath(); ctx.moveTo(ix, iy); ctx.lineTo(px, py);
  ctx.strokeStyle = '#ffffff55'; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(ix + .5, iy + .5); ctx.lineTo(px + .5, py + .5);
  ctx.strokeStyle = '#e2e8f0'; ctx.stroke();
  ctx.fillStyle = '#e2e8f0'; ctx.beginPath(); ctx.arc(px, py, 2.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = brighten(background, 14); ctx.beginPath(); ctx.arc(cx, cy, 4, 0, Math.PI * 2); ctx.fill();

  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#cbd5e1'; ctx.font = '11px sans-serif';
  ctx.fillText(value.toFixed(2), cx, Math.floor(h * .72) + Math.floor(h * .14) / 2);
  ctx.fillStyle = '#94a3b8'; ctx.font = '10px sans-serif';
  ctx.fillText(label, cx, Math.floor(h * .86) + Math.floor(h * .14) / 2);
}
