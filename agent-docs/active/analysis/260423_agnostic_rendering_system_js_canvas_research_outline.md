# Agnostic Rendering System — JS/Canvas Runtime Research Outline

**Date:** 2026-04-23
**Status:** Research outline / future feature proposal
**Source:** BÄPP JSUI verification work (Slice 11A), user architectural vision
**Author:** Agent

---

## 1. Why This Doc Exists

During BÄPP parity work (Slice 11A), we verified four extracted Max JSUI scripts by running them through an HTML5 Canvas shim in a browser. The scripts are real, complex, and state-driven. Porting them natively to Manifold's Lua widget system is viable but requires per-visual implementation work.

The user raised a broader architectural question:

> **If Manifold had an agnostic rendering system — one that truly does not care what it is rendering — then there should be no fundamental reason that system cannot render JS and Canvas content.**

This document captures that idea as a research proposal. It is **not** a commitment to build this now. It is a structured outline so the idea can be evaluated, researched, and potentially pursued later without losing the context.

---

## 2. Core Thesis

### Current state: mixed rendering surface

Manifold today has multiple rendering contexts with different capabilities and constraints:

- **Native UI (Lua + C++)** — the in-plugin interface. Widgets are Lua-defined, rendered via Manifold's own graphics layer (NanoVG or equivalent). Fast, tightly integrated with parameter system, but limited to implemented widget types.
- **Web Remote (HTML/JS)** — a separate browser-based control surface. Communicates via OSCQuery/WebSocket. Full HTML/CSS/JS capability, but lives outside the plugin and does not share the native render loop.
- **Texture/Video Pipeline** — GPU shader-based rendering for video/texture content (WebcamViewer project). Capable of arbitrary fragment shaders, but scoped to texture surfaces.
- **DSP Graph Visualisation** — primitive-level node graphs drawn in the native UI layer.

These are not a single "rendering system." They are separate systems glued together at the project level.

### Vision: a single agnostic render host

The proposed idea is to unify under a single architectural principle:

> **The rendering host should be content-agnostic. It provides a surface, a lifecycle, and a bridge to the host parameter/event system. What gets drawn on that surface is the content's concern.**

This is conceptually similar to how a web browser does not care whether a `<canvas>` element runs 2D graphics, WebGL, or a compiled WASM module. The browser provides the surface and the API contract. The content decides what to render.

If Manifold's UI layer were structured this way, then:

- **Lua widgets** are one kind of content (native, fast, tightly bound)
- **HTML/JS/Canvas** are another kind of content (arbitrary, portable, ecosystem-rich)
- **Shader/texture** content is another kind (GPU-native, effect-heavy)
- **Future content types** (SVG, declarative JSON layouts, external widget frameworks) would slot in without architectural changes

---

## 3. Goals

### Primary goals
- Define what an "agnostic rendering host" means in the Manifold context
- Identify the minimal contract between host and content that would enable JS/Canvas rendering
- Document the technical gaps that would need to close for this to be real
- Preserve the architectural intent so it can be evaluated against future priorities

### Secondary goals
- Identify whether this is a C++ runtime change, a Lua wrapper change, or both
- Estimate rough complexity relative to known subsystems (Web Remote, texture pipeline, native UI)
- Flag any real-time audio implications that would constrain the design

### Non-goals
- **This is not a build plan.** No timelines, no resource allocation.
- **This is not Max-for-Live specific.** While JSUI was the trigger, the proposal is general: HTML/JS/Canvas content of any origin.
- **This is not a commitment to replace the native UI.** Native Lua widgets are the right choice for most Manifold UI. This is about *extending* capability, not *replacing* it.
- **This is not a web browser inside the plugin.** The proposal is scoped to Canvas 2D + JS execution in a contained surface, not a full DOM/CSS/Browser engine.

---

## 4. What "Agnostic Rendering" Means Here

### The host contract

An agnostic rendering host provides:

1. **Surface allocation** — a rectangular region with a backing pixel buffer or GPU texture
2. **Lifecycle hooks** — init, paint, resize, destroy, parameter change notifications
3. **Event ingress** — mouse/touch/keyboard events translated into the content's expected format
4. **Parameter bridge** — bidirectional sync between host parameter system and content state
5. **Animation timing** — a frame callback or timer service (not necessarily RT audio rate)
6. **Resource access** — fonts, images, optional network (if policy allows)

### The content contract

Content (whatever is being rendered) provides:

1. **A draw function** — given a surface/graphics context, produce pixels
2. **Event handlers** — respond to input events if interactive
3. **Parameter bindings** — declare which host parameters it exposes/consumes
4. **Size hints** — minimum/preferred dimensions, resize behavior

The host does not inspect what the content draws. It only enforces the contract.

---

## 5. Technical Paths to JS/Canvas Rendering

If the host contract above existed, there are several ways a JS/Canvas surface could be implemented:

### Path A: Embedded JS Engine + Canvas 2D API

Embed a lightweight JS engine inside Manifold and implement the Canvas 2D API on top of the existing graphics backend.

