# Phased Execution Roadmap (UI Shell -> Decomposition -> Editor Completion)

## Purpose

Capture the agreed execution order and testing protocol for the next major body of work.

This roadmap intentionally prioritizes:

1. shared UI shell infrastructure,
2. IPC-first observability and regression validation,
3. looper decomposition into primitives,
4. editor plan completion after decomposition parity.

Detailed host-vs-behavior migration inventory:

- `docs/LOOPER_PROCESSOR_HOST_BEHAVIOR_INVENTORY.md`

## Runtime vs Behavior Split (Clarification)

This roadmap assumes a strict ownership split:

- C++ host/runtime owns plugin lifecycle, audio callback orchestration, endpoint plumbing, state projection, and graph runtime swap safety.
- Looper behavior policy (record/commit/forward/mode/quantization/layer semantics) moves to Lua behavior scripts + isolated primitives.

The purpose of decomposition is not to delete all C++ processor code; it is to remove looper-policy logic from monolith processor paths.

## Agreed Order of Work

## Phase 1 - Shared Parent UI Shell Baseline

Build only the minimum shell needed to stabilize navigation and global controls.

Scope:

- Add a shared top header/shell visible from all core views.
- Move existing settings navigation (UI script switcher) into that shell.
- Keep settings behavior the same initially; only centralize ownership.
- Add global controls in shell where appropriate now:
  - master volume
  - input volume
  - passthrough toggle
- Leave tempo/target BPM placement unchanged for now (defer decision).

Primary goal: remove per-view navigation drift and ensure every view can reliably route to every other view.

## Phase 2 - Regression and Smoke Validation (Headless + IPC First)

Before deeper refactors, validate there are no regressions in graph lifecycle or control behavior.

Required checks:

- UI switching between default UI, DSP live scripting UI, and test UIs.
- Graph enable/disable behavior remains correct when switching views.
- No stale graph processing after leaving authoring views.
- Core transport and level controls still behave as expected.

Validation must be performed on `LooperHeadless` via IPC/CLI first.

## Phase 3 - Looper Decomposition Into Primitives

Once shell and switching behavior are stable, shift to decomposition.

Scope:

- Decompose looper behavior into composable primitive units.
- Extract concrete primitives into dedicated files/modules; avoid embedding concrete node implementations inside generic graph host files.
- Expose required primitives through DSP scripting host.
- Recreate current looper behavior from primitive composition.
- Keep parity checklist and behavior gates active during migration.

Endpoint rule in this phase:

- Define `/looper/*` behavior endpoints directly in Lua (`ctx.params.register`) where possible.
- Keep C++ alias/remap handling as temporary migration scaffolding only.

This phase follows `docs/LOOPER_DECOMPOSITION_AND_RENAME_PLAN.md` as the detailed execution guide.

## Phase 4 - Standalone Validation With User

After headless IPC validation is solid:

- build standalone,
- run collaborative user-level behavior checks,
- verify real-world workflow remains stable.

Standalone testing happens after headless confidence, not before.

## Phase 5 - Return to Editor Plan Completion

After decomposition reaches parity:

- continue editor/parent UI roadmap,
- implement deeper authoring workflows,
- progress round-trip and persistence goals.

This phase follows `docs/EDITOR_PARENT_UI_DEVELOPMENT_PLAN.md`.

## Cutover Completion Criteria Addendum

Before considering the decomposition track complete:

- Legacy looper policy branches in processor monolith paths are removed or bypassed.
- Host runtime remains in C++ but is product-neutral in naming/responsibility.
- Script-defined looper behavior is the default behavior source of truth.

## Mandatory Testing and Debugging Protocol

## 1) No Custom Test Build Targets for Feature Work

Do not create ad hoc custom test binaries/harnesses for this workstream.

Use existing approved path:

- `LooperHeadless`
- socket IPC
- `tools/looper-cli`

Reason: avoid codebase pollution and unrealistic test paths.

## 2) IPC-First Observability

If a parameter/state needed for debugging is not observable via IPC/CLI:

1. add it to IPC/endpoint surfaces,
2. verify via `looper-cli`,
3. continue debugging using that surfaced state.

Do not bypass observability by introducing throwaway custom harnesses.

## 3) Build and Test Sequence

1. Build and run `LooperHeadless`.
2. Execute regression/smoke checks through IPC/CLI.
3. Iterate until headless checks are stable.
4. Build standalone and run final interactive checks with user.

## Operational Notes (Reference)

Typical CLI usage for introspection/control:

```bash
tools/looper-cli state
tools/looper-cli watch
tools/looper-cli diagnose
tools/looper-cli ui /absolute/path/to/ui.lua
```

Raw commands are also available through CLI pass-through (examples):

```bash
tools/looper-cli "GET /looper/graph/enabled"
tools/looper-cli "SET /looper/graph/enabled 1"
tools/looper-cli "GET /dsp/osc/freq"
```

## Phase Exit Criteria

Phase 1 exit:

- shared shell/header is active across core views,
- settings navigation works from every view,
- global controls function correctly.

Phase 2 exit:

- headless IPC regression matrix passes,
- no graph lifecycle regressions on view switching.

Phase 3 exit:

- primitive composition reaches looper parity targets,
- decomposition checklist passes.

Phase 4 exit:

- standalone validation with user passes for target flows.

Phase 5 completion criteria are defined in editor plan doc.
