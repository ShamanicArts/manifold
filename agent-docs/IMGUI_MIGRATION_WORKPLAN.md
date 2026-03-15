# ImGui Migration Work Plan

Status: planning
Companion doc: [IMGUI_RENDERER_MIGRATION_PLAN.md](./IMGUI_RENDERER_MIGRATION_PLAN.md)

---

## Overview

Migrate product UI from Canvas/JUCE-backed runtime to RuntimeNode/ImGui-backed runtime while preserving existing Lua composition model and allowing incremental widget migration.

---

## Phase 0: Preparation

### Task 0.1: Audit current widget inventory
Understand what needs to migrate.

- [ ] List all widgets in `manifold/ui/widgets/`
- [ ] Categorize by complexity (simple/medium/complex)
- [ ] Identify which use `gfx.*` drawing
- [ ] Identify which use `gl.*` / OpenGL
- [ ] Identify which use `customRenderPayload` already
- [ ] Document any widgets with unusual input patterns
- [ ] Create widget migration priority order

### Task 0.2: Audit current UI scripts
Understand real usage patterns.

- [ ] List shipped/example UI scripts
- [ ] Identify direct `gfx.*` usage outside widgets
- [ ] Identify direct `gl.*` usage outside widgets
- [ ] Note any Canvas APIs used that aren't in widgets
- [ ] Document any blocking patterns for migration

### Task 0.3: Set up test harness
Ability to verify rendering correctness.

- [ ] Screenshot capture for current Canvas output
- [ ] Screenshot capture for new ImGui output
- [ ] Diff tooling or visual comparison workflow
- [ ] Headless test path for automated verification

---

## Phase 1: RuntimeNode Foundation

### Task 1.1: Define RuntimeNode struct
The new canonical runtime node.

- [ ] Create `manifold/primitives/ui/RuntimeNode.h`
- [ ] Define `NodeId` type (string or integer, decide)
- [ ] Define `Rect` struct (x, y, w, h)
- [ ] Define `StyleState` struct (background, border, borderWidth, cornerRadius, opacity)
- [ ] Define `InputCapabilities` struct (or reuse existing)
- [ ] Define `AnimationState` struct (placeholder, can be minimal)
- [ ] Add hierarchy: parent pointer, children vector
- [ ] Add bounds: localBounds, clipRect, visible, zOrder
- [ ] Add interaction state: hovered, pressed, focused
- [ ] Add input callback slots (sol::function)
- [ ] Add render payload: displayList (juce::var or custom type)
- [ ] Add render payload: customSurfaceType + customSurfacePayload
- [ ] Add version counters: structureVersion, propsVersion, renderVersion
- [ ] Add userData storage
- [ ] Add helper methods: addChild, removeChild, findById, markDirty variants

### Task 1.2: Define DisplayList format
Intermediate render representation for custom 2D drawing.

- [ ] Document display list command format
- [ ] Support: fillRect, fillRoundedRect, drawRect, drawRoundedRect
- [ ] Support: drawLine, drawText
- [ ] Support: setColor, setFont
- [ ] Support: save, restore, clipRect
- [ ] Support: drawImage (texture reference)
- [ ] Consider: gradient fills, paths (scope decision)
- [ ] Write parser/validator for display list

### Task 1.3: Define CustomSurface abstraction
For shader/GL/waveform content.

- [ ] Define `CustomSurfaceType` enum (Shader, Waveform, Spectrum, GL, etc.)
- [ ] Define `CustomSurfacePayload` (variant or tagged union)
- [ ] Define lifecycle hooks: create, update, destroy
- [ ] Define how surface gets a render target / texture
- [ ] Define how surface declares its input needs

### Task 1.4: Build RuntimeNode tree management
Basic tree operations.

- [ ] Create root node factory
- [ ] Implement addChild with ID generation
- [ ] Implement removeChild with cleanup
- [ ] Implement findById (recursive)
- [ ] Implement tree traversal (depth-first)
- [ ] Implement dirty propagation
- [ ] Unit tests for tree operations

---

## Phase 2: Canvas Adapter

### Task 2.1: Refactor Canvas to wrap RuntimeNode
Canvas becomes a view, not the truth.

