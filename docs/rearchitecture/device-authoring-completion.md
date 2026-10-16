# Device authoring across the library, Studio and handbook

12 October 2026. Aster's solo implementation of the agreed steps 1–5. The public
front door is `manifold`; Manifold Studio remains a product using that library.
The governing criterion is **expose semantic complexity; hide incidental complexity**.
This follows the [first example migration](device-authoring-delivery.md).

## What authors can do

Import a processor definition, add a named instance, configure its initial
parameters, declare its controls and connect named ports. Pass a Device to the
same `add` method to reuse a graph. Instances have independent processing and
control values; their shared declaration remains inspectable.

```js
const effect = createEffect({ id: 'double-filter', name: 'Two Filter Stages' });
const first = effect.add('first', filterStage);
const second = effect.add('second', filterStage);
second.configure({ brightness: 600 });
effect.connect(effect.inputs.audio, first.inputs.audio);
effect.connect(first.outputs.audio, second.inputs.audio);
effect.connect(second.outputs.audio, effect.outputs.audio);
```

This excerpt belongs to [the complete reusable example](../../packages/manifold/examples/reusable.js).
Its imports and inner definition are explicit. Local JavaScript names, stable
instance IDs, display names and imported definitions are taught as different
concepts. Authors do not allocate the internal processor numbers or host slots.

Inner controls appear at instance-relative paths, such as `/first/brightness`.
An outer Device can promote `first.controls.brightness` with `effect.control`,
reusing its metadata and target instead of creating a duplicate automation slot.
Constructor configuration obtains configured ports from the existing graph API.
The Device hierarchy lowers to the existing flat graph contract and Rust DSP.

## Studio and host integration

New Studio projects now start with an explicit Device passthrough. The native
starter belongs to `projects/studio`; shared control/publication code belongs to
the library. It no longer imports the standalone filter product as its starter.

| Action | Implemented behaviour |
| --- | --- |
| Select a node | Highlight its declaration in accepted source; custom scripts keep their own file links. |
| Enter a Device | Graph scopes, boundary ports and Explorer reveal the internal graph; parent navigation stays available. |
| Add, wire, disconnect, remove | Generate or change named declarations/connections in `/project.mjs`. |
| Expose, place, group | Write Device control/layout declarations through the same accepted source boundary. |
| Wrap and reuse | Extract an explicit selection into a Device; retain accepted controls and host slots; insert further instances. |
| Add a saved audio module | Translate supported saved module nodes/ports/controls into a readable Device declaration. |
| Edit nested structure | Update the shared definition for all instances, retaining separate instance controls. |
| Save/reopen | Rebuild the hierarchy and accepted values from the portable project. |
| Default Presenter | Show the Device's real controls in the shared egui pane, without an empty web overlay. |
| Perform MIDI | Route notes, sustain, pitch bend and scoped panic to the declared input in native and browser Studio. |

The source adapter deliberately handles explicit top-level declarations.
Unsupported dynamic extraction is rejected before publication. Arbitrary
JavaScript remains valid source authoring; graph tooling does not rewrite every
possible program. Combined variable declarations must be split before visual
node edits. Source navigation indexes each script once per revision.

The standalone audition host prepares bus storage before callbacks, feeds its
source to declared inputs and monitors the first output bus. Browser Studio and
`BrowserDeviceHost` share owned Web Audio input routing. Replacing, disconnecting
and reconnecting sources works; browser startup wires buses before resuming its
context. Both use the existing prepared publication and event queues.

Device MIDI ownership is transient control-side bookkeeping. Releasing one
owner retains a pitch held by another owner. A partial host rejection retains
unreleased notes for retry. The processor owns voice allocation; reopening a
project does not replay held notes. The website facade also exposes
`sendMidi('midi', {type:'noteOn', note:60})` without requiring a numeric destination.

## Documentation and migration inventory

The handbook has six embedded library examples: gain, ring modulation, spectral
transposition, Soft Keys, Two Filter Stages and the Nacre-derived field/rule
composition. The instrument sends real MIDI; the reusable lesson lets readers
enter each instance and follow its shared source. Musical control metadata comes
from the Device declaration. Source and code fences remain syntax highlighted.

The new [instrument](../handbook/play-an-instrument.md) and
[reusable sound](../handbook/reusable-devices.md) lessons connect listening,
controls, JavaScript vocabulary, graph navigation, lifetime and Studio handoff.
Existing Studio workspace/layout/source/save tutorials remain in the same wiki.
Raw Markdown, manifest, agent prompts and MCP's served authoring guide share the
same documentation sources. Package README and new-project guidance use the same
public API.

The new starter, public Device exemplars and five audio lessons use the Device
API. The field lesson retains its existing presentation composition contract.
Older primitive-library, Main, Rack, resource and standalone reference projects
remain expert/compatibility examples; they have not all been rewritten. Their
bundles were regenerated because they consume the shared live runtime. Existing
saved projects and `@manifold/author` imports remain supported. This is not a
claim that every historical file uses the new syntax.

