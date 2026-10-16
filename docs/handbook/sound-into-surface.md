# Turn sound into a surface

This is a small part of Nacre's visual language, extracted into inspectable objects and rules. One script creates a standing field. Another maps actual output energy to a number. A third uses that number to shape relief. A renderer displays the original field and its transformed result side by side.

You are running the same portable composition used by Studio's **Standing field & audio-driven relief** example. This page embeds its presentation through the Manifold UI library; it does not mount Studio around it.

```manifold-example
field
```

## Start with the field

Move **Mode N** and **Mode M** while audio is stopped. The source pattern changes, and the result follows it. Set both modes to the same number: the expression cancels to zero. Restore different values to recover the pattern.

The field script samples this expression on a 64 × 64 grid:

```js
Math.cos(n * x) * Math.cos(m * y)
  - Math.cos(m * x) * Math.cos(n * y)
```

This is a standing-mode expression, not a fluid simulation. Its output is a portable object containing `width`, `height` and row-major `values`. No Three.js object or GPU texture crosses the cable. Another renderer can consume the same samples.

## Let sound reshape the result

Start audio. The page supplies a quiet sine wave to the project's normal **Input → Gain → Output** path. Raise **Audio level**: the output's measured RMS drives a smoothed energy value, which deepens the relief.

Set Audio level to zero. Energy settles towards zero; the source field stays intact. The result retains its small resting relief. Turn **Relief folds** to change the transformation's pattern without changing the original field.

Open Graph and follow the two paths. Audio goes through Gain to Output. Output analysis feeds Level response; its scalar output feeds Field relief. Standing field feeds both Field relief and Field comparison. The renderer also receives energy for its readout.

## Follow each rule to its source

Select a node in Graph, or open its file in Source. These are the actual files packaged with the running example.

| File | Responsibility | A useful first edit in Studio |
| --- | --- | --- |
| `/nodes/field.mjs` | Generate and cache the sampled field | Change the spatial expression |
| `/nodes/energy.mjs` | Map measured RMS and smooth its response | Change sensitivity or the response law |
| `/nodes/relief.mjs` | Transform the field using folds and energy | Change the relief equation |
| `/nodes/render.mjs` | Draw both fields and the energy reading | Change the colour mapping or labels |
| `/project.mjs` | Declare the audio path and exposed gain | Add an audio processing stage |

In the relief script, the essential transformation is:

```js
const depth = restDepth + energy * audioDepth;
const result = Math.sin(sample * folds) * depth;
```

Those two lines explain the rule; the complete implementation in Source obtains its inputs and parameters through the component API and returns a new field. **Source** contains the runnable version.

## Why separate the objects?

Suppose you want the same standing field to drive a different surface. Add another consumer without rewriting the generator. Suppose you want a gentler audio response. Edit the level-response rule without changing the audio engine. Suppose you want another graphics library. Replace the renderer while keeping the field/rule interface.

The presentation executor evaluates dependencies once per render frame. Measured analysis flows out of audio; presentation scripts do not drive audio timing. `field2d` values are bounded to 128 × 128 finite samples, and the current composition rejects cycles and mismatched port types.

This is an audio project with a visual composition. It does not introduce a separate visual-only project model, general physics engine or arbitrary GPU-resource graph.

## Continue inside Studio

Choose **Open in Manifold Studio** to preserve your current mode, fold and gain settings. Audio starts stopped. Select a test input and start it when you want the relief to respond again. Click **Standing field** or **Field relief** to open its implementation; use **Graph** to inspect the connections and the Inspector for local parameters.

When you have a useful arrangement, [wrap it into a reusable node](/learn/studio-graphs/). If you want an agent to modify it, ask for one explicit change and have it verify both field panels, the named connections and the audio path afterward.
