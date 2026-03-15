# Visual Scripting Feasibility Study

## Executive Summary

**Status:** HIGHLY FEASIBLE  
**Estimated Implementation:** 4-6 weeks  
**Core Insight:** The platform already has 80% of required infrastructure.

Manifold can evolve from a code-first scripting platform into a **bidirectional visual-textual programming environment** where the graph IS the code and the code IS the graph. Users can spawn nodes visually, wire them together, and click any node to edit its underlying Lua code in-place.

---

## The Vision: Bidirectional Live Coding

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  VISUAL GRAPH (Canvas)                  │  CODE EDITOR (Inline)              │
│                                         │                                    │
│  ┌─────────┐     ┌─────────┐           │  -- osc_1: selected node           │
│  │  OSC    │────▶│  FILTER │           │  osc_1:setFrequency(440)           │
│  │ 440Hz   │     │ 1200Hz  │           │  osc_1:setWaveform(0)              │
│  │ [Tab]   │     └────┬────┘           │  osc_1:setAmplitude(0.5)           │
│  └─────────┘          │                │                                    │
│                       ▼                │  [Ctrl+Enter to apply]             │
│                  ┌─────────┐           │                                    │
│                  │  DIST   │           │                                    │
│                  │ drive=4 │           │                                    │
│                  └─────────┘           │                                    │
│                                         │                                    │
│  [Drag] [Connect] [Double-click code]   │                                    │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Key Behaviors:**
- Edit either side, the other updates automatically
- Both are **live** - audio never stops
- Spawn nodes from palette → instant DSP + code generation
- Click node → Tab → edit its specific code
- Visual metadata (positions) preserved in code comments

---

## Current State: Foundation Exists

| Component | Status | Location | Notes |
|-----------|--------|----------|-------|
| **Text Editor** | ✅ Complete | `ImGuiInspectorHost`, `ImGuiHost` | ImGuiColorTextEdit with Lua highlighting |
| **Graph Visualization** | ✅ Complete | `ToolComponents::drawDspGraphPanel()` | Read-only grid view of nodes/edges |
| **Graph Data Structure** | ✅ Complete | `ScriptInspectorData::graphNodes/edges` | Parsed from Lua AST |
| **Live DSP Runtime** | ✅ Complete | `PrimitiveGraph` → `GraphRuntime` | Lock-free runtime swapping |
| **Hot Reload** | ✅ Complete | `DSPPluginScriptHost::reloadCurrentScript()` | Runtime code updates |
| **Param Binding** | ✅ Complete | `ctx.params.bind()` | Visual knobs → C++ nodes |
| **Interactive Canvas** | ❌ Missing | N/A | Need to extend graph view |
| **Bidirectional Sync** | ❌ Missing | N/A | Code ↔ Graph roundtrip |
| **Node Palette** | ❌ Missing | N/A | Spawn UI for primitives |

---

## Architecture

