/** Device-aware note ownership with sustain shared by MIDI channel (CC64). */
export class MidiHoldState {
  constructor() { this.devices = new Map(); }

  get hasHeldNotes() {
    for (const state of this.devices.values()) {
      if (state.down.size || state.sustained.size) return true;
    }
    return false;
  }

  state(deviceId) {
    let state = this.devices.get(deviceId);
    if (!state) {
      state = { down: new Set(), sustained: new Set(), pedal: new Set() };
      this.devices.set(deviceId, state);
    }
    return state;
  }

  heldElsewhere(deviceId, key) {
    for (const [otherId, state] of this.devices) {
      if (otherId !== deviceId && (state.down.has(key) || state.sustained.has(key))) return true;
    }
    return false;
  }

  sustainedOnlyElsewhere(deviceId, key) {
    let sustained = false;
    for (const [otherId, state] of this.devices) {
      if (otherId === deviceId) continue;
      if (state.down.has(key)) return false;
      sustained ||= state.sustained.has(key);
    }
    return sustained;
  }

  isHeld(key) {
    for (const state of this.devices.values()) {
      if (state.down.has(key) || state.sustained.has(key)) return true;
    }
    return false;
  }

  isSustainOn(channel) {
    for (const state of this.devices.values()) {
      if (state.pedal.has(channel)) return true;
    }
    return false;
  }

  clearSustained(channel, touched) {
    for (const [deviceId, state] of this.devices) {
      for (const key of state.sustained) {
        if (Math.floor(key / 128) !== channel) continue;
        state.sustained.delete(key);
        touched.add(key);
      }
      this.cleanup(deviceId, state);
    }
  }

  offEvents(touched) {
    const events = [];
    for (const key of touched) {
      if (!this.isHeld(key)) {
        events.push({ kind: 'off', channel: Math.floor(key / 128), note: key % 128, velocity: 0 });
      }
    }
    return events;
  }

  cleanup(deviceId, state) {
    if (!state.down.size && !state.sustained.size && !state.pedal.size) this.devices.delete(deviceId);
  }

  note(deviceId, kind, channel, note, velocity) {
    const key = channel * 128 + note;
    if (kind === 'on') {
      const state = this.state(deviceId);
      if (state.down.has(key)) return { events: [], deferred: false };
      const retrigger = state.sustained.delete(key);
      const shared = this.heldElsewhere(deviceId, key);
      const reattackOfSustain = this.sustainedOnlyElsewhere(deviceId, key);
      state.down.add(key);
      return { events: retrigger || reattackOfSustain || !shared
        ? [{ kind: 'on', channel, note, velocity }] : [], deferred: false };
    }
    const state = this.devices.get(deviceId);
    if (!state?.down.delete(key)) return { events: [], deferred: false };
    if (this.isSustainOn(channel)) {
      state.sustained.add(key);
      return { events: [], deferred: true };
    }
    const release = !this.heldElsewhere(deviceId, key) && !state.sustained.has(key);
    this.cleanup(deviceId, state);
    return { events: release ? [{ kind: 'off', channel, note, velocity: 0 }] : [], deferred: false };
  }

  sustain(deviceId, channel, down) {
    const state = down ? this.state(deviceId) : this.devices.get(deviceId);
    if (!state) return [];
    if (down) { state.pedal.add(channel); return []; }
    if (!state.pedal.delete(channel)) return [];
    this.cleanup(deviceId, state);
    if (this.isSustainOn(channel)) return [];
    const touched = new Set();
    this.clearSustained(channel, touched);
    return this.offEvents(touched);
  }

  disconnect(deviceId) {
    const state = this.devices.get(deviceId);
    if (!state) return [];
    this.devices.delete(deviceId);
    const touched = new Set([...state.down, ...state.sustained]);
    for (const channel of state.pedal) {
      if (!this.isSustainOn(channel)) this.clearSustained(channel, touched);
    }
    return this.offEvents(touched);
  }

  clear() { this.devices.clear(); }
}
