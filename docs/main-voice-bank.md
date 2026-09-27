# Main voice bank, through checkpoint 132

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
waveform oscillator on that branch. The browser can select a fixed source
frame or follow each voice's sample playhead. In follow mode, a background
Rust/Wasm worker prepares 256 source spectra, and the audio callback selects
one prepared spectrum per voice at each block. Speed zero freezes each voice
at its current position. A new note starts its own temporal position at zero.
This is a quantized v2 implementation, not a claim of matching the full old
spectral automation.
The bank now prepares its Add wave pitch smoother at 220 Hz, like the old
`blendAddOsc`, before a note retunes it. The spectral source bank retains the
old SineBank default 440 Hz. This initial state mattered in the assembled
audio comparison even though both routes eventually reached the same pitch.
The original sample player applies a center-pan factor before the vocoder,
follower, and branch selection. The bank applies the same factor at that point;
the standalone `SampleRegion` primitive still returns its raw stereo output.
Morph does not render the silent Add wave bank; the old Morph branch disables
its corresponding oscillator.

The old Main UI references an ADSR but does not construct its optional DSP
node. Its amplitude envelope updates at UI cadence. The bank instead uses a
sample-clock ADSR per voice. This improves independent note timing, but it is
an intentional v2 behavior change. The bank ignores MIDI pitch bend for now;
note ownership follows the old UI's note-only policy across channels.

## Evidence

- `cargo test --workspace`: 137 Rust tests, including timed graph chords,
  independent release, duplicate-note release, oldest-slot stealing, and
  Ring depth-zero equivalence to the base blend, Add/Morph target routing, and
  independent temporal position for staggered voices.
- `scripts/verify-main-voice-bank-worklet.mjs`: Wasm AudioWorklet initialization,
  shared sample and two target uploads, live Ring/Add/Morph switching, invalid
  target rejection, chord, note-off, panic, and nine-value meter.
- `scripts/verify-main-voice-bank-comparison.mjs`: ten checked-in native
  Rust ↔ Wasm captures. Nine are bit-exact, including Ring, Add, and Morph. The vocoder chord differs by
  0.004962 peak and 0.000350 RMS (0.46% of native signal RMS). A single-note
  vocoder diagnostic gave a similar peak difference, so this is not specific
  to mixing multiple voices. The numerical cause remains unisolated and the
  comparison lab labels that case as bounded variance.
- Existing Main blend and phase-vocoder comparison suites pass after the node
  was added.
- `scripts/bench-main-voice-bank-worklet.mjs` measures the real adapter and
  Wasm process call in a Node/V8 proxy at 48 kHz / 128 frames. On the local
  Ryzen 9 3900X run, eight-voice p95 callback time was 0.066 ms Normal,
  0.252 ms Add, 0.204 ms Morph, and 0.693 ms vocoder. No measured block
  exceeded the 2.667 ms interval. This is not a browser audio-thread or
  hardware underrun measurement. The raw data and method are in
  `web/public/reference/main-voice-bank/bench-node.json`.
- `scripts/bench-main-voice-bank-browser.mjs` runs ten held-chord cases in
  headless Chromium through the actual AudioWorklet and Wasm graph. It samples
  Chromium's WebAudio render-capacity estimate 24 times per case after warmup.
  The refreshed sampled p95 was 3.20% for Normal eight voices, 8.59% for
  original square Add eight voices, and 27.11% for vocoder eight voices; the
  largest sampled value was 36.08%. Chromium reported a
  512-frame output callback buffer at 48 kHz. These are sampled rolling
  capacity estimates, not per-callback timings or physical device underrun
  counts. The raw capture includes browser and Wasm versions in
  `web/public/reference/main-voice-bank/bench-browser-headless.json`.
- `scripts/verify-main-wave-voice-comparison.mjs` checks three assembled
  original C++ wave routes against native Rust and Wasm. The old compiled
  oscillator, Normal crossfade, base selector, branch mixer, and voice mixer
  match the Rust bank after frame 512 to at most 0.000004612. Native/Wasm is
  bit-exact. The onset differs because the bank has a sample-clock ADSR;
  the old UI envelope and old sample playback are outside this fixture.
- `scripts/verify-main-sample-playback-comparison.mjs` checks five compiled
  original sample-player cases, including loop speed, one-shot, and crossfade.
  After the old center pan, the largest old/Rust difference is 0.0000000195.
