# Rack UI Framework Specification

## Purpose

Build a rack-based UI framework for Manifold that can host fixed-instrument nodes in a user-arrangeable grid, project that same layout into both performance and patch views, and expose each node's real interface honestly so the system can later grow into a wider Manifold modulation engine and modular DSP system without changing the UI language.

This is **not** the same thing as making MidiSynth immediately modular.

The immediate goal is to replace the current fixed authored MidiSynth layout with a reusable rack/node framework that supports:
- rack rows
- node placement and reorder
- node sizing
- clean performance view
- architectural patch view
- honest port display
- future-ready infrastructure for modulation and modular DSP

---

## Current System vs Intended System

### Current MidiSynth UI

Current implementation lives primarily in:
- `UserScripts/projects/Main/ui/components/midisynth_view.ui.lua`
- `UserScripts/projects/Main/ui/behaviors/midisynth.lua`
- `UserScripts/projects/Main/ui/components/patch_connector.ui.lua`
- `UserScripts/projects/Main/dsp/midisynth_integration.lua`

Current structure is a fixed authored composition:
- top row: ADSR, Oscillator, Filter
- bottom row: FX1, FX2, EQ
- decorative connectors between known components
- keyboard as a separate inline collapsible panel at the bottom

Important clarifications:
- current UI **does already have layout state** in the broader sense of authored UI layout plus some runtime UI state
- current UI **does not have generic rack layout state** as a first-class persisted system for node position, node size, row occupancy, or user-authored arrangement
- current connectors are presentation primitives tied to concrete widget IDs, not generic graph-derived node/port connections
- current DSP top-level chain is fixed, though the internal voice graph is already richer than the current UI presentation suggests

### Intended System

The intended system introduces a reusable abstraction layer:
- **Rack** = grid/row container for nodes
- **Node** = module instance with declared interface and sizing rules
- **Performance View** = content-first view for playing/tweaking
- **Patch View** = same node placement, but with ports and routing shown

The framework should let Manifold move toward:
- future modulation infrastructure
- future modular DSP infrastructure
- future additional rows/nodes/racks

without needing to reinvent the front-end language later.

---

## Core Principles

1. **Fixed instrument first, future modularity later**
   - the rack framework must work even while MidiSynth remains a fixed instrument underneath

2. **User layout is real**
   - users should be able to reorder and size nodes for usability, not just DSP order

3. **DSP truth remains real**
   - patch/routing display should reflect the actual declared architecture and real signal relationships

4. **Performance and patch views are two projections of the same rack**
   - node positions and sizes should generally remain the same across both views unless infeasible

5. **Patch view shows interface truth**
   - if a node declares a parameter/input/output/port at DSP level or node-behavior level, it should be representable in patch view even if it is not yet fully modulatable/interactable

6. **The framework owns layout; nodes own their face and interface**
   - keep the boundary clean so this becomes a reusable Manifold system rather than a MidiSynth hack

---

## Rack Model

### Rack Container

A rack is a row-based layout container that supports:
- **N rows**
- empty spaces/gaps
- node reorder
- node resize
- future expansion beyond the currently filled rows
- paginated viewport with side dot indicators (like utility dock pattern)
- dots indicate which rows are visible (e.g., rows 1-2 glow, row 3 dim)
- clicking dots shifts viewport to show different row pairs (1-2, 2-3) or all rows when space allows

At present only two rows may be populated, but the system must not be limited to two.

### Docked Utility Panel

The current keyboard should not remain a special inline footer panel.

Instead, the bottom region should be treated as a **docked utility panel**:
- separate from the main synth rack
- always fundamentally docked rather than a free-floating window
- may collapse/expand and consume more or less vertical space
- supports multiple content modes rather than being permanently keyboard-specific

Initial and future-capable utility modes may include:
- hidden
- compact keyboard
- full keyboard
- split utility view (for example keyboard plus another utility surface)
- patch companion view
- future global modulation / automation / envelope utility views

This keeps the bottom region extensible without forcing keyboard assumptions into the long-term architecture.

---

## Canonical Layout State

The canonical placement model should be an **explicit occupancy/grid model**.

Each node should have explicit placement metadata, e.g.:

```lua
nodeLayout = {
  id = "filter",
  row = 0,
  col = 3,
  w = 1,
  h = 1,
}
```

Occupancy must be treated as **cell-level truth**, not merely row-level ordering with height as a cosmetic detail.
If a node spans multiple rows or columns, every occupied cell must be considered blocked for placement and collision checks.

This is preferable to a purely implicit ordered-row model because it supports:
- empty spaces
- tall nodes
- patch overlays
- future drag/drop complexity
- future modular DSP node insertion

### Important nuance

The system should not be rigidly locked to one single static projection forever.

