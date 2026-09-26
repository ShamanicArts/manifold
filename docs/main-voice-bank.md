# Main voice bank, through checkpoint 125

The `main-voice-bank` graph node is a prepared eight-voice instrument. It is an
authored v2 slice of `sample_synth.lua` plus the original UI voice ownership
policy. It is not the full old Main project graph.

## Audio path

Each allocated slot owns a `SampleRegion`, `Oscillator`, `PhaseVocoder`, two
`RingModulator` kernels, two `SineBank` kernels, `EnvelopeFollower`, `PhraseGain`,
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
and the two center-pan gain stages. Ring mode crosses the live wave and
sample buses in both directions, then uses the same equal-power blend to
select their results. The external audio modulators match the old graph
connections. Add/Morph select a second branch with complementary base/additive
depth. The wave recipe and source spectrum are addressed separately (`target`
0 and 1) and copied into all eight voices between processing blocks. Add
crossfades both spectral banks; Morph selects the source bank and interpolates
its pitch. A raw-sample follower drives the additive phrase contour. No source
analysis, target construction, or allocation runs inside the audio callback.

Parameters 0–18 cover wave shape, blend,
root, keytrack, sample pitch and engine, Normal/Ring/FM/Sync/Add/Morph, depth and bidirectional FM,
Sync retrigger, ADSR, master, and vocoder time ratio. The graph node chooses FFT
order 9 (512 points) when authored. A different order requires re-preparing the
node; there is no callback-time FFT reallocation. Parameters 17–18 set phrase
contour amount and reference.

The Add wave source is an authored prepared recipe, while old Main uses a
waveform oscillator on that branch. Source frames are selected manually in
the browser and then remain fixed until another selection. This is a playable
v2 approximation, not a claim of matching the full old spectral automation.
Morph does not render the silent Add wave bank; the old Morph branch disables
its corresponding oscillator.

The old Main UI references an ADSR but does not construct its optional DSP
node. Its amplitude envelope updates at UI cadence. The bank instead uses a
sample-clock ADSR per voice. This improves independent note timing, but it is
an intentional v2 behavior change. The bank ignores MIDI pitch bend for now;
note ownership follows the old UI's note-only policy across channels.

## Evidence

- `cargo test --workspace`: 135 Rust tests, including timed graph chords,
  independent release, duplicate-note release, oldest-slot stealing, and
  Ring depth-zero equivalence to the base blend, and Add/Morph target routing.
- `scripts/verify-main-voice-bank-worklet.mjs`: Wasm AudioWorklet initialization,
  shared sample and two target uploads, live Ring/Add/Morph switching, invalid
  target rejection, chord, note-off, panic, and nine-value meter.
- `scripts/verify-main-voice-bank-comparison.mjs`: ten checked-in native
  Rust ↔ Wasm captures. Nine are bit-exact, including Ring, Add, and Morph. The vocoder chord differs by
  0.003883 peak and 0.000286 RMS (0.27% of native signal RMS). A single-note
  vocoder diagnostic gave a similar peak difference, so this is not specific
  to mixing multiple voices. The numerical cause remains unisolated and the
  comparison lab labels that case as bounded variance.
- Existing Main blend and phase-vocoder comparison suites pass after the node
  was added.
- `scripts/bench-main-voice-bank-worklet.mjs` measures the real adapter and
  Wasm process call in a Node/V8 proxy at 48 kHz / 128 frames. On the local
  Ryzen 9 3900X run, eight-voice p95 callback time was 0.080 ms Normal,
  0.288 ms Add, 0.198 ms Morph, and 0.749 ms vocoder. No measured block
  exceeded the 2.667 ms interval. This is not a browser audio-thread or
  hardware underrun measurement. The raw data and method are in
  `web/public/reference/main-voice-bank/bench-node.json`.
- `scripts/verify-main-wave-voice-comparison.mjs` checks three assembled
  original C++ wave routes against native Rust and Wasm. The old compiled
  oscillator, Normal crossfade, base selector, branch mixer, and voice mixer
  match the Rust bank after frame 512 to at most 0.000004612. Native/Wasm is
  bit-exact. The onset differs because the bank has a sample-clock ADSR;
  the old UI envelope and old sample playback are outside this fixture.

The playable workbench is `/?primitive=main-voice-bank`; the Add/Morph checkpoint
review is `/main-add-morph-review.html`; the timing review is
`/main-bank-performance-review.html`, and the compiled old wave review is
`/main-wave-route-review.html`. The embedded BB browser cannot grant
hardware MIDI permissions yet, so the on-screen keyboard is the immediate
input path. The in-app browser backend was unavailable for a visual smoke test
at this checkpoint; the served pages and worklet path were checked separately.

## Next integration

Give the full Main project a coherent state model. Extend the assembled old
C++ comparison to sample playback, mixed branches, and selected Ring/Add/Morph
cases while keeping the envelope timing difference explicit. Measure sustained
eight-voice callback cost in the actual browser and
identify the vocoder's native/Wasm numerical variance. Host packaging remains
a separate later stage.
