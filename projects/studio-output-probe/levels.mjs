// Shared by both custom nodes. Levels are RMS observations, not audio samples.
export function decibels(rms) {
  return rms > 0 ? 20 * Math.log10(rms) : -Infinity;
}
export function normalizedLevel(db, floor) {
  return Math.min(1, Math.max(0, (db - floor) / -floor));
}
export function formatLevel(db) {
  return Number.isFinite(db) ? db.toFixed(1) : '−∞';
}
export function surface(element, title, detail) {
  const root = document.createElement('section');
  root.style.cssText =
    'box-sizing:border-box;height:100%;padding:18px;display:flex;flex-direction:column;gap:12px;background:oklch(21% .012 245);color:oklch(92% .01 245);font:13px system-ui;overflow:auto';
  const heading = document.createElement('strong');
  heading.textContent = title;
  heading.style.cssText = 'font-size:15px;font-weight:600';
  const note = document.createElement('span');
  note.textContent = detail;
  note.style.cssText = 'color:oklch(73% .02 245);font-size:12px;line-height:1.5';
  const status = document.createElement('span');
  status.style.cssText = 'font-size:12px;color:oklch(73% .02 245)';
  root.append(heading, note);
  element.append(root);
  return { root, status };
}
