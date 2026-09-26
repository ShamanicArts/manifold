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

export function drawBandBars(canvas, series, scale, colors, labels = false) {
  const { context, width, height } = prepare(canvas);
  const padding = labels ? 18 : 5;
  const bandCount = series[0]?.length ?? 0;
  if (!bandCount) return;
  const bandWidth = width / bandCount;
  for (let band = 0; band < bandCount; band++) {
    for (let index = 0; index < series.length; index++) {
      const barWidth = Math.max(2, bandWidth * 0.65 / series.length);
      const value = Math.min(1, Math.max(0, series[index][band] / scale));
      const barHeight = value * (height - padding - 7);
      const x = band * bandWidth + bandWidth * 0.175 + index * barWidth;
      context.fillStyle = colors[index];
      context.fillRect(x, height - padding - barHeight, barWidth - 1, barHeight);
    }
    if (labels) {
      context.fillStyle = '#8596a2';
      context.font = '10px system-ui';
      context.textAlign = 'center';
      context.fillText(String(band + 1), (band + 0.5) * bandWidth, height - 4);
    }
  }
}

export function drawMeterTrace(canvas, series, scale, colors) {
  const { context, width, height } = prepare(canvas);
  series.forEach((values, index) => {
    context.beginPath();
    context.strokeStyle = colors[index];
    context.lineWidth = 1.5;
    values.forEach((value, sample) => {
      const x = sample / Math.max(1, values.length - 1) * width;
      const y = height - 6 - Math.max(0, value) / scale * (height - 12);
      if (sample === 0) context.moveTo(x, y); else context.lineTo(x, y);
    });
    context.stroke();
  });
}

export function drawCvStageTraces(canvas, nativeMeters, wasmMeters) {
  const { context, width, height } = prepare(canvas);
  const stages = ['Sample / hold', 'Scaled CV', 'Mixed CV', 'Effective gain'];
  const count = nativeMeters.length / 4;
  const lane = height / 4;
  for (let stage = 0; stage < 4; stage++) {
    const middle = lane * (stage + .5);
    context.strokeStyle = '#35444f';
    context.beginPath(); context.moveTo(0, middle); context.lineTo(width, middle); context.stroke();
    for (const [index, meters] of [nativeMeters, wasmMeters].entries()) {
      context.beginPath();
      context.strokeStyle = index === 0 ? '#e2b084' : '#9a8de8';
      context.lineWidth = 1.5;
      for (let block = 0; block < count; block++) {
        const value = (meters[block * 4 + stage] || 0) - (stage === 3 ? 1 : 0);
        const x = block / Math.max(1, count - 1) * width;
        const y = middle - Math.max(-1, Math.min(1, value)) * lane * .38;
        if (block === 0) context.moveTo(x, y); else context.lineTo(x, y);
      }
      context.stroke();
    }
    context.font = '10px system-ui';
    context.fillStyle = '#b3c0c9';
    context.textAlign = 'left';
    context.fillText(stages[stage], 8, lane * stage + 12);
  }
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

export function drawTransferCurve(canvas, drive, mix, output) {
  const { context, width, height } = prepare(canvas);
  context.beginPath();
  context.strokeStyle = '#465766';
  context.moveTo(width / 2, 0);
  context.lineTo(width / 2, height);
  context.stroke();
  context.beginPath();
  context.strokeStyle = '#a4d9bb';
  context.lineWidth = 2;
  for (let index = 0; index <= 200; index++) {
    const input = index / 100 - 1;
    const shaped = Math.max(-1, Math.min(1, (input * (1 - mix) + Math.tanh(input * drive) * mix) * output));
    const x = index / 200 * width;
    const y = height / 2 - shaped * height * .44;
    if (index === 0) context.moveTo(x, y); else context.lineTo(x, y);
  }
  context.stroke();
}
