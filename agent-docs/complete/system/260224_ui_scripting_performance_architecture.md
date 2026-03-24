# UI Scripting Performance Architecture

## Purpose

This document lays out the medium-term performance architecture for the Lua-driven UI system.

This is **not** a "do all of this right now" spec. It is the cathedral plan: the target shape we should steer toward so the editor remains responsive even when users write mediocre or outright cursed Lua.

It exists for two reasons:

1. We already have evidence that user-driven hot paths can saturate the message thread (`mouseDrag` at ~1000Hz was one concrete example).
2. The product goal is user-extensible Lua UI, which means we must assume scripts will eventually do dumb, expensive shit.

The architecture therefore needs to be:

- cheap when idle
- bounded when busy
- resilient to bad scripts
- observable when things go wrong
- able to degrade gracefully instead of freezing the editor

---

## Current Context

### Proven issues so far

- `mouseDrag` previously fired at ~1000Hz and starved the UI update loop
- `juce::Timer` requested at 30Hz is landing closer to ~22Hz on Linux in smoke tests
- Lua/UI work must stay on the message thread for safety with current architecture
- `HighResolutionTimer` can hit cadence but is unsafe if it directly touches Components/Lua state

### Important interpretation

The timer-rate issue is real and should stay documented, but it does **not** currently prove a CPU-bound editor loop. Measured callback occupancy has been low. That suggests the timer issue is mostly a cadence/scheduling limitation of the current JUCE/message-thread model, not a sign that the callback body is already too expensive.

That matters because the longer-term performance plan should focus on **doing less work** and **bounding script damage**, not merely forcing a prettier tick rate.

---

## Design Goals

1. **Minimize hot-path C++ ↔ Lua boundary churn**
2. **Avoid full-frame work when nothing changed**
3. **Prevent one bad script from tanking the entire editor**
4. **Make expensive operations explicit and measurable**
5. **Keep core interaction responsive under overload**
6. **Support smooth enough visuals without depending on exact timer cadence**
7. **Make diagnostics first-class via existing IPC/DIAGNOSE tooling**

---

## Non-Goals

These are explicitly not the primary goal of this architecture doc:

- achieving exact 30Hz from `juce::Timer`
- immediate large-scale rewrite of the current UI system
- replacing Lua with a "safer" language
- eliminating all dynamic behavior from scripts

Exact cadence may matter for some visual features, but the larger performance problem is architectural scaling under script load.

---

## Core Principles

### 1. Push less state
Do not republish the whole world into Lua every tick if only one thing changed.

### 2. Run less script
Do not run broad update paths when there is no relevant state change.

### 3. Paint less UI
Do not repaint the whole tree if only one subtree changed.

### 4. Bound bad behavior
Do not trust user scripts to behave. Detect, measure, warn, and shed load.

### 5. Degrade visuals before interaction
If overloaded, keep editing/interaction alive and drop nonessential fidelity first.

---

## Target Runtime Model

The long-term target runtime model is a phased UI update pipeline:

```text
engine state changes
    ↓
C++ dirty-state collection
    ↓
compact delta publish into Lua state cache
    ↓
bounded script update/event dispatch
    ↓
batched widget mutations
    ↓
layout invalidation only where needed
    ↓
paint invalidation only where needed
    ↓
repaint dirty regions/subtrees
```

This is the opposite of the brute-force loop:

```text
full push → full update → full repaint → repeat forever
```

---

## Architecture Pillars

## Pillar 1: Dirty State Propagation

### Problem
The current shape risks doing work every tick even when engine/UI state is unchanged.

### Target
Maintain a C++-side cache of previously published state and a compact dirty mask / change set.

### Examples of dirtiness domains

- transport dirty
- layer dirty (per layer)
- selection dirty
- waveform dirty
- layout dirty
- performance metrics dirty
- script/editor mode dirty

### Result
Lua receives deltas, not full snapshots.

### Benefits

- less allocation and table churn
- fewer boundary crossings
- less pointless script execution
- easier observability of what actually changed

---

## Pillar 2: Delta-Time-Based Script Updates

### Problem
Frame-count based animation logic makes the UI fragile when cadence varies.

### Target
All animation/effects logic should be based on elapsed time (`dt`), not callback count.

### Why
This makes the system robust to:

- timer jitter
- Linux scheduling variance
- occasional stalls
- future changes in refresh cadence

### Consequence
The editor becomes less dependent on exact timer frequency for correctness.

---

## Pillar 3: Retained-Mode UI with Cheap Mutation Paths

### Problem
If Lua can casually rebuild the widget tree every update, performance will rot as scripts get more ambitious.

### Target
The default hot path should be:

- create widgets once
- mutate cheap properties often
- relayout only when required
- rebuild structure only when explicitly necessary

### Cheap operations

- `setBounds`
- `setVisible`
- `setText`
- `setValue`
- `setStyle`
- state toggles

### Expensive operations

- add/remove/reparent widgets
- rebuild list/tree contents
- broad style recomputation
- full layout recomputation
- filesystem or debug introspection in hot paths

### Guideline
Make expensive operations explicit and measurable in diagnostics.

---

## Pillar 4: Dirty Widget Tree / Invalidation Model

### Problem
A single `rootCanvas.repaint()` per tick is simple but brute-force.

### Target
Each node/subtree can be marked dirty for distinct reasons:

- layout dirty
- style dirty
- content dirty
- paint dirty
- subtree dirty

### Result

