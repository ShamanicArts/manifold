# Checkpoint 96 — typed MIDI graph

The MIDI Transpose workbench now declares `MidiInput → MidiTranspose → VoiceSynth → Output` in its project graph. Rust validates `Midi` edges separately from audio and control edges, dispatches timed events along connected MIDI paths, and remaps held notes when the transpose node's parameter changes. The Voice, Sample Region, and Sample Instrument nodes expose an optional MIDI input. Direct event targets remain supported for existing projects. The old dedicated transpose Wasm ABI remains temporarily for the reference comparison renderer.

The graph uses a stack reserved at preparation and reads current source indexes, so a prepared MIDI route can follow a live route edit without allocating in `process`. The audio worklet sends incoming events to the graph's `MidiInput` node; its event scheduling and browser permission behavior are unchanged.

Evidence: 93 Rust core tests pass, including a new graph test comparing sample-offset note delivery and held-note remapping with direct voice events. The typed graph's Rust/Wasm output has maximum and RMS error **0** across the existing 8,192-frame native Rust reference. The actual AudioWorklet adapter matches the same reference with maximum error **0**. Vite builds successfully. See [Wasm metrics](checkpoint-96-midi-graph-wasm-metrics.json).

Review in the browser: [MIDI Transpose](http://127.0.0.1:4173/?primitive=midi-transpose). An on-screen keyboard is available without MIDI permission; hardware MIDI needs a browser that grants Web MIDI access.
