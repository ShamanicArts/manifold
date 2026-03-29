# Rack Module Swarm-0 Plan

## Goal

Swarm-0 exists to prove that the hardened rack module factory can support **parallel module implementation** without uncontrolled shared-file stomping, runtime interference, or contract drift.

This swarm is **not** about maximum throughput.
It is about proving the method with five simple deterministic modules.

---

## Roles

- **5 Kimi builders** implement modules in isolated tmp JJ workspaces.
- **Coordinator** runs from the main workspace, prepares prompts, launches workers, monitors them in tmux, performs first-pass validation, applies any central integration, and keeps the process on the rails.
- **User** performs final human review by visiting each JJ workspace/result directly.

Coordinator responsibilities:
- create tmp JJ workspaces;
- create tmux windows;
- launch pi in each workspace and feed the worker prompt;
- monitor worker chat/progress;
- redirect drift;
- reject unrelated or overbroad shared-file edits;
- do first-pass validation;
- prepare results for user review.

---

## Swarm-0 Module Set

Builders are assigned one module each.
All modules are deliberately small, deterministic, and low-state.

1. **Velocity Mapper** — VOICE -> VOICE
2. **Scale Quantizer** — VOICE -> VOICE
3. **Note Filter / Key Range** — VOICE -> VOICE
4. **Attenuverter / Bias** — scalar -> scalar
5. **Clamp / Range Mapper** — scalar -> scalar

Out of scope for Swarm-0:
- Glide / Portamento
- LFO
- Sample & Hold
- Chord / Harmonizer
- Humanizer
- any stateful clocked or timing-heavy module

---

## Swarm-0 UI Rules

All Swarm-0 modules follow the same deliberately boring rules:

- **1x1 only**
- **minimal controls only**
- **no custom graph widgets**
- **no shell customization**
- **no nested layout weirdness**
- **patch and performance semantics must match**
- **modulatable controls must obey base/effective overlay rules**
- **all coordinates use `math.floor()`**

This swarm is about proving the factory, not inventing bespoke UI snowflake bullshit.

---

## Ownership Rules

### Worker-owned vertical slice

Each builder owns the full end-to-end vertical slice for their assigned module.
That includes the module-local files **and** the minimal shared integration needed to make the module actually appear in the rack palette and spawn into the rack.

Allowed module-local files:

- `UserScripts/projects/Main/lib/<module>_runtime.lua`
- `UserScripts/projects/Main/ui/behaviors/<module>.lua`
- `UserScripts/projects/Main/ui/components/<module>.ui.lua`
- optional module-local tests

Allowed shared integration files, but **only for module-specific edits**:

- `UserScripts/projects/Main/ui/behaviors/rack_midisynth_specs.lua`
- `UserScripts/projects/Main/lib/ui/rack_module_factory.lua`
- `UserScripts/projects/Main/ui/behaviors/midisynth.lua`
- `UserScripts/projects/Main/ui/components/midisynth_view.ui.lua` when palette/nav UI has fixed widgets and the module needs a real card/button to be reachable
- `UserScripts/projects/Main/lib/parameter_binder.lua` when the module genuinely needs binder support
- `UserScripts/projects/Main/lib/modulation/runtime.lua` for scalar/control module routing support only

Forbidden:

- unrelated cleanup in shared files
- refactors outside the assigned module’s path to working end-to-end behavior
- edits for other workers’ modules
- broad factory redesign during the swarm

The rule is not “never touch shared files.”
The rule is “touch shared files only in the narrow blocks required for your assigned module to work end to end.”

---

## Runtime Access Rules

Only the **coordinator** may use:

- shared runtime / IPC;
- the running standalone instance;
- tmux runtime/build windows assigned to the shared Manifold app workflow.

Builders do **not**:
- use IPC;
- restart the app;
- build the app;
- use shared runtime tmux windows.

Builders are limited to local static validation only.

---

## Validation Rules

Builder-local validation is limited to:

- `luac -p <file>`
- `rg`
- safe local checks

Builders must **not** run builds.

