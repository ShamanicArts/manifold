# Looper UI Primitive Parity Checklist

This checklist maps `looper/ui/looper_ui.lua` expectations to the primitive-backed DSP stack and compatibility routing added in this branch.

Scope:
- UI target: `looper/ui/looper_ui.lua`
- Primitive script: `looper/dsp/looper_primitives_dsp.lua`
- Compatibility router: `looper/primitives/control/ControlServer.cpp`

## 1. UI Read Contract Parity

The original UI reads values from `state.params[...]` in `normalizeState`.

| UI Read Path | Source in Primitive Path | Status |
|---|---|---|
| `/looper/tempo` | Registered in `looper_primitives_dsp.lua` (`registerPair`) | Verified |
| `/looper/targetbpm` | Registered in `looper_primitives_dsp.lua` and mirrored to tempo logic | Verified |
| `/looper/recording` | Registered in `looper_primitives_dsp.lua` + trigger remap (`rec/stoprec`) | Verified |
| `/looper/overdub` | Registered in `looper_primitives_dsp.lua` | Verified |
| `/looper/mode` | Registered in `looper_primitives_dsp.lua`; numeric + string SET support in `ControlServer.cpp` | Verified |
| `/looper/layer` | Registered in `looper_primitives_dsp.lua` | Verified |
| `/looper/activeLayer` | Registered in `looper_primitives_dsp.lua` | Verified |
| `/looper/forwardArmed` | Registered in `looper_primitives_dsp.lua`; synced/cleared in `ControlServer.cpp` | Verified |
| `/looper/forwardBars` | Registered in `looper_primitives_dsp.lua`; synced/cleared in `ControlServer.cpp` | Verified |
| `/looper/forward` | Registered in `looper_primitives_dsp.lua` (command input) | Verified |
| `/looper/samplesPerBar` | Falls back to UI default where not projected by primitive script | Fallback used |
| `/looper/sampleRate` | Falls back to UI default where not projected by primitive script | Fallback used |
| `/looper/captureSize` | Falls back to UI default where not projected by primitive script | Fallback used |
| `/looper/volume` | Existing global path from host and/or script default path value | Verified |
| `/looper/inputVolume` | Existing host-provided default path in state projection | Verified |
| `/looper/passthrough` | Existing host-provided default path in state projection | Verified |

Notes:
- `looper_ui.lua` now includes primitive-compat normalization fallbacks where primitive state is numeric or missing `voices`.
- The traditional-mode regression (forward length hanging) was fixed by relying on explicit `/forwardArmed` + `/forwardBars` state and clearing them on commit/stoprec paths.

## 2. UI Write/Trigger Contract Parity

The original UI issues `SET`/`TRIGGER` commands on these paths.

| UI Command Path | Primitive Handling | Status |
|---|---|---|
| `SET /looper/tempo` | `normalizePath -> /dsp/looper/tempo` -> `applyTempo` | Verified |
| `SET /looper/targetbpm` | `normalizePath -> /dsp/looper/targetbpm` -> `applyTempo` | Verified |
| `SET /looper/mode` | Numeric or string mode accepted (`ControlServer.cpp` maps strings) | Verified |
| `SET /looper/overdub` | `normalizePath -> /dsp/looper/overdub` | Verified |
| `SET /looper/forward` | Arms forward commit and syncs `/forwardBars` + `/forwardArmed` | Verified |
| `SET /looper/commit` | Commits current layer and clears forward armed state | Verified |
| `SET /looper/layer` | Sets selected layer (backed by primitive script state) | Verified |
| `SET /looper/layer/<i>/volume` | Mapped per-layer primitive `setVolume` | Verified |
| `SET /looper/layer/<i>/speed` | Mapped per-layer primitive `setSpeed` | Verified |
| `SET /looper/layer/<i>/reverse` | Mapped per-layer primitive `setReversed` | Verified |
| `SET /looper/layer/<i>/seek` | Mapped per-layer primitive `seek` | Verified |
| `SET /looper/layer/<i>/mute` | Mapped per-layer primitive `setMuted` | Verified |
| `TRIGGER /looper/rec` | Remapped to `/looper/recording=1` in `ControlServer.cpp` | Verified |
| `TRIGGER /looper/stoprec` | Remapped to `/looper/recording=0` and forward state clear | Verified |
| `TRIGGER /looper/play` | Remapped to `/looper/transport=1` | Verified |
| `TRIGGER /looper/pause` | Remapped to `/looper/transport=2` | Verified |
| `TRIGGER /looper/stop` | Remapped to `/looper/transport=0` | Verified |
| `TRIGGER /looper/clear` | Routed to primitive layer clear-all behavior | Verified |
| `TRIGGER /looper/layer/<i>/play` | Per-layer primitive play | Verified |
| `TRIGGER /looper/layer/<i>/pause` | Per-layer primitive pause | Verified |
| `TRIGGER /looper/layer/<i>/stop` | Per-layer primitive stop | Verified |
| `TRIGGER /looper/layer/<i>/clear` | Per-layer primitive clear | Verified |

## 3. Verified Regressions / Fixes

### Fixed: Traditional mode forward indicator hangs
- Symptom: after closing loop/commit in traditional mode, forward-length indicator remained armed.
- Root cause: fallback inferred armed state from `/looper/forward` command value.
- Fixes:
  - `looper/ui/looper_ui.lua`: removed fallback inference from `/forward`.
  - `looper/dsp/looper_primitives_dsp.lua`: added explicit `/forwardArmed` and `/forwardBars` params.
  - `looper/primitives/control/ControlServer.cpp`: added sync/clear logic on forward set, commit, stoprec, and forwardFire.

## 4. Verification Performed

### Automated smoke
- `tools/test-looper-primitives-smoke` -> `45 passed, 0 failed`
- `tools/test-ui-shell-smoke` -> `39 passed, 0 failed`

### Explicit command probes
- `SET /looper/mode traditional` + `GET /looper/mode` -> returns numeric mode `2`.
- Traditional forward-state clear checks:
  - After `SET /looper/forward 2`: `/looper/forwardArmed=1`, `/looper/forwardBars=2`.
  - After `TRIGGER /looper/stoprec`: `/looper/forwardArmed=0`, `/looper/forwardBars=0`.
  - After `SET /looper/commit 1`: `/looper/forwardArmed=0`, `/looper/forwardBars=0`.

## 5. Remaining Parity Work (Post-Checklist)

This checklist is intentionally focused on endpoint/behavior contract parity.
The next full-validation phase is host-level parity where the primitive script reproduces complete legacy looper runtime semantics end-to-end under real use.
