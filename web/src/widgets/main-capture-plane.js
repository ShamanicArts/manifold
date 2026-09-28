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
  function rangeOverlay(kind) {
    const element = document.createElement('div');
    element.className = `capture-range ${kind}`;
    element.hidden = true;
    const label = document.createElement('span');
    element.append(label);
    return element;
  }
  const hover = rangeOverlay('hover');
  const armed = rangeOverlay('armed');
  function showRange(element, index) {
    element.style.left = `${index * 142}px`;
    element.style.width = `${1278 - index * 142}px`;
    element.querySelector('span').textContent = `${labels[index]} bars`;
    element.hidden = false;
  }
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
    element.addEventListener('mouseenter', () => showRange(hover, index));
    root.append(element);
    return { element, canvas, duration };
  });
  root.append(hover, armed);
  root.addEventListener('mouseleave', () => { hover.hidden = true; });

  return {
    setMode(traditional) {
      for (const strip of strips) strip.element.title = `${strip.duration} bars — click to ${traditional ? 'arm' : 'commit'} recent audio`;
    },
    render(segments, armedBars) {
      const armedIndex = strips.findIndex(strip => strip.duration === armedBars);
      if (armedIndex >= 0) showRange(armed, armedIndex);
      else armed.hidden = true;
      strips.forEach((strip, index) => drawStrip(strip.canvas, segments[index] ?? []));
    },
  };
}