- [ ] Add `RuntimeNode* node_` member to Canvas
- [ ] Create RuntimeNode in Canvas constructor
- [ ] Forward `setNodeId` / `getNodeId` to node_
- [ ] Forward `setWidgetType` / `getWidgetType` to node_
- [ ] Forward `setUserData` / `getUserData` to node_
- [ ] Forward `setDisplayList` / `getDisplayList` to node_
- [ ] Forward `setCustomRenderPayload` to node_
- [ ] Forward version getters to node_
- [ ] Forward visibility to node_
- [ ] Keep bounds sync: Canvas bounds ↔ node_ bounds
- [ ] Keep children sync: Canvas children ↔ node_ children
- [ ] Verify existing Lua code still works unchanged

### Task 2.2: Forward input state to RuntimeNode
Input callbacks populate node state.

- [ ] Update mouseEnter/mouseExit to set node_->hovered
- [ ] Update mouseDown to set node_->pressed
- [ ] Update mouseUp to clear node_->pressed
- [ ] Update focus callbacks to set node_->focused
- [ ] Forward input callbacks through node_ (node stores sol::function)
- [ ] Verify existing input handling still works

### Task 2.3: Sync InputCapabilities
Keep capability metadata on node.

- [ ] Move InputCapabilities to RuntimeNode
- [ ] Canvas::syncInputCapabilities updates node_
- [ ] Verify capability introspection still works

### Task 2.4: Integration test - adapter passthrough
Verify nothing broke.

- [ ] Run existing UI scripts
- [ ] Verify hierarchy inspection works
- [ ] Verify input handling works
- [ ] Verify drawing works (still via Canvas/JUCE path)
- [ ] Verify editor metadata works

---

## Phase 3: Lua Binding Updates

### Task 3.1: Expose RuntimeNode to Lua
New bindings alongside Canvas.

- [ ] Create `LuaRuntimeNodeBindings.cpp`
- [ ] Bind RuntimeNode usertype
- [ ] Bind addChild, removeChild
- [ ] Bind setBounds, getBounds
- [ ] Bind setStyle (table → StyleState)
- [ ] Bind setVisible, isVisible
- [ ] Bind setNodeId, getNodeId
- [ ] Bind setWidgetType, getWidgetType
- [ ] Bind setUserData, getUserData
- [ ] Bind input callback setters
- [ ] Bind setDisplayList
- [ ] Bind setCustomSurface
- [ ] Bind version getters
- [ ] Bind state getters (isHovered, isPressed, isFocused)

### Task 3.2: Unified node access
Make Canvas and RuntimeNode interchangeable from Lua where possible.

- [ ] Decide: does `parent:addChild()` return Canvas or RuntimeNode?
- [ ] Option A: Canvas wraps RuntimeNode, Lua sees Canvas, internals use node_
- [ ] Option B: New API returns RuntimeNode, old API returns Canvas
- [ ] Implement chosen approach
- [ ] Document migration path for widget authors

### Task 3.3: Style binding helpers
Make style setting ergonomic.

- [ ] Lua helper: `node:setStyle({ background = 0xFF000000, ... })`
- [ ] Color format: support 0xAARRGGBB and {r,g,b,a} table
- [ ] Style inheritance helpers (optional, can defer)

---

## Phase 4: ImGui Renderer Backend

### Task 4.1: Renderer architecture
Set up the rendering pipeline.

- [ ] Create `manifold/ui/imgui/RuntimeNodeRenderer.h/.cpp`
- [ ] Define render entry point: `render(RuntimeNode* root)`
- [ ] Set up ImGui frame begin/end integration
- [ ] Decide: new ImGui host component or integrate with existing?
- [ ] Handle coordinate system (ImGui screen coords vs local)

### Task 4.2: Basic widget rendering
Render standard widget types via node properties.

- [ ] Render Panel: background rect with style
- [ ] Render Label: text with style
- [ ] Render Button: background + text + hover/press states
- [ ] Render Image: texture quad
- [ ] Handle visibility (skip invisible nodes)
- [ ] Handle clipping (clipRect)
- [ ] Handle z-order (child order)

### Task 4.3: DisplayList rendering
Execute display list commands through ImGui.

