# Main Arpeggiator port boundary

The historical face is `UserScripts/projects/Main/ui/components/arp.ui.lua`; behavior is `UserScripts/projects/Main/lib/arp_runtime.lua`. Both are read-only. The existing `crates/manifold-core/src/midi_arpeggiator.rs` already implements a fixed-capacity, sample-clocked MIDI version used in the graph workbench. Main still needs its own typed voice-output lanes and a route into the assembled instrument.

## Behavior to preserve

- One 236×220 amber face: Up, Down, Up/Down, Random; Hold; Rate 0.25–20 Hz; Octaves 1–4; Gate 5–100%.
- Sort held input voices by note and source index, then expand octave copies. With Hold on, latch a note on its rising input gate; with Hold off, follow current gates. A new non-empty chord gets a 30 ms capture window so near-simultaneous notes join the first step.
- Sequence changes restart index and direction. Up/Down bounces without repeating the end note; Down reverses the sorted sequence. Each step chooses an available output lane, falling back to round-robin stealing when all eight are gated.
- Copy the selected voice payload into the output lane, change only its expanded note and timed gate, and close the gate after `period × gate`. The source note still owns the held-input entry, while an output lane owns its timed release. Clearing the final held input releases all output lanes.

## Engine boundary

Main's current `MainVoiceBank` receives events before `process_planar` and processes a whole block at once. Its allocator releases every active slot with a matching note. An arpeggio cannot be represented faithfully by merely changing a pitch once per block or sending a note-off by pitch when two output lanes overlap.

Use a prepared eight-lane Arp state with a monotonic sample clock. Reuse the scheduling and sequence rules of `MidiArpeggiator`, but carry source slot identity and copied voice amplitude into each lane. Split only the synth voice-bank render at pending step and gate-close deadlines; the existing Filter, FX, EQ, looper capture, and monitor still process the assembled full block. Every split writes to its corresponding slice of the preallocated output and scratch. The audio callback must not allocate, lock, sort an unbounded collection, log, or compile a graph. At most 32 expanded sequence entries and eight output lanes are needed.

The first connected route should consume the currently routed voice payload and feed Arp output to the synth. Source-note release must not be confused with timed output-lane release. Changing the connection while notes are held needs an explicit transition that closes old output lanes and starts the new route without leaving a stuck note. Browser controls and status remain off the audio thread; the original face reads bounded held count, current note, and output-gate snapshots.

## Proof required before checkpoint

Probe native and Wasm output at two block sizes with the same event times. Verify the first step after the 30 ms chord window; sorted Up/Down/Up-Down sequences; octave expansion; deterministic Random seed; Hold latch and release; gate length; an overlapping same-pitch lane; and no stuck voice after route changes. Browser verification must use the actual `main-looper.html#arpeggiator` instrument, its original-size face, live steps, and a versioned session reopen. A static arpeggio graph preview would not prove this port.