- `scripts/verify-main-normal-voice-comparison.mjs` checks four assembled
  original C++ Normal routes using the original player, oscillator, gain,
  crossfades, and mixers. The largest settled old/Rust difference is
  0.000004612 after frame 512; native Rust and Wasm are bit-exact. The old
  phase vocoder is omitted where its mix is zero; the original UI-rate
  envelope is not constructed.
- `scripts/verify-main-ring-voice-comparison.mjs` checks four assembled
  original C++ Ring routes using the crossed Ring nodes, Ring crossfade,
  branch mixer, and voice mixer. The largest settled old/Rust difference is
  0.000003263 after frame 512; native Rust and Wasm are bit-exact. Depth zero
  and three wet positions are covered. The same vocoder and envelope scope
  applies.
- `scripts/verify-main-add-morph-voice-comparison.mjs` checks eleven assembled
  original C++ Add/Morph routes against native Rust and Wasm. The old
  `SineBankNode` runs spectral Add/Morph mode from a fixed published source
  spectrum; the original additive oscillator, sample player, crossfaders,
  gains, branch mixer and voice mixer also render. After frame 4096, the
  largest old/Rust sample difference is 0.000002444; native/Wasm is bit-exact.
  Five extra cases select the original band-limited additive wavetable for
  saw, square, triangle, and sine/saw blend. Their largest settled old/Rust
  difference is 0.0000000615. The Main parameter `add-wave-source` selects
  the authored prepared partial bank or the original additive oscillator;
  saved states from versions 1 and 2 migrate with prepared partials selected.
  The fixture excludes temporal source changes, vocoder processing, and the
  old UI-rate envelope.
- `scripts/verify-main-temporal-voice-comparison.mjs` checks six analyzed
  two-voice captures: Add and Morph with frozen, normal, and double speed
  motion. Native Rust and Wasm are bit-exact in all six; motion differs from
  the frozen control. Six more cases run the assembled original C++ route with
  its own 45 extracted frames, temporal interpolation, SineBank, crossfaders,
  gains, and mixers. Add uses a mixed wave/source branch; Morph uses a mixed
  partial recipe. The largest settled original/Rust sample difference is
  0.0005483 and the largest settled RMS difference is 0.0001365 after frame
  4096; native/Wasm is bit-exact. The old UI-rate envelope and vocoder are
  excluded. New Rust voices now seed the first prepared target before
  resetting phase, which closed a large mixed-Morph onset mismatch.
- `scripts/verify-main-temporal-worklet.mjs` checks table upload, invalid
  upload rejection, clear, staggered voices, and audible movement in the real
  AudioWorklet adapter. `scripts/verify-main-temporal-browser.mjs` opens the
  workbench in headless Chromium, enables follow, plays a note, saves v3
  state, reopens it, rebuilds the table, and plays again.
- `scripts/verify-main-voice-bank-state.mjs` round-trips 20 controls, separate
  wave and source targets, and embedded or built-in source choices. It rejects
  malformed controls, target addresses, partials, and PCM. A headless Chromium
  workbench check opened edited embedded state, waited for source analysis,
  downloaded identical targets and PCM, and started the restored AudioWorklet.
  `scripts/verify-main-sample-blend-state.mjs` still passes after extracting
  shared PCM encoding. The bank state schema is version 3 with follow and
  speed controls; a saved source rebuilds its temporal table on reopen. This
  is bank state, not old preset migration.

The playable workbench is `/?primitive=main-voice-bank`; the Add/Morph checkpoint
review is `/main-add-morph-review.html`; the timing review is
`/main-bank-performance-review.html`, and the compiled old wave review is
`/main-wave-route-review.html`. The compiled sample and Normal route review is
`/main-normal-route-review.html`; the combined Ring, Normal, and raw-player
review is `/main-ring-route-review.html`. The browser capacity review is
`/main-browser-capacity-review.html`; the bank state review is
`/main-bank-state-review.html`; the assembled Add/Morph review is
`/main-add-morph-route-review.html`; the temporal review is
`/main-temporal-voice-review.html`. The embedded BB browser cannot grant
hardware MIDI permissions yet, so the on-screen keyboard is the immediate
input path. The in-app browser backend was unavailable for the capacity run;
the review page was visually checked in headless Chromium.

## Next integration

Expand the bank state into the full Main project and preset model. Compare
other wave recipes and broader source material with the assembled old route.
Repeat capacity measurements against a regular browser and physical output
device, then identify the vocoder's native/Wasm numerical variance. Host
packaging remains a separate later stage.
