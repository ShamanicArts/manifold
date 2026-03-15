# Expected App Behavior Testing Workplan

## Purpose

This document defines the next layer of Manifold test work **after** the existing harness, headless/editor-headless coverage, standalone direct regression stress, and standalone direct profile sanity.

The point is to move from:

- "the plumbing works"
- "the renderer does not immediately explode"
- "some performance counters are sane"

…to:

- **the application behaves correctly in the ways users actually experience**

This is intentionally dense and implementation-oriented. It is meant to be used as the planning artifact for future work, not as a high-level summary.

---

## Current baseline

### Already in place

#### Harness + build integration
- Shared Python harness:
  - `tests/harness/__init__.py`
  - `tests/harness/manifold.py`
- CTest integration in `CMakeLists.txt`
- Artifact capture under `/tmp/manifold_test_artifacts`

#### Existing passing CTest coverage
- `manifold_headless_ipc_core`
- `manifold_headless_ipc_editor`
- `manifold_standalone_direct_regression`
- `manifold_standalone_direct_profile_sanity`

#### Existing script/tool coverage
- `tests/e2e_ipc_test.py`
- `tests/e2e_editor_ipc_test.py`
- `tests/ui_profile_test.py`
- `tests/standalone_direct_regression_test.py`
- `tests/ui_renderer_compare_profile.py`
- `tools/manifold-perf.py`

### What the current baseline proves
- IPC round-trip works
- `ManifoldHeadless` boots and responds correctly
- editor-headless shell/Lua/timer path boots and can be driven
- standalone direct mode can launch, be switched, and survive repeated mode transitions
- direct mode has basic profile sanity thresholds
- frame timing / render timing / canvas paint profile are observable via `DIAGNOSE`

### What the current baseline does **not** prove
- startup produces the correct visible shell state
- active shell mode / panel mode / tab state are correct
- overlays behave correctly for z-order, focus, and input capture
- LooperTabs layer selection behaves correctly in the real main view
- direct vs canvas behavior parity is correct beyond smoke/perf
- persistence and recovery behavior is correct
- user-visible interaction latency is acceptable
- failure modes recover cleanly

---

## Scope of “expected app behavior”

For this workplan, expected app behavior means:

1. **Startup correctness**
2. **Shell/layout correctness**
3. **Mode and tab correctness**
4. **Input routing correctness**
5. **Selection/focus correctness**
6. **Overlay correctness**
7. **Renderer parity correctness**
8. **Legacy fallback correctness**
9. **Persistence correctness**
10. **Error handling / recovery correctness**
11. **Transport/playback-linked UI correctness**
12. **Interaction performance correctness**

This explicitly goes beyond protocol correctness and beyond one-off smoke launches.

---

## Guiding principles

1. **Do not make the suite depend on a specific window manager or compositor.**
   - Hyprland helpers may remain optional developer tooling.
   - The product suite must remain cross-platform.

2. **Prefer assertion through introspection over screenshots.**
   - If behavior matters and cannot be asserted, add observability.
   - Screenshot-driven testing should be a last resort.

3. **Use the right tier for the right truth.**
   - Headless: protocol/state correctness
   - Editor-headless: shell/Lua/editor wiring correctness
   - Standalone: GL lifecycle, real input/render behavior, user-visible regressions

4. **Turn known regressions into permanent tests.**
   Every bug that already burned the project should map to at least one durable test.

5. **Keep perf thresholds coarse at first, then tighten.**
   Catastrophic regression guards are valuable immediately; polished budgets come later.

6. **Add observability before adding brittle tests.**
   If the suite has to guess, it will rot.

---

## Test tiers and responsibilities

| Tier | Binary / path | Primary job | What it should not be used for |
|---|---|---|---|
| Tier 0 | unit-ish / helper checks | local parser/helpers/small utilities if added later | user-visible behavior truth |
| Tier 1 | `ManifoldHeadless` | IPC protocol, state mutation, command semantics | editor/shell/runtime-root correctness |
| Tier 2 | `ManifoldHeadless --test-ui` | Lua shell/editor-headless wiring, renderer-switch semantics, UI bootstrap observability | actual GL/input behavior |
| Tier 3 | Standalone | renderer behavior, focus, overlays, real mode switching, real regressions, perf truth | tiny fast smoke-only checks |
| Tier 4 | profiling / interaction studies | latency, backlog, interaction timing, large-window cost, regression thresholds | correctness of static app state |

