# Graph host state and reset contract

This is the next host boundary after the Graph CLAP pointer and saved-project
proof. The current Graph CLAP `reset` callback in `crates/manifold-clap/src/graph.rs`
is empty. Its `state_bytes()` reads 128 atomic normalized slots while the
audio callback may publish a new runtime or apply automation. Those two gaps
need separate tests and fixes.

## Reset

CLAP `reset` must run on the audio thread without allocation, locks, logging,
project parsing, or graph compilation. It must preserve the authored project,
host slot bindings, current control targets, and prepared sample assets. It
must discard held and releasing voices, oscillator/LFO phase where appropriate,
filter/smoother history, delay and reverb tails, sampler cursors, and other
ephemeral signal state. The next silent block must be silent for instruments
and effect tails. Starting a new note after reset must use the controls that
were active immediately before reset.

Implement this in `manifold-core` at the prepared `ExecutionPlan` boundary,
then expose it through `manifold-native::NativeProcessor`. The CLAP callback
should only access its already active runtime and call that method. A reset
must also clear its preallocated pending MIDI and automation block vectors;
it must not replace a graph pointer or retire a runtime on the audio thread.

`EventKind::AllNotesOff` alone does not meet this contract: `VoiceSynth`
enters its release stage, so audible notes remain after the event. The graph
reset needs explicit immediate voice clearing and kernel history reset. Existing
`reset()` methods cover many effects, but not every graph kernel. Audit every
`Kernel` variant, including MIDI processors and the main directional binding,
before wiring the CLAP callback. A no-op default for an unreviewed stateful
kernel would leave reset behavior dependent on the loaded project.

The first core step now gives `VoiceSynth` an immediate, allocation-free reset
that preserves sound controls and gives `Oscillator` a phase/smoother reset at
its current frequency and level. Their tests compare a new note or signal
against a freshly prepared instance. Neither method is wired into Graph CLAP
until the remaining kernels have a complete reset path.

Test with Note Voice (held note and filter), Tone Texture (oscillator phase),
Sample Voice (active sample cursor), and a delay or reverb graph with a live
tail. In each case compare the first post-reset block against a newly prepared
instance with the same current controls. Include two consecutive resets and a
host callback timing gate with the largest authored sample asset. The reset
test must also check that the 128 public parameter values and saved project
state remain unchanged.

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
