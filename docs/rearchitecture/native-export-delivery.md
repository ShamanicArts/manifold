# Authored custom-view plug-in export milestone

2 October 2026. Delivered following Lucas's acceptance of the next
publishing milestone, with Windows/Proton and the network Mac mini as real test
platforms. Completion requires usable products, not just a cross compilation.

## Work and acceptance

1. Export one authored package with permanent product identity through the
   existing native Graph adapters. Package local Three.js, kit, egui and source.
2. Open Linux CLAP and VST3 in real REAPER. Drag the scene, use kit controls,
   edit view source while sounding, exercise host automation, close/reopen the
   editor and save/reopen the session. Publish downloads and actual pictures/audio.
3. Build on the ARM Mac mini and embed the same creator in the DAW's NSView.
   Verify native view, gestures and recall on that machine. Keep playback away
   from physical speakers. Produce platform downloads and screenshots.
4. Build Windows PE plug-ins, open them in Windows REAPER under Proton, and
   exercise their editor/runtime where the compatibility layer permits. Record
   WebView2 availability separately from DSP/host loading. A PE build alone
   does not establish Windows editor compatibility.
5. Provide a reproducible export command and truthful platform status. This
   publishing slice does not close the remaining legacy instrument/rack port.

## Implementation delivered

- Shared `build/plugin-export.rs` reads an explicit export manifest and generates
  stable identities and default package bytes. IDs derive from the permanent
  product ID and processor/controller role, never source or build time.
- Existing Graph processors load that package through their normal native
  QuickJS/controller/state path before activation. No new DSP implementation.
- `scripts/export-plugin.py` assembles platform bundles, offline assets, project,
  hashes and an archive. The sample is `projects/exports/three-tone.json`.
- Native output snapshots carry decimated RMS from the prepared output scratch;
  the audio callback does bounded arithmetic and an atomic store. View code stays
  in the UI host and graph orchestration stays in the control worker.
- Linux's actual creator displayed WebGL2, accepted a real Three.js pointer drag,
  kit edit, custom view source change and DAW automation. Close/reopen testing
  exposed a real UI stall: the host joined a pipe reader while WebKit descendants
  retained stdout. An owned process-group shutdown fixed the stall; both formats completed close/reopen and actual session recall with continuing recorded audio.
- macOS/Windows gain an in-process embedded Wry view with UI-thread native timers.
  Actual Wry objects stay in thread-local storage, separate from audio state.
  Both formats passed on the ARM Mac in REAPER with a verified Dummy Audio driver: local WebGL2, live source edits, batches reaching host slots, host automation, editor reopen and actual DAW save/reopen. Actual Sunshine pointer gestures changed the CLAP graph through both Three.js and egui.
- Windows GNU PE DSP shells compiled after normalizing SDK enum signedness.
  Both formats passed the same live controls/source/recall sequence in Windows REAPER under Proton with WebView2 154 and SwiftShader. Both formats also passed with their own delayed/bundled loader and no DLL in the DAW folder. An actual physical VST3 scene gesture and its non-silent private output are recorded in the published H.264/AAC video.

## Delivered platform outcomes

| Platform | CLAP | VST3 | Review route |
| --- | --- | --- | --- |
| Linux x86_64 | Passed | Passed | Actual REAPER, private Pulse sink; recorded edits, editor close and recalled audio |
| macOS ARM64 | Passed | Passed | Actual REAPER on the network Mac, Dummy Audio; Sunshine pictures and physical gestures |
| Windows x86_64 GNU | Passed | Passed | Actual Windows REAPER under Proton, private WaveOut/Pulse; WebView2 154 with SwiftShader |

All six reviewed adapters load the same authored package, retain accepted source,
propagate creator batches to host slots, accept host automation, reopen the
editor and recall the edited DAW save. Pictures/observations/saved sessions and
per-file/archive hashes are on the live review page. Mac/Windows session files
are also provided as small gzip artifacts.

Reproduce the export from the checkout:

```sh
python scripts/export-plugin.py projects/exports/three-tone.json
# Cross target, with that target's Rust/linker toolchain installed:
python scripts/export-plugin.py projects/exports/three-tone.json --target x86_64-pc-windows-gnu
```

`projects/exports/three-tone.json` points at the existing authored package. A new
instrument supplies its own name, permanent ID and package; the Graph shells
remain shared. The archive includes installation instructions and the project.

Checks: 106 web checks, four native live-primitive checks and 92 CLAP/VST3 SDK
checks passed. Final web build and the independent importing consumer build
passed. The host outcomes above are the delivery evidence, beyond those checks.
The final native CSS increment hides browser navigation in an embedded export;
no callback or authored graph behavior changed with that layout adjustment.


## Runtime fixes from real host review

- macOS VST3 required lowercase `bundleEntry`/`bundleExit`; the old uppercase
  entry points compiled but failed actual DAW scanning.
- WebView2 pumps nested host callbacks during construction/evaluation. Native
  adapters release the session lock before construction; a nested tick yields
  instead of blocking on the UI thread's existing lock. WebView destruction
  also happens after releasing the thread-local view borrow.
- A private WebView2 profile per editor fixed the reproduced Proton reopen
  hang. State remains in the native worker and DAW save, outside that cache.
  Retired caches retry cleanup on future attach; no cleanup thread can outlive
  an unloaded plug-in DLL.
- GNU builds delay-import the SDK loader and preload their own bundled DLL
  on editor attach. DSP should not depend on a GUI DLL in the DAW directory.

Live deliverables: https://wubulon.tailfac9f9.ts.net:4174/native-export/2026-10-02/

Subsequent delivery: the [browser export workflow](browser-export-delivery.md)
now supplies the actual website form, captured build job and download links.
This earlier milestone used the command-line exporter.

### Remaining publishing scope

These are development builds: Mac ad-hoc signing, Windows GNU and Proton
review, no physical Windows certification, notarization, universal Mac package,
installer or release publication yet. The first custom dependency resolver
packages Three.js 0.184.0; arbitrary npm dependencies/assets and custom Rust
plug-in code still need an explicit portable asset/build contract. This does
not finish the remaining Main/rack/legacy project port. With an audio device
closed, callback-bound edits can wait for processing to resume; transport
stop with an active engine is covered separately from disconnecting the device.
