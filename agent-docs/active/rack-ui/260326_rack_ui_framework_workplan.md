# Rack UI Framework Workplan

## Goal

Replace the current fixed MidiSynth layout with a reusable rack/node framework that supports node placement, reorder, sizing, performance/patch projection, honest port display, and a docked utility panel with an initial keyboard mode, while keeping the current fixed instrument DSP underneath.

This workplan is intentionally phased so we do not do a giant incoherent rewrite.

---

## High-Level Strategy

Do this in layers:
1. define the data model and framework boundary
2. build rack layout infrastructure without touching DSP behavior semantics
3. migrate existing modules into generic node shells
4. add patch-view projection from declared interface truth
5. introduce a docked utility panel abstraction with an initial keyboard mode
6. only after framework stability, consider deeper modulation/modular steps

The main rule is:
- **front-end infrastructure first**
- **DSP truth remains fixed initially**
- **patch view displays truth before it becomes fully interactive**

---

## Progress Snapshot

### Current status
- **Phase 0:** complete
- **Phase 1:** complete - data model and framework API defined
- **Phase 2:** complete - generic rack container and node shell primitives working
- **Phase 3:** complete - same-row and cross-row drag reorder working via virtual-strip projection
- **Phase 5 (Port Declarations):** complete - all nodes have rich input/output port specs
- **Phase 8:** complete - utility dock state migrated, keyboard abstraction in place
- **Resize Affordance:** complete - width toggle (1x1 ↔ 1x2) implemented for all nodes with proper layout rules

### Completed so far
- wrote and refined the framework spec
- wrote the phased workplan
- completed Phase 0 inventory in `agent-docs/RACK_UI_PHASE0_INVENTORY.md`
- added pure rack/layout helper module:
  - `UserScripts/projects/Main/ui/behaviors/rack_layout.lua`
- added MidiSynth seeded node-spec / placement / connection module:
  - `UserScripts/projects/Main/ui/behaviors/rack_midisynth_specs.lua`
- added Lua tests for rack state / occupancy / reorder / seeded specs:
  - `UserScripts/projects/Main/ui/tests/test_rack_layout.lua`
- added IPC smoke test for live runtime globals:
  - `UserScripts/projects/Main/ui/tests/test_rack_runtime_ipc.sh`
- began utility-dock state migration in:
  - `UserScripts/projects/Main/ui/behaviors/midisynth.lua`
- wired seeded rack state / node specs / connection descriptors into live MidiSynth behavior and exposed them for IPC/EVAL inspection
- wrapped the visible MidiSynth module surface in authored shell panels for all six primary nodes:
  - ADSR
  - Oscillator
  - Filter
  - FX1
  - FX2
  - EQ
- neutralized inner module root chrome via component instance overrides so the shell panels can provide the surrounding rack-node surface without rewriting module internals
- identified and documented the first real shell interaction constraint: shell child hit areas sit below hosted component roots in structured UI instantiation order, so module root interception must be managed deliberately
- wired shell order/size-badge state from seeded rack state in `midisynth.lua`
- implemented reserved top drag-handle space in rack shells so hosted module controls no longer fight the reorder grab region
- implemented live same-row drag reorder with a floating ghost and in-row placeholder behavior for the primary rack nodes
- **NEW:** created generic `PaginationDots` widget (`ui/components/pagination_dots.lua`)
- **NEW:** refactored dock dots to use `PaginationDots` widget
- **NEW:** added rack pagination dots to right padding (between row 1-2)
- **NEW:** wired rack pagination click handlers and visual state (dots glow for visible rows)
- **NEW:** added row 3 with placeholder nodes (sized 1x2, 1x2, 1x1)
- **NEW:** fixed oscillator Wave tab knob relayout on keyboard collapse

### Explicitly not completed yet
- row membership is still structurally authored (`rackRow1` / `rackRow2` / `rackRow3`) rather than fully dynamic/reparentable from rack state
- visible routing still uses suffix-matched connector components rather than the future graph-aware descriptor-driven wire layer
- drag visuals are functional but still prototype-level rather than polished final UX
- rack pagination auto-sync with dock height changes (currently manual click only)
- current shell accent colour strips are temporary debug visuals, not agreed final rack styling
- resize state persistence: toggle buttons work but don't yet update `rackState.nodes[].w` for persistence
- ⚠️ port strips: basic infrastructure in place (port panels render with colored circles) but needs refinement based on feedback
- ⚠️ wire layer: basic bezier curves rendering between ports but visual quality needs work