- [ ] Parse display list from node
- [ ] Implement fillRect → ImGui::GetWindowDrawList()->AddRectFilled
- [ ] Implement fillRoundedRect
- [ ] Implement drawRect → AddRect
- [ ] Implement drawLine → AddLine
- [ ] Implement drawText → AddText
- [ ] Implement setColor (state tracking)
- [ ] Implement clipRect → PushClipRect/PopClipRect
- [ ] Implement save/restore (clip stack)

### Task 4.4: Input routing
Route ImGui input to RuntimeNode callbacks.

- [ ] Track which node is under cursor (hit testing)
- [ ] Route mouse down to node callback
- [ ] Route mouse drag to node callback
- [ ] Route mouse up to node callback
- [ ] Route mouse wheel to node callback
- [ ] Route keyboard to focused node
- [ ] Handle hover enter/exit
- [ ] Handle focus management

### Task 4.5: Integration test - basic ImGui path
Verify ImGui renderer works.

- [ ] Render a simple test tree (Panel + Label + Button)
- [ ] Verify visual output
- [ ] Verify input handling
- [ ] Compare with Canvas path output

---

## Phase 5: Custom Surface Integration

### Task 5.1: Shader surface rendering
Render shader content in ImGui regions.

- [ ] Create ShaderSurface implementation
- [ ] Allocate offscreen texture for shader output
- [ ] Execute shader render to texture
- [ ] Display texture in ImGui via AddImage
- [ ] Handle resize
- [ ] Handle uniforms from payload
- [ ] Route input to shader surface if needed

### Task 5.2: Waveform surface rendering
Render waveform content.

- [ ] Create WaveformSurface implementation
- [ ] Decide: ImGui draw list vs offscreen texture
- [ ] Implement waveform rendering
- [ ] Handle audio buffer updates
- [ ] Handle zoom/scroll state

### Task 5.3: Generic GL surface
For arbitrary OpenGL content.

- [ ] Create GLSurface implementation
- [ ] Provide GL context to Lua callback
- [ ] Render to offscreen texture
- [ ] Composite into ImGui

### Task 5.4: Integration test - custom surfaces
Verify custom content works.

- [ ] Test shader surface renders correctly
- [ ] Test waveform surface renders correctly
- [ ] Test input routing to custom surfaces
- [ ] Test resize behavior

---

## Phase 6: Widget Migration

### Task 6.1: Migrate simple widgets
Widgets that just set style, no custom drawing.

- [ ] Migrate Panel widget
- [ ] Migrate Label widget
- [ ] Migrate Button widget
- [ ] Migrate Toggle widget
- [ ] Test each widget in isolation
- [ ] Test widgets in real UI context

### Task 6.2: Migrate standard controls
Widgets with state + simple custom drawing.

- [ ] Migrate Slider widget
- [ ] Migrate VSlider widget
- [ ] Migrate Knob widget
- [ ] Migrate NumberBox widget
- [ ] Migrate Dropdown widget
- [ ] Test each widget

### Task 6.3: Migrate complex widgets
Widgets with significant custom rendering.

- [ ] Migrate WaveformView widget
- [ ] Migrate Meter widget
- [ ] Migrate SegmentedControl widget
- [ ] Migrate any shader-based widgets
- [ ] Test each widget

### Task 6.4: Migrate base.lua
Update base widget class.

- [ ] Remove `setOnDraw` dependency
- [ ] Update `bindCallbacks` to use new input API
- [ ] Update `setBounds` to use RuntimeNode
- [ ] Update `setVisible` / `isVisible`
- [ ] Update editor metadata storage
- [ ] Verify all derived widgets still work

### Task 6.5: Update ui_widgets.lua
The widget library entry point.

- [ ] Verify all exports work with new backend
- [ ] Update any direct Canvas references
- [ ] Test full widget library

---

## Phase 7: Shell & Editor Integration

### Task 7.1: Update hierarchy traversal
Shell walks RuntimeNode tree instead of Canvas tree.

- [ ] Update `inspector_utils.lua` to traverse RuntimeNode
- [ ] Update `methods_core.lua` hierarchy functions
- [ ] Verify hierarchy view works
- [ ] Verify selection works

