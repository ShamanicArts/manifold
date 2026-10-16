import { decibels, normalizedLevel, formatLevel, surface } from './levels.mjs';

export default function createLevelMeter() {
  return {
    mount(element, api) {
      const { root, status } = surface(element, 'Output level', 'RMS · after output gain');
      const reading = document.createElement('output');
      reading.style.cssText =
        'font:28px ui-monospace,monospace;font-variant-numeric:tabular-nums;margin-top:auto';
      const track = document.createElement('div');
      track.setAttribute('role', 'meter');
      track.setAttribute('aria-label', 'Output RMS in dBFS');
      track.style.cssText = 'height:32px;background:oklch(28% .014 245);overflow:hidden;flex:none';
      const fill = document.createElement('div');
      fill.style.cssText = 'height:100%;transform-origin:left;background:oklch(76% .1 205)';
      track.append(fill);
      const scale = document.createElement('div');
      scale.style.cssText =
        'display:flex;justify-content:space-between;font:11px ui-monospace,monospace;color:oklch(73% .02 245)';
      const low = document.createElement('span'),
        middle = document.createElement('span'),
        high = document.createElement('span');
      scale.append(low, middle, high);
      status.style.marginBottom = 'auto';
      root.append(reading, track, scale, status);
      let frame;
      function draw() {
        const signal = api.input('analysis');
        const floor = api.parameter('floorDb');
        const db = decibels(signal?.rms ?? 0);
        reading.textContent = signal ? `${formatLevel(db)} dBFS` : 'No analysis';
        fill.style.transform = `scaleX(${signal ? normalizedLevel(db, floor) : 0})`;
        fill.style.background = db >= 0 ? 'oklch(74% .13 35)' : 'oklch(76% .1 205)';
        low.textContent = String(floor);
        middle.textContent = String(floor / 2);
        high.textContent = '0 dBFS';
        track.setAttribute('aria-valuemin', String(floor));
        track.setAttribute('aria-valuemax', '0');
        track.setAttribute('aria-valuenow', String(Math.max(floor, Math.min(0, db))));
        track.setAttribute('aria-valuetext', reading.textContent);
        status.textContent = signal
          ? `RMS ${signal.rms.toFixed(4)}`
          : 'Connect Output.analysis and start audio.';
        root.dataset.rms = String(signal?.rms ?? 0);
        root.dataset.db = String(db);
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
