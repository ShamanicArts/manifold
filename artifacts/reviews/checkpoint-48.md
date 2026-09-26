# Checkpoint 48 · Core MIDI boundary and roadmap status

[Live Voice workbench](http://127.0.0.1:4173/?primitive=voice) · [Pitch bend review](checkpoint-47.md)

The Rust core now handles out-of-range channel values supplied by a direct API caller without panicking during Voice or Sample instrument playback. The Wasm ABI continues to reject these values. A neutral bend ratio is used for an invalid note channel; invalid pitch bend messages are ignored.

The README and primitive roadmap now reflect the 14-bit channel bend path, on-screen wheel, and 180 offline reference cases. The porting roadmap remains active: hardware MIDI latency calibration, aftertouch and other controllers, host automation, preset conversion, the remaining effects and media nodes, and native plug-in packaging still need implementation.

Verification: 67 Rust workspace tests passed. The Wasm and web builds passed. Native Voice and Sample instrument fixtures were regenerated from the updated source. The browser comparison sweep passed all 180 cases across 27 primitives with zero page errors.
