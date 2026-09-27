// Version-2 Main session rack contract. Validate before touching the live UI or audio engine.
import { LABELS } from '../widgets/fx-slot-data.js';

const validNumber = (value, min, max) => Number.isFinite(value) && value >= min && value <= max;
const validInteger = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;

export function validateMainRackState(rack, requireLfo = true, modulation = null) {
  const source = rack?.source, adsr = rack?.adsr, filter = rack?.filter;
  const eq = rack?.eq;
  const sourceRanges = {
    sampleBars: [.0625, 16], sampleRoot: [12, 96], sampleBlend: [0, 1],
    sampleXfade: [0, 50], sampleStretch: [.25, 4], samplePitch: [-24, 24],
    blendDepth: [0, 1], output: [0, 2],
  };
  const sourceIntegers = {
    waveform: [0, 4], waveRender: [0, 1], pitchMode: [0, 2],
    blendMode: [0, 5], keytrack: [0, 2], sampleSource: [0, 4], sampleMode: [0, 1],
  };
  if (!source || !['wave', 'sample', 'blend'].includes(source.tab)
    || Object.entries(sourceRanges).some(([key, [min, max]]) => !validNumber(source[key], min, max))
    || Object.entries(sourceIntegers).some(([key, [min, max]]) => !validInteger(source[key], min, max))
    || !adsr || !validNumber(adsr.attack, 1, 5000) || !validNumber(adsr.decay, 1, 5000)
    || !validNumber(adsr.sustain, 0, 100) || !validNumber(adsr.release, 1, 10000)
    || !filter || !validInteger(filter.mode, 0, 3)
    || !validNumber(filter.cutoff, 80, 16000) || !validNumber(filter.resonance, .1, 2)) {
    throw new Error('Invalid Main rack state.');
  }
  for (const fx of [rack.fx1, rack.fx2]) {
    if (!fx || !validInteger(fx.selected, 0, 20) || !validNumber(fx.mix, 0, 1)
      || !Array.isArray(fx.parameters) || fx.parameters.length !== 21
      || fx.parameters.some(values => !Array.isArray(values) || values.length !== 5
        || values.some(value => !validNumber(value, 0, 1)))
      || !validInteger(fx.xIndex, 0, LABELS[fx.selected].length - 1)
      || !validInteger(fx.yIndex, 0, LABELS[fx.selected].length - 1)
      || !['xy', 'graph'].includes(fx.mode)
      || (fx.mode === 'graph' && fx.selected !== 5 && fx.selected !== 6)) {
      throw new Error('Invalid Main FX slot state.');
    }
  }
  if (!eq || !Array.isArray(eq.bands) || eq.bands.length !== 8
    || !validInteger(eq.selected, -1, 7) || !validInteger(eq.insertType, 0, 5)
    || (eq.selected >= 0 && eq.bands[eq.selected]?.enabled !== true)
    || eq.bands.some(band => !band || typeof band.enabled !== 'boolean'
      || !validInteger(band.type, 0, 6) || !validNumber(band.freq, 20, 20000)
      || !validNumber(band.gain, -24, 24) || !validNumber(band.q, .1, 24))) {
    throw new Error('Invalid Main EQ state.');
  }
  const lfo = rack.lfo;
  if (requireLfo || lfo !== undefined) {
    const route = lfo?.route;
    if (!lfo || !validInteger(lfo.shape, 0, 5) || !validNumber(lfo.rate, .01, 20)
      || !validNumber(lfo.depth, 0, 1) || !validNumber(lfo.phase, 0, 360)
      || !validInteger(lfo.retrig, 0, 1) || !route
      || !validInteger(route.source, 0, 3)
      || !(modulation ? Object.values(modulation.targets) : [0, 22, 23]).includes(route.target)
      || !validNumber(route.amount, -1, 1) || !validNumber(route.bias, -1, 1)
      || !validInteger(route.mode, 0, 1) || typeof route.enabled !== 'boolean') {
      throw new Error('Invalid Main LFO or modulation route state.');
    }
  }
  return rack;
}