---

## Coverage map: current vs required

### Legend
- **Done** = acceptable baseline exists
- **Partial** = some smoke/stress exists, but correctness assertions are weak
- **Missing** = not meaningfully covered yet

| Behavior area | Current coverage | Target tier | Status | Why it matters |
|---|---|---:|---|---|
| IPC protocol core | headless e2e | 1 | Done | fundamental control path |
| editor-headless Lua/shell boot | editor e2e | 2 | Done | shell/runtime initialization |
| standalone direct crash-on-switch | standalone regression | 3 | Done | known severe regression class |
| direct perf sanity | standalone profile sanity | 3/4 | Done | catastrophic perf guard |
| startup shell correctness | minimal smoke only | 2/3 | Partial | tabs/load state/boot regressions happened repeatedly |
| mode-switch correctness | stress mostly, weak assertions | 2/3 | Partial | layout/focus/preview regressions happened repeatedly |
| project tab correctness | mostly manual | 2/3 | Missing | startup/project switching bugs already occurred |
| perf overlay correctness | mostly manual | 3 | Missing | z-order/input/focus regressions already occurred |
| console correctness in direct | mostly manual | 3 | Missing | hotkey/input/focus regressions already occurred |
| layer selection correctness | patch + manual smoke | 3 | Missing | known user-visible functional bug |
| renderer parity (layout/transform/hit) | partial smoke | 2/3 | Partial | direct migration risk area |
| legacy fallback behavior | direct-load smoke only | 2/3 | Partial | task requirement explicitly demanded this |
| persistence/settings behavior | ad hoc/manual | 2/3 | Missing | user settings and restored state matter |
| error handling / recovery | weak | 1/2/3 | Missing | invalid scripts/switches should not wedge the app |
| playback-linked UI responsiveness | observational | 3/4 | Missing | core user experience |
| interaction latency | profiling only in rough form | 4 | Missing | knob-drag stutter class not fully formalized |

---

## The real blocker: missing observability

The suite cannot properly assert behavior that the app does not expose.

### Required observable state

The following should become queryable either through `DIAGNOSE`, well-defined `GET` paths, or explicit Lua test helpers surfaced via `EVAL`.

| Needed state | Why tests need it | Preferred exposure |
|---|---|---|
| current shell mode (`performance` / `edit`) | assert mode-switch correctness | `DIAGNOSE.shell.mode` or `GET /ui/shell/mode` |
| current left-panel mode (`hierarchy` / `scripts`) | assert edit-panel correctness | `DIAGNOSE.shell.leftPanelMode` |
| active main/project tab id | assert startup tab population and switching | `DIAGNOSE.shell.activeMainTab` |
| main tab count/list | assert startup bootstrap correctness | `DIAGNOSE.shell.mainTabs[]` |
| console visible/focused/capturing | assert direct console behavior | `DIAGNOSE.shell.console` object |
| perf overlay visible/activeTab/focused/capturing | assert overlay behavior | `DIAGNOSE.shell.perfOverlay` object |
| selected Looper layer | assert layer selection behavior | project-specific test helper or `GET /ui/project/selectedLayer` |
| focused runtime node id/type | assert focus routing/input capture | `DIAGNOSE.runtime.focusedNode` |
| hovered runtime node id/type | assert hit-testing behavior | optional, useful for interaction diagnostics |
| active renderer host state | assert correct host activation | `DIAGNOSE.renderer.activeHost` |
| direct host input-capture state | assert overlay vs runtime host behavior | already partially available in `imgui`, extend if needed |
| last script/project load result | assert recovery after `UISWITCH` / init errors | `DIAGNOSE.shell.lastLoad` |
| settings/persistence snapshot | assert restore/clamp/default behavior | `DIAGNOSE.settings` |
| replay/backlog/overrun counters | perf + latency truth | `frameTiming` extension |

