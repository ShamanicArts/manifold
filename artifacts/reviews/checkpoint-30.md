# Review checkpoint 30: sampler note release

Date: 2026-09-26. Open the live [Sample instrument workbench](http://127.0.0.1:4173/?primitive=sample-instrument). **Note release** sits beside the pitch and level controls. Its default is 0.010 s; set it to zero to hear the former immediate cut or raise it toward 0.200 s for a longer tail. Select **Adjustable note release** in the offline comparison to inspect the [native Rust/Wasm waveform](checkpoint-30-release.png): it includes two note-off events and a longer release after the parameter change.

The Rust instrument now fades a released voice over a fixed number of output samples. The voice keeps reading its shared sample until the fade finishes, so the playhead and active-voice meter include the tail. A new note reuses a releasing slot before it steals a held voice. **All Notes Off** remains an immediate panic stop. This release is an authored v2 behavior, not a claim of exact legacy C++/Lua equivalence.

Validation: 42 Rust tests, the worklet smoke with a two-note release, and all **132** browser comparisons passed with no page errors (76 C++ cases, 56 native Rust cases). The live page displayed the 0.010 s default, accepted a change to 0.050 s while audio ran, forwarded keyboard note on/off, and showed **Match** for the new release case. Hardware MIDI permission in the in-app browser remains unverified.