### Task 7.2: Update inspector
Inspector reads from RuntimeNode.

- [ ] Inspector reads nodeId from RuntimeNode
- [ ] Inspector reads widgetType from RuntimeNode
- [ ] Inspector reads userData/_editorMeta from RuntimeNode
- [ ] Verify inspector display works
- [ ] Verify inspector editing works

### Task 7.3: Update selection/interaction
Editor interactions work with RuntimeNode.

- [ ] Selection highlight renders via ImGui
- [ ] Resize handles render via ImGui
- [ ] Drag behavior works through RuntimeNode
- [ ] Verify edit mode works

### Task 7.4: Update surface descriptors
Surface system uses RuntimeNode.

- [ ] Surface descriptors reference RuntimeNode roots
- [ ] Surface bounds sync works
- [ ] Multi-surface rendering works

---

## Phase 8: Cleanup & Polish

### Task 8.1: Remove Canvas rendering path
Once everything works through ImGui.

- [ ] Remove `onDraw` callback usage
- [ ] Remove `gfx.*` usage from widgets
- [ ] Remove or deprecate `gfx.*` bindings
- [ ] Canvas becomes thin JUCE host only (holds ImGui context)

### Task 8.2: Remove Canvas adapter overhead
If Canvas is no longer needed as wrapper.

- [ ] Evaluate: is Canvas still needed at all?
- [ ] If yes: minimize to just JUCE host component
- [ ] If no: remove Canvas, use pure RuntimeNode tree

### Task 8.3: Performance validation
Verify the new path is actually faster.

- [ ] Benchmark: frame time comparison
- [ ] Benchmark: large UI (100+ widgets)
- [ ] Benchmark: high DPI
- [ ] Profile and optimize hot paths

### Task 8.4: Documentation
Update docs for new architecture.

- [ ] Document RuntimeNode API for widget authors
- [ ] Document DisplayList format
- [ ] Document CustomSurface types
- [ ] Document migration guide for existing widgets
- [ ] Update architecture docs

---

## Phase 9: Advanced Features (Future)

### Task 9.1: Animation system
First-class animation support.

- [ ] Define animation channel model
- [ ] Implement animation tick/update
- [ ] Support style property animation
- [ ] Support transform animation
- [ ] Lua API for animation

### Task 9.2: Retained render optimization
Caching and partial updates.

- [ ] Cache rendered textures for static subtrees
- [ ] Dirty rect tracking
- [ ] Partial tree re-render

### Task 9.3: Remote session rendering
Render RuntimeNode tree from remote source.

- [ ] Serialize RuntimeNode tree
- [ ] Sync protocol for tree updates
- [ ] Render remote tree locally

---

## Dependency Graph

```
Phase 0 (Audit)
    ↓
Phase 1 (RuntimeNode) ←── foundational, must be solid
    ↓
Phase 2 (Canvas Adapter) ←── enables incremental migration
    ↓
Phase 3 (Lua Bindings)
    ↓
Phase 4 (ImGui Renderer) ←── first visual proof
    ↓
Phase 5 (Custom Surfaces) ←── needed for real UIs
    ↓
Phase 6 (Widget Migration) ←── bulk of the work
    ↓
Phase 7 (Shell/Editor)
    ↓
Phase 8 (Cleanup)
    ↓
Phase 9 (Future)
```

---

## Risk Checkpoints

### After Phase 2
- [ ] Existing UIs still work unchanged
- [ ] No runtime regressions

### After Phase 4
- [ ] Simple UI renders through ImGui
- [ ] Input works through ImGui
- [ ] Performance is acceptable

### After Phase 6
- [ ] All standard widgets work through ImGui
- [ ] Real UIs render correctly

### After Phase 7
- [ ] Editor tooling works
- [ ] Full workflow is functional

---

## Success Criteria

1. **All existing UIs render correctly through ImGui path**
2. **Performance is better than Canvas/JUCE path** (especially at scale/high-DPI)
3. **Widget authoring API is clean** (no worse than current, ideally better)
4. **Custom visuals (shaders, waveforms) work**
5. **Editor tooling (hierarchy, inspector, selection) works**
6. **No regression in shipped functionality**