### Observability implementation preference order

1. **Structured `DIAGNOSE` output** for stable diagnostics
2. **`GET` paths** for narrow state values when path semantics already fit
3. **Dedicated Lua test helper functions** only when project/script-specific logic is involved
4. **Ad hoc `EVAL` scraping** as a temporary bridge, not the final architecture

### Proposed diagnostic shape

```json
{
  "shell": {
    "mode": "edit",
    "leftPanelMode": "scripts",
    "activeMainTab": "project:LooperTabs",
    "mainTabs": ["project:LooperTabs", "script:Foo"],
    "console": {
      "visible": false,
      "focused": false,
      "capturesKeyboard": false,
      "capturesMouse": false
    },
    "perfOverlay": {
      "visible": true,
      "activeTab": "UI",
      "focused": true,
      "capturesKeyboard": true,
      "capturesMouse": true
    },
    "lastLoad": {
      "ok": true,
      "path": "...",
      "error": ""
    }
  },
  "runtime": {
    "focusedNode": { "id": 123, "name": "waveform_2", "type": "WaveformView" },
    "hoveredNode": { "id": 123, "name": "waveform_2", "type": "WaveformView" }
  }
}
```

---

## Behavior test matrix

## 1. Startup / bootstrap behavior

### Required assertions
- shell exists after load
- startup load completes successfully
- expected project/script is active
- main tabs are populated
- active main tab is valid
- renderer mode is the intended one
- no stale previous-project state leaks through startup

### Recommended tests

#### Tier 2: editor-headless bootstrap correctness
- launch `ManifoldHeadless --test-ui`
- wait for shell readiness
- assert `shell.mode`
- assert `mainTabs` non-empty
- assert `activeMainTab` belongs to `mainTabs`
- assert `lastLoad.ok == true`

#### Tier 3: standalone startup sanity
- launch standalone in canvas
- assert startup shell state via IPC
- repeat in `imgui-direct`
- assert no missing tabs / empty content bootstrap regression

### Permanent regressions covered by this bucket
- tabs don’t load on startup
- switched project crashes during init
- shell partially initialized in direct mode

---

## 2. Mode-switch correctness

### Required assertions
- `performance -> edit -> performance` updates `shell.mode`
- `leftPanelMode` changes when requested
- stale hidden surfaces do not remain logically active
- focus moves to a sensible surface
- render host activation matches mode
- no layout dead state after rapid switching

### Recommended tests

#### Tier 2: editor-headless correctness
- switch mode through `EVAL`
- assert `shell.mode` and `shell.leftPanelMode`
- assert relevant host/surface state in `DIAGNOSE`

#### Tier 3: standalone regression correctness
Existing stress test should be extended to assert:
- final mode is valid after each cycle
- active host changed as expected
- overlay hidden state remains hidden after mode churn
- no `lastLoad.error`

### Permanent regressions covered by this bucket
- rapid edit/performance crash
- stale overlays/grey regions
- hidden zero-size surfaces still rendering
- wrong z-order on mode return

---

## 3. Project tabs / shell tab correctness

### Required assertions
- main tabs exist on startup
- active tab content corresponds to selected tab
- tab switching does not crash
- shell tab state survives project changes correctly
- invalid tab activation fails safely

### Recommended tests

#### Tier 2
- assert startup `mainTabs`
- call `activateMainTab(...)`
- assert `activeMainTab` changes
- assert `lastLoad.ok`

#### Tier 3
- repeat in standalone direct mode
- ensure no crash + correct active tab after scripted switch

### Permanent regressions covered by this bucket
- tabs don’t load on startup
- project tab switching crash in direct mode

---

## 4. Console correctness

### Required assertions
- global hotkey opens console in direct mode
- console becomes visible
- console receives keyboard focus
- keyboard input does not go to runtime host while console owns it
- console hides cleanly

### Recommended tests

