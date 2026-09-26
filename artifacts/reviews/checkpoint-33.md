# Review checkpoint 33: bounded sampler unison

Date: 2026-09-26. Open [Sample instrument](http://127.0.0.1:4173/?primitive=sample-instrument), set **Unison voices** to 2–4, raise **Unison detune**, and widen **Stereo spread**. Start the instrument and play a note. The **Detuned stereo unison** offline case shows the [native Rust/Wasm waveform](checkpoint-33-unison.png); **Unison count on next note** and **One shot with detuned subvoices** cover the other transitions.

Each of eight note slots now has four prepared sample cursors, all sharing one immutable PCM buffer. A note captures its subvoice count when triggered; detune and spread can change while it sounds. Rust offsets each cursor's resampling ratio, pans the stereo channels with equal-power gains, and normalizes the contributing subvoices. Pan and normalization values are prepared when controls change, leaving the audio loop with bounded reads and multiplications. The one-subvoice path retains its earlier output. The meter still counts notes, with one tracked playhead per note.

Validation: 49 Rust tests, the two-subvoice AudioWorklet smoke, and all **135** browser comparisons passed with no page errors (76 C++ cases, 59 native Rust cases). A 390 × 844 live browser check set 3 voices, 35 cents, and 0.75 spread; keyboard playback showed one active note, and the unison comparison showed **Match** without horizontal overflow.

This v2 slice caps unison at four subvoices per note; the legacy node permits eight and smooths gain/spread changes. Instant detune or spread changes may still click, and fully correlated subvoices can raise level despite square-root normalization. These are explicit next refinement points rather than claims of full legacy project parity.
