# Swarm-0 Module Brief — Scale Quantizer

## Module identity

- **ID:** `scale_quantizer`
- **Name:** `Scale Quantizer`
- **Category:** `voice`
- **Kind:** `VOICE -> VOICE`

## Goal

Quantize incoming note values in a VOICE bundle to a selected root/scale.

## Ports

### Inputs
- `voice_in` — `voice_bundle`

### Outputs
- `voice` — `voice_bundle`

## Params

- `root` — int / enum, `0 -> 11`, default `0`
- `scale` — enum, `{ major, minor, dorian, mixolydian, pentatonic, chromatic }`, default `major`
- `direction` — enum, `{ nearest, up, down }`, default `nearest`

## Runtime behavior

- Remap note only.
- Preserve gate, noteGate, velocity, and source provenance.
- Deterministic only.
- No clocking or held-note memory.
- Chromatic mode should behave as pass-through.

## UI pattern

- `1x1` only
- 3 controls max
- expected controls:
  - root dropdown
  - scale dropdown
  - direction control
- no graph
- no shell customization

## Non-goals

- no user-editable scale mask
- no chord expansion
- no transpose built into this module
- no stateful note memory

## Acceptance

- input note becomes scale-conforming note according to mode
- gate semantics remain sane downstream
- chromatic mode is pass-through
- perf and patch view semantics remain aligned
- no central-file edits by builder

## Builder-owned files

- `UserScripts/projects/Main/lib/scale_quantizer_runtime.lua`
- `UserScripts/projects/Main/ui/behaviors/scale_quantizer.lua`
- `UserScripts/projects/Main/ui/components/scale_quantizer.ui.lua`
- optional: `UserScripts/projects/Main/ui/tests/test_scale_quantizer.lua`

## Coordinator-owned follow-up

If needed, coordinator handles:
- spec registration
- parameter binder registration
- palette/browser integration
