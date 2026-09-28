// Version-2 Main session rack contract. Validate before touching the live UI or audio engine.
import { LABELS } from '../widgets/fx-slot-data.js';

const validNumber = (value, min, max) => Number.isFinite(value) && value >= min && value <= max;
const validInteger = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;

export function validateMainRackState(rack, requireLfo = true, modulation = null, requireMulti = false, requireAtv = false, requireSlew = false, requireSampleHold = false, requireCompare = false, requireCvMix = false, requireRange = false, requireScaleQuantizer = false, requireTranspose = false, requireNoteFilter = false, requireVelocityMapper = false, requireArpeggiator = false) {
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
    || (eq.output !== undefined && !validNumber(eq.output, -24, 24))
    || (eq.mix !== undefined && !validNumber(eq.mix, 0, 1))
    || (eq.selected >= 0 && eq.bands[eq.selected]?.enabled !== true)
    || eq.bands.some(band => !band || typeof band.enabled !== 'boolean'
      || !validInteger(band.type, 0, 6) || !validNumber(band.freq, 20, 20000)
      || !validNumber(band.gain, -24, 24) || !validNumber(band.q, .1, 24))) {
    throw new Error('Invalid Main EQ state.');
  }
  const validLfo = lfo => {
    const route = lfo?.route;
    return lfo && validInteger(lfo.shape, 0, 5) && validNumber(lfo.rate, .01, 20)
      && validNumber(lfo.depth, 0, 1) && validNumber(lfo.phase, 0, 360)
      && validInteger(lfo.retrig, 0, 1) && route
      && validInteger(route.source, 0, requireRange ? 12 : requireCvMix ? 11 : requireCompare ? 9 : requireSampleHold ? 7 : requireSlew ? 5 : requireAtv ? 4 : 3)
      && (modulation ? Object.values(modulation.targets) : [0, 22, 23]).includes(route.target)
      && validNumber(route.amount, -1, 1) && validNumber(route.bias, -1, 1)
      && validInteger(route.mode, 0, 1) && typeof route.enabled === 'boolean';
  };
  if (requireMulti) {
    const lfos = rack.lfos;
    const slots = lfos?.map(lfo => lfo.slot);
    if (!Array.isArray(lfos) || lfos.length < 1 || lfos.length > (modulation?.maxLfos ?? 4)
      || !slots.includes(0) || new Set(slots).size !== slots.length
      || lfos.some(lfo => !validInteger(lfo.slot, 0, (modulation?.maxLfos ?? 4) - 1) || !validLfo(lfo))) {
      throw new Error('Invalid Main LFO module or modulation route state.');
    }
  } else if (requireLfo || rack.lfo !== undefined) {
    const lfo = rack.lfo;
    if (!validLfo(lfo)) {
      throw new Error('Invalid Main LFO or modulation route state.');
    }
  }
  if (requireAtv || rack.atv !== undefined) {
    const atv = rack.atv;
    if (!atv || !validNumber(atv.amount, -1, 1) || !validNumber(atv.bias, -1, 1)
      || !validInteger(atv.slot, 0, (modulation?.maxLfos ?? 4) - 1)
      || !validInteger(atv.port, 0, 3)) {
      throw new Error('Invalid Main ATV / Bias module state.');
    }
  }
  if (requireSlew || rack.slew !== undefined) {
    const slew = rack.slew;
    if (!slew || !validInteger(slew.riseMs, 0, 2000) || !validInteger(slew.fallMs, 0, 2000)
      || !validInteger(slew.shape, 0, 2) || !validInteger(slew.source, 0, 16)) {
      throw new Error('Invalid Main Slew module state.');
    }
  }
  if (requireSampleHold || rack.sampleHold !== undefined) {
    const hold = rack.sampleHold;
    if (!hold || !validInteger(hold.mode, 0, 2) || !validInteger(hold.source, 0, 17)
      || !validInteger(hold.triggerSource, 0, 4)
      || typeof hold.manualGate !== 'boolean' || !validNumber(hold.held, -1, 1)
      || typeof hold.triggerHigh !== 'boolean') {
      throw new Error('Invalid Main Sample Hold module state.');
    }
  }
  if (requireCompare || rack.compare !== undefined) {
    const compare = rack.compare;
    if (!compare || !validInteger(compare.direction, 0, 2)
      || !validNumber(compare.threshold, -1, 1) || !validNumber(compare.hysteresis, 0, .5)
      || !validInteger(compare.source, 0, 19) || typeof compare.gate !== 'boolean'
      || !validInteger(compare.pulseRemaining, 0, 2)) {
      throw new Error('Invalid Main Compare module state.');
    }
  }
  if (requireCvMix || rack.cvMix !== undefined) {
    const mix = rack.cvMix;
    if (!mix || [1, 2, 3, 4].some(index => !validNumber(mix[`level${index}`], 0, 1)
      || !validInteger(mix[`source${index}`], 0, 21))
      || !validNumber(mix.offset, -1, 1)) {
      throw new Error('Invalid Main CV Mix module state.');
    }
  }
  if (requireRange || rack.range !== undefined) {
    const range = rack.range;
    if (!range || !validNumber(range.min, 0, 1) || !validNumber(range.max, 0, 1)
      || !validInteger(range.mode, 0, 1) || !validInteger(range.source, 0, 23)) {
      throw new Error('Invalid Main Range Mapper module state.');
    }
  }
  if (requireScaleQuantizer || rack.scaleQuantizer !== undefined) {
    const scale = rack.scaleQuantizer;
    if (!scale || !validInteger(scale.root, 0, 11) || !validInteger(scale.scale, 1, 6)
      || !validInteger(scale.direction, 1, 3) || typeof scale.connected !== 'boolean') {
      throw new Error('Invalid Main Scale Quantizer module state.');
    }
  }
  if (requireTranspose || rack.transpose !== undefined) {
    const transpose = rack.transpose;
    if (!transpose || !validInteger(transpose.semitones, -24, 24)
      || !validInteger(transpose.source, 0, 1) || typeof transpose.connected !== 'boolean') {
      throw new Error('Invalid Main Transpose module state.');
    }
  }
  if (requireNoteFilter || rack.noteFilter !== undefined) {
    const noteFilter = rack.noteFilter;
    if (!noteFilter || !validInteger(noteFilter.low, 0, 127) || !validInteger(noteFilter.high, 0, 127)
      || !validInteger(noteFilter.mode, 0, 1) || !validInteger(noteFilter.source, 0, 2)
      || typeof noteFilter.connected !== 'boolean') {
      throw new Error('Invalid Main Note Filter module state.');
    }
  }
  if (requireVelocityMapper || rack.velocityMapper !== undefined) {
    const velocity = rack.velocityMapper;
    if (!velocity || !validNumber(velocity.amount, 0, 1) || !validInteger(velocity.curve, 0, 2)
      || !validNumber(velocity.offset, -1, 1) || !validInteger(velocity.source, 0, 4)
      || typeof velocity.connected !== 'boolean') {
      throw new Error('Invalid Main Velocity Mapper module state.');
    }
  }
  if (requireArpeggiator || rack.arpeggiator !== undefined) {
    const arp = rack.arpeggiator;
    if (!arp || !validInteger(arp.mode, 0, 3) || !validInteger(arp.hold, 0, 1)
      || !validNumber(arp.rate, .25, 20) || !validInteger(arp.octaves, 1, 4)
      || !validInteger(arp.gate, 5, 100) || typeof arp.connected !== 'boolean') {
      throw new Error('Invalid Main Arpeggiator module state.');
    }
  }
  return rack;
}
