# Public authoring contract proposal

Status: proposed design gate, 29 September 2026. This is the target interface, **not an implemented package or frozen ABI**. It narrows R01–R06/R09/R14 in the [work register](README.md), using the [legacy crosswalk](graph-contract-crosswalk.md) as the behavior reference. The [glossary](../../CONTEXT.md) names the domain concepts.

## Product promise

An author can import Manifold into a web project, compose an instrument from documented primitives and graph modules, inspect and change that graph, and package the same project for **browser audio, a native application or headless renderer, and native VST3/CLAP plug-ins**. Manifold's own shipped instruments and presets use that public composition contract. A user or an agent can open a shipped graph, see the actual routes and parameter bindings, fork it, and save a modified version without editing Manifold internals. A preset is data applied to an authored graph; it is not an opaque alternate audio engine.

Rust owns DSP kernels, graph validation and preparation, real-time processing, and timed execution. JS/TS and Rust project modules own graph composition and control behavior outside the audio callback. Presentation is a separate client. JS in a browser can also use Three.js, HTML, and other web APIs in a view, subject to host capabilities; none of those draw operations determines audio timing.

The immediate promise of *rewriteable* applies to shipped **authored graphs and presets**: their topology, module composition, automation mapping, and parameters are visible and editable through the public contract. A DSP primitive exposes its interface, behavior, version, provenance, and source reference, but rewriting its sample-level algorithm requires a custom DSP module format. That extension is an explicit design decision and test gate below; calling a hidden Main-only processor a primitive does not satisfy graph rewriteability.

## Current mismatch, checked against code

| Desired contract | Current implementation | Consequence |
| --- | --- | --- |
| An importable authoring package | `web/package.json` is a private Vite app | `import ... from '@manifold/...'` is an example of intended use, not an existing distribution. |
| One typed, inspectable graph | Core `GraphDescription` now records both edge port indices and can route LFO OUT/INV/UNI; other types still expose a single output | Named general port catalog, composite expansion, other multi-output primitives, and general author query remain open. |
| One semantic catalog | Rust core now owns port descriptions and Wasm type-code decoding; the browser's 24 graph-workspace port descriptions and codes are generated from them | Parameter metadata, native JSON type construction, remaining primitives, and a publishable public catalog still need consolidation. |
| Live project script and atomic edits | Native reads project JSON; browser editor edits structure while stopped; the plan supports restricted prepared-route changes | A loaded project cannot generally create, inspect, and rewire itself while sounding or while the editor is closed. |
| Common runtime publication | The graph VST3 processor and one CLAP instance already prepare native runtimes and atomically swap them; Main still has separate host-specific assembly | Reuse the proven native mechanisms where they fit, but make one project transaction and continuity contract work in standalone, VST3, CLAP, and browser audio. |
| Native device hosting | `manifold-native` has a reusable processor and headless render examples; no standalone device adapter is established here | Add and test a native application/device callback path using the same project package and execution plan as the plug-ins. |
| Every shipped graph follows the public interface | Main still has a bespoke voice/capture/looper assembly, although its post-voice route now has one DSP owner | Main remains a behavior oracle, not proof of the authoring architecture. |

These are implementation gaps, not evidence that the product promise should be weakened.

## Author-facing shape

The example is intentionally small. Names and package scopes are **candidates**. TypeScript declarations are generated from the same catalog and semantic contract used by the Rust binding. Plain JavaScript works without TypeScript.

```js
// instrument.js — runs in a control runtime, including when the editor is closed.
import { defineProject } from '@manifold/author';

export default defineProject({
  id: 'example.filtered-input',
  version: 1,
  async create({ graph, host }) {
    await graph.edit(graph.revision, tx => {
      const input = tx.add('manifold.audio.input', { id: 'input' });
      const filter = tx.add('manifold.filter.svf', { id: 'filter' });
      tx.connect(input.port('audio'), filter.port('audio-in'));
      tx.connect(filter.port('audio-out'), host.port('main-out'));
      tx.expose(filter.parameter('cutoff'), { id: 'cutoff' });
    });
  },
});
```

`graph.edit(expectedRevision, build)` creates a draft. `tx.add`, `tx.connect`, `tx.remove`, `tx.disconnect`, `tx.expose`, and other structural operations modify only that draft. `build` is synchronous; preparation and publication may be asynchronous. `graph.preview(expectedRevision, build)` runs the same validation and returns a canonical diff, cost estimate, and diagnostics without publishing; a subsequent edit must supply the revision it previewed and validate again. A successful edit result identifies the **published graph revision and first audible block**; an unsuccessful result has structured diagnostics and leaves the active graph and saved project state unchanged. Exact scheduling representation for browser and native hosts is a prototype question. The first-load path uses the same transaction semantics before audio starts. There must be no second Main-specific mutation API.

