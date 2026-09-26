# Manifold primitive workbench roadmap

Status: waves 0–1 have interactive SVF, Crossfader, and Mixer views with C++ parity fixtures; wave 2 has a timed-event eight voice baseline and a separate standard-waveform Oscillator, patchable ADSR, and NoiseGenerator with C++ parity, plus an authored oscillator/noise → ADSR → SVF synth patch with native Rust/Wasm comparison. Wave 3 has typed control ports, a Rust LFO, sample-rate CV routed into the synth patch filter, and the original EnvelopeFollower's peak/RMS/hybrid meter. A second typed `EnvelopeControl` node now drives an authored gain-ducking graph at sample rate. Wave 4 has scalar Distortion, Compressor, and StereoDelay, an authored FX chain, and a Standalone FX slot slice for type IDs 3, 6, and 8; 18 types and exact project-level parity remain. Wave 5 has bounded stereo loop capture; file-backed sample regions and the old eight-voice Standalone Sample project remain. Wave 6 has begun with the original SpectrumAnalyzer's eight-band meter and bounded worklet readout; true FFT, pitch analysis, and media services remain. The delay ring-buffer port includes an intentional fix for the original wrap-position spike; see checkpoint 13. Optional browser MIDI note input is available where permission is granted; the in-app browser may block it. Source of truth for legacy behavior remains `/home/shamanic/dev/my-plugin`; the v2 implementation lives here.

## Purpose

Make each port inspectable as a small browser instrument: manipulate a primitive, hear it, see its useful measurements, and compare the same deterministic case with the old C++/JUCE implementation. The workbench is a development surface and the beginning of the eventual project UI component library. It must not become part of the audio callback.

The current Standalone Filter page proves the Rust/Wasm AudioWorklet path, but its large hero, decorative frequency bars, implementation copy, and oversized cards make it poor for comparing behavior. Replace that page with a compact task surface. The main reading order is: **project and signal path → controls → useful output → reference comparison**. A scope, filter response, spectrum, meter, or event timeline earns its place by answering a specific question; a visual effect does not.

At seventeen views, navigation has a direct primitive picker on both layouts. The desktop library scrolls within its own panel so choosing a lower item keeps the selected workbench in view. On narrow screens the picker replaces the long list above the active view. Selection updates the URL and browser history as well as the module and reference case, making individual checkpoints directly reviewable.

## Visual and interaction vocabulary to translate

These are cues from the Lua widget implementation, not pixel dimensions to copy into the browser. Preserve keyboard access, focus states, readable text, and comfortable pointer targets.

| Legacy reference | Web component | Why it matters |
| --- | --- | --- |
| `manifold/ui/widgets/slider.lua` and `Main/ui/components/filter.ui.lua` | Compact filled slider with label and value inside, optional bipolar centre, typed value, reset to default | Dense parameter editing with immediate numerical feedback. The old widget also distinguishes authored/base and effective/modulated values. |
| `Main/lib/ui/modulation_widget_sync.lua` | Base/effective overlay and modulation source indicator | Makes modulation legible before we add routable CV. The base value remains editable while the effective value moves. |
| `Main/ui/components/rack_oscillator.ui.lua` | Compact tabs, waveform choice, small curve view, port labels | Reusable synth controls and explicit signal types without an arbitrary card grid. |
| `Main/ui/components/envelope.ui.lua` | ADSR curve above four compact controls | The plot explains the parameters and provides an obvious visual comparison with the C++ envelope. |
| `Main/ui/components/patchbay_panel.lua` | Typed audio/CV/MIDI/event ports and a restrained connection view | Makes routing, disconnected states, and graph tests visible. Preserve the signal-type distinction, simplify the ornamental 3D socket treatment. |
| `Main/ui/components/keyboard.ui.lua` and synth views | Small playable keyboard and MIDI event monitor | Manual voice tests and inspection of note on/off, pitch, velocity, and timing. |
| `Standalone_Filter/ui/main.ui.lua` and `Main/ui/components/filter.ui.lua` | Project panel with filter mode and response graph | A directly comparable first artifact that still feels related to old Manifold. |

The coloured rack accent strips in `midisynth_view.ui.lua` and `rack_module_shell.ui.lua` explicitly say they are temporary debug visuals. Do not adopt them as a brand rule. Use a quiet, dense shell with a consistent type scale, dark layered surfaces where the instrument benefits from them, and colour for signal type or active state. Use Canvas/SVG for 2D measurements; reserve Three.js/WebGPU for projects with genuinely spatial or video content. Rendering reads bounded snapshots and may skip frames without changing DSP.

## Comparison contract

