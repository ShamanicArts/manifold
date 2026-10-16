import { readFile, writeFile } from 'node:fs/promises';
import { highlight } from '../../../web/handbook/highlight.js';
import { lowerDevice } from '../../../packages/manifold/graph.js';
const examples = {};
for (const name of ['gain', 'tone', 'spectral', 'explicit-device']) {
  const url = new URL(`../../../packages/manifold/examples/${name}.js`, import.meta.url);
  const { default: device } = await import(url);
  const source = await readFile(url, 'utf8'),
    result = lowerDevice(device);
  examples[name] = {
    source,
    html: highlight(source, 'javascript'),
    name: device.name,
    id: device.id,
    view: result.view,
    endpoints: result.project.endpoints,
    io: result.project.signal.io,
    midi: result.project.signal.nodes.some((n) => n.type === 'midi-input'),
  };
}
const original = await readFile(new URL('index.html', import.meta.url), 'utf8');
const styles = original.match(/<style>([\s\S]*?)<\/style>/)[1];
const namingExample = highlight(
  "const spectral = device.add('spectral', phaseVocoder);",
  'javascript',
);
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Manifold · Device prototype</title><style>${styles}
#source .shiki{height:640px}dt{font-weight:600;margin-top:14px;font-size:14px}dd{margin:3px 0;color:var(--dim);font-size:13px}.state{color:var(--brand)}@media(max-width:800px){#source .shiki{height:auto;max-height:680px}}
</style></head><body><main>
<header><div><div class="eyebrow">Manifold · Working Device prototype</div><h1>A, with room to grow.</h1></div><label class="theme">Appearance<select id="theme"><option>system</option><option>light</option><option>dark</option></select></label></header>
<p class="lede">Actual imported source. Effect and instrument are conveniences over the same Device. Explicit ports let the same composition grow to include audio and MIDI.</p>
<div class="candidates" role="group" aria-label="Working example"><button data-example="gain">Gain effect</button><button data-example="tone">Filtered instrument</button><button data-example="spectral" aria-pressed="true">Spectral effect</button><button data-example="explicit-device">Explicit Device + MIDI</button></div>
<div class="grid"><section class="code"><div class="code-title"><span id="filename"></span><span>Real JavaScript · local prototype</span></div><div id="source"></div></section><aside><div><h2 id="name"></h2><p id="identity"></p><h3>Declared boundaries</h3><p id="boundaries"></p><h3>Default controls</h3><p>These records are derived from the actual declarations. The running Studio view uses the same endpoints.</p><dl id="controls"></dl></div><div class="recommendation"><strong>What changed after review</strong><p>Stable ID and display name are separate. Configuration declares initial state. Controls belong to the device. Every factory returns the same kind of declaration.</p></div></aside></div>
<p class="status">Source and derived metadata review; no audio plays here. The examples import the private local “manifold” package. This is not an npm installation instruction.</p>
<section id="names" class="details" hidden><h2>Which names can I choose?</h2>
<p><strong>device</strong> is our ordinary JavaScript variable name. Every later <strong>device.input</strong> or <strong>device.control</strong> refers to the same object declared above. You could call it <strong>spectralShift</strong> and update those uses consistently.</p>
${namingExample}
<dl><dt>const — JavaScript</dt><dd>Declares a name that cannot be reassigned. The object it refers to can still be configured.</dd>
<dt>device and the spectral on the left — our local names</dt><dd>device was declared earlier. spectral names the processor instance returned by this call.</dd>
<dt>The quoted 'spectral' — stable authored identity</dt><dd>This names the processor inside the device for saved identity and lookup. Renaming a local variable does not require changing this string.</dd>
<dt>phaseVocoder — imported definition</dt><dd>The import at the top brings this processor definition from Manifold into the script.</dd>
<dt>add — Manifold API</dt><dd>A method supplied by Manifold. The parentheses call it with the values inside.</dd></dl>
<p class="small">The general constructor teaches explicit boundaries. createEffect also allows extra inputs, including MIDI.</p></section>
<details class="details"><summary>What is proved, and what remains</summary><p>Real JS/TS imports, inferred parameter/port members, default controls, semantic identity, source navigation, save/reopen and accepted values have automated coverage. The three audio examples also render through the existing native and Wasm engines in an offline comparison.</p><p>This prototype handles stereo audio buses and one MIDI input. Wider boundary types, nested Device composition, visual graph rewriting, custom presenter helpers and public package publication remain follow-up work. Existing graph tooling stays available through manifold/graph.</p></details>
<footer>Refined from <a href="https://github.com/ShamanicArts/gpt-scratchpad/issues/2#issuecomment-6116255716" target="_blank" rel="noreferrer">Lucas + GPT's review</a>. Broad example and handbook migration awaits review of this working source.</footer>
</main><script>
const examples=${JSON.stringify(examples).replaceAll('<', '\\u003c')};
const el=id=>document.getElementById(id);
function show(key){el('names').hidden=key!=='explicit-device';const value=examples[key];el('source').innerHTML=value.html;el('filename').textContent=key+'.js';el('name').textContent=value.name;el('identity').textContent='Stable ID: '+value.id;el('boundaries').textContent=value.io.inputs.length+' stereo audio input(s) · '+value.io.outputs.length+' stereo output(s)'+(value.midi?' · MIDI events':'');el('controls').replaceChildren();for(const view of value.view){const endpoint=value.endpoints.find(e=>e.path===view.path);const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=view.label;dd.textContent=endpoint.min+' to '+endpoint.max+(view.unit?' '+view.unit:'')+' · default '+endpoint.default;el('controls').append(dt,dd)}document.querySelectorAll('[data-example]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.example===key)))}
document.querySelectorAll('[data-example]').forEach(b=>b.addEventListener('click',()=>show(b.dataset.example)));
function theme(value){if(value==='system')delete document.documentElement.dataset.theme;else document.documentElement.dataset.theme=value;el('theme').value=value;try{localStorage.setItem('manifold-device-review-theme',value)}catch{}}
let saved='system';try{saved=localStorage.getItem('manifold-device-review-theme')||'system'}catch{}theme(['light','dark','system'].includes(saved)?saved:'system');el('theme').addEventListener('change',()=>theme(el('theme').value));show('spectral');
</script></body></html>`;
await writeFile(new URL('prototype.html', import.meta.url), html);
console.log(
  'Rendered four real Device modules with their actual lowered control/boundary metadata.',
);
