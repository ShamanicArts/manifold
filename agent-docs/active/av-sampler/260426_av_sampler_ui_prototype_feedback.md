# AV Sampler Lab UI Prototype — Feedback & Current State

## What We Were Doing
Designing a new UI layout for AVSamplerLab to move it from "prototype" to "full project" quality.
The HTML prototype file (`av_sampler_ui_prototype.html`) is the gate — user will not allow touching actual Lua UI until a decent prototype is approved.

---

## What's Working (Designs 1, 4 & 5 are candidates)

- **FX rack module shell as the foundation** — `bg=#121a2f`, `border=#1f2b4d`, `radius=10`, accent bar, header with del/resize buttons
- **Plasma-style parameter bars** — colored fill bars with values, user approved this pattern
- **FX slider rows** — colored tracks (Mix green, P1 cyan, P2 blue, etc.) with values
- **Vertical splits** — columns are the preferred layout direction
- **Edge-to-edge, no padding** — modules butt up against each other
- **1280×720, single screen, no scrolling**
- **Nav pills with labels** — working prototype helper with arrow key navigation
- **Layer source grid with A/B blend controls** — the Resolume-style deck rows are good
- **Waveform as a contained module** — not a free-floating strip, inside a rack shell

---

## Current Feedback (Outstanding Issues)

### 1. Only ONE FX slot, not two
- User explicitly said: "We don't need two effects right now"
- All designs currently show FX1 + FX2
- Need to collapse to a single FX module and redistribute that space

### 2. Waveform is STILL too big
- User: "space given for waveform is too high"
- Current: ~20% height in most designs
- Needs to be thinner — maybe 12-15% or even a compact horizontal strip

### 3. Video (Output viewport) is too small
- User: "space given for video is too small"
- Output + Preview need more vertical room
- They should be the dominant visual elements, not cramped

### 4. Controls need MORE room
- Shader params, FX module, and Pose mapping all feel compressed
- When we collapse FX2 → FX1, that freed space should go to making the remaining modules taller

### 5. Designs 1, 4, 5 are the candidates
- Design 1 (Resolume-style): Sources top strip, 3 columns below
- Design 4 (Wide): Output+Preview top strip, modules below in 3 columns
- Design 5 (Compact 2-Up): 2 columns, dense
- All have problems but are "the only ones that are any good"

---

## Lessons Learned

### What the user fucking hates
1. **Replacing everything instead of iterating** — The user undid a complete rewrite because it was "noticeably worse on all elements" and removed working prototype helpers (nav pills). Build on what exists, don't throw it away.
2. **Ignoring explicit feedback** — User said no trigger pads, we kept putting them in. User said vertical splits, we kept doing horizontal bands. User said 1 FX, we kept doing 2.
3. **Referencing dead rounds** — Previous prototype rounds "don't exist anymore." Only the current file matters.
4. **Not actually using the FX module design** — Despite being told repeatedly that the rack module shell is the anchor, we kept generating layouts that didn't actually look like the real FX module. The real one has: XY visual surface, pagination dots, Mix slider, then 4-5 param sliders.

### What works
- **Actually read the existing code** — `fx_slot.ui.lua` and `rack_module_shell.lua` define the visual language
- **Parameter bars with colored fills** — This is the approved plasma-style control
- **Self-contained modules** — Each functional area (Shader, FX, Pose, Output) is its own rack module
- **Preview NEXT to Output** — Side by side, not stacked
- **Transport bar at top** — Consistent across all designs

---

## Next Steps

1. **Remove FX2 from all designs** — collapse to single FX module
2. **Shrink waveform** — aim for ~12-15% height max, maybe even 10%
3. **Grow Output+Preview** — give them more vertical space, they should be the visual heroes
4. **Redistribute freed space to controls** — Shader params, FX sliders, Pose mappings all get taller
5. **Iterate on D1, D4, D5 specifically** — those are the only viable candidates
6. **DO NOT replace the whole file** — edit the existing designs in place, preserve nav/script
