# Checkpoint 46 · MIDI sustain across inputs

Open the [Voice workbench](http://127.0.0.1:4173/?primitive=voice) or [Sample instrument](http://127.0.0.1:4173/?primitive=sample-instrument) in an external browser with Web MIDI permission. A sustain pedal sends CC64. The recent event list now shows pedal down/up and marks note-offs held by sustain. The [browser run](checkpoint-46-browser-sustain.json) uses two synthetic inputs: one plays C4 while the other operates the pedal.

## Implemented

- A small JavaScript note ownership module tracks physical and sustained notes by source, channel, and pitch. CC64 pedal state merges by channel across MIDI inputs, so a separate pedal device can hold another device's notes.
- The final pedal-up sends note-offs for pitches no longer held; reattacking a sustained pitch retriggers it. Device disconnect and listening stop release owned notes while preserving a pitch held by another input. The on-screen keyboard participates as a separate source on channel 16.
- The same note and pedal path feeds both browser instruments through the timestamped event transport from checkpoint 45. Lua remains a behavior reference only.

## Verification

- `node scripts/verify-midi-sustain.mjs`: pedal hold/release, channel separation, cross-device pedal, two concurrent pedals, reattack, disconnect, and keyboard ownership passed.
- Synthetic browser runs: two inputs connected, C4 note-off held while the other device's pedal was down, and the note-off forwarded at pedal-up in both [Voice](checkpoint-46-browser-sustain.json) and [Sample instrument](checkpoint-46-sampler-sustain.json). A [keyboard and pedal run](checkpoint-46-keyboard-pedal.json) shows a channel-16 hardware pedal holding the on-screen C4 key. Both instruments kept running with no page errors.
- Production web build passed. All **176** offline cases across 27 views still reported **Match** with no browser page errors.

## Boundary

The browser tests inject synthetic MIDI inputs; hardware permission remains dependent on the external browser. Pitch bend, aftertouch, and other controllers are still unmapped. The current voice and sampler each own eight note slots, so this checkpoint does not extend polyphony or host automation.
