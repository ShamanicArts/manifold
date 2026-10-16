// Main/ui/behaviors/eq.lua: eight editable points; response comes from Rust Eq8.
const colors = ['#f87171', '#fb923c', '#fbbf24', '#4ade80', '#2dd4bf', '#38bdf8', '#a78bfa', '#f472b6'];
const defaults = [60, 120, 250, 500, 1000, 2500, 6000, 12000];
const types = [1, 0, 0, 0, 0, 0, 0, 2];
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const frequencyAt = x => 20 * 1000 ** clamp(x / 216, 0, 1);
const xAt = freq => Math.log(clamp(freq, 20, 20000) / 20) / Math.log(1000) * 216;
const gainAt = y => clamp(24 - y / 108 * 48, -24, 24);
const yAtGain = gain => (24 - gain) / 48 * 108;
const qAt = y => .1 * 240 ** (1 - clamp(y / 108, 0, 1));
const yAtQ = q => (1 - Math.log(clamp(q, .1, 24) / .1) / Math.log(240)) * 108;
const usesGain = kind => kind <= 2;

export function mountMainEq(get, parameter, ids) {
  const canvas = get('eq-graph'), ctx = canvas.getContext('2d');
  const selector = get('eq-type'), fields = [get('eq-freq'), get('eq-gain'), get('eq-q')];
  const bands = defaults.map((freq, index) => ({ enabled: false, type: types[index], freq,
    gain: 0, q: index === 0 || index === 7 ? .8 : 1 }));
  let selected = -1, insertType = 0, dragging = false, response = [];
  let output = 0, mix = 1;
  const send = (index, property, offset) => parameter(ids.base + index * ids.bandStride + offset, bands[index][property]);
  function sendBand(index) {
    for (const [property, offset] of [['enabled', 0], ['type', 1], ['freq', 2], ['gain', 3], ['q', 4]]) {
      send(index, property, offset);
    }
  }
  function sync() {
    const band = bands[selected];
    for (const field of fields) field.disabled = !band;
    selector.value = String(band?.type ?? insertType);
    if (!band) { fields.forEach(field => { field.value = ''; }); return; }
    fields[0].value = String(Math.round(band.freq));
    fields[1].value = band.gain.toFixed(1);
    fields[2].value = band.q.toFixed(2);
    fields[1].disabled = !usesGain(band.type);
    fields[2].disabled = band.type === 1 || band.type === 2;
  }
  function point(index) {
    const band = bands[index];
    return [xAt(band.freq), usesGain(band.type) ? yAtGain(band.gain) : yAtQ(band.q)];
  }
  function hit(x, y) {
    let closest = -1, distance = 12 ** 2;
    bands.forEach((band, index) => {
      if (!band.enabled) return;
      const [px, py] = point(index), delta = (px - x) ** 2 + (py - y) ** 2;
      if (delta <= distance) { closest = index; distance = delta; }
    });
    return closest;
  }
  function paint() {
    const w = 216, h = 108;
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    ctx.fillStyle = '#0a0a1a'; ctx.fillRect(0, 0, w, h);
    ctx.lineWidth = 1;
    for (const freq of [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000]) {
      const x = xAt(freq) + .5;
      ctx.strokeStyle = '#1a1a3a'; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    for (const db of [-18, -12, -6, 0, 6, 12, 18]) {
      const y = yAtGain(db) + .5;
      ctx.strokeStyle = db === 0 ? '#334155' : '#1a1a3a';
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }
    if (response.length) {
      for (const [width, color] of [[4, '#22d3ee44'], [2, '#22d3ee']]) {
        ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath();
        response.forEach((db, index) => {
          const x = index / (response.length - 1) * w, y = clamp(yAtGain(db), 0, h);
          if (index) ctx.lineTo(x, y); else ctx.moveTo(x, y);
        });
        ctx.stroke();
      }
    }
    bands.forEach((band, index) => {
      if (!band.enabled) return;
      const [x, y] = point(index);
      ctx.fillStyle = colors[index]; ctx.beginPath();
      ctx.arc(x, y, index === selected ? 7 : 5, 0, Math.PI * 2); ctx.fill();
      if (index === selected) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke(); }
    });
    ctx.fillStyle = '#22d3ee'; ctx.font = '11px sans-serif'; ctx.fillText('EQ', 4, 13);
  }
  function local(event) {
    const rect = canvas.getBoundingClientRect();
    return [clamp((event.clientX - rect.left) / rect.width * 216, 0, 216),
      clamp((event.clientY - rect.top) / rect.height * 108, 0, 108)];
  }
  function move(event) {
    if (selected < 0) return;
    const [x, y] = local(event), band = bands[selected];
    band.freq = frequencyAt(x);
    if (usesGain(band.type)) band.gain = gainAt(y); else band.q = qAt(y);
    send(selected, 'freq', 2);
    send(selected, usesGain(band.type) ? 'gain' : 'q', usesGain(band.type) ? 3 : 4);
    sync(); paint();
  }
  canvas.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    const [x, y] = local(event);
    selected = hit(x, y);
    if (selected < 0) {
      selected = bands.findIndex(band => !band.enabled);
      if (selected < 0) { sync(); return; }
      bands[selected].enabled = true;
      bands[selected].type = insertType;
      bands[selected].q = 1;
      sendBand(selected);
    } else insertType = bands[selected].type;
    dragging = true; canvas.setPointerCapture(event.pointerId);
    move(event);
  });
  canvas.addEventListener('pointermove', event => { if (dragging) move(event); });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(type, () => { dragging = false; });
  canvas.addEventListener('dblclick', () => {
    if (selected < 0) return;
    bands[selected].enabled = false;
    send(selected, 'enabled', 0);
    selected = -1; sync(); paint();
  });
  canvas.addEventListener('wheel', event => {
    const [x, y] = local(event), index = hit(x, y);
    if (index >= 0) selected = index;
    if (selected < 0) return;
    event.preventDefault();
    bands[selected].q = clamp(bands[selected].q + (event.deltaY < 0 ? .1 : -.1), .1, 24);
    send(selected, 'q', 4); sync(); paint();
  }, { passive: false });
  selector.addEventListener('change', () => {
    insertType = Number(selector.value);
    if (selected >= 0) { bands[selected].type = insertType; send(selected, 'type', 1); sync(); paint(); }
  });
  fields.forEach((field, offset) => field.addEventListener('change', () => {
    if (selected < 0) return;
    const value = Number(field.value);
    if (!Number.isFinite(value)) { sync(); return; }
    const key = ['freq', 'gain', 'q'][offset], min = [20, -24, .1][offset], max = [20000, 24, 24][offset];
    bands[selected][key] = clamp(value, min, max);
    send(selected, key, offset + 2); sync(); paint();
  }));
  sync(); paint();
  return {
    paint,
    setResponse(values) { response = values ?? []; paint(); },
    snapshot() { return { bands: bands.map(band => ({ ...band })), selected, insertType, output, mix }; },
    restore(state) {
      state.bands.forEach((band, index) => Object.assign(bands[index], band));
      selected = state.selected; insertType = state.insertType;
      output = state.output ?? 0; mix = state.mix ?? 1;
      sync(); paint(); this.sendState();
    },
    sendState() {
      bands.forEach((_, index) => sendBand(index));
      parameter(ids.output, output); parameter(ids.mix, mix);
    },
  };
}
