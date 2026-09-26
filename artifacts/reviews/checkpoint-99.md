# Checkpoint 99 — inspect Rust MIDI effect output

The [MIDI Transpose](http://127.0.0.1:4173/?primitive=midi-transpose) and [MIDI Note Filter](http://127.0.0.1:4173/?primitive=midi-note-filter) workbenches now show two event lists: incoming keyboard or hardware MIDI, and what the Rust effect emitted or suppressed. The output list includes note, channel, and frame offset within the audio block. A filter mode or range change displays the resulting held-note off/on events.

The compiled Rust graph stores only its latest 32 transform events in a fixed ring. A worklet message handler reads that ring at 10 Hz and sends one bounded snapshot to the page. No UI message or heap allocation was added to `process`.

Verification: 96 Rust core tests pass, including sample-offset trace and ring rollover checks. The actual AudioWorklet adapter returns the six expected Note Filter trace entries, including both suppressed events; its 8,192-frame audio comparison remains exact against native Rust. The MIDI Transpose worklet check remains exact. Vite builds, the served page contains the output monitor, and its Wasm file matches the built module. Visual inspection in headless Chromium remains unavailable on this machine because Chromium crashed during the prior screenshot attempt.