Coordinator does first-pass validation after handoff.
User performs final review in JJ.

---

## Intervention Policy

### Default policy: steer, don’t overreact

If a worker drifts a bit, coordinator redirects them and narrows scope.

Examples:
- drifting into a nearby non-owned file;
- widening the brief unnecessarily;
- overbuilding a module UI;
- inventing extra semantics not in the brief.

### Hard-stop only when necessary

Coordinator should stop or pause a worker only for real problems:
- forbidden central-file edits after correction;
- shared runtime use;
- architecture freelancing;
- output becoming clearly unsafe to integrate.

---

## Success Condition

Swarm-0 succeeds if:

- all 5 modules are implemented in isolated tmp JJ workspaces;
- process discipline holds;
- shared-file edits stay narrow, module-scoped, and reviewable;
- modules fit the factory contract cleanly;
- each module appears in the palette and can be spawned into the rack from its own commit;
- user can review each result directly in JJ;
- the swarm method looks repeatable for future batches.

---

## JJ Workspace Model

We are using **tmp JJ workspaces per agent**.
No bookmarks are required.
No separate clone is required.

### Suggested tmp root

```bash
mkdir -p /tmp/my-plugin-swarm-0
```

### Capture the exact revision all workspaces should start from

This is **not** a bookmark. It is just the exact revision string used for workspace creation.

```bash
BASE_REV=$(jj log -r @ --no-graph -T 'change_id.short() ++ "\n"')
printf '%s\n' "$BASE_REV"
```

### Create all five workspaces

```bash
jj workspace add /tmp/my-plugin-swarm-0/kimi-a-velocity-mapper --name kimi-a-velocity-mapper -r "$BASE_REV"
jj workspace add /tmp/my-plugin-swarm-0/kimi-b-scale-quantizer --name kimi-b-scale-quantizer -r "$BASE_REV"
jj workspace add /tmp/my-plugin-swarm-0/kimi-c-note-filter --name kimi-c-note-filter -r "$BASE_REV"
jj workspace add /tmp/my-plugin-swarm-0/kimi-d-attenuverter-bias --name kimi-d-attenuverter-bias -r "$BASE_REV"
jj workspace add /tmp/my-plugin-swarm-0/kimi-e-range-mapper --name kimi-e-range-mapper -r "$BASE_REV"
```

### Inspect workspaces

```bash
jj workspace list
```

### Navigate to a workspace

```bash
cd /tmp/my-plugin-swarm-0/kimi-a-velocity-mapper
jj st
```

The user will later review results by going directly into the relevant workspace and inspecting JJ from there.

---

## tmux Topology

Use the existing `Manifold` session.
Windows `0:1` and `0:2` remain reserved for the shared runtime/build workflow.

### Swarm windows

- `Manifold:3` — coordinator
- `Manifold:4` — Kimi A / Velocity Mapper
- `Manifold:5` — Kimi B / Scale Quantizer
- `Manifold:6` — Kimi C / Note Filter
- `Manifold:7` — Kimi D / Attenuverter-Bias
- `Manifold:8` — Kimi E / Range Mapper

### Create windows if needed

```bash
tmux new-window -t Manifold -n coord
tmux new-window -t Manifold -n kimi-a
tmux new-window -t Manifold -n kimi-b
tmux new-window -t Manifold -n kimi-c
tmux new-window -t Manifold -n kimi-d
tmux new-window -t Manifold -n kimi-e
```

If those windows already exist, reuse them.

### Navigate each window to its workspace

```bash
tmux send-keys -t Manifold:kimi-a 'cd /tmp/my-plugin-swarm-0/kimi-a-velocity-mapper' Enter
tmux send-keys -t Manifold:kimi-b 'cd /tmp/my-plugin-swarm-0/kimi-b-scale-quantizer' Enter
tmux send-keys -t Manifold:kimi-c 'cd /tmp/my-plugin-swarm-0/kimi-c-note-filter' Enter
tmux send-keys -t Manifold:kimi-d 'cd /tmp/my-plugin-swarm-0/kimi-d-attenuverter-bias' Enter
tmux send-keys -t Manifold:kimi-e 'cd /tmp/my-plugin-swarm-0/kimi-e-range-mapper' Enter
```

