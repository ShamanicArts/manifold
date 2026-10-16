# Nacre / spectral field device

## Direction

Lucas requested a polished physical Three.js device with liquid chrome,
crystalline colour, a Chladni particle simulation, and diegetic Manifold controls.
The supplied references describe its inner universe: prismatic facets, wire
lattices and spectral light in black space. He then requested bolder colour and
motion, and a controllable basic audition instrument in the inspector while the
product remains an effect.

### Reference correction, 3 October

Lucas rejected the subsequent literal mask/oversized-eye interpretation. That
entire visual pass was reverted. The reference's faces and bodies establish a
material universe; they do not prescribe an eye, head or crown for this device.

The plugin panel itself should own the physical device presentation. A small
blue box floating over a plane in an empty scene is inadequate framing. Develop
the actual surface, edge construction, control panel and visible connections as
one composition. Use distinct coloured materials and prismatic/rainbow cables
that plausibly connect to ports. Manifold controls specify the interaction kit,
not a requirement for a drab green panel. Keep the controls readable and the
sound/Chladni relationship live. Review the composition before elaborating it;
do not substitute literal reference motifs or decorative complexity for this
direction.

## Implemented slice

- `ui-nacre.mjs` defines one portable graph: external/audition crossfade →
  FFT-bin pitch displacement → resonant bandpass → nonlinear excitation, with
  authored dry/wet, bypass and output branches. All DSP is in existing Rust
  primitives. The authored effect defaults to host input.
- The audition voice is a public extended oscillator; pitch, waveform, level
  and unison are exposed in their own inspector group. It is part of the same
  graph. The standalone website explicitly selects audition when Listen starts.
- `ui-nacre-view.mjs` owns the physical scene, projected filled kit sliders,
  actual parameter buttons/presets, thin-film chrome, facets and 10,000 grains.
  Generated full source remains editable in the live authoring editor.
- Grains relax toward the nodes of an analytic standing-wave field using
  `-gradient(F²)`. Focus and displacement set its modes; real output spectrum and
  energy alter the modes, agitation, optical lattice, crystalline light and
  liquid movement. Field pointer/keyboard gestures change graph endpoints.
  Graphics never process audio or provide a second DSP parameter store.
- `nacre.html` is a generic import of the public author/runtime/UI libraries,
  with no creator shell required. Studio remains the authoring/export surface.
- The kit now provides `placeProjectedPanel`: a renderer supplies four projected
  corners; real accessible HTML controls retain keyboard and pointer ownership.
- Browser output analysis reuses prepared arrays and exposes 32 logarithmic
  bands, RMS, peak Hz and sample rate. Native CLAP/VST3 use the core's prepared
  Hann FFT and a bounded atomic mailbox over the actual processed output.
  Native callback analysis allocates and locks nothing. A pre-existing VST3 RMS
  tap before render was moved after a successful render.

## Acceptance and evidence

The native SDK gates pass (42 CLAP, 50 VST3), including callback allocation
checks. The native FFT tone/silence test passes, the core checks for Wasm,
and the final web suite passes 118 tests. Browser review uses actual physical
controls and the egui inspector, then exports through the website's build form.

The website export and exact downloaded CLAP and VST3 pass in REAPER with
real input. Held field changes occur before release, the native spectrum/field
are live, authored source/layout/values survive save/reopen, and editor-closed
output remains non-silent. The first native screenshots caught a clipped
650-pixel authored height in a 600-pixel editor. The instrument pane now owns
its height; the corrected website archive passes both formats with a 774×526
face fully inside the 800×600 editor. Screenshots were inspected directly.

- Live device: https://wubulon.tailfac9f9.ts.net:4174/nacre.html
- Review, video, audio, native screenshots/download/receipts:
  https://wubulon.tailfac9f9.ts.net:4174/nacre/2026-10-03/
- Authored source: `packages/manifold-author/examples/ui-nacre.mjs`.
- Private exact-archive probes: `artifacts/nacre/2026-10-03/delivery` and
  `artifacts/nacre/2026-10-03/native`. Published reports are linked above.

The browser video and actual output audio are separate recordings; precise
video/audio synchronization is not claimed.

## Interaction performance correction

Lucas reported the field drag feeling sluggish while sliders were smooth.
The field was synchronously publishing two presentation updates per raw pointer
event. These repeatedly copied full authored source and history. The creator
also copied the entire project once per node on every display frame.

- Pointer moves now only retain the latest position; the display frame publishes
  one atomic focus/shift intent through `CustomViewAPI.setBatch`.
- The acknowledged gesture queue retains the newest pair while older commands
  complete. Release submits the last position. Fine-mode re-anchoring preserves
  values, and a held gesture changes audio before release.
- Gesture presentation reuses the runtime's published snapshot; it overlays
  transient intent without cloning source/history for every pointer update.
