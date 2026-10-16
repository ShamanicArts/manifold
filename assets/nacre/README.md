# Nacre cabinet artwork

The shipped artwork is assembled from two editable PhotoCraft documents in
[`source`](source): `cabinet-kitbash.pcraft` and `mouth-relic.pcraft`.

The cabinet began as a generated filigree photograph. In PhotoCraft, the base
was darkened and its opacity reduced; feathered selections from the crown,
right reliquary, lower conductor and crystal eye were copied into separate
layers, offset, and screened over the base. This breaks up the original
symmetry while leaving quiet areas for the live optical chamber and controls.

The socket relic began as a separate generated machine-face cutout. Its mouth
was revised into a dark jack cavity. PhotoCraft cropped the cutout, lowered
exposure by 0.58 stops and saturation by 18 points, then resized it for the
plugin. A second PhotoCraft pass desaturated and levelled that cutout into
`nacre-mouth-depth.webp`. This is an **authored height map**, not reconstructed
3D depth. The GPU displaces a 40 × 56 vertex mesh with it and derives normals
from its gradients; the mouth aperture is masked so the cable still enters
the jack. Audio analysis increases the relief and moves its foil highlight.

The closed eye is a separate `nacre-eye-closed.webp` PhotoCraft crop with
painted shutter strokes. Two feathered, open-eye collage layers let the
porcelain eye open and look left or right in response to sound and touch;
the editable frame and mask sources are in `source/`. HOLD closes the crystal
eye's shutter while freezing the same granulator capture ring that produces
the audible spectral afterimage. Its placement comes from pixel coordinates
in the source asset, using
`@manifold/ui-web/diegetic` helpers so an agent can reposition or replace the
sprite without guessing Three.js world coordinates.

Nacre's sound path is authored as a Device in `ui-nacre.mjs`: host audio input →
FFT displacement → resonant focus → waveshaper → Prism Bend module →
granulator memory → wet/dry and bypass → output. The new Afterimage, HOLD,
grain size and scatter controls address that one graph in both Studio and the
exported plugin. Mic gain belongs to Studio's microphone preview source,
before the project graph, and is not a
Nacre parameter. The JavaScript view only reads the analysis stream and writes
named controls; it does not process audio.

The optimized WebP exports in
[`web/public/nacre/2026-10-10-graph/art`](../../web/public/nacre/2026-10-10-graph/art)
are embedded into the Manifold project file as `/assets/nacre-cabinet-art.webp`
`/assets/nacre-mouth-relic.webp`, `/assets/nacre-mouth-depth.webp`,
`/assets/nacre-eye-closed.webp` and two open-eye frames. The layered cabinet and mouth documents are
the editable masters; the WebP files are runtime assets. The height and eye
exports can be regenerated from the mouth image with PhotoCraft's black and
white, levels, crop and paint tools.
