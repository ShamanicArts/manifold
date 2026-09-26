# Checkpoint 78 · first-selection host audit

The [playable FX tails view](http://127.0.0.1:4173/?primitive=standalone-fx-routing) matches an **isolated old C++ node route**, not the complete old plug-in's runtime swap. This distinction matters at the first selection of a new effect.

Source path through the old checkout:

1. `UserScripts/projects/Main/lib/fx_slot.lua`: `ensureInstance` creates an effect and Gain gate at target zero, connects it, and `applySelection` sets the selected gate target to one.
2. `UserScripts/projects/Main/lib/parameter_binder.lua`: FX1 and FX2 type parameters set `deferGraphMutation = true` (around lines 1313–1316); dynamic slots do too (around line 1127).
3. `manifold/primitives/scripting/dsp_host/DSPHostDeferredMutation.cpp`: the deferred mutation invokes the Lua callback, then `compileRuntimeAndRequestSwap` builds a new graph runtime from the previous one.
4. `manifold/primitives/scripting/GraphRuntime.cpp`: runtime `prepare` calls `prepare` on every compiled node. Explicit continuity state is captured from the old runtime and restored after preparation when node type, role, ports, and continuity ID or index match.
5. `dsp/core/nodes/GainNode.cpp`: `prepare` sets current gain to target gain. `StereoDelayNode` implements explicit continuity; `ChorusNode` has no explicit continuity override.

**Inference:** the first visit can have an immediately open new gate after runtime compilation, rather than the 10 ms gate fade in our prepared fixture. Graph recompilation can also affect unvisited and visited kernel state, depending on explicit continuity and node ordering. A later return to an already created effect uses the same deferred host path, so whether its tail survives must be checked through that path too. The existing isolated fixture correctly tests the old C++ node routing arithmetic under prepared persistent processing; it is insufficient evidence for full plug-in tail behavior.

Decision: keep the v2 persistent route as an explicit experiment, preserve its deterministic isolated C++ reference, and label that boundary in the workbench. The next parity gate is a headless capture of the old Lua → deferred mutation → GraphRuntime swap path with Delay → Chorus → Delay, recording first-block gate samples, continuity-transfer count, and returning-tail samples. No Rust DSP behavior is changed by this audit.
