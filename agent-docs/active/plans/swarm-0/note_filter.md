# Swarm-0 Module Brief — Note Filter / Key Range

## Module identity

- **ID:** `note_filter`
- **Name:** `Note Filter`
- **Category:** `voice`
- **Kind:** `VOICE -> VOICE`

## Goal

Pass or block incoming VOICE bundles according to note range rules.

## Ports

### Inputs
- `voice_in` — `voice_bundle`

### Outputs
- `voice` — `voice_bundle`

## Params

- `low` — int, `0 -> 127`, default `36`
- `high` — int, `0 -> 127`, default `96`
- `mode` — enum, `{ inside, outside }`, default `inside`

## Runtime behavior

- If note passes the rule, forward the bundle unchanged.
- If note fails the rule, force downstream-inactive behavior in a deterministic way.
- Preferred rejection behavior for Swarm-0: preserve note metadata but force `gate = 0`, `noteGate = 0`, and zero relevant amplitude fields so downstream modules do not hang.
- No timing state.
- No randomness.

## UI pattern

- `1x1` only
- 3 controls max
- expected controls:
  - low control
  - high control
  - mode control
- no graph
- no shell customization

## Non-goals

- no velocity filtering
- no scale quantization
- no latch / hold state
- no custom graph UI

## Acceptance

- notes inside/outside the configured range are handled correctly
- rejected notes do not leave downstream modules hanging
- perf and patch view semantics remain aligned
- no central-file edits by builder

## Builder-owned files

- `UserScripts/projects/Main/lib/note_filter_runtime.lua`
- `UserScripts/projects/Main/ui/behaviors/note_filter.lua`
- `UserScripts/projects/Main/ui/components/note_filter.ui.lua`
- optional: `UserScripts/projects/Main/ui/tests/test_note_filter.lua`

## Coordinator-owned follow-up

If needed, coordinator handles:
- spec registration
- parameter binder registration
- palette/browser integration
