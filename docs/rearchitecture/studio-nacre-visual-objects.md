# Nacre’s field as an editable graph object

13 October 2026. The bundled Nacre project now exposes its real standing-wave
field, energy follower, mode calculation and parameter bindings in Studio’s
project graph. Both browser Studio and the Linux standalone render these modules
in one shared scene. Hand, eye and creature extraction remains future work.


The [Device migration and Inspector follow-up](nacre-device-migration.md) updates the
audio source and keeps sampled readouts visible during moves.

The [interaction follow-up](studio-graph-interaction.md) fixes the field gesture
regression and adds box selection, visual groups and dashed reference links.

## What to open

Choose **Project → Open example → Nacre**. Select **Standing-wave modes** in the
graph or Explorer, then its **Code → Definition** link. `/nacre/modes.mjs` holds
the formula actually driving the field. Change `targetFirst`, save, and watch the
pattern change. The scene and particle state survive this rule edit.

The committed authoring files are in [`projects/nacre`](../../projects/nacre).
The saved example embeds five modules:

| File | Responsibility | Visible relationships |
| --- | --- | --- |
| `scene.mjs` | Shared renderer, camera, enclosure, remaining artwork and interactions | Analysis/energy inputs; scene, contact and phase outputs |
| `field.mjs` | Original field geometry, shader, contours, rings and 10,000 particles | Scene ownership plus modes, energy, focus, shift, afterimage, upper band, phase, contact and analysis |
| `energy.mjs` | RMS/peak smoothing and upper-band response | Output analysis → energy, peak, upper |
| `modes.mjs` | Standing-wave mode calculation | Focus, displacement, peak, upper → mode pair |
| `controls.mjs` | Named endpoint bindings and panel placement | Device controls such as `/focus` and `/prism-bend/edge` |

Three parameter nodes expose the existing focus, displacement and afterimage
values. They read the audio project; they do not create a second parameter bank.
Their code links lead to the underlying declarations. Audio source and DSP
arrangement remain in `/project.mjs`; `/composition.json` owns the editable
presentation definitions, instances and wires.

`projects/nacre/composition.mjs` assembles the initial example using the existing
public component commands. It is a generation recipe, not a second runtime
source of truth. Run `node scripts/generate-nacre-composition.mjs` after editing
those repository modules. `--check` verifies freshness without writing. The
older `scripts/update-nacre-project.mjs` rebuilds the reference audio and assets
then applies this presentation assembly too. Both commands regenerate the bundled
example; neither should be run over a user’s saved project.

## General Manifold capability

Composition version 4 adds:

- `parameter` implementations with an existing project path and one scalar output.
- Finite `vector2` and `vector3` values for rules such as mode pairs and contact positions.
- Renderer-specific `resource:<contract>` ports. `api.exportResource(type, object)`
  makes an opaque live handle; `api.resource(inputName)` resolves a connected
  handle. Handles never enter saved JSON. Source, assets and wiring recreate them.
- `scene-object` factories returning `create(api)`. The returned disposable object
  can update each frame and publish outputs. A resource disconnection disposes it;
  a new resource creates a new instance. Scalar changes retain the instance.
- A final `render(frame)` pass after dependency-ordered updates. Nacre’s scene
  owns that boundary; its field does not create another canvas or animation loop.

Resource names are contracts, not automatic graphics-library interoperability.
Nacre’s `resource:nacre.scene` describes its own shared scene capabilities;
`resource:three.object` carries its field group. Other renderers can define their
own contracts. General ownership/execution belongs to Manifold; the scene,
shader, equations and artwork belong to Nacre.

Objects dispose their own geometry/materials and remove their own group. Shared
scene resources are borrowed. Authored factories must clean up partial
allocations if creation throws. Runtime errors clear downstream output values
and appear in observations; a still-visible prior rendering is not proof of a
successful edit. Source replacement may recreate the affected object. This does
not promise arbitrary state transfer between implementations.

Existing nested composition wrapping accepts these ports and bindings. A
regression wraps the Nacre presentation, saves it, recalls it and checks the
expanded execution and built-in parameter status. Numerical frame processing
never publishes document edits or schedules audio.

## Acceptance evidence

- Browser: editing the mode source changes the visible pattern while preserving
  the canvas and advancing particle state. Disconnecting the field’s scene wire
  removes that object; undo restores it without removing the enclosure.
- Actual browser audio: output gain zero drives energy to zero; restoring gain
  restores motion. Audio runs through a verified `sinkId: {type: 'none'}`.
- The standalone Nacre website embeds the same composition and a separate
  audition graph; repeated audio start/stop passes on a private sink. Its input
  source never enters Nacre’s saved effect graph.
- Browser save/reopen retains the composition and renders all 10,000 particles.
- Standalone: the full project and embedded artwork load; local agent commands
  edit the mode script, observe changed mode values, capture the Presenter,
  undo, and save in the same process. The review runs on owned Xvfb with a
  private PipeWire null sink, leaving desktop focus and physical audio alone.
- Native regression: full Nacre load, visual parameter edit, undo and save/reopen
  preserve assets. Audio samples match an untouched reference through publication
  acknowledgements and subsequent blocks.
- Web suite: 202 tests pass. Release Rust workspace, both Wasm builds, web build
  and standalone build pass. The UI captures show the rejected permanent Input
  graph tags removed.

Review drivers are [`review-nacre-visual-graph.mjs`](../../web/review-nacre-visual-graph.mjs)
[`review-nacre-visual-graph-native.py`](../../web/review-nacre-visual-graph-native.py),
and [`review-nacre-embed.mjs`](../../web/review-nacre-embed.mjs).
Selected captures and machine-readable results are in
[`web/public/studio/2026-10-13-nacre-objects`](../../web/public/studio/2026-10-13-nacre-objects).

Two native defects surfaced during acceptance. Loading retained the encoded
saved JSON after parsing; deleting that extra reference lets the asset-rich
project load within the existing 32 MiB limit. Undo compiled presentation modules
after host acknowledgement, under the shorter interactive deadline. It now
prepares that state before publication, just as a normal visual edit does. No
heap limit, deadline or audio callback budget was increased.

## Remaining migration

The field and its rules are the first actual Nacre objects, not a claim that the
whole presentation is decomposed. Hand rig/poses, eye gaze/blink, creature
behaviour, enclosure/asset relationships and gesture mappings still live in
`scene.mjs`. Extract those by the same ownership boundary and show their real
relations. Nacre’s audio source still uses the older expert GraphWorkspace form;
its migration to the named Device API is separate.

The current custom visual-parameter Inspector still uses the existing component
transaction controls. Bringing those controls onto the shared continuous gesture
path is a remaining UI task; audio/panel controls continue using that existing
smooth path. No plugin-export/DAW acceptance or alternate native graphics backend
is claimed by this scene-graph milestone.
