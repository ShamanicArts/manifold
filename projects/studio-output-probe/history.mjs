import { decibels, normalizedLevel, surface } from './levels.mjs';

export default function createLevelHistory() {
  return {
    mount(element, api) {
      const { root, status } = surface(
        element,
        'Level history',
        'Output RMS over time · not an audio waveform',
      );
      const canvas = document.createElement('canvas');
      canvas.setAttribute('role', 'img');
      canvas.setAttribute('aria-label', 'Recent output RMS level in dBFS');
      canvas.style.cssText = 'width:100%;min-height:100px;flex:1;min-width:0';
      root.append(canvas, status);
      const context = canvas.getContext('2d');
      const points = [];
      let frame,
        lastSample = -Infinity;
      function draw() {
        const signal = api.input('analysis');
        const now = performance.now(),
          seconds = api.parameter('seconds'),
          floor = api.parameter('floorDb');
        if (signal && now - lastSample >= 40) {
          points.push({ time: now, db: decibels(signal.rms) });
          lastSample = now;
        }
        if (!signal) points.length = 0;
        while (points.length && points[0].time < now - seconds * 1000) points.shift();
        const ratio = Math.min(devicePixelRatio || 1, 2);
        const width = Math.max(1, canvas.clientWidth),
          height = Math.max(1, canvas.clientHeight);
        if (
          canvas.width !== Math.round(width * ratio) ||
          canvas.height !== Math.round(height * ratio)
        ) {
          canvas.width = Math.round(width * ratio);
          canvas.height = Math.round(height * ratio);
        }
        context.setTransform(ratio, 0, 0, ratio, 0, 0);
        context.clearRect(0, 0, width, height);
        const left = 32,
          top = 16,
          right = width - 8,
          bottom = height - 24;
        context.font = '11px system-ui';
        context.lineWidth = 1;
        for (const db of [0, floor / 2, floor]) {
          const y = bottom - normalizedLevel(db, floor) * (bottom - top);
          context.strokeStyle = '#38434c';
          context.beginPath();
          context.moveTo(left, y);
          context.lineTo(right, y);
          context.stroke();
          context.fillStyle = '#abb7c1';
          context.fillText(String(db), 0, y + 4);
        }
        context.fillStyle = '#abb7c1';
        context.fillText(`−${seconds.toFixed(0)} s`, left, height - 4);
        context.textAlign = 'right';
        context.fillText('now', right, height - 4);
        context.textAlign = 'left';
        context.strokeStyle = '#88cad9';
        context.lineWidth = 2;
        context.beginPath();
        points.forEach((point, index) => {
          const x = right - ((now - point.time) / (seconds * 1000)) * (right - left);
          const y = bottom - normalizedLevel(point.db, floor) * (bottom - top);
          if (index === 0) context.moveTo(x, y);
          else context.lineTo(x, y);
        });
        context.stroke();
        status.textContent = signal
          ? 'Change Output gain to trace a level change.'
          : 'Connect Output.analysis and start audio.';
        root.dataset.samples = String(points.length);
        root.dataset.rms = String(signal?.rms ?? 0);
        frame = requestAnimationFrame(draw);
      }
      draw();
      return {
        dispose() {
          cancelAnimationFrame(frame);
          root.remove();
        },
      };
    },
  };
}