### Verified so far
- pure Lua rack-layout tests passing
- modified Lua files parse successfully
- live Main project still loads through IPC `UISWITCH`
- live app still responds to IPC health checks
- live MidiSynth runtime exposes seeded rack globals through IPC/EVAL (`__midiSynthRackState`, `__midiSynthRackConnections`, `__midiSynthUtilityDock`)
- Main project survives reload with the new shell-based MidiSynth view composition

### Verification limits
- this verification proves that shell-based Phase 2 composition is retained in the runtime without immediate load failure
- interactive rack behavior now exists: same-row and cross-row drag reorder are wired into the visible shell UI
- resize affordance now exists: width toggle (1x1 ↔ 1x2) buttons in shell headers, with proper collapse/expand layouts
- remaining verification gaps: persistence round-trip after cross-row moves and resize toggles, patch view overlay

### Current implementation notes
- visible MidiSynth module composition is now shell-based across all six main nodes, but still transitional rather than a finished generic rack system
- `rack_container.lua` and `rack_node_shell.lua` exist as first-pass generic components
- canonical node sizing established: 1x1 = 220x220, 1x2 = 440x220 (cols × 220, rows × 220)
- row 3 added with placeholder nodes; sizing issues caused by `align="stretch"` + grow factors now resolved
- shell order/size badge state is now being driven from seeded rack state in a limited way
- shell accent colour strips are currently being used as temporary debug visuals to make shell boundaries obvious; they should not be mistaken for agreed final rack styling
- shell content is now pushed below a reserved top handle strip so drag capture does not compete with hosted module controls
- structured UI layering constraint now confirmed: shell `children` are instantiated before hosted `components`, so hosted component roots sit above shell child hit-surfaces unless root interception is explicitly disabled
- placeholders responding to drag while real modules did not was caused by exactly this difference: placeholder component roots already had `interceptsMouse = false`, while the real module roots were still capturing
- same-row drag reorder now works in the live UI with:
  - shell-owned drag handles
  - floating drag ghost
  - in-row placeholder state
  - live sibling displacement preview
  - commit on mouse-up
- rack/domain/state groundwork is now in place before deeper visible migration work
- utility dock state has begun replacing keyboard-only assumptions under the hood
- utility dock UI controls exist (`dockModeDots` with full/compact/collapsed indicators)
- **NEW:** generic `PaginationDots` widget created and reused for dock and rack
- **NEW:** rack pagination dots positioned in right padding between rows 1-2
- **NEW:** rack pagination wired: click dot 1→rows 1-2, dot 2→toggle, dot 3→rows 2-3
- **NEW:** visual state sync: dots glow white for visible rows, dim for hidden
- **NEW:** dock collapse auto-shows all 3 rows (dots 1-2-3 glow)
- **NEW (March 24, 2026):** cross-row drag-to-reorder via virtual-strip projection
  - replaced hard-coded row-authored shell structure with state-driven projection
  - implemented virtual strip model: one long ordered node strip projected into wrapped rows
  - direct-child shell architecture: shells are children of rackContainer with explicit x,y,w,h
  - cross-row targeting: computes insertion index across row boundaries using Y-position bands
  - row-3 visibility: derived from dock state, rackContainer always has full height (684), viewport/overlay controls visibility
  - state synchronization: dock mode changes update both ctx._utilityDock and ctx._rackState.utilityDock atomically
  - fixed row-3 rendering bug by removing imperative visibility toggles on shells; shells always exist, container height + overlay determines visibility
- **NEW (March 24, 2026):** resize affordance - width toggle (1x1 ↔ 1x2)
  - added resize toggle button to shell header (shows "<" or ">" based on current size)
  - **1x2 (expanded):** graph on left, parameters on right (standard layout)
  - **1x2 (expanded):** graph on left, parameters on right (standard layout)
  - **1x1 (collapsed):** graph only for Oscillator/Filter/FX; ADSR/EQ keep current layout (no regression)
  - fixed sizes only: removed fill/stretch behavior, nodes have exact widths (1x1=236px, 1x2=472px)
  - zero gaps: RACK_ROW_GAP = 0, shells positioned exactly side-by-side
  - visibility-based collapse: parameters hidden via setVisible(false) when collapsed
  - rack container top padding: 25px to match left padding
  - keyboard panel gap removed: mainStack gap = 0 for flush alignment
  - keyboard heights tuned: collapsed=44px, full=555px with equal 4px top/bottom padding
