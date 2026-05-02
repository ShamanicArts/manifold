# Full Codebase Testing Suite

**Date:** 2026-05-02
**Status:** Living reference — updated as test coverage expands
**Scope:** All test infrastructure, registered and unregistered tests, coverage gaps, and the contract-testing methodology proven by the avsamplerDOCKING and binding god functions decompositions.

---

## 1. Architecture Overview

### 1.1. Test Tiers

| Tier | Binary/Path | Primary Job | What NOT to use it for |
|------|-------------|-------------|------------------------|
| **Tier 0** | C++ unit harnesses (`manifold/headless/*Harness.cpp`) | Local unit-level testing of individual components | User-visible behavior |
| **Tier 1** | `ManifoldHeadless` (no GUI) | IPC protocol, state mutation, command semantics | Editor/shell/runtime-root correctness |
| **Tier 2** | `ManifoldHeadless --test-ui` | Lua shell, editor-headless wiring, renderer-switch semantics, UI bootstrap | Actual GL/input behavior |
| **Tier 3** | Standalone (`Manifold_Standalone`) | Renderer behavior, focus, overlays, real input, real regressions, perf truth | Fast smoke checks |
| **Tier 4** | Profiling tools | Latency, backlog, interaction timing, large-window cost, regression thresholds | Correctness of static state |

### 1.2. The Contract Testing Methodology

This is the core testing pattern that the entire suite is built on. It was proven in two successful refactoring rounds (avsamplerDOCKING and binding god functions) and should be the default approach for new tests.

```
Step 1:  Run the system to a deterministic state
Step 2:  Export a comprehensive contract as JSON
Step 3:  Save to tests/fixtures/<name>_golden.json
Step 4:  After changes: re-export and diff
Step 5:  Pass/fail on byte-identical match
```

The contract must be:
- **Deterministic** — same inputs → same output every time
- **Comprehensive** — covers everything the code under test does
- **Fragile to drift** — any behavioral change produces a diff
- **Fast** — runs in under a second for iterative use

### 1.3. CTest Registration

Tests are registered in `CMakeLists.txt:1288-1342` via `add_test()`. Each test has:
- A unique `NAME`
- A `COMMAND` (C++ harness binary or Python script)
- `LABELS` for filtering (`ctest -R <label>`)

---

## 2. Registered Tests

### 2.1. `manifold_lua_bindings_contract`

| Field | Value |
|-------|-------|
| Tier | 0 (C++ harness) |
| Binary | `LuaEngineMockHarness` |
| Source | `manifold/headless/LuaEngineMockHarness.cpp` (1,080L) |
| Labels | `manifold`, `lua`, `bindings`, `contract` |
| Golden file | `tests/fixtures/lua_bindings_golden.json` (426K) |

**What it tests:** The full sol2 Lua registry — every function, usertype, constant, and table registered by the binding layer.

**How it works:** Creates a `LuaCoreEngine`, initializes it with a mock processor, calls `registerBindings()`, then walks the Lua registry dumping everything. `--write-contract` saves the golden file, `--verify-contract` diffs against it.

**What it catches:**
- Missing bindings after extraction
- Wrong function signatures
- Reordered registrations (sol2 is order-sensitive for some types)
- Platform-specific conditional compilation guards that didn't survive extraction

**Established for:** Binding god functions decomposition (Stream A/C).

### 2.2. `manifold_headless_oscquery_contract`

| Field | Value |
|-------|-------|
| Tier | 2 (Python e2e, ManifoldHeadless --test-ui) |
| Script | `tests/e2e_oscquery_contract_test.py` (~300L) |
| Labels | `manifold`, `headless`, `oscquery`, `contract` |
| Golden file | `tests/fixtures/dsphost_oscquery_golden.json` (29K) |

**What it tests:** The OSCQuery endpoint tree — all registered OSC endpoints with their types, ranges, access modes, and descriptions.