## Nacre coverage check

The actual catalog project is
`web/public/nacre/2026-10-10-graph/nacre-prism-bend.manifold.json`: 92,585 source
characters, 14 artwork assets and 19 exposed endpoints. Loading and saving it
through the current live runtime preserves its graph on reopen.

| Nacre requirement | Current coverage |
| --- | --- |
| Audition, source choice, dry/wet and bypass | Named `extendedOscillator` and `crossfader` imports; same kernels. |
| Spectral displacement and focus | `phaseVocoder`, `svf` and the `lowPassFilter` convenience definition. |
| Excitation and memory | Named `waveShaper` and `granulator`; `gain` for output. |
| Prism Bend reuse | Saved module stays compatible; new reusable Device tooling can express filter/shaper graphs. The old catalog module has not been rewritten. |
| Physical control panel and artwork | Existing `webView`, asset files and control-panel/diegetic libraries; project-owned. |
| Inspectable field/rule/renderer objects | Existing portable field, energy, relief and renderer definitions in the field lesson, with six presentation wires. |
| Other graphics libraries | Existing script/web-surface contract; Three.js is one renderer. No new native graphics backend is claimed. |

All seven processor types in the saved Nacre graph have public named imports.
The Device facade does not yet replace every resource, transport, host-service,
custom-presentation or script-controller API. Those capabilities retain their
existing expert contracts. Nacre's artwork and design were not changed.

## Acceptance evidence

[Machine-readable check record](evidence/2026-10-12-device-authoring.json).

- Web suite: **190 passing tests**, including types, package freshness, source
  navigation, nested control independence, graph edits, MIDI ownership and recall.
- Full **release** Rust workspace: **569 passing tests**. Focused debug Device
  tests pass native signal, source edits, wrapping, control identity, recall and
  MIDI with independent owners.
- Eight Device/native-Wasm comparisons render 6,144 frames each. Reusable graphs
  agree exactly; maximum difference across the set is about `1.1623e-6` for the
  spectral processor. Native rendering uses the callback heap guard.
- Actual browser Studio switches Saw → Silent → Noise → Saw, wraps a playing
  gain stage and saves the accepted source. Device MIDI measures sound, retained
  sound after one owner's panic, and silence after the final release. Processing
  failures and callback allocation/deallocation counters remain zero. With only
  Presenter visible, an actual pointer click changes accepted gain from 0.20 to
  0.60.
- Five audio lessons pass start/change/stop/restart, source selection, actual
  audio measurement and 390-pixel overflow checks. Reusable graph entry and
  parent navigation show the expected four nodes and three wires.
- Real standalone + stdio MCP discovers the compiled authoring guide, inspects
  source, wraps a playing node, edits source, rejects invalid source, adds a second
  instance and exports without restarting the process. Recording and screenshots
  show the actual native window on an isolated Xvfb display. Audio goes to a
  verified private null sink; no shared desktop focus or hardware routing changes.
- The static production wiki also passes measured ring/spectral/field behaviour,
  highlighted source, portable download payload, agent source fetching,
  clipboard fallback, responsive layout and stopped-audio Studio handoff checks.
- Native release, DSP Wasm, UI Wasm and production web builds pass. Vite's existing
  large-chunk warnings remain.

The test drivers are `verify-device-prototype.mjs`, `verify-device-browser.mjs`,
`verify-handbook-devices.mjs` and `verify-studio-devices.mjs` under `scripts`, plus
`web/review-native-devices.mjs` and `web/review-handbook.mjs`. Browser checks require
an owned BB lease in `MANIFOLD_REVIEW_CONNECTION`. The native driver requires a
pre-existing `manifold_review_null` sink and Xvfb on PATH or `MANIFOLD_XVFB`.
Local recordings and detailed reports are under
`~/.cache/manifold/device-completion-20261012/`.

This pass drives the real MCP protocol from the coordinator. It does not claim a
fresh independent agent onboarding trial; the earlier Luna trial is recorded in
[the native MCP delivery](studio-native-mcp.md).

## Remaining limits

The original default **debug** run hit Main Wave's two-second initialization
budget and one QuickJS cleanup crash. The [subsequent diagnosis and repair](native-interruption-diagnosis.md)
identified a double release in interrupted array searches, patched the dependency,
and optimized the interpreter in development builds. The follow-up default
workspace run passes all 570 tests. Runtime safety budgets remain unchanged.

Wrapping preserves controls and automation identity, but moving processors under
a Device changes semantic paths and can reset transient DSP history. Do not
promise phase, held-voice or effect-tail continuity for that edit. General
control-signal boundaries, MIDI outputs, unwrapping, per-instance structural
forks and package installation are still outside this facade. Live native host
bus-layout replacement still needs a new host.

Package registry publication, production hosting/routing/isolation, filesystem
watch reload, full DAW/platform acceptance and native asset-heavy Nacre memory
limits remain release/hardening work. A working library embed and local Studio
are not a deployed public service. Public deployment is the next separately
scoped step.
