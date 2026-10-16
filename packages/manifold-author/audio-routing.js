/** Host-side Web Audio channel adaptation. Never runs in the audio callback. */
export class BrowserAudioRouting {
  #host;
  #inputs = new Map();
  #silence;
  constructor(context, host) {
    this.#host = host;
    const buses = host.ioLayout?.inputs ?? [];
    if (buses.length) {
      this.#silence = context.createConstantSource();
      this.#silence.offset.value = 0;
    }
    for (const bus of buses) {
      const adapter = context.createGain();
      adapter.channelCount = bus.channels;
      adapter.channelCountMode = 'explicit';
      adapter.channelInterpretation = 'speakers';
      this.#silence.connect(adapter);
      host.connectInput(bus.id, adapter);
      this.#inputs.set(bus.id, { adapter, source: null, output: 0 });
    }
    this.#silence?.start();
  }
  connectInput(name, source, sourceOutput = 0) {
    const input = this.#inputs.get(name);
    if (!input || !Number.isInteger(sourceOutput) || sourceOutput < 0)
      throw new Error('Unknown input bus or source output');
    source?.connect(input.adapter, sourceOutput, 0);
    if (input.source && (input.source !== source || input.output !== sourceOutput))
      disconnect(input);
    input.source = source;
    input.output = sourceOutput;
  }
  close() {
    for (const input of this.#inputs.values()) {
      disconnect(input);
      input.adapter.disconnect();
    }
    this.#inputs.clear();
    if (this.#silence) {
      this.#silence.stop();
      this.#silence.disconnect();
      this.#silence = null;
    }
  }
}
function disconnect({ source, adapter, output }) {
  if (!source) return;
  try {
    source.disconnect(adapter, output, 0);
  } catch (error) {
    if (error.name !== 'InvalidAccessError') throw error;
  }
}
