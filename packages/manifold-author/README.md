# @manifold/author — graph-workspace authoring

## Optional agent tools and WebMCP

Studio's [reusable audio graphs](../../docs/rearchitecture/studio-audio-graphs.md)
wrap existing processing nodes, nest shared definitions and instantiate independent
DSP/control state through `graph.wrap` and `graph.addInstance`. The virtual
`/audio-graphs.json` file edits the same `studioGraph.audioGraphs` source literal.
Expansion uses the existing graph contract in both native and browser hosts.

Studio's [nested presentation graphs](../../docs/rearchitecture/studio-nested-compositions.md)
use the same project definitions, commands, files and revisions. The
[local native MCP adapter](../../docs/rearchitecture/studio-native-mcp.md) connects
the public tools to a running standalone app without a browser relay.

Expose an imported instrument's existing runtime through Studio's agent tools.
These live in the separate `@manifold/studio` package (Studio product code, not
part of the MIT library); the library's `LiveProjectRuntime` supplies the
commands they call:

```js
import { createManifoldTools, createAgentDispatcher } from '@manifold/studio/agent-tools';
import { registerManifoldWebMCP } from '@manifold/studio/webmcp';

export async function connectInstrumentAgent(runtime, agentEnabled) {
  const request = createAgentDispatcher({
    request: command => runtime.request(command),
    isEnabled: agentEnabled,
  });
  const tools = createManifoldTools({
    request,
    namespace: 'myInstrument',
    operations: ['project.inspect', 'project.save', 'catalog.list',
      'parameter.set', 'parameter.batch', 'source.apply', 'project.undo'],
  });
  return registerManifoldWebMCP({ tools });
}
```

Pass the already accepted `LiveProjectRuntime` and a function returning the
host's agent-enabled state. Call the returned registration's `dispose()` when
unmounting. `supported` reports browser support; importing this module or using
an unsupported browser does not change playback. Give each instrument a unique
namespace. Mutation tools require `expectedRevision` from `project.inspect`.
Hosts with ongoing human gestures should also supply the dispatcher's `settled`
callback to drain those gestures before agent edits.

## Project files and visual assets

Studio projects can carry a bounded `liveAuthoring.files` table. The Files pane
accepts text scripts, SVG, and raster images; files survive save, undo, native
load, and export capture. `/project.mjs` and `/presentation.mjs` are virtual
entries backed by the accepted source fields, so there is only one authored
copy of each. Other scripts are stored and editable, but module imports from
the file table are not resolved yet.

An authored web face can load an embedded asset without relying on the Studio
server's URL layout:

```js
const sigil = await api.assetUrl('/assets/nacre-sigil.svg');
image.src = sigil;
```

The same `api.assetUrl` call works in browser preview and native webview faces.
Agents can use `manifold.file.list`, `manifold.file.read`, `manifold.file.write`,
and `manifold.file.remove` against the accepted project revision. There are no arbitrary
file-count or file-size quotas. Avoid storing
credentials in project files: these files travel with exported projects.

Tool descriptions and JSON schemas are shared across WebMCP and ordinary MCP;
tools call the host, and never create another DSP runtime. Advertise only
operations your host actually supplies. Build tools require a build service;
they are not supplied by `LiveProjectRuntime` itself.

