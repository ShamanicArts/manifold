# First readable Manifold module in the live creator

Delivered 2 October 2026: the **Networking and Link** program in DspLiveScripting
now follows the [creative authoring direction](creative-authoring-style.md).
This is one cleaned example and the bindings needed to run it. It does not close
the full primitive transcription or instrument port.

## Review

- [Live creator](https://wubulon.tailfac9f9.ts.net:4174/primitives.html?program=network-services): Start audio, choose retained or egui, edit source and Apply live. If a previous draft is restored, **Reset program** adopts the cleaned default. Existing stored source is preserved until that action.
- [Independent importing application](https://wubulon.tailfac9f9.ts.net:4174/examples/instrument-import/?program=network-services): the rebuilt generic consumer loads the same public program source. This increment built the consumer; its earlier networking interaction evidence remains historical.
- [Readable module download](https://wubulon.tailfac9f9.ts.net:4174/authoring-delivery/2026-10-02/network-instrument.mjs), also exported as `@manifold/author/examples/network-instrument`.
- [Native project package](https://wubulon.tailfac9f9.ts.net:4174/packages/primitives/network-services.manifold.json): open in `manifold-app`. The previously delivered networking application's binary supports this updated package and was used in the actual native review. Its older archive still contains the older example source.
- [Actual browser egui/source screenshot](https://wubulon.tailfac9f9.ts.net:4174/authoring-delivery/2026-10-02/egui-live.png), [retained screenshot](https://wubulon.tailfac9f9.ts.net:4174/authoring-delivery/2026-10-02/retained-live.png), [native egui screenshot](https://wubulon.tailfac9f9.ts.net:4174/authoring-delivery/2026-10-02/native-live.png).
- [Eight-second live browser audio excerpt](https://wubulon.tailfac9f9.ts.net:4174/authoring-delivery/2026-10-02/live-output.ogg), [native recording](https://wubulon.tailfac9f9.ts.net:4174/authoring-delivery/2026-10-02/native-output.wav).

## What changed

The canonical [network-instrument.mjs](../../packages/manifold-author/examples/network-instrument.mjs)
is an actual JavaScript module. It explicitly imports authoring tools and four
inspectable primitive definitions, then exports a synchronous project factory.
The exact file contents are generated into the live program's source before
bundling; minification cannot rename or rewrite what the author sees.

Its sections expose the controls, graph definition, external inputs, live
behavior and presentation. Controls declare identity, public path, label, unit,
range and default once. Named parameter references bind these declarations to
the existing graph and parameter validators:

```js
tone.parameter('frequency').expose(controls.pitch);
pulse.parameter('rate').expose(controls.pulseRate);
movement.parameter('depth').set(0.5);
```

Parameter references verify instance identity on every use. `expose` validates
the declaration on a candidate before changing the graph. They describe authored
parameters; Rust remains the DSP owner. Public endpoint paths and the original
node IDs are preserved for compatibility with existing saved projects.

Link behavior now reads accepted values with `parameterValue(acceptedGraph,
controls.pulseRate.path)`, without literal numeric node/parameter lookup. Its
tempo conversion and independent LFO phase are explained in the source. Retained
and egui components derive their labels and paths from those same controls.

## Implemented scope

The networking follow-up makes the service dependency and event registration
explicit: `import { defineNetwork } from '@manifold/author/host-services'`,
`const network = defineNetwork(settings)`, and `network.onEvent(onNetwork)`.
The shared evaluator exposes this portable declaration API; imperative browser
transport clients remain application APIs. A declaration opens no connections.
Browser `ProjectServices` calls the native bridge; the native app uses its Rust
service worker. Both submit decoded events through `network.receive` to the
registered sketch handler, then acknowledge accepted edits before replying.
Settings remain the saved contract, and earlier `{ network, onNetwork }`
scripts still work. Existing screenshots/audio below document the preceding
cleanup, rather than this subsequent explicit-registration spelling.

Follow-up evidence: [imports in the live editor](https://wubulon.tailfac9f9.ts.net:4174/authoring-delivery/2026-10-02/explicit-network-import.jpg),
[handler registration](https://wubulon.tailfac9f9.ts.net:4174/authoring-delivery/2026-10-02/explicit-network-handler.jpg),
and [accepted runtime report](https://wubulon.tailfac9f9.ts.net:4174/authoring-delivery/2026-10-02/explicit-network-report.json).
The updated browser was running with verified private audio routing when an
external UDP sender requested 660 Hz and received an accepted 660 Hz reply.
The host displayed one received event and one reply. All 95 web tests, typed
declarations, four native live-primitive tests, and production web/importer
builds passed. Review services and private playback were stopped afterward.

- Named references, metadata and TypeScript member completion cover oscillator,
  LFO, gain and modulated gain. Agent `catalog.list` also exposes names and display
  descriptions over the same numerical contracts. Existing numerical access
  continues to work.
- Static named/namespace imports from `@manifold/author` and
  `@manifold/author/primitives` work in the shared browser/native evaluator.
  A parsed module returns its default synchronous factory result or project
  object. The old injected function-body form remains supported.
- Acorn parses import/export declarations; substitutions do not match comments
  or string contents. The adapter is a synchronous built-in binding resolver,
  not a general module loader or security sandbox. External applications import
  the ordinary module through their own ESM loader.
- Packages, public exports, typings, browser builds and dependent saved
  controller bundles are refreshed. Package contents include the resolver,
  primitive definitions, example module and host-service files; Acorn is a pinned
  dependency. Installed dependency files remain ignored by version control.

Other primitives still need semantic names. Arbitrary live dependency loading,
dynamic imports, re-exports, `import.meta`, asynchronous factories, source/control
navigation and context-aware CodeMirror completion remain open. TypeScript name
completion is implemented; the live editor's existing generic suggestions have
not been replaced by a semantic completion service. The later interactive graph
tutorial is still deferred.

## Evidence

[Browser report](https://wubulon.tailfac9f9.ts.net:4174/authoring-delivery/2026-10-02/browser-report.json)
and [native report](https://wubulon.tailfac9f9.ts.net:4174/authoring-delivery/2026-10-02/native-report.json)
record actual accepted state and source.

- Retained pitch reached 1118 Hz while the pointer was held. In a subsequent
  owned browser session, actual Wasm egui pitch reached 1437 Hz before release.
  Both ran against verified `sinkId: {type: 'none'}` audio contexts.
- In the final browser session, an external UDP sender first requested 1000 Hz
  and received an accepted 1000 Hz reply. A real CodeMirror edit changed the
  mapping to `message.value / 2`, then Apply live published that source. Sending
  1000 again received an accepted 500 Hz reply. The audio track stayed the same;
  final measured live RMS was about 0.03640. This establishes continued sounding
  operation, not a sample-by-sample click-free continuity guarantee.
- The native egui application loaded the updated package, enabled monitoring,
  accepted a live source mapping edit and applied a 1000-to-500 event through the
  native handler. Actual output was recorded on the owned `manifold_style_review`
  null sink (RMS about 0.00516). The application ran on an isolated X server with
  Wayland environment variables removed; routing was verified before monitoring.
- 94 web tests passed. Four new checks cover actual imported-module/live-source
  graph and view agreement, stale references and atomic rejected declarations,
  parsed imports/aliases/exports, rejected module edit rollback and migration of
  the previous delivered source with a live 440 Hz target.
- Native `live_primitives` passed all four tests, including sounding execution,
  source edits and cold recall for all 30 programs. TypeScript checks pass with
  valid names and deliberately rejected invented oscillator/gain members.
- Production web and independent importer builds passed. Full workspace/DSP
  parity benchmarks were not repeated for this authoring-only change.

Native verification initially encountered a full filesystem. Only this
checkout's disposable Rust incremental cache was removed; verification then
passed. A browser restart invalidated the earlier automation generation; the
review reconnected through BB's explicit instance/lease commands. A later review
tab disappeared, so remaining egui/editor checks used a fresh owned automation
tab without taking control of the user's personal tab. Raw attempts and private
connection files remain in ignored review artifacts; only selected evidence is
published.