- **NEW (March 24, 2026):** patch view toggle working
  - button switches between "PATCH" and "PERF" labels correctly
  - `syncPatchViewMode()` shows/hides module content based on view mode
  - patch mode shows simplified shells (like drag ghosts)
  - perf mode shows full module content
  - fixed duplicate handler conflict that was causing sync issues

### Next intended execution slice

**Phase 5/6/7 - Patch View & Routing (IN PROGRESS)**

1. **✅ Port Declarations - COMPLETED**
   - Expanded all node specs with rich port declarations:
     - ADSR: 5 inputs (GATE, RETRIG, ATK, DEC, SUS), 3 outputs (ENV, INV, EOC)
     - Oscillator: 6 inputs (GATE, V/OCT, PITCH, FM, PW, BLEND), 2 outputs (OUT, SUB)
     - Filter: 4 inputs (IN, CUTOFF, RES, ENV), 2 outputs (OUT, SEND)
     - FX1: 5 inputs (IN, RECV, MIX, P1, P2), 2 outputs (OUT, ENV)
     - FX2: 4 inputs (IN, MIX, P1, P2), 2 outputs (OUT, ENV)
     - EQ: 4 inputs (IN, LOW, MID, HIGH), 1 output (OUT)
   - All ports have `type` ("audio" | "control"), `y` position (0-1), and `label`
   - Updated connection descriptors to use new port IDs

2. **✅ Create Patch View Toggle UI - COMPLETED**
   - Patch toggle button added to header at (1180, 0)
   - Click handler wired using `_onClick` callback
   - Toggles `rackState.viewMode` between "perf" and "patch"
   - Button label updates to show current mode (PATCH/PERF)
   - Calls `syncPatchViewMode(ctx)` to show/hide module content
   - Fixed duplicate handler conflict that was causing label sync issues

3. **✅ Module Content Show/Hide for Patch View - COMPLETED**
   - `syncPatchViewMode()` function implemented
   - Shows simplified "ghost" shells in patch mode (like drag placeholders)
   - Hides internal module content components when in patch mode
   - Shows full module content when in perf mode
   - Applied to all rack shells: ADSR, Oscillator, Filter, FX1, FX2, EQ, placeholders

4. **Implement Port Strips for Patch View**
   - Left side = inputs (green=audio, cyan=control)
   - Right side = outputs
   - Small circular ports with glow effect
   - Only visible in patch view

5. **Implement Wire Layer (Patch View Only)**
   - SVG overlay on rack container
   - Bezier curves between connected ports
   - Audio = thicker, green; Control = thinner, cyan
   - Drop shadow glow matching wire color
   - NOT rendered in performance view (clean modules only)

6. **Port Interaction (Future)**
   - Click to select, click target to connect
   - Highlight available ports during connection
   - Visual feedback for selected/hover states

### Lessons Learned - Structured UI Rendering Architecture

**The Rendering Stack (what I got confused about):**

1. **Structured UI (Main project) uses ImGui for ALL rendering**
   - Even when you see `gfx.drawLine()`, it's NOT using JUCE Graphics
   - The `gfx` table is bound to ImGui rendering via `ImGuiDirectHost.cpp`
   - The display list path: Lua JSON commands → RuntimeNode.cpp (compile) → ImGuiDirectHost.cpp (render via ImDrawList)

2. **Two different display list systems exist:**
   - **Compiled path** (structured UI): `node:setDisplayList()` → `RuntimeNode.cpp` compiles to `CompiledDrawCmd` → `ImGuiDirectHost::renderCompiledDisplayList()` renders via `ImDrawList->Add*()`
   - **JSON path** (DSP live scripting): Direct JSON parsing in `RuntimeNodeRenderer.cpp` - NOT used by structured UI

3. **Where to add new draw commands:**
   - Add command enum to `RuntimeNodeRenderer.h` (`CompiledDrawCmd::Type`)
   - Add fields to `CompiledDrawCmd` struct (x1, y1, cx1, cy1, etc.)
   - Add parsing in `RuntimeNode.cpp` (extract fields from JSON)
   - Add case in `ImGuiDirectHost.cpp` (`renderCompiledDisplayList`)
   - Add Lua→JSON recording in `LuaUIBindings.cpp` (if needed for immediate mode)

