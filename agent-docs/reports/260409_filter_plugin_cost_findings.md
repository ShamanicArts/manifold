# Manifold Filter Plugin Cost Findings

Date: 2026-04-09
Scope: `Manifold Filter` export plugin cost attribution work
Status: Findings documented; next work deferred

## Goal

Determine the actual shipped/runtime cost of the filter plugin itself, not host noise.

Specifically:
- **RAM** cost attributable to the plugin
- **GPU/VRAM** cost actually owned by the plugin
- **CPU** cost attributable to plugin DSP/UI
- identify which subsystem is responsible for the plugin's retained memory

This work explicitly moved away from misleading host-level totals and toward **plugin-attributable deltas**.

---

## High-Level Outcome

The filter plugin's meaningful cost is currently approximately:

- **Plugin Delta PSS:** ~89 MB
- **Plugin Delta Private Dirty:** ~42.8 MB
- **Plugin Delta Heap:** ~23.6 MB

The dominant contributor is the **UI/runtime side**, not DSP and not Lua heap.

Current UI-attributable deltas:

- **UI Delta PSS:** ~69.8 MB
- **UI Delta Private Dirty:** ~30.5 MB
- **UI Delta Heap:** ~19.2 MB

The most important conclusion from the deeper instrumentation pass is:

> The missing memory is **not** the RuntimeNode tree, display lists, render snapshots, endpoint registry, shell row data, GPU allocations, DSP, or ImGui CPU internals.
>
> The remaining likely culprit is **framework/native allocations around JUCE/OpenGL/backend state and/or allocator retention caused by steady-state rendering**.

---

## Measurement Approach

### What was considered useful

Measurements were shifted toward plugin-attributable signals:

- process PSS / Private Dirty deltas relative to plugin lifecycle baselines
- heap / arena deltas
- UI-open and UI-idle deltas
- plugin-owned GPU resources only
- DSP timing from `processBlock`
- category-specific retained data structure accounting

### What was determined to be misleading or host-contaminated

The following were found to be poor primary optimization targets:

- raw host RSS
- raw host total mmap
- Mesa / Gallium giant anonymous GPU mappings
- host-driven glibc arena counts in large DAW processes
- DAW-wide process state that existed before plugin attribution baselines

---

## Important Host/Driver Findings

### 1. Mesa / Gallium GPU mappings were a red herring

A large anonymous mmap total (~3.1–3.5 GB) was observed in AudioPluginHost.

This turned out to be:
- Mesa Gallium / GL driver preallocation / GPU-visible mapping behavior
- not CPU heap owned by the plugin
- not useful as a plugin memory metric

Observed evidence:
- very large anonymous mappings appeared in `/proc/self/maps`
- process RSS remained tiny while those mappings existed
- driver and GL/Mesa libraries were present (`libgallium`, `libGLX_mesa`, DRM libs)

Conclusion:
- mmap totals in that form were **not a useful plugin RAM metric**
- plugin-owned GPU accounting had to be measured explicitly instead

### 2. Host allocator state is heavily contaminated by host behavior

Arena count readings in DAW/host contexts were dominated by host threading and allocator behavior, not just plugin behavior.

This made raw arena count interesting as background context but poor as a direct optimization target for plugin-owned memory.

---

## Trustworthy Current Plugin Numbers

These values were read from live OSCQuery endpoints after the deep attribution work.

### Plugin-attributable totals
- **Plugin Delta PSS:** `89.0088 MB`
- **Plugin Delta Private Dirty:** `42.8086 MB`
- **Plugin Delta Heap:** `23.5637 MB`

### UI-attributable totals
- **UI Delta PSS:** `69.7666 MB`
- **UI Delta Private Dirty:** `30.5039 MB`
- **UI Delta Heap:** `19.2090 MB`

### DSP cost
- **DSP Avg:** `64 us`
- **DSP Peak:** `579 us`

### Lua heap
- **Lua Heap:** ~`1.38 MB` (earlier reads consistently ~1.1–1.8 MB)

### Plugin-owned GPU resources
- **GPU Total:** `1 MB`
- almost entirely the ImGui font atlas

Interpretation:
- DSP is cheap
- Lua heap is cheap
- plugin-owned GPU memory is cheap
- the remaining cost is native/UI/runtime/framework-side

---

