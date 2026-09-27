// Control-side bridge for a packaged native editor. Audio remains entirely in
// the host's Rust processor; the webview only emits stable public parameters.
export class PluginControlHost {
  constructor() {
    this.running = false;
    this.analyser = null;
    this.gestures = new Set();
  }

  send(kind, id, value) {
    window.ipc?.postMessage(JSON.stringify({ version: 1, kind, id, ...(value === undefined ? {} : { value }) }));
  }

  beginGesture(id) {
    if (this.gestures.has(id)) return;
    this.gestures.add(id);
    this.send("gesture-begin", id);
  }

  endGesture(id) {
    if (!this.gestures.delete(id)) return;
    this.send("gesture-end", id);
  }

  setParameter(id, value) {
    if (!Number.isInteger(id) || id < 0 || id > 6
      || !Number.isFinite(value) || value < 0 || value > (id === 0 ? 20 : 1)) return;
    this.send("parameter", id, value);
  }
}
