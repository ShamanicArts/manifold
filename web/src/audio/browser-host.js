/** Browser devices, AudioWorklet lifecycle, and control transport. */
export class BrowserAudioHost {
  constructor(onStatus) {
    this.onStatus = onStatus;
    this.context = null;
    this.processor = null;
    this.analyser = null;
    this.source = null;
    this.sourceStream = null;
    this.parameters = new Map();
  }

  get running() { return this.context !== null; }

  async start(kind, values, project) {
    if (this.running) return;
    const context = new AudioContext({ latencyHint: 'interactive' });
    this.context = context;
    try {
      await context.resume();
      await context.audioWorklet.addModule(new URL('./filter-processor.js', import.meta.url));
      const response = await fetch(`${import.meta.env.BASE_URL}manifold_filter.wasm`);
      if (!response.ok) throw new Error('Wasm filter missing: run ./scripts/build-wasm.sh');
      const wasmBytes = await response.arrayBuffer();
      const processor = new AudioWorkletNode(context, 'manifold-project', {
        numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2],
      });
      this.processor = processor;
      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.78;
      this.analyser = analyser;
      // Keep the worklet rendering while its Wasm module initializes.
      processor.connect(analyser).connect(context.destination);
      const ready = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('AudioWorklet initialization timed out')), 10_000);
        processor.onprocessorerror = () => {
          clearTimeout(timeout);
          reject(new Error('AudioWorklet processor failed'));
        };
        processor.port.onmessage = ({ data }) => {
          if (data.type === 'ready' || data.type === 'error') {
            clearTimeout(timeout);
            data.type === 'ready' ? resolve() : reject(new Error(data.message));
          }
        };
      });
      processor.port.postMessage({ type: 'init', wasmBytes, graph: project.signal }, [wasmBytes]);
      await ready;
      this.parameters = new Map(project.parameters.map((parameter) => [parameter.id, parameter]));
      for (const [id, value] of values) this.setParameter(id, value);
      if (kind === 'microphone') {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false }, video: false });
        this.sourceStream = stream;
        this.source = context.createMediaStreamSource(stream);
      } else {
        const oscillator = context.createOscillator();
        oscillator.type = 'sawtooth';
        oscillator.frequency.value = 165;
        const level = context.createGain();
        level.gain.value = 0.16;
        oscillator.connect(level);
        oscillator.start();
        this.source = level;
        this.oscillator = oscillator;
      }
      this.source.connect(processor);
      this.onStatus(`Audio running · ${kind === 'microphone' ? 'microphone' : 'test oscillator'} · ${Math.round(context.sampleRate / 1000)} kHz`);
    } catch (error) {
      await this.stop();
      throw error;
    }
  }

  setParameter(id, value) {
    const parameter = this.parameters.get(id);
    if (parameter) this.processor?.port.postMessage({ type: 'parameter', nodeId: parameter.nodeId, id: parameter.nodeParameterId, value });
  }

  async stop() {
    this.oscillator?.stop();
    this.sourceStream?.getTracks().forEach((track) => track.stop());
    this.source?.disconnect();
    this.processor?.disconnect();
    this.analyser?.disconnect();
    await this.context?.close();
    this.context = this.processor = this.analyser = this.source = this.sourceStream = this.oscillator = null;
    this.parameters.clear();
    this.onStatus('Audio idle');
  }
}
