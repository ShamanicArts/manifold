# Visual nodes that explain their work

13 October 2026. Aster's response to Lucas's visual-node review. **Lucas approved the catalog and node-face study on 13 October. Implementation
has delivered [functional discovery and live node previews](studio-node-previews.md).
The reusable primitive library and richer object/image capabilities remain planned.**

[Interactive design study](../../web/public/studio/2026-10-13-node-semantics/study.html)
contains simulated previews, not a running Manifold graph. It is a study of the
picker and node faces within the existing workspace, not a new Studio shell.

## What is wrong today

The Nacre catalog contains seven project definitions and one editable starter.
Those seven are three parameter references, two calculations, a scene host and
one field renderer. They expose useful boundaries, but do not constitute a
library of visual building blocks. The generic starter draws an audio-reactive
circle. Other example projects provide field/rule scripts; those are not a
shared, discoverable primitive catalog either.

Definitions already accept a functional description, but `componentPalette`
dropped it and egui substituted a generic explanation of project storage. The
existing picker also used the selected node's detail height to size its centred
dialog. Hovering nodes with different descriptions/port lists moved the entire
list, sometimes causing another selection change under a stationary pointer.

Graph nodes currently have names, typed ports, parameters, source links,
references and nested composition. Their appearance conveys little of the
operation or its result. Inspector observations are mostly formatted text:
scalar, vector and field summaries, or resource type names. A type name such as
`three.object` is not a preview of what that object looks like.

Audio observations currently reach the visual composition through the output
analysis connection. There is no general per-node waveform/spectrum observation
facility to silently reuse. A meter on each processor needs a real tap at that
processor, not the final output relabelled several times.

## Implemented repair

- Fixed-size, independently scrollable result and detail regions keep the picker
  stationary while browsing. Long port lists are fully reachable. Wide, short
  and narrow-window egui tests exercise the actual modal layout.
- Preserve functional descriptions and script/reference locations from the
  shared authoring presentation into native and browser palettes. Search now
  includes those descriptions.
- Distinguish custom nodes, custom graphs, the editable starter and parameter
  references. Remove the generic “source and helper files travel” explanation.
- Describe each of Nacre's seven definitions by its actual job. This changes
  metadata; Nacre's rendering, audio, assets and layout remain authored as before.
  Saved user projects retain their own authored descriptions.

## One vocabulary for the person and the agent

A node should answer: **what does this do, what does it receive, what does it
produce, what is happening now, and where can I change it?**

Function, provenance and implementation are separate. A custom Displace node
belongs next to other field operations; it is not less of a node because someone
wrote it in a script. Its origin can read “Custom · Nacre”. A library counterpart
can read “Manifold”. Script versus composed graph determines which editing
commands are available, not whether its ports, previews or controls are useful.

The node definition should supply a concise purpose, meaningful port names,
units/ranges where applicable, category/search terms, examples and help. Source
links and package/project origin should come from the actual definition and
resolved dependency, not guessed from the node's label. All clients, including
MCP inspection and the wiki, consume the same description.

Core definitions should be imported through the public `manifold` API. Do not
create one copied custom script per instance as a substitute for a core library.
Project-owned scripts remain valid custom definitions and travel with their
project. Installed packages need explicit versions and portable dependency
resolution; packaging does not belong in the node's explanatory sentence.

Scripts register meaningful objects and interfaces. Studio cannot infer every
relationship from arbitrary graphics code. An agent exposes the useful objects,
inputs, outputs, bindings and behaviours deliberately, and can leave a complex
formula or shader inside a readable script. Clicking Code opens that actual
implementation or highlights its declaration. Wrapping a graph keeps its named
interface, source and enterable contents.

## Finding nodes

Retain quick search and keyboard insertion. Use functional categories and a
separate library filter. Search purpose and common terms as well as names:
“loudness”, “smooth”, “warp”, “background”, “image”, “follow a control”.

The study shows a category column, stable result list and detail pane. The detail
pane gives a one-sentence purpose, small example preview, named inputs/outputs
and help/example/source actions. Previews in the picker use a labelled example
input; they must not be confused with values from the open project. Custom and
library nodes use the same interface. Do not hide custom nodes in a catch-all
Visuals or My library bucket when their function is known.

A future wire-drag search can prioritise compatible inputs, explain incompatible
ones and insert into an existing connection through the same graph transaction.
Do not silently add conversions or connections. The initial implementation should
finish the ordinary browse/search path before expanding that interaction.

## Reading the graph

| Node's job | Useful face | Relationship to expose |
| --- | --- | --- |
| Parameter reference | Control label, current value and units; familiar shared control when editable | The actual source control and all destinations; a dotted dependency line |
| Audio processor | Appropriate meter, waveform or spectrum when a real observation tap exists; filter curve where derivable | Actual input/output ports, bypass, active controls and modulation |
| Smoothing/mapping | Small history or transfer curve and input/output values | Which incoming value is transformed, with meaningful units |
| Field generator/transform | Field thumbnail or contours; resolution and useful controls | Which field/value enters and what comes out |
| Image/layer/compositor | Actual output thumbnail including transparency | Foreground, background, mask and blend operation |
| Scene object | Bounded object preview where the renderer supports one; otherwise its transform and useful data | Parent/scene attachment and incoming behaviours |
| Reusable graph | Promoted controls and an optional chosen output preview | Enter action, named boundaries and internal graph |

