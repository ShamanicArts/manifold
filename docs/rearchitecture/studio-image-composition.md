# Images as inspectable graph objects

13 October 2026. A working image-composition slice in browser/Wasm Studio and
native Studio. It extends the existing audio project; it introduces no
visual-only project mode.

The **Image composition** example contains an Oracle creature node with a live
image viewer. Select it and use **Enter graph**, or double-click it. Inside are
three uploaded pose images, an editable motion script, a frame selector and an
image transform. **Up one level** returns to the creature and its Image layer.
The layer draws the same result in the Presenter.

[Open the browser example](http://127.0.0.1:4174/?program=image-composition), or
open [the portable project](../../web/public/studio/image-composition.manifold.json)
through File → Open in either host. The browser example menu also lists it.

## Authoring

The Manifold library exports four reusable definitions:

| Import | Purpose | Graph values |
| --- | --- | --- |
| `imageFrames({ frames })` | An ordered list of uploaded project images | `frames`: image sequence |
| `selectImageFrame` | Choose a pose by frame number | sequence + scalar → image |
| `transformImage` | Translate, rotate, scale and fade | image + optional scalar bindings → image |
| `imageLayer` | Display the image in the Presenter | image → image |

They are in the node picker's **Colour & layers** category under **Manifold**.
No copied project script is required for these library operations. Image frames
can be configured in the Inspector: add uploaded images, change their order or
remove a frame. The list belongs to its definition and is shared by instances;
the Inspector states that explicitly. An empty list produces no image.

```js
import { imageFrames, selectImageFrame, transformImage, imageLayer } from 'manifold';

const poses = imageFrames({
  id: 'oracle-poses',
  label: 'Oracle poses',
  frames: [
    '/assets/nacre-oracle-crab-rest.webp',
    '/assets/nacre-oracle-crab-step.webp',
    '/assets/nacre-oracle-crab-sing.webp',
  ],
});

await runtime.request({ operation: 'component.define', definition: poses });
await runtime.request({ operation: 'component.add', definitionId: poses.id });
await runtime.request({ operation: 'component.add', definitionId: selectImageFrame.id });
```

`poses` is an ordinary JavaScript variable chosen by the author. `oracle-poses`
is the stable name of this configured definition. `imageFrames` and
`selectImageFrame` are imported library definitions; `runtime.request` is the
accepted Studio project command interface. Image paths refer to files uploaded
into this project. Assets must exist before defining the list, or be supplied
in the same `component.define` command's `files` field.

Frame **0** is the first image, **1** the second. A connected `frame` value
replaces the Frame control. Fractional values round down; out-of-range values
clamp to the nearest available frame. Transform rotation uses degrees. Uniform
scale and opacity have explicit controls and optional input wires. Horizontal
and vertical translation both use the image width as their unit, making chained
transforms consistent even for non-square images. Positive rotation is clockwise
in the Canvas host. The image's aspect ratio and transparency are preserved.

[Complete assembly](../../examples/visuals/image-composition.mjs) and
[editable motion rule](../../examples/visuals/creature-motion.mjs) are included in
the portable example's Explorer. Its motion rule cycles poses and turns the
image; it is intentionally a small study, not Nacre's hover/drag/heat behaviour.
The example's pass-through audio Device remains a real effect with host I/O.

## Shared contract and ownership

Composition version 4 now accepts `image-sequence` and `image2d` values and the
`visual-primitive` implementation. Library inputs, outputs and parameter ranges
are validated against their canonical definitions. Validation compares structure,
independent of JSON object-key order, for native and browser agreement.

An image sequence is `{ frames: [projectPath, ...] }`. An image is
`{ asset: projectPath, transform: [a, b, c, d, x, y], opacity }`. These immutable,
validated values have no DOM, Canvas, WebGL or Three.js ownership. Custom scripts
can produce or transform the same values. Another renderer can consume them.
Decoded pixels remain in the presentation host and never enter the audio engine
or the saved graph. This first host implementation draws an Image layer with
Canvas; it does not make Canvas mandatory for authored products.

Image decoding is lazy and shared per presentation host. The retained cache has
at most sixteen entries and 32 megapixels of completed images; a single decoded
image above 16 megapixels is rejected. Removing references, hiding the Presenter and all graph viewers,
replacing an asset or disposing a presentation releases cached references. Late
loads cannot revive a retired entry. While a new pose decodes, an existing layer
and viewer retain their last complete image; disconnecting clears it. Load errors
remain visible. The image-size check is after decoding, not a claim about the
browser decoder's peak allocation.

Viewers sample accepted graph outputs at the existing ten-Hz cadence. Images use
32 × 32 RGBA thumbnails with transparency and aspect-preserving fit. Sixteen
such samples occupy about 128 KiB before metadata. The existing **Viewers** switch
unsubscribes them; they never rerun the motion script. Wrapped nodes forward the
actual exposed child result through the existing composition expansion.

`component.frames` changes a definition's ordered asset paths atomically, with
revision checking and undo. Missing assets and incompatible port connections
reject without adopting a partial document. Node source links include its image
assets. Agents discover the four definitions through focused catalog inspection
and can use the same mutation commands as the Inspector.

## Proof and remaining work

[Actual captures and reports](../../web/public/studio/2026-10-13-images/README.md)
cover browser and native animated thumbnails, graph entry/exit, optional viewers,
and the real Presenter. The browser also reorders images with pointer clicks and
undoes that edit. Native testing uses an isolated display and verified private
null audio sink.

- 226 web tests pass, including import, wrapping, recall, asset validation,
  native JSON key ordering, disposal and pending-frame continuity.
- 169 native/UI release tests pass; browser/Wasm UI, production web and native
  app builds pass.
- Real native and browser observations change both asset name and pixel data.

## Nacre integration — 13 October 2026

The actual bundled Nacre project now has an **Oracle creature** composition.
Open Nacre afresh, select that node in the Visuals group or Explorer, then use
**Enter graph**, double-click or the existing breadcrumb navigation.

Inside it, **Oracle poses → Select image frame → Transform image → Creature in
scene** drives the original art on Nacre’s rim. **Creature motion** receives
Prism edge/heat references, measured energy and the scene’s hover/drag state.
Its editable `/nacre/creature-motion.mjs` preserves the 180 ms pose hold,
exponential tilt, immediate local gesture preview, reduced motion and mouth glow.
`/nacre/creature.mjs` owns the Three.js object, materials, textures and hit target;
`scene.mjs` provides its shared scene, responsive layout and pointer gestures.
The assembly source is also available as `/nacre/composition.mjs` in Explorer.

The outer viewer forwards the image actually accepted by the object, including
its tilt. This image thumbnail does not capture the separate Three.js mouth
light or surrounding cabinet. The three default poses preload; an expanded
sequence loads its selected frame on demand, with at most five retained texture
entries (three warm poses, selected pose, previous pose while decoding).
Replacing a script cannot unregister the new object’s mouth target; disposal
and late loads are tested. Layout coordinates and all original artwork are
preserved. The audio source, compiled audio graph and controls are unchanged.

[Browser and standalone evidence](../../web/public/studio/2026-10-13-nacre-creature/README.md)
covers actual mouth/field drags, live script edits, image ordering/undo, nested
navigation, optional viewers and portrait resizing. All 229 web tests and the
production build pass. Native acceptance uses the actual standalone with an
isolated display and private null sink; no Rust/DSP changes were needed.

Sprite-sheet cropping, masks, blend/composite operations, broader math/field
primitives, per-processor audio observations and the historical catalog audit
remain open. The creature extraction establishes its real image path without
claiming the whole presentation has been decomposed; later slices are below.

## Relic eye and explicit outer controls — 13 October 2026

The bundled Nacre now also has **Relic eye**. Its three image selections and
three transform/fade nodes feed **Eye on relic**. **Gaze and blink** lives in
`/nacre/eye-motion.mjs` and receives the actual pointer, reduced-motion flag,
phase, Hold, displacement and audio response. `/nacre/eye.mjs` owns the overlay
meshes, textures, light and click target. It borrows the scene's relic placement
and relief shader; it does not own or dispose the cabinet's resources.

The outer viewer reports three accepted layer opacities. The individual image
previews are inside; no thumbnail claims to be a composite capture of the eye.
At most six GPU texture entries are retained (three requested and three previous
complete images). Missing images report an error and retain the previous image
where available; disconnecting clears the layer. A missing initial closed-eye
image also leaves its click target unavailable; Hold's panel control and H key
remain independent. Initial gaze timing now runs independently of texture decode,
so a late first image can appear after its opacity has already advanced. This is
a known loading difference, not a claim of exact first-frame parity.

`component.wrap` accepts optional `exposeParameters: [{ id, parameter }]`.
Omitting it preserves the existing expose-all behaviour. An empty list keeps
controls internal; existing enclosing bindings are always forwarded. The eye
uses an empty list. The creature exposes only position, scale and opacity;
pose and rotation are driven by wires and no longer have misleading outer
sliders. This command support precedes the unfinished graphical interface editor.

The broader remaining work and tester criteria are tracked in
[Studio readiness](studio-readiness.md).

## Failed object replacement

Scene-object replacement now waits until the candidate is constructed and its
first update succeeds before retiring the prior module. A failure keeps the old
object visible and reports an error on the node; it does not publish stale
outputs as successful new results. Nacre's hit-target ownership also returns to
the previous object when a candidate is disposed. Removal and explicit resource
disconnection still release it.

A connected resource producer that is preparing or has failed is different
from a disconnected wire. Its dependent scene objects now wait, keeping their
last working geometry and hit targets without publishing old outputs as new
results. The graph says which producer they are waiting for. This propagates
through resource chains. Removing a wire or successfully publishing a null
resource still releases the dependent object, even if another input is waiting.

A failed preparation is remembered for its resource inputs, avoiding repeated
mesh/material allocation every frame. Repairing source creates a new candidate;
new resource inputs can retry preparation. Scalar changes alone do not retry a
failed first update. Constructors should prepare from resources; changing scalar
behaviour belongs in normal updates. The retained object stays visible with its
click target, but its animation is frozen until repair. This does not suppress ordinary
per-frame recovery for an object that has already started successfully. Authors
must still clean up work they allocate before throwing out of `create` without
returning a disposable object. Complete process recovery and crash reporting
remain separate work.

[Eye and recovery evidence](../../web/public/studio/2026-10-13-nacre-eye/README.md)
contains real browser/native graphs, pointer gaze, Hold/release, live reload and
constructor/first-update fault injection. The browser retained audio energy and
field animation through both faults and source repair. A native repair timed out
under a simultaneous web build; the isolated rerun passed. Authoring under load
remains a release concern rather than a hidden retry or increased timeout.
Validation at this checkpoint: 234 web tests, 56 native JS/audio release tests,
production web and native builds. Original audio source, graph, controls and
artwork compare unchanged with `12cf7b2b`.

## Crystal hand and memory halo

**Crystal hand** is an enterable graph in the actual Nacre example. Its seven
image previews show three grasp poses, the selected hand image and its placement,
the wrist graft image and placement, and the image accepted by **Hand in scene**.
**Wrist and bearings** and **Memory collar motion** contain the small motion rules.
Grain, Scatter, Transmutation and Afterimage have visible parameter references;
the scene supplies pointer state, phase and sound response. **Memory halo**
attaches to the real hand resource through a graph wire.

The image transforms place the photographed cutouts within the wrist assembly;
the bearings, halo and cabinet socket retain their authored anchors. The outer
preview is the accepted image, not a capture of the whole three-dimensional
assembly. Enter the graph to inspect both the images and the attachment.

`/nacre/hand.mjs` owns the pose, graft, relief shader, bearings, texture cache and
silhouette hit test. `/nacre/halo.mjs` owns the separate draggable ring. They borrow
shared materials and never dispose the cabinet's resources. The hand retains at
most seven texture entries: three warm poses, selected and previous pose, requested
and previous graft. Late loads and repeated disposal cannot revive or release
another object's resources. Cold graph previews can prepare before the hidden
Presenter has measured its layout.

The original hand and graft shaders, depth rules, wrist pivot and socket layout
are preserved. Browser captures at matching framing have zero pixel difference
in the hand-bay crop for the resting and open poses against `63237b56`; that is
a bounded appearance check, not a claim about every animated frame. The original
audio source, graph, controls and uploaded artwork remain unchanged.

Native startup also avoids parsing each visual module twice. Syntax metadata is
cached per live file record and content; dependency availability, relative paths
and cycles are still checked per closure traversal. Invalid content never enters
the cache. A local QuickJS measurement of this project fell from 1.038 s to
0.742 s through restoration and presentation. The two-second deadline is unchanged;
this measurement does not establish a guarantee under arbitrary machine load.

[Hand and halo evidence](../../web/public/studio/2026-10-13-nacre-hand/README.md)
covers both hosts, real drags, previews, live edits and failure/repair. Validation:
239 web tests plus package/type checks, 56 native JavaScript/audio tests, and
production web/standalone builds.
