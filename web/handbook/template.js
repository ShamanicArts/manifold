import { examples, examplePath } from './examples.js';
import { highlight } from './highlight.js';
import { pages, pagePath, markdownPath } from './catalog.js';

export const escapeHtml = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char],
  );

export function renderPage(page, { content, headings, edition }) {
  const groups = [...new Set(pages.map((p) => p.group))];
  const e = escapeHtml;
  const navigation = groups
    .map(
      (group) =>
        `<section class="chapter-group"><h2>${e(group)}</h2><ul>${pages
          .filter((p) => p.group === group)
          .map(
            (p) =>
              `<li><a href="${pagePath(p)}" ${p === page ? 'aria-current="page"' : ''}>${e(p.title)}</a></li>`,
          )
          .join('')}</ul></section>`,
    )
    .join('');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${e(page.title)} · Manifold</title><meta name="description" content="${e(page.summary)}"><link rel="icon" href="data:,">
<link rel="alternate" type="text/markdown" href="${markdownPath(page)}" title="This page as Markdown">
<link rel="stylesheet" href="/src/handbook/handbook.css"><script type="module" src="/src/handbook/index.js"></script></head>
<body data-topic="${e(page.slug)}" data-edition="${edition}"><a class="skip" href="#content">Skip to content</a>
<header class="site-header"><a class="brand" href="/learn/">Manifold</a><div class="header-main"><nav aria-label="Site"><a href="/learn/" aria-current="true">Documentation</a><a class="studio-link" href="/studio/">Manifold Studio <span aria-hidden="true">↗</span></a></nav><label class="appearance">Appearance <select id="appearance" aria-label="Appearance"><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></label><button class="chapters-toggle" aria-expanded="false" aria-controls="chapters">Chapters</button></div></header>
<div class="page-layout"><aside class="chapters" id="chapters"><label class="search-label" for="topic-search">Find a topic</label><input type="search" id="topic-search" placeholder="Find a topic…" autocomplete="off"><nav aria-label="Chapters">${navigation}</nav><p id="no-topics" hidden>No matching topics.</p><footer>Preview documentation<br><a href="/learn/agents/">For agents</a> · <a href="/learn/manifest.json">Topic index</a></footer></aside>
<main id="content"><div class="breadcrumb">Documentation <span aria-hidden="true">/</span> ${e(page.group)}</div><h1>${e(page.title)}</h1><p class="lead">${e(page.summary)}</p>
<div class="page-tools"><a href="${markdownPath(page)}">Read as Markdown</a><button id="ask-agent" aria-expanded="false" aria-controls="agent-help">Ask your agent</button></div>
<section id="agent-help" class="agent-help" hidden aria-label="Prompt for your agent"><h2>Take this topic to your agent</h2><p>This prompt includes the lesson, architecture and agent workflow. Edit it if you want a different task, then copy it into your agent.</p><label for="agent-prompt">Prompt</label><textarea id="agent-prompt" rows="10" spellcheck="false"></textarea><div class="prompt-actions"><button id="copy-prompt">Copy prompt</button><span id="copy-status" role="status"></span></div><p class="small">Copying does not connect an agent or give it access to a project.</p></section>
<article>${content}</article>
<section class="related"><h2>Continue learning</h2><ul>${page.related
    .map((slug) => pages.find((p) => p.slug === slug))
    .map(
      (p) =>
        `<li><a href="${pagePath(p)}">${e(p.title)} <span aria-hidden="true">→</span></a><p>${e(p.summary)}</p></li>`,
    )
    .join('')}</ul></section>
<footer class="page-footer">Preview · Documentation edition <code>${edition}</code></footer></main>
<aside class="page-index"><nav aria-label="On this page"><strong>On this page</strong>${headings.map((h) => `<a href="#${e(h.id)}">${e(h.text)}</a>`).join('')}</nav></aside></div></body></html>`;
}

export function exampleMarkup(id, source) {
  const spec = examples[id],
    e = escapeHtml;
  const document = id === 'field' ? JSON.parse(source) : null;
  const files = document
    ? [{ path: '/project.mjs', content: document.source }, ...document.files]
    : [{ path: '/' + spec.source, content: source }];
  return `<section class="audio-example lab" aria-label="Live ${e(spec.title)} example" data-example="${id}">
<header><strong>${e(spec.title)}</strong><span class="flex-space"></span><button data-action="audio" disabled>Loading audio controls…</button><button data-action="reset">Reset</button></header>
<div class="lab-surface">
${id === 'field' ? '<div data-presentation class="field-presentation" role="img" aria-label="Standing field and its audio-driven relief"></div>' : ''}
${
  spec.keyboard
    ? `<div class="lab-presets" aria-label="Playable notes"><span>Play a note</span>${[
        ['C4', 60],
        ['D4', 62],
        ['E4', 64],
        ['G4', 67],
        ['A4', 69],
        ['C5', 72],
      ]
        .map(
          ([label, note]) =>
            `<button data-note="${note}" disabled aria-label="Play ${label}">${label}</button>`,
        )
        .join('')}</div>`
    : ''
}
${spec.liveInput ? '<div class="lab-presets"><label>Microphone / interface <select data-audio-input><option value="default">Default microphone / interface</option></select></label><button data-action="input">Connect microphone</button></div>' : ''}
<div class="lab-controls">${spec.controls.map((control, index) => `<label class="lab-control" for="control-${index}"><span>${e(control.label)}<output data-readout="${index}" for="control-${index}"></output></span><input id="control-${index}" data-control="${index}" type="range" min="${control.min}" max="${control.max}" step="${control.step}" value="${control.value}"></label>`).join('')}</div>
${spec.presets ? `<div class="lab-presets"><span>Try a sound</span>${spec.presets.map((preset, index) => `<button data-preset="${index}">${e(preset.label)}</button>`).join('')}</div>` : ''}
<div class="scope-label"><span>${['sources', 'gain', 'field', 'instrument', 'reusable'].includes(id) ? 'Output waveform' : 'Measured output spectrum · 0–2.4 kHz'}</span><span data-audio-state>Audio stopped</span></div><canvas data-scope role="img" aria-label="Actual audio output measurement"></canvas>
<p class="measurement" data-measurement>Start audio to measure the output.</p></div>
<div class="gain-actions"><button data-action="graph" aria-expanded="false" aria-controls="example-graph">Graph</button><button data-action="source" aria-expanded="false" aria-controls="example-source">Source</button><button data-action="studio" disabled>Open in Manifold Studio ↗</button><button data-action="download" disabled>Save project</button></div>
<p data-example-status role="status" class="example-status">Audio starts only when you choose Start audio.</p>
<div id="example-graph" class="example-detail" hidden><div data-graph></div><p class="small">These nodes and named cables come from the accepted project. Select a node to follow its source.</p></div>
<div id="example-source" class="example-detail" hidden><div class="source-heading"><a href="${examplePath(id)}">Download exact ${document ? 'project' : 'source'}</a><span>Running implementation</span></div>${files.map((file, index) => `<details data-source-file="${e(file.path)}" ${index === 0 ? 'open' : ''}><summary>${e(file.path)}</summary>${highlight(file.content, 'js')}</details>`).join('')}</div>
<noscript><p>Enable JavaScript to run the example. Its source and lesson remain available.</p></noscript></section>`;
}
