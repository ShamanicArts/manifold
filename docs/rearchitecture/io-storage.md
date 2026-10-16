# Audio I/O storage follows the project

The library no longer imposes 32-bus or 256-channel quotas. Bus identifiers and
names also have no invented length cap. Rust and JavaScript validate the authored
routes, unique identifiers, channel counts and exact number representation.
Host adapters check their actual API types and negotiated capabilities.

`InputBuffers` and `OutputBuffers` borrow either declared bus slices or contiguous
planar samples. The compiler prepares input offsets once. Processing a frame range
uses the original buffers, so automation no longer rebuilds a fixed channel table
for each span. Input, output and event validation precede state/output mutation.
Existing stereo-kernel lane declarations remain truthful; this change concerns
host buses and routing, not a claim that every DSP kernel has arbitrary width.

Native adapters allocate planar sample storage during preparation. They copy all
inputs before any host output write, preserving safe in-place and cross-bus aliases.
`RawInputs`/`RawOutputs` give the shared boundary callback-scoped access to SDK
pointer tables without retaining borrowed pointers or allocating channel views.
Standalone and native scripting use the same planar path and publication protocol.
Address-space overflow and actual allocator failure return preparation errors.

CLAP borrows the host's bus tables for that callback. Optional missing inputs are
silence; unsupported or malformed buffer shapes reject before pending edits publish.
The adapter checks u32 bus/channel representation. SDK display names are truncated
with a terminating zero; the full name remains in the project.

VST3 prepares logical-to-host maps and an atomic activation entry per projected
port. `Ports` and each prepared runtime share an `Arc<ChannelLayout>`. Same-shape
edits reuse it, preserving host activation. Shape changes allocate a distinct map;
the old runtime owns its previous map until retirement on the control thread.
The callback validates before publication and then borrows the adopted runtime's
mapping. No callback locks, clones vectors or releases an allocation. Signed i32
port counts are checked at the VST3 boundary. Wide discrete buses still project as
named mono ports, retaining their logical grouping in the project.

## Evidence

- `web/tests/arbitrary-io.test.js`: 41 buses, 660 channels, one 300-channel bus,
  long semantic names, exact round-trip, invalid numeric totals rejected atomically.
- Native `arbitrary_io`: borrowed, planar and raw host paths match the stereo
  reference sample for sample with automation at offsets 0, 7 and 63. 67 processed
  frames in 96-frame planar strides preserve padding. Cross-channel aliases and
  rejection at the last bus are checked. Callback allocations and frees are zero.
- CLAP/VST3 `large_` tests: 41 → 42 → 33 logical buses (660 → 669 → 588 channels),
  actual SDK callback processing, optional-input changes, VST3 late-port activation
  and same-shape publication. Callback allocations and frees are zero.
- `scripts/verify-io-scale-wasm.mjs`: the normal and prepared Wasm artifacts render
  the same three layouts exactly, retain padding and reject address-space overflow
  without wrapping. Prepared allocator instrumentation includes a negative control
  and records zero allocations/frees while processing. A failed normal-Wasm prepare
  leaves its accepted engine usable.
- [Machine-readable Wasm report](../../web/public/studio/2026-10-13-io-scale/wasm-report.json).

These are native/library/SDK execution proofs. Browser audio devices and individual
DAWs may have their own capabilities; a direct Wasm proof is not evidence that a
browser AudioWorklet or a physical interface accepts a 300-channel bus. Existing
browser and native host shape renegotiation rules still apply.