Public references contain stable project instance IDs and named ports or parameters. An ID is distinct from a type ID, display name, and path. The module declares its public ports, parameters, event inputs, and host exposure; its internal instances have stable IDs local to the module occurrence. A query can return either the authored hierarchy or an expanded graph, with a mapping back to the module and source location. A stale handle fails with `stale-reference`, never silently points to a different node. Node instances survive compatible edits by ID and type; the precise state transfer table is part of R06.

### Reusable authored modules

```js
// tone-shaper.js — shipped modules use the same interface as user modules.
import { defineModule } from '@manifold/author';

export const toneShaper = defineModule({
  id: 'example.tone-shaper',
  version: 1,
  ports: { input: 'audio.stereo', output: 'audio.stereo' },
  parameters: { cutoff: { type: 'frequency', unit: 'Hz' } },
  build({ tx, boundary }) {
    const filter = tx.add('manifold.filter.svf', { id: 'filter' });
    tx.connect(boundary.port('input'), filter.port('audio-in'));
    tx.connect(filter.port('audio-out'), boundary.port('output'));
    tx.bind(boundary.parameter('cutoff'), filter.parameter('cutoff'));
  },
});
```

This syntax is a design probe, not a commitment to callbacks in the eventual compiler. The contract is that the module definition is inspectable and forkable, its expanded instances retain identity, and the module can be used in another project without Main-specific code. A packaged project records the exact module and primitive versions needed for reproducible recall. A shipped module may be implemented in Rust project code instead, but it must yield the same authored graph and inspectable expansion. A genuinely atomic kernel may remain a Rust primitive; hiding a whole product graph behind one kernel fails the rule.

### Small semantic surface

| Operation | Result and rule |
| --- | --- |
| `catalog.list/get(typeId)` | Versioned type metadata, named typed ports, parameters, defaults, units, supported hosts, resource needs, provenance and doc/source links. One canonical Rust-owned catalog generates Rust/JS/TS metadata and schema; numeric Wasm codes stay private transport detail. |
| `graph.snapshot({expand})`, `graph.find(id/path)` | Immutable revision, module hierarchy, nodes, ports, edges, exposed controls, and source mapping. Stable ordering and serialization give humans and agents diffable results. Paths aid discovery; saved identity uses IDs. |
| `graph.preview(revision, tx => ...)` | Validate a candidate edit, produce a canonical diff and preparation/capability diagnostics, without changing the published graph or saved state. Cost estimates are advisory until measured. |
| `graph.edit(revision, tx => ...)` | Add/remove instances, connect/disconnect ports, expose controls, set saved configuration, and edit module structure. Validates type, fan-in, cycles, ownership, resources, and host capability before publication. Stale revision returns a conflict plus current revision. |
| `control.on(...)`, `control.schedule(...)` | Project control behavior receives ordered host/UI events outside the audio callback and schedules bounded, timestamped events into Rust execution. Host automation and MIDI enter through explicit ports or exposed parameters. Ordering and latency guarantees need fixtures. |
| `project.save/open` | One versioned project state containing package lock, authored graph, saved controls, resources, mappings, and presentation layout. Runtime meters and transient UI frame state are separate; only declared continuity state is persisted. |
| `host.capabilities()` | Explicit buses, MIDI, automation, transport, resources, display, and web API availability. A project can require a capability and fail visibly, or use a documented fallback. |

Port types must distinguish audio channel layout, control/CV, gate, voice, MIDI, and other events; implicit coercion is forbidden unless a catalogued converter instance appears in the authored graph. Multiple source outputs and multiple target inputs are first-class, matching the four-index legacy connection concept. Host buses are named boundary ports, not magic node IDs. Parameter ranges/units and modulated versus saved values are explicit. Structural graph edits differ from sample-timed value/event changes; changing a cutoff must not recompile a graph on every automation point. Define conversion, event ordering, parameter smoothing, fan-in, and feedback rules in fixtures before declaring the contract stable.

### Data flow into execution

