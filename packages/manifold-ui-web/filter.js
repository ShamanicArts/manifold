import { mountCompactSlider } from './compact-slider.js';

const minFreq = 80, maxFreq = 16_000, minReso = .1, maxReso = 2;
const logMin = Math.log(minFreq), logMax = Math.log(maxFreq);
const colours = ['#a78bfa', '#38bdf8', '#fb7185', '#4ade80'];
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const freqToX = (freq, width) => (Math.log(clamp(freq, minFreq, maxFreq)) - logMin) / (logMax - logMin) * width;
const xToFreq = (x, width) => Math.exp(logMin + clamp(x / width, 0, 1) * (logMax - logMin));

// Main/ui/behaviors/filter.lua uses this response approximation for its graph.
function svfMagnitude(freq, cutoff, resonance, type) {
  const ratio = freq / cutoff;
  if (ratio < .1) return type === 0 || type === 3 ? 1 : 0;
  if (ratio > 10) return type === 2 || type === 3 ? 1 : 0;
  const squared = ratio * ratio;
  const q = Math.max(.5, resonance * 2);
  const denominator = Math.max(1e-10, (1 - squared) ** 2 + (ratio / q) ** 2);
  if (type === 0) return 1 / Math.sqrt(denominator);
  if (type === 1) return ratio / q / Math.sqrt(denominator);
  if (type === 2) return squared / Math.sqrt(denominator);
  return Math.sqrt((1 - squared) ** 2 / denominator);
}

export function mountFilterResponse(canvas, parameter) {
  const ctx = canvas.getContext('2d');
  let cutoff = 3200, resonance = .75, filterType = 0;
  function paint() {
    const width = canvas.clientWidth, height = canvas.clientHeight, dbRange = 14;
    // A hidden renderer has no layout size. Keep its last backing store until
    // it is visible again, rather than assigning an intrinsic fallback size.
    if (!width || !height) return;
    if (canvas.width !== width * 2 || canvas.height !== height * 2) {
      canvas.width = width * 2;
      canvas.height = height * 2;
    }
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    ctx.fillStyle = '#0d1420'; ctx.fillRect(0, 0, width, height);
    for (const freq of [100, 500, 1000, 5000, 10_000]) {
      const x = freqToX(freq, width);
      ctx.strokeStyle = '#1a1a3a'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x + .5, 0); ctx.lineTo(x + .5, height); ctx.stroke();
    }
    for (const db of [-24, -12, 0, 12, 24]) {
      const y = Math.floor(height * .5 - db / dbRange * height * .45);
      if (y < 0 || y > height) continue;
      ctx.strokeStyle = db === 0 ? '#1f2b4d' : '#1a1a3a';
      ctx.beginPath(); ctx.moveTo(0, y + .5); ctx.lineTo(width, y + .5); ctx.stroke();
    }
    const colour = colours[filterType];
    ctx.fillStyle = colour; ctx.font = '11px sans-serif'; ctx.fillText('FILTER', 4, 13);
    const cutoffX = freqToX(cutoff, width);
    ctx.strokeStyle = `${colour}66`; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(cutoffX, 0); ctx.lineTo(cutoffX, height); ctx.stroke();
    const path = [];
    for (let index = 0; index <= 200; index++) {
      const x = index * width / 200;
      const freq = clamp(xToFreq(x, width), cutoff * .25, cutoff * 4);
      const magnitude = svfMagnitude(freq, cutoff, resonance, filterType);
      const db = clamp(20 * Math.log10(magnitude + 1e-10), -dbRange, dbRange);
      const y = clamp(height * .5 - db / dbRange * height * .45, 1, height - 1);
      path.push({ x, y });
    }
    ctx.strokeStyle = `${colour}33`; ctx.lineWidth = 1;
    for (const point of path) {
      ctx.beginPath(); ctx.moveTo(point.x, point.y); ctx.lineTo(point.x, height * .5); ctx.stroke();
    }
    ctx.strokeStyle = colour; ctx.lineWidth = 2; ctx.beginPath();
    path.forEach(({ x, y }, index) => index ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
    ctx.stroke();
    const peak = svfMagnitude(cutoff, cutoff, resonance, filterType);
    const peakDb = clamp(20 * Math.log10(peak + 1e-10), -dbRange, dbRange);
    const peakY = height * .5 - peakDb / dbRange * height * .45;
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(cutoffX, peakY, 5, 0, Math.PI * 2); ctx.fill();
  }

  let dragging = false;
  function dragTo(event) {
    const box = canvas.getBoundingClientRect();
    cutoff = Math.round(xToFreq((event.clientX - box.left) / box.width * 226, 226));
    const y = clamp((event.clientY - box.top) / box.height, 0, 1);
    resonance = Math.round((minReso + (1 - y) * (maxReso - minReso)) * 100) / 100;
    parameter({cutoff, resonance}); paint();
  }
  canvas.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    dragging = true; canvas.setPointerCapture(event.pointerId); dragTo(event);
  });
  canvas.addEventListener('pointermove', event => { if (dragging) dragTo(event); });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(type, () => { dragging = false; });
  const observer = new ResizeObserver(paint); observer.observe(canvas); paint();
  return { paint, sync(state) { filterType=state.mode;cutoff=state.cutoff;resonance=state.resonance;paint(); }, destroy(){observer.disconnect();} };
}

export function mountMainFilter(get, parameter, ids) {
  const mode=get('filter-mode');
  const state={mode:0,cutoff:3200,resonance:.75};
  const cutoffSlider=mountCompactSlider(get('filter-cutoff'),{label:'Cutoff',min:minFreq,max:maxFreq,step:1,value:state.cutoff,style:{colour:'#a78bfa',bg:'#1e1b33'}});
  const resonanceSlider=mountCompactSlider(get('filter-resonance'),{label:'Reso',min:minReso,max:maxReso,step:.01,value:state.resonance,style:{colour:'#d8b4fe',bg:'#241a33'}});
  const response=mountFilterResponse(get('filter-graph'), values=>{cutoffSlider.setValue(values.cutoff,true);resonanceSlider.setValue(values.resonance,true);});
  cutoffSlider.onChange(value=>{state.cutoff=value;parameter(ids.filterCutoff,value);response.sync(state);});
  resonanceSlider.onChange(value=>{state.resonance=value;parameter(ids.filterResonance,value);response.sync(state);});
  mode.addEventListener('change',()=>{state.mode=Number(mode.value);parameter(ids.filterMode,state.mode);response.sync(state);});
  return {
    paint(){response.sync(state);cutoffSlider.paint();resonanceSlider.paint();},
    snapshot(){return {...state};},
    sync(next){Object.assign(state,next);mode.value=String(state.mode);cutoffSlider.setValue(state.cutoff);resonanceSlider.setValue(state.resonance);this.paint();},
    restore(next){this.sync(next);this.sendDefaults();},
    sendDefaults(){parameter(ids.filterMode,state.mode);parameter(ids.filterCutoff,state.cutoff);parameter(ids.filterResonance,state.resonance);},
    destroy(){response.destroy();},
  };
}
