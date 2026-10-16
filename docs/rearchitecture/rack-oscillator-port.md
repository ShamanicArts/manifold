# Rack oscillator port ledger

Source of behavior: read-only `my-plugin/UserScripts/projects/Main/lib/rack_modules/oscillator.lua`, `lib/parameter_binder.lua`, and `dsp/core/nodes/OscillatorNode.cpp`. The module is selected at RackModuleHost index 1. No bespoke Rack DSP kernel should replace its authored graph.

## Historical graph and control contract

- Each oscillator slot has eight voice `OscillatorNode`s and a ninth manual `OscillatorNode`. All feed a nine-input mixer and a gain node. Default gain is `0.8 * 0.25 = 0.2`. Every oscillator starts at amplitude zero. Voice frequency starts at 220 Hz; manual starts at C4. Default waveform is saw, render mode standard, partials 8, tilt/drift/drive/detune/spread zero, pulse width 0.5, and unison 1.
- Slot controls broadcast to all nine oscillators: `waveform` 0–7, `renderMode` 0–1, `additivePartials` requested 1–32 (C++ clamps to 12), `additiveTilt` -1–1, `additiveDrift` 0–1, `drive` 0–20, `driveShape` 0–3, `driveBias` -1–1, `pulseWidth` .01–.99, `unison` 1–8, `detune` 0–100 cents, `spread` 0–1, and `output` 0–2 multiplied by .25.
- `manualPitch` 0–127 maps MIDI note to 20–8000 Hz; `manualLevel` 0–1 maps to amplitude 0–.4. Each voice has `gate` 0–1, `vOct` 0–127, `fm` -1–1 octave, and `pwCv` 0–1. Pitch uses `note + fm * 12`, width uses `basePulseWidth + pwCv - .5`, both clamped. A gate rising above .001 resets only that oscillator's phase. Voice level clamps to .4. The Lua controls remain project orchestration; the oscillator waveform and shaping belong to the reusable Rust primitive.
- Historical `OscillatorNode` supports eight standard waveforms, optional additive wave table rendering, four drive curves with bias and wet mix, eight unison voices with detune and stereo spread, smooth frequency/amplitude/render/unison changes, and sync input. Its standard noise branch calls `std::rand`, so exact sample parity needs a deterministic reference decision. The original v2 scalar oscillator had only waveforms 0–4 and 6; the extended primitive now covers the broader behavior described below.

## Acceptance ledger

| Behavior | Evidence required | State |
|---|---|
| Reusable standard waveform, pulse and drive primitive | native tests, generated catalog, live authored controls | Implemented; old C++ signal comparison open |
| Unison and stereo spread | native/Wasm stereo signal and live parameter probes | Four-voice fixture and 1–8 voice controls implemented; old C++ comparison open |
| Additive render | signal probes, browser controls, bounded callback cost | Prepared recipe and live controls implemented; old C++ signal comparison open |
| Nine-source graph as JS/TS authored module, saved controls | inspectable graph, browser build and native/Wasm fixture | Graph and 47 control paths built; full legacy state import open |
| Voice gate, vOct, FM, pulse CV and rising-gate phase reset | event sequence and audio across block boundaries | Wasm block sequence and live browser gesture implemented; timed MIDI assignment open |
| Selection 1 in RackModuleHost | save/reopen, module switch, native host and browser | Implemented for authored graph; old state import open |
| Matched old C++ / new Rust native / Wasm cost | same sample rate, block size, graph and input | Open |

The [combined RackModuleHost factory](../../packages/manifold-author/examples/rack-module-host.mjs) now places the authored nine-source module at selection 1. The other sine/saw source in the rack audition is still its separate input bus. Selection 1 and manual controls work in the live browser; full historical voice-event and sync parity remains open.

## 2026-09-29 standard render checkpoint

