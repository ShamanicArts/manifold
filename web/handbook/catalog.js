import { examplePath } from './examples.js';
export const pages = [
  {
    slug: '',
    title: 'Start here',
    group: 'Start here',
    file: 'index.md',
    summary: 'Choose your path through Manifold: Studio, the library, or an agent.',
    task: 'Help me choose a first Manifold project and walk me through its smallest working version.',
    related: ['studio-first-project', 'ring-modulation', 'concepts'],
  },
  {
    slug: 'concepts',
    title: 'How Manifold fits together',
    group: 'Start here',
    file: 'concepts.md',
    summary: 'Understand projects, hosts, graphs, source and the reason for their boundaries.',
    task: 'Explain how Manifold projects, hosts, audio and presentation relate. Use the gain example to make each boundary concrete.',
    related: ['embed-a-gain-stage', 'graphs-and-source', 'agents'],
  },
  {
    slug: 'studio',
    title: 'Meet Manifold Studio',
    group: 'Manifold Studio',
    file: 'studio.md',
    summary:
      'Find your way around the live workspace: a project, five connected views, and room to make it yours.',
    task: 'Walk me through the Studio workspace and help me open the standing-field example.',
    related: ['studio-first-project', 'studio-layout', 'studio-graphs'],
  },
  {
    slug: 'studio-first-project',
    title: 'Your first Studio session',
    group: 'Manifold Studio',
    file: 'studio-first-project.md',
    summary:
      'Open a real project, change its sound and surface, inspect the code, and save your own copy.',
    task: 'Guide me through the standing-field Studio example. Help me change one field rule and save a portable project.',
    related: ['sound-into-surface', 'graphs-and-source', 'studio-save-export'],
  },
  {
    slug: 'studio-layout',
    title: 'Make the workspace yours',
    group: 'Manifold Studio',
    file: 'studio-layout.md',
    summary:
      'Dock panels, keep only the Explorer, save layouts, and give the Presenter the space it needs.',
    task: 'Help me arrange Studio for my workflow and explain which settings belong to the workspace versus the project.',
    related: ['studio', 'studio-graphs', 'studio-save-export'],
  },
  {
    slug: 'studio-graphs',
    title: 'Build a graph inside a node',
    group: 'Manifold Studio',
    file: 'studio-graphs.md',
    summary:
      'Wrap a useful patch, enter its graph, and reuse it without losing sight of shared and local edits.',
    task: 'Help me wrap a small audio graph and add a second independent instance, checking boundary wires and shared definition edits.',
    related: ['graphs-and-source', 'sound-into-surface', 'agents'],
  },
  {
    slug: 'studio-save-export',
    title: 'Save, move and export',
    group: 'Manifold Studio',
    file: 'studio-save-export.md',
    summary:
      'Know what your project contains, what a local draft protects, and what building a plug-in currently requires.',
    task: 'Help me save a portable project, reopen it to verify its content, and establish whether my intended plug-in export target is supported.',
    related: ['studio-first-project', 'agents', 'browser-host'],
  },
  {
    slug: 'audio-sources', title: 'Choose and blend audio sources', group: 'Sound experiments',
    file: 'audio-sources.md', example: 'sources',
    summary: 'Inspect real saw, noise and live inputs, and control their routing inside the graph.',
    task: 'Help me explore Audio Sources: change oscillator frequency, noise color and crossfader routing, then wrap the sources into a reusable Device. Keep hardware selection in the host.',
    related: ['studio-graphs', 'reusable-devices', 'browser-host'],
  },
  {
    slug: 'play-an-instrument',
    title: 'Play and shape an instrument',
    group: 'Sound experiments',
    file: 'play-an-instrument.md',
    summary: 'Play MIDI notes, shape a voice and follow a real instrument from input to output.',
    task: 'Help me adapt Soft Keys into an instrument, explaining MIDI, envelopes and the difference between JavaScript names and stable Device identities.',
    related: ['reusable-devices', 'spectral-pitch', 'studio-first-project'],
    example: 'instrument',
  },
  {
    slug: 'reusable-devices',
    title: 'Build a reusable sound',
    group: 'Sound experiments',
    file: 'reusable-devices.md',
    summary:
      'Put a sound-shaping graph inside a Device, instantiate it twice, and inspect its inner graph.',
    task: 'Help me create and reuse a Device with named boundaries and independent instance controls; verify its source, nested graph and saved values.',
    related: ['studio-graphs', 'graphs-and-source', 'play-an-instrument'],
    example: 'reusable',
  },
  {
    slug: 'ring-modulation',
    title: 'Make metallic sidebands',
    group: 'Sound experiments',
    file: 'ring-modulation.md',
    summary:
      'Multiply two oscillators, hear new frequencies appear, and find them in the measured spectrum.',
    task: 'Help me understand this ring-modulation graph, then adapt its oscillators and wet mix in my own project.',
    related: ['spectral-pitch', 'embed-a-gain-stage', 'studio-graphs'],
    example: 'ring',
  },
  {
    slug: 'spectral-pitch',
    title: 'Move sound through the spectrum',
    group: 'Sound experiments',
    file: 'spectral-pitch.md',
    summary:
      'Transpose a sawtooth with a phase vocoder, compare dry and wet sound, and hear the tradeoffs of spectral processing.',
    task: 'Explain the phase-vocoder example and help me adapt it while preserving off-callback FFT preparation and audio ownership.',
    related: ['ring-modulation', 'browser-host', 'sound-into-surface'],
    example: 'spectral',
  },
  {
    slug: 'sound-into-surface',
    title: 'Turn sound into a surface',
    group: 'Sound experiments',
    file: 'sound-into-surface.md',
    summary:
      'Explore Nacre’s standing fields, then follow real output energy through a rule into a rendered relief.',
    task: 'Help me inspect the field, energy, relief and renderer scripts. Change one rule while preserving the audio path and named connections.',
    related: ['studio-first-project', 'studio-graphs', 'graphs-and-source'],
    example: 'field',
  },
  {
    slug: 'embed-a-gain-stage',
    title: 'Embed a gain stage',
    group: 'Manifold in your website',
    file: 'embed-a-gain-stage.md',
    example: 'gain',
    summary: 'Run a real Manifold graph in a page with your own Web Audio source and controls.',
    task: 'Help me embed this gain graph in my website. First establish my framework and AudioContext ownership, then adapt the documented example and verify its audio and disposal.',
    related: ['concepts', 'browser-host', 'graphs-and-source'],
  },
  {
    slug: 'browser-host',
    title: 'AudioContext and graph lifetime',
    group: 'Manifold in your website',
    file: 'browser-host.md',
    summary:
      'Prepare, connect, control and dispose a graph while keeping the website in charge of audio.',
    task: 'Help me integrate Manifold into an existing AudioContext. Identify ownership, source/output routing, startup, parameter updates and teardown before making changes.',
    related: ['embed-a-gain-stage', 'concepts'],
  },
  {
    slug: 'graphs-and-source',
    title: 'Graphs, files and source',
    group: 'Authoring',
    file: 'graphs-and-source.md',
    summary:
      'Follow a node to its declaration and understand nested graphs and shared definitions.',
    task: 'Help me inspect a Manifold node, locate its actual implementation and explain which instances an edit would affect before changing it.',
    related: ['concepts', 'agents', 'embed-a-gain-stage'],
  },
  {
    slug: 'agents',
    title: 'Work with an agent',
    group: 'Authoring',
    file: 'agents.md',
    summary: 'Connect a native Studio session and make a bounded, observable, recoverable edit.',
    task: 'Help me connect to my intended Manifold Studio session, inspect its project and propose one small verifiable change. Follow the running host’s authoring guide and tool schemas.',
    related: ['concepts', 'graphs-and-source'],
  },
];