## Lifecycle Delta Findings

Lifecycle snapshots were added relative to plugin construction baseline.

### After Lua VM init
- **PSS Delta:** `15.0898 MB`
- **Private Dirty Delta:** `9.33984 MB`

### After bindings registration
- **PSS Delta:** `16.2188 MB`
- **Private Dirty Delta:** `9.65625 MB`

### After script load
- **PSS Delta:** `19.2422 MB`
- **Private Dirty Delta:** `12.3047 MB`

### After DSP boot
- **PSS Delta:** `13.9102 MB`
- **Private Dirty Delta:** `9.29688 MB`

### After UI open
- **PSS Delta:** `19.2422 MB`
- **Private Dirty Delta:** `12.3047 MB`

### After UI idle settle
- **PSS Delta:** `48.9980 MB`
- **Private Dirty Delta:** `12.9336 MB`

### Interpretation

The crucial observation is that:
- Lua VM init and bindings add some real cost (~9–10 MB private dirty)
- script load adds only a few more MB
- the large growth is **not** from obvious script/UI model load
- the big rise happens **after the UI has been alive and idling**

This strongly suggests steady-state framework/backend/runtime effects rather than just retained model data.

---

## Deep Category Breakdown

The following categories were instrumented and exposed via OSCQuery.

### RuntimeNode tree / UI model
- **RuntimeNode Count:** `57`
- **RuntimeNode MB:** `0.0548 MB`
- **Runtime Callback Count:** `385`
- **Runtime UserData Entries:** `159`
- **Runtime UserData MB:** `0.0126 MB`
- **Runtime Payload MB:** `0.0820 MB`

### Compiled display lists
- **DisplayList Count:** `57`
- **DisplayList Commands:** `477`
- **DisplayList MB:** `0.1128 MB`

### Render snapshots / custom surfaces
- **RenderSnapshot Nodes:** `0`
- **RenderSnapshot MB:** `0.00018 MB`
- **CustomSurfaceState MB:** `0`

### Script source
- **Script Source:** `1.618 KB`

### Lua / bridge / registry proxies
- **Lua Global Count:** `138`
- **Lua Registry Entry Count:** `1044`
- **Lua Package Loaded Count:** `33`
- **Lua OSC Path Count:** `0`
- **Lua OSC Callback Count:** `0`
- **Lua OSCQuery Handler Count:** `0`
- **Lua Event Listener Count:** `0`
- **Lua Managed DSP Slot Count:** `0`
- **Lua Overlay Cache Count:** `0`

### Endpoint registry
- **Endpoint Total Count:** `95`
- **Endpoint Path KB:** `2.975 KB`
- **Endpoint Description KB:** `2.975–3.065 KB` range during readings

### DSP bookkeeping
- **DSP Host Count:** `1`
- **DSP Script Source KB:** `2.4785 KB`

### Shell/editor retained host config state (export plugin)
- **Shell ScriptList Rows:** `0`
- **Shell Hierarchy Rows:** `0`
- **Shell Inspector Rows:** `0`
- **Shell Main Editor Text KB:** `0`

### ImGui CPU-side internals
- **ImGui Window Count:** `1`
- **ImGui Table Count:** `0`
- **ImGui Tab Bar Count:** `0`
- **ImGui Viewport Count:** `1`
- **ImGui Font Count:** `1`
- **ImGui Window State MB:** `0.0080 MB`
- **ImGui Draw Buffer MB:** `0.0013 MB`
- **ImGui Internal State MB:** `0.0093 MB`

---

## What Has Been Ruled Out

The following were explicitly instrumented and shown to be too small to explain the missing ~19 MB UI heap delta / ~30 MB UI private delta:

### Not the culprit
- RuntimeNode tree objects
- RuntimeNode callback slots / userdata
- compiled display lists
- render snapshots
- custom GPU surface CPU-side state
- script source text
- Lua callback/event registries
- endpoint registry strings/metadata
- shell/editor row config state (for export plugin)
- plugin-owned GPU memory
- DSP execution cost
- ImGui CPU-side internal state (at least the directly visible internal vectors/state accounted here)

This means the obvious application-level UI model data is **not** the memory pig.

---

## Strongest Remaining Suspects

After the above eliminations, the remaining likely culprits are:

### 1. JUCE / OpenGL / backend native allocations
Likely userland/native memory around:
- GL context support state
- backend caches/state
- persistent platform/renderer objects
- allocations performed after the UI begins steady-state rendering

### 2. Allocator retention / fragmentation from steady-state UI activity
Evidence supporting this possibility:
- memory grows after UI is alive / idling
- model-side structures remain tiny
- growth is consistent with framework/backend allocations becoming retained by allocator state

### 3. sol2/native bridge machinery not visible through current proxies
Although Lua heap and registries were measured, the native C++ side of binding machinery may still contribute more than current proxies reveal.

However, the lifecycle deltas suggest the Lua/binding phase contributes a modest part of private-dirty growth, not the whole problem.

---

## Key Interpretation

The work now supports the following statement with much higher confidence:

> The filter plugin's memory problem is **not** primarily caused by DSP, Lua heap, UI model objects, display lists, or ImGui CPU internals.
>
> The remaining cost appears to live in **native framework/backend allocations and/or allocator-retained memory that appears after the UI enters steady-state rendering**.

That is a much narrower and more useful diagnosis than the original process-total measurements.

---

## Tooling Added During This Work

The export plugin now contains reusable plugin-attributable introspection plumbing for future plugins:

- plugin construction baseline capture
- lifecycle stage delta capture
- UI-open and UI-idle deltas
- DSP timing metrics
- plugin-owned GPU accounting
- RuntimeNode / display list / render snapshot category accounting
- Lua/registry/endpoint category accounting
- OSCQuery exposure for all of the above

This infrastructure should be reusable across future export plugins and is likely more valuable long-term than the specific filter findings.

---

## Requirements for Future Plugins to Support the Same Introspection

To get the same level of plugin-attributable profiling in future export plugins, the following capabilities need to be preserved or added as part of plugin development.

### 1. Standard export runtime contract
Future plugins should continue to use the export-plugin path with:
- `exportPluginConfig_.enabled`
- export UI endpoints under `/plugin/ui/*`
- export parameter aliases under `/plugin/params/*`
- shared `FrameTimings` plumbing via `ControlServer`

This keeps every plugin exposing the same introspection surface over OSC/OSCQuery.

### 2. Lifecycle baseline capture points
Every future plugin should support the same stage snapshots:
- processor construction baseline
- after Lua VM init
- after bindings registration
- after script load
- after DSP boot
- after UI open
- after UI idle settle

These are critical because total process memory is too contaminated by host state. The only useful numbers are **deltas** across plugin lifecycle stages.

### 3. Plugin-attributable endpoint naming convention
Future plugins should expose the same endpoint families so tooling and clients can query them uniformly:

#### Core cost endpoints
- `/plugin/ui/perf/pluginDeltaPssMB`
- `/plugin/ui/perf/pluginDeltaPrivateDirtyMB`
- `/plugin/ui/perf/pluginDeltaHeapMB`
- `/plugin/ui/perf/uiDeltaPssMB`
- `/plugin/ui/perf/uiDeltaPrivateDirtyMB`
- `/plugin/ui/perf/uiDeltaHeapMB`

#### Lifecycle stage endpoints
- `/plugin/ui/perf/afterLuaInitDelta*`
- `/plugin/ui/perf/afterBindingsDelta*`
- `/plugin/ui/perf/afterScriptLoadDelta*`
- `/plugin/ui/perf/afterDspDelta*`
- `/plugin/ui/perf/afterUiOpenDelta*`
- `/plugin/ui/perf/afterUiIdleDelta*`

#### CPU endpoints
- `/plugin/ui/perf/dspCurrentUs`
- `/plugin/ui/perf/dspAvgUs`
- `/plugin/ui/perf/dspPeakUs`
- `/plugin/ui/perf/frameCurrentUs`
- `/plugin/ui/perf/frameAvgUs`
- `/plugin/ui/perf/cpuPercent`

#### GPU endpoints
These must remain **plugin-owned resource** metrics only, not driver/global VRAM totals:
- `/plugin/ui/perf/gpuFontAtlasMB`
- `/plugin/ui/perf/gpuSurfaceColorMB`
- `/plugin/ui/perf/gpuSurfaceDepthMB`
- `/plugin/ui/perf/gpuTotalMB`

