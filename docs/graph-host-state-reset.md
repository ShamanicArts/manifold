# Graph host state and reset contract

This follows the Graph CLAP pointer and saved-project proof. The Graph CLAP
`reset` callback in `crates/manifold-clap/src/graph.rs` calls the prepared
graph reset. Its state saver now reads a coherent control snapshot while the
audio callback may apply automation or publish a replacement runtime.

## Reset

CLAP `reset` must run on the audio thread without allocation, locks, logging,
project parsing, or graph compilation. It must preserve the authored project,
host slot bindings, current control targets, and prepared sample assets. It
must discard held and releasing voices, oscillator/LFO phase where appropriate,
filter/smoother history, delay and reverb tails, sampler cursors, and other
ephemeral signal state. The next silent block must be silent for instruments
and effect tails. Starting a new note after reset must use the controls that
were active immediately before reset.

The implementation sits in `manifold-core` at the prepared `ExecutionPlan`
boundary and is exposed through `manifold-native::NativeProcessor`. The CLAP
callback accesses only its active runtime. It also clears preallocated pending
MIDI and automation block vectors; it does not replace a graph pointer or
retire a runtime on the audio thread.

`EventKind::AllNotesOff` alone does not meet this contract: `VoiceSynth`
enters its release stage, so audible notes remain after the event. The graph
reset needs explicit immediate voice clearing and kernel history reset. Existing
`reset()` methods cover many effects. The exhaustive `Kernel` dispatch now
includes MIDI processors and the main directional binding, so newly added
variants require an explicit reset decision at compile time.

The first core step now gives `VoiceSynth` an immediate, allocation-free reset
that preserves sound controls and gives `Oscillator` a phase/smoother reset at
its current frequency and level. Their tests compare a new note or signal
against a freshly prepared instance.

The second core step adds resets for `SampleRegion`, `SampleInstrument`,
`LoopCapture`, `Lfo`, `NoiseGenerator`, `MidiArpeggiator`, and the shared
`MidiNoteRouter` used by the transpose, note filter, scale quantizer, and
velocity mapper. The sample instrument retains old `Arc` sources during reset
so the audio thread never frees a retired take; later control-side publication
reclaims them. Loop capture clears its logical take without reallocating its
ring. Tests check silence, source reuse, current controls, and forgotten MIDI
ownership.

The third core step covers control-state kernels (`SampleHold`, slew,
attenuverter, CV mixer, phrase gain, distortion), `Chorus`, `Eq8`,
`Resonator`, `SpectrumAnalyzer`, and `FftSpectrum`. Their resets retain target
controls and clear phases, delay generations, biquad histories, or analysis
rings in place. Chorus, EQ, and FFT probes check fresh-instance behavior or
the absence of old history.

The fourth step adds an exhaustive `Kernel::reset_processing` match and
`ExecutionPlan::reset_processing`, exposed through `NativeProcessor` and the
Graph CLAP reset callback. `MainVoiceBank` also has an in-place reset; its
fresh-instance comparison caught and corrected a reused oscillator frequency.
Authored Note Voice, Tone Texture, Sample Voice, and Main Bank graph resets
match fresh audio, while a reverb graph drops its audible tail and keeps its route. The
packaged CLAP class passes a separate-process stop/reset/start probe with a
silent block and exact retriggered note, plus 36/36 applicable validator cases.
The 44.7 MB four-source graph with eight notes active before each reset has an
offline 512-reset p95 of 0.00020 ms in the current checkpoint. Evidence is in
`web/public/graph-clap-reset-proof.html`. Physical device timing remains open.

The reset tests cover Note Voice (held note and filter), Tone Texture
(oscillator phase), Sample Voice (active sample cursor), Main Bank, and a reverb graph
with a live tail. They compare post-reset audio with freshly prepared graphs,
exercise two consecutive CLAP resets, and check that the automated public
value and saved project survive. The large-asset timing probe remains an
offline measurement rather than a physical-host deadline guarantee.

## Coherent saved state

Each prepared runtime owns one of two fixed 128-value banks. At each block
boundary, the audio thread writes its complete control snapshot to its bank
between two atomic sequence increments. `state_bytes()` holds the project and
binding locks, reads one complete bank version, then serializes JSON on the
host thread. Import prepares the replacement into the other bank and switches
the project, bindings, and active bank together under those locks. A late
snapshot from the old runtime writes only its retired bank. Audio publication
does not lock, allocate, or serialize.

Tests save and parse 128 projects during 20,000 alternating paired-control
snapshots, check the saved pair comes from one block, and reopen 32 Tone
Texture saves while an old Note Voice runtime keeps publishing. The existing
CLAP test covers host automation and state reopen. A separate-process host
probe now calls CLAP state save concurrently with audio: 64 Note Voice saves
with paired automation, 64 Tone Texture saves, and 8 saves of the 44.7 MB
four-source project. Every saved JSON parses with the expected project and
node count; Note Voice's paired controls always match one complete block.
Further host stress should cover repeated swaps and saves with large embedded
PCM under an actual DAW; these probes do not establish every DAW's scheduling.

An isolated REAPER transport now saves Note Voice eight times while playback
advances from about 0.15 to 0.94 seconds. Decoding each DAW project shows the
first save can retain the previous control pair before REAPER's queued edit
reaches an audio block; the remaining seven saves alternate complete attack
and decay pairs, with neither control mixed across blocks. A fresh REAPER
process renders the last saved project against native Rust at 5.96e-8 peak
error across 48,000 stereo frames. See
`scripts/probe-reaper-graph-clap-live-state.py` and
`web/public/graph-clap-reaper-live-state.json`. Repeated project swaps and
large embedded-PCM live saves under DAW transport remain open.

The existing [CLAP host proof](clap-host.md) covers pointer gestures, fresh
REAPER project recall, MIDI audio, editor import, and official validator
results.
