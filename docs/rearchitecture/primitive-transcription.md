# DSP primitive transcription and delivery ledger

Updated 2 October 2026. Active objective: **transcribe every DSP primitive and reusable module into inspectable, editable, sounding DspLiveScripting programs first; assemble the remaining projects from those public programs afterward.** Lucas explicitly chose this sequence. Keep the complete [approved goal](proposed-delivery-goal.md), [28-project inventory](legacy-projects.md), [19-module plan](vertical-delivery-plan.md) and [Main single-owner requirements](main-recovery-ledger.md).

## Delivered increment: 30 live programs

The 30th program is [Networking and Link](network-services-delivery.md), with actual TCP/UDP/OSC peers, query values, Link tempo/play-state, native egui and independent importing. The primitive-only coverage remains 30 of 43 kinds.

[Open the live library](https://wubulon.tailfac9f9.ts.net:4174/primitives.html). Choose a program, Start, edit its highlighted source and Apply while audio runs. Retained and real Wasm egui controls operate the same accepted graph. Save/open/undo and the existing agent bridge use that runtime. Each program keeps a separate saved document. Fixed Gain is changed through its constructor in source; ADSR starts with Gate off. External effects offer Saw, stereo noise, file and microphone inputs; generators default to no external input.

The original default Gain → Width graph and two-slot lazy Gain/Width harness are transcriptions of `DspLiveScripting/dsp/default_dsp.lua` and `fx_slot_swap_harness.lua`. The remaining programs are explicit audition compositions of public Rust primitives. They expose graph declarations and parameters; they do not establish complete original instruments, rack faces or all legacy factory behavior.

Public source: [`primitive-library.mjs`](../../packages/manifold-author/examples/primitive-library.mjs). Each returned `source` contains its full graph, parameters, wiring and presentation. The generic [`live-primitives-controller.mjs`](../../packages/manifold-author/examples/live-primitives-controller.mjs) runs that source in browser JavaScript or native QuickJS. Generated source literals are captured before production minification, with freshness checks; shipping source is not reconstructed from minified function names.

[Independent importing project: FX slots](https://wubulon.tailfac9f9.ts.net:4174/examples/instrument-import/?program=fx-slots) and [Sample/hold](https://wubulon.tailfac9f9.ts.net:4174/examples/instrument-import/?program=sample-hold) use public authoring and UI packages. The importer offers all 29 programs alongside Oscillator/Main Wave. Its source is [`examples/instrument-consumer`](../../examples/instrument-consumer/src.js).

### What changed in the running system

- Authored controls can stage a synchronous `session.transaction(graph => …)`. Structural changes are prepared off the callback and committed after host acknowledgement. Inactive controls without a DSP node retain their amount in authored state. Rejected candidates preserve the accepted graph, source and revision.
- FX selection creates the Width primitive and its gate only on first use. A synchronous `reconcile(graph, previous)` source hook recreates selected/visited factories on source edits and recall, preserving per-slot/per-effect amounts. There is no new fixed FX-slot audio engine.
- Noise, slew, sample/hold, comparator, range, ring and modulated SVF have compatible state transfer and actual kernel target readback. The browser no longer substitutes unavailable readback with defaults.
- Input switching and Stop no longer disconnect the same source twice. The shared creator UI fix also applies to Filter, Oscillator and Main Wave.
- EQ8 carries its bounded coefficients, filter and smoothing state; WaveShaper and original Filter carry their bounded tone/filter state by matching identity and sample rate. The existing numeric ABI codes 37/39 now have public names `wave-shaper` and `legacy-filter`; Rust/JS catalogs are generated together. Legacy WaveShaper tone factor is edited in source and is not a claim of FIR oversampling.
- Native bookkeeping-only acceptance is restricted to validated live-creator control values and compatible event state. Structural/audio mutations still need publication.

## Actual review evidence

### Live program switching

The picker now prepares and publishes the selected program in the **same running
host**, with no page reload or audio restart. It drains pending gestures before
retiring their parameter paths. Each program retains its accepted source/controls;
unapplied editor drafts survive picker changes within the page. Generator/effect
switches retain the external input source for reuse. Undo restores program identity
alongside its graph. A rejected preparation keeps the current program and audio.

[Actual BB switching review](https://wubulon.tailfac9f9.ts.net:4174/primitive-delivery/2026-10-02/program-switching/report.json)
traversed all 29 programs with real picker keyboard events, retained/egui views
and measured audio in one session. Host, output MediaStream and agent project ID
stayed identical while publication counters advanced. Returning to an edited
program retained its cutoff and editor draft; undo restored the picker; a saved
Granulator graph rejected by prepared execution left the current graph, source,
revision and sounding output intact. [Recorded live-switch output excerpt](https://wubulon.tailfac9f9.ts.net:4174/primitive-delivery/2026-10-02/program-switching/live-output.ogg).
This establishes a running session through selection, not a measured guarantee
of click-free or glitch-free transitions between different sounds. All 85 web
tests and the production build passed; the added gesture test probes retirement
while a newer pointer target awaits acknowledgement.

[Browser library review](https://wubulon.tailfac9f9.ts.net:4174/primitive-delivery/2026-10-02/browser/library-report.json): all 29 programs started in BB's real browser, produced measured nonzero output, accepted a source edit while running, displayed egui, stopped cleanly and recalled source on reload. ADSR used its actual retained Gate control. These reviews used a private AudioContext sink, leaving physical outputs untouched.

[Interactive FX review](https://wubulon.tailfac9f9.ts.net:4174/primitive-delivery/2026-10-02/browser/report.json): actual retained lazy selection, actual egui amount edits, highlighted editor Apply and external HTTP agent source edits against the same running runtime. Stereo RMS changed from approximately `[0.18045, 0.18039]` at width 0.2 to `[0.38069, 0.37491]` at width 1.8 with master 0.55. Mono analysis alone would conceal this width change. [Recorded browser output excerpt](https://wubulon.tailfac9f9.ts.net:4174/primitive-delivery/2026-10-02/browser/live-fx-slots-excerpt.ogg).

[Native UI/audio video](https://wubulon.tailfac9f9.ts.net:4174/primitive-delivery/2026-10-02/native-r2/live-native.mp4) and [native report](https://wubulon.tailfac9f9.ts.net:4174/primitive-delivery/2026-10-02/native-r2/report.json): actual optimized egui application, lazy Width selection, stored inactive amount, agent source edit, saved portable package and recorded output on a verified private Pulse sink. Isolated Xvfb preserved the user's desktop focus. Native pointer/UI recordings also cover [EQ](https://wubulon.tailfac9f9.ts.net:4174/primitive-delivery/2026-10-02/native-r2/eq8/live-native.mp4), [WaveShaper](https://wubulon.tailfac9f9.ts.net:4174/primitive-delivery/2026-10-02/native-r2/wave-shaper/live-native.mp4) and [original Filter](https://wubulon.tailfac9f9.ts.net:4174/primitive-delivery/2026-10-02/native-r2/legacy-filter/live-native.mp4), with accepted knob changes, agent source edits, portable saves and nonzero recorded audio. Other programs have native signal/source/recall tests, not individually recorded native pointer reviews.

[Download Linux native library r2](https://wubulon.tailfac9f9.ts.net:4174/primitive-delivery/2026-10-02/Manifold-DSP-library-linux-x86_64-r2.tgz), containing the exact reviewed executable, all 29 packages, complete editable source bodies, reviewed saved FX state and evidence. Run `./manifold-app primitives/fx-slots.manifold.json` or select another package. Archive SHA256: `04347d60ee53c8f54883d976e0954be05a4ecb53461b93bfabb1299175f42b87`. Executable SHA256: `45fe9db19f9a18a0855091ea18dcfafbeed320378db3af251130b7a4481f6ba2`. Adjacent JSON lists every packaged file hash. The earlier 25-program r1 and instrument/Filter archives remain immutable.

### Verification and limits

- Native QuickJS plus core tests execute every public program, verify finite nonzero sound, source edits and cold recall. An anti-phase stereo fixture tests Width's actual cancellation/restoration.
- Thirteen CV/noise/ring/EQ/mixer/FX compositions match uninterrupted references across source publication: next-sample error below 1e-6, followed by ten exactly matching blocks. This is compatible-history evidence, not a general glitch-free browser/DAW guarantee.
- Rejected structural edits/cycles retain the accepted runtime. Lazy creation and inactive memory persist through source edits and cold recall.
- Core library: 241 tests passed. Browser/package suite: 84 tests passed. Regular and prepared Wasm builds, production web build and independent importer build passed. `cargo test --workspace -- --test-threads=1` passed; the earlier parallel run had one scripted Sample CLAP timeout. Retain that failure in scratch logs rather than presenting the first run as successful.
- The 390-pixel browser review shows retained and egui layouts without horizontal overflow; this is not an iOS hardware review. Full original C++/Rust/Wasm comparison, sustained deadline reliability, all native/DAW primitive interactions, hardware MIDI, mobile hardware review, sample resources, arbitrary device I/O and complete product parity remain open. Measured allocator counters are bounded observations.

## Public graph contract coverage

**30 of 43 current public kinds appear in the 29 programs.** This measures current graph-contract coverage only. It is not a percentage of the complete port. Compatibility kernels (`main-voice-bank`, `effect-slot-legacy`, `voice-synth`) must not replace user-authored Main/FX/instrument composition.

| Public kind | Live program(s) or remaining work |
|---|---|
| `adsr` | `adsr` |
| `attenuverter-bias` | `attenuverter` |
| `audio-fm` | **Open** |
| `audio-sync` | **Open** |
| `crossfader` | `crossfader` |
| `cv-compare` | `compare` |
| `cv-mix` | `cv-mix` |
| `cv-range` | `range` |
| `distortion` | `distortion` |
| `effect-slot-legacy` | **Open** |
| `eq8` | `eq8` |
| `extended-oscillator` | `extended-oscillator` |
| `fixed-gain` | `fixed-gain` |
| `gain` | `default`, `fx-slots`, `gain` |
| `granulator` | **Open** |
| `input.raw` | Common boundary in all 29 programs |
| `input.sidechain` | **Open** |
| `legacy-filter` | `legacy-filter` |
| `lfo` | `lfo-gain`, `cv-slew`, `attenuverter`, `sample-hold`, `cv-mix`, `compare`, `range`, `cv-filter` |
| `loop-capture` | **Open** |
| `main-voice-bank` | **Open** |
| `midi-input` | **Open** |
| `midi-transpose` | **Open** |
| `mixer` | `mixer` |
| `mixer9` | `mixer9` |
| `modulated-gain` | `lfo-gain`, `cv-slew`, `attenuverter`, `sample-hold`, `cv-mix`, `compare`, `range` |
| `modulated-svf` | `cv-filter` |
| `noise` | `noise` |
| `oscillator` | `oscillator`, `adsr`, `crossfader`, `sum`, `mixer`, `cv-slew`, `attenuverter`, `sample-hold`, `cv-mix`, `compare`, `range`, `ring` |
| `output` | Common boundary in all 29 programs |
| `phase-vocoder` | `phase-vocoder` |
| `pulse-oscillator` | `pulse` |
| `retrospective-capture` | **Open** |
| `ring-modulator` | `ring` |
| `sample-hold` | `sample-hold` |
| `sample-instrument` | **Open** |
| `sample-region` | **Open** |
| `slew-control` | `cv-slew` |
| `stereo-widener` | `default`, `width` |
| `sum2` | `fx-slots`, `sum` |
| `svf` | `svf` |
| `voice-synth` | **Open** |
| `wave-shaper` | `wave-shaper` |

## Legacy binding inventory

The read-only reference's `manifold/primitives/scripting/dsp_host/DSPHostBindingsCore.cpp`, `DSPHostBindingsSynth.cpp` and `DSPHostBindingsFx.cpp` register **53 active DSP classes** after excluding comments. The commented PitchDetector constructor is not counted. This inventory is broader than the current 43-kind graph contract and narrower than all original Lua services. Control subscriptions, endpoint/UI bindings, MIDI services, resources and host lifecycle must also be transcribed where used.

| Active legacy class | Binding source |
|---|---|
| `AllpassNode` | DSPHostBindingsFx.cpp |
| `AudioFmNode` | DSPHostBindingsFx.cpp |
| `AudioSyncNode` | DSPHostBindingsFx.cpp |
| `BitCrusherNode` | DSPHostBindingsFx.cpp |
| `ChorusNode` | DSPHostBindingsFx.cpp |
| `CombNode` | DSPHostBindingsFx.cpp |
| `CompressorNode` | DSPHostBindingsFx.cpp |
| `ConstantSignalNode` | DSPHostBindingsFx.cpp |
| `CrossfaderNode` | DSPHostBindingsFx.cpp |
| `DistortionNode` | DSPHostBindingsFx.cpp |
| `EQ8Node` | DSPHostBindingsFx.cpp |
| `EQNode` | DSPHostBindingsFx.cpp |
| `EnvelopeFollowerNode` | DSPHostBindingsFx.cpp |
| `FilterNode` | DSPHostBindingsFx.cpp |
| `FormantFilterNode` | DSPHostBindingsFx.cpp |
| `ForwardCommitSchedulerNode` | DSPHostBindingsCore.cpp |
| `FrequencyShiftNode` | DSPHostBindingsFx.cpp |
| `GainNode` | DSPHostBindingsCore.cpp |
| `GranulatorNode` | DSPHostBindingsFx.cpp |
| `LimiterNode` | DSPHostBindingsFx.cpp |
| `LoopPlaybackNode` | DSPHostBindingsCore.cpp |
| `MSDecoderNode` | DSPHostBindingsFx.cpp |
| `MSEncoderNode` | DSPHostBindingsFx.cpp |
| `MixerNode` | DSPHostBindingsFx.cpp |
| `MultitapDelayNode` | DSPHostBindingsFx.cpp |
| `NoiseGeneratorNode` | DSPHostBindingsFx.cpp |
| `OscillatorNode` | DSPHostBindingsSynth.cpp |
| `PassthroughNode` | DSPHostBindingsCore.cpp |
| `PhaseVocoderNode` | DSPHostBindingsFx.cpp |
| `PhaserNode` | DSPHostBindingsFx.cpp |
| `PitchShifterNode` | DSPHostBindingsFx.cpp |
| `PlaybackStateGateNode` | DSPHostBindingsCore.cpp |
| `PlayheadNode` | DSPHostBindingsCore.cpp |
| `QuantizerNode` | DSPHostBindingsCore.cpp |
| `RecordModePolicyNode` | DSPHostBindingsCore.cpp |
| `RecordStateNode` | DSPHostBindingsCore.cpp |
| `ResonatorNode` | DSPHostBindingsFx.cpp |
| `RetrospectiveCaptureNode` | DSPHostBindingsCore.cpp |
| `ReverbNode` | DSPHostBindingsFx.cpp |
| `ReverseDelayNode` | DSPHostBindingsFx.cpp |
| `RingModulatorNode` | DSPHostBindingsFx.cpp |
| `SVFNode` | DSPHostBindingsFx.cpp |
| `SampleRegionPlaybackNode` | DSPHostBindingsCore.cpp |
| `ShimmerNode` | DSPHostBindingsFx.cpp |
| `SineBankNode` | DSPHostBindingsSynth.cpp |
| `SlewLimiterNode` | DSPHostBindingsFx.cpp |
| `SpectrumAnalyzerNode` | DSPHostBindingsFx.cpp |
| `StereoDelayNode` | DSPHostBindingsFx.cpp |
| `StereoWidenerNode` | DSPHostBindingsFx.cpp |
| `StutterNode` | DSPHostBindingsFx.cpp |
| `TransientShaperNode` | DSPHostBindingsFx.cpp |
| `TransportStateNode` | DSPHostBindingsCore.cpp |
| `WaveShaperNode` | DSPHostBindingsFx.cpp |

## Reusable modules and complete factory behavior still open

All 19 original rack modules remain product-face integration gates: `rack_oscillator`, `rack_sample`, `blend_simple`, `filter`, `fx`, `eq`, `adsr`, `arp`, `transpose`, `velocity_mapper`, `scale_quantizer`, `note_filter`, `lfo`, `slew`, `sample_hold`, `compare`, `cv_mix`, `attenuverter_bias`, `range_mapper`. Existing primitives are useful building blocks. Complete original module binding paths, face layout, live meters, cables, dynamic instances and behavior require visible delivery separately.

The original 21 FX factories remain the catalog queue: Chorus, Phaser, **WaveShaper**, Compressor, StereoWidener, legacy Filter, Reverb, StereoDelay, MultitapDelay, PitchShift, Granulator, RingMod, SVF, Formant, EQ, Limiter, Transient, Bitcrusher, Shimmer, ReverseDelay and Stutter. Distortion is a separate primitive from WaveShaper; legacy Filter and SVF are also separate. The new Gain/Width harness proves lazy authored mechanics, not the complete factory set, normalized mappings, tails/reset rules, per-effect memory or original XY face.

## Host services: Ableton Link and OSC/OSCQuery remain open

Audited 2 October 2026 following Lucas's explicit reminder. At that initial audit, neither Ableton Link
nor OSC/OSCQuery had a service implementation or dependency in v2.
The subsequent [usable service delivery](network-services-delivery.md) adds basic
support; full legacy and DAW/transport gates below remain open. `HostBarClock` in `crates/manifold-native/src/host_transport.rs` supplies
DAW tempo/meter-derived capture windows; it is not a Link session. HTTP agent
controls and authored endpoint paths are useful substrate, not OSC or OSCQuery.
Oscillator identifiers containing `OSC` do not count as protocol support.

| Service | Legacy behavior to recover | Visible acceptance evidence |
|---|---|---|
| Ableton Link | Enable/disable, peer count, tempo, beat/phase, quantum, play state, tempo sync and optional start/stop sync, requests for tempo/start/stop, beat/sample conversions and next beat/bar timing. Reference `manifold/primitives/sync/LinkSync.{h,cpp}`, `manifold/core/LinkSupport.h`, `LuaLinkBindings.cpp` and `LinkSupportContractHarness.cpp`. | Live creator controls/status and script API; an actual external Link peer changes the same sounding graph's timing; quantized scheduling across source edits; disconnect/rejoin and save/reopen behavior. Record the external peer and audio together. |
| OSC | UDP input/output, targets, message subscriptions, authored endpoint registration, settings/status and persisted configuration. Reference `manifold/primitives/control/OSCServer.{h,cpp}`, `OSCEndpointRegistry.{h,cpp}`, `OSCSettingsPersistence.{h,cpp}`, `LuaOSCBindings.cpp` and their headless contract harnesses. | An actual external OSC sender changes a live control with retained/egui readback and audible effect; Manifold sends accepted values to an external receiver; source edits update the endpoint set and retire obsolete subscriptions; settings and targets reopen correctly. |
| OSCQuery | Endpoint discovery, types/current values, dynamic query handlers and notifications. Reference `manifold/primitives/control/OSCQuery.{h,cpp}`, `ControlServer.{h,cpp}` and the corresponding contract harnesses. | An actual client discovers the authored endpoint tree and observes accepted values and changes after human, agent and OSC edits, including graph replacement and reopen. |

Proposed integration constraints, to resolve with the transport/control slices:

- Use the same public authoring contract in Rust and JS/TS. Network mutations go
  through the same validated, acknowledged runtime as human and agent edits;
  do not create another parameter bank or audio owner.
- Define explicit local/DAW/Link clock selection and one coherent transport
  snapshot for graph schedulers. Link beat/phase is not a UI-polled audio clock.
  Follow the Link SDK's documented realtime capture/commit rules with timestamps
  tied to the audio timeline. Networking and general script execution stay off
  the audio callback.
- Host network services outside DSP kernels. Native standalone and plug-in hosts
  should share adapters with explicit availability/lifecycle. The proposed browser
  path is an optional native service bridge exposing the same contract and clear
  capability status; a browser build alone does not close native networking gates.
- Deliver enable/settings/peer/status controls in the actual creator UI, using
  retained and egui presentation where appropriate. Keep ports, targets and
  authored subscriptions inspectable and editable by humans and agents.
- Recover these services alongside transport/quantization/loop and endpoint
  transcription. They are already in R09 and the vertical delivery plan; they
  must not be deferred until after every product is assembled.

The [service delivery](network-services-delivery.md) now supplies real external
interoperability and interaction evidence. Leave full legacy parity, quantized
clock integration and DAW service adapters open.

## Basic networking: added scope

Lucas requested basic networking on 2 October 2026, including TCP/UDP bindings
or an integrating demo. A [usable first delivery](network-services-delivery.md) now
provides native Rust workers, public JS/TS bridge bindings and an authored native/
browser example. Direct imperative QuickJS host injection remains open. Existing HTTP agent endpoints are
not evidence of those bindings. Keep this scope small and build on established
host networking libraries rather than implementing socket protocols ourselves.

Proposed first delivery:

- A public host service for TCP connect/listen/accept, stream read/write and close;
  UDP bind/send/receive and close; peer address, status and explicit error events.
  Rust can use standard [`std::net`](https://doc.rust-lang.org/std/net/index.html)
  primitives in a host worker. JS/TS uses typed host bindings with asynchronous
  operations and binary payloads. Blocking operations never run on the audio or
  UI thread. Exact public signatures remain a design deliverable.
- Preserve transport semantics: TCP reads are byte-stream chunks, not messages;
  the example must define framing and handle split/coalesced frames. UDP retains
  datagram boundaries and source address without claiming reliable delivery.
  Bound payloads and pending work; expose overload/backpressure outcomes.
- Scope sockets and subscriptions to the running project, with explicit cleanup
  on close, replacement and failure. Define source hot-reload behavior so old
  handlers cannot keep changing a replaced project. Persist endpoint/settings
  intent, not operating-system handles or live connections.
- Browser projects may use standard HTTP/WebSocket APIs. The proposed route for
  native TCP/UDP is the same optional host bridge as OSC, with capabilities
  reported explicitly. WebSocket is its own protocol and does not imply arbitrary
  TCP/UDP access. See [browser WebSocket API](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API).
- Add an editable DspLiveScripting networking program: an external controller
  sends framed TCP and UDP control data; authored JS maps it to a parameter on
  the same sounding graph and sends accepted values back. Humans and agents can
  inspect/change the mapping live. Retained/egui show connection status, traffic
  and accepted controls, with save/reopen and independent importing.

Acceptance requires a usable native build and bridged browser example, actual
external TCP/UDP peers, audible parameter changes, response payloads and recorded
UI/audio evidence. Exercise disconnect/reconnect, source edits, framing and
project close against those live interactions. A socket echo fixture alone does
not close this row. Deliver alongside OSC/endpoint services; reuse host network
facilities where sensible while keeping OSC and Link protocol behavior explicit.
Network audio streaming and distributed DSP are not requested by this addition.

## Next work, in order

1. Transcribe individual missing FX primitives with complete parameter paths and editable faces, actual sounding prepared publication/history/readback, public importing and native packages. WaveShaper, original Filter and EQ8 now have individual programs and reviewed native controls. Continue the remaining factory primitives without routing them through the fixed compatibility slot.
2. Complete remaining public kinds: FM/sync, MIDI I/O/transpose, Sample Region/Instrument, Granulator, Loop/Retrospective Capture and explicit sidechain/I/O programs. Show resources/events in the actual creator UI and save their real state. Buffer-owning histories must move off callback without vector cloning there.
3. Recover remaining legacy utility DSP nodes and script services, including transport/quantization/record policies, Ableton Link, OSC/OSCQuery, basic TCP/UDP networking, analysis/meters, gates, playheads, constant signals and mid/side nodes. Deliver the host-service slices above alongside their consuming nodes. Audit original project usage before choosing their public API.
4. Put each original reusable module face, binding and meter into the live environment, including typed audio/CV/MIDI connections and agent authoring. Use the same acknowledged public contract for Rust and JS/TS.
5. Assemble individual instruments/effects and larger Main/MidiSynth/loop/rack projects from those inspectable modules, then continue the remaining 28-project families. Preserve single authored graph ownership and identical browser/native/DAW behavior.
6. Close the matched historical audio/timing and C++/Rust/Wasm performance gates alongside usable releases. Do not infer completion from builds or backend fixtures.

Each row needs authored source, live controls, sound, save/reopen, independent import and native delivery with reviewable evidence. Advance substantive visible work; do not trade product delivery for increasingly granular validation.
