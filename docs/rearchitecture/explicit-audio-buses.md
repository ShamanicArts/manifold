# Explicit audio buses — 30 September 2026

Change `psqqzrlv`, parent `ssxrkzvu`. Implements the library/browser portion of the
user's [arbitrary I/O requirement](arbitrary-io-contract.md). Full Manifold/Main,
all host adapters and arbitrary module boundaries remain unfinished.

## One contract and execution plan

`signal.io` version 1 adds ordered named audio buses and explicit input/output
channel maps to the existing project schema. `signal.inputs` and `signal.outputs`
are validated channel totals. Legacy device recipes are omitted when saving an
explicit layout. Existing stereo projects without `io` retain their routes.
Older readers reject the extension rather than assuming stereo.

Each bus has a stable ID, display name, channel count and input optionality.
Input bindings name a node and map its two existing kernel lanes to bus/channel
indices or explicit silence. Output bindings name an audio node, output port and
lane, or explicit silence, in declared bus/channel order. Mono duplication,
extraction and fan-out are explicit authored choices. MIDI/control ports remain
distinct and cannot be copied into an audio bus.

The graph compiler resolves output node indices off callback and treats every
declared output as a processing root. All outputs share one execution plan and
one kernel instance per node. Live route reordering remaps these output indices.
The conventional stereo Output node is optional at the core API; author workspace
IDs 1/3 remain compatibility scaffolding rather than host bus definitions.

The former 32-bus/256-channel authoring quotas were removed on 13 October.
Bus maps and sample storage are prepared to match the project. Actual host
capabilities still apply: the WebAudio adapter must negotiate channel counts
supported by the browser. This does not restrict the library or Wasm graph.
See [I/O scaling and ownership](io-storage.md) for implementation and evidence.

## Public APIs and adapters

- Rust: `GraphWorkspace::set_io_layout`, `NativeProcessor::prepare_with_io`,
  `process_io` with planar `InputBus`/`OutputBus` views; `NativeScriptAudio::process_io`
  shares publication, event admission and readback with the existing script host.
- JS/TS: `graph.setIoLayout`, `graph.ioLayout`, saved import/fork/transactions.
  `BrowserGraphHost({execution:'prepared'})` exposes `connectInput(busId, source)`
  and `connectOutput(busId, destination)`.
- Wasm: prepare-side JSON upload validates against the same core graph description.
  Buffers are sized for declared channel totals. The compiler Worker owns graph
  preparation; the AudioWorklet copies exactly declared buses without mono fallback
  or truncation. Rust processing borrows the planar buffers directly, with no temporary channel tables.
- A malformed block validates before events, state or output writes. Missing
  optional input is silence. Wrong nonempty channel counts reject.
- Channel-map edits publish while running. Current browser and native script hosts
  reject bus IDs/counts/requirements changes before publication; these require a
  newly prepared host. No active shape change is advertised as implemented.
- At this checkpoint CLAP/VST3 rejected explicit layouts. The subsequent
  [CLAP declared-I/O implementation](clap-declared-io.md) adds discovery,
  host-supported inactive changes, planar processing, automation and package recall.
  The [VST3 follow-up](vst3-declared-io.md) adds mono projections of wide logical buses,
  exact SDK recordings and a real REAPER save/reopen render. Broader DAW/device
  verification remains required work.

## Review and retained proof

- [Live bus editor](https://wubulon.tailfac9f9.ts.net:4174/arbitrary-io.html): distinct
  channel values, optional-input connection, live output swaps, user JS transaction,
  saved graph download and stop/restart recall. Its monitoring is silent.
- [Reports, raw PCM and screenshot](https://wubulon.tailfac9f9.ts.net:4174/arbitrary-io/2026-09-30-arbitrary-io-v4/).
- Actual browser AudioWorklet versus the native release library renderer:
  **8,192 frames × five channels match exactly**. Inputs are 0.125, -0.25, 0.375,
  -0.5; the independent mono send is 0.0625. This is channel identity evidence,
  not a musical audition or performance benchmark.
- Five live output-map swaps retain the other channels and produce six accepted
  publications. Disconnecting optional input silences only its mapped channel.
  Rejected bus-width and optionality changes retain graph and sound. Stop/reopen
  retains accepted routes. Callback allocation/deallocation/failure counters and
  compiler workers after close are zero.
- Native script: six swaps through the public authored controller, exact samples,
  zero callback heap, rejected host requirements/layout, and retry. Malformed blocks
  leave the pending edit unconsumed.
- Native library: Rust/JS author equality, asymmetric buses, missing optional input,
  save/reopen, zero-input mono generator, zero outputs, selection from 256 channels,
  explicit silence and live node reordering. A timed zero-input instrument matches
  the old stereo execution across sample-offset event spans. Invalid events leave
  output and processing history unchanged. All callbacks are heap guarded.
- [Main Wave regression capsule](https://wubulon.tailfac9f9.ts.net:4174/main-wave-author/2026-09-30-main-wave-author-v4/):
  88,320 exact paired stereo frames through 15 live edits, four exact capture windows;
  actual C++ Wave branch comparisons still agree within 2.98e-8.

Proof reports retain measured sources/hashes. Earlier accepted I/O capsules are
historical snapshots; v4 uses canonical save without the unused legacy input recipe.

Final native follow-up caches the initial typed bus declarations and compares the
already-parsed replacement. This removes two redundant full-document JSON parses
per graph edit, including needless parsing of portable PCM. The capsule retains
that exact follow-up source and workspace log separately from the browser probe's
measured sources. One earlier concurrent workspace run hit Sample's 250 ms script
watchdog; the case passed alone and the complete workspace passed after this
follow-up. The watchdog was not relaxed. Web/TypeScript/package checks pass as well.

## Next implementation sequence

The [CLAP follow-up](clap-declared-io.md) implements its part of item 1 and native
declared-bus automation from item 2. VST3 and device boundaries are next.

1. Carry this layout through CLAP audio ports/configuration, VST3 bus arrangements,
   planar callbacks and standalone native devices. Test asymmetric buses with
   distinct inputs, generator/no-input behavior, side inputs, recall and rejection
   using actual SDK probes. Preserve the working graph when the host rejects a layout.
2. Extend I/O automation and implement an explicit host-shape renegotiation and
   replacement lifecycle. Measure live transition, deadlines and resource retirement.
3. Resolve channel widths and configurable port declarations for primitive and
   authored module boundaries, including MIDI/control/voice contracts. Existing
   stereo kernels must retain their real capabilities rather than pretend to be
   arbitrary-width processors.
4. Continue actual Main branches: Sample/Ring/FM/Sync/additive/morph, true LoopLayer,
   quantization/transport, utilities/rack orchestration and creator presentation.
   Keep one authored graph and public primitives; no new fixed Main audio path.

The full legacy inventory, egui, native services, project behavior and matched
C++/Rust/Wasm performance gates remain active. This checkpoint does not complete
the port or any full Main gate.
