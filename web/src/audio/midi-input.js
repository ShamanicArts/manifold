/** Optional browser MIDI input. Event timestamps travel to the audio host. */
export function midiAvailability() {
  if (!globalThis.isSecureContext) return 'Web MIDI requires a secure page (HTTPS or localhost).';
  if (!navigator.requestMIDIAccess) return 'Web MIDI is unavailable in this browser.';
  const policy = document.permissionsPolicy ?? document.featurePolicy;
  if (policy?.allowsFeature && !policy.allowsFeature('midi')) {
    return 'This browser view blocks MIDI permission requests. Open this page in a browser that allows Web MIDI.';
  }
  return null;
}

export class BrowserMidiInput {
  constructor(onNote, onDisconnect, onStatus, onControl = () => {}, onPitchBend = () => {}, onConnectionChange = () => {}) {
    this.onNote = onNote;
    this.onDisconnect = onDisconnect;
    this.onStatus = onStatus;
    this.onControl = onControl;
    this.onPitchBend = onPitchBend;
    this.onConnectionChange = onConnectionChange;
    this.access = null;
    this.bound = new Map();
    this.pending = false;
    this.requestId = 0;
  }

  get listening() { return this.access !== null; }

  async connect() {
    if (this.listening || this.pending) return;
    const unavailable = midiAvailability();
    if (unavailable) {
      this.onStatus(unavailable);
      return;
    }
    this.pending = true;
    const requestId = ++this.requestId;
    this.onConnectionChange();
    this.onStatus('Requesting MIDI access…');
    const pendingNotice = setTimeout(() => {
      if (requestId === this.requestId && this.pending) {
        this.onStatus('No MIDI permission prompt appeared. This browser view may block it; open the link below in an external browser. You can stop waiting here.');
      }
    }, 4000);
    try {
      const access = await navigator.requestMIDIAccess({ sysex: false });
      if (requestId !== this.requestId) return;
      this.pending = false;
      this.access = access;
      access.onstatechange = () => this.syncInputs();
      this.syncInputs();
      this.onConnectionChange();
    } catch (error) {
      if (requestId !== this.requestId) return;
      this.pending = false;
      const reason = error?.name === 'NotAllowedError' || error?.name === 'SecurityError'
        ? 'MIDI permission was denied or blocked here. Try this page in an external browser that allows Web MIDI.'
        : `MIDI connection failed: ${error?.message ?? String(error)}`;
      this.onStatus(reason);
      this.onConnectionChange();
    } finally {
      clearTimeout(pendingNotice);
    }
  }

  syncInputs() {
    if (!this.access) return;
    const connected = new Map([...this.access.inputs.values()]
      .filter((input) => input.state === 'connected')
      .map((input) => [input.id, input]));
    for (const [id, input] of this.bound) {
      if (connected.get(id) !== input) {
        input.onmidimessage = null;
        this.bound.delete(id);
        this.onDisconnect(id);
      }
    }
    for (const [id, input] of connected) {
      if (this.bound.has(id)) continue;
      input.onmidimessage = (event) => {
        const bytes = event.data;
        if (!bytes || bytes.length < 3) return;
        const status = bytes[0] & 0xf0;
        const channel = bytes[0] & 0x0f;
        const note = bytes[1];
        const velocity = bytes[2];
        if (note > 127 || velocity > 127) return;
        if (status === 0x90 && velocity > 0) this.onNote(id, 'on', channel, note, velocity, event.timeStamp);
        else if (status === 0x80 || status === 0x90 && velocity === 0) this.onNote(id, 'off', channel, note, 0, event.timeStamp);
        else if (status === 0xb0 && note === 64) this.onControl(id, channel, velocity >= 64, event.timeStamp);
        else if (status === 0xe0) this.onPitchBend(id, channel, note | (velocity << 7), event.timeStamp);
      };
      this.bound.set(id, input);
    }
    const count = this.bound.size;
    this.onStatus(count ? `${count} MIDI input${count === 1 ? '' : 's'} connected.` : 'MIDI access granted; no input devices found.');
  }

  stop() {
    ++this.requestId;
    this.pending = false;
    for (const [id, input] of this.bound) {
      input.onmidimessage = null;
      this.onDisconnect(id);
    }
    this.bound.clear();
    if (this.access) this.access.onstatechange = null;
    this.access = null;
    this.onStatus('MIDI input stopped. Browser permission may remain granted.');
    this.onConnectionChange();
  }
}
