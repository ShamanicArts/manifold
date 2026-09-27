// Main's nine capture strips follow the fixed geometry in
// Main/ui/components/shared_capture_plane.ui.lua.
function drawStrip(canvas, peaks) {
  const ctx = canvas.getContext('2d'), w = canvas.width, h = canvas.height;
  ctx.fillStyle = '#0f1b2d'; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#ffffff22';
  ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();
  ctx.strokeStyle = '#22d3ee';
  for (let bin = 0; bin < peaks.length; bin++) {
    if (peaks[bin] <= 0) continue;
    const x = 2 + bin * (w - 4) / peaks.length;
    const height = Math.max(1, peaks[bin] * h * .45);
    ctx.beginPath(); ctx.moveTo(x, h / 2 - height); ctx.lineTo(x, h / 2 + height); ctx.stroke();
  }
  ctx.strokeStyle = '#47556966'; ctx.strokeRect(.5, .5, w - 1, h - 1);
}

export function mountMainCapturePlane(root, bars, labels, onSegment) {
  const strips = bars.map((duration, index) => {
    const element = document.createElement('div');
    element.className = 'segment';
    const canvas = document.createElement('canvas');
    canvas.width = 142; canvas.height = 122;
    const label = document.createElement('span');
    label.textContent = labels[index];
    element.append(canvas, label);
    element.title = `${labels[index]} bars — click to commit recent audio`;
    element.addEventListener('click', () => onSegment(duration));
    element.addEventListener('mouseenter', () => strips.forEach((strip, i) => strip.element.classList.toggle('hovered', i >= index)));
    element.addEventListener('mouseleave', () => strips.forEach(strip => strip.element.classList.remove('hovered')));
    root.append(element);
    return { element, canvas, duration };
  });

  return {
    setMode(traditional) {
      for (const strip of strips) strip.element.title = `${strip.duration} bars — click to ${traditional ? 'arm' : 'commit'} recent audio`;
    },
    render(segments, armedBars) {
      strips.forEach((strip, index) => {
        strip.element.classList.toggle('armed', armedBars === strip.duration);
        drawStrip(strip.canvas, segments[index] ?? []);
      });
    },
  };
}