There may be density/context variants such as:
- keyboard expanded vs collapsed
- expanded inspection mode
- compact mode for reduced space

However:
- the **primary truth** is still explicit node placement
- view changes should prefer preserving user-authored intent
- the system should avoid clever automatic layout churn unless necessary

### Virtual strip ordering and wrapped row projection

For the current rack direction, row presentation should be treated as a **projection of one longer virtual strip order**, not as independent little row kingdoms.

That means:
- nodes still have explicit placement metadata (`row`, `col`, `w`, `h`)
- the visible rack may still present multiple wrapped rows
- but drag/reorder behavior should be free to operate on a single virtual ordered strip and then re-project that order back into wrapped rows
- this same strip order should also support future alternate projections, such as a flattened paginated horizontal view

So the intended model is:
1. **virtual strip order** for reorder intent
2. **wrapped row projection** for the current rack presentation
3. **alternate projection modes** later, without inventing a second layout truth

### Implementation: Direct-child shell projection

The current implementation uses a **direct-child shell architecture** to enable cross-row movement without reparenting:

- Shell widgets are direct children of `rackContainer` with explicit `x,y,w,h` bounds
- Row panels (`rackRow1`, `rackRow2`, `rackRow3`) exist as visual backplates only
- Shell bounds are computed by `syncRackShellLayout()` which projects from virtual strip order
- Row-3 visibility is controlled by container height + viewport overlay, not shell visibility toggles

Key implementation details:
- `rackContainer` always has full height (684px for 3 rows) regardless of visible rows
- The keyboard/utility dock overlays the bottom portion when expanded, acting as a viewport mask
- Shells are **never** individually hidden/shown via `setVisible()` — they always exist in the scene
- This avoids the retained-layout invalidation issues that occur when clipping direct children at parent boundaries

Cross-row drag targeting:
- Pointer Y position is mapped to row bands using `rowHeight` (220px) + `rowGap` (12px)
- Insertion index is computed in the virtual strip, not within a specific row
- `moveNodeInFlow()` reorders the strip; `syncRackShellLayout()` re-projects to screen positions

---

## Node Model

Each rack node should declare:
- identity
- display name
- allowed sizes
- preferred rendering rules by size
- performance face renderer
- patch face renderer
- declared interface/ports
- any special split/tall presentation behavior

Example:

```lua
nodeSpec = {
  id = "oscillator",
  name = "Oscillator",
  validSizes = { "1x2", "2x1", "2x2" },
  ports = {
    inputs = { ... },
    outputs = { ... },
    params = { ... },
  },
}
```

### Module ownership

Each node/module owns:
- its internal performance UI
- its internal patch-facing UI if needed
- its declared ports and parameters
- its allowed size set
- its preferred rendering behavior by size
- special split/tall rules

Resize interaction should be explicit:
- no drag-to-resize
- expose resize through a button, selector, or popover of valid sizes
- keep resize separate from drag/reorder so the interaction model stays unambiguous

### Current resize implementation (March 24, 2026)

Implemented width-only resize (1x1 ↔ 1x2) via shell header toggle buttons:
- **1x2 (expanded, 472px):** graph on left, parameters on right (standard layout)
- **1x1 (collapsed, 236px):** graph-only for Oscillator/Filter/FX; ADSR/EQ keep current layout
- Toggle button shows "<" or ">" based on current size
- Fixed sizing: grow=0, exact pixel dimensions (no stretch/fill)
- Zero gaps between shells: RACK_ROW_GAP = 0
- Visibility-based collapse: parameters hidden via `setVisible(false)` when collapsed
- Resize state not yet persisted to `rackState.nodes[].w` (next step)

---

## Rack Framework Boundary

The rack framework owns:
- row/grid placement
- occupancy model
- drag/reorder behavior
- swap/insert accommodation logic
- resize mechanics
- rack spacers / rails
- view switching between performance and patch
- wire rendering layer
- persistence of rack layout state

This boundary is important because the framework is intended as infrastructure for broader Manifold modulation and node-based work, not just this one synth UI.

### Node shell event-layering contract

The rack shell must also own the drag-hit surface for reorder interactions.

Important implementation constraint discovered during the first shell migration:
- structured UI instantiates `children` before `components`
- component roots are therefore layered above shell children
- a shell child used as a drag strip/accent will **not** receive mouse events if the hosted component root intercepts mouse
- placeholder nodes worked during testing only because their component root had `interceptsMouse = false`
- real module nodes (ADSR / Osc / Filter / FX / EQ) did not, so their component roots consumed the hit path

Therefore the framework contract must be:
- hosted module component roots should default to `interceptsMouse = false` unless they explicitly need root-level capture
- interactive child controls inside the hosted component remain free to intercept their own input normally
- shell-level reorder hit targets must be designed with the actual child/component layering model in mind, not assumed z-order vibes