#### Tier 3 only
Need standalone because focus/input ownership is real here.

Test flow:
1. launch standalone direct
2. toggle console through hotkey-equivalent path or explicit shell call
3. assert `console.visible == true`
4. assert `console.focused == true`
5. assert runtime host keyboard capture is blocked or redirected appropriately
6. hide console
7. assert `console.visible == false`

### Permanent regressions covered by this bucket
- console not displaying
- console hotkeys not working in direct mode
- direct console wrapper calling Canvas-only APIs

---

## 5. Perf overlay correctness

### Required assertions
- overlay opens/closes
- correct active tab is retained
- overlay comes to front when visible
- overlay captures mouse/keyboard while active
- clicks do not pass through to runtime host
- bounds are clamped to sane minimums

### Recommended tests

#### Tier 3
Add a new standalone overlay behavior script:
- show overlay
- assert `perfOverlay.visible`
- assert focus/capture state
- switch tab to `UI`/`Paint`
- assert active tab updated
- move/resize if scriptable, assert clamping
- hide overlay, assert capture released

### Permanent regressions covered by this bucket
- overlay clicks not registering
- clicks passing through overlay
- overlay too small/cropped
- direct host coming to front over overlay

---

## 6. Looper layer selection correctness

### Required assertions
- clicking waveform selects layer
- scrubbing waveform selects layer
- volume knob change selects layer
- speed knob change selects layer
- mute/play/clear buttons select layer
- dead-zone/background click behavior is defined and tested

### Recommended tests

#### Needed precondition
Project-level introspection for selected layer must exist.

#### Tier 3
Drive actual LooperTabs main view through IPC/scripted interaction helper and assert selected layer after each action.

### Recommended implementation path
Do **not** build this on screenshot/image matching.
Add a project-level helper exposed in test mode, for example:

```lua
return {
  getSelectedLayer = function() return ... end,
  clickWaveform = function(layer) ... end,
  clickMute = function(layer) ... end,
  dragVolume = function(layer, value) ... end,
}
```

This can initially be Lua-side test plumbing, then hardened later if needed.

### Permanent regressions covered by this bucket
- main looper-view layer selection failure in direct mode

---

## 7. Renderer parity correctness

### Required assertions
- transform-aware preview behavior is correct
- hit-testing matches transformed visuals
- hidden zero-size nodes are not rendered / hit-testable
- edit preview scaling is sane in direct mode
- direct and canvas expose the same shell state for equivalent actions

### Recommended tests

#### Tier 2
Use editor-headless to assert layout state/transform-related diagnostics if exposed.

#### Tier 3
Use standalone to validate behavior in both renderers:
- open same project
- enter same shell mode/panel mode
- compare observable shell/runtime state
- compare interaction outcomes, not pixels

### Permanent regressions covered by this bucket
- selection bounds resize but items do not
- hidden nodes still visible in direct mode
- labels at `(0,0)` from invalid zero-bounds handling

---

## 8. Legacy fallback correctness

### Required assertions
- known legacy UI scripts load in direct mode
- `setOnDraw` compatibility path does not crash
- compatibility APIs needed by those scripts exist
- direct fallback refreshes when legacy scripts repaint
- legacy GL-ish widgets fail soft, not catastrophically

### Minimum test set
Run against:
- `manifold/ui/dsp_live_scripting.lua`
- `manifold/ui/manifold_settings_ui.lua`
- `manifold/ui/manifold_ui_experimental.lua`

### Recommended tests

#### Tier 2
`UISWITCH` / load each target in editor-headless direct mode
- assert `lastLoad.ok == true`
- assert shell/runtime root remains valid

#### Tier 3
Standalone smoke for same scripts in direct mode
- assert no init/load failure
- assert runtime host remains active

### Permanent regressions covered by this bucket
- missing `setOnDraw`
- missing `setOpenGLEnabled`
- stale deferred refresh closures crashing legacy UI switches

---

## 9. Persistence / settings correctness