**Candidate JS engines:**
- **Duktape** — ~200KB compiled, ES5.1, embeddable, no JIT (predictable performance)
- **QuickJS** — ES2020 support, faster than Duktape, still embeddable, ~1MB
- **MuJS** — tiny (~100KB), ES5, very embeddable, minimal dependencies

**What would need building:**
- JS engine integration into Manifold's C++ runtime (or Lua bindings)
- Canvas 2D API implementation:
  - Path operations (moveTo, lineTo, arc, bezierCurveTo, closePath)
  - Fill/stroke styles (solid, gradient, pattern)
  - Transform stack (save, restore, translate, rotate, scale)
  - Text rendering (measureText, fillText)
  - Image rendering (drawImage)
  - Compositing / clipping
- Bridge from Manifold parameter system to JS `box` / message interface
- Animation loop integration (setInterval/requestAnimationFrame equivalent)
- Event translation (mouse → JS events)

**Effort estimate:** Large. Comparable to building a mini-browser rendering engine. The Canvas 2D API surface is substantial.

**Pros:** True in-plugin JS/Canvas with no external dependencies at runtime
**Cons:** Heavy C++ development; ongoing maintenance burden as JS/Canvas specs evolve

### Path B: Offscreen Browser + Texture Sharing

Run a headless browser engine (or browser-like runtime) in a separate process/thread, render to an offscreen surface, and share the resulting texture with Manifold's UI compositor.

**Candidate runtimes:**
- **CEF (Chromium Embedded Framework)** — full browser, very heavy, very capable
- **Servo** — experimental, lighter than Chromium, but unstable
- **Ultralight** — game-engine-oriented lightweight HTML renderer (~10MB), no JS engine included
- **LiteHTML** — HTML/CSS renderer only, no JS
- **Playwright/Puppeteer headless** — external process, not embedded

**What would need building:**
- Process/thread isolation for the browser runtime
- Shared texture / GPU handle passing between browser and Manifold
- IPC bridge for parameter sync and event forwarding
- Lifecycle coordination (browser page ↔ Manifold widget lifecycle)

**Effort estimate:** Large, but different kind of work (integration/orchestration rather than API implementation).

**Pros:** Full HTML/CSS/JS capability; leverages existing browser investment
**Cons:** Heavy runtime dependency; process coordination complexity; audio-process separation concerns

### Path C: Lua-based JS Interpreter + Software Canvas

Write a JS interpreter in Lua (or embed a small C JS engine with Lua bindings) and implement Canvas 2D as a Lua wrapper around NanoVG or similar.

**What would need building:**
- Lua FFI or C binding to a JS engine (Duktape bindings exist)
- Canvas 2D → NanoVG mapping layer in Lua/C
- Parameter bridge in Lua

**Effort estimate:** Medium-Large. Less C++ than Path A because Canvas mapping can be done in Lua.

**Pros:** Fits Manifold's existing Lua-heavy architecture
**Cons:** Performance uncertain; Lua GC + JS GC interaction; still substantial API surface to implement

### Path D: Compile/Translate JSUI to Lua

Instead of running JS at runtime, statically translate JSUI scripts (or a subset) into equivalent Lua widget code.

**What would need building:**
- A transpiler or set of rewrite rules for JS → Lua (subset only)
- `mgraphics` API mapped to Manifold native drawing primitives
- Animation loop mapped to widget update cycle

**Effort estimate:** Medium for a constrained subset; unbounded for general JS.

**Pros:** Zero runtime JS dependency; runs at native speed
**Cons:** Not truly agnostic — each new JS script may need transpiler work; fails for arbitrary JS

---

## 6. The "Agnostic" Architecture Implications

If Manifold moved toward this model, the following subsystems would need rethinking:

### 6.1 UI Loader / Widget Registry

Currently, widgets are registered by type (`Button`, `Slider`, `Knob`, etc.) and instantiated from Lua UI documents.

An agnostic model would add a new widget type:

```lua
{
  type = "Surface",
  contentType = "js-canvas",  -- or "lua-widget", "shader", "html"
  content = "path/to/script.js",
  bounds = { x = 0, y = 0, w = 240, h = 180 },
  params = { ... }
}
```

The loader would:
- Allocate a surface region
- Instantiate the correct content host (JS runtime, Lua widget, shader)
- Wire parameter bridge
- Delegate all paint/event/lifecycle calls to the content host

### 6.2 Graphics Compositor

Manifold's compositor would need to accept arbitrary textures/buffers from content hosts, not just native widget draw calls.

This may already be partially possible via the texture pipeline (WebcamViewer proves custom surfaces can be composited into the UI).

### 6.3 Parameter System Bridge

The most critical integration point. Content must declare its parameter contract:

```js
// Inside a JSUI-like script
box.declareParams([
  { name: "clapMode", type: "int", min: 0, max: 1 },
  { name: "clappers", type: "int", min: 1, max: 16 },
  { name: "timing", type: "float", min: 0, max: 100 }
]);
```

The host maps these to Manifold parameter paths and handles bidirectional sync.

### 6.4 Event System Translation

Mouse events in Manifold's native UI use one coordinate/convention system. JS/Canvas expects another. A translation layer would sit between the host event dispatcher and the content event receiver.