- Creator node descriptors all consume one presentation snapshot per frame.
- Duplicate Nacre view subscriptions were removed.

BB's actual browser was measured with identical 3.5-second field sweeps. Full
snapshot copies fell from 1266 to 420; measured copying time fell from 804 ms
to 278 ms (65%). Both stopped-audio runs already rendered at 60 fps, so this
is evidence of reduced main-thread overhead, not a reproduction or universal
resolution of the reported sounding stutter. The browser interaction recording
and DAW probe separately check changes while audio is running. Performance on
the user's device remains a live review matter.

## Limits to keep visible

The field is an artistic analytic Chladni simulation, not a physical plate solver.
Browser WebAudio and native Hann FFT expose the same band conventions but their
window/normalization implementations differ; exact numerical analysis parity is
not claimed. The legacy waveshaper's tone factor is not true oversampling.
The existing vocoder and host latency/compensation policy need further product
work. This slice does not claim the complete legacy migration or production
graphics performance across all GPUs. No Windows/Mac build is claimed here yet.

The separate agent owns the live bridge response-consumption fix. These changes
must be preserved in its working change when checkpointing this device.

## Panel composition revision

The authored presentation now uses an orthographic face that fills its pane.
The floor and distant enclosure framing are removed. Rose enamel, pearl ceramic,
gold inlay, chrome rims, visible fixed IN/OUT fittings and prismatic cable looms
make the control area and chamber parts of one surface. The original crystal
geometry and placement are retained. Cable light follows measured output energy;
the fittings are indications of the fixed audio interface, not patch controls.

Six component palettes supply both filled and remaining slider colours. The
public web kit now paints its declared background and the projected panel
inherits each component's accent/background/text style. The same declarations
reach the automatic inspector and exported face. Colours remain editable in
the Manifold project source, with the existing colour swatches.

Touch pressure is local to the contact position, with a visible ring, liquid
displacement and grain agitation. The existing frame-paced endpoint batch
continues to control the sounding graph before release.

Studio initially exposed a black generated reflection environment. Re-baking
from its visible canvas restored the materials. The authored face now prepares
its environment on the first visible frame after sizing the canvas. Resizing
also disposes the entire previous enclosure resource set without disposing
shared chamber materials. Studio's title now identifies its selected program;
the egui toolbar uses the general Manifold name.

Studio restores saved authored source, so a bundled example rebuild does not
overwrite an existing saved edit. The revised project has a distinct shared
project URL. The standalone Open Studio link opens this same authored project.

- Studio: https://wubulon.tailfac9f9.ts.net:4174/studio.html?program=ui-nacre&project=/nacre/2026-10-03-panel/nacre-final.manifold.json
- Source: `packages/manifold-author/examples/ui-nacre.mjs` and its
  `ui-nacre-view.mjs` presentation module.
- Reference reading: `nacre-art-direction.md`.

This is a composition revision for review, not a claim that the original
artistic brief or all Manifold migration work is finished.

### Reviewed panel delivery

Evidence: https://wubulon.tailfac9f9.ts.net:4174/nacre/2026-10-03-panel/

- Actual BB Studio capture shows the revised project beside its editable source,
  graph and inspector. Saved source was preserved; the fresh shared-project
  URL selects this revision explicitly.
- Private browser review passed all six rendered accent/background pairs,
  held touch gestures, fine control, sound-only changes in the audition voice,
  real external input, silence, narrow layout and the actual egui audition
  inspector. The screen recording and captured output audio are published.
- The website export downloaded `Manifold-Nacre-linux.tgz`, SHA-256
  `68bef08784fcea111f2ec9ffdf041127231fb3f2d36a947ff8a3d0aa2821355f`.
  The served download was checked against that same hash.
- Both exported Linux CLAP and VST3 were loaded from that archive in REAPER,
  using private audio and isolated X11. The exact authored source and layout
  matched the captured project. Both rendered the full device with its prepared
  environment, consumed native output spectrum, changed parameters while the
  field was held, supported source edits and DAW recall, and continued sounding
  with the editor closed (RMS approximately 0.065).
- The production web/UI-Wasm builds succeeded; 118 web tests passed. The
  compiled native audio graph and I/O are unchanged from the preceding delivery
  when presentation/live-authoring metadata is excluded.

Software rendering was used for automated captures; this delivery supplies
interaction evidence rather than a new GPU-performance claim. Windows/macOS
are not verified for this panel revision.

## Website authoring follow-up

[Nacre through WebMCP](nacre-webmcp-delivery.md) records complete source submission
from a different starter, external local-agent edits, human arrangement and native
export through actual browser tools. It also removes the extra face instructions
and subtitle, repairs compact Arrange ownership, and restores visible preview
input controls in Studio. Its separate evidence URL and archive identify that
reviewed revision without replacing this earlier delivery.