The separate `extended-oscillator` ABI type preserves existing `oscillator` projects' three-parameter contract. It uses the reusable Rust oscillator kernel and now exposes standard waveforms 0–7, sync, pulse width and the historical drive/shape/bias/mix transfer. Standard noise uses a fixed PRNG seed to make native/Wasm rendering reproducible, unlike the platform-dependent C++ `std::rand` branch. The public `mixer9` primitive connects eight silent voice oscillators and one silent manual oscillator in the authored [rack oscillator module](../../packages/manifold-author/examples/rack-oscillator.mjs). The script owns the old paths for waveform, drive, manual level/pitch, and voice gate, pitch, FM and pulse CV. The reusable oscillator's `retrigger on level rise` setting is enabled for the eight voice nodes and disabled for the manual node.

The [live page](../../web/rack-oscillator.html) accepted waveform 7, drive 9/fold, unison 4, detune 60 cents, and spread 1 across all nine nodes, plus manual level .7, voice 1 pitch 67 and gate .5. The browser stream was verified on a private null sink and the screenshot is [here](evidence/web-rack-oscillator-live.png). The saved [one-voice](../../projects/graph-workspace/authored-rack-oscillator-manual.json) and [four-voice](../../projects/graph-workspace/authored-rack-oscillator-unison.json) fixtures emit audio through the same authored graph on native and Wasm. The respective offline [one-voice](evidence/2026-09-29-rack-oscillator-native-wasm.json) and [four-voice](evidence/2026-09-29-rack-oscillator-unison-native-wasm.json) reports at 48 kHz/128 frames measured median p50 about 43/51 µs and 170/201 µs native/Wasm. Native and Wasm four-voice checkpoints and output checksums agree to the displayed precision. These are neither old C++ comparisons nor actual browser/DAW callback timing. Full Rust workspace tests and 27 web tests passed.

Native/Wasm parity first failed for the four-voice fixture because native activation reset the oscillator to the authored detune and spread targets while Wasm started smoothing from defaults. Both paths now settle parameters authored before the first frame and smooth later live edits. The one-voice path has a direct stereo fast path, preserving the cost and signal of the prior scalar oscillator when unison is inactive.

## 2026-09-29 additive checkpoint

The `extended-oscillator` now also offers standard/additive mode, requested partials 1–32 (the historical C++ kernel caps at 12), tilt -1–1, and drift 0–1. Its [prepared recipe](../../crates/manifold-core/src/extended_additive.rs) computes fixed partial coefficients on control edits and interpolates a preallocated sine table during rendering. It covers all eight waveform recipes and caps effective additive unison at three voices, remapping extra requested voices to detune and spread as in the historical kernel. The direct recipe remains a native test oracle; the prepared renderer stays within 0.015 sample amplitude of it in all eight waveforms over the tested phases and frequencies. The original C++ uses quantized full waveform tables, so precise C++ signal parity remains unproven.

The first direct recipe took about 3.23 ms median in Wasm for a 2.67 ms block and missed every measured deadline. The prepared [one active oscillator](evidence/2026-09-29-rack-oscillator-additive-native-wasm.json) and [eight active voices](evidence/2026-09-29-rack-oscillator-additive-eight-native-wasm.json) now measure about 0.31 ms Wasm median and 0.48 ms native median; native/Wasm output checksums agree within the 0.1% gate. Wasm reported no deadline misses in those offline runs. One native block reached 3.02 ms in the eight-voice run amid other maximum blocks below 1.14 ms; actual browser and DAW scheduling still need measurement. The eight-voice fixture requests unison 8 to exercise the additive cap. Prepared data is boxed during graph compilation; this resolved a native host test stack overflow caused by inline recipe storage, and the full Rust workspace suite passes on its normal stack.

The [live browser build](../../web/rack-oscillator.html) accepted additive mode, 12 partials, tilt 0.3 and drift 0.2 while audio ran on a verified private null sink. The updated [screenshot](evidence/web-rack-oscillator-live.png) shows those saved controls. RackModuleHost selection 1 now reuses this factory and has its own [live capture](evidence/web-rack-module-host-oscillator-live.png), [portable snapshot](../../projects/graph-workspace/authored-rack-module-host-oscillator.json), and [native/Wasm timing](evidence/2026-09-29-rack-module-host-oscillator-native-wasm.json). Old project state import, native editor orchestration, complete voice event and sync behavior, and matched C++ measurements remain open.

## 2026-09-29 voice control checkpoint