Keep the authored document and immutable public snapshot separate from the prepared execution plan. A graph revision contains compact instance, port, edge, parameter, and resource records keyed by stable IDs; the compiler resolves those IDs to dense execution indices and buffers. A module expansion records its source mapping so an optimized plan remains explainable. The control side validates a candidate revision, identifies changed dependencies, prepares resources and execution storage, and publishes a complete compatible plan at a block boundary. The callback reads the active plan and bounded timed-event queues; it never traverses JS objects or graph-editor layout. Retired plans and assets are reclaimed outside the callback.

An incremental compiler is a **performance hypothesis**, not a prerequisite to the public interface. Benchmark full rebuild against dependency-aware preparation on representative fan-out, feedback, Main, and multi-instance graphs. Optimize the expensive paths demonstrated by those measurements, and preserve deterministic snapshots and state continuity regardless of compiler strategy. Record request-to-audible time as well as callback time; an apparently cheap callback with a slow editor-visible compile does not meet the real-time authoring goal.

## Packaging and host boundary

Proposed package contents: `manifold.json` manifest (project ID/version, interface compatibility, entrypoints, capabilities, resources), a JS module or compiled Rust project module, optional view module, authored graph/state, asset references or bundled assets, and an exact dependency lock. Importing `@manifold/author` is authoring/control. Host adapters load the **same project definition and state**: `@manifold/host-web` provides browser audio, a native application or headless renderer uses `manifold-native` (with a device adapter still to build), and VST3/CLAP adapters connect that native runtime to their respective host contracts. Export builds packages/artifacts for each target; arbitrary browser JS and DOM code is not assumed to run in a native plug-in. A view that uses web APIs declares them, and a native host either supplies them through a webview or reports a missing capability.

The strongest portability target is the **same authored graph, IDs, state, parameter/event semantics, and audio behavior** across browser, standalone native audio, VST3, and CLAP. Identical bytes for every JS runtime, renderer, or host plug-in are not required. Native execution of user JS, module resolution and isolation, and the Rust project module artifact/ABI need measured prototypes before selecting an engine or package format. TypeScript compiles to JavaScript before load. Rust project source also needs a build step; neither the browser nor a plug-in is assumed to compile arbitrary Rust at project load. Native plug-in editor webviews are presentation hosts; they do not turn a native audio callback into an AudioWorklet.

Lifecycle: load/validate dependencies and capabilities; restore state; prepare resources; activate the graph; deliver ordered control events; allow transactions; suspend/resume; save; dispose. The project control runtime outlives editor attach/detach. A failed reload keeps the last valid audio plan; a failed initial load reports diagnostics and produces a safe silent state. Separate instances never share mutable authored state by accident.

## Audio publication across all hosts

All structural validation, allocation, asset decoding, and plan preparation happen outside **every** audio callback: browser AudioWorklet, native standalone device callback, VST3 `process`, and CLAP `process`/`flush` where applicable. Publication and retirement are separate operations; the callback performs only bounded work on a ready plan. Route-only edits may use a faster implementation if they preserve the transaction contract. This is an architecture invariant, **not an assertion that every current host satisfies it for live structural edits**. The semantic result of a transaction and graph/state revision must be common to all hosts; the transfer mechanism can differ.

Native is a first-class implementation path. `manifold-native` already prepares a `NativeProcessor` before processing. The existing graph VST3 processor and a CLAP instance contain host-specific pending/current/retired runtime swaps. Audit and adapt those paths into a shared native project runtime with explicit continuity and off-callback retirement; do not build a second, browser-shaped runtime for native audio. Probe standalone and actual VST3/CLAP host callbacks, including deactivate/reactivate, offline rendering, variable block sizes, automation, MIDI, editor closed, and multiple instances. For CLAP, include active `flush`; for VST3, include controller/processor state handoff. Existing swaps are feasibility evidence, not proof that general authored graph edits or Main already satisfy the contract.