### 6.5 Real-Time Safety Boundary

**Critical constraint:** Whatever JS/Canvas runtime exists must not run on the audio thread. UI updates, animation, and script execution are non-RT safe operations. The architecture must ensure:

- JS execution happens on the UI/message thread
- Only the final rendered texture/buffer crosses into the compositor
- No JS engine GC or JIT compilation on the audio callback path

---

## 7. Scope Beyond Max/JSUI

The user explicitly stated this should not be limited to Max patches. An agnostic rendering system would enable:

- **Web Audio / Web MIDI visualisations** — existing web-based instrument UIs could be embedded
- **Custom HTML5 control surfaces** — user-built panels with arbitrary HTML/CSS/JS
- **Game/UI engine exports** — Godot, Unity WebGL, or other engines producing to a canvas
- **Data visualisation** — D3, Chart.js, or other canvas-based charting libraries
- **Generative art** — p5.js, Three.js (WebGL subset), Processing.js sketches as instrument visuals
- **Documentation / help panels** — rich HTML content inside the plugin UI

The key insight is: once the host is content-agnostic, the door opens to any content that can render to a surface and speak the parameter/event contract.

---

## 8. Relationship to Existing Work

### Web Remote Control
The existing web remote already proves that HTML/JS can communicate with Manifold via OSCQuery/WebSocket. An agnostic in-plugin renderer would be the inverse: the web content lives *inside* the plugin instead of outside it.

### Texture Rack Modules (VideoSynth)
The video pipeline proves that GPU textures from arbitrary sources can be composited into Manifold's UI. A JS/Canvas surface would produce a texture. The compositor already knows how to display textures.

### Native UI Widgets
Lua widgets are the default and should remain so. An agnostic renderer is an *extension*, not a replacement. The vast majority of Manifold UI should stay native for performance and integration reasons.

---

## 9. Open Research Questions

1. **Which JS engine is the right fit?** Duktape's ES5.1 support may be too limited for modern JS. QuickJS is more capable but larger. MuJS is tiny but minimal. Is there a lighter alternative?

2. **How much of Canvas 2D is actually needed?** The full spec is huge. But most JSUI scripts use a small subset (paths, arcs, fills, strokes, text, images). Could we implement a "good enough" subset instead of the full spec?

3. **Can NanoVG serve as the Canvas 2D backend?** NanoVG already provides path operations, transforms, gradients, and text. Mapping Canvas 2D to NanoVG may be significantly easier than writing a rasteriser from scratch.

4. **What is the memory/performance cost?** JS engine + Canvas state per surface could add up if many surfaces exist simultaneously. Is one surface per widget viable? Or should surfaces be pooled?

5. **How does parameter sync work at 60fps?** If a JS animation updates a parameter value every frame, does that flood the parameter system? Is there a "visual-only" parameter tier that does not emit OSC/Host automation?

6. **What about WebGL / Three.js?** Canvas 2D is 2D only. If the goal is truly agnostic, does the system eventually need WebGL? That is a much larger scope (shader compilation, GL context management, etc.).

7. **Build system implications?** Adding Duktape or QuickJS as a dependency changes the build. Are there header-only or trivially-buildable options?

8. **Security model?** If JS can execute inside the plugin, what is the sandbox? Can JS access the file system? Network? The host's internal state?

---

## 10. Recommended Research Direction

If this idea is pursued later, the recommended first step is a **spike**:

### Spike: NanoVG + Duktape proof of concept

**Goal:** Prove that a JS engine can drive NanoVG drawing inside a Manifold widget surface.

**Scope:**
- Integrate Duktape into the build (or as a Lua FFI module)
- Implement ~10 Canvas 2D methods mapped to NanoVG:
  - `moveTo`, `lineTo`, `arc`, `bezierCurveTo`
  - `fill`, `stroke`
  - `save`, `restore`, `translate`, `rotate`
  - `setSourceRGBA`
- Load one simple JS script that draws a static shape
- Render it inside a Manifold widget

**Timebox:** 2-3 days of focused work.

**Success criteria:** A Manifold widget displays a JS-driven NanoVG drawing without crashing, at ≥30fps.

**Failure criteria:** If the spike cannot reach 30fps with a trivial script, or if Duktape integration proves incompatible with the build system, the approach should be reconsidered before further investment.

---

## 11. Short Version

Manifold's UI layer currently supports Lua widgets natively and HTML/JS remotely. The user wants to explore whether the native UI layer can be made content-agnostic enough to host JS/Canvas surfaces directly.

This would enable:
- Running JSUI scripts (Max for Live) inside Manifold
- Embedding arbitrary HTML5/Canvas content as instrument visuals
- A unified compositor that does not care whether a surface contains Lua widgets, JS drawings, or GPU shaders

The technical paths range from embedding a JS engine + Canvas API implementation, to sharing textures from an external browser runtime. All paths are non-trivial. A timeboxed spike (Duktape + NanoVG) is the recommended first research step.

This document preserves the idea for future evaluation. Current priority: native Lua widget port for BÄPP parity (Slice 11B).
