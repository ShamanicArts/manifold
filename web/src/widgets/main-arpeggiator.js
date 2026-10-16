import { mountCompactSlider } from './compact-slider.js';
import { mountDropdown } from './dropdown.js';

const DEFAULT = { mode: 0, hold: 0, rate: 8, octaves: 1, gate: 60, connected: false };
const MODES = ['Up', 'Down', 'Up/Down', 'Random'];

// Coordinates, compact controls, colours, and labels from Main/ui/components/arp.ui.lua.
export function mountMainArpeggiator(get, post, ids) {
  const state = { ...DEFAULT };
  const panel = get('arpeggiator');
  const mode = mountDropdown(get('arp-mode'), { id: 'arp_mode', options: MODES,
    maxVisibleRows: 4, style: { bg: '#1e293b', colour: '#f59e0b' } }, panel);
  const hold = mountCompactSlider(get('arp-hold'), { label: 'Hold', min: 0, max: 1,
    step: 1, value: 0, style: { colour: '#fbbf24', bg: '#1e293b' } });
  const rate = mountCompactSlider(get('arp-rate'), { label: 'Rate Hz', min: .25, max: 20,
    step: .25, value: 8, style: { colour: '#f59e0b', bg: '#2b1e08' } });
  const octaves = mountCompactSlider(get('arp-octaves'), { label: 'Octaves', min: 1, max: 4,
    step: 1, value: 1, style: { colour: '#fbbf24', bg: '#2b2008' } });
  const gate = mountCompactSlider(get('arp-gate'), { label: 'Gate %', min: 5, max: 100,
    step: 1, value: 60, style: { colour: '#fb923c', bg: '#2a1708' } });
  const connected = get('arp-connected');
  let live = { held: 0, note: -1, gates: 0, lanes: Array(8).fill(false) };
  const send = (id, value) => post({ type: 'arpeggiator-parameter', id, value: Number(value) });
  mode.onChange(value => { state.mode = value; send(ids.mode, value); paint(); });
  hold.onChange(value => { state.hold = value; send(ids.hold, value); paint(); });
  rate.onChange(value => { state.rate = value; send(ids.rate, value); paint(); });
  octaves.onChange(value => { state.octaves = value; send(ids.octaves, value); paint(); });
  gate.onChange(value => { state.gate = value; send(ids.gate, value / 100); paint(); });
  connected.addEventListener('change', () => {
    state.connected = connected.checked; send(ids.connected, Number(state.connected)); paint();
  });
  function paint() {
    get('arp-status').textContent = `${MODES[state.mode]}  •  Held ${live.held}  •  Gate ${live.gates ? 'On' : 'Off'}`;
    get('arp-note').textContent = `Output: ${live.note >= 0 ? live.note : '—'}`;
    get('arp-meter').textContent = state.connected
      ? `${live.gates} timed ${live.gates === 1 ? 'lane' : 'lanes'} active · ${live.held} held`
      : 'Route disconnected';
    for (let index = 0; index < 8; index++) {
      get(`arp-lane-${index}`).classList.toggle('active', Boolean(live.lanes[index]));
    }
    mode.paint(); hold.paint(); rate.paint(); octaves.paint(); gate.paint();
  }
  paint();
  return {
    paint,
    snapshot: () => ({ ...state }),
    sendState() {
      for (const key of ['mode', 'hold', 'rate', 'octaves']) send(ids[key], state[key]);
      send(ids.gate, state.gate / 100);
      send(ids.connected, Number(state.connected));
    },
    restore(saved) {
      Object.assign(state, saved);
      mode.setSelected(state.mode); hold.setValue(state.hold); rate.setValue(state.rate);
      octaves.setValue(state.octaves); gate.setValue(state.gate);
      connected.checked = state.connected;
      this.sendState(); paint();
    },
    setStatus(data) { live = data; if (!get('midisynth-panel').hidden) paint(); },
  };
}
