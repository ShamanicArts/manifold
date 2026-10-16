// A Canvas renderer consuming portable fields. A different graphics backend
// can consume these same samples without borrowing a Three.js object handle.
export default function fieldComparison() {
  return {
    mount(element, api) {
      const canvas = document.createElement('canvas');
      canvas.style.cssText = 'width:100%;height:100%;display:block;background:#131a20';
      element.append(canvas);
      const context = canvas.getContext('2d');
      // Keep independent backing images: native WebKit may defer drawImage
      // uploads until after this frame's two panel draws have been submitted.
      const buffers = [document.createElement('canvas'), document.createElement('canvas')];
      function panel(index, field, x, y, width, height, scale) {
        if (!field) {
          context.fillStyle = '#abb8c3';
          context.fillText('Connect a field input', x + 12, y + height / 2);
          return;
        }
        const buffer = buffers[index],
          pixels = buffer.getContext('2d');
        if (buffer.width !== field.width || buffer.height !== field.height) {
          buffer.width = field.width;
          buffer.height = field.height;
        }
        const image = pixels.createImageData(field.width, field.height);
        for (let i = 0; i < field.values.length; i++) {
          const value = field.values[i],
            v = Math.max(-1, Math.min(1, value / scale));
          const contour = Math.exp(-Math.abs(v) * 30);
          const light = 0.25 + 0.75 * Math.abs(v);
          image.data.set(
            [
              Math.round(24 + (v > 0 ? 160 : 24) * light + contour * 65),
              Math.round(42 + (v > 0 ? 70 : 115) * light + contour * 65),
              Math.round(50 + (v > 0 ? 35 : 160) * light + contour * 65),
              255,
            ],
            i * 4,
          );
        }
        pixels.putImageData(image, 0, 0);
        context.drawImage(buffer, x, y, width, height);
        let peak = 0;
        for (const value of field.values) peak = Math.max(peak, Math.abs(value));
        context.fillStyle = '#aabac8';
        context.fillText(
          width < 180
            ? `peak ${peak.toFixed(4)}`
            : `${field.width} × ${field.height} samples · peak ${peak.toFixed(4)}`,
          x,
          y + height + 22,
        );
      }
      return {
        update() {
          const ratio = Math.min(devicePixelRatio || 1, 2);
          const width = Math.max(1, Math.round(element.clientWidth * ratio));
          const height = Math.max(1, Math.round(element.clientHeight * ratio));
          if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
          }
          context.setTransform(ratio, 0, 0, ratio, 0, 0);
          const w = width / ratio,
            h = height / ratio;
          context.clearRect(0, 0, w, h);
          context.font = '12px system-ui';
          context.fillStyle = '#e1e8ee';
          context.fillText(
            w < 480 ? 'STANDING FIELD → RELIEF' : 'STANDING FIELD  →  AUDIO-DRIVEN RELIEF',
            18,
            26,
          );
          const energy = api.input('energy') ?? 0;
          context.fillStyle = '#aabac8';
          context.fillText(
            w < 480
              ? `Output energy ${energy.toFixed(3)}`
              : `Output analysis → level response · energy ${energy.toFixed(3)}`,
            18,
            48,
          );
          const side = Math.max(10, Math.min((w - 54) / 2, h - 132)),
            left = (w - side * 2 - 18) / 2;
          context.fillText(side < 180 ? 'SOURCE' : 'SOURCE · STANDING MODES', left, 75);
          context.fillText(side < 180 ? 'RELIEF' : 'RESULT · RELIEF RULE', left + side + 18, 75);
          panel(0, api.input('source'), left, 86, side, side, 2);
          panel(1, api.input('relief'), left + side + 18, 86, side, side, api.parameter('range'));
          canvas.dataset.energy = String(energy);
          canvas.dataset.connected = String(!!api.input('relief'));
        },
        dispose() {
          canvas.remove();
        },
      };
    },
  };
}