export const pagePath = (page) => `/learn/${page.slug ? page.slug + '/' : ''}`;
export const markdownPath = (page) => `${pagePath(page)}index.md`;

export function agentPrompt(page, origin, edition) {
  const absolute = (path) => new URL(path, origin).href;
  return `Help me with Manifold: ${page.title}.

Read these sources before proposing APIs or edits:
- Topic: ${absolute(markdownPath(page))}
- Architecture and rationale: ${absolute('/learn/concepts/index.md')}
- Agent workflow: ${absolute('/learn/agents/index.md')}
- Documentation index and related topics: ${absolute('/learn/manifest.json')}
${page.example ? '- Exact runnable graph source: ' + absolute(examplePath(page.example)) + '\n' : ''}
This prompt was copied from documentation edition ${edition}. Check the manifest for the currently served edition; report a mismatch and use a consistent set of sources. If you cannot fetch these URLs, ask me for the Markdown instead of inventing their contents.

Manifold is an audio plug-in framework and can also be embedded in a website through Web Audio. Manifold Studio is its authoring environment. A host owns I/O; the project declares processing and presentation. Graph, source and inspector refer to the same accepted project. Read the topic for the precise supported behavior and limitations.

Use explicit imports from manifold for creative Device source. Give instances meaningful stable names, configure initial state, declare controls once, and connect typed port references. Local variable names are author-chosen JavaScript names, not Manifold keywords. Distinguish them from quoted identities and imported definitions. Keep numerical graph bookkeeping in expert material.

Task: ${page.task}

When connected to Studio, read manifold://studio/authoring-guide and the advertised tool schemas, inspect the intended session and current revision, and preserve human drafts. After an edit, verify accepted state and the relevant audio or rendered result. Distinguish what you changed, what you observed, and what remains untested.`;
}
