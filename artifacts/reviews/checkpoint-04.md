# Review checkpoint 04: timed notes and playable voice baseline

Date: 2026-09-26. Open the [Voice synth workbench](http://127.0.0.1:4173/?primitive=voice). The [desktop](checkpoint-04-voice.png) and [mobile](checkpoint-04-mobile.png) captures show the fourth selectable view, with waveform and ADSR controls, a playable keyboard, live spectrum, and timing comparison.

Rust now carries typed note on, note off, and all notes off events with frame offsets inside an audio block. The graph validates and applies them between sample spans. The Wasm engine keeps a prepared, fixed-capacity queue of 256 events. The browser keyboard sends events to the next audio block. The new voice baseline has eight slots, four waveforms, ADSR, velocity, deterministic oldest-voice stealing, and note release from every envelope stage.

| Native Rust ↔ Wasm timing case | Maximum sample difference |
| --- | ---: |
| Single note on/off | 0 |
| Release during attack | 0 |
| Three overlapping notes | 0 |
| On/off across block edges | 0 |
| Ninth note steals oldest | 0 |

These five cases use a **native Rust reference**, not the old C++ `MidiVoiceNode`. The voice envelope and note-off behavior are an intentional new baseline; the old scalar implementation can ignore note-off during attack. The page changes its comparison title and playback label to show the actual reference source. The earlier fourteen C++ comparison cases remain separate and still pass.

Verification: `cargo test --workspace` passes 14 tests, including sample-offset events, release during attack, and voice stealing. Headless Chromium passed all 19 browser comparisons, started the instrument, pressed and released a keyboard shortcut, showed a non-flat live spectrum while the note was held, reported no page errors, and had no horizontal overflow at 390 px.

Decisions for review: the first playable voice keeps oscillator and envelope state together so timed MIDI behavior can be checked end to end. Separate patchable Oscillator, NoiseGenerator, ADSREnvelope, and MidiInput nodes, external MIDI timestamp scheduling, and the authored Main MIDI Synth's richer routing and effects remain. See the [event contract](../../docs/event-contract.md). No Lua runtime or Lua source is imported.