The [Wasm signal probe](../../web/tests/rack-oscillator-signal.test.js) drives the public JS oscillator module across audio blocks. With a sine voice it confirms silence before gate, a phase-restarted attack after release, a settled frequency change from 440 to 880 Hz through the `fm` path, and the saved derived 880 Hz primitive parameter. With the full RackModuleHost selection 1 graph, it confirms that `pwCv` changes a pulse voice's audible duty cycle from about 50% to 75% and saves the primitive width. It prepares the graph as patchable so inactive Rack branches remain available for later route edits.

The [live combined page](../../web/rack-filter-eq.html) now exposes voice 1 gate, pitch, FM, and pulse CV. A browser run selected Oscillator, edited all four controls, switched to Filter and back, and saved the returned voice state. Its [screenshot](evidence/web-rack-module-host-voice-live.png) shows the selected route and controls. The new Chromium stream went to private null sink 149569 with no new H6 stream; the sink was removed. The reproducible [voice snapshot](../../projects/graph-workspace/authored-rack-module-host-voice.json), generated by [this script](../../scripts/author-rack-module-host-voice.mjs), selects pulse, MIDI 69 plus six semitones of FM, width 0.75, and gate 0.4. Its [offline native/Wasm report](evidence/2026-09-29-rack-module-host-voice-native-wasm.json) shows identical output checksums and median 48.11/55.80 µs per 128-frame block at 48 kHz, with no measured deadline misses. This does not yet prove old C++ sample parity, sample-timed voice event delivery, or native editor execution of JS project logic.

## 2026-09-30 live prepared runtime checkpoint

Change `pwukokyz`, parent `ovmlsmmn fca79f5e`. The existing public Rack composer
now supplies structural replacement and actual accepted DSP readback adapters
to its LiveGraphSession. No new Rack audio kernel was introduced. The browser
host's opt-in prepared mode adds scalar/extended/pulse Oscillator, LFO,
Modulated Gain and Mixer9 to the prior eight kinds. It rejects unsupported
resources and timed MIDI. Its old asynchronous Worker mode still transfers
only Gain/Widener records; these wider history claims apply to the prepared
handle path and native core direct transfer.

