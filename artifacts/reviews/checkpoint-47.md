# Checkpoint 47 · MIDI pitch bend

[Open the live Voice workbench](http://127.0.0.1:4173/?primitive=voice) · [Sample instrument](http://127.0.0.1:4173/?primitive=sample-instrument) · [Visual review](checkpoint-47-pitch-bend.png) · [Browser control check](checkpoint-47-browser-bend.json)

## What changed

- Added typed `PitchBend { channel, value }` at sample offsets. Wasm event kind 3 packs the 14-bit value in the existing LSB and MSB fields. The worklet's fixed-capacity timed queue needs no new allocation or layout.
- Voice synth and sample instrument now bend only notes on the addressed MIDI channel. The state persists for future notes and changes active notes immediately at the event offset.
- Web MIDI pitch messages and an on-screen wheel reach both instruments. The wheel works in the in-app browser without hardware MIDI permission and has an explicit Center action.
- Added two Voice and two Sample instrument native Rust ↔ Wasm comparison cases, including bends inside audio blocks and a two-channel sample case.

## Decisions to revisit

- Bend range is ±12 semitones, following the original C++ `MidiVoiceNode`. V2 corrects the original's channel-blind, active-only behavior. A project-level bend range can follow when presets and MIDI state are formalized.
- Multiple devices on one MIDI channel use the latest bend message. Device disconnect currently releases notes but leaves the last bend position until another wheel message or instrument restart. Per-device controller ownership is a future transport decision.
- The on-screen wheel uses MIDI channel 16 to match the keyboard. Its position is restored after restarting an instrument.

## Verification

- `cargo test --workspace`: 65 passed, including new channel isolation tests.
- `npm --prefix web run build` and `./scripts/build-wasm.sh`: passed.
- All 180 browser reference cases across 27 primitives: Match, 0 page errors.
- Synthetic MIDI and on-screen wheel browser test: passed in Voice and Sample instrument. The test exercised channel 2 hardware bend, channel 16 wheel, and Center.
- Hardware permission and physical device timing still require an external browser with a device; the embedded browser blocks Web MIDI permission.
