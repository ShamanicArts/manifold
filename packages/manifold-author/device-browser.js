import { encodeMidiEvent } from './midi-event.js';
import { BrowserAudioRouting } from './audio-routing.js';
import { BrowserGraphHost } from './browser.js';
import { LiveGraphSession, parameterValue } from './index.js';
import { lowerDevice, deviceControlPath } from './device.js';

/** Web Audio hosting for a Device. The caller retains ownership of its AudioContext. */
export class BrowserDeviceHost {
  #context;
  #host;
  #device;
  #session;
  #started = false;
  #closed = false;
  #routing;
  #midi = new Map();

  constructor(context, options = {}) {
    this.#context = context;
    this.#host = new BrowserGraphHost(context, { ...options, execution: 'prepared' });
  }

  get ready() {
    return !this.#closed && !!this.#session && this.#host.ready;
  }
  get diagnostics() {
    return this.#host.diagnostics;
  }

  async prepare(device) {
    if (this.#started || this.#closed)
      throw new Error('Create a new host to prepare another device');
    const { graph, project } = lowerDevice(device);
    this.#started = true;
    await this.#host.prepare(project);
    if (this.#closed) throw new Error('Device host was closed during preparation');
    this.#device = device;
    for (const instance of project.instances)
      if (project.signal.nodes.some((n) => n.id === instance.nodeId && n.type === 'midi-input'))
        this.#midi.set(instance.path.split('/').at(-1), instance.nodeId);
    this.#routing = new BrowserAudioRouting(this.#context, this.#host);
    this.#session = new LiveGraphSession(
      graph,
      (route) => this.#host.setRoute(route),
      (edit) => this.#host.setParameter(edit),
      null,
      null,
      () => this.#host.readPublishedParameters(),
    );
    return this;
  }

  #requireReady() {
    if (!this.ready) throw new Error('Prepare the device before using its host');
  }

  connectInput(name, source, sourceOutput = 0) {
    this.#requireReady();
    this.#routing.connectInput(name, source, sourceOutput);
    return this;
  }

  connectOutput(name, destination, destinationInput = 0) {
    this.#requireReady();
    this.#host.connectOutput(name, destination, destinationInput);
    return this;
  }

  async sendMidi(input, event) {
    this.#requireReady();
    const nodeId = this.#midi.get(input);
    return this.#host.sendEvent(encodeMidiEvent(nodeId, event));
  }

  async setControl(control, value) {
    this.#requireReady();
    const path = deviceControlPath(this.#device, control);
    const accepted = await this.#session.parameterPath(path, value);
    return parameterValue(accepted, path);
  }

  async close() {
    this.#closed = true;
    try {
      await this.#host.close();
    } finally {
      this.#routing?.close();
    }
  }
}
