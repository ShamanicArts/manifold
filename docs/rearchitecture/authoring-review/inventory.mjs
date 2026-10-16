// Read-only source audit. Findings are search signals, not semantic verdicts.
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { programs } from '../../../packages/manifold-author/examples/primitive-library.mjs';
import { source as filter } from '../../../packages/manifold-author/examples/standalone-filter.mjs';
import { source as oscillator } from '../../../packages/manifold-author/examples/standalone-oscillator.mjs';
import { source as main } from '../../../packages/manifold-author/examples/main-wave-creator.mjs';
const root = new URL('../../../', import.meta.url);
const rows = [];
const signals = {
  graphWorkspace: /\b(?:createGraphWorkspace|GraphWorkspace)\b/,
  numericIdentity: /\bid['"]?\s*:\s*\d|\bid['"]?\s*:\s*(?:ids\.|nodeId|.*Id\()/,
  typeSelector: /\.type\b|\.add\(['"][a-z]+(?:-[a-z]+)*['"],\s*\{/,
  separateInstanceRegistration: /\bregisterInstance\b/,
  stringParameterOrPort: /\.(?:parameter|input|output)\(['"]/,
  controlExposure: /\.expose\(|\bregisterParameter\b/,
  viewDeclaration: /\bview\s*[:=]|type:\s*['"]parameter['"]/,
  studioBookkeeping: /\b(?:studioGraph|studioParameters|applyStudioGraph)\b/,
  hostOrSerialization:
    /\b(?:BrowserGraphHost|AudioContext|toProject|GraphWorkspace\.fromProject)\b/,
};
function scan(surface, file, source, extra = {}) {
  const lines = source.split('\n');
  rows.push({
    surface,
    file,
    ...extra,
    lines: lines.length,
    signals: Object.fromEntries(
      Object.entries(signals).map(([name, pattern]) => [
        name,
        lines.flatMap((line, index) => (pattern.test(line) ? [index + 1] : [])),
      ]),
    ),
  });
}
async function scanFiles(directory, surface, pattern) {
  for (const name of (await readdir(new URL(directory, root))).sort()) {
    if (!pattern.test(name)) continue;
    const file = directory + '/' + name;
    scan(surface, file, await readFile(new URL(file, root), 'utf8'));
  }
}
await scanFiles('packages/manifold-author/examples', 'package-example-file', /\.(?:mjs|mts)$/);
await scanFiles('web/handbook/examples', 'handbook-executable', /\.mjs$/);
await scanFiles('docs/handbook', 'handbook-lesson', /\.md$/);
await scanFiles('web/src/authoring/templates', 'studio-template', /\.js$/);
for (const file of ['README.md', 'packages/manifold-author/README.md'])
  scan('public-readme', file, await readFile(new URL(file, root), 'utf8'));
scan(
  'handbook-host-controls',
  'web/handbook/examples.js',
  await readFile(new URL('web/handbook/examples.js', root), 'utf8'),
);
for (const file of [
  'packages/manifold-author/studio-graph.js',
  'packages/manifold-author/studio-source.js',
  'packages/manifold-author/audio-graphs.js',
  'packages/manifold-studio/agent-tools.js',
  'docs/rearchitecture/studio-agent-quickstart.md',
])
  scan('studio-generation-or-agent-guidance', file, await readFile(new URL(file, root), 'utf8'));
const field = JSON.parse(
  await readFile(new URL('web/public/studio/field-rules.manifold.json', root), 'utf8'),
);
scan('handbook-executable', 'web/public/studio/field-rules.manifold.json#source', field.source);
for (const example of [
  ...programs,
  { id: 'standalone-filter', source: filter },
  { id: 'standalone-oscillator', source: oscillator },
  { id: 'main-wave', source: main },
])
  scan('delivered-live-source', example.id, example.source);
const counts = Object.fromEntries(
  [...new Set(rows.map((row) => row.surface))].map((surface) => {
    const entries = rows.filter((row) => row.surface === surface);
    return [
      surface,
      {
        total: entries.length,
        ...Object.fromEntries(
          Object.keys(signals).map((signal) => [
            signal,
            entries.filter((row) => row.signals[signal].length).length,
          ]),
        ),
      },
    ];
  }),
);
const report = {
  sourceRevision: '836f58e4c889',
  inspectedAt: '2026-10-12',
  method:
    'Line-level search signals, complemented by the manual review in README.md. Generated files and displayed sources intentionally overlap. Counts are not a count of distinct designs or proof of duplicate metadata.',
  counts,
  rows,
};
await writeFile(new URL('inventory.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(counts, null, 2));
