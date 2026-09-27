// Control-side bridge for a packaged native editor. Audio remains entirely in
// the host's Rust processor; the webview only emits stable public parameters.
export class PluginControlHost {
  constructor() {
    this.running = false;
    this.analyser = null;
  }

  setParameter(id, value) {
    if (!Number.isInteger(id) || id < 0 || id > 6
      || !Number.isFinite(value) || value < 0 || value > (id === 0 ? 20 : 1)) return;
    window.ipc?.postMessage(JSON.stringify({ version: 1, kind: "parameter", id, value }));
  }
}