### High-Level Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     VISUAL EDITOR (ImGui)                               │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │  Graph Canvas                                                     │ │
│  │  ┌─────────┐     ┌─────────┐     ┌─────────┐                     │ │
│  │  │  OSC    │────▶│ FILTER  │────▶│  OUT    │                     │ │
│  │  │440Hz    │     │1200Hz   │     │gain=0.8 │                     │ │
│  │  └────┬────┘     └────┬────┘     └─────────┘                     │ │
│  │       │               │          ▲                                │ │
│  │       │  ┌─────────┐  │          │                                │ │
│  │       └──│  LFO    │──┘          │                                │ │
│  │          │2.5Hz    │─────────────┘                                │ │
│  │          └─────────┘                                               │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │  Node Palette                                                     │ │
│  │  [Osc] [Filter] [Delay] [Reverb] [Dist] [Chorus] [Granulator]...  │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │  Inline Code Editor (Tab to toggle visibility)                    │ │
│  │  ┌─────────────────────────────────────────────────────────────┐  │ │
│  │  │ osc_1:setFrequency(440)      -- live editable               │  │ │
│  │  │ osc_1:setWaveform(0)                                        │  │ │
│  │  │ -- @visual position={x=120,y=200}                           │  │ │
│  │  └─────────────────────────────────────────────────────────────┘  │ │
│  └───────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     SYNCHRONIZATION LAYER                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                  │
│  │ Visual Graph │  │ Lua Source   │  │ PrimitiveGraph│                 │
│  │ (Interactive)│◄─┤ (TextEditor) │◄─┤ (Runtime)     │                 │
│  └──────┬───────┘  └──────▲───────┘  └──────▲───────┘                  │
│         │                 │                 │                           │
│         └─────────────────┴─────────────────┘                           │
│                           │                                             │
│                    ┌──────▼───────┐                                     │
│                    │ GraphDiff    │  ← AST-based comparison             │
│                    │ CodeGenerator│  ← Deterministic Lua output          │
│                    │ LuaParser    │  ← AST extraction                    │
│                    └──────┬───────┘                                     │
└───────────────────────────┼─────────────────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     AUDIO THREAD (Lock-free)                            │
│                         │                                               │
│                         ▼                                               │
│              GraphRuntime::process()                                    │
│                         │                                               │
│              ┌──────────┴──────────┐                                    │
│              │ IPrimitiveNode Graph │  ← Oscillators, Filters, etc.     │
│              └─────────────────────┘                                    │
└─────────────────────────────────────────────────────────────────────────┘
```

### Core Data Structures

```cpp
// Extended from existing ScriptInspectorData
struct InteractiveGraphNode {
    // Identity
    std::string varName;        // "osc_1", "filter_2"
    std::string primitiveType;  // "OscillatorNode", "FilterNode"
    
    // Visual state
    ImVec2 position;            // Canvas position (grid-snapped)
    bool selected = false;
    bool hovered = false;
    bool showCode = false;      // Tab toggle state
    
    // Ports for wiring
    struct Port {
        int index;
        std::string label;
        ImVec2 position;        // Relative to node
        PortType type;          // Audio, Control, Trigger
    };
    std::vector<Port> inputs;
    std::vector<Port> outputs;
    
    // Code representation
    std::string luaCode;        // The node's code snippet
    int luaLineStart = 0;       // Line in full script
    int luaLineEnd = 0;
};

struct InteractiveWire {
    std::string fromNode;
    int fromPort;
    std::string toNode;
    int toPort;
    bool selected = false;
    
    // Visual
    std::vector<ImVec2> bezierPoints;
    float signalFlowAnimation = 0.0f;  // For visual feedback
};

class VisualGraphEditor {
    std::vector<InteractiveGraphNode> nodes;
    std::vector<InteractiveWire> wires;
    
    // Interaction state
    GraphEditMode mode = GraphEditMode::Select;
    bool draggingWire = false;
    Port* wireStartPort = nullptr;
    ImVec2 panOffset = {0, 0};
    float zoom = 1.0f;
    
public:
    void drawCanvas();           // Main render
    void handleInteraction();    // Input handling
    void spawnNode(const char* primitiveType, ImVec2 position);
    void deleteNode(const std::string& varName);
    void createWire(Port* from, Port* to);
    void deleteWire(const std::string& fromNode, int fromPort);
    
