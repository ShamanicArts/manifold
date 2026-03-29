# Rack Module Migration Delegation Plan

## Goal

Perform a coordinated, parallel rename/migration of the rack-facing subsystem from node-oriented naming to rack-module-oriented naming.

This is a **same-repo, parallel-by-file-ownership** migration.

We are **not** using separate worktrees/checkouts for this task.
We are **not** restructuring architecture.
We are doing a thorough rename plus required second-order consistency fixes.

## Coordinator Model

The main agent is the coordinator.

Responsibilities:
- assign non-overlapping file ownership to worker agents;
- provide exact rename contract;
- monitor worker panes via `tmux capture-pane`;
- interrupt/re-steer workers if they drift;
- integrate/verify final state.

## Canonical Rename Contract

### Core rack API
- `makeNodeSpec` -> `makeRackModuleSpec`
- `makeNodeInstance` -> `makeRackModuleInstance`
- `makeConnectionDescriptor` -> `makeRackConnection`
- `cloneNodes` -> `cloneRackModules`
- `findNodeIndex` -> `findRackModuleIndex`
- `cellsForNode` -> `cellsForRackModule`

### Registry/spec layer
- `NODE_SPECS` -> `RACK_MODULE_SPECS`
- `nodeSpecs()` -> `rackModuleSpecs()`
- `nodeSpecById()` -> `rackModuleSpecById()`
- `isNodeDeletable()` -> `isRackModuleDeletable()`
- `spliceNode()` -> `spliceRackModule()`
- `insertNodeAtVisualSlot()` -> `insertRackModuleAtVisualSlot()`

### Runtime state / globals
- `_rackNodeSpecs` -> `_rackModuleSpecs`
- `_dragPreviewNodes` -> `_dragPreviewModules`
- `dragState.nodeId` -> `dragState.moduleId`
- `dragState.baseNodes` -> `dragState.baseModules`
- `__midiSynthDynamicNodeSpecs` -> `__midiSynthDynamicModuleSpecs`
- `__midiSynthRackNodeSpecs` -> `__midiSynthRackModuleSpecs`
- `__midiSynthDynamicNodeInfo` -> `__midiSynthDynamicModuleInfo`
- `RACK_SHELL_LAYOUT` -> `RACK_MODULE_SHELL_LAYOUT`

### Shell/component names
- `rack_node_shell.lua` -> `rack_module_shell.lua`
- `rack_node_shell.ui.lua` -> `rack_module_shell.ui.lua`
- `RackNodeShell` -> `RackModuleShell`
- `rack_node_shell` import path -> `rack_module_shell`

### Rack state / connection shape
- `rackState.nodes` -> `rackState.modules`
- `state.nodes` -> `state.modules`
- `ctx._rackState.nodes` -> `ctx._rackState.modules`
- `from.nodeId` -> `from.moduleId`
- `to.nodeId` -> `to.moduleId`
- rack endpoint refs using `nodeId` become `moduleId` where they refer to rack modules

## Non-goals

Do **not** rename these:
- `RuntimeNode`
- `PrimitiveNode`
- DSP graph node terminology
- non-rack node terminology outside the rack subsystem

Do **not** do speculative architecture work.
Do **not** invent aliases just to preserve old names.
Do **not** add worktree/checkouts.

## File Ownership

Each worker owns only the files assigned below.
No worker edits files owned by another worker.

### Worker A: core rack model
Owns:
- `UserScripts/projects/Main/ui/behaviors/rack_layout.lua`
- `UserScripts/projects/Main/ui/tests/test_rack_layout.lua`

Responsibilities:
- rename core rack constructors/helpers;
- migrate rack state schema in this layer from `nodes` to `modules`;
- update tests accordingly;
- keep functionality unchanged.

### Worker B: rack specs / registry
Owns:
- `UserScripts/projects/Main/ui/behaviors/rack_midisynth_specs.lua`
- `UserScripts/projects/Main/lib/modulation/providers/parameter_targets.lua`
- `UserScripts/projects/Main/lib/modulation/providers/rack_sources.lua`
- `UserScripts/projects/Main/lib/modulation/rack_control_router.lua`

