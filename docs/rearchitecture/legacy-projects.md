# Legacy project migration inventory

Baseline: 28 `manifold.project.json5` manifests under `/home/shamanic/dev/my-plugin/UserScripts/projects`, inspected 29 September 2026. Names and descriptions below come from those manifests. This table is an **audit queue**, not a parity claim. A v2 primitive or lookalike page is evidence to reuse, never automatic project completion. The old checkout stays read-only.

For **every** row, inventory its graph-building scripts, runtime graph mutations, control/event behavior, parameter and endpoint paths, resources, UI interactions, save/preset data, and host dependencies. Capture at least one actual old-project scenario for each distinct behavior. Record the corresponding v2 module/script/test, deliberate improvements, and missing behavior in a project-specific migration note. R00 in the [recovery plan](README.md) closes only when all 28 rows have that record. An unsupported behavior remains an open task unless the user explicitly approves its redesign or retirement.

| Legacy project | Behavior family to audit | Existing v2 starting point; project parity status |
| --- | --- | --- |
| Main | Looper + MidiSynth, dynamic rack, graph scripting, capture, transport, UI | [Live authored Wave/ADSR/shared Filter and Main signal branches](main-wave-live-delivery.md), retained/egui, importer and native builds. Looper, full MidiSynth, dynamic rack, transport and full scripted parity remain open. `MainInstrument` remains a reference. |
| DspLiveScripting | Live graph/script lifecycle, runtime parameters, retained graph UI | [29 editable sounding programs, highlighted editor, retained/egui, original default and lazy Gain/Width harness, browser/native/import evidence](primitive-transcription.md); **complete primitive/factory set, original module faces, endpoint/host parity open**. |
| RackModuleHost | Standalone hosting of Main rack modules | [Blend/Filter/FX/EQ authored graph slice](rack-module-host-port.md) now builds and switches four legacy module factories through public JS/Rust graph APIs; all four Blend modes plus both seven-mode inputs are live authored controls. Browser/native/CLAP/VST3 signal and state evidence exists. The other 15 modules, default oscillator selection, UI, and generic module host remain open. |
| RuntimeBenchmark | Graph stress and node-count performance | Native and Wasm narrow benchmarks; **matching project benchmark open**. |
| Standalone_Filter | Filter graph, controls, export, state | Filter kernel/workbench; **scripted project and export parity open**. |
| Standalone_FX | Effect selection, routing, tails, widgets, export, OSC | 21-effect slot studies and FX host; **full project script/endpoint parity open**. |
| Standalone_Eq | Eight-band EQ, graph/editor interactions, export | EQ8 primitive/workbench; **project script/state parity open**. |
| Standalone_Sample | Sample sources, slots, voice/transport behavior, export, OSC | Sample studies and browser surface; **full project behavior open**. |
| StandaloneOsc | Oscillator presentation/host behavior | [Original authored Rack factory in the live creator](oscillator-live-delivery.md), retained/egui, MIDI/keyboard, native/importing and static preview evidence. Full face, animation, legacy envelope/audio comparison and DAW/export parity remain open. |
| Standalone_Arp | MIDI arpeggiator and export | Arp kernel/workbench; **scripted project parity open**. |
| Standalone_NoteFilter | MIDI range filtering and export | Note Filter kernel/workbench; **scripted project parity open**. |
| Standalone_ScaleQuantizer | MIDI scale mapping and export | Scale Quantizer kernel/workbench; **scripted project parity open**. |
| Standalone_Transpose | MIDI note transposition and export | [Authored prepared MIDI audition](prepared-midi-runtime.md), legacy event comparison and held-note live edits; **full project/UI/export parity open**. |
| Standalone_VelocityMapper | MIDI velocity curve and export | Velocity Mapper kernel/workbench; **scripted project parity open**. |
| VectorSynth | Polyphonic vector synthesis and per-note envelopes | Voice and modulation primitives; **project audit open**. |
| GranularLab | Live/file capture, freeze, grains | Granulator and capture studies; **project audit open**. |
| KarplusStrongLab | Polyphonic string synthesis | **Kernel and project audit open**. |
| ModalLab | Polyphonic modal resonator synthesis | Resonator primitive; **instrument project audit open**. |
| ExperimentalUI | Structured user-project UI behavior | Browser widget work; **project/UI script audit open**. |
| LayoutModeDemo | Stack/grid/overlay layout modes | Rack layout work; **layout API audit open**. |
| MLLab | Model loading and webcam inference | **Media/ML service and project audit open**. |
| WebcamViewer | Camera capture and presentation | **Camera capability and project audit open**. |
| AVSampler | Segmented webcam capture, pose mapping, sample/slice playback, shaders, docking, FX | **A/V project and service audit open**. |
| AVSamplerLab | A/V sampler lab and active video row | **A/V project and service audit open**. |
| avsamplerDOCKING | Decomposed A/V sampler docking modules | **Reusable docking/module API audit open**. |
| VideoPolySamplerLab | Audio-timed polyphonic video sampling | **Cross-clock media/voice project audit open**. |
| VideoSamplerLab | Audio-timed video sampler | **Cross-clock media project audit open**. |
| VideoSliceRackLab | Dynamic slice rack, MIDI one-shots, marker edits, video mapping | **A/V rack and project audit open**. |

The v2 `projects/` directory contains many primitive descriptors that have no one-to-one legacy manifest. Preserve them as tests and reusable building blocks. A project-specific migration note must say whether an old behavior is preserved, deliberately improved, or still open, and link the old and v2 evidence. No row is complete based on its name or this table alone.
