# Swarm-0 Module Brief — Clamp / Range Mapper

## Module identity

- **ID:** `range_mapper`
- **Name:** `Clamp / Range Mapper`
- **Category:** `mod`
- **Kind:** `scalar -> scalar`

## Goal

Clamp or remap a scalar modulation signal into a controlled output range.

## Ports

### Inputs
- `in` — `scalar_unipolar`

### Outputs
- `out` — `scalar_unipolar`

## Params

- `min` — float, `0.0 -> 1.0`, default `0.0`
- `max` — float, `0.0 -> 1.0`, default `1.0`
- `mode` — enum, `{ clamp, remap }`, default `clamp`

## Runtime behavior

- Deterministic only.
- If `min > max`, Swarm-0 rule is to swap them internally before processing.
- `clamp` mode bounds the input to `[min, max]`.
- `remap` mode remaps normalized input into the configured output span.
- Output remains within `[0.0, 1.0]`.
- No timing state.

## UI pattern

- `1x1` only
- 3 controls max
- expected controls:
  - min knob
  - max knob
  - mode control
- no graph
- no shell customization

## Non-goals

- no curve shaping
- no comparator / threshold behavior
- no bipolar mode in Swarm-0
- no custom graph UI

## Acceptance

- clamp mode behaves correctly
- remap mode behaves correctly
- min/max inversion is handled deterministically
- output stays inside the expected range
- perf and patch view semantics remain aligned
- no central-file edits by builder

## Builder-owned files

- `UserScripts/projects/Main/lib/range_mapper_runtime.lua`
- `UserScripts/projects/Main/ui/behaviors/range_mapper.lua`
- `UserScripts/projects/Main/ui/components/range_mapper.ui.lua`
- optional: `UserScripts/projects/Main/ui/tests/test_range_mapper.lua`

## Coordinator-owned follow-up

If needed, coordinator handles:
- spec registration
- parameter binder registration
- palette/browser integration
