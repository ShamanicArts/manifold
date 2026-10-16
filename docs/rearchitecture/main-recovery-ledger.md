# Main recovery ledger: one authored graph

Status: Main requirements and historical checkpoints; updated 1 October 2026.
Implementation resumed under the [accepted delivery goal](proposed-delivery-goal.md).
The [vertical delivery plan](vertical-delivery-plan.md)
supersedes the task sequencing and next-step instructions recorded below.
M0–M5 remain behavior/ownership requirements to satisfy through usable product
slices, including their UI and hosts. This ledger complements
[the full work register](README.md) and [legacy inventory](legacy-projects.md).
The original checkout at `/home/shamanic/dev/my-plugin` remains read-only.

## Product invariant

The original `UserScripts/projects/Main/dsp/main.lua` calls `buildPlugin(ctx)` and constructs the audible branches from primitives and graph connections. Other Lua modules build the synth/looper subgraphs and mutate the live graph. The v2 target is the same authoring capability through one language-neutral project graph contract, exposed to JS/TS and Rust, with the Rust DSP core compiling and executing the result. Rack, Patch, UI, scripts, agents, saved state, and host adapters must observe one graph and one set of node identities. No Main-specific processor or visual shell counts as a completed port of that contract.

The audio callback performs DSP and bounded event application. A user graph transaction may be requested while sound runs; validation, resource preparation, and structural graph compilation occur off callback, followed by a bounded block-boundary publication. A route-only fast path may reuse already prepared state. The measurable deadline is request-to-audible latency and render continuity, not source compilation inside the callback.

## Sources of authority found at the start of recovery

| Authority now | Evidence | Required destination |
| --- | --- | --- |
| Fixed `MainInstrument` voice → Filter → FX1 → FX2 → EQ → capture/monitor/looper order | `crates/manifold-core/src/main_instrument.rs` fields and `process_with_sample_copy` | Project-authored graph and reusable core nodes/composites; one execution plan for the audible route. |
| Optional post-voice `rack_insert: ExecutionPlan` with duplicated Filter/FX/EQ kernels | `main_instrument.rs`, `web/src/state/main-rack-graph.js`, `crates/manifold-native/src/main_rack_document.rs` | Same plan and node state as the authored graph, with no second DSP owner or control shadow. |
| Saved rack shells and restricted connection translator | `projects/main-looper/rack.json`, `web/src/state/main-rack-graph.js` | Rack/Patch layout and graph edges in the canonical project document; one validator and transaction path. |
| Main browser/native session controls and host parameter slots | `web/src/state`, `crates/manifold-native/src/main_session.rs`, CLAP/VST3 Main classes | Stable parameter IDs, one versioned state model, explicit importer for v2 sessions 1–16 and chosen legacy state. |

## Work in dependency order

- [ ] **M0: single post-voice DSP owner.** Remove the duplicate fixed Filter/FX/EQ kernels and intermediate buffers from `MainInstrument`; keep the currently audible authored insert as the sole DSP route. The standalone default must also use that route. Preserve exact control values, per-effect memories, EQ response, reset behavior, note/capture continuity, browser/native loading, and session versions. Do not substitute a second silent DSP instance as a control store. This is an ownership extraction, not completion of graph authoring.
- [ ] **M1: one graph contract.** Support named, typed input and output ports, multiple outputs, stable instance IDs, graph introspection, transactions, and meaningful rejection. Eliminate duplicate node metadata and numeric code tables across Rust, browser, and native readers. Give JS/TS, Rust, and agents the same semantics and generated schemas.
- [ ] **M2: Main graph authored through the public contract.** Transpose `buildPlugin`, looper/synth modules, dry/monitor/capture branches, module factories, and graph lookup/mutation from the legacy scripts. Retire fixed `MainInstrument` routing only after graph construction, audio, control, and state cases pass. A hardcoded Rust reconstruction of Main is an interim oracle, not the target.
- [ ] **M3: live structural edits.** Prepare and validate off callback; publish at a block boundary without losing the old sound on failure. Specify continuity for voices, loops, capture rings, FX tails, parameter smoothing, and resources. Browser preparation must have a demonstrated worker/worklet handoff; do not call a full graph compiler from `AudioWorkletProcessor` message handling while rendering.
- [ ] **M4: creator surfaces.** Rack and Patch project one graph; egui is the preferred immediate-mode editor, with Three.js and HTML available in browser presentation. Script and UI authors get a discoverable node catalog, typed bindings, examples, query/diff/preview/commit, health, and profiling. Agent tools use the same transaction path and report why a node is silent or unsupported.
- [ ] **M5: prove the port.** Compare actual old Main graph topology, route changes, MIDI/audio, UI interactions, save/reopen, and host behavior. Port two unlike projects through the same runtime, then the remaining inventory. Benchmark matched C++/native Rust/browser Wasm projects and compile-to-audible edit latency; narrow primitive timings do not close this gate.

