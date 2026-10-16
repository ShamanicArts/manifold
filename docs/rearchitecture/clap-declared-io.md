# Authored buses in CLAP — 30 September 2026

Extends the [explicit audio bus contract](explicit-audio-buses.md) into the Graph
CLAP class. This closes its fixed-stereo admission limitation. Full project ports,
VST3/device integration, dynamic host lifecycle, egui and the legacy port remain open.

## Implementation

The saved `signal.io` is the bus authority. `graph_io.rs` projects its ordered buses
into `clap.audio-ports` and one `Authored project` configuration, including the
configuration-info extension. One/two-channel buses identify mono/stereo; wider
buses report an unspecified discrete audio type. No surround layout is invented.
The first input/output, when present, is the corresponding main port. Bus string
IDs map deterministically to direction-local CLAP IDs; hash collisions reject
admission. The legacy three stereo ports retain their existing IDs and pairings.

Inactive state/package import checks the host's supported rescan flags before
changing state, then notifies it after releasing state/port locks. An unsupported
layout leaves the project intact. Active imports and script transactions must keep
the declared buses, names and optionality; output/input channel maps can change.
An active bus-shape change rejects. This follows the
[CLAP audio-ports contract](https://github.com/free-audio/clap/blob/main/include/clap/ext/audio-ports.h).
The current authored layout is the only configuration; a menu of stereo/surround
presets does not define this graph's supported I/O.

`IoHostBuffers` is shared native host glue. All scratch is reserved before
activation. It copies every input before rendering or writing host outputs, so
overlapping raw host buffers cannot create aliased Rust slices. Bounds and bus
widths reject before the CLAP callback consumes a pending graph publication or
control mailbox. The callback uses bounded stack views into the same prepared
processor and execution plan. It adds no locks, compilation or heap work.

`NativeProcessor::process_io_host_automated` applies fixed host-slot controls at
sample offsets on declared buses, with the same validation and event-span rules
as stereo. `process_io_automated` accepts graph parameter IDs. Invalid automation
rejects before parameter/state/output changes. `flush_host_automation` handles
zero-frame controls for either layout. Admission remains bounded by the existing
1,024 split MIDI events and 4,096 automation points per block.

## Package recall fix and usable review

The new package-level probe exposed reversed arguments in the arbitrary-I/O
controller's restore export. It now uses the standard `restoreProject(host,
document)` contract. This was a real cold-recall failure missed by construction-only
tests. Native scripting now cold-loads the saved controller; the browser review
loads and swaps through the same portable package as CLAP.

- [Live package and routing editor](https://wubulon.tailfac9f9.ts.net:4174/arbitrary-io.html).
- [Portable package](https://wubulon.tailfac9f9.ts.net:4174/packages/arbitrary-io.manifold.json).
- [CLAP reports and stem auditions](https://wubulon.tailfac9f9.ts.net:4174/clap-io/2026-09-30-clap-io-v1/).
- [Fresh browser/native comparison report](https://wubulon.tailfac9f9.ts.net:4174/arbitrary-io/2026-09-30-arbitrary-io-v5/report.json).

The exported shared-library host probe records **8,192 frames × five channels**
identical to both fresh native-library and AudioWorklet recordings. It discovers
3+1 input and 4+1 output channels; exercises optional disconnection, five script
swaps, malformed blocks retaining pending edits, rejected shape/requirement changes,
stable port identity, cold package recall and a host that rejects rescanning.
No audio device or editor is opened. The three manual audition WAVs contain two
seconds of four changing host sine inputs routed through the recalled graph:
two stereo stem pairs and its independent mono send. They are routing auditions,
not Main synthesis or a legacy-project/performance comparison.

Separate Rust callback tests guard allocation and deallocation around discovery's
audio consumer, live publication, asymmetric in-place processing, zero-input
generators, mono/discrete outputs, zero-output processing, timed automation and
flush. Their counters are not falsely attributed to the external shared-library
probe. Native automation matches the established stereo path at every sample.
The final workspace gate passes 523 tests; web/TS/package freshness passes 76.
Release-mode CLAP I/O tests pass four cases and native I/O tests pass six, with
callback allocation/deallocation guards. The standard Wasm and production web
builds pass. These counts are gates for this checkpoint, not a full-port audit.

## Reproduction and next tasks

Generate/check the controller and package with `scripts/build-js-project.mjs` and
`scripts/generate-arbitrary-io-package.mjs`; both are in the package freshness gate.
Build with `scripts/build-clap.sh`. Run `scripts/verify-arbitrary-io-browser.mjs`
through `scripts/with-private-null-audio.py` with a fresh label, then run:

```sh
python scripts/probe-clap-arbitrary-io.py \
  --module target/clap/ManifoldFX.clap \
  --package web/public/packages/arbitrary-io.manifold.json \
  --comparison web/public/arbitrary-io/<fresh-browser-label> \
  --evidence web/public/clap-io/<fresh-clap-label>
```

The SDK probe is offline and needs no private audio server. Reports retain binary
and package hashes. Host acceptance and flags are observed, not inferred from
successful core tests.
Use `scripts/publish-clap-io-review.py` to package an accepted capsule, then build
the web preview. It checks the measured module/package hashes before bundling.
The 7.5 MB Linux archive is a generated artifact excluded from Jujutsu; its
recipe, report, archive hash, source snapshot, recordings and logs are tracked.
`scripts/review-clap-io-browser.mjs`, through the private null-audio helper,
checks a live package swap/download and captures both the live editor and review
page. It opens only headless Chromium. No user plug-in installation is changed.
The last review found and fixed immediate Blob URL revocation cancelling the
browser download. Its failed/successful logs and `download-followup.json` are
retained. The downloaded package preserves the edited output map; all three WAVs
play for two seconds. The `.tgz` archive fetch matches its recorded hash, including
through a client that decodes HTTP compression. The earlier `.tar.gz` publication
manifest is retained; Vite treated that suffix as HTTP content encoding.

Next carry this shared native I/O buffer/automation boundary into VST3 bus
arrangements, with explicit speaker semantics and exact channel-count negotiation.
Then verify CLAP/VST3 bus use and package recall in a real DAW/private sink, extend
standalone devices and shape-replacement lifecycle, and complete module widths and
non-audio host boundaries. Continue actual Main branches, LoopLayer/transport and
the remaining inventory through the public authored graph. No Main or full-port
acceptance gate is closed by this work.

The [VST3 follow-up](vst3-declared-io.md) now implements this shared boundary and
a measured REAPER save/reopen render. CLAP declared I/O in a real DAW and the
remaining complete-port tasks above are still open.