This is a real framework constraint, not a MidiSynth one-off quirk.

---

## View Model

## Performance View

Performance view is for:
- playing
- tweaking
- immediate visual comprehension

Characteristics:
- content-first
- minimal architectural noise
- node arrangement optimized for usability, not necessarily signal order
- no requirement to render full routing

Important clarification:
- performance view may still imply basic DSP flow in a compressed/managed way
- however wiring must stay clean and never become a crossing mess
- it may be preferable to show no wires in performance view at all, or only extremely minimal rack-spacer/rail indications

### Current guidance for perf wiring

Preferred options, in order:
1. no wires at all
2. subtle rail/spacer indication only
3. very restrained adjacency-only hints

Do **not** allow a messy crossover cable presentation in performance view.

## Patch View

Patch view is for:
- understanding the actual architecture
- exposing node interfaces
- preparing the UI language for future modulation and modular DSP

Patch view should generally use the **same node positions and sizes** as performance view.

It is primarily a different rendering mode, not a separate freeform layout.

Characteristics:
- ports visible
- connections visible
- architectural truth more explicit
- same node frames where feasible
- high port density is expected and acceptable

Interaction rule for the first pass:
- patch view is for inspection and patch/interface comprehension
- layout manipulation should happen in performance view, not patch view

---

## Port Truth

Patch view should represent the node's **real declared interface**.

That means the source of truth for visible ports may come from:
- DSP-level inputs/outputs/parameters
- lower-level node behavior contract
- node-declared schema
- existing component-level `ports` declarations where those are real and maintained

Rule:
- if the node says it has it, it should be representable

This does **not** mean every shown port is immediately open for modulation or patching.

It does mean:
- do not invent fake future-only ports with no declared basis
- do not hide real ports simply because the modulation engine is not implemented yet
- the patch view should establish an honest interface language now
- the routing and patch rendering layers must actually consume declared port/interface data rather than relying on hardcoded widget-suffix connector definitions

---

## Wiring Model

### Current meaning of bus / relay behavior

The row-to-row bus/relay concept should not be overinterpreted.

Its role is primarily visual/structural:
- when routing needs to move from one rack row to another, the rack can show that transition through bus/rail/spacer language
- this helps keep wiring legible across rows

It is not, by itself, a claim about parallel routing architecture.

### Patch View Wiring

Patch view should show routing in a clean way:
- no ugly crossovers if avoidable
- route through rack spacers/rails where needed
- preserve legibility over literal shortest-path line drawing
- same-row and cross-row connections should feel part of one coherent routing language
- connections should be rendered from connection descriptors plus declared port information, not from hardcoded widget suffix matching

For the current MidiSynth first pass, connection descriptors will likely need to be explicitly authored from the known fixed DSP chain rather than discovered automatically from the runtime graph, because the current DSP integration builds the graph internally and does not yet expose a UI-consumable graph description.

### Performance View Wiring

Performance view should remain visually clean.
If routing display cannot stay clean, omit it.

---

## Drag, Reorder, and Layout Accommodation

This is one of the most important behavioral contracts.

### Same-row reorder

When moving a node to a different position **within the same row**:
- nodes shift left/right to accommodate
- this is a reorder operation
- node sizes are preserved
- **no resizing should happen** during same-row reorder

This should behave like a packed ordered strip, not a collision puzzle.

Current implementation progress:
- live same-row drag reorder now exists in MidiSynth rack shells
- interaction uses a shell-owned top grab region, a floating ghost, and in-row placeholder/displacement preview
- reorder commits on mouse-up
- behavior is functional but still not the final polished UX language

Immediate next drag-behavior slice:
- harden drag behavior across all visible rows so ghost anchoring and hit handling remain correct everywhere
- keep placeholder/test nodes participating in the same drag path as real module nodes
- implement cross-row relocation behavior rather than stopping at same-row reorder
- improve placeholder/insertion visuals so the destination state is more legible during drag
- verify reordered layout persists and reloads cleanly without leaking transient drag-preview state

### Cross-row move

When moving a node from one row to another in the wrapped rack view:
- the interaction should be treated as reordering within the **virtual strip order**
- after that reorder, the strip is re-projected into wrapped rows
- preserving sizes is preferable
- resizing is not required for the current first pass and should be avoided unless a later layout mode explicitly needs it

So the immediate first-pass behavior is not "solve arbitrary row collisions".
It is:
- move within the virtual sequence
- reflow/project back into wrapped rows

### New node insertion

When adding a new node to the rack:
- the system should try to fit it sensibly
- resizing of participating nodes may happen if required to accommodate the insertion

### Occupied-space behavior

The prototypes establish the intended mental model:
- occupied target positions are handled by rearrangement to make space
- the normal interaction is not rigid rejection
- but same-row reorder should remain size-preserving

---