    // Sync
    std::string generateLuaCode();           // Visual → Code
    void rebuildFromLua(const std::string& code);  // Code → Visual
    void applyToRuntime();                   // Compile & swap
};
```

---

## Implementation Phases

### Phase 1: Interactive Graph Canvas (Week 1)

**Goal:** Make existing graph visualization editable

**Tasks:**
- [ ] Extend `drawDspGraphPanel()` with hit testing
- [ ] Add node selection (click) and multi-select (Ctrl+click, box select)
- [ ] Implement node dragging with grid snapping
- [ ] Add port hover detection and visual feedback
- [ ] Implement drag-to-connect with bezier curves
- [ ] Connection validation (type checking, cycle detection)
- [ ] Pan and zoom (middle-drag, scroll wheel)
- [ ] Context menu (right-click: delete, duplicate, properties)

**API Sketch:**
```cpp
void drawInteractiveGraph() {
    ImGui::BeginChild("GraphCanvas");
    
    // Draw grid
    drawGrid(panOffset, zoom);
    
    // Draw wires first (behind nodes)
    for (auto& wire : wires) {
        drawBezierWire(wire, getSignalFlowColor(wire));
    }
    
    // Draw dragging wire
    if (draggingWire && wireStartPort) {
        drawBezierWire(wireStartPort->position, ImGui::GetMousePos(), 
                      IM_COL32(100, 200, 255, 128));
    }
    
    // Draw nodes
    for (auto& node : nodes) {
        drawNode(node);
        handleNodeInteraction(node);
    }
    
    // Handle canvas interactions
    if (ImGui::IsMouseClicked(0) && ImGui::IsWindowHovered()) {
        if (!hoveredNode) clearSelection();
    }
    
    ImGui::EndChild();
}
```

### Phase 2: Node Palette & Spawning (Week 2)

**Goal:** Allow users to create nodes from available primitives

**Tasks:**
- [ ] Enumerate available primitives from DSP bindings
- [ ] Create palette UI (categorized: Sources, Filters, Effects, Utilities)
- [ ] Drag-and-drop from palette to canvas
- [ ] Double-click palette to spawn at mouse
- [ ] Auto-generated code stubs on spawn
- [ ] Auto-generated variable naming (osc_1, osc_2, filter_1)

**Spawn → Code Generation:**
```lua
-- User spawns "OscillatorNode" at position (200, 150)
-- Auto-generated:

-- @visual node_osc1 type=OscillatorNode x=200 y=150
local osc1 = ctx.primitives.OscillatorNode.new()
osc1:setFrequency(220)   -- defaults
osc1:setAmplitude(0.5)   -- defaults
osc1:setWaveform(0)      -- sine
```

### Phase 3: Per-Node Code Editing (Week 3)

**Goal:** Click node → Tab → edit its code

**Tasks:**
- [ ] Add "Show Code" toggle to node header (or Tab key)
- [ ] Reuse existing `TextEditor` component inline
- [ ] Display only the selected node's code section
- [ ] Edit → apply → update C++ node parameters
- [ ] Error highlighting (red node border if code invalid)
- [ ] Auto-save on Ctrl+Enter or focus loss

**UI Flow:**
```
User clicks "osc1" node → Node highlights
User presses Tab or clicks [Code] button
┌─────────────────────────────────────┐
│ osc1 [Visual] [Code] [X]           │
├─────────────────────────────────────┤
│ osc1:setFrequency(440)              │
│ osc1:setWaveform(2)    ← editing    │
│ osc1:setAmplitude(0.8)              │
│                                     │
│ [Ctrl+Enter to Apply]               │
└─────────────────────────────────────┘
User edits → Presses Ctrl+Enter
→ Code parsed → C++ node updated → Audio changes instantly
```

### Phase 4: Bidirectional Sync (Week 4)

**Goal:** Keep visual and textual representations synchronized

**Tasks:**
- [ ] Deterministic Lua code generator from graph state
- [ ] Lua parser to extract graph structure (reuse existing or lightweight)
- [ ] AST diffing to detect changes
- [ ] Comment annotation system for visual metadata
- [ ] Roundtrip testing framework

**Code Generation Strategy:**
```lua
-- Generated from visual graph
-- Metadata preserved in comments
-- @visual version=1
-- @visual node_osc1 type=OscillatorNode x=120 y=200
-- @visual node_flt1 type=FilterNode x=320 y=150
-- @visual wire_1 from=osc1:0 to=flt1:0 color=auto

function buildPlugin(ctx)
  -- Nodes
  local osc1 = ctx.primitives.OscillatorNode.new()
  osc1:setFrequency(440)
  osc1:setWaveform(0)
  
  local flt1 = ctx.primitives.FilterNode.new()
  flt1:setCutoff(1200)
  flt1:setResonance(0.5)
  
  -- Connections
  ctx.graph:connect(osc1, flt1)
  
  return {output=flt1}