**How it works:** Launches `ManifoldHeadless --test-ui`, switches to a deterministic temp UI script, registers custom OSC endpoints, fetches `GET /info` via HTTP, diffs the JSON tree against golden.

**What it catches:**
- Param path drift after refactoring
- Missing endpoints
- Type mismatches (int vs float vs string)
- Range clamping changes

**Established for:** DSPHost param registry refactoring (Stream C).

### 2.3. `manifold_headless_ipc_core`

| Field | Value |
|-------|-------|
| Tier | 1 (Python e2e, ManifoldHeadless) |
| Script | `tests/e2e_ipc_test.py` (~200L) |
| Labels | `manifold`, `headless`, `ipc` |

**What it tests:** Basic IPC command round-trip — sends `EVAL return 1`, expects `OK 1` response. Tests that the Unix socket lifecycle, command parsing, and Lua eval path work.

**How it works:** Launches `ManifoldHeadless` (no `--test-ui`), waits for socket, sends commands, checks responses.

### 2.4. `manifold_headless_avsampler_docking_regression`

| Field | Value |
|-------|-------|
| Tier | 2 (Python e2e, ManifoldHeadless --test-ui) |
| Script | `tests/e2e_avsampler_docking_regression.py` (~450L) |
| Labels | `manifold`, `headless`, `editor`, `avsampler`, `regression` |

**What it tests:** Full avsamplerDOCKING project state contract — loads the decomposed project, exports all state via `__avsdExportContract()`, diffs against the pre-decomposition golden snapshot.

**How it works:** Based on the `AvSamplerDockingHarness` class which launches `ManifoldHeadless --test-ui`, switches to the avsamplerDOCKING project, calls the contract export function via `EVAL`, captures state JSON, and diffs.

**Established for:** avsamplerDOCKING god object decomposition.

### 2.5. `manifold_standalone_direct_profile_sanity`

| Field | Value |
|-------|-------|
| Tier | 3/4 (Python e2e, standalone binary) |
| Script | `tests/ui_profile_test.py` (~400L) |
| Labels | `manifold`, `standalone`, `direct`, `profile` |
| Skip code | 77 (no GUI session) |

**What it tests:** UI rendering performance in direct mode — frame timing, paint duration, ImGui render time. Ensures the renderer doesn't catastrophically regress.

**How it works:** Launches standalone, waits for GUI startup, switches to direct renderer, measures frame timings via `DIAGNOSE`, checks against thresholds (`max-avg-paint-us 500`, `max-imgui-render-us 20000`, `max-over-budget-count 6`).

### 2.6. `manifold_video_sampler_storage`

| Field | Value |
|-------|-------|
| Tier | 0 (C++ harness) |
| Binary | `VideoSamplerHarness` |
| Source | `tests/VideoSamplerHarness.cpp` |
| Labels | `manifold`, `video`, `sampler`, `regression` |

**What it tests:** Video sampler frame storage and retrieval — captures video frames, stores them, reads them back, verifies pixel data integrity.

### 2.7. `manifold_video_retrospective_capture`

| Field | Value |
|-------|-------|
| Tier | 0 (C++ harness) |
| Binary | `VideoRetrospectiveCaptureHarness` |
| Source | `tests/VideoRetrospectiveCaptureHarness.cpp` |
| Labels | `manifold`, `video`, `capture`, `regression` |

**What it tests:** Video retrospective capture ring buffer — writes frames, reads them back after a delay, verifies correct frames survive the ring buffer roll.

### 2.8. `manifold_core_midi_contract`

| Field | Value |
|-------|-------|
| Tier | 0 (C++ harness) |
| Binary | `BehaviorCoreMidiContractHarness` |
| Source | `manifold/headless/BehaviorCoreMidiContractHarness.cpp` (286L) |
| Labels | `manifold`, `core`, `midi`, `contract` |
| Golden file | `tests/fixtures/core_midi_golden.json` (3.1K) |

