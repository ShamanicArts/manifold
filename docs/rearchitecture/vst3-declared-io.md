# Authored channels in VST3 — 1 October 2026

Extends the [shared bus contract](explicit-audio-buses.md) and
[CLAP adapter](clap-declared-io.md). This is a tested host boundary, not completion
of Main, egui, standalone devices, wider module ports or the legacy inventory.

## Review now

- [Build, SDK recordings, REAPER render and reports](https://wubulon.tailfac9f9.ts.net:4174/vst3-io/2026-10-01-vst3-io-v3/).
- [Edit the actual DAW-saved package in the browser](https://wubulon.tailfac9f9.ts.net:4174/arbitrary-io.html?package=/vst3-io/2026-10-01-vst3-io-v3/reaper-review/recalled.manifold.json).
- [Linux VST3 bundle, packages and relocatable DAW review project](https://wubulon.tailfac9f9.ts.net:4174/vst3-io/2026-10-01-vst3-io-v3/Manifold-authored-io-linux-x86_64.tgz).
- [Actual live browser capture](https://wubulon.tailfac9f9.ts.net:4174/vst3-io/2026-10-01-vst3-io-v3/daw-package-live.png).

The archive includes the complete `ManifoldFX.vst3` directory and a `review`
directory with the REAPER project, input WAV, measured output and recalled package.
Keep the bundle intact. Its existing editor has not gained a bus authoring UI;
the graph API and live web editor remain the bus authoring surface.

## Graph ownership and host projection

The same `signal.io` remains the graph authority: three main input channels,
optional mono input, four independent output channels and a separate mono send.
DSP uses the same prepared processor and execution plan as native, CLAP and Wasm.
`IoHostBuffers` copies all input PCM before writing host output, supports overlapping
buffers and applies the shared native automation/event spans. VST3 reconstructs
the logical bus views with bounded stack arrays. It adds no callback compilation,
locks or heap work.

VST3 speaker arrangements are 64-bit speaker masks rather than a neutral discrete
channel-count type. See the SDK's
[speaker definitions](https://github.com/steinbergmedia/vst3_pluginterfaces/blob/master/vst/vstspeaker.h)
and [audio processor contract](https://github.com/steinbergmedia/vst3_pluginterfaces/blob/master/vst/ivstaudioprocessor.h).
The initial implementation exposed wide logical buses and waited for a host mask
proposal. Its SDK host succeeded; REAPER could discover the changed counts but
could not activate those unspecified arrangements. The failed renders and traces
are retained under `2026-09-30-vst3-io-v1`, including `reaper-8`'s silent render.

The implemented adapter retains mono/stereo logical buses as mono/stereo VST3
buses. It projects each channel of a wider logical bus into a named mono VST3
port, such as `Independent channels · 3`. It preserves logical grouping and
channel order in the portable project, adds no spatial mixer, and avoids inventing
surround/ambisonic speaker roles. The measured example has four mono VST3 inputs
and five mono outputs. The first host port is main; subsequent ports are auxiliary.
Optionality applies to the corresponding projected input ports. Mono arrangements
are initialized before activation, and proposed arrangements must retain every
port width. Invalid proposals leave the existing arrangement intact.

The former 256-channel storage constraint was removed on 13 October. Prepared
logical-to-host mappings and atomic activation entries now scale with the declared
ports. The port metadata and running processor share ownership; a same-shape edit
preserves activation, while a new shape receives new storage and follows the host
restart lifecycle. Callbacks borrow these tables without allocation or a metadata
mutex. Counts must fit VST3's actual signed 32-bit host interface.

The current SDK proof exercises 660 → 669 → 588 channels, activation beyond port
256, same-shape publication and reactivation after shape changes. The native copy
boundary additionally checks cross-channel input/output aliasing and exact timed
automation with zero callback heap work. See [I/O scaling](io-storage.md).
Wider primitive/module ports remain separate work; existing kernels retain their
actual two-lane capabilities. These tests do not assert DAW support for every
possible layout.

## Publication and state lifecycle

Live script transactions can change channel maps and graph composition while
retaining the host shape. Bus ID/name/count/optionality changes through normal
script/import admission reject before replacing the running graph.

VST3 `IComponent::setState` has separate host-owned restart admission. An active
shape load validates and prepares the candidate on the control thread, stages
its package and metadata, and pauses rendering until the host stops/reconfigures.
It never publishes the new graph into the old callback buffers. Host saves keep
the published graph until stop commits the staged state; activation then prepares
that committed shape. This is a host reconfiguration path, not seamless live bus
shape mutation. A host that does not complete the restart cannot process the
staged layout. Other host lifecycle cases remain required work.

The controller reports `kIoChanged` for accepted declaration changes through
import or component state. It releases project/presentation locks before invoking
the host restart handler. Ordinary parameter or route edits do not request an I/O
restart. The opt-in `MANIFOLD_VST3_IO_TRACE` records only control-thread SDK
negotiation/state calls; it never logs from `process`.

## Measured evidence

| Boundary | Observed result |
|---|---|
| Exported VST3 factory/component/audio processor | 8,192 frames × five output channels exactly equal the native library, actual browser AudioWorklet and exported CLAP recordings |
| Same packaged JS controller | Five live swaps, invalid block retry, rejected shape/optionality changes, optional input deactivation, cold recall and another script edit pass |
| Release callback guards | Five cases pass: live publication/in-place routing, exact native automation agreement and zero-frame flush, 256 input channels, zero-input/disconnected/no-output graphs, host-owned state restart |
| REAPER 7.79 Linux | Four input/five output channels; actual saved controller and `signal.io` retained; reopened RPP renders 48,000 six-channel frames with maximum signal error 6.3143e-8 and exact silence on the sixth channel |
| Actual DAW save in the browser | Restores swapped routes; user JS and controller edits, optional disconnect/reconnect, download and stop/start recall pass; callback allocation/deallocation/failure counters are zero |
| Gates | 528 workspace and 76 web/TS/package freshness tests pass; standard Linux VST3 and production web builds pass |

The external SDK probe cannot observe Rust heap counters across the shared-library
boundary; its report says so. Separate release callback tests provide those guards.
SDK audition WAVs contain two seconds of host sine inputs through recalled routing.
The DAW render is one second of known four-channel host input. These establish
channel identity/routing and recall, not Main synthesis, legacy project equivalence
or C++/Rust/Wasm performance parity. No DAW script command dispatch is claimed.

REAPER runs only on a disposable Weston/Xwayland display and a verified private
PipeWire null sink, using a temporary host profile and an isolated plug-in copy.
The browser review uses headless Chromium through the same private audio wrapper.
Neither opens an editor or a window on the user's desktop. Failed cold fixture
attempts also remain recorded; the RPP wrapper length must match the package blob.
The accepted probe checks the actual DAW-saved controller/I/O and renders by
reopening that DAW save, rather than treating preset selection as proof of loading.

The normal bundle build and an isolated library/example build produced different
binary hashes. The publisher rejected mixing
them. Capsule v3 measures the standard bundle's exact shared library in both SDK
and DAW; the downloadable archive and browser-fetched hash are checked against it.
Capsule v2 remains an earlier successful direct-build measurement.

## Reproduction and continuation

```sh
./scripts/build-vst3.sh
cargo build --release -p manifold-vst3 --example probe_packaged_vst3
MANIFOLD_CLAP_IO_RECORDING=web/public/clap-io/2026-09-30-clap-io-v1/clap.f32 \
  target/release/examples/probe_packaged_vst3 --arbitrary-io \
  target/vst3/ManifoldFX.vst3/Contents/x86_64-linux/ManifoldFX.so \
  web/public/packages/arbitrary-io.manifold.json \
  web/public/arbitrary-io/2026-09-30-arbitrary-io-v5 \
  web/public/vst3-io/<fresh-label>
python scripts/with-headless-weston.py -- python scripts/with-private-null-audio.py \
  python scripts/verify-declared-io-reaper.py \
  --evidence web/public/vst3-io/<fresh-label> --host-label reaper-review \
  --seed-project web/public/vst3-io/2026-09-30-vst3-io-v1/reaper-3/authored-io.rpp
```

The publisher checks measured hashes before packaging; it preserves the measured
RPP and creates a separate relative-path review copy. `.tgz` avoids the web server's
`.gz` HTTP content-decoding behavior. The generated archive and isolated raw
plug-in copies are ignored by Jujutsu; recipes, reports, source snapshot, hashes,
recordings, captures and logs are retained. Run `review-vst3-io-browser.mjs` through
the private audio wrapper after publishing/building to verify the live links.

Next verify CLAP declared I/O in a real DAW, extend standalone native devices and
host reconfiguration/rollback, then address module/non-audio port boundaries.
Continue Main Sample/Ring/FM/Sync/additive/morph, true LoopLayer/quantized transport,
the remaining legacy projects and egui through public authored primitives. Keep
the complete-port goal active and retain regular usable builds and behavior proof.
