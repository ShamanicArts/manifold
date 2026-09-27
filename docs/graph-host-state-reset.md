# Graph host state and reset contract

This follows the Graph CLAP pointer and saved-project proof. The Graph CLAP
`reset` callback in `crates/manifold-clap/src/graph.rs` now calls the prepared
graph reset. The remaining host gap is `state_bytes()`: it reads 128 atomic
normalized slots while the audio callback may publish a new runtime or apply
automation.

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

`state_bytes()` currently combines the project JSON under a mutex with
individual atomics for host slots. A concurrent audio snapshot can make a
single save contain controls from different process blocks. A project import
can also publish new slot values before the replacement runtime reaches an
audio block, while the old runtime is still able to publish its snapshot.

Treat a complete graph generation and all of its public values as one
control-side snapshot. The audio thread may publish a prepared, fixed-size
snapshot at a block boundary; state serialization and JSON allocation stay
off the callback. A save should either see the complete old generation or
the complete new one. Parameter automation at a block boundary must enter
the same snapshot before a subsequent save. Keep a bounded, nonblocking audio
publication path; do not hold `state` or `descriptors` mutexes in processing.

Exercise this with repeated project swaps between Note Voice and Tone Texture
while a host saves state, then reopen every captured state in a new instance.
Check all bound slot IDs and values against one generation, with no mixed
bindings. Repeat with dense automation and the 44.7 MB four-source project;
save cost belongs to the host/control thread, never the audio callback.

The existing [CLAP host proof](clap-host.md) covers pointer gestures, fresh
REAPER project recall, MIDI audio, editor import, and official validator
results. Those proofs remain valid while these reset and concurrent-save gates
are completed.