### Monitoring output

Do **not** use head/tail on tmux capture.
The project instructions explicitly say not to obfuscate shell state that way.

---

## Workflow correction / retrospective note

Initial Swarm-0 prompting treated palette/factory/spec registration as coordinator-owned central follow-up.
That was wrong for end-to-end rack module delivery.
It produced worker commits that could implement runtimes and UI but still could not be reviewed as real spawnable rack modules.

Correct workflow for future parallel rack-module swarms:

- each worker owns a **reviewable vertical slice**;
- the worker commit must contain whatever shared-file edits are required for that module to:
  - exist as a rack spec,
  - appear in the palette,
  - have any fixed palette/nav UI widgets it requires,
  - allocate/register through the dynamic factory,
  - and spawn into the rack;
- coordinator should only step in for cross-module conflicts, true shared-contract redesign, or post-swarm merge cleanup;
- if multiple workers touch the same shared file, that is acceptable as long as each change is module-scoped and easy to reconcile later.

If a module cannot be tested from its own change, the ownership model is wrong.

### Shared failure modes observed in the first Swarm-0 delivery

These are now explicit lessons, not vague vibes:

1. **False-positive end-to-end claims**
   - Workers claimed palette integration after touching specs/factory/runtime, but the module still lacked the fixed palette UI widget or actual spawn wiring.
   - Fix: verify literal IDs and actual `jj show --name-only` results instead of trusting prose handoffs.

2. **Palette integration is hardcoded in multiple places**
   - The system currently requires coordinated module-scoped edits across:
     - `rack_midisynth_specs.lua`
     - `rack_module_factory.lua`
     - `midisynth.lua`
     - `midisynth_view.ui.lua`
   - Some modules also need `modulation/runtime.lua`.
   - Fix: future worker prompts must list all of those potential touchpoints explicitly.

3. **Fixed palette/nav UI was easy to miss**
   - Adding `M._PALETTE_ENTRIES` was not enough because `midisynth_view.ui.lua` contains fixed nav buttons and palette cards.
   - Adding the fixed UI widget was still not enough unless `midisynth.lua` also included nav button maps, visibility/layout entries, and `bindButton()` hooks.

4. **Shared nav behavior was another hidden integration site**
   - Voice/mod/fx palette additions sometimes also needed updates to:
     - `_paletteBrowseEntryButtonMap()`
     - nav item layout lists
     - section collapse defaults
     - section toggle bindings
     - button selection bindings

5. **Methodology violations still matter**
   - One worker used forbidden `sed -i` editing during the fixup cycle.
   - Fix: continue enforcing file-edit discipline even inside worker sessions.

### Main-repo remediation work completed after worker review

The coordinator-side cleanup in the real repo has now established a clearer checklist for future factory/parallel work.

#### Velocity Mapper
- Added missing real palette/browser registration in `midisynth.lua` so the fixed card was backed by an actual `_PALETTE_ENTRIES` entry, nav mapping, and spawn path.
- Added missing dynamic binder/schema coverage in `parameter_binder.lua` for:
  - `/midi/synth/rack/velocity_mapper/<slot>/amount`
  - `/curve`
  - `/offset`
- Fixed downstream voice-target cache behavior so mapped voice amp writes are reasserted when another subsystem stomps the same live path.
- Verified over IPC that runtime state, dynamic module info, and final target params agreed.

#### Scale Quantizer
- Added missing real palette entry in `midisynth.lua`; the fixed UI card/nav button already existed, but the live palette contract did not.
- Added module-specific spawn handling and status text in `midisynth.lua` for `scale_quantizer`.
- Added missing dynamic binder/schema coverage in `parameter_binder.lua` for:
  - `/midi/synth/rack/scale_quantizer/<slot>/root`
  - `/scale`
  - `/direction`