[Orbit Studio](https://wubulon.tailfac9f9.ts.net:4174/?program=ui-orbit)
includes this adapter and an **Agent → Connect local agent** action for desktop
MCP clients. [Delivery and connection instructions](../../docs/rearchitecture/webmcp-delivery.md)
cover the working website-to-plugin path and remaining hosted-account work.

## Inspectable live DSP library

The public library contains 30 complete editable graph programs:

```js
import { getProgram } from '@manifold/author/examples/primitive-library';
import { LiveProjectRuntime } from '@manifold/author/live-project';

const runtime = new LiveProjectRuntime(host, getProgram('sample-hold').source);
await host.prepare(runtime.project);
// Mount the public retained view or project runtime.presentation() in egui.
await runtime.request({ operation: 'source.apply', source: editedSource,
  expectedRevision: runtime.revision, origin: 'human' });
const saved = runtime.save();
```

Each `source` includes its graph construction, parameters, connections and view;
it remains independent of the registry after saving. Browser and native QuickJS
execute the same program. The original default and lazy two-slot FX harness are
legacy transcriptions; other entries are explicit primitive audition compositions.
See the [live library](https://wubulon.tailfac9f9.ts.net:4174/library) and
[coverage, native download and review evidence](../../docs/rearchitecture/primitive-transcription.md).

Authored `onControl(session,path,value)` may call synchronous
`session.transaction(graph => { ... })` to add/query/connect primitives on a
candidate. The host prepares structural changes off callback and the runtime
commits after acknowledgement. Parameter-only changes use bounded batches.
Inactive amounts can live in controls until their lazy primitive is constructed.
Rejected edits preserve accepted source, graph and revision.

A source can return `reconcile(graph, previousProject)`. This synchronous hook
reconstructs selected/visited lazy factories after compatible values are inherited
during source editing or recall. The FX harness demonstrates per-effect amount
memory. Both hooks run on control, never on the audio callback.

## Readable module example

The [network instrument](examples/network-instrument.mjs) is an ordinary ESM
module and the exact source shown in the live creator:

```js
import createProject from '@manifold/author/examples/network-instrument';

const { graph, view, network } = createProject();
// Prepare graph.toProject() in your host; mount view against the live runtime.
```

Its imports, shared control declarations, graph definition, external inputs,
behavior and presentation are separate readable sections. Parameters use named
references: `tone.parameter('frequency').expose(controls.pitch)` declares its
initial target and public endpoint from one control descriptor. `.set(value)`
sets a graph-definition value through the existing validator. A reference checks
node identity on every use; it is not a DSP state bank. `parameterValue(project,
path)` reads an accepted target by its public endpoint.

Named parameter metadata covers **all 277 public parameters**, and inspectable
definition exports cover **all 43 public primitive kinds**. Inspect `getPrimitive(type).parameters` or
`graph.describeNode(node).parameters` to discover their names/ranges/choices;
agents can use `catalog.list`, and TypeScript supplies instance-specific name
completion. The numeric API remains available for contract and host integration.

Networking is also explicit in the sketch:

```js
import { defineNetwork } from '@manifold/author/host-services';

const network = defineNetwork({ udp: '127.0.0.1:0' });
network.onEvent(onNetwork);
```

The declaration opens no sockets. When the host connects networking, it opens
the declared services, decodes incoming events, and dispatches them through
`network.receive` to the registered mapper. Browser `ProjectServices` uses
`HostServices` to call the optional native bridge; the native application uses
its Rust service worker. Both wait for accepted graph edits before replying.
Return `network` alongside `graph` and `view`. Saved state contains settings,
never callback functions or socket handles. Legacy `{ network, onNetwork }`
projects remain supported.

Live source accepts static named/namespace imports from `@manifold/author`,
`@manifold/author/primitives`, and `defineNetwork` from
`@manifold/author/host-services`, with a default synchronous project factory (or
project object). These bindings resolve identically in browser and native
QuickJS. Oscillator/Main sketches also explicitly import `chooseMainVoice` and
`oscillatorPreviewCurves` from their public example modules. All 33 displayed
sketches use explicit imports and named sections; none depends on an implicitly
injected `manifold`. Previous saved function-body scripts still work.
This adapter parses actual JavaScript syntax; arbitrary dependency loading,
re-exports, dynamic imports, `import.meta` and asynchronous factories are not yet
supported in live source. Ordinary imported modules in an external JS application
use that application's module loader. The adapter is not a sandbox.

Open [the live example](https://wubulon.tailfac9f9.ts.net:4174/primitives.html?program=network-services).
Use **Reset program** to adopt the cleaned default if you have a saved older draft;
your stored source is preserved until you choose to replace it. See
[cleanup delivery](../../docs/rearchitecture/creative-authoring-delivery.md).

## Playable authored instrument and MIDI

Import the complete editable oscillator source and UI in any application:

```js
import { source } from '@manifold/author/examples/standalone-oscillator';
import { LiveProjectRuntime } from '@manifold/author/live-project';
import { AuthoredMidiInput } from '@manifold/author/midi-control';
const runtime = new LiveProjectRuntime(host, source);
const midi = new AuthoredMidiInput(event => runtime.request({
  operation: 'event.send', event, origin: 'midi',
}), message => console.log(message));
// Call from your Connect MIDI button, then present these actual input choices.
const inputs = await midi.connect();
await midi.select(inputs[0].id);
```

The project composes reusable core oscillators and ADSRs; its editable `onEvent`
owns voice allocation and controller mapping. Neither MIDI adapter processes
samples. Device/channel ownership, velocity, sustain, CC123 key release and CC120
panic share the runtime's acknowledged event contract. `event.midi` accepts three
device bytes and an owner through the same decoder for native/tool clients.
Device disconnect releases only that owner; the UI's **Release all notes** sends
an explicit global panic. Event timing currently follows control acknowledgement
and block publication; device timestamps/sample scheduling remain open.

The [independent importing product](../../examples/instrument-consumer/README.md)
uses only the public packages. The public native controller package is
`web/public/packages/oscillator-creator.manifold.json`; regenerate with
`node scripts/generate-oscillator-creator-package.mjs` after bundling its controller.
Existing saved creator source remains authored source: use the product's
**Original oscillator** action to load the updated default if desired.

Native device input uses [midir's input connection API](https://docs.rs/midir/0.11.0/midir/struct.MidiInput.html)
outside audio processing. [Actual product evidence and remaining gates](../../docs/rearchitecture/oscillator-live-delivery.md)
distinguish virtual MIDI protocol review from physical hardware and DAW acceptance.

This ESM package gives JavaScript and TypeScript authors typed port references, stable node IDs, deterministic snapshots, and portable `manifold.project` graph-workspace export. It reads a catalog generated from Rust's node constructors and port metadata. Plain JavaScript examples ship in [`examples/inverted-lfo.mjs`](examples/inverted-lfo.mjs), [`examples/cv-utilities.mjs`](examples/cv-utilities.mjs), and [`examples/cv-decisions.mjs`](examples/cv-decisions.mjs). Their output is checked in under `projects/graph-workspace/` and exercised by browser, native, VST3, and CLAP tests.

```js
import { createGraphWorkspace, listPrimitives } from '@manifold/author';

const graph = createGraphWorkspace();
const tone = graph.add('oscillator', { id: 4 });
const lfo = graph.add('lfo', { id: 5 });
const gain = graph.add('modulated-gain', { id: 6 });
graph.connect(tone.output('out'), gain.input('audio'));
graph.connect(lfo.output('inv'), gain.input('cv'));
graph.connect(gain.output('out'), graph.output.input('in'));

console.log(listPrimitives());
const snapshot = graph.snapshot();
const project = graph.toProject();
```

Register public script controls on the graph itself so the same paths survive
browser export and native host state saves:

```js
graph.registerParameter('/synth/level', gain, 0, { min: 0, max: 2, default: 1 });
graph.bindHostSlot(0, gain, 0);
const level = graph.findParameter('/synth/level');
const slot = graph.hostSlotForPath('/synth/level'); // 0
// A prepared host can use live.parameterPath('/synth/level', 0.7).
```

`toProject()` records these as top-level `endpoints`. Each path binds one node
parameter, and its range must fit the shared Rust parameter catalog. Hosts can
resolve paths on their control thread and send numeric edits to audio. The
browser Graph editor retains endpoints while editing and downloading a project.
The declared range also bounds the saved value and the native host automation
descriptor; a narrower project control cannot be bypassed through a numeric edit.
Explicit `hostBindings` keep DAW automation slots stable when a lower-numbered
node is inserted. Unbound graph controls may still be assigned to free slots by
the host, so scripts should explicitly bind every automation target they promise.

To edit an existing plain graph-workspace project, import its parsed JSON and use the same named ports:

```js
import { GraphWorkspace } from '@manifold/author';

const graph = GraphWorkspace.fromProject(existingProject);
const gain = graph.find(8);
graph.disconnect(gain.input('cv'));
graph.connect(graph.find(9).output('uni'), gain.input('cv'));
const fork = graph.toProject();
```

The repository's `scripts/author-fork-tone-texture.mjs` generates `projects/graph-workspace/forked-tone-texture.json`. Native and Wasm tests compare its audio against the original inverted LFO graph and confirm the saved output port.

A generic browser project can import the authoring package, a project module, and the browser device adapter:

```js
import { BrowserGraphHost } from '@manifold/author/browser';
import { createProject } from '@manifold/author/examples/dsp-live-scripting';

const context = new AudioContext();
const host = new BrowserGraphHost(context);
const project = createProject(host);
await host.prepare(project.toProject());
host.connect(yourStereoAudioNode);
await context.resume();
await project.set('/dsp/live/width', 0.8);
await project.session.route({ to: 3, input: 'in', from: 4, output: 'out' });
```

`scripts/build-wasm.sh` prepares the package's worklet and Wasm assets; `npm pack` runs it automatically. The browser adapter resolves those packaged assets by default. A separate Vite project installed the tarball, emitted both assets, and started an AudioWorklet graph in Chromium. The [running generic page](../../web/generic-graph.html) is a complete example. The legacy module transposes the default `DspLiveScripting/dsp/default_dsp.lua` graph and its two registered parameter paths. Its editor and script reload lifecycle remain open behaviors in the [migration note](../../docs/rearchitecture/dsp-live-scripting-port.md).

The optional legacy FX swap harness is available as
`@manifold/author/examples/fx-slot-swap`. It keeps project-only selection and
inactive effect values in the portable `controls` registry, then stages actual
gain or widener graph instances through `LiveGraphSession.transaction`. A host
must supply `replaceGraph(project)` that prepares and publishes a replacement
outside its audio callback. The [browser audition](../../web/fx-slot-swap.html)
loads both saved snapshots for review; it restarts playback to switch them.

The `examples/rack-filter-eq` project builds the original RackModuleHost
all four Blend modes, Filter, FX, and EQ processors from ordinary graph primitives. The
`examples/rack-module-host` factory composes those branches with the same
authored oscillator module used by `examples/rack-oscillator`. Given a decoded
`sampleSource`, it also composes the reusable eight-voice Sample module at
selection 2. It starts at the requested selection and saves the selected output cable. Its module selection
uses `live.routeWithControl(route, { path, value })`: one prepared route is
acknowledged before the saved project control and audio cable advance together.
The [live audition](../../web/rack-filter-eq.html) switches Oscillator, Sample,
Blend, Filter, FX, and EQ while playing.
The [migration note](../../docs/rearchitecture/rack-module-host-port.md)
records the current six-module scope and open behaviors. Both inputs provide
External, Silence, Sine, Saw, Square, Pulse, and Noise through prepared source buses.
Musical pitch and oscillator waveform use `live.parameterWithControl(parameter,
{ path, value })` to save a project control with the acknowledged DSP edit;
input level uses a normal parameter endpoint. Pulse is a separate public
oscillator with a saved 0.25 width. Blend amount maps to a public equal-power
crossfader; the ring, audio FM, and sync modes each use directional public
primitives feeding another crossfader.

`@manifold/author/examples/rack-oscillator` builds the historical nine-source
oscillator module with `extended-oscillator` nodes, a public `mixer9`, and output
gain. Its [browser audition](../../web/rack-oscillator.html) broadcasts standard
waveform, drive, unison, detune, spread, and additive render edits with acknowledged parameter
batches. The saved
[manual voice fixture](../../projects/graph-workspace/authored-rack-oscillator-manual.json)
loads on native and Wasm. The [port ledger](../../docs/rearchitecture/rack-oscillator-port.md)
tracks remaining C++ comparison, state import, and host integration work.

`@manifold/author/examples/phase-vocoder-chain` demonstrates the public
`phase-vocoder` primitive used by the historical Rack Sample voice. Authors
can place it between any compatible audio source and output, set pitch and wet
mix while playing, and choose FFT order 9–12 when preparing a graph. The
[live browser page](../../web/phase-vocoder.html) and
[Sample port ledger](../../docs/rearchitecture/rack-sample-port.md) show the
current behavior and the larger eight-voice/capture work still required.

`@manifold/author/examples/sample-voice-chain` builds the first historical
Sample voice from public Sample Region Playback, Phase Vocoder, and Gain nodes.
Call `graph.setSampleAsset(region, interleavedStereo, sourceRate, label)` before
export to embed portable PCM. The browser Worker mode decodes and installs this
asset off the audio callback; `host.sendEvent` targets the sample node for
note onset and stop. After restoring a saved project with an open gate, call
`project.activate()` once the host is prepared to restart that voice. The
[live page](../../web/sample-voice-chain.html) imports the checked in project
and lets you change gate, pitch, and vocoder mode while it plays. It is one
voice of the old eight-voice Sample module; see the
[port ledger](../../docs/rearchitecture/rack-sample-port.md) for remaining work.

`@manifold/author/examples/rack-sample-eight-voice` authors all eight historical
Sample voice chains from public primitives. One `setSampleAsset` call embeds PCM;
`bindSampleAsset(sourceRegion, anotherRegion)` shares that prepared source with
each other voice. The [eight-voice browser page](../../web/rack-sample-eight-voice.html)
plays the saved fixture through the off-callback Worker adapter and exposes individual
gates and pitches. The combined Rack project now selects this module at index
2, and native project preparation can replace its one PCM asset from a
retrospective capture. Public Sample Region parameters 9–11 expose unison,
detune, and stereo spread; the Rack script broadcasts them to all eight voices.
Exact old C++ stacking parity and remaining historical controls are open; the
[port ledger](../../docs/rearchitecture/rack-sample-port.md) also records the
measured all-voice vocoder deadline spikes.

The combined `rack-module-host` example now includes the Sample module at
selection 2 and two public Retrospective Capture sources. A script can register
and select capture nodes by stable source ID, and carry sidechain and capture
window settings through a portable project:

```js
graph.setInputSource('external');
const capture = graph.add('retrospective-capture', { id: 65 });
graph.connect(graph.input.output('out'), capture.input('audio'));
graph.registerCaptureSource(capture, 'Rack Sample input', 'input', 0);
const sidechainInput = graph.add('input.sidechain', { id: 67 });
const sidechainCapture = graph.add('retrospective-capture', { id: 68 });
graph.connect(sidechainInput.output('out'), sidechainCapture.input('audio'));
graph.registerCaptureSource(sidechainCapture, 'Rack Sample sidechain', 'sidechain', 1);
graph.configureCaptureWindow({ captureWindowMode: 'seconds', captureWindowSeconds: 2 });
const sources = graph.listCaptureSources();
```

A composer that owns a layer playback output in the same graph can attach it
as a Rack Sample capture source with `attachRackSampleLayerSource(graph, layer,
layerOutput)` from `examples/rack-module-host`. `layer` is 1–4; the saved v2
source IDs are 2–5 because ID 1 is already assigned to sidechain in existing
v2 projects. The helper inserts a public Retrospective Capture node and a
silent mixer branch, then registers the source. The
[`authored-rack-sample-layer-capture.json`](../../projects/graph-workspace/authored-rack-sample-layer-capture.json)
fixture uses four differently scaled test outputs to show the wiring and
native/Wasm capture. A Main looper graph still has to provide the actual four
layer playback outputs; the fixture's test outputs are not looper recordings.

The `examples/four-layer-loops` composer goes one step further: it authors
four public `loop-capture` primitives from a graph input, connects their
outputs to the four Rack Sample sources, and exposes an acknowledged
record/play/overdub/speed/reverse controller over `LiveGraphSession`. The
[portable loop fixture](../../projects/graph-workspace/authored-rack-four-layer-loops.json)
can be opened on the [Rack page](https://wubulon.tailfac9f9.ts.net:4173/rack-filter-eq.html).
Its controls record and play each layer independently; selecting that layer as
the Sample capture source copies its playback into the eight Sample voices.
This is a public-graph composition, not Main's complete four-layer looper:
transport quantization, seek/scrub, native live layer state capture, and the
Main presentation remain open. `snapshotWithLoopAudio(project, snapshotLoop)`
freezes stopped loop nodes through the browser host's bounded staging path and
embeds their PCM alongside Sample assets. The Rack page downloads this portable
project. A recording layer must be stopped before saving. The older
`snapshotWithoutLoopAudio(project)` remains available for explicit graph-only
exports.

Each capture node needs a path to the prepared output graph. The Rack example
merges both capture paths through a zero-gain send to its mixer, so the inputs
are recorded but not monitored. `host.connect(mainNode, destinationNode,
sidechainNode)` attaches separate browser sources. Native project preparation can freeze either source and publish a
new shared Sample asset. A prepared `BrowserGraphHost` also supports
`captureWindow(captureNodeId, secondsOrBarWindow)` and
`replaceSample(sourceNodeId, sourceRate, stereo, bindingTargets)`. The Rack
project’s `captureSample()` reads the saved seconds or tempo/bar window and
composes those calls with `LiveGraphSession`
so its portable PCM changes after the running Wasm graph acknowledges the new
shared source. The [Rack page](../../web/rack-filter-eq.html) has a live capture
control. Free mode uses two presses: the first arms the retrospective cursor,
and the second freezes the intervening span into the same asset. Held voices
restart on source replacement; seamless held-note continuity remains open.

Free mode also accepts the historical manual offset. A negative value is a
frame count back from now; a positive value is an absolute cursor in the
selected source's circular ring. Zero keeps the two-press flow. The cursor
readback and capture request are control-thread operations:

```js
const sourceId = project.toProject().signal.selectedCaptureNodeId;
const { startOffset, capacity } = await host.captureCursor(sourceId);
await project.captureSample({ manualStartOffsetFrames: -4800 });
// Or, later, capture the span since the saved cursor:
await project.captureSample({ manualStartOffsetFrames: startOffset });
```

The Rack project requires Free mode and no armed capture for a manual offset.
The shared PCM asset is saved only after the prepared host accepts it.

The Rack script also exposes `project.set('/midi/synth/rack/sample/1/rootNote',
midiNote)` for the historical manual root. After capture, callers can use
`project.applyDetectedRoot()` to round a reliable analysis pitch to a MIDI
note and commit the corresponding speed changes for all eight voice paths.
The action rejects low-confidence analysis instead of changing the root
silently; the saved root and PCM remain separate project state.
Call `project.analyzeSavedSample()` after reopening an authored Rack project
to regenerate the pitch, level, and waveform readbacks from its embedded PCM.
It runs outside the audio callback and does not modify the saved asset.
The [Rack audition page](../../web/rack-filter-eq.html) also offers Download
and Open controls for a compatible authored Rack bundle. It validates the
graph before replacing the stopped project, then reanalyzes saved PCM when
playback starts.

`@manifold/author/analysis` exports `analyzeStereo(stereo, sourceRate)`. It
runs the shared Rust/Wasm Sample analyzer in a separate Worker and returns
stereo peak bins, peak level, RMS, pitch in hertz, and pitch confidence. A
project can recompute these display readbacks from its portable PCM after
reopening; analysis never runs in the AudioWorklet callback.

```js
import { analyzeStereo } from '@manifold/author/analysis';
import { decodeSampleAsset } from '@manifold/author';

const saved = decodeSampleAsset(project.assets[0]);
const readbacks = await analyzeStereo(saved.stereo, saved.sourceRate);
```

Use a project control for an orchestration value that does not belong to a DSP
node:

```js
graph.registerControl('/rack/slotA/select', { min: 0, max: 1, default: 0, discrete: true });
graph.setControl('/rack/slotA/select', 1);
console.log(graph.findControl('/rack/slotA/select').value);
```

The control and its current value serialize with the graph. The authoring
language decides how a change edits the graph; it is not sent to audio as a
numeric node parameter. JS and Rust authoring and the native project reader
validate the same path, range, value, and unique-name contract.
`GraphWorkspace.fromProject` and Rust `GraphWorkspace::from_project_json`
rehydrate plain saved graphs so a project can continue authoring after reopen.

Project logic can also name graph instances independently of numeric node IDs:

```js
graph.registerInstance('/dsp/live/nodes/width', graph.find(5));
const width = graph.findInstance('/dsp/live/nodes/width');
```

The optional `instances` registry stores one unique path per node in the
portable document. Removing a node removes its name. JS/TS, Rust authoring,
the browser project reader, and native host saves preserve the registry; the
audio callback continues to use numeric IDs only.

For a graph already prepared by a host with patchable routes, `LiveGraphSession` sends one named route edit at a time. Its snapshot changes only after the host accepts the request:

```js
import { createLiveGraphSession } from '@manifold/author';

const live = createLiveGraphSession(graph,
  ({ to, inputPort, from, outputPort }) => audio.setRoute(to, inputPort, from, outputPort),
  ({ nodeId, id, value }) => audio.setNodeParameter(nodeId, id, value));
await live.route({ to: 6, input: 'cv', from: 5, output: 'uni' });
await live.parameter({ nodeId: 4, id: 1, value: 330 });
```

The browser Graph editor enables this path for small graphs made from prepared primitives, including authored LoopCapture nodes and saved PCM. It prepares a loop take even when that node is initially disconnected, so a later route can make it audible. Route and parameter changes are serialized, acknowledged between audio blocks, and share one monotonic authored revision; rejected changes leave its document intact. Other resource-owning nodes still need a wider live publication path. The host must opt into patchable preparation before playback.

`LiveGraphSession.transaction(edit)` uses the same queue to stage arbitrary node and edge changes on a clone. A host-supplied fourth `applyGraph(project)` callback must prepare and publish the replacement before returning success. The authored snapshot advances only after that acknowledgement; invalid or rejected candidates leave it intact. The native Rust equivalent prepares a replacement off callback and returns the old runtime for retirement. `BrowserGraphHost` in Worker mode publishes compatible replacements at an audio block boundary and transfers Gain and Stereo Widener processing history by stable instance path. Voice, loop, capture, and effect-tail continuity remain open.

The browser checks the candidate's exact next audible output block before switching. `host.diagnostics` exposes total misses, late-Worker/missing-output/frame-mismatch counters, startup mute blocks, deferred publications and a bounded recent-miss trace. `host.workerProfile` measures active Worker Wasm processing only; it excludes callback copying and scheduling. The [runtime library review](../../web/graph-runtime-review.html) records 24 authored edits alongside another active graph and exports audio, timings and the resulting package. Its [retained evidence](../../docs/rearchitecture/browser-publication-deadlines.md) includes 12 misses in the unchanged second Worker; timely scheduling remains an open gate.

Worker slots now require a final-write retirement acknowledgement before reuse; forced `terminate()` alone was insufficient in the measured browser. `diagnostics.pendingRetirements` exposes quarantined slots, `lastRetirementMs` reports control-thread retirement acknowledgement time, and miss rows include a context frame for PCM alignment. Optional `{ profiling: true }` adds `workerProfile.service` for Worker copies/commands/DSP/history publication; its default is `null` and it excludes idle waiting. The [ownership evidence](../../docs/rearchitecture/browser-worker-ownership.md) supersedes earlier graph/output ownership claims, includes eight independent recordings and preserves a remaining one-block deadline miss.

Accepted host automation can be adopted into the same session with
`await live.adoptPublishedParameters(edits)`. A sixth optional
`readPublishedParameters` constructor adapter runs before every queued edit,
preserving accepted host targets when composing a structural replacement.
`BrowserGraphHost` supplies this reader for both Worker and direct Worklet modes.
The packaged DspLiveScripting/FX controllers wire it automatically when available;
`await controller.synchronizeParameters()` refreshes a snapshot before saving.
`toProject()` remains a synchronous snapshot of the last authored state. Authored
controls, paths and script-local state survive adoption; no DSP command is sent.
See [host automation evidence and remaining limits](../../docs/rearchitecture/script-host-automation.md).

The package currently authors the **43 supported graph-workspace primitive types** with constructor and numeric parameter contracts generated from Rust; labels and choice names live in the JS presentation layer. The CV utility types include `attenuverter-bias`, `slew-control`, `sample-hold`, `cv-mix`, `cv-compare`, and `cv-range`. The first CV example connects four utilities between an LFO and audio gain. The second routes Compare's separate GATE and TRIG outputs through Range and CV mixer; Compare advances at block boundaries, so its two-tick trigger spans two audio blocks. Both portable documents are independently reconstructed by the Rust authoring API and rendered through native and Wasm engines. It validates port type, ownership, occupied inputs, cycles, IDs, stale handles, and initial parameter values before export. `snapshot()` and `toProject()` return immutable, sorted data for inspection and comparison. `fromProject()` accepts plain stereo graph-workspace documents, including older edges without `outputPort`, and rejects unsupported extra fields rather than dropping assets or host metadata. `toProject()` produces the same schema accepted by the existing browser and native graph readers. TypeScript declarations ship with the package; TypeScript 5.4+ checks type names, port names, and signal compatibility. TypeScript source is transpiled by the user's normal toolchain.

`@manifold/author/package` opens a self-contained versioned package carrying a bundled JS controller and its saved graph. The same `.manifold.json` file runs on the [browser package page](../../web/package-project.html) and in the [native render example](../../crates/manifold-project-js/examples/native_script.rs). Browser code can validate, instantiate, and save it:

```js
import { instantiateProjectPackage, saveProjectPackage } from '@manifold/author/package';

const response = await fetch('/packages/dsp-live-scripting.manifold.json');
const { package: packaged, controller } = await instantiateProjectPackage(await response.text(), host);
await host.prepare(controller.toProject());
if (!controller.set) throw new Error('This project does not expose path controls');
await controller.set('/dsp/live/input_gain', 0.4);
await controller.synchronizeParameters?.();
const saved = saveProjectPackage(packaged, controller.toProject());
```

The host supplies acknowledged parameter, route and graph replacement callbacks. The package reader validates the controller SHA-256 and saved graph before import; native QuickJS evaluates the same bundled controller. See the [format and proof](../../docs/rearchitecture/project-package-v1.md). Bounded Gain/Widener browser continuity and editor-independent packaged CLAP/VST3 script dispatch now have proofs. Voice, loop, capture and effect-tail continuity remain open; [VST3 package evidence](../../docs/rearchitecture/native-vst3-project-package.md) records the native host scope.

Every package controller exposes `toProject()`. Its other public methods belong
to the authored project: an instrument may expose `event()` and `replaceSource()`
without path controls. `PackageController.set` is optional. TypeScript consumers
can supply their controller interface to `instantiateProjectPackage<MyController>`.
Hosts can provide `setParameterBatch` and `sendEvent` alongside graph replacement;
the shipped Rack and Instrument packages use these services in browser prepared
Wasm, native QuickJS, CLAP and VST3.

This slice constructs graph documents outside the audio callback and runs JS controllers in native render and plug-in hosts. Timed control subscriptions, a general Main graph, resource continuity and the full package contract remain explicit recovery gates in the repository's `docs/rearchitecture/README.md`. The API can grow as those gates are proved; this version is 0.1.0, not the frozen cross-host ABI.

### Opt-in prepared runtime

`new BrowserGraphHost(context, { execution: 'prepared' })` prepares graph
replacements in a persistent Worker and renders the same Rust ExecutionPlan
on the AudioWorklet. It currently supports raw/sidechain inputs, output, Gain,
Fixed Gain, Sum2, Stereo Widener, Distortion, scalar/extended/pulse Oscillator,
LFO, Modulated Gain, Mixer9, MidiInput, MidiTranspose, VoiceSynth, LoopCapture
and RetrospectiveCapture, Sample Region, Sample Instrument and Phase Vocoder.
Loop/Sample PCM assets and shared region bindings, stable-take `snapshotLoop()` and
retrospective `captureCursor()` are supported. Capture-window publication and
other unsupported primitives reject explicitly. Use an isolated document and compiler Worker (COOP
`same-origin`, COEP `require-corp`). `npm pack` builds the separate shared-memory
Wasm binary using `scripts/build-prepared-wasm.sh` and nightly Rust.

The project factory and graph scripting API above work unchanged for this
bounded capability set. Actual Rust parameter targets synchronize into the
controller before and after accepted edits. Named Gain/Widener history survives
compatible replacement. Oscillator phase, unison and noise history, LFO phase,
and Mixer/Modulated Gain/Distortion smoothing also transfer in this mode.
The [Rack oscillator continuity proof](../../docs/rearchitecture/rack-oscillator-port.md)
records twelve actual browser edits against an untouched reference with exactly
matching PCM. Changing an endpoint's range keeps its newly authored target;
later automation cannot inherit an old value outside that range.
Await `host.close()` before closing its AudioContext.
Timed MIDI is admitted in atomic batches of at most 256 events for the next
available render block. Admission is separate from processing; diagnostics
report admitted, pending, consumed, cancelled and rejected events. Kind 0 is
note-on, 1 note-off, 2 all-notes-off, and 3 pitch bend (LSB in `note`, MSB in
`velocity`). Offsets must fit the render quantum (currently 0–127).

```js
import { createProject } from '@manifold/author/examples/transpose-audition';
const host = new BrowserGraphHost(context, { execution: 'prepared' });
const project = createProject(host);
await host.prepare(project.toProject());
host.connect(null, context.destination);
await context.resume();
const receipt = await project.sendEvents([
  { kind: 0, channel: 0, note: 60, velocity: 100, offset: 64 },
]); // Queue admission, not confirmation that the note has sounded.
await project.set('/midi/synth/rack/transpose/1/semitones', 7);
await project.setInsert(true);
await project.sendEvents([{ kind: 1, channel: 0, note: 60 }]);
```

Compatible voice and transpose histories retain held notes across replacement,
including stable named instances whose numeric IDs change. An altered upstream
MIDI chain resets the affected voice ownership. All-notes-off cancels previously
queued events for its target; removing that target or closing cancels pending
events. `host.readMidiTrace()` returns a bounded diagnostic ring, not a MIDI
output service. [Timed MIDI proof and limits](../../docs/rearchitecture/prepared-midi-runtime.md)
include the legacy event comparison, recordings and an independent installed
consumer. This audition voice is not Main's full instrument.
The [public API, independent npm consumer, recordings and remaining gates](../../docs/rearchitecture/public-prepared-runtime.md)
describe the verified scope, including a retained 238.6 ms edit latency outlier.
The earlier [internal experiment](../../docs/rearchitecture/prepared-worklet-runtime.md)
retains its fault/stall and allocator negative-control evidence separately.

`@manifold/author/examples/loop-authoring` reuses the four-layer controller to
record/play/overdub/reverse/change speed and edit inserts while audio runs.
`await project.snapshot()` saves stopped takes while they can keep playing;
stop recording and overdub first. Compatible takes and cursors move through
prepared publication with no PCM copy or callback heap destruction. A changed
authored clip replaces its old take. [Live build, recordings and full limits](../../docs/rearchitecture/prepared-loop-runtime.md)
retain the paired proof, explicit replacement and concurrent snapshot rejection.
Main's quantized transport and complete instrument remain open.

External project imports revalidate metadata while retaining successful
validation of identical encoded PCM in a bounded private cache. Decoded buffers
are always fresh. [Loaded-project timings and signal proof](../../docs/rearchitecture/loaded-loop-authoring.md)
retain the old slow measurements and the current thirty-edit run.

The same `loop-authoring` module now has a checked native JS bundle and a
`restoreProject(host, saved)` entry. Native QuickJS can decode portable PCM without
browser codec globals. Native callback graph publication retains compatible takes;
explicit replacement keeps the new clip and controls. For native JS, call
`NativeScriptAudio.stop_and_snapshot()` on control only after processing stops.
`NativeScriptControl.save_project()` returns `LoopSnapshotRequired` for loop graphs,
and browser-only `project.snapshot()` reports the missing native live service.
[Native/plug-in recordings, source evidence and remaining host capabilities](../../docs/rearchitecture/native-loop-publication.md)
describe the tested behavior. Live native JS snapshots, bounded constructors,
prepared Sample resources and complete Main authoring remain open.

Structural constructor fields are discovered with `getPrimitive(type).configuration`.
Use `graph.add('loop-capture', { id: 70, config: { capacitySeconds: 3 } })` or
`graph.configure(handle, { capacitySeconds: 5 })` inside a live transaction. Loop
capacity is 0.05–30 s, retrospective capacity 1–120 s, and fixed gain 0–4.
Runtime play/speed/mix remain parameters. Changing capacity rebuilds that resource
from its authored clip and controls; compatible inserts retain the live take.
`graph.captureRingBytes(sampleRate)` reports the project’s required capture
ring budget. Other resources and host preparation costs are additional.
[Live capacity editor, Rust PCM API, real graph comparisons and remaining gates](../../docs/rearchitecture/resource-authoring.md)
document the new shared authoring behavior and corrected Wasm startup.


### Prepared Sample resources

Sample playback/unison and compatible wet vocoder histories now survive graph
publication. Regions keep matching effective PCM through named-instance changes;
new Region PCM stops playback and clears incompatible spectral tails. Instruments
retain held notes on old PCM while future notes use the newly authored source.
Idle/retired owners are handled without measured Rust callback heap events.
The shared prepared binary is ABI 4 (normal ABI 5); use its matching adapters.
`RackSample.createProject(...).activate()` is asynchronous and should be awaited.

[Installed library with a runtime graph script editor](https://wubulon.tailfac9f9.ts.net:4174/importable-sample-library/2026-09-30-sample-library-v1/)
and [recorded proof, APIs and remaining gates](../../docs/rearchitecture/prepared-sample-publication.md)
use the public author API. These proofs do not close legacy parity, capture-window,
native JS Sample services or actual release plug-in/DAW performance gates.

### Authored visual curves

Immediate `paint(ui,snapshot)` can call `ui.curve({id,label,group,color,points})`.
Points are normalized `[x,y]` pairs in `[0,1]`, bounded at 1,024; color is a hex RGB
string. Retained Canvas and egui project the same accepted curve. Dynamic curve
points/color/labels update without rebuilding the retained keyboard. The oscillator
uses this public binding for the ported static waveform/additive/drive preview;
its helper samples are drawing data and never audio output. Animated voice overlays
and complete original face fidelity remain open.


### Editable UI and styles

Open the library's **UI · Styled instrument** and **UI · Reactive drawing**
programs, or import their factories from `/examples/ui-styled-tone` and
`/examples/ui-reactive-tone`. Each module exposes its entire graph and presentation.
Portable components accept `style: {accent, background, text}` (six-digit hex
colors). Curves accept `height` (64–320); labels accept `fontSize` (10–32).
`ui.label(text, id, options)` supports groups and those styles. Both retained JS
and native/Wasm egui read this model. `PaintUI` and `ComponentStyle` are typed in
`@manifold/author/live-project`. See [UI examples](../../docs/rearchitecture/ui-authoring-examples.md)
for editable builds, source modules and native packages.

## Studio visual components

Studio can create reusable project visual definitions, edit their source and local
helper modules, and connect output analysis to independent instances. These use
the same live runtime, project files, revision, save and undo as audio authoring.
The initial `web-surface` implementation runs in browser and native webview hosts;
local visual parameters are not DAW automation. See the [component contract and
workflow](../../docs/rearchitecture/studio-component-authoring.md) for commands,
module support, host limits and actual browser/standalone evidence.

Composition version 2 also supports `presentation-script` definitions producing
named `scalar` and `field2d` outputs. Dependency-ordered presentation execution
allows real downstream rules and renderer inputs; cyclic or mismatched cables
are rejected. These scripts run outside the audio callback, in the browser or
standalone webview. See the [field/rule contract and working example](../../docs/rearchitecture/studio-field-rules.md)
for source navigation, live inspection, data bounds, lifecycle and host evidence.

Composition version 4 adds `parameter` bindings, finite `vector2`/`vector3`
outputs and `scene-object` attachments through renderer-specific resource ports.
Nacre’s field is built by its own source module inside the shared scene, with
visible mode and energy rules. See the [implemented contract and host evidence](../../docs/rearchitecture/studio-nacre-visual-objects.md).
