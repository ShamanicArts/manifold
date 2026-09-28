// Map the original Main widget messages to the authored native host IDs.
// The browser AudioWorklet keeps its existing message ABI; the packaged editor
// uses these IDs with the native processor instead of running a second engine.
const utilityBases = {
  'atv-parameter': 'atvBase',
  'slew-parameter': 'slewBase',
  'sample-hold-parameter': 'sampleHoldBase',
  'compare-parameter': 'compareBase',
  'cv-mix-parameter': 'cvMixBase',
  'range-parameter': 'rangeBase',
  'scale-quantizer-parameter': 'scaleQuantizerBase',
  'transpose-parameter': 'transposeBase',
  'note-filter-parameter': 'noteFilterBase',
  'velocity-mapper-parameter': 'velocityMapperBase',
  'arpeggiator-parameter': 'arpeggiatorBase',
};

const integer = value => Number.isInteger(value) && value >= 0;
const parameter = (id, value) => integer(id) && Number.isFinite(value)
  ? { kind: 'parameter', id, value } : null;

export function mainEditorAction(message, project) {
  if (!message || !project?.hostParameters) return null;
  const ids = project.hostParameters;
  const { type, id, value, slot, layer } = message;
  if (type === 'control') return parameter(id, value);
  if (type === 'layer-control') {
    if (!integer(layer) || layer >= project.layers || !integer(id)) return null;
    return parameter(ids.layerBase + layer * ids.layerStride + id, value);
  }
  if (type === 'synth-parameter') return integer(id)
    ? parameter(ids.synthBase + id, value) : null;
  if (type === 'lfo-parameter' || type === 'modulation-route' || type === 'lfo-slot-active') {
    if (!integer(slot) || slot >= project.modulation.maxLfos) return null;
    const base = ids.lfoBase + slot * ids.lfoStride;
    if (type === 'lfo-slot-active') return parameter(base + 11, Number(message.active));
    if (!integer(id)) return null;
    return parameter(base + (type === 'modulation-route' ? 5 : 0) + id, value);
  }
  if (Object.hasOwn(utilityBases, type)) return integer(id)
    ? parameter(ids[utilityBases[type]] + id, value) : null;
  if (type === 'command') return integer(id) && id <= 9 && Number.isFinite(value)
    ? { kind: 'command', id, value } : null;
  if (type === 'synth-note') return integer(message.kind)
    && integer(message.note) && integer(message.velocity)
    ? { kind: 'note', action: message.kind, note: message.note, velocity: message.velocity }
    : null;
  if (type === 'lfo-gate') return integer(slot) && integer(id) && Number.isFinite(message.high)
    ? { kind: 'lfo-gate', slot, id, high: message.high } : null;
  return null;
}
