# Portable PCM for authored Loop Capture

## Goal and boundary

An authored `loop-capture` node must retain its stopped take when a user
downloads a browser graph or saves a native graph project. The take is a
portable `assets` entry bound to the loop node ID, using the same canonical
interleaved stereo f32 encoding as Sample assets. DSP remains in
`manifold-core`; JS only requests a frozen snapshot and writes the project
document. No PCM serialization, graph compilation, or allocation runs in
`process()`.

The former asset-count, aggregate-PCM, document-size and take-duration quotas
have been removed. Imported assets validate their real frame/byte shape and
finite samples. Native transfer storage is prepared fallibly from every authored
loop's actual capacity; the callback only copies into that storage. Preparation
resamples PCM into the loop's authored ring if the host sample rate changes.
See [sample/capture acceptance](../../web/public/studio/2026-10-13-sample-storage/README.md)
for execution beyond the former thresholds.
Playback is enabled after loading PCM, so a saved `play=1` state is audible
at the first render block. The sample and loop resources share the asset
schema but remain distinct primitive types.

## Save paths

- Browser: `BrowserGraphHost.snapshotLoop(nodeId)` starts a prepared staged
  copy of a stopped loop. Render blocks advance the copy in bounded slices;
  the main thread retrieves chunks and embeds them through
  `snapshotWithLoopAudio`. Empty loops have no asset. A recording or
  overdubbing loop cannot yield a take. The Rack page reports an error and
  leaves the live project running if save fails.
- Native library: `PreparedNativeProject.save_state()` runs on the
  synchronized control thread. It copies each stopped prepared loop,
  updates the asset, and validates the resulting document. A recording loop
  rejects the save. This API requires the host to exclude concurrent audio
  processing while it holds the mutable project.
- CLAP and VST3 graph adapters: deactivation is the synchronized point before
  the active runtime is discarded. They finalize an in-progress recording,
  copy stopped loop PCM into the published project, and retain that document
  for the next activation and host state request. An accepted but unpublished
  replacement still takes precedence over the old runtime. Graph host state
  limits now match the 128 MiB native project bound.
- Reopen: Rust native and Wasm load each asset during preparation and then
  apply the loop's saved play parameter. No audio callback decodes base64 or
  resamples PCM.

## Evidence, 2026-09-29

- Core test restores two frames at 24 kHz into a 48 kHz loop and verifies
  playback plus staged chronological export.
- Native graph test records 512 frames on layer 1, saves its live state,
  reopens it, and captures the same 0.2/-0.3 stereo signal from layer 1
  through the Rack Sample source. A separate test reopens a manually encoded
  loop asset and proves playback.
- Wasm graph test records layer 1, freezes its 512-frame PCM through the
  prepared stage, exports a portable graph, reopens it, and captures the same
  signal under silent host input.
- [Live browser proof](evidence/web-rack-loop-pcm-reopen-live.png): the
  Tailscale Rack page recorded 37,888 frames, downloaded two assets
  (layer 1 plus the original Sample), reopened with layer 1 playing, and
  captured 48,000 frames into Sample. Chromium had no page errors. A private
  null sink carried the test stream; H6 stayed at its two baseline streams.
- CLAP and VST3 adapter tests record 512 frames, deactivate, save through the
  host state path, reactivate, and recover the 0.2/-0.3 signal through the Rack
  layer capture output. They also deactivate mid-recording and verify the
  partial 256-frame take is saved with recording turned off.
- Verification: `cargo test --workspace -q`, `./scripts/build-wasm.sh`,
  `npm --prefix web test` (48 tests), and `npm --prefix web run build`.

## Remaining product work

This implements Loop Capture PCM persistence; it does not yet port Main's
quantized transport, seek/scrub, commit overdub policies, first-loop tempo
inference, or per-layer mixer behavior into an authored module. The browser
snapshot flow has been exercised in the Rack page and the native library
state flow in Rust tests. The CLAP/VST3 adapter tests cover deactivation state.
The subsequent [active host state handoff](active-loop-host-state.md) adds a
prepared PCM and control mailbox, a route-only merge, host stream tests, and
real REAPER Graph VST3 and CLAP saves with silent-input replay. Several layers
and overdub under host save, and concurrent state requests remain open. The
former 1,440,000-frame asset cap has been removed (13 October 2026); the earlier measurements below remain historical evidence.