Use the current filled Manifold controls. Node geometry must not change on every
value update. Selection highlights related wires while leaving the rest of the
graph visible. Named ports and Inspector relationship lists complement line
colour; colour alone is insufficient. Detailed previews can be expanded or
pinned, with simpler faces at distant zoom. Preserve authored positions and
manual arrangement. Richer nodes are not permission to add automatic layout.

The study uses Nacre's focus → mode calculation → field relationship to make the
idea concrete. It deliberately does not convert the hand, cabinet or creatures
into a different design, or claim that all their internal objects are exposed.

## A useful first library

Deliver a complete chain that produces a useful audio-reactive plug-in visual,
then extend it. The following are proposed capabilities, not exports that exist
in the current package:

| Family | First building blocks | Why they belong |
| --- | --- | --- |
| Sound analysis | Level, frequency bands, dominant frequency; explicit observation source | Sound can visibly drive graphics without a bespoke analysis script each time |
| Values and motion | Parameter reference (existing), map range, clamp, smooth, time and periodic motion | Values need readable, reusable mapping into colour, position and scale |
| Fields | Noise, standing wave, combine, displace and contours | A useful continuum from a field definition to an inspectable transformed pattern |
| Colour and layers | Colour ramp, background, mask, blend/composite | Complete an image and place it in a plug-in presentation |
| Objects and layout | Image, text, basic shapes, group and transform | Assemble controls/artwork without hand-building every mundane object |

First implementation target: **audio level / parameter → range and smoothing →
noise or standing-wave field → displacement → colour ramp → a presentation
layer**. Include an editable custom formula in the same example. Build it both
through the graph and through explicit named imports, save/reopen it, then embed
that same example in the wiki. A general standing-wave generator can reuse the
mathematical idea; Nacre's artistic renderer remains its own custom node.

Scene/camera/material/geometry/particles and shared gesture/behaviour attachments
follow as another coherent slice. Do not relabel one giant Nacre script as a set
of primitives, or promote all of Nacre's artistic choices into framework defaults.

## Runtime and delivery constraints

The data contract supports scalar, vector2/vector3, field2d, images, image
sequences, analysis and renderer-specific resources. Validate ownership,
lifecycle, type checking and save/recall. Do not impose project-size, object-count,
image-resolution or nesting-depth quotas. Preview sampling may bound its own
work without restricting the underlying authored data.

Use the existing presentation execution and observation paths. Node previews are
clients of the accepted runtime, not a second simulation. Reuse results and
renderer-owned surfaces; don't re-run a shader/particle system per thumbnail.
Sample bounded preview data only for visible/selected/pinned nodes, at an explicit
budget. Suspend hidden previews; expose unavailable or stale observations
honestly. Test graph panning and smooth parameter drags while previews run.

For audio previews, prepare taps and bounded buffers outside the callback. Copy
or downsample through the existing safe host boundary; no allocations, locks,
filesystem, logging or UI work in DSP. Audio timing remains independent of graph
and Presenter frame rates. Native and browser need the same semantic observation
contract, even where pixel transport differs.

Renderer resources stay typed by their compatibility contract. A Three.js object
cannot be fed to an unrelated renderer merely because both draw graphics. Use
explicit adapters or a portable image/field boundary. Keep direct library use and
non-Three authoring viable. A custom graphics implementation should be able to
supply a preview and semantic objects without adopting the whole Studio product.

## Implementation sequence after design review

1. Agree the catalog and node-face treatment using the study. Finish definition
   metadata shared by discovery, graph, Inspector, help and MCP. Make missing
   descriptions actionable during authoring without blocking experimentation.
2. Add bounded real observations and default egui previews for values, histories
   and fields. Prove that hidden previews stop and graph interaction stays smooth.
3. Deliver the complete first library chain above through public imports and
   graph creation, including a custom script, source navigation, undo and recall.
4. Cover audio processor previews with genuine observation taps, then the richer
   image/object/layer resource contracts and renderer-specific adapters.
5. Apply the tools to selected Nacre internals without changing its appearance;
   document human and agent workflows using the runnable example, and verify the
   same workflow in browser/Wasm and native Studio.

These are refinements of the approved graph/script equivalence and reusable
composition direction, not a separate visual-only product or a mandatory
node-only language.

## Reference lessons

- [TouchDesigner OP Create Dialog](https://derivative.ca/UserGuide/OP_Create_Dialog):
  browse by operator family and distinguish generators from filters. Its
  [operator viewers](https://derivative.ca/UserGuide/OP_Viewer_COMP) make results
  available inside other panels. For Manifold, adopt role-aware discovery and
  useful output previews, without requiring users to learn TouchDesigner acronyms.
- [Bespoke Synth reference](https://www.bespokesynth.com/docs/): modules expose
  musical controls and purpose-specific displays, including Lissajous, EQ and
  value histories; creation supports search and cable-to-empty-space workflows.
  The relevant lesson is that the working patch is an instrument you can read
  and operate, with clear functional module categories.
- [ComfyUI custom-node walkthrough](https://docs.comfy.org/custom-nodes/walkthrough):
  custom nodes declare category, named inputs, outputs and implementation; a
  custom node is a normal participant in the workflow. Manifold's origin label
  and source affordance should complement that functional interface.

These are documented reference behaviours and design inferences from them, not
claims of fresh hands-on testing of those three applications.