end
```

**Sync Rules:**
| Change Source | Action | Debounce |
|---------------|--------|----------|
| Visual (drag wire) | Regenerate code → Compile → Swap | 100ms |
| Visual (spawn node) | Append code → Compile → Swap | 0ms (instant) |
| Code (type in editor) | Parse → Update visuals → Compile → Swap | 500ms |
| Param tweak (knob) | Direct to C++ node | 0ms (no code change) |

### Phase 5: Polish & Advanced Features (Week 5-6)

**Tasks:**
- [ ] Undo/redo stack (command pattern)
- [ ] Visual feedback (wire pulse when signal flows)
- [ ] Mini-map for large graphs
- [ ] Node grouping (subgraphs/subpatches)
- [ ] Preset management (save/load graph as Lua file)
- [ ] Import/export (Max/MSP, Pure Data, Reaktor formats)
- [ ] Comment nodes (visual annotations)
- [ ] Wireless connections (named buses)

---

## Technical Decisions

### 1. Metadata Preservation

Visual-only data (positions, colors, comment positions) stored in Lua comments:

```lua
-- @visual node_osc1 position={x=120,y=200} color=0xff22c55e
-- @visual comment_1 text="Main carrier" position={x=140,y=180}
-- @visual view zoom=1.2 pan={x=-50,y=0}
```

**Rationale:**
- Code remains valid Lua
- Human-readable
- Git diffable
- Backward compatible (ignored by runtime)

### 2. Code Generation Strategy

**Deterministic output:**
- Nodes sorted by creation time
- Connections grouped by source node
- Consistent indentation (4 spaces)
- Alphabetical parameter ordering

**Benefits:**
- Minimal diffs when version controlling
- Predictable roundtrips
- Easier debugging

### 3. Error Handling

```
Visual Error States:
┌────────────────────────────────┐
│ ┌──────────┐                   │
│ │  OSC     │  [⚠️ Syntax]      │
│ │  osc1    │  Error: Line 3    │
│ │ [Red bg] │  'end' expected   │
│ └──────────┘                   │
└────────────────────────────────┘

Code Editor Error States:
┌────────────────────────────────┐
│ osc1:setFrequency(440)         │
│ osc1:setWaveform(5)  ← invalid │
│               ▲                │
│               ║                │
│ Error: waveform must be 0-4    │
└────────────────────────────────┘
```

### 4. Performance Strategy

| Aspect | Strategy |
|--------|----------|
| Large graphs (>100 nodes) | Virtualized rendering (only visible nodes) |
| Wire animations | GPU-friendly (single quad per wire) |
| Live updates | Debounced compilation, background thread |
| Runtime swap | Lock-free pointer exchange (existing) |

---

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| **AST parsing complexity** | Medium | Start with simple regex, upgrade to full parser later |
| **Sync bugs (visual≠code)** | High | Deterministic code gen, extensive roundtrip tests |
| **UI performance on large graphs** | Medium | Virtualization, LOD, culling |
| **Undo history memory bloat** | Low | Cap history size, store diffs not full states |
| **Lua syntax edge cases** | Medium | Robust error handling, fall back to last good state |
| **Learning curve for users** | Low | Keep both modes (visual + code) equally capable |

---

## Success Criteria

The feature is complete when:

1. ✅ User can spawn any primitive node from palette
2. ✅ User can connect nodes by dragging wires
3. ✅ User can click node and edit its code in-place
4. ✅ Visual changes update code within 100ms
5. ✅ Code changes update visual within 500ms
6. ✅ Audio never glitches during editing
7. ✅ Undo/redo works for all operations
8. ✅ Generated code is human-readable and valid Lua
9. ✅ Visual metadata survives roundtrip (save → load)

---

## Related Documentation

- `manifold/primitives/scripting/GraphRuntime.h` - Lock-free DSP runtime
- `manifold/primitives/scripting/PrimitiveGraph.h` - Graph structure
- `manifold/ui/imgui/ImGuiInspectorHost.cpp` - Existing graph visualization
- `manifold/ui/imgui/ToolComponents.cpp` - `drawDspGraphPanel()`
- `external/ImGuiColorTextEdit/TextEditor.h` - Code editor component
- `docs/UI_SYSTEM_DESIGN.md` - Widget and layout system

---

## Next Steps

1. **Prototype Phase 1** (Interactive Canvas) in isolation
2. **Evaluate** usability with internal users
3. **Iterate** on interaction design
4. **Implement** bidirectional sync
5. **Ship** as optional mode alongside existing code-first workflow

The goal is **not** to replace code editing but to make visual and textual equally powerful, letting users choose their preferred mode per-task.
