# Standing field and audio-driven relief

A working Studio object/rule example drawn from Nacre's actual field mathematics.
The audio path is sine oscillator → gain → output. Presentation is a standing field plus
measured level response → relief transform → Canvas renderer.

Open `web/public/studio/field-rules.manifold.json` in either host, or choose
**Standing field & audio-driven relief** from Studio's browser example menu.
Select a node to open its script and inspect its parameters, connections and
live output. Edit the relief script or cable the source field directly into the
renderer's relief input to change the result downstream.

`project.mjs` owns the audio construction. The generated document's editable
`/composition.json` owns the presentation graph. Each node's implementation is an
ordinary `/nodes/*.mjs` project file. Regenerate the shipped initial document with
`node scripts/generate-studio-field-rules.mjs`; use `--check` to verify freshness.
The generator uses the same public commands as Studio and agents.

This is an authoring example, not a replacement Nacre design. See the
[contract and verification](../../docs/rearchitecture/studio-field-rules.md).