## Node Sizes and Tall Nodes

The framework should support width and height variation, including forms like:
- 1x1 (220×220)
- 1x2 (440×220)
- 2x1 (220×440)
- 2x2 (440×440)

**Canonical sizing:** width = cols × 220px, height = rows × 220px. This gives square 1x1 nodes and proper 2:1 aspect ratio for 1x2 nodes. Node shells use this grid unit for `layoutChild.basisW`, `layoutChild.minW`, and internal dimensions.

**Layout constraint:** Nodes should use fixed sizing (no grow) in rows with `align = "stretch"` to prevent unwanted expansion. Use `layoutChild.grow = 0` and `layoutChild.shrink = 0` for fixed-size nodes, or omit `align = "stretch"` from row layout.

### Tall node treatment

For vertically spanning nodes, the presentation may split content between rows.
Example:
- waveform/visual content on upper segment
- controls/parameters on lower segment
- visible connector/bar between them to communicate one logical node across row boundaries

This is especially relevant for sample/oscillator-style nodes.

---

## Persistence

The framework should persist:
- node placement
- node sizing
- row arrangement
- docked utility panel state/mode/height as needed
- view mode where useful
- density/context mode where useful

Clarification:
- the current system already persists some UI state such as keyboard collapse
- the new framework must extend this into a real persisted rack-layout state model
- preset-coupled layout behavior is out of scope for this implementation pass and should not block the framework work

---

## Suggested Data Shape

Illustrative only:

```lua
rackState = {
  viewMode = "perf", -- or "patch"
  densityMode = "normal", -- compact/normal/expanded as needed
  utilityDock = {
    visible = true,
    mode = "full_keyboard", -- hidden | compact_keyboard | full_keyboard | split | patch_companion | ...
    heightMode = "full", -- compact | full | split | collapsed
  },
  nodes = {
    { id = "adsr", row = 0, col = 0, w = 1, h = 1 },
    { id = "oscillator", row = 0, col = 1, w = 2, h = 1 },
    { id = "filter", row = 0, col = 3, w = 1, h = 1 },
    { id = "fx1", row = 1, col = 0, w = 2, h = 1 },
    { id = "fx2", row = 1, col = 2, w = 1, h = 1 },
    { id = "eq", row = 1, col = 3, w = 1, h = 1 },
  }
}
```

---

## Immediate Implementation Goal

The immediate implementation goal is:
- build the rack framework
- migrate the current fixed MidiSynth modules into that framework
- keep the underlying instrument fixed
- display architecture more honestly
- avoid requiring the modulation engine to exist first

This includes:
- node wrappers
- rack layout engine
- placement and reorder
- sizing
- performance/patch view projection
- port display from declared node interface
- docked utility panel abstraction
- initial keyboard utility mode
- main rack viewport with pagination (dot indicators) for multi-row racks

---

## Relationship to Future Work

### Future modulation engine

The framework lays visual and conceptual groundwork for a wider Manifold modulation engine by establishing:
- port language
- patch view conventions
- node interface truth
- wire rendering infrastructure
- a docked utility surface that can later host global modulation / automation / envelope tools without restructuring the workspace model

The modulation engine should ideally live at a broader Manifold level, not as a MidiSynth-only hack.

### Future modular DSP

The framework also lays groundwork for future node-based DSP composition by establishing:
- row/grid occupancy
- node identity and placement
- wire display conventions
- declared node interface contracts

The UI language should not have to change radically when those systems arrive.

---

## Initial Node Set

Initial nodes for migration:
- ADSR
- Oscillator / Sample / Blend source node
- Filter
- FX1
- FX2
- EQ
- Utility dock with initial keyboard mode

Additional nodes and utility-dock modes can be introduced later once the framework is stable.

---

## Open Questions

These remain open and should be refined during implementation:
1. exact persistence model for density/context variants
2. exact rendering language for rack spacers/rails in both views
3. minimum practical size per node type
4. exact utility-dock mode set and switching behavior
5. exact rack pagination behavior (dot interaction, row pair transitions)
6. how much patch-view interaction should exist before modulation is implemented

---

## References

### Prototypes
- `/prototypes/manifold-rack-v1.html`
- `/prototypes/prototype-1-clean-dark.html`
- `/prototypes/prototype-2-skeuo-hardware.html`
- `/prototypes/prototype-3-flat-minimal.html`
- `/prototypes/prototype-4-warm-analog.html`
- `/prototypes/prototype-5-high-contrast.html`

### Current implementation
- `UserScripts/projects/Main/ui/components/midisynth_view.ui.lua`
- `UserScripts/projects/Main/ui/behaviors/midisynth.lua`
- `UserScripts/projects/Main/ui/components/patch_connector.ui.lua`
- `UserScripts/projects/Main/dsp/midisynth_integration.lua`
