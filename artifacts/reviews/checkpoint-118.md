# Checkpoint 118 — isolate the old Main pitch map

The [HTML review](http://127.0.0.1:4173/main-pitch-review.html) explains how old Main divides note and sample pitch between its wave oscillator, sample playback speed, and phase vocoder. The new pure Rust `route_main_pitch` function covers keytrack modes 0/1/2 and pitch engine modes classic/vocoder/HQ. It is not yet bound to the playable graph.

## Evidence

Fourteen scenarios call the actual old `sample_synth.lua` helpers and wave assignment through reference-only node doubles, then call Rust with identical inputs. Maximum differences: 0.0001163 Hz wave frequency, 0.00000003616 desired ratio and sample speed, and 0.0000003143 semitones vocoder shift. Vocoder mix and HQ selection agree exactly. Run `python3 scripts/check-main-pitch-trace.py`; source hashes and both CSV traces are in `web/public/reference/main-pitch`. All 126 workspace Rust tests pass. The shipped v2 runtime has no Lua dependency.

## Next

Bind note/root/pitch settings to one prepared Main graph voice, and send the calculated wave frequency, sample speed, and vocoder pitch/mix to their Rust nodes at a block boundary. Then add authored browser controls and state migration, native Rust/Wasm audio cases, and a live worklet check. Full old voice audio and polyphony remain separate milestones.
