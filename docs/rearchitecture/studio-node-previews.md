# Functional discovery and live node previews

13 October 2026. First implementation of the approved
[visual-node study](studio-visual-node-language.md).

## Delivered

The shared visual definition accepts a functional `category`, up to sixteen
search `keywords`, an optional `preview` output name, and a short `unit` on each
port. Saved projects, focused MCP inspection, the picker, graph and Inspector
use the same definition. Origin follows ownership: project-owned definitions
are listed under This project, including references to that project's controls.
The framework catalog and new-script starter are listed under Manifold.
Older definitions remain valid and receive a category based on their declared
implementation/output type. Authored categories take precedence.

The picker has a functional category column, a Library filter, a stable result
list and a detail pane with named ports, units, purpose and Open code. Narrow
windows use a category dropdown. Keyboard navigation, search and pointer hover
retain their existing behaviour. The selected result cannot resize the dialog.
Nacre's seven definitions now declare their functional categories; its artwork,
scripts, audio path and positions retain their previous meaning.

Scalar/vector outputs have histories. Fields have aspect-preserving numerical
thumbnails, original dimensions and the reduced grid's range. The default is the
first supported output; a definition can choose another with `preview`.
Reusable graphs follow their exposed output to the actual child result. The
Inspector shows the same observations and the existing named relationships.
Node dimensions depend on the declared output, never the live value. Existing
positions remain authoritative; there is no automatic rearrangement.

The shipped field-rules example has an explicit position for its audio Device
to keep it separate from its field node. This changes that example's authored
layout, not Studio's positioning rules.

## Runtime budget and ownership

`node-previews.js` reads accepted outputs from `createPresentationGraph`. It
does not call a script, renderer or audio processor. The workspace requests
visible nodes at readable zoom and the inspected node, with selection taking
priority. Limits are sixteen nodes, ten observations per second, forty-eight
history samples and 32 × 32 field samples. Field reduction averages source
cells; displayed pixels span the reduced grid's minimum/maximum. Constant
fields display at the midpoint. Samples remain finite for large valid inputs.

The graph toolbar’s Viewers switch now disables graph and Inspector thumbnails,
collapses their preview area and unsubscribes their observations. Re-enabling it
uses current outputs and preserves authored positions.

Hidden previews release sample/history storage and egui textures. Structural
edits invalidate previous observations; compatible parameter/layout revisions
preserve continuity. Errors remove the failed output preview. Renderer resource
handles never enter the preview transport. Image values use the later renderer-neutral
image contract linked below.

The shared presentation clock uses animation frames while the Presenter is
visible. With the Presenter hidden, it advances only while graph observations
are requested: a bounded browser timer, or the native control/UI clock. Native
WebKit throttles timers in a never-mapped face; the explicit host clock avoids
that throttle and remains capped at ten frames per second. There is one presentation execution, not another
simulation for thumbnails. This also supports a native launch directly into
graph view before WebKit has ever mapped its Presenter. Native publication
continues for these graph observations; visible Presenter capture still requires
a visible surface. Native face IPC accepts bounded messages up to 256 KiB so
the observation budget fits alongside the existing output summaries.

Audio processing and timing are unchanged. Tests use a private null sink.

## Evidence and current boundary

- Browser: real pointer/keyboard picker traversal at 1280 × 720, 960 × 480 and
  520 × 720; twelve field parameter edits with changing pixels and fixed node
  geometry; hidden graph releases all previews.
- Standalone: real egui/WebKit field observations, eight accepted parameter
  edits, graph-only presentation and hidden-preview release on isolated Xvfb.
- Shared tests: sampling does not evaluate a node twice, rate/history/grid
  limits, compatible revisions, failure invalidation, nested output forwarding,
  extreme finite samples and switching between a single animation/timer clock.
- [Actual captures and reports](../../web/public/studio/2026-10-13-node-faces/README.md).

The larger primitive library remains the next slice: imported Manifold
definitions for analysis, map/smooth, noise/standing waves, displacement and
colour/layer output. This change does not claim those exports exist. Picker
example previews, renderer-object thumbnails, per-processor audio taps and
image/layer contracts also remain open. A resource type name is still a type
name, not a rendered object preview.

Image sequence and image outputs now have bounded RGBA viewers; see the [image-composition delivery](studio-image-composition.md) for the shared contract, lifecycle and evidence. Arbitrary renderer-object capture remains open.