#### Deep category endpoints
Future plugins should continue exposing category counters/bytes for:
- RuntimeNode tree
- display lists
- render snapshots
- shell/editor retained config state
- Lua registry / globals / callback counts
- endpoint registry counts/string sizes
- DSP host/source bookkeeping
- ImGui CPU internal state

This consistency is what makes remote support and cross-plugin comparisons practical.

### 4. DSP timing instrumentation in `processBlock`
Each plugin must keep DSP timing captured directly inside `processBlock` (or equivalent processing callback).

This avoids mixing DSP cost with editor/host/UI timing.

Required outputs:
- current block time
- moving average block time
- peak block time

### 5. Explicit plugin-owned GPU accounting
Future plugins must not rely on process mmap or driver totals for GPU metrics.

Instead they should explicitly account for resources the plugin owns, such as:
- font atlas textures
- offscreen color/depth targets
- custom GL surfaces
- any persistent uploaded textures/buffers created by the plugin

If a future plugin uses additional GPU resources (waveform textures, FFT heatmaps, image assets, etc.), those allocations should be counted explicitly and added into `gpuTotalMB`.

### 6. Category-specific retained data accounting
Future plugins should keep estimators for their own retained data structures, especially for any new systems introduced beyond the filter plugin.

Examples:
- node trees
- compiled display lists
- editor-side host row/config caches
- custom runtime caches
- shader payloads / graph payloads
- script source blobs
- lookup tables used by the editor

The key rule is:

> if the plugin owns a persistent data structure, it should have a byte/count estimator exposed over OSCQuery.

### 7. OSCQuery must stay first-class
The current OSCQuery approach is good and should remain standard.

Every future export plugin should:
- expose introspection over OSCQuery by default
- keep endpoints stable and machine-readable
- avoid requiring debugger attachment for routine profiling

This is valuable not only for local development but also for:
- client support
- remote diagnosis
- automated profiling harnesses
- regression testing across plugin versions

### 8. Keep host-noise metrics clearly separated from plugin metrics
Future plugins may still expose raw totals (PSS, Private Dirty, heap, etc.), but they should always be clearly separated from plugin-attributable deltas.

The distinction should remain:
- **Tot** = current process-level measurement
- **Plug** = plugin-attributable delta
- **UI** = editor/runtime-attributable delta

This avoids repeating the earlier confusion with host RSS, GPU driver mappings, and allocator state dominated by the host.

### 9. Add optional experiment toggles for future diagnosis
To make future diagnosis faster, new plugins would benefit from standard optional toggles such as:
- render active / render paused
- overlay visible / hidden
- settings/dev panel open / closed
- `malloc_trim(0)` trigger endpoint for experiments
- optional reduced repaint mode

These should be optional diagnostics controls, not required for normal users.

### 10. Treat introspection as part of the plugin architecture, not a debug afterthought
For future plugins, profiling support should be designed in from the start:
- define which resources the plugin owns
- define how they are counted
- expose them over stable endpoints
- keep naming and stage semantics consistent across plugins

This is the main architectural lesson from the filter investigation.

---

## Recommended Next Steps (Future Work)

Not implemented in this pass, but the most logical next experiments are:

### 1. Render-pause comparison
Measure plugin deltas with:
- UI open + steady-state rendering on
- UI open + rendering paused / throttled

This would test whether backend/render activity is directly responsible for the missing memory.

### 2. `malloc_trim(0)` experiment after UI idle settle
Measure:
- before idle settle
- after idle settle
- after explicit trim

This would separate:
- real persistent native allocations
from
- allocator retention / fragmentation

### 3. Backend-specific accounting if needed
If further narrowing is required:
- JUCE/OpenGL context-side object counts
- renderer backend-specific state counts
- per-host OpenGL attachment/support bookkeeping

---

## Final Bottom Line

The important findings are:

- **Real plugin private cost:** ~`42.8 MB`
- **UI/runtime private contribution:** ~`30.5 MB`
- **DSP is cheap**
- **Lua heap is cheap**
- **GPU ownership is cheap**
- **UI model data is cheap**
- **ImGui internals are cheap**
- **registry/shell/display-list/state tables are cheap**

Therefore, the remaining memory pig is most likely:

> **native framework/backend allocations and/or allocator-retained memory caused by steady-state rendered UI**

That is the clearest current diagnosis.
