// Host hardware only. Generators, signal gain and source mixing belong to the project.
export class AudioInputDevice {
  constructor(media = globalThis.navigator?.mediaDevices) {
    this.media = media;
    this.devices = [];
    this.selected = '';
    this.generation = 0;
  }
  snapshot() {
    return {
      input: this.selected,
      inputs: [
        { id: '', name: 'Disconnected' },
        { id: 'default', name: 'Default microphone / interface' },
        ...this.devices,
      ],
      output: 'Browser audio output',
      status: this.stream ? 'Input connected' : 'Live input is silent until hardware is connected',
    };
  }
  async refresh() {
    const devices = (await this.media?.enumerateDevices()) ?? [];
    this.devices = devices
      .filter((d) => d.kind === 'audioinput' && d.deviceId && d.deviceId !== 'default')
      .map((d, index) => ({ id: d.deviceId, name: d.label || `Audio input ${index + 1}` }));
  }
  // Rebind after starting or replacing a host. The host supplies its declared input routes.
  bind(context, connect) {
    const previous = this.node;
    const node = this.stream ? context.createMediaStreamSource(this.stream) : null;
    try {
      connect(node);
    } catch (error) {
      node?.disconnect();
      throw error;
    }
    this.context = context;
    this.connect = connect;
    this.node = node;
    previous?.disconnect();
  }
  async select(id) {
    const generation = ++this.generation;
    let stream = null,
      node = null;
    try {
      if (id) {
        if (!this.media?.getUserMedia)
          throw new Error('Microphone access is unavailable in this browser');
        stream = await this.media.getUserMedia({
          audio: {
            ...(id === 'default' ? {} : { deviceId: { exact: id } }),
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
        });
      }
      if (generation !== this.generation) {
        stream?.getTracks().forEach((t) => t.stop());
        return;
      }
      node = stream && this.context ? this.context.createMediaStreamSource(stream) : null;
      this.connect?.(node);
      this.node?.disconnect();
      this.stream?.getTracks().forEach((t) => t.stop());
      this.node = node;
      this.stream = stream;
      this.selected = id;
      await this.refresh().catch(() => {});
    } catch (error) {
      node?.disconnect();
      stream?.getTracks().forEach((t) => t.stop());
      if (generation === this.generation) throw error;
    }
  }
  close() {
    ++this.generation;
    try {
      this.connect?.(null);
    } catch {
      /* A host already being torn down may reject detaching its route. */
    }
    this.node?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.context = this.connect = this.node = this.stream = null;
    this.selected = '';
  }
}
