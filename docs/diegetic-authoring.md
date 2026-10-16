# Diegetic Manifold faces

Nacre is a working example of a device whose physical controls, artwork and
sound refer to the same authored graph. Start with its readable sources:

- `packages/manifold-author/examples/ui-nacre.mjs` imports `createEffect` and named processors from `manifold`, then declares the audio graph, controls and colours.
- `projects/nacre/scene.mjs` and `field.mjs` implement its shared scene and field.
- `projects/nacre/controls.mjs` binds the Device controls to the panel layout.
- `projects/nacre/composition.mjs` assembles the visible objects and their references.
- `assets/nacre/README.md` records the PhotoCraft layers and runtime assets.

In a custom view, explicitly import the first small UI toolkit:

```js
import { mountControlPanel } from '@manifold/ui-web/control-panel';
import { imagePixelPoint, imagePixelRect, followTelemetry } from '@manifold/ui-web/diegetic';

// A painted socket at pixel (130, 310) in a 330 × 479 asset stays aligned
// when the art is remapped onto a 1.2 × 1.74 world-space plane.
const jack = imagePixelPoint(130, 310, 330, 479, 1.2, 1.74);
const eyelid = imagePixelRect(163, 172, 94, 87, 330, 479, 1.2, 1.74);

// Telemetry is for presentation; it never clocks the DSP graph.
visibleEnergy = followTelemetry(visibleEnergy, analysis.rms, dt, 9);
```

The authoring sequence for an agent is: declare a primitive graph; expose
stable named controls; assign each physical control a binding to one of those
paths; use an image asset with recorded pixel anchors; let visual layers read
the same controls and analysis stream; verify in Studio with audio running;
save the source, face and assets together in the project file. Avoid storing a
second audio parameter value in the face.

`webView.dependencies` must declare the imported UI modules. The browser
Studio, standalone web face and native webview resolve the same UI package.
Nacre's current height map is hand graded artwork, not measured depth. The
toolkit can grow from this example with sprite atlases, authored normal maps,
visual effect presets, anchor editing and GPU budget diagnostics once those
operations have a second real use case.
