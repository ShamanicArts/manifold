# Manifold Studio and authored presentations

## Public wiki

Lucas approved the handbook study's reading-first sidebar layout on 11 October.
Use a plain Manifold wordmark until a logo is designed. The header's brand cell
and sidebar share a width and divider; Manifold Studio is a distinct destination
on the content side. The landing page will be designed separately. Use Manifold
in public copy; v2 is internal. Preserve system-aware light/dark appearance,
optional graph/source views and restrained Studio colors. Deep topics offer
related reading and copyable agent prompts with exact fetchable source links.

On 12 October Lucas asked for more ambitious integrated examples, real Studio
coverage and a more comfortable human reading experience while retaining this
page shape. **Website code must always have syntax highlighting.** Use highlighted
fences and embedded source in both light/dark modes. The current handbook trial
uses self-hosted Plex Sans/Mono and Space Grotesk headings, readable line length,
more breathing room, and colour for live values, selection and code semantics.
These font choices await feedback; they are not a new logo or a Studio redesign.
Manifold's authoring syntax/ergonomics deserve a separate review; do not silently
redesign the API while improving its documentation.

## Creator workspace direction

Manifold Studio is the primary product for authoring audio plug-ins, as directed
on 11 October 2026. Follow
the [Studio boundary and redesign review](docs/rearchitecture/manifold-studio.md)
and the [Sentinel-informed workspace contract](docs/rearchitecture/sentinel-authoring-workspace.md).
Files/assets, graph, viewer, inspector, source and agent activity share selection
and project identity. egui supplies the shared Studio shell; authored projects
retain their own presentations and graphics implementations.

The [host parity ledger](docs/rearchitecture/studio-host-parity.md) records the
delivered browser/native workspace, visual wiring, node controls and groups.
General custom visual/math nodes and nested composites remain work. Historical
"Orbit Studio" and Nacre delivery reports describe examples and checkpoints,
not separate authoring products.

## Visual theme

Lucas's 3 October review prefers darker neutral studio colors. The browser and
egui studio chrome now use near-black/charcoal surfaces and blue accents; retain
color as a restrained accent and let authored instruments choose their own skin.

Lucas is composing sound and graphics for sustained sessions at his desktop;
the Studio follows his explicit charcoal-and-blue preference and keeps its
chrome quiet around expressive project content. Individual projects own their
visual personality. Orbit's sculpture and Nacre's cabinet are project artwork.

## Color

Restrained studio color: cool charcoal neutrals, blue for selected/live workspace
controls, light neutral text. Orbit uses OKLCH for its panel and typography foundation
and hex values where the existing canvas kit / Three.js material API needs them.
No color-only control names or status information.

## Typography

System sans for labels, menus and instrument type. Fixed size UI typography;
small tracked labels, readable control names, a prominent musical note readout.
Keep the original filled Manifold slider treatment. Lucas explicitly preferred
it over the thin-track replacement during this pass. Improve its spacing,
colors, units and interaction without replacing that visual vocabulary.

## Layout

Lucas's 11 October direction consolidates file and script navigation into a
Project browser. His review correction specifies a VS Code-style Explorer bar:
one toggle opens the tree beside the asset editor, separated by a resizable
vertical divider. Closing the tree leaves the open asset in place; there is no
three-mode selector. The tree exposes semantic objects and nested compositions
as well as physical files. Source is optional; selecting an object need not
open its script.

Lucas liked the revised Explorer proposal and requested a standard application
bar across the top. Keep Start, document commands, editor/view commands,
settings and package management consistently accessible. Application commands
remain available over the start screen. A contextual editor menu follows the
active pane; it does not replace the object's inspector. Study 03 proposes the
specific menu arrangement and package/settings panels for review.

Project, Graph, Presenter and Inspector share stable selection and are movable
workspace panels. Audition input and monitor controls belong in their own host
surface. Dock arrangement, presenter sizing, object locking and inspector
pinning have separate owners. See the [interactive workspace study and contract
proposal](docs/rearchitecture/studio-workspace-design.md). The reviewed application bar and Explorer are now implemented. Following Lucas’s
correction, the default Classic arrangement keeps Graph below Project/Presenter
and Inspector at the right; editable split trees and named layouts replace the
rigid column implementation. Menus must occlude only their own area, leaving
embedded content visible. See the [delivery record](docs/rearchitecture/studio-workspace-delivery.md)
for supported operations and host validation limits. Future redesign proposals
continue through joint visual review.

Keep Studio identity visible alongside the opened project's name. A new project
should start with a valid default audio path independently of an instrument
example; examples are templates chosen by the author. A plug-in need not add
custom processing. There is no separate visual-only project workflow.

The standalone/player presentation opens on its authored face, with inspection
and source access where the host supports them. Authored presentation layout,
graph node positions and Studio pane preferences remain separate. Existing
presentationLayout control positions are percentages of a named control panel.

## Components and interaction

Reuse Manifold's ported compact sliders and accessible choices; shared stable
parameter paths bind face, retained inspector and egui. Capture a layout drag,
preview locally, then commit one source transaction; cancel restores position.
Any project presentation reads/writes those paths through the project API; audio
analysis comes from the audio host. Backend-specific interaction remains inside
the component implementation. Three.js is supported, not assumed by Studio help
or status messages. Reduced motion and keyboard access belong to the shared
interaction contract. Existing Orbit behavior provides a reference: logarithmic
pitch/brightness, Shift for fine adjustment, double-click for authored defaults,
and relative dragging without a jump on contact.