4. **Why my debug prints didn't show up:**
   - I was adding printf to `RuntimeNodeRenderer.cpp` which handles the JSON/DSP-live-scripting path
   - Structured UI uses `ImGuiDirectHost.cpp` which has its own rendering loop
   - The functions have similar names but are completely different code paths

5. **The shell's `drawDisplayListImmediate` vs compiled display lists:**
   - `drawDisplayListImmediate` in `bindings.lua` is for tree/dock UI elements (manual drawing)
   - Widgets use `node:setOnDraw()` with direct `gfx.*` calls
   - The wire overlay uses `node:setDisplayList()` which goes through the compiled path
   - Adding to `drawDisplayListImmediate` is NOT sufficient - must add to compiled renderer too

**Key files for structured UI rendering:**
- `manifold/primitives/ui/RuntimeNode.cpp` - compiles JSON display list to CompiledDrawCmd
- `manifold/ui/imgui/ImGuiDirectHost.cpp` - renders CompiledDrawCmd via ImGui
- `manifold/primitives/scripting/bindings/LuaUIBindings.cpp` - binds gfx.* for immediate mode
- `manifold/ui/shell/bindings.lua` - `drawDisplayListImmediate` for shell UI elements

### Verification requirements for the next slice
- Lua syntax checks for touched files
- `lua UserScripts/projects/Main/ui/tests/test_rack_layout.lua`
- `bash UserScripts/projects/Main/ui/tests/test_rack_runtime_ipc.sh`
- `UISWITCH` back into Main after each visible milestone
- IPC/EVAL checks for:
  - `__midiSynthRackState`
  - `__midiSynthRackConnections`
  - `__midiSynthUtilityDock`
  - dock mode / rack node count after reload

---

## Phase 0 - Discovery and Current-System Inventory

**Status:** complete

### Objective
Get brutally explicit about what exists today so the framework is grounded in reality rather than prototype vibes.

### Tasks
- inventory current MidiSynth UI composition
- inventory current keyboard behavior/state
- inventory current connector behavior
- inventory existing component-level `ports` declarations and determine which are real versus decorative/stale
- inventory current DSP top-level flow vs internal node structure
- inventory current component contracts for ADSR, Oscillator, Filter, FX, EQ
- identify which current controls/params should become node-declared interface entries

### Deliverables
- current-system inventory notes added to spec or working notes
- per-node list of:
  - current widget component
  - current behavior
  - current DSP paths
  - current visible controls
  - likely patch-view port candidates

### Acceptance criteria
- can describe each current node in terms of future rack-node contract
- can map current decorative connectors to future routing-display sources

### Progress notes
- completed in `agent-docs/RACK_UI_PHASE0_INVENTORY.md`
- current components, ports, DSP mapping, and connector limitations have been inventoried
- confirmed that current component `ports` blocks exist but are too sparse and are not consumed by the current wire layer

---

## Phase 1 - Rack Domain Model

**Status:** in progress

### Objective
Define the minimal reusable state model and framework API before building visuals.

### Tasks
- define `rackState` shape
- define `nodeSpec` shape
- define `nodeInstance` / layout placement shape
- define row/col/w/h occupancy contract
- make occupancy explicitly cell-level for multi-row / multi-column nodes
- define size enum / representation
- define view mode and density mode state
- define docked utility panel state model
- define persistence strategy

### Key decisions already made
- explicit occupancy/grid model is canonical
- perf and patch generally share node positions/sizes
- same-row reorder never resizes
- cross-row move / insertion may resize if needed
- patch view shows real declared node interface

### Deliverables
- a concrete Lua data contract doc or module stub for:
  - rack state
  - node spec
  - node layout instance
  - port declaration model

### Acceptance criteria
- all later UI code can target these contracts instead of ad hoc widget IDs

### Progress notes
- implemented first-pass data/domain helpers in `UserScripts/projects/Main/ui/behaviors/rack_layout.lua`
- implemented:
  - default rack state
  - default utility-dock state
  - node spec / node instance constructors
  - connection descriptor constructor
  - cell-level occupancy builder
  - same-row reorder helper with size preservation
  - row packing and relocation scaffolding