The [live page](https://wubulon.tailfac9f9.ts.net:4174/rack-oscillator.html?execution=prepared)
uses the old nine-source graph and controls. Start, raise Manual level, change
waveform/unison/additive controls, then toggle the live Distortion insert.
Both retained recordings and their saved graph are available on the same page.
[Screenshot](evidence/2026-09-30-prepared-rack-oscillator.png).

Oscillator transfer copies phase, current frequency/amplitude, sync-edge
history, deterministic RNG state, all unison phases/gains/layout, current
detune/spread and render mix. It keeps candidate controls and its independently
prepared additive recipe. LFO transfers phase. Modulated Gain, Mixer and
Distortion transfer their bounded smoothing history. The native plan rejects
history transfer across sample rates. No vectors or recipes are created or
freed at publication; Mixer copies into its already prepared arrays.

The native signal test compares renamed graphs with continuing graphs across
all eight waveforms, eight-to-three unison changes, additive-to-standard
transitions, pitch/level/LFO-rate changes, mixer pan/master changes and
Distortion drive changes. Continued output is exactly equal for five blocks;
an empty identity map gives different output. Workspace tests: **482 passed**.
Web tests: **56 passed**. Shared Wasm and production builds passed.

The [real AudioWorklet probe](../../scripts/verify-prepared-rack-oscillator.mjs)
first drives the actual creator controls and inserts an audible Distortion.
It then starts two synchronized authored Rack graphs from a suspended context,
with a manual voice, gated voice, four requested unison voices, additive mode,
detune 23 and spread 0.7. Only the first graph undergoes twelve transparent
Distortion insert/remove transactions. Across **81,536 stereo frames**
(1.6987 seconds), its PCM matches the untouched reference exactly:
**zero differing samples**, RMS 0.011162, zero zero-output blocks.
Each edit transfers eleven histories (nine oscillators, Mixer, Gain). Both
hosts render 637 Rust blocks, with zero processing failures and zero Rust
allocator/deallocator calls inside `process()`. Total edit times are
23.135–34.435 ms. No compiler Workers remain after close; no page errors occur.
[Raw evidence](evidence/2026-09-30-prepared-rack-oscillator.json) retains every
edit, accepted graph and ten source/Wasm hashes, with exact source artifacts
and both WAVs under `web/public/prepared-rack-oscillator/`.

This paired test deliberately uses a transparent insert to discriminate phase
and smoothing continuity. The separate UI gesture uses an audible insert.
It is not a long-duration deadline, CPU percentile, JS allocation, native DAW,
or C++ behavior comparison. New native/plug-in lifecycle measurements remain
open. LFO/Modulated Gain transfer is covered by the native signal test here;
this browser recording specifically covers the nine-source Rack graph.

A publication review then removed redundant setters for inherited targets
already installed by preparation. Without this check, the unchanged oscillator
recipe parameters rebuilt the same coefficients during every publication.
The [second retained run](evidence/2026-09-30-prepared-rack-oscillator-v2.json)
on that change again makes twelve edits: all **80,896 stereo frames** match
exactly, zero zero-output blocks, eleven histories per edit, and zero Rust
callback allocations/deallocations/failures. Both hosts process 632 blocks.
Total edit times are **17.025–37.095 ms**; this is not a proven latency speedup.
The live page loads these second recordings; the first pair remains retained.

The [later public lifecycle run](evidence/2026-09-30-public-prepared-runtime-v3.json)
also passes actual f32 adoption, newer automation during preparation, ID
renumbering, explicit candidate overrides, route changes, rejection/recovery,
cold/suspended edits and both close cases on the optimized binary. Both pairs'
WAV bytes match exactly, and all ten archived source/binary hashes per run
were checked after publication.
The [published deliverable check](evidence/2026-09-30-prepared-rack-deliverables.json)
loads both WAVs from the live HTTPS page, verifies their 1.685333-second duration
and paused state, document isolation and zero page errors. The
[live review screenshot](evidence/prepared-rack-live-review.png) shows the
current recording links.

An independent endpoint probe also reproduces and fixes out-of-range target
inheritance during structural preparation: a candidate narrows Gain maximum
from 2 to 0.5 while old-graph automation accepts 0.75. The old implementation
published 0.75 under the new range. The fixed implementation keeps the
candidate's 0.25 target, then rejects 0.75 without invalidating readback.
[Original failure](evidence/2026-09-30-prepared-endpoint-inheritance-before.json),
[fixed result](evidence/2026-09-30-prepared-endpoint-inheritance.json). Inheritance
now requires equal old/new effective parameter bounds, matching native policy.

Next: timed note/voice orchestration and reusable resource-bearing graph
publication (Sample/capture/loops), then complete Main composition through
these primitives. Old state import, C++ oscillator/table parity, full Rack
module lifecycle and egui remain open.

### Next implementation task

Add timed events to the public prepared handle path and preserve eligible
voices across structural edits, then connect Sample/capture resources through
the same ownership protocol. Reuse `WorkletEngine.events` (already prepared
with capacity 256) and `process_engine`; do not build a second event/DSP engine.
The existing thread-local `manifold_event_push` cannot target an owned prepared
handle. Its next-block offset is currently checked against capacity 2048,
whereas the browser renders 128 frames and clears events after each block:
reject or explicitly schedule future offsets rather than silently dropping
them. Resolve accepted events to the correct stable instance/publication, keep
ordering and capacity bounded, and distinguish admitted from rendered events.

Prove held notes and release through insert/remove and ID renumbering, rejected
edits, pitch bend, exact onset offsets, queue overflow and closure in real
AudioWorklet PCM. Add actual kernel target getters and array-state transfer
for any supported voice primitive. The existing compact `VoiceSynth` is a
reusable baseline, not the full Main/Rack synth port; use legacy project
orchestration and voice contracts when migrating those products. Resource
continuity must swap prepared storage so neither old nor unused candidate
buffers are destroyed in the callback. Preserve Sample asset identity and
capture/loop cursors, then compare the actual old projects and native hosts.
