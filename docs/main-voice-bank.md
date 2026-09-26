# Main base voice bank, checkpoint 121

The `main-voice-bank` graph node is a prepared eight-voice instrument. It is an
authored v2 slice of `sample_synth.lua` plus the original UI voice ownership
policy. It is not the full old Main project graph.

## Audio path

Each allocated slot owns a `SampleRegion`, `Oscillator`, `PhaseVocoder`,
`AdsrEnvelope`, and `MainDirectionalMotion`. `MainVoiceAllocator` chooses the
slot on note-on and releases all matching notes on note-off, as checked against
21 original Lua trace steps. The graph dispatches MIDI at sample offsets, and
each slot renders only while active. The bank sums eight outputs to one stereo
graph bus.

The decoded stereo sample is uploaded between process calls. All playheads
share its `Arc<Vec<f32>>`; their playback cursors are independent. One set of
block scratch buffers is prepared at graph compilation and reused sequentially
for each voice. FFT, envelope, and motion state are also prepared before audio
rendering. Note-on clears existing state in place and does not create a voice.

The base path uses the existing Main note-to-pitch mapping, FM/Sync update,
oscillator hard sync, sample player, vocoder, equal-power wave/sample blend,
and the two center-pan gain stages. Parameters 0–16 cover wave shape, blend,
root, keytrack, sample pitch and engine, direction, depth and bidirectional FM,
Sync retrigger, ADSR, master, and vocoder time ratio. The graph node chooses FFT
order 9 (512 points) when authored. A different order requires re-preparing the
node; there is no callback-time FFT reallocation.

The old Main UI references an ADSR but does not construct its optional DSP
node. Its amplitude envelope updates at UI cadence. The bank instead uses a
sample-clock ADSR per voice. This improves independent note timing, but it is
an intentional v2 behavior change. The bank ignores MIDI pitch bend for now;
note ownership follows the old UI's note-only policy across channels.

## Evidence

- `cargo test --workspace`: 132 Rust tests, including timed graph chords,
  independent release, duplicate-note release, and oldest-slot stealing.
- `scripts/verify-main-voice-bank-worklet.mjs`: Wasm AudioWorklet initialization,
  shared sample upload, chord, note-off, panic, and nine-value meter.
- `scripts/verify-main-voice-bank-comparison.mjs`: seven checked-in native
  Rust ↔ Wasm captures. Six are bit-exact. The vocoder chord differs by
  0.003883 peak and 0.000286 RMS (0.27% of native signal RMS). A single-note
  vocoder diagnostic gave a similar peak difference, so this is not specific
  to mixing multiple voices. The numerical cause remains unisolated and the
  comparison lab labels that case as bounded variance.
- Existing Main blend and phase-vocoder comparison suites pass after the node
  was added.

The playable workbench is `/?primitive=main-voice-bank`; the checkpoint review
is `/main-voice-bank-review.html`. The embedded BB browser cannot grant
hardware MIDI permissions yet, so the on-screen keyboard is the immediate
input path. The in-app browser backend was unavailable for a visual smoke test
at this checkpoint; the served pages and worklet path were checked separately.

## Next integration

Connect prepared Add, Morph, and Ring source families to each voice and give
the full Main project a coherent state model. Compare selected assembled old
C++ voice output with Rust while keeping the sample-clock envelope difference
explicit. Measure sustained eight-voice callback cost in the browser and
identify the vocoder's native/Wasm numerical variance. Host packaging remains
a separate later stage.
