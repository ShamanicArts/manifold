// Named performance events become the existing engine event contract here.
export function encodeMidiEvent(nodeId, event) {
  const kind = { noteOn: 0, noteOff: 1, allNotesOff: 2, pitchBend: 3 }[event?.type];
  if (!Number.isInteger(nodeId) || nodeId < 1 || kind === undefined)
    throw new Error('Use a declared MIDI input and a named MIDI event');
  let { channel = 0, note = 0, velocity = event.type === 'noteOn' ? 100 : 0, offset = 0 } = event;
  if (event.type === 'pitchBend') {
    if (!Number.isInteger(event.value) || event.value < 0 || event.value > 16383)
      throw new Error('Pitch bend uses a 14-bit value from 0 to 16383; 8192 is the centre');
    note = event.value & 127;
    velocity = event.value >> 7;
  }
  if (
    !Number.isInteger(channel) ||
    channel < 0 ||
    channel > 15 ||
    !Number.isInteger(note) ||
    note < 0 ||
    note > 127 ||
    !Number.isInteger(velocity) ||
    velocity < 0 ||
    velocity > 127 ||
    !Number.isInteger(offset) ||
    offset < 0 ||
    offset > 4096
  )
    throw new Error('MIDI needs channel 0–15, note and velocity 0–127, and frame offset 0–4096');
  return { nodeId, kind, channel, note, velocity, offset };
}