- Fixed dropdown behavior wiring in `ui/behaviors/scale_quantizer.lua` to use the actual widget contract:
  - `setOptions(...)` instead of `setItems(...)`
  - `_onSelect` instead of `_onChange`
  - 1-based dropdown selection mapping instead of raw param indices
- Fixed shared canonical-oscillator ownership/stomp logic in `midisynth.lua` so transformed canonical routes like:
  - `adsr.voice -> scale_quantizer.voice_in -> scale_quantizer.voice -> oscillator.voice`
  are not zeroed every envelope tick by legacy canonical oscillator parity code.
- Verified over IPC that the module can now spawn and register dynamic module info correctly.

#### Additional lessons from Scale Quantizer remediation
- **Tests for routed rack modules must wire the graph explicitly**
  - Spawning a dynamic module proves almost nothing by itself.
  - For control/voice processors, the minimum valid test sequence is:
    1. spawn the module
    2. inspect the resulting module id / dynamic info
    3. wire the intended control/audio edges explicitly
    4. resync rack connections
    5. verify the router now contains the expected route chain
    6. only then test behavior/performance
  - Future agent tests that skip explicit wiring are fake and should be treated as invalid.
- **Canonical oscillator ownership is a separate concern from legacy ADSR parity**
  - The canonical oscillator can be driven through transformed voice routes without being a legacy direct ADSR route.
  - `updateEnvelopes()` must not zero canonical oscillator voice params just because a route is non-legacy; otherwise transformed processors fight a per-tick stomp loop and produce chopped notes plus needless write traffic.
  - Future shared runtime work must distinguish:
    - direct legacy ADSR parity ownership
    - transformed canonical oscillator ownership
    - no canonical oscillator owner at all
- **Shared runtime fixes hidden inside module hotspots must be split at hunk level, not file level**
  - `midisynth.lua` is a shared hotspot touched by multiple module lines of work.
  - Moving an entire file diff to another commit can drag unrelated module integration hunks and create pointless rewrite fallout.
  - When a module investigation reveals a shared runtime bug, extract only the exact shared hunk into the lower/runtime lineage.

#### Attenuverter / Bias
- Added the missing real palette/browser registration in `midisynth.lua`; the fixed card already existed in `midisynth_view.ui.lua`, but without a `_PALETTE_ENTRIES` entry the live palette layout/drag contract ignored it and the card could render displaced/outside the browser.
- Added module-specific spawn handling and status text in `midisynth.lua` for `attenuverter_bias`.
- Added missing dynamic binder/schema coverage in `parameter_binder.lua` for:
  - `/midi/synth/rack/attenuverter_bias/<slot>/amount`
  - `/bias`
- Verified over IPC that the module now spawns, registers dynamic module info, and publishes live params correctly.
- Verified intended runtime behavior: this module is currently a scalar control transform (`in -> out`), not a voice-bundle transform, and computes `clamp((in * amount) + bias, -1, 1)`.

#### Additional lesson from Attenuverter / Bias remediation
- **A visible palette card is not proof of real palette integration**
  - Static UI cards/buttons in `midisynth_view.ui.lua` can exist while the live palette contract in `midisynth.lua` is still missing.
  - If `_PALETTE_ENTRIES`, spawn handling, availability checks, and drag wiring are absent, the card can look present but behave like broken decorative bullshit.
- **Domain expectations must be explicit**
  - `attenuverter_bias` currently lives in the scalar modulation domain, not the voice domain.
  - Feeding it `adsr.voice`/voice bundles is the wrong mental model; the obvious working inputs today are scalar sources like `adsr.env` and `adsr.inv`.
  - Future module surfacing should make this obvious in naming/copy/categorying so users are not left guessing what the fuck is supposed to go into it.
- **The current scalar patch ecosystem is too thin**
  - In practice, there are too few obvious scalar rack sources, so `attenuverter_bias` feels stranded even when working correctly.
  - This is a product/integration problem, not just a user-education problem.
