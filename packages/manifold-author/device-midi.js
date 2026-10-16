import { encodeMidiEvent } from './midi-event.js';

/** Control-side note ownership. DSP voice allocation stays in the processor.
 * The LiveProjectRuntime serializes calls. Each release commits after admission,
 * so a rejected multi-note panic can retry the remaining releases safely.
 * Performance state is ephemeral and is not replayed when a project reopens.
 */
export class DeviceMidiInput {
  #notes = new Map();
  #pedals = new Set();
  async send(host, nodeId, event) {
    if (!event || typeof event !== 'object') throw new Error('Expected a MIDI event');
    const { owner = 'studio', channel = 0, offset = 0 } = event;
    if (typeof owner !== 'string' || !owner || owner.length > 128 || owner.includes('\0'))
      throw new Error('Give the performance input a short owner name');
    // Validate the shared channel and timing fields even for pedal/panic events.
    encodeMidiEvent(nodeId, { type: 'noteOff', channel, offset });
    const pedal = `${owner}\0${channel}`;
    const key = `${pedal}\0${event.note}`;
    const send = async (value) => {
      if (!host?.ready || !host.sendEvent) throw new Error('Start audio before playing MIDI');
      if ((await host.sendEvent(encodeMidiEvent(nodeId, value))) === false)
        throw new Error('Audio host rejected the MIDI event');
    };
    const release = async (key, note) => {
      const other = [...this.#notes].some(
        ([id, n]) => id !== key && n.channel === note.channel && n.note === note.note,
      );
      if (!other && host?.ready)
        await send({ type: 'noteOff', note: note.note, channel: note.channel, offset });
      this.#notes.delete(key);
    };
    if (event.type === 'note-on' && event.velocity !== 0) {
      if (!this.#notes.has(key) && this.#notes.size >= 512)
        throw new Error('Release held notes before adding another performance owner');
      await send({ ...event, type: 'noteOn' });
      this.#notes.set(key, { owner, channel, note: event.note, held: true });
    } else if (event.type === 'note-off' || event.type === 'note-on') {
      encodeMidiEvent(nodeId, { ...event, type: 'noteOff' });
      const note = this.#notes.get(key);
      if (!note) return;
      if (this.#pedals.has(pedal)) note.held = false;
      else await release(key, note);
    } else if (event.type === 'sustain') {
      if (typeof event.down !== 'boolean') throw new Error('Sustain needs a boolean down value');
      if (event.down) {
        if (this.#pedals.size >= 512 && !this.#pedals.has(pedal))
          throw new Error('Too many sustain owners');
        this.#pedals.add(pedal);
      } else {
        for (const [key, note] of this.#notes)
          if (note.owner === owner && note.channel === channel && !note.held)
            await release(key, note);
        this.#pedals.delete(pedal);
      }
    } else if (event.type === 'panic' || event.type === 'all-notes-off') {
      const matches = (note) =>
        (event.owner === undefined || note.owner === owner) &&
        (event.channel === undefined || note.channel === channel);
      for (const [key, note] of this.#notes) if (matches(note)) await release(key, note);
      for (const pedal of this.#pedals) {
        const [heldOwner, heldChannel] = pedal.split('\0');
        if (matches({ owner: heldOwner, channel: Number(heldChannel) })) this.#pedals.delete(pedal);
      }
    } else if (event.type === 'pitch-bend') {
      await send({ ...event, type: 'pitchBend' });
    } else throw new Error('Device MIDI supports notes, sustain, pitch bend and panic');
  }
}
