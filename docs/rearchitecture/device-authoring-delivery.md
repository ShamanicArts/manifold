# Device authoring: first public example migration

12 October 2026. Lucas accepted the named-object Device design and authorized
migration. The governing rule is **expose semantic complexity; hide incidental
complexity**, for musicians with or without programming experience.

## Delivered

- The local `manifold` package has creative, browser, live-project and expert
  graph entry points. Existing imports remain compatible; no registry package
  has been published.
- The wiki's actual gain, ring-modulation and spectral examples use imported
  processor definitions, named instances, `configure`, typed ports and Device
  controls. Their HTML controls derive musical metadata from those declarations;
  only page layout, slider steps and demonstration presets remain page-owned.
- Concepts, embedding, spectral and ring lessons teach the implemented API.
  JavaScript vocabulary, local names, stable identity, imported definitions and
  API members are explained. The MCP guide source and copyable agent prompts
  carry the same authoring rule. An already running native binary needs rebuilding
  to serve its updated compiled-in guide.
- `BrowserDeviceHost` prepares the declaration through existing GraphWorkspace,
  BrowserGraphHost and LiveGraphSession machinery. A website passes an actual
  control reference to `setControl`; acceptance, range checks and publication use
  the existing runtime. There is no second DSP engine or project-state protocol.
- Device browser inputs use owned Web Audio adapters for mono/stereo mixing and
  explicit silence when disconnected. Sources can switch away and back. Teardown
  tolerates callers that already disconnected their source, and releases only
  owned routes. The caller retains AudioContext ownership.
- The shared graph projection shows named output-bus routes and removes unused
  legacy boundary scaffolding. The wiki uses this projection too. This changes
  presentation, not the accepted DSP graph.

## Evidence

- Full web suite: **178 passing tests**, including package freshness, types,
  imports, source identity, saved controls and the new output-route/source checks.
- Native JS: `cargo test -p manifold-project-js --test device_authoring` passes
  live gain, source rename and save/reopen through the real native host.
- `scripts/verify-device-prototype.mjs` now renders both the three original Device
  examples and the three migrated wiki examples through native and Wasm engines.
  Each renders 6,144 frames. Maximum difference is 0 for gain/ring and
  0.000001162291 for spectral; native callbacks run with the heap guard.
- `scripts/verify-device-browser.mjs` uses the actual prepared browser runtime,
  with every context verified against Chromium's silent sink. A 0.2 constant
  input measures approximately 0.13 at gain 0.65, 0.05 at gain 0.25, and silence
  at zero. A 0.4 alternate input measures 0.26; disconnecting gives silence and
  reconnecting the original restores 0.13. Two hosts remain independent; closing
  one leaves the other and shared context running. Foreign/copied control
  references and out-of-range values are rejected. Rust processing failures and
  callback heap allocation/deallocation counters remain zero.
- `scripts/verify-handbook-devices.mjs` operates each lesson's actual start,
  control and stop/restart path. Its real AnalyserNodes measure nonzero output,
  accepted controls survive restart, and all owned contexts close. Nodes link to
  their highlighted declarations, output routes are visible, and 390-pixel
  layouts have no page overflow. The BB automation tab is hidden, so animation
  frames can be paused: these measurements do not claim a visible live-scope
  animation review.
- Production Vite build passes. Existing large-chunk warnings remain.

The two browser scripts require a leased BB automation tab connection in
`MANIFOLD_REVIEW_CONNECTION` and the development server (default port 4174).
They restore the tab URL, remove their test hooks and write evidence to the
provided output directory. They never start audio on a physical output.

## Follow-up

The [Device and Studio completion pass](device-authoring-completion.md) supersedes
the implementation gaps below with nested Devices, structural editing, the new
Studio starter, MIDI hosting and broader lessons. This document records the first
migration checkpoint; its counts and limitations describe that checkpoint.

### Open at this checkpoint

Studio's default new-project template and the older primitive/example library
still use their existing contracts. Structural graph edits must generate readable
Device source before changing that template; migrating only its starting text
would regress working graph tools. Next: Device source editing and nested reusable
Devices, then broader examples, custom presentation/resources and MIDI hosting
through the convenient browser facade. The existing expert runtime retains its
MIDI and resource support.

The Nacre-derived field lesson still uses its existing composition authoring
contract. It is not counted as a Device migration. No artwork was changed.

The browser Device host currently needs cross-origin isolation and the prepared
Wasm/worker assets; the development/preview handbook routes now supply the
required headers. Public hosting must do the same. Package publication, the
complete Rust/DAW/platform acceptance matrix and public deployment remain open.
No fresh full Rust workspace run, native GUI test or physical-device playback
is claimed by this slice.
