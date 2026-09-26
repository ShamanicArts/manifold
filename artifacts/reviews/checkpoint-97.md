# Checkpoint 97 — one MIDI graph path

The reference comparison renderer now builds the same typed `MidiInput → MidiTranspose → VoiceSynth` graph as the playable workbench. The AudioWorklet no longer has a special transpose setup or parameter branch. The Wasm engine no longer holds a separate transpose effect, and `manifold_event_push` queues only the original typed event for the graph to route when due.

Removing the dedicated `manifold_midi_transpose_enable` and `manifold_midi_transpose_set` exports changes the Wasm ABI. Its version is now 3; the worklet, comparison renderer, sample analysis worker, and versioned fixture script check this version so older cached pages fail with an explicit mismatch.

Verified after rebuilding Wasm and Vite: the native MIDI Transpose fixture matches both direct Wasm and the actual AudioWorklet adapter over 8,192 stereo frames with maximum difference 0. The existing 32,768-frame FX tail verifier still passes with maximum difference 4.32e-7. The in-app browser still cannot grant hardware MIDI permission when its policy blocks the API; use the on-screen keyboard there or copy the view URL into a browser that allows Web MIDI.
