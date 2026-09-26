function prepare(canvas) {
  const width = Math.max(1, canvas.clientWidth);
  const height = Math.max(1, canvas.clientHeight);
  const ratio = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  const context = canvas.getContext('2d');
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);
  context.strokeStyle = '#2a3946';
  context.lineWidth = 1;
  for (const fraction of [0.25, 0.5, 0.75]) {
    context.beginPath(); context.moveTo(0, height * fraction + .5); context.lineTo(width, height * fraction + .5); context.stroke();
  }
  return { context, width, height };
}

export function drawComparison(canvas, series, start, count, scale, colors) {
  const { context, width, height } = prepare(canvas);
  if (!series.length) return;
  series.forEach((samples, seriesIndex) => {
    context.beginPath();
    context.strokeStyle = colors[seriesIndex];
    context.lineWidth = 1.5;
    for (let frame = 0; frame < count; frame++) {
      const value = samples[(start + frame) * 2] || 0;
      const x = frame / Math.max(1, count - 1) * width;
      const y = height / 2 - value / scale * height * .42;
      if (frame === 0) context.moveTo(x, y); else context.lineTo(x, y);
    }
    context.stroke();
  });
}

export function drawLiveSpectrum(canvas, analyser) {
  const { context, width, height } = prepare(canvas);
  if (!analyser) return;
  const data = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(data);
  const nyquist = analyser.context.sampleRate / 2;
  context.beginPath();
  context.strokeStyle = '#a99bed';
  context.lineWidth = 2;
  for (let x = 0; x < width; x++) {
    const frequency = 20 * (1000 ** (x / Math.max(1, width - 1)));
    const index = Math.min(data.length - 1, Math.round(frequency / nyquist * data.length));
    const y = height - 8 - data[index] / 255 * (height - 16);
    if (x === 0) context.moveTo(x, y); else context.lineTo(x, y);
  }
  context.stroke();
}