- implemented seeded MidiSynth rack definitions in `UserScripts/projects/Main/ui/behaviors/rack_midisynth_specs.lua`
- began runtime-state migration in `midisynth.lua` so utility-dock state can coexist with legacy `keyboardCollapsed`
- seeded rack state / node specs / connection descriptors are now initialized in live MidiSynth behavior and exposed for inspection
- tests added in `UserScripts/projects/Main/ui/tests/test_rack_layout.lua`
- verified by pure Lua test run and live IPC smoke reload of Main project
- **sizing decisions**: canonical node dimensions are `cols × 220` × `rows × 220` (e.g., 1x1 = 220×220, 1x2 = 440×220); `layoutChild.grow` must be controlled or rows use `align="stretch"` to prevent unwanted expansion
- **viewport decision**: pagination with side dot indicators preferred over scrolling (like utility dock pattern); dots indicate visible rows, clicking shifts viewport to show row pairs

---

## Phase 2 - Generic Rack Container and Node Shell

**Status:** in progress

### Objective
Create the reusable UI primitives that will host the existing MidiSynth modules.

### Tasks
- implement rack container component
- implement row rendering
- implement generic node shell/container
- add node header area
- add size badge / resize affordance
- add content slot for perf face
- add patch overlay slot / region
- add spacer/rail rendering regions between rows
- design rack viewport as paginated 2-row window with side dot indicators
- dots show which rows visible (glow = visible, dim = hidden)
- clicking dots shifts viewport to show row pairs (1-2, 2-3) or all rows when space allows

### Deliverables
- rack container UI component
- rack node shell UI component
- basic styling tokens for node frame/header/accent states

### Acceptance criteria
- can render a rack from pure state
- can place multiple placeholder nodes in rows
- node shell can host arbitrary existing content component inside it
- rack viewport uses pagination with dot indicators; clicking dots shifts visible row pair

### Progress notes
- `rack_node_shell.lua` and `rack_container.lua` implemented as first-pass generic components
- all six primary nodes (ADSR, Oscillator, Filter, FX1, FX2, EQ) wrapped in shells
- row 3 added with placeholder nodes for future expansion
- canonical sizing established: `cols × 220` × `rows × 220` (1x1 = 220×220, 1x2 = 440×220)
- sizing fix: `align="stretch"` + grow factors caused unwanted expansion; resolved by using fixed layout or explicit grow=0
- pagination implemented with side dots: dots glow for visible rows, clicking shifts viewport between row pairs
- generic `PaginationDots` widget created and used for both dock and rack pagination
- current Phase 2 is still transitional rather than final:
  - row structure is still authored (`rackRow1/2/3`) not state-driven
  - shell layout is only partially rack-state-driven
  - connectors are still old-style suffix-matched components
  - shell accent strips are temporary debug chrome
- this means the visible UI now has a real retained rack-node surface, but not yet the full generic rack framework promised by later phases

---

## Phase 3 - Layout Engine and Reorder Behavior

**Status:** in progress, same-row reorder is live in the UI; remaining drag behaviors and cross-row movement are not finished

### Objective
Make the rack actually behave like a rack instead of a static grid drawing.

### Tasks
- implement occupancy resolution
- implement same-row reorder behavior
- implement left/right shifting to accommodate same-row move
- enforce no-resize rule for same-row reorder
- implement cross-row move behavior
- implement insertion behavior for new nodes
- implement resize operation with valid-size constraints
- implement layout recomputation and redraw triggers

### Important behavior rules
- same-row reorder shifts nodes left/right and preserves sizes
- cross-row relocation may resize if needed
- new insertion may resize if needed
- preserve user intent over clever automatic layout churn

### Deliverables
- deterministic reorder engine
- resize engine
- layout recompute hooks

### Acceptance criteria
- moving nodes within same row never changes node sizes
- row order updates correctly
- layout remains stable and predictable
- no overlapping node frames

### Progress notes
- same-row reorder and row packing logic already exist in pure helper form in `rack_layout.lua`
- cell-level occupancy checks already exist in pure helper form in `rack_layout.lua`
- same-row drag reorder is now wired into the visible rack UI with shell handles, ghost, placeholder preview, and commit-on-drop
- remaining Phase 3 work is now concentrated in drag hardening, cross-row virtual-strip reorder, wrapped-row projection, and persistence verification rather than first-time UI wiring

---

## Phase 4 - Migrate Existing MidiSynth Modules into Node Shells

