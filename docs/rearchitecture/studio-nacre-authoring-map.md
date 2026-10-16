# Nacre as a Studio authoring check

**13 October update:** [Nacre’s real field and behaviours](studio-nacre-visual-objects.md)
now implement the first boundary below, with browser and standalone evidence.
The [Device migration](nacre-device-migration.md) replaces the old workspace source
with public `manifold` declarations, including reusable Prism Bend.
The inventory that follows describes the original presentation and remaining
object candidates.

11 October 2026. Read-only inventory of the existing project following Lucas's
request to use Nacre's actual needs after the first Studio tooling milestone.
These are candidate component boundaries, not implemented node APIs or a new
art direction. Keep Nacre's approved artwork and behaviour while exposing how
they are authored.

The audio composition lives in
[`ui-nacre.mjs`](../../packages/manifold-author/examples/ui-nacre.mjs).
The current presentation lives in [`projects/nacre`](../../projects/nacre).
The field and its rules are separate graph objects; hand, eye and creature still
belong to `scene.mjs`. The old `ui-nacre-view.mjs` is a historical single-script
reference and is no longer embedded into the audio source.

| Existing authored work | What Studio needs to expose | Ownership direction |
| --- | --- | --- |
| Oscillator/source selection, phase vocoder, filter, shaper, granular memory, mixes and output gain | Existing audio nodes, their declarations, parameter bindings and reusable DSP composites | Framework primitives; Nacre owns this arrangement and its controls |
| RMS/peak/bands feeding `followTelemetry`, ranges and field-mode calculations in `animate` | Named analysis inputs, smoothing and mapping rules with inspectable formulas and bindings | General analysis/control tools; Nacre-specific formulas can remain scripts |
| `liquidUniforms`, standing-mode field expressions, vertex/fragment shader modifications and particles | A field/visual component with exposed inputs, shader/source access and typed renderer-compatible output | Reusable host capability; initial field/shader code remains custom |
| Hand rig, shell poses, eye textures/gaze/blink and attached image/depth assets | Named scene objects or composites, attached asset references and behaviour scripts, transforms and hierarchy | General object/asset/transform tools; Nacre owns art, poses and behaviour |
| Pointer hit tests, drag state, fine adjustment and `publishGesture` parameter batches | Inspectable interaction logic associated with an object and the endpoints it controls | General gesture/binding facilities with custom hit testing and mapping |
| Control panel, preset buttons and parameter-path reads/writes | Controls with navigable bindings and attached preset/interaction logic | Existing shared controls; Nacre owns grouping, presets and appearance |
| Scene/camera, `placeConsole`, resize/framing, draw order and resource disposal | Explicit renderer/composite ownership and inspectable presentation sizing and placement | Shared lifecycle and sizing capabilities; project composition remains authored |

A useful next proof would expose **one field object and its existing analysis
mapping**, followed by a compatible renderer. It should be possible to select
the field, open its implementation, inspect or edit the smoothing/formula driving
it, see the actual input/output relationships, and preserve those changes through
save/reopen in both supported hosts. That would exercise meaningful Nacre needs
without rewriting the whole instrument or reducing its behaviour to toy nodes.

Use scripts where the logic benefits from them. A script may define a reusable
component or be associated with an instance; the eventual attachment contract
must specify its role, execution schedule, state and edit scope. Do not convert
every statement into a separate node, imply that all graphics libraries share
object handles, or place presentation scripts in the audio callback. General
capabilities developed for this proof belong to Studio/framework. Promotion of
any particular Nacre device into the core library remains a separate decision.