- relayout only dirty branches
- repaint only dirty subtrees/regions
- preserve static UI cheaply

### Reality check
This is one of the biggest real wins, but also one of the more invasive changes. It should be phased, not rushed.

---

## Pillar 5: Mutation Batching

### Problem
A single Lua callback may issue many property changes that each trigger downstream invalidation separately.

### Target
Batch mutations during a callback/update phase and flush invalidation once.

### Benefits

- fewer redundant relayout passes
- fewer redundant repaint requests
- lower message-thread churn

---

## Pillar 6: Script Budgets and Guardrails

### Problem
Users will write slow callbacks. That is not hypothetical.

### Target
Introduce bounded execution expectations and first-class diagnostics for script cost.

### Needed metrics

Per frame / callback / script:

- total time
- peak time
- avg time
- invocation count
- over-budget count
- consecutive over-budget frames
- slowest callback name

### Policy ideas

- warn when a callback exceeds budget
- count repeated offenders
- skip optional visual work under sustained overload
- eventually suspend nonessential callbacks/effects if a script keeps torching the frame budget

### Principle
The host must remain in control, even when scripts are bad.

---

## Pillar 7: Multi-Rate Update Domains

### Problem
Not all data deserves the same refresh rate.

### Target
Different domains update at rates appropriate to their importance and cost.

### Example domains

- input/drag feedback: best effort, highest priority
- transport state: on change
- meters: decimated rate
- waveform redraw: event-driven or throttled
- performance panel: low rate
- debug inspectors: very low rate

### Benefit
Stop paying 30Hz+ cost for data that only needs 5Hz.

---

## Pillar 8: Observability First

### Problem
Without good telemetry, every future performance complaint turns into guesswork.

### Target
Extend the existing `FrameTimings` + IPC diagnostics into a proper performance surface.

### Candidate diagnostics

- current/avg/peak timer interval
- frame stage timings
- slowest Lua callback this frame
- callback histogram/top offenders
- dirty node counts
- layout passes per frame
- paint invalidation counts
- dropped/degraded update counts

### Delivery mechanism
Use existing IPC / `DIAGNOSE` / perf scripts rather than stderr spam.

---

## Overload Strategy

When the system is overloaded, the degradation order should be:

1. keep input/interaction responsive
2. keep core editor state correct
3. decimate optional visuals
4. decimate debug/perf UI
5. skip cosmetic effects
6. surface diagnostics/warnings
7. if necessary, suppress pathological nonessential script paths

The user should experience reduced visual richness before complete UI jank.

---

## API Design Implications

The scripting API should make the fast path easy and the slow path obvious.

### Fast path API characteristics

- stable widget handles
- cheap property mutation
- event-driven state updates
- cached references to hot objects/functions
- numeric IDs/enums in hot paths where possible

### Slow path API characteristics

- dynamic tree rebuilds
- expensive broad queries
- filesystem access
- deep introspection
- debug-only helpers

### Rule
If the easiest API is the expensive one, users will absolutely abuse it.

---

## Suggested Phasing

## Phase 0: Instrumentation and proof

Low-risk work that gives better visibility:

- add timer cadence metrics into `FrameTimings`
- add per-callback Lua profiling
- expose top offenders in IPC/diagnostics
- reduce debug spam in hot paths

## Phase 1: Cheap wins

- dirty-state publish instead of full state push
- mutation batching around script callbacks
- classify update domains by priority/rate

## Phase 2: Correctness hardening

- migrate animations/effects to `dt`
- make visual correctness less dependent on exact timer cadence
- start introducing script budgets and warnings

## Phase 3: Structural UI wins

- widget-tree dirty flags
- scoped relayout
- scoped repaint / region invalidation

## Phase 4: Overload management

- dynamic degradation of optional visuals
- callback shedding for nonessential work
- persistent diagnostics and script health reporting

---

## Immediate Practical Relevance

This plan should **not** be misread as "we must rearchitect everything before shipping more features." The point is to avoid piecemeal work that locks us further into brute-force full-frame behavior.

The practical rule is:

- small fixes are still valid
- but they should move the system toward dirty updates, bounded work, and better observability
- not toward more hidden full-frame costs

---

## Relationship to the Timer-Rate Issue

The current 30Hz-requested / ~22Hz-observed timer behavior is a real issue, but it sits adjacent to this architecture, not at the center of it.

### What the timer issue tells us

- cadence is not precise under current JUCE/Linux message-thread scheduling
- callback work alone does not explain the drift
- we should avoid designs that require exact tick frequency for correctness

### What it does **not** prove

- that the editor is already CPU-bound
- that major performance problems are solved by replacing the timer alone
- that message-thread safety can be compromised in pursuit of exact cadence

### Architectural takeaway

Build the UI/runtime so cadence jitter is survivable, then revisit exact timer strategy with less risk.

---

## Success Criteria

We should consider this architecture direction successful when:

1. Idle editor cost is low and stable
2. State changes do not imply full-frame updates
3. Bad Lua scripts are diagnosable and bounded
4. Optional visuals can degrade without breaking interaction
5. Performance complaints can be investigated through IPC metrics, not guesswork
6. Timer jitter no longer breaks correctness of visual features

---

## Blunt Summary

The long-term performance strategy is:

- push less
- run less
- paint less
- measure everything important
- make expensive paths obvious
- bound script abuse
- degrade visuals before interaction

That is the architecture that will tolerate users writing shitty Lua without the editor turning into a laggy piece of shit.