### Required assertions
- settings file loads cleanly
- invalid/missing settings recover to defaults
- persisted overlay bounds are clamped
- default UI script/project restores correctly
- renderer preference restoration is correct if applicable

### Recommended tests

#### Tier 2
- create temporary settings fixture
- launch editor-headless with fixture
- assert restored state via `DIAGNOSE`

#### Tier 3
- standalone restore test for overlay bounds and default project/script

### Safety rule
Tests must never leave the repo in a modified user-settings state. Use temp fixtures or explicit backup/restore within harness-managed artifacts.

---

## 10. Error handling / recovery correctness

### Required assertions
- bad `UISWITCH` reports failure cleanly
- broken Lua init error is surfaced
- failed load does not wedge shell/runtime permanently
- follow-up valid load succeeds after a failure
- invalid IPC commands return clear errors

### Recommended tests

#### Tier 1 / 2
- protocol errors in headless/core
- load errors in editor-headless

#### Tier 3
- standalone recovery after bad load
- ensure subsequent valid UI/project still loads

### Permanent regressions covered by this bucket
- partial-init states after failed UI load
- nil-method crashes when expected compatibility API is missing

---

## 11. Playback-linked UI correctness

### Required assertions
- animated widgets continue updating during playback
- direct mode remains responsive during playback load
- only intended animated widgets tick
- state updates propagate without unnecessary retained rebuilds

### Recommended tests

#### Tier 2
Assert animation-related counters if exposed.

#### Tier 3 / 4
Playback scenario profiling should capture:
- frame time
- render dispatch
- present
- over-budget count
- backlog/starvation counters (to be added)

### Note
This bucket overlaps performance testing but is fundamentally a behavior requirement because the user-visible contract is “playback does not make the UI turn to shit.”

---

## 12. Interaction latency correctness

### Missing instrumentation to add
Current metrics are not enough for real interaction truth.

Need:
- input event timestamp capture
- “input accepted” counter
- input-to-next-visible-frame latency
- repaint backlog depth or pending-frame indicator
- overrun/missed-frame counters
- message-thread starvation counters

### Desired output shape

```json
{
  "interaction": {
    "lastInputType": "mouseDrag",
    "lastInputToFrameUs": 6400,
    "peakInputToFrameUs": 18200,
    "avgInputToFrameUs": 7100,
    "pendingFrameBacklog": 0,
    "missedFrameCount": 2,
    "messageThreadStarvedCount": 0
  }
}
```

### Recommended tests

#### Tier 4
- knob drag latency scenario
- waveform scrub latency scenario
- playback + interaction scenario

This is the bucket that eventually closes the loop on “it feels smooth” vs “the numbers say it is smooth.”

---

## Turning past regressions into permanent tests

| Historical regression | Permanent test target |
|---|---|
| tabs don’t load on startup | startup shell bootstrap test |
| console doesn’t display | standalone console behavior test |
| selecting layers doesn’t work | standalone Looper layer selection test |
| labels render at `(0,0)` | renderer parity / hidden-zero-bounds correctness test |
| project tab switching crash | project tab standalone test |
| direct legacy UIs fail to load | legacy fallback direct smoke matrix |
| perf overlay input/z-order broken | standalone overlay behavior test |
| left-panel header overlap blocks switching | mode-switch + shell state correctness test |
| stale grey regions on mode return | mode-switch correctness + hidden-surface state test |
| rapid mode-switch GL crash | standalone direct regression stress (already present) |
| headless broken by imgui dependency leak | headless build + headless tests (already present) |

---

## Proposed new test files / responsibilities

### Likely additions
- `tests/standalone_shell_behavior_test.py`
  - startup shell mode/tab state
  - main tab activation
  - mode/panel correctness

- `tests/standalone_overlay_behavior_test.py`
  - console and perf overlay visibility/focus/capture/z-order state assertions

- `tests/standalone_looper_behavior_test.py`
  - layer selection and core Looper main-view interactions

- `tests/editor_headless_shell_behavior_test.py`
  - startup shell bootstrap, tab population, mode/panel assertions without GL overhead

