# UI Shell Composition Refactor Plan

## Status
Active refactor doc.

Current state:
- shell surface descriptor registry is live
- `perfOverlay`, `hierarchyTool`, `scriptList`, `inspectorTool`, `scriptInspectorTool`, `mainScriptEditor`, and `inlineScriptEditor` are on descriptor-driven bounds/visibility
- `perfOverlay` is now a real ImGui/OpenGL surface
- inline script editor shell geometry is now computed in shell-owned script inspector layout state instead of being repaired from C++ host snapshots
- biggest remaining seam is the C++ bridge (`syncImGuiHostsFromLuaShell()`), not basic descriptor ownership for the converted tool surfaces

## Premise
The intended architecture is:

> **Shell owns everything.**
>
> Performance and edit inspectors, overlays, console, editor surfaces, runtime surfaces, layout, ordering, and visibility all belong to the shell. The shell lays them out however it wants, in whatever order it wants.

That architecture **did not change**. What changed was the implementation: it drifted away from the shell-owned model and allowed C++ host orchestration to become a second UI authority.

---

## Proof from code: shell was originally the composition root

### 1. Shell is created before script UI init and asked for layout/content bounds
**File:** `manifold/primitives/scripting/LuaEngine.cpp`

In `LuaEngine::loadScript()`:
- C++ creates `script_content_root`
- `require("ui_shell")`
- `shellModule.create(rootCanvas, opts)`
- stores result in `_G.shell`
- calls `shell.layout(...)`
- calls `shell.getContentBounds(...)`
- only sets content bounds directly if shell is not active

This proves the intended model is:
- shell exists first
- shell owns the parent frame
- shell decides content placement
- runtime content mounts underneath shell control

### 2. Shell explicitly adopts the runtime content root
**File:** `manifold/ui/ui_shell.lua`

In `Shell.create(parentNode, options)`:
- `shell.content = parentNode:getChild(0)`

That is explicit shell ownership of the runtime mount root created by C++.

### 3. Shell creates the major UI surfaces under the shared parent
**File:** `manifold/ui/ui_shell.lua`

Shell creates under `parentNode`:
- `treePanel`
- `mainTabBar`
- `mainTabContent`
- `previewOverlay`
- `consoleOverlay`
- `inspectorPanel`
- child canvases for tree/dsp/scripts/inspector

This is direct evidence that shell is intended to own composition of sibling surfaces under the shared root.

### 4. Shell owns layout, transforms, and stacking
**File:** `manifold/ui/shell/methods_layout.lua`

In `shell:layout(totalW, totalH)`, shell decides:
- performance vs edit mode layout
- content bounds
- content transforms and preview transforms
- inspector/tree visibility
- overlay bounds
- `toFront()` ordering for shell surfaces

This is not “shell suggests layout”. This is shell acting as the layout and ordering authority.

### 5. Shell owns runtime performance surface registration
**File:** `manifold/ui/shell/methods_core.lua`

In `shell:registerPerformanceView(view)`:
- shell stores the performance view
- shell initializes it with `view.init(self.content)`
- shell relayouts immediately

That is explicit shell ownership of the performance runtime surface contract.

### 6. Shell already owns overlay behavior for console
**File:** `manifold/ui/shell/methods_core.lua`

Shell directly controls:
- `shell:setConsoleVisible(...)`
- `shell:updateConsoleBounds(...)`
- overlay focus
- overlay z-order

This proves the shell-owned overlay model is already present in the implementation.

---

## Proof from code: implementation drifted away from that model

### 1. `BehaviorCoreEditor` became a parallel composition root
**Files:**
- `manifold/core/BehaviorCoreEditor.h`
- `manifold/core/BehaviorCoreEditor.cpp`

`BehaviorCoreEditor` owns and mounts these separate surfaces:
- `mainScriptEditorHost`
- `inlineScriptEditorHost`
- `scriptListHost`
- `hierarchyHost`
- `inspectorHost`
- `scriptInspectorHost`
- `perfOverlayHost`

It also directly controls:
- `setVisible(false)`
- `toFront(false)`
- `setBounds(...)`

This is the core architectural drift: C++ editor code became a second UI owner alongside shell.

### 2. C++ brokers host actions back into shell
**File:** `manifold/core/BehaviorCoreEditor.cpp`

In `BehaviorCoreEditor::syncImGuiHostsFromLuaShell()`:
- C++ consumes actions from separate hosts
- then calls shell methods like:
  - `openScriptEditor`
  - `selectWidget`
  - `applyBoundsEditor`
  - `applyActiveConfigValue`

This means host UI interaction does not belong directly to shell. Instead it is routed:

**host -> C++ broker -> shell**

That is split-brain ownership.

### 3. C++ still applies host realization and lifecycle policy
**File:** `manifold/core/BehaviorCoreEditor.cpp`

`syncImGuiHostsFromLuaShell()` now consumes shell descriptors for the converted tool surfaces, but it still does too much authority work:
- builds host payload structs
- consumes host actions and dispatches shell methods
- applies deferred visibility changes
- carries backend-specific lifecycle policy, especially for the inline GL host on Linux

So the problem is no longer “C++ invents all tool bounds”.
The remaining problem is that the bridge is still too fat and too host-specific.

### 4. Perf overlay was the clearest violation
**Files:**
- `manifold/core/BehaviorCoreEditor.cpp`
- `manifold/ui/imgui/ImGuiPerfOverlayHost.cpp`

This was the first explicit conversion target because it had the most obvious architectural cheating.

Current state after conversion:
- shell owns the `perfOverlay` descriptor
- C++ reads shell-owned visibility/bounds/title and realizes the host
- overlay implementation is real ImGui/OpenGL
- interaction round-trips back into shell state

