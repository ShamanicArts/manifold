# Swarm-0 Module Brief — Velocity Mapper

## Module identity

- **ID:** `velocity_mapper`
- **Name:** `Velocity Mapper`
- **Category:** `voice`
- **Kind:** `VOICE -> VOICE`

## Goal

Remap incoming VOICE velocity/amplitude response before downstream modules.

## Ports

### Inputs
- `voice_in` — `voice_bundle`

### Outputs
- `voice` — `voice_bundle`

## Params

- `amount` — float, `0.0 -> 1.0`, default `1.0`
- `curve` — enum, `{ linear, soft, hard }`, default `linear`
- `offset` — float, `-1.0 -> 1.0`, default `0.0`

## Runtime behavior

- Preserve note, gate, noteGate, and source provenance.
- Remap velocity-related amplitude fields deterministically.
- No timing state.
- No randomness.
- If multiple bundle fields need consistency, prefer preserving canonical VOICE semantics rather than inventing new fields.

## UI pattern

- `1x1` only
- 3 controls max
- expected controls:
  - amount knob
  - offset knob
  - curve dropdown or segmented control
- no graph
- no shell customization

## Non-goals

- no randomization
- no envelope shaping
- no timing / slew behavior
- no custom graph UI

## Acceptance

- module spawns through the factory cleanly
- note/gate semantics remain unchanged
- velocity/amplitude mapping changes audibly / logically as expected
- perf and patch view semantics remain aligned
- no central-file edits by builder

## Builder-owned files

- `UserScripts/projects/Main/lib/velocity_mapper_runtime.lua`
- `UserScripts/projects/Main/ui/behaviors/velocity_mapper.lua`
- `UserScripts/projects/Main/ui/components/velocity_mapper.ui.lua`
- optional: `UserScripts/projects/Main/ui/tests/test_velocity_mapper.lua`

## Coordinator-owned follow-up

If needed, coordinator handles:
- spec registration
- parameter binder registration
- palette/browser integration
