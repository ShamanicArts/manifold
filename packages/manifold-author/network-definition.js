/** Portable service intent. Hosts own connections and deliver decoded events. */
class NetworkDefinition {
  #handler = null;

  constructor(settings) { this.settings = settings; }

  onEvent(handler) {
    if (typeof handler !== 'function') throw new TypeError('Network event handler must be a function');
    this.#handler = handler;
    return this;
  }

  get handler() { return this.#handler; }
}

/** Declare TCP/UDP/OSC/Link services without opening a connection. */
export function defineNetwork(settings) { return new NetworkDefinition(settings); }

// Shared live evaluator adapter; the serializable contract remains settings only.
export function unpackNetwork(value) {
  return value instanceof NetworkDefinition ? { settings: value.settings, handler: value.handler } : null;
}
