# Checkpoint 120 — isolate old Main voice allocation

The [HTML review](http://127.0.0.1:4173/main-voice-allocation-review.html) shows the old Main note-slot order and the separate UI/DSP ownership boundary. The old UI `VoiceManager` selects among eight slots; the DSP `VoicePool` receives indexed frequency, amplitude, and gate paths. Rust `MainVoiceAllocator` now reproduces the slot choice without shipping Lua.

## Evidence

A 21-step reference script calls the actual old `voice_manager.lua` and Rust with identical note, release-level, and panic inputs. Chosen slot, next candidate, active/release masks, and all eight assigned notes match exactly. The trace covers idle-first allocation, quietest releasing steal, oldest-active steal, duplicate notes, note-off releasing every matching slot, idle reuse, and panic. Run `python3 scripts/check-main-voice-allocation-trace.py`; both CSVs and source hashes are in `web/public/reference/main-voice-allocation`. All 129 workspace Rust tests pass.

## Boundary and next work

This is an isolated allocation primitive. The playable Main study still has one voice and no old-style note gate or mixed eight-voice graph. The old UI envelope controls amplitude and sends indexed paths to DSP; v2 needs an explicit sample-clock gate/envelope contract before note events are wired to independent Main source states. The 39 existing Main audio cases still compare native Rust and Wasm, but do not prove polyphonic or full old-voice output. Next: prepare per-slot Main source state and connect timed note events, then compare mixed audio and voice stealing.
