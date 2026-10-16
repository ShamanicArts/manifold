// Build the standalone review; no proposed authoring API is executed.
import { readFile, writeFile } from 'node:fs/promises';
import { highlight } from '../../../web/handbook/highlight.js';

const root = new URL('./', import.meta.url);
const model = JSON.parse(await readFile(new URL('candidates.json', root), 'utf8'));
for (const [key, candidate] of Object.entries(model.candidates)) {
  candidate.examples = {};
  for (const example of model.examples) {
    const source = await readFile(new URL(`candidates/${key}-${example}.js`, root), 'utf8');
    candidate.examples[example] = { source, html: highlight(source, 'javascript') };
  }
  const discovery = await readFile(new URL(`candidates/${key}-discovery.ts`, root), 'utf8');
  candidate.discoveryHtml = highlight(discovery, 'typescript');
}
const payload = JSON.stringify(model).replaceAll('<', '\\u003c');
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Manifold · Creative authoring review</title>
<style>
:root {color-scheme:light dark;--page:#f5f4ef;--ink:#20262b;--dim:#58636a;--line:#c8cecc;--surface:#fff;--tint:#e8ebe6;--brand:#78562a;--selected:#e8ddc7;--token-mode:light}
@media(prefers-color-scheme:dark){:root{--page:#171c20;--ink:#e4e8e7;--dim:#a9b7bc;--line:#3a454b;--surface:#1e252a;--tint:#293239;--brand:#e5bf80;--selected:#493f2e;--token-mode:dark}}
:root[data-theme=light]{color-scheme:light;--page:#f5f4ef;--ink:#20262b;--dim:#58636a;--line:#c8cecc;--surface:#fff;--tint:#e8ebe6;--brand:#78562a;--selected:#e8ddc7}
:root[data-theme=dark]{color-scheme:dark;--page:#171c20;--ink:#e4e8e7;--dim:#a9b7bc;--line:#3a454b;--surface:#1e252a;--tint:#293239;--brand:#e5bf80;--selected:#493f2e}
*{box-sizing:border-box}body{margin:0;background:var(--page);color:var(--ink);font:15px/1.5 system-ui,sans-serif;padding:24px}main{max-width:1260px;margin:auto}header{display:flex;align-items:start;justify-content:space-between;gap:20px}h1{font-size:27px;letter-spacing:-.6px;margin:3px 0 8px;line-height:1.2}h2{font-size:18px;letter-spacing:-.2px;margin:0 0 8px}h3{font-size:13px;margin:20px 0 5px;text-transform:uppercase;letter-spacing:.07em;color:var(--dim)}p{margin:0 0 12px}.eyebrow{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--brand)}.lede{max-width:76ch;color:var(--dim);margin:0 0 18px}.small{font-size:12px;color:var(--dim)}button,select{font:inherit;color:var(--ink);background:var(--surface);border:1px solid var(--line);border-radius:5px;padding:8px 10px;cursor:pointer}button:hover,select:hover{border-color:var(--brand)}button:focus-visible,select:focus-visible,summary:focus-visible,a:focus-visible{outline:2px solid var(--brand);outline-offset:3px}button[aria-pressed=true]{background:var(--selected);border-color:var(--brand)}.candidates{display:flex;gap:8px;margin:8px 0 18px;flex-wrap:wrap}.candidates button{text-align:left;min-width:175px;flex:1;padding:10px 14px}.candidates b{font-size:15px}.candidates span{display:block;font-size:12px;color:var(--dim);margin-top:2px}.bar{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-bottom:12px}.bar label{display:flex;align-items:center;gap:10px;font-size:13px}.bar select{font-size:13px;max-width:100%}.grid{display:grid;grid-template-columns:minmax(0,1fr) 270px;gap:24px}.code{min-width:0}.code-title{display:flex;justify-content:space-between;align-items:center;padding:8px 12px;border:1px solid var(--line);border-bottom:0;border-radius:6px 6px 0 0;background:var(--tint);font-size:12px}.code-title button{padding:3px 8px;font-size:12px}.shiki{margin:0;padding:16px 18px;overflow:auto;font:13px/1.65 ui-monospace,SFMono-Regular,Consolas,monospace;background:var(--surface);border:1px solid var(--line);border-radius:0 0 6px 6px;tab-size:2}.shiki span{color:var(--shiki-light)}@media(prefers-color-scheme:dark){:root:not([data-theme=light]) .shiki span{color:var(--shiki-dark)}}:root[data-theme=dark] .shiki span{color:var(--shiki-dark)}#source .shiki{height:570px}.recommendation{border-left:3px solid var(--brand);padding-left:12px;font-size:13px;margin-top:22px}.details{border-top:1px solid var(--line);margin-top:22px;padding-top:14px}details{margin:12px 0}summary{cursor:pointer;color:var(--ink);font-weight:600;font-size:14px}details p{color:var(--dim);font-size:13px;margin-top:9px}details .shiki{margin-top:12px;border-radius:5px;max-height:480px}aside p{font-size:13px;color:var(--dim)}.status{margin-top:12px;font-size:12px;color:var(--dim)}a{color:var(--brand)}footer{font-size:12px;margin-top:18px;color:var(--dim)}.theme{display:flex;gap:7px;align-items:center;font-size:12px}.theme select{padding:4px;font-size:12px}.flow{font-size:12px;color:var(--brand);font-weight:600;margin:8px 0 12px}
@media(max-width:800px){body{padding:16px}.grid{grid-template-columns:minmax(0,1fr)}aside{display:grid;grid-template-columns:1fr 1fr;gap:14px}aside h3{margin-top:0}.recommendation{margin:0;grid-column:1/-1}.bar{align-items:start;flex-direction:column}.candidates{gap:6px}.candidates button{min-width:130px}#source .shiki{height:auto;max-height:600px}.theme{flex-direction:column;align-items:end}}
@media(max-width:450px){h1{font-size:23px}aside{display:block}.candidates button{min-width:100%;padding:8px 12px}.bar label{display:block}.bar select{display:block;margin-top:5px}.shiki{font-size:12px;padding:12px}.theme{font-size:11px}}
</style></head><body><main>
<header><div><div class="eyebrow">Manifold · API design review</div><h1>Make the patch readable.</h1></div><label class="theme">Appearance<select id="theme" aria-label="Appearance"><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></label></header>
<p class="lede">Three possible authoring styles. The same gain, filtered tone and spectral effect in each. <strong>Proposals only; these APIs are not implemented.</strong></p>
<div class="candidates" role="group" aria-label="Authoring candidate">
<button data-candidate="a" aria-pressed="true"><b>A · Named objects</b><span>Create, add, control, connect</span></button>
<button data-candidate="b" aria-pressed="false"><b>B · Declarative recipe</b><span>One structured description</span></button>
<button data-candidate="c" aria-pressed="false"><b>C · Composable values</b><span>Describe pieces, assemble them</span></button>
</div>
<div class="bar"><label>Patch<select id="example"><option value="gain">Pass-through + gain</option><option value="tone">Oscillator → low-pass filter</option><option value="spectral" selected>Phase vocoder · pitch + mix</option></select></label><span class="small">Explicit imports · semantic names · controls declared once</span></div>
<div class="grid"><section class="code" aria-label="Proposed JavaScript source"><div class="code-title"><span id="filename"></span><button id="copy">Copy proposal</button></div><div id="source"></div><p class="status">Syntax-highlighted design sketches. “manifold” is the proposed import name; package availability is not established.</p></section>
<aside><div><h2 id="candidate-title"></h2><p id="summary"></p><div id="flow" class="flow"></div><h3>What you gain / what it costs</h3><p id="tradeoff"></p></div><div><h3>Identity</h3><p id="identity"></p><h3>Editor discovery</h3><p id="discovery"></p></div><div class="recommendation"><strong>Aster's recommendation: A.</strong><p>The most direct reading order. Build one small facade over the existing graph contract after reviewing the syntax.</p></div></aside></div>
<section class="details"><details><summary>How this becomes today's graph</summary><p id="lowering"></p><p>Saved semantic names resolve to the existing node mapping and host automation slots. Reordering declarations or renaming a local variable must preserve those mappings. Renaming the actual declared key is an identity change. Compilation and validation stay off the audio thread.</p></details>
<details><summary>TypeScript / editor discovery sketch</summary><p>Expected inference for the spectral example in the selected style. These comments specify intended editor behaviour; a facade type implementation has not been built or type-checked.</p><div id="discovery-source"></div></details>
<details><summary>Controls, hosts and the expert escape hatch</summary><p>One control reference supplies identity, target, range, default, label and unit. Studio can derive a basic interface; custom presenters and agents reuse the reference. The host starts audio and owns processor state.</p><p>All three styles can explicitly lower into a detached GraphWorkspace draft for expert inspection and transformation. The existing raw graph API remains available. No new audio runtime is proposed.</p><p>The low-pass filter definition shown here would preset the existing state-variable filter. It does not require a new DSP implementation.</p></details></section>
<footer>Review against <a href="https://github.com/ShamanicArts/gpt-scratchpad/issues/2" target="_blank" rel="noreferrer">scratchpad issue 2</a> · Nine JavaScript patches · Three TypeScript discovery sketches · Runtime migration awaits design review.</footer>
</main><script>
const model=${payload};
let candidate='a';
const el=id=>document.getElementById(id);
const flows={gain:'Audio input → level → audio output',tone:'Voice → filter → audio output',spectral:'Audio input → spectral → audio output'};
function render(){
 const selected=model.candidates[candidate], example=el('example').value;
 el('candidate-title').textContent=selected.title;
 for(const field of ['summary','tradeoff','identity','discovery','lowering'])el(field).textContent=selected[field];
 el('flow').textContent=flows[example];
 el('filename').textContent=candidate+'-'+example+'.js · proposed API';
 el('source').innerHTML=selected.examples[example].html;
 el('discovery-source').innerHTML=selected.discoveryHtml;
 el('copy').textContent='Copy proposal';
 document.querySelectorAll('[data-candidate]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.candidate===candidate)));
}
document.querySelectorAll('[data-candidate]').forEach(button=>button.addEventListener('click',()=>{candidate=button.dataset.candidate;render()}));
el('example').addEventListener('change',render);
el('copy').addEventListener('click',async()=>{
 try{await navigator.clipboard.writeText(model.candidates[candidate].examples[el('example').value].source);el('copy').textContent='Copied';}
 catch{const range=document.createRange();range.selectNodeContents(el('source'));const selection=getSelection();selection.removeAllRanges();selection.addRange(range);el('copy').textContent='Selected — copy with keyboard';}
});
function appearance(value){if(value==='system')delete document.documentElement.dataset.theme;else document.documentElement.dataset.theme=value;el('theme').value=value;try{localStorage.setItem('manifold-authoring-review-theme',value)}catch{}}
let saved='system';try{saved=localStorage.getItem('manifold-authoring-review-theme')||'system'}catch{}
appearance(['system','light','dark'].includes(saved)?saved:'system');
el('theme').addEventListener('change',()=>appearance(el('theme').value));
render();
</script></body></html>`;
await writeFile(new URL('index.html', root), html);
console.log('Built authoring-review/index.html: 9 JS proposals, 3 TS discovery sketches.');
