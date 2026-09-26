# Checkpoint 101 — audible MIDI Velocity Mapper

Open [MIDI Velocity Mapper](http://127.0.0.1:4173/?primitive=midi-velocity-mapper). Start audio, play a key on the on-screen keyboard, then change Curve to Hard while holding it. The Rust output monitor shows the note retrigger at a lower velocity. Move Offset negative to soften or silence it. Hardware MIDI requires permission in an external browser when the embedded view blocks that prompt.

The old rack transforms voice amplitude, but its MIDI export sends the original velocity. V2 makes the rack curve audible on the typed MIDI event route. [The migration note](../../docs/midi-velocity-mapper-migration.md) and [event comparison](checkpoint-101-midi-velocity-mapper-events.json) record the deliberate difference. The fixed Rust note router now supports a mapped velocity while retaining the earlier effects' interfaces.

Verification: the old Lua rack tests pass (2 cases); 101 Rust core tests pass; the native Rust 8,192-frame stereo fixture matches direct Wasm and the actual AudioWorklet adapter with maximum sample difference 0; the browser comparison renderer also matches with maximum difference 0. Vite builds and the served view contains the new primitive. See [metrics](checkpoint-101-midi-velocity-mapper-metrics.json). This checkpoint does not claim a C++ audio comparison.