- `tests/settings_restore_test.py`
  - settings/default-project/default-script/persisted-bounds behavior

- `tests/load_recovery_test.py`
  - invalid load followed by valid load recovery assertions

### Existing files to extend
- `tests/e2e_editor_ipc_test.py`
  - add structured shell-state assertions once observability exists

- `tests/ui_profile_test.py`
  - extend with backlog/latency thresholds once instrumentation exists

- `tests/standalone_direct_regression_test.py`
  - upgrade from stress-only into stress + state assertions after each cycle

---

## Implementation phases

## Phase 1 — Observability first

### Goal
Make shell/runtime behavior observable enough that tests can assert it without guessing.

### Deliverables
- add structured shell state to `DIAGNOSE`
- add runtime focus/hover diagnostics where useful
- add load-status diagnostics
- add settings restore diagnostics
- add project-specific selected-layer introspection for LooperTabs test mode

### Exit criteria
At least these become assertable via structured output:
- shell mode
- left panel mode
- active main tab
- main tab list
- console state
- perf overlay state
- last load result
- selected layer (project-specific)

---

## Phase 2 — Shell behavior correctness

### Goal
Lock down startup, tabs, mode switching, overlays, and load recovery.

### Deliverables
- editor-headless shell behavior suite
- standalone shell behavior suite
- standalone overlay behavior suite
- load recovery suite

### Exit criteria
Known shell/overlay regressions are covered by durable automated tests.

---

## Phase 3 — Product behavior correctness

### Goal
Lock down the actual project/user behavior that matters, starting with LooperTabs.

### Deliverables
- standalone Looper behavior suite
- selected layer assertions for waveform/buttons/knobs
- transport/playback-linked UI responsiveness assertions where feasible

### Exit criteria
The main Looper user flows can be driven and asserted automatically.

---

## Phase 4 — Interaction latency and backlog truth

### Goal
Measure and gate the perceived-performance behaviors the user actually cares about.

### Deliverables
- input-to-frame instrumentation
- backlog/missed-frame/starvation counters
- knob-drag latency scenario
- waveform scrub latency scenario
- playback + interaction latency scenario

### Exit criteria
The suite can fail on real interaction regressions, not just static idle-frame metrics.

---

## Proposed acceptance criteria for the finished behavior suite

The behavior suite is not “done” until all of the following are true:

1. **Startup correctness is asserted** in editor-headless and standalone.
2. **Shell mode/panel/tab state is queryable** and tested.
3. **Console and perf overlay behavior** are asserted in standalone.
4. **Looper layer selection** is asserted in standalone.
5. **Legacy direct fallback loads** are asserted in both editor-headless and standalone smoke paths.
6. **Settings restore/clamping** is tested using controlled fixtures.
7. **Bad load / recovery** is tested.
8. **Interaction latency** is measured with dedicated counters, not guessed.
9. **Past regressions remain mapped** to permanent tests.
10. **No test depends on Hyprland or any specific window manager** for product correctness.

---

## Non-goals

These are explicitly **not** the immediate goal of this workplan:

- pixel-perfect screenshot diffing across platforms
- exhaustive DSP correctness testing of every audio path
- forcing all standalone tests to run fullscreen/maximized in the default cross-platform suite
- replacing `DIAGNOSE` with a giant unstable debug dump
- pretending editor-headless can validate real GL/input behavior

---

## Recommended immediate next tasks

1. Add structured shell/runtime/load observability to `DIAGNOSE`.
2. Add a focused editor-headless shell behavior test.
3. Add standalone overlay behavior coverage.
4. Add project-level selected-layer introspection for LooperTabs.
5. Add standalone Looper selection behavior tests.
6. Only after those are in place, add interaction-latency instrumentation and tests.

---

## Summary

The project now has a real **testing foundation**.
What it still lacks is a real **behavior suite**.

The missing work is not random. It clusters into:
- observability
- shell correctness
- overlay correctness
- product behavior correctness
- persistence/recovery correctness
- interaction-latency correctness

That is the path from “useful tooling” to “this suite will actually stop the next stupid regression before it ships.”