- **Scope choice likely needs revisiting**
  - `attenuverter_bias` is currently modeled as a global scalar processor.
  - When fed voice-scoped scalar sources, the system aggregates before applying, which is probably not what users expect from a modulation utility in a poly rack.
  - If the intended role is poly modulation shaping, this should likely become voice-scoped rather than global-scoped.

#### Range Mapper
- Fixed dynamic slot bookkeeping in `rack_module_factory.lua` so Range no longer falls into fake "Unavailable"/non-draggable states:
  - `nextAvailableSlot()` now treats `false` as free
  - `createDynamicSpawnMeta()` no longer pre-marks slots with `false`
- Added missing dynamic binder/schema coverage in `parameter_binder.lua` for:
  - `/midi/synth/rack/range_mapper/<slot>/min`
  - `/max`
  - `/mode`
- Added explicit palette status text in `midisynth.lua` so the browser no longer falls back to the generic misleading "Unavailable" message.
- Fixed missing patch-view/back-of-rack param remap in `rack_midisynth_specs.lua`:
  - `/midi/synth/rack/range_mapper/__template/min -> /min`
  - `/max -> /max`
  - `/mode -> /mode`
- Verified over IPC that:
  - palette spawn worked
  - delete + respawn reused slot 1 correctly
  - front-panel params worked
  - back-of-rack patch-view params now hit the real instance paths instead of dead `__template` paths

#### Additional lessons from Range Mapper remediation
- **Dynamic module parameter integration is a three-surface contract**
  - For dynamic rack modules, parameter support is not complete until all three surfaces agree:
    1. module/front behavior reads and writes the live instance `paramBase`
    2. `parameter_binder.lua` has schema entries for every dynamic instance path
    3. `rack_midisynth_specs.lua` remaps every patch-view `__template` param path onto the live instance base
  - If any one of those is missing, you get split-brain behavior where one surface works and another silently talks to dead paths.
- **`dynamic_param_base` requires explicit remap coverage**
  - If a spec uses `paramTemplateMode = "dynamic_param_base"` and its params are authored as `__template` paths, factory work is incomplete until `MODULE_PARAM_REMAP_DEFAULTS` has exact/pattern rules for those params.
  - Future module reviews should treat missing remap rules as a blocking integration bug, not a follow-up polish item.
- **Validate spawn/delete/respawn, not just first spawn**
  - The Range bug only looked like a palette issue on the surface; the real failure was bad slot reservation semantics inside the factory.
  - Future factory changes should always be smoke-tested with an IPC loop that does: spawn -> inspect dynamic info -> delete -> respawn -> verify slot reuse.
- **Patch view is a first-class integration surface**
  - It is not enough for the front panel to work.
  - Future factory/module acceptance criteria must explicitly include back-of-rack param editing, because that is where dead template-path wiring shows up immediately.

#### Note Filter
- Added missing dynamic binder/schema coverage in `parameter_binder.lua` for:
  - `/midi/synth/rack/note_filter/<slot>/low`
  - `/high`
  - `/mode`
- Added explicit palette status text in `midisynth.lua` so the browser no longer falls back to misleading generic availability behavior.
- Fixed a bad legacy/runtime interaction in `midisynth.lua`:
  - direct ADSR -> oscillator parity writes must only run for true legacy direct routes
  - transformed voice chains like `ADSR -> Note Filter -> Oscillator` must not be stomped by raw ADSR amp writes
- Fixed trigger-route detection so transformed oscillator voice routes still count as valid trigger paths even when legacy direct parity is disabled.
- Verified over IPC that:
  - the rack graph was `adsr.voice -> note_filter.voice_in -> note_filter.voice -> oscillator.voice`
  - blocked notes drove oscillator amp/gate to `0`
  - allowed notes passed normally

#### Factory-level correction reaffirmed
- Dynamic slot reservation must not poison availability:
  - `nextAvailableSlot()` must treat `false` as free
  - `createDynamicSpawnMeta()` must not pre-mark slots as occupied
- This was required again during quantizer cleanup and should be treated as a standing factory invariant.