Existing legacy `DspNodeContractHarness` covers 56 node types and `GraphRuntimeContractHarness` covers graph behavior. Their golden JSON captures parameters and aggregate metrics, which is valuable but insufficient for diagnosing sample-level divergence. Add a narrow offline fixture exporter to the old checkout without changing its running plug-in. A versioned case specifies:

- primitive or small graph, channel layout, sample rate, block partition, reset and warmup points;
- deterministic input (silence, impulse, sine/multitone, seeded noise, and later MIDI/transport events);
- timed parameter changes in physical units and stable IDs;
- float32 output for both channels plus metadata: latency, peak, RMS, DC, tail, non-finite samples, and source revision.

Run the same case in native Rust and Rust/Wasm. The browser reads precomputed C++ output and renders aligned overlays, a difference trace, measured response, and C++/Rust/difference playback with a level-safe switch. The CLI comparison is the regression gate; the HTML view explains failures. Use measured tolerances per behavior, account for declared latency, and classify each mismatch as port bug, old implementation quirk, or intentional redesign. Never promote a legacy golden value to product truth solely because it is in a fixture. The old graph golden already contains surprisingly large continuity-case peaks that deserve investigation before being used as audio-quality targets.

## Sequence and unlocks

| Wave | Primitive and runtime work | Workbench view and comparison | Existing project unlocked |
| --- | --- | --- | --- |
| **0. Comparison foundation** | Case schema, C++ exporter, Rust native/Wasm offline runners; replace the filter demo shell | Compact slider, mode selector, scope, response, C++/Rust/difference switch. First SVF cases cover modes, sweeps, smoothing, reset, stereo, and block sizes. | Trustworthy **Standalone Filter** parity loop and reusable page skeleton. |
| **1. Signal and graph spine** | `Passthrough`, `ConstantSignal`, `Gain`, `Mixer`, `Crossfader`, existing `SVF`; typed audio ports, graph validation, input/monitor/output roles, prepared routing buffers, block-boundary plan changes | A small chain/branch view showing connected and silent routes; impulse and gain/routing cases; meter per port | Real filter and simple effect chains, then a foundation for **Standalone FX** and rack modules. This is the point where the single hardcoded filter becomes a project runtime. |
| **2. Voice and MIDI** | `Oscillator`, `NoiseGenerator`, `ADSREnvelope`, `MidiInput`, `MidiVoice`; note on/off events with within-block offsets, voice allocation and release. Then transpose, velocity mapping, note filtering, scale quantization, and arpeggiation | Keyboard, envelope curve, voice count, event timeline, waveform/spectrum; compare pitch, phase, note timing, voice stealing, and release tails | A playable **MIDI Synth** baseline, **Standalone Oscillator**, and the first meaningful subset of **VectorSynth**. |
| **3. Modulation and patching** | LFO, attenuverter/bias, slew, sample-and-hold, CV mix, envelope follower, typed CV connections, base/effective parameter values | Slider modulation overlay, XY control, compact patch view; compare CV scaling, bipolar zero, modulation timing, and graph updates | The authored **Main synth rack** becomes useful rather than a static sound chain; modulation-heavy VectorSynth patches follow. |
| **4. Effects and dynamics** | Distortion/WaveShaper, `FilterNode` (distinct from `SVF`), EQ, compressor/limiter, stereo delay, chorus, phaser, reverb | Effect-specific response/transfer plots, wet/dry and tail views; compare gain staging, latency, bypass, tails, and state reset | **Standalone EQ**, **Standalone FX**, fuller rack FX slots, and practical instrument presets. |
| **5. Time and sampling** | Capture/loop buffers, record state, playhead, loop playback, sample regions, transport and quantizer, then pitch shift/granulation | Waveform with playhead/region markers, record/overdub state, timing ruler; compare wraparound, loop boundaries, capture semantics, and tempo changes | **Standalone Sample**, sampler/looper projects, **GranularLab**; enough primitives for authored performance projects. |
| **6. Advanced analysis and media** | Pitch/spectrum analysis, phase vocoder, sine bank/resonators, video and ML services as separate workers | Analysis and media views only where a project uses them; explicit timing and resource budgets | **AVSampler**, video sampler and experimental projects without making media a prerequisite for core audio. |

Each wave ends with one playable legacy project slice, deterministic C++/Rust comparison cases, and a recorded decision for any intentional difference. Native plug-in packaging comes after the graph, event, parameter, and state contracts are stable enough to expose to a host. We can revise the wave order as the first comparison results reveal dependencies.

## First deliverable

Redesign the served Standalone Filter page as the workbench shell and add a C++ SVF output fixture. The page should show one compact module, its controls, input/output meter, filter response, scope, and a reference comparison drawer. A passing case must run through native Rust and Wasm; a deliberate parameter change must produce an understandable difference in both the automated report and the page. This tests the comparison method before scaling it to dozens of nodes.
