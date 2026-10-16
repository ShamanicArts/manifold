# Export from the running browser creator

Delivered slice, 2 October 2026. Lucas accepted the native build proof and selected
website → export → download as the next delivery. The preceding CLI milestone
did not implement this workflow.

## Delivered workflow

- Export the accepted graph, live values, source, UI and Three.js view currently
  open in the creator. Unapplied editor drafts are identified before export.
- Choose permanent product ID, name, vendor, version, instrument/effect and
  Linux, Windows or ARM Mac target. Rebuilds preserve identity; a new instrument
  uses a new ID.
- Submit an immutable snapshot to the private build service. Display progress,
  compiler failures and the completed archive, package and build receipt.
- Keep browser audio and live authoring usable during the build. Jobs survive
  tab reload, carry their captured revision and use locally packaged assets.
- Prove the actual browser button, actual generated/downloaded artifact and
  its default source/values in a real DAW. Publish usable builds and pictures.

## Boundary

Rust compilation runs on the configured build machine, not inside the browser.
The current private/Tailscale creator proxies to a loopback build service.
Linux and Windows GNU use this machine; ARM Mac uses the authorized network Mac.
Only the existing authored graph and supported local view dependency contract
are exported. Production signing, arbitrary npm/Rust extension code and the
remaining project port are separate open work.

## Actual evidence

Live creator: https://wubulon.tailfac9f9.ts.net:4174/primitives.html?program=ui-three-tone#plugin-export

Downloads, actual BB browser pictures, native editor pictures, recorded output,
DAW saves and reports: https://wubulon.tailfac9f9.ts.net:4174/browser-export/2026-10-02/

The actual leased BB automation tab applied a green Three.js source edit, set
pitch to 440 and cutoff to 1234 through the public runtime, and pressed the
export form for Linux, Windows and ARM Mac. All three jobs completed, their
downloaded source/graphs matched the captured revision, and every bundled file
matched its recorded hash. An actual page reload restored the completed job
and its download links.

The downloaded Linux archive was extracted to an independent DAW search path.
Both formats opened in real REAPER with that edited default source and those
values. Their real WebGL2 view loaded, audio was recorded through a verified
private null sink, and a live cutoff edit to 2345 survived actual DAW save/reopen.
Initial/recalled RMS: CLAP 0.04506/0.04547, VST3 approximately 0.04506/0.04547.
The published window crops contain actual captured pixels, without redrawing.

The final build-service check changed cutoff to 3456 and scene source after
submission. The archive retained the captured source and cutoff 1234. Browser
output RMS was 0.04580 before and 0.04604 after the edit. This establishes
continued playback at those checkpoints, not sample-perfect/xrun-free output.
The existing browser bridge's advertised `view.inspect` operation now dispatches
to the actual custom-view inspector, matching the native editor route.

The native preflight rejected a project requiring `navigator` in graph logic,
with a diagnostic and no downloadable plug-in. Source is packaged as data in
Node, then checked in the native QuickJS/graph host before SDK compilation.
Each preflight process has a 30-second bound. Product/path/target validation and
the same-origin proxy rejected malformed identities and a cross-site request.

The website-produced Mac and Windows archives were compiled and downloaded in
this slice. Their editor/recall platform evidence remains in the preceding
[native milestone](native-export-delivery.md); this slice repeated actual DAW
review for both website-produced Linux formats. Do not imply a fresh Mac/Proton
DAW pass for these new artifacts.

## Reproduction and operation

Build the creator with `npm --prefix web run build`. Start the service in an
owned persistent terminal:

```sh
python scripts/serve-plugin-exports.py
# Add --mac-host USER@HOST --mac-root CHECKOUT --ssh-key PRIVATE_KEY for ARM Mac.
npm --prefix web run preview -- --port 4174 --strictPort
```

The current service runs in `Manifold-v2:exports` in tmux, with the configured
network Mac. The existing Tailscale route and review server remain intact.
Vite development/preview proxies `/__manifold/exports` to loopback port 4181.
Linux needs the native toolchain/WebKitGTK; Windows needs the Rust GNU target
and MinGW (configured by `--mingw`); Mac needs its native toolchain and checkout.

- `GET /__manifold/exports/capabilities`: configured targets and both formats.
- `POST /__manifold/exports`: product details, target, accepted live project,
  revision and view declaration. Returns a queued job UUID.
- `GET /__manifold/exports/UUID`: persistent status, stage and diagnostic tail.
- Completed jobs expose archive, exact package, file-hash manifest and receipt.

One worker serializes builds; the pending queue is bounded to four. Generated
UUID directories isolate package/assets/output. Completed downloads and inputs
survive service restart; interrupted jobs are marked failed with a retry message.
Per-program creator storage retains identity and the last twelve job references.
Unapplied project or view drafts disable export. Opaque job URLs belong to this
private deployment; public multi-user operation still needs authentication and
per-user authorization.

Jobs reside under `target/web-exports/jobs`, capped at 6 GiB retained storage.
Successful jobs discard duplicate assembled bundles and asset snapshots while
retaining downloads, input, manifest, receipt and diagnostic log. Existing user
downloads are never silently pruned. Shared Cargo caches remain outside that cap.

Review commands are `scripts/review-browser-export.mjs` (explicit leased BB
connection), `scripts/review-browser-export-daw.py` (isolated REAPER/private sink)
and the native `validate_package` example. Final Vite build, native preflight
build and the independent importing consumer build passed. No DSP kernels were
changed in this slice.