Responsibilities:
- rename spec registry terms;
- migrate connection endpoint shape in this layer to `moduleId`;
- update rack-module lookup APIs;
- keep behavior unchanged.

### Worker C: patchbay / wire layer
Owns:
- `UserScripts/projects/Main/ui/behaviors/rack_wire_layer.lua`
- `UserScripts/projects/Main/lib/ui/patchbay_generator.lua`
- `UserScripts/projects/Main/lib/ui/patchbay_runtime.lua`
- `UserScripts/projects/Main/ui/components/patchbay_panel.lua`
- `UserScripts/projects/Main/lib/ui/rack_mod_popover.lua`
- `UserScripts/projects/Main/lib/ui/init_controls.lua`

Responsibilities:
- migrate patchbay and wire code from rack `nodeId`/`nodes` usage to rack `moduleId`/`modules` usage where applicable;
- update any references to renamed rack APIs;
- keep routing behavior unchanged.

### Worker D: shell/components
Owns:
- `UserScripts/projects/Main/ui/components/rack_node_shell.lua`
- `UserScripts/projects/Main/ui/components/rack_node_shell.ui.lua`
- `UserScripts/projects/Main/ui/components/rack_container.lua`
- `UserScripts/projects/Main/ui/components/midisynth_view.ui.lua`

Responsibilities:
- rename shell files and imports;
- rename `RackNodeShell` to `RackModuleShell`;
- update user-facing comments/labels if needed to reflect rack module terminology;
- keep UI structure unchanged.

### Worker E: runtime integration
Owns:
- `UserScripts/projects/Main/ui/behaviors/midisynth.lua`
- `UserScripts/projects/Main/ui/behaviors/filter.lua`
- `UserScripts/projects/Main/ui/behaviors/eq.lua`
- `UserScripts/projects/Main/ui/behaviors/fx_slot.lua`
- `UserScripts/projects/Main/editor/runtime_state.lua`
- `UserScripts/projects/Main/lib/rack_audio_router.lua`
- `UserScripts/projects/Main/lib/ui/rack_controller.lua`
- `UserScripts/projects/Main/lib/ui/update_sync.lua`
- `UserScripts/projects/Main/dsp/main.lua`

Responsibilities:
- update runtime state usage to new rack-module naming;
- update shell layout map naming;
- migrate dynamic spec/info globals;
- update all integration points to renamed APIs and state/connection shape;
- keep behavior unchanged.

## Operational Rules For Workers

1. Stay inside owned files only.
2. Do not refactor unrelated logic.
3. Do not change behavior intentionally.
4. If a rename affects an external symbol owned by another worker, note it clearly in final report instead of freelancing into their files.
5. Report:
   - files changed
   - exact rename work completed
   - any unresolved cross-file dependency
   - any risk/hotspot

## Suggested tmux Windows

Using existing `Manifold` session:
- window 3: coordinator
- window 4: Worker A
- window 5: Worker B
- window 6: Worker C
- window 7: Worker D
- window 8: Worker E

## Monitoring

Coordinator monitors workers via:
- `tmux capture-pane -p -t Manifold:4`
- `tmux capture-pane -p -t Manifold:5`
- `tmux capture-pane -p -t Manifold:6`
- `tmux capture-pane -p -t Manifold:7`
- `tmux capture-pane -p -t Manifold:8`

Coordinator may interrupt drifting workers with:
- `tmux send-keys -t Manifold:<window> C-c`

## Acceptance Criteria

- rack subsystem consistently uses rack-module naming;
- rack state uses `modules` instead of `nodes`;
- rack connection endpoints use `moduleId` instead of `nodeId` where they refer to rack modules;
- shell/component naming updated to `rack_module_shell` / `RackModuleShell`;
- tests updated;
- no intentional logic changes;
- code builds or at minimum loads coherently enough for follow-up integration/build verification.

## Inventory Reference

Detailed rename inventory generated at:
- `/tmp/rack_module_migration_inventory.md`