### Objective
Wrap the current authored modules in the new framework while keeping existing behaviors working.

### Tasks
- migrate ADSR component into rack node shell
- migrate Oscillator component into rack node shell
- migrate Filter component into rack node shell
- migrate FX1 component into rack node shell
- migrate FX2 component into rack node shell
- migrate EQ component into rack node shell
- replace fixed top/bottom row authored composition with rack-driven composition
- keep first-pass node shells delegating to the existing `midisynth.lua` monolith where necessary rather than blocking on a full behavior refactor
- extract only the minimum rack-specific orchestration/state needed to keep the framework clean

### File touchpoints likely
- `UserScripts/projects/Main/ui/components/midisynth_view.ui.lua`
- new rack-related UI components
- possibly helper behavior modules for rack orchestration

### Acceptance criteria
- MidiSynth tab renders through rack system rather than hardcoded top_row/bottom_row structure
- current controls still function
- current DSP still functions unchanged

---

## Phase 5 - Declared Node Interface / Port Model

### Objective
Introduce a first-class node interface schema that patch view can render honestly.

### Tasks
- define per-node port declarations
- map current DSP params/behavior params into node interface entries
- separate audio inputs/outputs from parameter/control-style inputs
- define visual metadata for ports
- define source of truth rules where port info may come from:
  - DSP
  - lower behavior
  - node schema

### Deliverables
- node registry or node declaration module
- initial port declarations for ADSR/Osc/Filter/FX/EQ/Keyboard

### Acceptance criteria
- every migrated node can declare a patch-facing interface
- port list is honest to the real node contract
- no fake hand-wavy modulation ports are invented without basis

---

## Phase 6 - Patch View Projection

### Objective
Project the same rack layout into an architectural patch view.

### Tasks
- add global perf/patch view mode state
- render patch overlay using same node frames/positions as perf
- render visible ports on each node
- suppress or simplify perf content where appropriate in patch view
- build clean routing display rules
- route cross-row wiring through rack spacers/rails where appropriate
- avoid ugly crossover mess
- keep patch view focused on inspection/interface comprehension rather than layout dragging in the first pass

### Important constraints
- patch view should usually preserve same node size/position as perf view
- patch view is a rendering mode, not a wholly separate layout
- if wiring becomes visually dirty, prefer cleaner abstraction over literal clutter
- do not design Phase 6 in a way that prevents a future patch-companion utility-dock mode from coexisting with performance view

### Deliverables
- first working patch view for MidiSynth rack
- patch-face visual language for ports and routing

### Acceptance criteria
- user can switch between perf and patch
- same rack arrangement remains recognizable
- patch view exposes node interfaces clearly
- routing display is legible

---

## Phase 7 - Routing Display Layer

### Objective
Replace ad hoc decorative connectors with a graph-aware rendering layer.

### Tasks
- define connection descriptor format
- explicitly replace current suffix-matching connector assumptions with declared-port consumption plus connection descriptors
- map current fixed DSP chain into connection descriptors
- add whatever small UI-consumable graph description is needed because `midisynth_integration.lua` does not currently expose the built graph in a directly reusable form
- render same-row and cross-row connections from descriptors
- update wire positions automatically on reorder/resize
- support rack rail/spacer transitions
- decide whether perf view shows none / minimal / rail-only routing

### Deliverables
- connection model
- wire rendering layer that is no longer hardwired to component suffixes
- a first-pass source of DSP-truth connection descriptors for the fixed MidiSynth chain

### Acceptance criteria
- wiring follows node movement/resizing automatically
- current DSP flow can be displayed without hardcoded per-widget connector components
- patch view routing is cleaner than current decorative connector setup

---

## Phase 8 - Docked Utility Panel

**Status:** partially started in state/persistence layer

### Objective
Promote the current keyboard area into a docked utility panel abstraction rather than a keyboard-only footer.

### Tasks
- define docked utility panel/container
- implement initial keyboard utility mode
- support at least compact and full keyboard height modes
- define future-capable utility mode contract so the dock can later host patch companion or modulation-oriented utility content
- migrate current inline keyboard controls/state into docked utility-panel state
- implement docked expand/collapse behavior rather than a free-floating window
- define persistence for utility panel visibility/mode/height

