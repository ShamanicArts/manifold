# Checkpoint 119 — live Main note and sample pitch routing

The [playable Main study](http://127.0.0.1:4173/?primitive=main-sample-blend) now has a **Map Main note + sample pitch** switch. The voice-frequency slider becomes the note input for one authored voice; root note, keytrack (wave/sample/both), pitch semitones, and classic/bin/HQ engine controls feed the prepared Rust graph. The [HTML review](http://127.0.0.1:4173/main-sample-blend-review.html) shows the five new audio cases, while the [isolated pitch review](http://127.0.0.1:4173/main-pitch-review.html) records the original Lua comparison.

## Evidence

- The Rust graph now applies the pitch map at each audio-block boundary to oscillator frequency, sample-region speed, and phase-vocoder mode, pitch, and mix. The FM clock still follows the unmapped voice note before the old keytrack choice is applied. Disabling mapped pitch restores saved manual wave/sample and vocoder targets. One graph test checks the mapped targets and actual sample-cursor speed, then the return to manual controls.
- Five new 16,384-frame stereo Main captures cover classic sample playback, root-locked and both-keytrack wave pitch, and bin/HQ vocoder modes. The three classic cases match native Rust and Wasm exactly; the two wet vocoder cases differ by at most 5.964e−6 per sample. The 34 earlier Main cases still pass, bringing Main to **39** cases and the audio library to **457**. Root versus both, classic speed versus vocoder, and bin versus HQ each produce different rendered audio.
- A live AudioWorklet check confirms the new pitch messages, 440/660 Hz wave targets, HQ vocoder shift/mix, and restoration of independent manual vocoder settings. Version-11 Main state saves **33** controls and opens versions 1–10 with mapping off by default. All **127** workspace Rust tests pass.
- The original Lua pitch helper trace from checkpoint 118 still covers 14 isolated mapping scenarios. It uses Lua only in a reference harness. The v2 product path remains JavaScript → AudioWorklet → Rust/Wasm.

## Scope and next work

This is one authored voice controlled by a frequency slider. MIDI note events do not yet allocate and gate old Main voices. The five graph captures compare native Rust and Wasm, not the entire old C++/JUCE Main voice. Ring mode, the exact old Add oscillator route, Morph selection, old presets, and whole-voice C++ comparison remain. The in-app browser control connection was unavailable for a visual UI smoke check; the built page, graph/audio comparison, and AudioWorklet message path were verified. Next, reconstruct old note-on/off and voice allocation semantics against bounded old-project traces.
