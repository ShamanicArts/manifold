import { mountMainLfo, DEFAULT_LFO_STATE } from './main-lfo.js';

// Fixed engine slots give each live module a stable identity. The DOM can be
// inserted or removed while the prepared Rust LFOs and routes remain bounded.
export function mountMainLfoRack(get, post, contract, onRouteState = () => {}) {
  const content = get('rack-scroll').querySelector('.rack-scroll-content');
  const lfoTemplate = content.querySelector('.rack-lfo').cloneNode(true);
  const routeTemplate = content.querySelector('.rack-route').cloneNode(true);
  const slots = Array(contract.maxLfos).fill(null);

  function scopedGet(slot) {
    return id => get(id === 'midisynth-panel' || slot === 0 ? id : `${id}-slot-${slot}`);
  }

  function markCloneIds(element, slot) {
    for (const node of element.querySelectorAll('[id]')) node.id += `-slot-${slot}`;
  }

  function refreshHeight() {
    get('add-lfo').disabled = slots.every(Boolean);
  }

  function add(slot = slots.findIndex((item, index) => index > 0 && !item)) {
    if (slot <= 0 || slot >= slots.length || slots[slot]) return false;
    const module = lfoTemplate.cloneNode(true);
    const route = routeTemplate.cloneNode(true);
    module.classList.remove('rack-lfo-primary');
    module.classList.add('rack-utility');
    module.querySelector('.main-patch-face')?.remove();
    markCloneIds(module, slot);
    markCloneIds(route, slot);
    module.style.top = `${465 + slot * 232}px`;
    route.style.top = module.style.top;
    module.setAttribute('aria-label', `Main LFO ${slot + 1} module`);
    route.setAttribute('aria-label', `Main LFO ${slot + 1} modulation connection`);
    module.querySelector('.lfo-title').textContent = `LFO ${slot + 1}`;
    const header = module.querySelector('.rack-shell-head');
    header.textContent = `LFO ${slot + 1}`;
    header.removeAttribute('title');
    route.querySelector('h2').textContent = `LFO ${slot + 1} → target`;
    const remove = document.createElement('button');
    remove.type = 'button'; remove.className = 'lfo-remove'; remove.textContent = '×';
    remove.setAttribute('aria-label', `Remove LFO ${slot + 1}`);
    remove.addEventListener('click', () => removeSlot(slot));
    module.append(remove);
    content.append(module, route);
    const widget = mountMainLfo(scopedGet(slot), post, contract, slot, onRouteState);
    slots[slot] = { module, route, widget };
    post({ type: 'lfo-slot-active', slot, active: 1 });
    widget.sendState();
    refreshHeight();
    requestAnimationFrame(() => widget.paint());
    return true;
  }

  function removeSlot(slot) {
    if (slot <= 0 || !slots[slot]) return false;
    slots[slot].module.remove();
    slots[slot].route.remove();
    slots[slot] = null;
    post({ type: 'lfo-slot-active', slot, active: 0 });
    refreshHeight();
    return true;
  }

  slots[0] = { widget: mountMainLfo(scopedGet(0), post, contract, 0, onRouteState) };
  get('add-lfo').addEventListener('click', () => add());
  return {
    add,
    remove: removeSlot,
    applyCableRoute(connected) { slots[0].widget.applyCableRoute(connected); },
    paint() { slots.forEach(entry => entry?.widget.paint()); },
    snapshot() { return slots.flatMap((entry, slot) => entry ? [{ slot, ...entry.widget.snapshot() }] : []); },
    restore(saved) {
      for (let slot = 1; slot < slots.length; slot++) removeSlot(slot);
      const states = Array.isArray(saved) ? saved : [{ slot: 0, ...(saved ?? DEFAULT_LFO_STATE) }];
      slots[0].widget.restore(states.find(state => state.slot === 0) ?? DEFAULT_LFO_STATE);
      for (const state of states) {
        if (state.slot > 0 && add(state.slot)) slots[state.slot].widget.restore(state);
      }
      refreshHeight();
    },
    sendState() {
      slots.forEach((entry, slot) => {
        if (!entry) return;
        if (slot > 0) post({ type: 'lfo-slot-active', slot, active: 1 });
        entry.widget.sendState();
      });
    },
    setStatus(data) { data?.forEach((status, slot) => { if (status && slots[slot]) slots[slot].widget.setStatus(status); }); },
  };
}