The browser requires a proof before committing to a publication design. An AudioWorklet processor runs on the Web Audio rendering thread ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/AudioWorkletProcessor/process)). A worker-owned Rust plan cannot be handed to another Wasm instance as a native pointer; this follows from instance memory ownership. Shared Wasm memory is an option, but using shared memory across browser threads has cross-origin isolation requirements and deployment consequences ([MDN WebAssembly.Memory](https://developer.mozilla.org/en-US/docs/WebAssembly/Reference/JavaScript_interface/Memory/Memory), [MDN SharedArrayBuffer](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer)). Prototype at least: (A) shared Wasm memory with off-thread plan construction and bounded publication, (B) a transferable prepared representation reconstructed on the worklet under a measured budget, and (C) any host-supported alternative. Reject a path that compiles/allocates in the callback or requires a web deployment mode incompatible with the intended embedded hosts. Record memory growth, ownership, plan retirement, cross-origin isolation, and DAW webview compatibility.

Measure request-to-audible latency, p50/p95/p99/max callback cost, deadline misses, silence/discontinuities, peak/resident memory, and state preservation under live edits. Compare matched C++ legacy, v2 native Rust, v2 Wasm, actual browser AudioWorklet, standalone native audio, and actual VST3/CLAP host processing. Offline native benchmarks and Node/Wasm loops help isolate core cost; neither replaces host callback measurements.

## Inspection and agent use

Human and agent clients use the same public catalog, immutable snapshots, edit validation, and structured diagnostics. An agent can list catalog types, read a shipped project's authored and expanded graph, propose a transaction against a known revision, obtain a canonical diff and diagnostics without changing sound, then commit. The API exposes why a route is silent, where a type mismatch occurs, what capability is missing, and which package/source produced an instance. Examples and generated TS declarations must be as useful as the raw schema; no undocumented numeric node codes or special agent backdoor. UI Rack/Patch and egui presentation consume committed snapshots and issue those same edits; they do not maintain a shadow audio truth.

## Gates before renewed product porting

1. **Catalog and interface review.** Pin names, typed ports, identity, module expansion, state, events, transaction outcomes, capability errors, and lifecycle using a small published JS/TS example and Rust equivalent. Show how Main's legacy `buildPlugin` and a dynamic rack edit read in the candidate interface. Resolve custom DSP scope and ownership of JS control behavior.
2. **Portable vertical slice.** One simple legacy graph with fan-out and a multi-output control node is built by JS and Rust through the public contract, imported in a browser and loaded in standalone native audio, VST3, and CLAP, saved/reopened, and kept active with the editor closed. Compare graph snapshots and audio; require no host-specific project processor.
3. **Live edit proof.** Rewire during sound, with a rejected edit leaving sound/state unchanged, and measure publication, continuity and deadline behavior in the actual AudioWorklet, standalone native audio, VST3, and CLAP. Resolve browser worker/worklet publication and native JS control/runtime publication by prototype.
4. **Rewriteability proof.** Ship one Manifold-authored module and one preset using exactly the public interface. Inspect and fork them from both a UI and a script, modify a route, export to browser, standalone native audio, VST3, and CLAP, and observe the same intended change. An opaque Main-specific branch fails this gate.
5. **Only then resume Main extraction.** Pull reusable voice, capture, loop, and utility boundaries into catalogued primitives or authored modules; migrate original Main graph behavior through the same contract. Keep current builds as comparison fixtures. Do not call existing primitive parity or static JSON loading a completed project port.

## Decisions still open

| Decision | Candidates and evidence needed |
| --- | --- |
| User-authored DSP algorithms | First release exposes graph-level rewriteability and documented Rust DSP extension builds; or first release also supports a custom DSP kernel ABI. Decide from a real user module example, native/Wasm build and reload costs, safety, state and packaging. Graph authorship is required either way. |
| JS in native hosts | Embedded JS control engine, isolated JS/Wasm runtime, or ahead-of-time authored graph plus a portable bounded control program. Compare editor-closed event handling, module loading, instance isolation, latency, footprint and distribution. A static graph alone cannot represent all legacy project behavior. |
| Browser plan publication | Shared-memory runtime, transferable plan representation, or another measured host strategy. Verify with actual AudioWorklet and target webviews. |
| Native plan publication | Adapt existing pending/current/retired swaps into a shared standalone/VST3/CLAP runtime, or choose another bounded handoff after measuring callback, continuity, reclamation, and host lifecycle behavior. Do not assume editor webview and native DSP share a Wasm instance. |
| Rust project artifact | Stable host ABI, portable Wasm module, or package-compiled native module. Compare versioning, hot reload, memory/isolation, native/browser parity and build cost. |
| UI host | Native egui or egui/Wasm in a webview; browser HTML/Three.js capabilities through a view bridge. Probe focus, accessibility, custom painting, render cost and plug-in lifecycle separately from graph scripting. |
| Exposed host parameters | Stable slot mapping under dynamic modules and DAW parameter limits; test automation recall after graph edits and state migration. |

An interface name, package name, runtime choice, or rewriteability guarantee beyond authored graphs becomes final only after its gate has evidence and a recorded decision.