**What it tests:** Deterministic processor MIDI behavior — synthetic incoming MIDI (`note on`, `CC`, `pitch bend`, `program change`, `note off`) through `BehaviorCoreProcessor::processMidiInput()`, `MidiManager` channel/voice state, drained input ring contents, and outgoing MIDI emitted via the public `sendMidi*` API and `drainMidiOutput()`.

**How it works:** Creates a real `BehaviorCoreProcessor`, prepares it, enables MIDI thru, attempts invalid device opens (must remain closed), injects deterministic `juce::MidiBuffer` input, snapshots `MidiManager` state as JSON, drains the manager input ring, sends deterministic outgoing MIDI via `sendMidiNoteOn` / `sendMidiCC` / `sendMidiPitchBend` / `sendMidiProgramChange` / `sendMidiNoteOff`, drains output, and diffs against the golden file.

**What it catches:**
- Broken note/CC/pitch-bend/program-change state updates in `MidiManager`
- Drift in voice allocation / release for the first synthetic note
- Input ring encoding regressions
- Outgoing MIDI encoding regressions in the processor helper layer
- Accidental behavior changes while splitting MIDI helpers out of `BehaviorCoreProcessor.cpp`

### 2.9. `manifold_state_projection`

| Field | Value |
|-------|-------|
| Tier | 0 (C++ harness) |
| Binary | `StateProjectionHarness` |
| Source | `manifold/headless/StateProjectionHarness.cpp` (228L) |
| Labels | `manifold`, `state`, `projection`, `regression` |

**What it tests:** State JSON projection schema validation — verifies that `ControlServer::getStateJson()` produces a correctly-structured JSON with all expected fields, typed correctly, and with the layered `params`/`voices` structure.

**How it works:** Creates a `ControlServer`, sets all atomic state fields to known deterministic values, calls `getStateJson()`, parses the JSON, and runs 695 assertion checks against the schema (field types, layer structure, aliased paths, voice representation).

**What it catches:**
- State JSON schema drift after refactoring
- Wrong field types or missing fields
- Broken projection structure (`params` vs `voices` layering)
- Param path alias changes

**Established for:** Phase 5c state serialization support extraction.

**Established for:** Priority 5, Phase 5b support extraction (processor MIDI helpers).

---

## 3. Unregistered Assets

These exist in the codebase but have no CTest entry. They are functional but not part of the automated suite.

### 3.1. C++ Harnesses (in `manifold/headless/`)

| Harness | Lines | Purpose | Should Register? |
|---------|-------|---------|:----------------:|
| `CanonicalCommandHarness.cpp` | 217 | Tests canonical command format parsing | Yes |
| `ControlCommandQueueHarness.cpp` | 114 | Tests command queue enqueue/dequeue | Yes |
| `EndpointResolverHarness.cpp` | 208 | Tests endpoint path resolution | Yes |
| `PortBufferSemanticsHarness.cpp` | 254 | Tests audio port buffer handling | Maybe — may have been removed from suite deliberately |
| `StateProjectionHarness.cpp` | 228 | Tests state serialization round-trip | ✅ Registered as `manifold_state_projection` |

