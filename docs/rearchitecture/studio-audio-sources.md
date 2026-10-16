# Studio audio sources belong to the authored graph

## User decision

Settings owns audio hardware: which browser microphone or standalone interface
feeds the host input. A Studio-wide final listening level may live outside the
project. Saw, noise, live-input gain and source selection are authored graph
objects, visible in the graph/Explorer/Inspector and editable in source. Examples
may assemble them as needed; Studio must not inject that patch into every project.
This corrects the rejected relocation of the old audition bar into Settings.

The later [Device/export boundary decision](studio-device-audition.md) separates
Studio test arrangements from the effect or instrument being exported. That later delivery implements a separate Input graph dock; the source patch
below remains an independently authored library example.

## Implemented

- `Audio Sources` is a normal Device declaration, saved as a portable project and
  embedded in the wiki. Its saw and noise feed a crossfader; that result and live
  input feed a second crossfader, followed by patch output gain. Frequency, noise
  level/color, live gain and both blends address ordinary saved parameters.
- The two existing crossfaders permit both selection at their endpoints and
  continuous blending. They do not suspend unselected generators. The patch can
  be wrapped with the existing Device tooling; no Studio-only source model exists.
- Named `sawOscillator` and `sineOscillator` definitions configure the existing
  oscillator kernel. There is no duplicate browser/native oscillator implementation
  for these project sources. Definitions retain editable processor parameters.
- Gain, spectral, reusable-filter, field and nested-field demonstrations contain
  their own tones. The field's nested `probe` Device retains `/probe/gain`.
  Downloading or opening the lessons in Studio retains the sounding source.
- Shared egui Settings displays hardware selection. Start/Stop and Master are in
  the top application bar. Live input also exposes hardware selection in its Inspector. Project controls no longer use synthetic `/studio/input` or
  `/studio/input-gain` parameters. Blank projects still use input → output.
- Browser Studio captures only an explicitly connected microphone/interface. It
  uses the existing declared-bus routing adapter, including silence when no
  hardware is connected. Rejected and superseded permission requests retire
  candidate tracks and preserve accepted ownership. The wiki uses the same
  hardware service and bus adapter. Other public Web Audio input bindings remain
  available to library consumers.
- Standalone generates no hidden saw/noise. Its selected CPAL input captures stereo
  through a bounded SPSC buffer into the existing host bus adapter. Callback paths
  perform no allocation, locking, compilation or filesystem access. Device identity
  uses CPAL IDs, so identically named hardware routes are distinguishable.
- Older dedicated DSP-live-scripting pages retain their separate legacy host test
  harness; this change removes that harness from Studio, not from every historical
  workbench page. Existing saved effects which depend on external input now need
  actual host input or an authored source connection in Studio.

## Validation

The browser review `web/review-studio-input-switch.mjs` now tests project parameters
and hardware reconnects. It runs the actual prepared Wasm host on a verified silent
sink with a generated microphone stream. Saw → noise → live → disconnect →
reconnect → mute → saw succeeds in one process. Diagnostics report no processing
failures or Rust callback allocations/deallocations. The source location and
frequency inspector are captured in the actual egui workspace.

The standalone review uses an owned isolated Xvfb display, the private Pulse null
sink and its monitor input. Actual Settings clicks connect/disconnect/reconnect
that device. A private stereo test signal is captured at roughly 0.073 RMS, drops
to below 0.000001 on disconnect, returns after reconnect, and yields to the authored
saw when its crossfader is changed. The host failure flag remains false. Physical
audio devices are not opened by this probe.

Native DSP tests additionally check pitch doubling, noise, distinct left/right
live input, silence and save/reopen. Visual-edit continuity tests compare every
block of the now internally generated field tone against an untouched instance.
Web tests cover permission rejection/late completion, downloadable source and
accepted control recall. Human lessons and the MCP authoring guide describe the
same ownership rules.

Final checks: 572 Rust workspace tests, 191 web-suite tests and the additional
source-wrapping regression pass. Native release, UI Wasm, DSP Wasm and production
website builds pass. All four migrated wiki lessons were started, measured and
stopped in the actual browser with no runtime exceptions.

See [machine-readable evidence](evidence/2026-10-12-graph-sources.json). Actual
captures and logs live under `~/.cache/manifold/graph-sources-20261012/`.

## Limits

Native capture currently requires float32 input at the output device's sample
rate and uses its first two channels (mono is duplicated). It has bounded overrun
and underrun handling, not adaptive resampling between independent hardware clocks.
Native output device selection remains `MANIFOLD_AUDIO_DEVICE` at launch;
live output-device switching is not implemented. Native Start/Stop gates Studio listening independently of Master and retains the
chosen Master level. Processing continues while listening is off so accepted
graph edits can still publish at audio block boundaries.

Device wrapping transient DSP-state continuity remains separate from this source
ownership correction. No Nacre artwork or product-specific design was changed.