### Acceptance criteria
- bottom region is no longer a hardcoded keyboard footer in MidiSynth view
- initial keyboard mode works inside the utility panel abstraction
- utility panel state persists sanely
- architecture does not assume keyboard is the only future dock content

### Progress notes
- `midisynth.lua` now has first-pass utility-dock state under the hood:
  - visibility
  - mode
  - height mode
  - early layout/content scaffolding
- runtime persistence has been extended to include utility-dock fields while remaining compatible with legacy `keyboardCollapsed`
- visible UI controls exist (`dockModeDots` with full/compact/collapsed indicators in `midisynth_view.ui.lua`)
- compact mode returns rack space (row 3 becomes visible/paginated)
- remaining work: wire dot interaction to fully switch dock modes, verify persistence cycles

---

## Phase 9 - Tall Nodes and Multi-Row Presentation

### Objective
Support height-varying nodes properly.

### Tasks
- implement vertically spanning node layout
- define split-face rendering for tall nodes
- add visual connector/bar between upper/lower plates of one logical node
- verify drag/reorder behavior with tall nodes
- verify patch overlay works across multi-row node footprints

### Acceptance criteria
- a 2-row-tall node can render coherently
- tall nodes do not break row layout or patch routing readability

---

## Phase 10 - Persistence and Recovery

### Objective
Persist the rack as a user-authored workspace.

### Tasks
- save rack layout state
- save node sizes
- save docked utility panel state
- save view mode / density mode where appropriate
- define migration/default-seeding rules from current fixed layout into first rack layout

### Acceptance criteria
- layout survives reloads
- first-run default layout reproduces sensible current MidiSynth arrangement
- malformed saved layout can recover to defaults safely

---

## Phase 11 - Cleanup and Hardening

### Objective
Remove obsolete fixed-layout assumptions and hardcoded connector hacks.

### Tasks
- remove fixed `top_row` / `bottom_row` composition assumptions
- remove deprecated direct connector components if replaced by wire layer
- audit sizing edge cases
- audit resize/reorder UX
- audit performance of reflow and wire redraw
- test at different window sizes and tab embedding contexts

### Acceptance criteria
- MidiSynth no longer depends on fixed row component IDs for fundamental layout
- rack framework is reusable for future nodes/racks
- behavior is stable and predictable

---

## Suggested Implementation Order Inside the Codebase

1. add rack-state and node-schema modules/helpers
2. add rack container + node shell components
3. make a static rack render current nodes without interaction
4. add reorder logic
5. migrate current modules into shells
6. add patch view projection
7. replace decorative connectors with graph-aware wire layer
8. split keyboard into separate rack
9. add tall node support
10. persist the whole thing cleanly

This avoids trying to solve every problem at once.

---

## Key Risks

### Risk 1 - Framework leakage into module hacks
If the rack shell ends up full of MidiSynth-specific conditionals, the whole thing turns to shit.

**Mitigation:** keep rack behavior generic; put node-specific logic in node declarations/renderers.

### Risk 2 - Patch view becoming a lie
If patch view invents ports not grounded in declared interface truth, users will learn the wrong language.

**Mitigation:** derive from real node contract only.

### Risk 3 - Over-clever auto-layout
If the layout engine gets too smart, reordering will feel random and hostile.

**Mitigation:** preserve user intent; same-row reorder never resizes.

### Risk 4 - Wiring clutter
If wire drawing is too literal, patch view becomes unreadable and perf view becomes unusable.

**Mitigation:** prioritize clean routing language and rack spacer/rail use.

### Risk 5 - Doing modulation-engine work too early
That would bloat and derail the framework phase.

**Mitigation:** keep first implementation display-oriented and contract-oriented.

---

## Definition of Done for the First Meaningful Milestone

A strong first milestone is:
- MidiSynth renders through a rack container
- ADSR/Osc/Filter/FX1/FX2/EQ are rack nodes
- same-row reorder works
- node sizing works at least for a constrained initial subset
- perf and patch toggle exists
- patch view shows declared ports and clean routing
- keyboard is still allowed to remain temporarily old-style if needed for the milestone

That gets the new framework real enough to iterate without biting off the whole world.

---

## Definition of Done for the Full Initial Framework Pass

- main MidiSynth rack fully migrated
- keyboard moved into separate rack system
- patch view uses real declared node interfaces
- graph-aware wire layer replaces hardcoded decorative connectors
- persistence works
- framework is generic enough to reuse elsewhere in Manifold