That conversion is no longer the main architectural blocker.
The remaining blockers are the fat C++ bridge and the mixed descriptor/immediate layout world.

### 5. There are still two composition styles

#### Descriptor-driven shell-owned surfaces
- `perfOverlay`
- `mainScriptEditor`
- `inlineScriptEditor`
- `hierarchyTool`
- `scriptList`
- `inspectorTool`
- `scriptInspectorTool`

#### Imperative shell-native layout surfaces
- runtime content root
- console overlay
- preview overlay
- tree/inspector panels
- main tab bar/content

That means the implementation drift is now more specific:

> shell owns more of the conceptual surfaces, but the app still mixes descriptor-driven host realization with imperative shell-native layout and a too-powerful C++ bridge

---

## Refactor goal
Reassert the intended architecture:

- shell is the only conceptual UI owner
- shell owns all surfaces and overlays
- shell owns layout, visibility, and ordering intent
- C++ only provides backend plumbing and lifecycle
- rendering backends serve shell; they do not define UI architecture

---

## A. Must change

### 1. Stop `BehaviorCoreEditor` from acting as a parallel composition root
Required outcome:
- `BehaviorCoreEditor` owns backend plumbing only
- it no longer decides which conceptual surfaces exist
- it no longer independently owns composition policy for tool windows

### 2. Move tool surface identity under shell
Required outcome:
Shell explicitly owns conceptual surfaces such as:
- main editor
- inline editor
- hierarchy
- inspector
- script list
- perf overlay
- console
- preview overlay
- runtime content region

Shell decides for each surface:
- visible?
- bounds?
- z-order?
- mode participation?
- docked vs floating?
- backend assignment?

### 3. Kill the fake perf overlay implementation
Required outcome:
- perf overlay is shell-owned
- perf overlay is rendered in ImGui like the rest of tooling, not faked with JUCE paint
- no separate architectural exception for perf overlay

### 4. Collapse multi-host tooling directionally
Required outcome:
- no new UI authority outside shell
- any remaining host is backend-only and shell-addressable
- long-term direction is a single shell-owned tooling surface/context, not more host fragmentation

### 5. Separate semantic ownership from render ownership
Required outcome:
- shell and/or structured runtime model owns identity and inspection targets
- render objects are backend realization, not the architecture

---

## B. Cleanup required as part of the move

### 1. Replace host-specific visibility/bounds structs with shell-driven surface config
Current code builds separate config structs inside `syncImGuiHostsFromLuaShell()`.
Those structs are symptoms of C++ composition ownership and should be replaced with a shell-driven surface contract.

### 2. Reduce C++ broker calls that translate host actions into shell actions
Current code turns C++ into a UI traffic cop. That seam should get thinner and more generic.

### 3. Unify overlay model
Console, perf overlay, settings overlays, and preview overlays must all become shell-owned surfaces/windows.
Backend may differ temporarily; ownership may not.

### 4. Remove layout duplication between shell and C++
Shell should produce layout intent. C++ should only realize it for a given backend.

### 5. Clean up overloaded “host” terminology
Use explicit roles instead of muddy language:
- shell surface
- backend surface
- runtime content root
- tooling render surface
- overlay window
- semantic model

---

## C. Cleanup explicitly deferred

These matter, but should not be merged into this refactor pass.

### 1. Full arbitrary-widget GPU backend rewrite
Do not mix shell composition recovery with a complete generic rendering backend redesign.

### 2. Per-widget GL ports / widget library rewrite
No waveform crusade. No hot-widget side quest.

### 3. Perfect semantic/introspection model redesign
Do the minimum needed to stop render objects masquerading as architecture. Do not solve every future modeling problem in this pass.

### 4. Styling / formatting / broad helper reshuffles
No cleanup safari.

---

## D. Migration order

### Phase 1: define shell surface descriptors
Introduce an explicit shell-owned surface/window model with fields like:
- `id`
- `kind`
- `backend`
- `visible`
- `bounds`
- `z`
- `floating/docked/modal`
- `payload source`

This makes shell the explicit authority again before moving implementation.

### Phase 2: put perf overlay back under shell correctly
First real conversion target:
- shell-owned perf overlay surface
- ImGui-rendered, not JUCE-painted
- no rogue overlay ownership in C++

### Phase 3: convert one tooling surface from host-owned to shell-described/backend-realized
Good first candidates:
- hierarchy
- script list

Goal:
- prove the architectural pattern
- reduce C++ composition logic

### Phase 4: thin `syncImGuiHostsFromLuaShell()` into a backend bridge
Transform it from:
- host-specific UI composition logic

into:
- backend realization of shell-defined surfaces

### Phase 5: continue collapsing tooling host fragmentation
Directionally converge toward:
- one shell-owned tooling composition model
- preferably one ImGui tooling surface/context long-term

---

## E. Acceptance criteria

### Architecture criteria
- shell is the only conceptual UI owner
- no overlay exists outside shell ownership
- no new tool surface gets introduced outside shell
- C++ no longer decides UI composition policy

### Implementation criteria
- perf overlay is genuinely ImGui-backed
- fewer host-specific config structs in C++
- less host-specific action brokering
- shell controls visibility/bounds/order intent for all major surfaces

### Sanity criteria
No regression in:
- edit mode
- performance mode
- console
- inspectors
- script editor access
- mode switching stability
- overlay stacking sanity

---

## Immediate next artifact
The next useful step is to define the shell surface descriptor contract against the current code:
- what surfaces exist now
- which ones are shell-owned already
- which ones drifted into C++ ownership
- what backend each currently uses
- how they should be represented under one shell-owned model