## Immediate implementation loop

1. Capture exact current behavior for default Main, altered rack route, per-type FX memory, EQ, save/reopen, and a held note through a graph change. Use existing tests/fixtures where they probe behavior; add only missing discriminating cases.
2. Make M0 a bounded code change. Start by separating compact parameter memory from DSP kernel ownership, then make the graph plan the only post-voice processor. No audio work or graph preparation is added to the callback. Keep current browser/native project imports working.
3. Compare memory footprint, audio output, capture rings, and state on native and Wasm. If a behavior changes, fix it or leave M0 open with exact evidence. Do not mark Main complete.
4. Move to M1 only after M0's single-owner proof is documented. The user/agent-facing contract and live graph publication are the actual architecture gate.

## Checkpoint: one post-voice processor

Source revision: parent `yvsnokvl`, working change `oqokptxz`. The default `MainInstrument` now compiles `projects/main-looper/default-rack-insert.json` into one `ExecutionPlan`. The fixed Filter, two EffectSlot kernels, EQ kernel, and their intermediate buffers are gone. Compact control values remain for host state, modulation bases, and effects disconnected from the active route. The browser skips a redundant second compile when its rack graph matches that authored default, regardless of saved node/edge/parameter array order. A changed graph still prepares a replacement before sound starts; route-only edits use the prepared plan. Voice bank, control utilities, capture, monitor, and looper remain hardcoded Main code, so this does **not** satisfy M1 or M2.

Evidence at 48 kHz/128 frames: `cargo test --workspace` passes. A version-15 session with FX1 type 5, FX2 type 1, a changed Filter cutoff, and an enabled EQ shelf renders **2,048 identical f32 samples** from parent `yvsnokvl` and this change (both SHA-256 `d265db8fff444337c4f146cd4dc2a50d9ef9644ce8be14623c46e8cb36935198`). The native/Wasm eight-block session comparison has maximum absolute error 9.31e-9. The direct Wasm rack probe renders the same default held-note energy (29.995072) and capture peak (0.0076655) whether the already prepared default is reused or an identical second plan is prepared. Its default route and bypass/reconnect edit run at 242.0625 MiB of Wasm linear memory; needless preparation of an identical plan reaches 283.25 MiB. A structurally different CV insert also reaches 283.25 MiB during replacement and renders 265.247227 energy with 0.0520200 capture peak. The muted headless Main Patch browser probe accepts route changes and reopens its saved session with zero page errors. Production builds pass. The old C++ full-project comparison, longer pre-change Rust tail/capture traces, callbacks under load, and off-callback live structural publication remain unmeasured.

Next: use the [legacy graph authoring crosswalk](graph-contract-crosswalk.md) to consolidate duplicated browser/native/core graph readers and node metadata into M1's typed multi-output contract. Move the entire Main voice, dry, capture, monitor, and looper structure through that contract for M2. The current `main_post_voice.rs` reader is a narrow temporary adapter and must be removed when the shared project reader lands. For M0's remaining audit, compare longer pre-change Rust tails and capture traces, instrument control/snapshot parity and memory in native and browser, then mark the gate only if there is no unexplained change.

At every checkpoint record source revision, old and new fixture, host, observed output, unresolved behavior, and next change here. The previous work register was a plan; this ledger is the active sequence for removing the duplicated Main path.

## 30 September: reusable live oscillator graph

