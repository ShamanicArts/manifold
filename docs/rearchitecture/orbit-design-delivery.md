# Orbit instrument design refinement

3 October 2026. A face and interaction refinement of the exported Orbit example.

- [Live refined instrument in Studio](https://wubulon.tailfac9f9.ts.net:4174/studio.html?program=ui-orbit&project=/orbit-design/2026-10-03/orbit-refined.manifold.json)
- [Face, interaction recording, native views and download](https://wubulon.tailfac9f9.ts.net:4174/orbit-design/2026-10-03/)
- [Website-exported Linux CLAP/VST3](https://wubulon.tailfac9f9.ts.net:4174/orbit-design/2026-10-03/Manifold-Orbit-linux.tgz)

## Design and behavior

A musician shapes a sustained instrument in a dim studio, with source available
beside it and a usable finished face in the DAW. The face uses cool graphite,
silver/mint accents and a faceted sculpture responding to pitch, brightness,
unison and actual audio energy. Three rows separate source, filter and space/
output. Choice labels are visible; numeric controls show Hz/kHz, cents, width
percent and output gain in dB. The automatic inspector follows the same palette.

The original filled Manifold sliders are retained. An initial thin-track visual
replacement was rejected by Lucas and removed. Future changes should preserve
this visual vocabulary while improving legibility, positioning and interaction.
The public kit supports colors, sizing, value formatting and positive logarithmic
ranges. Pitch/cutoff use logarithmic mapping, Shift-drag and Shift-arrow provide
fine adjustment, and double-click restores the authored default. These features
operate on existing bindings rather than another parameter bank.

The sculpture is a relative pitch/brightness pad: pointer contact preserves the
current sound; subsequent movement changes it while held. It supports keyboard
arrows, fine adjustment, focus indication, pointer capture and reduced motion.
Perspective fitting keeps rings within a narrow/tall scene. Compact layout uses
the same control positions and supports the narrow Studio view.

## Ownership and delivery evidence

The authored DSP signal graph, endpoint registry and captured values compare
exactly with the preceding WebMCP example. The Mode exposure is preserved in the
review project; the pristine public example still leaves it available for
authoring. Layout, scene and inspector style belong to the authored project.
Both public JS source and generated native primitive packages were refreshed.

`web/review-orbit-design.mjs` exercises actual pointer and keyboard input:

- Logarithmic cutoff midpoint: 800 Hz across its 80–8000 Hz range.
- Shift drag: 800 to 898 Hz with no jump on initial contact.
- Double-click: restored the authored 1200 Hz default.
- Pad contact preserved 440 Hz pitch and 1234 Hz cutoff; both changed while held.
- Keyboard/fine adjustment and Mode choice changed the accepted runtime.
- All nine controls fit inside the panel at a 480-pixel viewport; no page errors.
- Audio ran through an explicit silent sink with nonzero analysis.
- The actual website export form captured revision 37 and built both formats.

Build `14cfd143-f4d7-432d-a9b5-77e0f89892bb` produced archive SHA256
`d45f31772c2697b6961e34743e70e39d3995594937c5a2986fe58631e8dac938`.
The exact downloaded archive was opened in Linux REAPER as CLAP and VST3,
with source/layout/captured values intact, WebGL2, physical face input, live
2345 Hz edits and DAW save/reopen. Audio remained nonzero with the editor closed.
Native dropdown sizing was refined after inspecting actual WebKit rendering.
The final project cold-opened in BB with all nine controls and WebGL2; the
browser's public archive fetch matched the same receipt hash.
The native reports, actual plugin-window screenshots and WAVs are linked on the
review page. Native GUI/audio probes used isolated X11 and verified private sinks.

115 web tests, package freshness and TypeScript gates passed; the Vite build
passed. Tests include the concurrent bridge work; that work has a separate owner.
This refinement does not claim a new Windows/macOS release or the complete port.

Older saved authored source is preserved. The new project URL opens this
refinement; the pristine program can also be refreshed with Reset program.