These were likely built during earlier development phases and their CTest entries were either never created or removed. They all compile (they're in `MANIFOLD_RUNTIME_SOURCES`). Most are fast and deterministic — prime candidates for registration.

### 3.2. Python E2E Tests (in `tests/`)

| Script | Lines | What It Tests | Should Register? |
|--------|-------|---------------|:----------------:|
| `e2e_editor_ipc_test.py` | 250 | Editor IPC commands via headless | Yes — Tier 2 |
| `e2e_fx_slot_swap_test.py` | 264 | FX slot swap during playback | Yes — Tier 2 |
| `e2e_main_fx_lazy_test.py` | 271 | Main FX lazy loading | Yes — Tier 2 |
| `e2e_rack_eq_palette_test.py` | 369 | Rack EQ palette operations | Yes — Tier 2 |
| `e2e_super_fx_lazy_test.py` | 276 | Super FX lazy loading | Yes — Tier 2 |
| `main_tab_bar_test.py` | 438 | Main tab bar behavior | Yes — Tier 2 |
| `standalone_direct_regression_test.py` | 164 | Direct renderer crash regression | Yes — Tier 3 |
| `ui_renderer_compare_profile.py` | 166 | Canvas vs direct renderer comparison | Maybe — profiling tool |

These tests exist and work but are not wired into CTest. They're the immediate highest-ROI testing improvement — register them, see what passes, fix what doesn't.

---

## 4. Test Coverage Map

### 4.1. What's Covered

| Area | Coverage | How |
|------|----------|-----|
| Lua binding registration | ✅ Full contract | `LuaEngineMockHarness --verify-contract` |
| OSCQuery endpoint tree | ✅ Full contract | `e2e_oscquery_contract_test.py` |
| IPC command round-trip | ✅ Smoke | `e2e_ipc_test.py` |
| avsamplerDOCKING project state | ✅ Full contract | `e2e_avsampler_docking_regression.py` |
| Video sampler storage | ✅ Unit | `VideoSamplerHarness` |
| Video retrospective capture | ✅ Unit | `VideoRetrospectiveCaptureHarness` |
| Processor MIDI helper layer | ✅ Contract | `BehaviorCoreMidiContractHarness` |
| Processor Link state | ✅ Full contract | `manifold_core_state_contract` (all 7 Link fields) |
| State projection schema | ✅ Unit | `StateProjectionHarness` (695 checks) |
| Direct renderer perf | ✅ Threshold | `ui_profile_test.py` |

### 4.2. What's Partially Covered

| Area | Coverage | Gap |
|------|----------|-----|
| Editor IPC | Partial smoke | `e2e_editor_ipc_test.py` exists but unregistered |
| FX slot operations | Partial smoke | 3 FX test scripts exist but unregistered |
| Rack EQ palette | Partial smoke | `e2e_rack_eq_palette_test.py` exists but unregistered |
| Tab bar behavior | Partial smoke | `main_tab_bar_test.py` exists but unregistered |
| Direct renderer regression | Partial stress | `standalone_direct_regression_test.py` exists but unregistered |
| MIDI hardware-device path | Partial contract | `manifold_core_midi_contract` covers synthetic input/output + `MidiManager` state, but not real device callback routing |
| Shell state observability | Partial | `DIAGNOSE.shell` is partially wired per the testing workplan |

### 4.3. What's Missing

| Area | Gap | Why It Matters | Priority |
|------|-----|----------------|:--------:|
| **DSP node unit tests** | 55+ nodes have zero tests | Every node is a potential regression point | High |
| **ControlServer command dispatch** | Command reachability is covered, but command-specific semantics are still sparse | Every new IPC command can still be semantically wrong while remaining callable | High |
| **MIDI hardware callback + real device lifecycle** | Synthetic MIDI is covered, but real device callback routing is not | Hardware-input regressions can still hide behind the synthetic harness | High |
| **Graph runtime** | `PrimitiveGraph`, `GraphRuntime` — no graph-level tests | Graph construction bugs are silent | Medium |
| **State serialization round-trip** | `StateProjectionHarness.cpp` exists but unregistered | Save/load bugs cause data loss | Medium |
| **DSP host parameter bindings** | Param set/get round-trip at DSP host level | Parameter automation correctness | Medium |
| **Concurrent access** | Multiple mutex paths, no threading tests | Race conditions are silent | Medium |
| **UI behavior correctness** | Shell methods, modes, tabs — no assertions beyond "it didn't crash" | User-facing bugs | Medium |
| **Performance regression** | Only one perf test, single threshold | Render/audio regressions invisible | Low |
| **Bug regression suite** | No systematic mapping of past bugs to tests | Known bugs re-surface | Medium |

---

## 5. Contract Test Blueprint

For each new area of test coverage, follow this pattern:

### Step 1: Identify the Contract

What deterministic snapshot captures the full behavior of the system under test?

| Area | Contract Candidate |
|------|--------------------|
| DSP nodes | Input buffer → process → output buffer peaks + spectrum |
| Control commands | Command string → response + state mutation delta |
| MIDI | MIDI input → note/CC state changes |
| Graph runtime | Graph topology → process → per-node output snapshots |
| State serialization | Save state → load state → save again → diff two saves |
| UI shell | Shell method call → shell state snapshot (`DIAGNOSE.shell`) |

### Step 2: Build the Export Mechanism

Add a deterministic export function to the system under test. This can be:
- A `--write-contract` flag on an existing harness
- An `EVAL`-callable Lua function that dumps state to JSON
- A `GET` path that returns structured state from the IPC server

Keep the export mechanism minimal — one function that returns JSON. Do NOT add debugging infrastructure.

### Step 3: Generate the Golden File

```bash
# C++ harness:
./build-dev/LuaEngineMockHarness --write-contract tests/fixtures/lua_bindings_golden.json

# Python e2e:
python3 tests/e2e_oscquery_contract_test.py \
    --headless build-dev/ManifoldHeadless \
    --write-golden tests/fixtures/dsphost_oscquery_golden.json
```

### Step 4: Register in CTest

```cmake
add_test(
    NAME manifold_<domain>_contract
    COMMAND <binary or python script>
            <args>)
set_tests_properties(manifold_<domain>_contract PROPERTIES
    LABELS "manifold;<domain>;contract")
```

### Step 5: Verify Iteratively

After every change to the system under test:
```bash
ctest -R manifold_<domain>_contract
```

A non-empty diff means the behavior changed. Fix before merging.

---

## 6. Immediate Next Steps (Highest ROI)

### 6.1. Register Orphaned Tests (1-2 hours)

The 8 existing Python e2e tests and 5 C++ harnesses are functional but have no CTest entries. Adding them is trivial:

- Add `add_test()` blocks to `CMakeLists.txt` for each (following the existing pattern at lines 1288-1342)
- Run them, see which pass
- Fix or document the ones that fail

Estimated result: 11 new registered tests for minimal effort.

### 6.2. Add State Serialization Contract (2-3 hours)

`StateProjectionHarness.cpp` already exists and tests state serialization round-trip. It just needs:
- Registration in `CMakeLists.txt`
- A `--write-contract` mode to capture the current state as golden
- A `--verify-contract` mode to diff against it

This gives us save/load correctness coverage for free.

### 6.3. Add Control Command Dispatch Test (3-4 hours)

Build on the existing IPC test infrastructure. Iterate all documented command types, send each via `ManifoldClient`, capture the response. Fail if any command returns an error or doesn't return at all.

This doesn't test the semantics of each command — it tests that every command handler is reachable and doesn't crash. That alone covers the "big switch" risk.

### 6.4. Add DSP Node Contract Tests (Longer — 1-2 days per node family)

For each DSP node family (filters, delays, dynamics, modulation, etc.):
- Build a test graph with known input
- Process N samples
- Capture output buffer peaks + spectrum
- Save as golden file
- Verify after changes

Start with a single node family (FilterNode — simplest, most critical). If the pattern works, extend to others.

---

## 7. Known Test Deficiencies

### 7.1. No Cross-Platform Testing

All existing tests assume Linux with a Unix socket filesystem. No macOS or Windows coverage. The `has_gui_session()` helper handles display server detection but doesn't provide alternatives.

### 7.2. No Headless-Only Mode for Contract Tests

The oscquery contract test requires `--test-ui` (which creates a JUCE editor). This introduces JUCE GUI dependencies and platform-specific behavior (GL context creation, window system interaction) that can cause false failures. A true headless contract test that exercises the full stack without creating an editor would be more reliable.

### 7.3. No Performance Regression Suite

Only one perf test exists (`ui_profile_test.py`) with coarse thresholds. There's no mechanism to track perf over time, detect gradual regressions, or compare between builds. The frame timing instrumentation exists (`DIAGNOSE.frameTiming`) but has no regression test wired to it.

### 7.4. No Bug Regression Catalog

The testing workplan (260224) specifies: "Turn known regressions into permanent tests." This hasn't been executed. Past bugs that burned the project should each map to a durable test, but there's no catalog of past bugs and no mapping to tests.

### 7.5. Build Dependencies

The Python e2e tests hardcode the headless binary path (`build-dev/ManifoldHeadless`). This breaks if the build directory changes. They should either:
- Accept the path as a required argument (they already do for some)
- Use CTest's `$<TARGET_FILE:>` generator expression (for C++ harnesses)
- Scan common build directories as fallback

---

## 8. Test Infrastructure Reference

### 8.1. Harness Module

**File:** `tests/harness/manifold.py`

| Class/Function | Purpose |
|----------------|---------|
| `ManifoldClient` | Unix socket IPC — `command()`, `command_ok()`, `command_json()` |
| `ManagedManifoldProcess` | Launch/stop headless or standalone — lifecycle + artifacts |
| `ArtifactBundle` | Timestamped output directory under `/tmp/manifold_test_artifacts/` |
| `wait_for()` | Poll a predicate with timeout |
| `find_live_socket()` | Discover running manifold socket |
| `has_gui_session()` | Detect display server |
| `approx_equal()` | Float comparison with tolerance |

### 8.2. Headless Binary

**File:** `manifold/headless/ManifoldHeadless.cpp`

| Flag | Effect |
|------|--------|
| `--samplerate <hz>` | Set audio sample rate (default: 44100) |
| `--blocksize <samples>` | Set block size (default: 512) |
| `--duration <seconds>` | Run duration, 0=forever (default: 0) |
| `--test-ui` | Create BehaviorCoreEditor for shell testing |

### 8.3. C++ Harness Module

**File:** `manifold/headless/LuaEngineMockHarness.cpp`

| Flag | Effect |
|------|--------|
| `--write-contract <path>` | Export sol2 registry to JSON file |
| `--verify-contract <path>` | Compare current sol2 registry against golden JSON |

### 8.4. IPC Protocol

| Command | Effect |
|---------|--------|
| `EVAL <lua_code>` | Evaluate Lua code, return result |
| `GET <path>` | Get value at OSC path |
| `SET <path> <value>` | Set value at OSC path |
| `DIAGNOSE` | Return full diagnostic JSON |
| `UISWITCH <mode>` | Switch UI renderer mode |

### 8.5. CTest Filtering

```bash
# Run all manifold tests
ctest -R manifold

# Run only contract tests
ctest -R contract

# Run only headless tests
ctest -R headless

# Run by label
ctest -L manifold
```

---

## 9. Change Log

| Date | Change |
|------|--------|
| 2026-05-03 | Added `manifold_core_midi_contract` and documented the new deterministic MIDI harness + golden file. Updated coverage map: processor MIDI helper layer is now contract-covered; real hardware-device routing remains a separate gap.
| 2026-05-03 | Added `manifold/core/LinkSupport.h` – 14 Link delegate methods extracted from `BehaviorCoreProcessor`. Link state coverage documented: all 7 fields covered by existing `manifold_core_state_contract`. No new harness needed.
| 2026-05-03 | Added `manifold/core/StateSerializationSupport.h` – extracted IStateSerializer helpers + method bodies (~700L). Registered `StateProjectionHarness.cpp` as new `manifold_state_projection` CTest (695 checks, passes). Full suite now 10/10. |
| 2026-05-02 | Initial document. Compiled from CTest registration, test directory audit, harness module analysis, and existing testing workplans. |