Changes `ovmlsmmn` and `pwukokyz` make a public opt-in prepared browser runtime
and widen it to the existing authored Rack oscillator module. The legacy
nine-oscillator/mixer/gain composition remains project script code. Native core
identity transfer preserves phase and bounded smoothing state; Worker
preparation and AudioWorklet execution use that same Rust plan. Twelve live
transparent insert/remove edits match an untouched reference in all 81,536
recorded stereo frames. [Evidence and limits](rack-oscillator-port.md#2026-09-30-live-prepared-runtime-checkpoint).

This advances reusable M1/M3 infrastructure. Main's voice bank, controls,
capture and looper still need M2's full authored composition; MIDI and resource
publication are the next graph-runtime work. No Main gate is marked complete.

## 30 September: prepared timed MIDI and authored audition

Change `lvmpzxwr` adds bounded event admission and compatible fixed
VoiceSynth/MidiTranspose history through the same Rust plan. The authored
audition preserves the legacy endpoint and original-key ownership. Live
held-note edits, queued release across renumbering and explicit interval remap
match a reference in 55,808 stereo frames; actual old Lua emissions match all
25 events. [Builds, proof, failures and next tasks](prepared-midi-runtime.md).

MIDI rewiring deliberately resets affected voice ownership. The independently
installed package and public route action prove the browser policy; native
controller/plug-in equivalence remains open. This advances M1/M3. Main's full
voice/capture/looper composition is still M2 work; no gate is closed.

## 30 September: owned loop/capture storage

Change `uqypknxt` exposes the four-layer authoring controller in the prepared
browser runtime. Buffer swaps retain recording, playback, overdub, smoothing
and cursors without callback allocation or destruction. Four takes reopen
exactly; edited/reference audio matches in 73,088 stereo frames.
[Live build, recordings, saved graph, proof and gaps](prepared-loop-runtime.md).

This advances M1/M3. Main's quantized transport, synth and full capture/looper
composition remain M2 work. Native/plug-in publication still needs the same
loop protocol integration. No Main gate is marked complete.

## 30 September: loaded-project authoring cost

Change `wywppltq` separates portable PCM validation from decoding and bounds
retention of successful immutable payload validation. Thirty edits with four
saved takes loaded measure 23.55 ms median and 39.885 ms maximum; new paired
recordings match in 73,472 stereo frames. [Evidence and limits](loaded-loop-authoring.md).
This advances M1/M3 usability; native loop publication, constructor configuration,
Sample resources and full Main M2 composition remain open.

## 30 September: native loop publication and public JS author restore

Change `tuyprmmv` integrates the existing core-owned loop transfer into Rust author
transactions, native JS, CLAP and VST3 publication. Compatible staging defers
publication; host stop adopts accepted pending edits before saving actual PCM.
Explicitly replaced clips keep candidate controls. The public four-layer module
also runs and restores embedded PCM in native QuickJS without DOM codecs.
[Live builds, retained callback recordings, full protocol and next tasks](native-loop-publication.md).

This advances M1/M3. Native JS snapshots currently require stopped processing;
actual new DAW lifecycle parity is unproved. Constructor configuration, Rust asset
imports and prepared Sample resources are the next shared-contract gates. Main's
quantized transport and complete authored composition remain M2; no Main gate is
marked complete.

## 30 September: constructor configuration and Rust resources

Change `kszptryt` adds generated named capture-capacity/fixed-gain configuration,
core capture-ring preflight and Rust PCM/shared-region authoring. Real four-take
and eight-voice Sample graphs now round-trip through Rust and JavaScript and render
against native/Wasm references. An actual sample-zero loop-speed mismatch is fixed
with the core's existing preparation reset. [Live builds, proof and limitations](resource-authoring.md).

This advances shared M1/M3 infrastructure. The next resource step is prepared
Sample publication, compatible voice history and wider Rust capture metadata.
Main's quantized transport and full authored voice/capture/looper graph remain
M2 work; no Main gate is marked complete.

## 30 September: Sample packages across release hosts

Change `wnmuzvyt` connects the public Sample authors' timed events and bounded
parameter batches to CLAP/VST3, verifies accepted controller state and supports
browser recall of their actual plug-in packages. Release callbacks and exported
SDKs match native JS exactly through live PCM/topology changes, and an actual
REAPER Instrument save/reopen render matches native within 5.96e-8.
[Live build, recordings, source and limits](scripted-sample-release-hosts.md).

This advances shared M1/M3 and host recovery; it closes no full Main gate.
After this checkpoint, advance actual Main M2 composition from the legacy
`buildPlugin` branches and voice/module factories. Keep missing native services,
transport, voice contracts, device lifecycle and egui tracked, and expose the
required reusable primitives while porting those real branches. The fixed
`MainInstrument` and `main-voice-bank` composition cannot substitute for the
legacy authored graph without the ledger's behavior and rewriteability gates.

## 30 September: authored Main Wave voices and arbitrary I/O requirement

Change `ssxrkzvu` ports the eight Wave voice graphs, real legacy Lua allocation and
ADSR orchestration, dry/monitor/capture-send/master branches and four layer-input
taps through the public contract. [Live build, recordings and limits](main-wave-authoring.md).
Native live edits preserve exact PCM; the AudioWorklet proof retains 88,448 exact
paired frames through 15 edits and four exact capture windows. Actual C++ Wave
cases agree within 2.98e-8. This is a portion of M2; full Main remains open.

The user's [arbitrary input/output requirement](arbitrary-io-contract.md) includes
host buses/channels and module ports. Configurable 1–32-input mixers are now
public, but stereo host boundaries remain an explicit gap. Implement that shared
boundary next alongside Main's authored branches; do not count mixer growth as
arbitrary host I/O and do not add a second Main audio owner.

## 30 September: explicit host audio buses

Change `psqqzrlv` implements named bus/channel layouts in the core, Rust/JS/TS
authoring, native scripted/library processing and prepared AudioWorklet. Actual
native/browser output matches in 8,192 five-channel frames; live maps, optional
input, rejection and recall pass. The latest Main Wave regression retains 88,320
exact paired frames and four exact capture windows. [APIs, proof and next tasks](explicit-audio-buses.md).

CLAP/VST3 bus negotiation, native devices, I/O automation, live host-shape changes
and arbitrary primitive/module widths remain required. Current plug-in adapters
reject explicit layouts before publication. Continue those adapters and Main's
real Sample/looper/transport branches through the same graph contract. No Main
gate is marked complete.
