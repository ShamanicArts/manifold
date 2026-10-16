export { defineNetwork } from './network-definition.js';

/** Host networking transport. Browser applications can supply any RPC adapter;
 * the default uses the optional native bridge on the application's origin. */
export class HostServices {
  constructor({ session = globalThis.crypto?.randomUUID?.() ?? `project-${Date.now()}`, endpoint = '/__manifold/services', request } = {}) {
    this.session = session;
    this.closed = false;
    this.transport = request ?? (async command => {
      const response = await fetch(endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session, command }),
      });
      const body = await response.json();
      if (!response.ok || body.error) throw new Error(body.error ?? `Service HTTP ${response.status}`);
      return body.result;
    });
  }

  request(operation, options = {}) {
    if (this.closed) return Promise.reject(new Error('Service session is closed'));
    return this.transport({ ...options, operation });
  }
  capabilities() { return this.request('capabilities'); }
  bindUdp(address) { return this.request('udp.bind', { address }); }
  listenTcp(address) { return this.request('tcp.listen', { address }); }
  connectTcp(address) { return this.request('tcp.connect', { address }); }
  sendUdp(id, address, data) { return this.request('udp.send', { id, address, data: Array.from(data) }); }
  writeTcp(id, data) { return this.request('tcp.write', { id, data: Array.from(data) }); }
  closeSocket(id) { return this.request('socket.close', { id }); }
  poll() { return this.request('events.poll'); }
  bindOsc(address) { return this.request('osc.bind', { address }); }
  sendOsc(id, address, path, args) { return this.request('osc.send', { id, address, path, args }); }
  publishEndpoints(endpoints) { return this.request('endpoints.publish', { endpoints }); }
  startOscQuery(address, oscPort) { return this.request('oscQuery.start', { address, oscPort }); }
  configureLink(settings) { return this.request('link.configure', settings); }
  inspectLink() { return this.request('link.inspect'); }
  async close() {
    if (this.closed) return;
    this.closed = true;
    await this.transport({ operation: 'session.close' });
  }
}

/** TCP is a byte stream. This decoder preserves partial UTF-8 and split lines. */
export class JsonLineDecoder {
  constructor(limit = 16_384) { this.limit = limit; this.bytes = []; }
  push(chunk) {
    const messages = [];
    for (const byte of chunk) {
      if (byte === 10) {
        const text = new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(this.bytes));
        this.bytes = [];
        if (text.trim()) messages.push(JSON.parse(text));
      } else {
        if (this.bytes.length >= this.limit) { this.bytes = []; throw new Error('TCP frame exceeds limit'); }
        this.bytes.push(byte);
      }
    }
    return messages;
  }
}

/** Join a host service to the accepted live project. No networking occurs in DSP. */
export class ProjectServices {
  constructor(runtime, services = new HostServices(), onStatus = () => {}) {
    this.runtime = runtime;
    this.services = services;
    this.onStatus = onStatus;
    this.status = { connected: false, resources: {}, received: 0, sent: 0, errors: 0 };
    this.decoders = new Map();
    this.stopped = false;
    this.tail = Promise.resolve();
  }

  async start() {
    this.status.capabilities = await this.services.capabilities();
    this.status.connected = true;
    this.config = JSON.stringify(this.runtime.snapshot().network);
    const config = this.runtime.snapshot().network ?? {};
    try {
      if (config.udp) this.status.resources.udp = await this.services.bindUdp(config.udp);
      if (config.tcp) this.status.resources.tcp = await this.services.listenTcp(config.tcp);
      if (config.osc) this.status.resources.osc = await this.services.bindOsc(config.osc);
      if (config.oscQuery) {
        const oscPort = Number(this.status.resources.osc?.address.split(':').at(-1) ?? 0);
        this.status.resources.oscQuery = await this.services.startOscQuery(config.oscQuery, oscPort);
      }
      if (config.link) this.status.link = await this.services.configureLink(config.link);
      await this.publish();
      this.notify();
      this.done = this.loop();
      return this;
    } catch (error) { await this.services.close(); throw error; }
  }

  notify() { this.onStatus(structuredClone(this.status)); }
  async publish() {
    const presentation = this.runtime.presentation();
    const endpoints = presentation.parameters.map(p => ({
      path: p.path, name: p.name ?? p.label ?? p.path, min: p.min, max: p.max, value: p.value,
    }));
    const serialized = JSON.stringify(endpoints);
    if (serialized !== this.published) {
      await this.services.publishEndpoints(endpoints);
      this.published = serialized;
    }
  }

  async receive(event) {
    this.status.received++;
    if (event.type === 'link') this.status.link = event.state;
    if (event.type === 'closed') this.decoders.delete(event.id);
    if (event.type === 'error') throw new Error(event.error);
    let messages = [];
    if (event.type === 'tcp') {
      if (!this.decoders.has(event.id)) this.decoders.set(event.id, new JsonLineDecoder());
      messages = this.decoders.get(event.id).push(event.data);
    } else if (event.type === 'udp') {
      messages = [JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(event.data)))];
    } else if (['osc', 'link'].includes(event.type)) messages = [null];
    for (const message of messages) {
      const result = await this.runtime.request({ operation: 'network.receive', event: { ...event, message }, origin: event.type });
      await this.publish();
      if (result.networkReply !== undefined && result.networkReply !== null) {
        const reply = { ...result.networkReply, revision: result.revision,
          parameters: this.runtime.presentation().parameters.map(p => ({ path: p.path, value: p.value })) };
        const data = new TextEncoder().encode(JSON.stringify(reply) + '\n');
        if (event.type === 'tcp') await this.services.writeTcp(event.id, data);
        if (event.type === 'udp') await this.services.sendUdp(event.id, event.peer, data);
        if (event.type === 'osc') await this.services.sendOsc(event.id, event.peer, event.path,
          [this.runtime.presentation().parameters.find(p => p.path === event.path)?.value ?? 0]);
        this.status.sent++;
      }
    }
  }

  async loop() {
    while (!this.stopped) {
      try {
        if (JSON.stringify(this.runtime.snapshot().network) !== this.config) {
          const next = this.runtime.snapshot().network;
          const old = JSON.parse(this.config);
          const ports = config => JSON.stringify({ ...config, link: null });
          if (next && ports(next) === ports(old)) {
            const before = old.link ?? {};
            const after = next.link ?? { enabled: false };
            const changed = Object.fromEntries(Object.entries(after).filter(([key,value]) => before[key] !== value));
            this.status.link = await this.services.configureLink(changed);
            this.config = JSON.stringify(next);
          } else {
          this.status.error = 'Network configuration changed; reconnect services to apply it';
          this.stopped = true;
          await this.services.close();
          this.status.connected = false;
          this.notify();
          break;
          }
        }
        const batch = await this.services.poll();
        this.status.dropped = batch.dropped;
        for (const event of batch.events) {
          if (this.stopped) break;
          try { await this.receive(event); }
          catch (error) { this.status.errors++; this.status.error = error.message; }
        }
        await this.publish();
      } catch (error) { this.status.errors++; this.status.error = error.message; }
      this.notify();
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }

  async close() {
    this.stopped = true;
    await this.done;
    await this.services.close();
    this.status.connected = false;
    this.notify();
  }
}