#### Additional lesson from Note Filter remediation
- **Trigger eligibility and legacy parity are separate concerns**
  - The system previously conflated:
    - "is there any valid route to an oscillator voice target?"
    - "should old direct ADSR amp parity writes run?"
  - That coupling broke transformed voice modules: first they were being stomped by legacy parity, then after tightening parity logic they stopped triggering at all.
  - Future factory/runtime work must keep these concepts separate:
    - one check for whether a route exists and note triggering should be allowed
    - a different, narrower check for whether legacy compatibility writes should run

Use full pane capture instead:

```bash
tmux capture-pane -p -t Manifold:kimi-a
tmux capture-pane -p -t Manifold:kimi-b
tmux capture-pane -p -t Manifold:kimi-c
tmux capture-pane -p -t Manifold:kimi-d
tmux capture-pane -p -t Manifold:kimi-e
```

### Interrupt a drifting worker

```bash
tmux send-keys -t Manifold:kimi-c C-c
```

---

## Launching pi + Kimi In Each Workspace

The coordinator launches pi inside each agent workspace and uses the rendered worker prompt.

### Important

We are **not** assuming some fake universal CLI flag set for pi here.
Use the locally working pi launch method already used in your environment.
The invariant is:

1. open the correct workspace shell;
2. launch `pi` from inside that workspace;
3. choose the Kimi provider/profile already configured locally;
4. paste the rendered worker prompt;
5. wait for the worker to summarize the brief;
6. send `GO`.

### Expected launch flow per worker

```bash
cd /tmp/my-plugin-swarm-0/kimi-a-velocity-mapper
pi
```

Inside pi:
- select the configured Kimi integration/profile (for example the local Kimi coding profile you already use);
- paste the rendered prompt from `/tmp/rack_module_swarm_prompts/1_kimi-a.txt`;
- wait for acknowledgement;
- reply with `GO`.

Repeat for B–E.

### If you want to inspect the prompt in-shell first

```bash
cd /tmp/my-plugin-swarm-0/kimi-a-velocity-mapper
python - <<'PY'
from pathlib import Path
print(Path('/tmp/rack_module_swarm_prompts/1_kimi-a.txt').read_text())
PY
pi
```

The important part is the content, not pretending we know a universal pi non-interactive flag layout.

---

## Worker Prompt Protocol

Every worker follows a two-step protocol.

### Step 1 — Read and summarize only
Coordinator sends the prompt.
Worker must summarize:
- owned files;
- hard constraints;
- module goal;
- first implementation steps.

Worker must **not** edit files yet.

### Step 2 — GO
Coordinator replies:

```text
GO.
Stay inside owned files.
No central edits.
Report coordinator registration needs explicitly.
```

Only then may the worker edit files.

---

## Required Builder Handoff (via chat)

Builders report back in chat with:

1. files changed
2. implementation summary
3. validation run
4. coordinator registration needed
5. unresolved issue / risk

No separate file handoff is required for Swarm-0.
Coordinator monitors chat in tmux and handles next steps.

---

## Coordinator Review Flow

For each completed worker:

1. capture the worker pane;
2. read the handoff in chat;
3. go to the worker workspace;
4. inspect `jj diff` / changed files locally;
5. perform first-pass validation;
6. apply any coordinator-owned central registration in the coordinator workspace if the result is worth integrating;
7. leave the final human review to the user in JJ.

---

## Coordinator Quick Commands

### Check workspace status

```bash
cd /tmp/my-plugin-swarm-0/kimi-a-velocity-mapper
jj st
jj diff --name-only
```

### Return to main workspace

```bash
cd /home/shamanic/dev/my-plugin
jj st
```

### Inspect worker result from coordinator shell

```bash
cd /tmp/my-plugin-swarm-0/kimi-d-attenuverter-bias
jj diff --name-only
```

### See all workspaces

```bash
jj workspace list
```

---

## Non-goals

This plan does **not** cover:
- final landing strategy for merged production history;
- larger multi-state module swarms;
- runtime-heavy modules like LFO or Glide;
- automatic coordinator tooling.

Swarm-0 is intentionally narrow.
