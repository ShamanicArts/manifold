# Swarm-0 Module Brief — Attenuverter / Bias

## Module identity

- **ID:** `attenuverter_bias`
- **Name:** `Attenuverter / Bias`
- **Category:** `mod`
- **Kind:** `scalar -> scalar`

## Goal

Scale, invert, and bias a scalar modulation signal.

## Ports

### Inputs
- `in` — `scalar_bipolar`

### Outputs
- `out` — `scalar_bipolar`

## Params

- `amount` — float, `-1.0 -> 1.0`, default `1.0`
- `bias` — float, `-1.0 -> 1.0`, default `0.0`

## Runtime behavior

- Compute output deterministically from input.
- Preferred Swarm-0 rule: `out = clamp((in * amount) + bias, -1.0, 1.0)`.
- No timing state.
- No randomness.
- No hidden normalization policy beyond the brief.

## UI pattern

- `1x1` only
- 2 controls
- expected controls:
  - amount knob
  - bias knob
- no graph
- no shell customization

## Non-goals

- no slew
- no curve shaping
- no extra mode switch
- no custom graph UI

## Acceptance

- positive amount scales normally
- negative amount inverts the signal
- bias offsets the output
- output clamps safely
- perf and patch view semantics remain aligned
- no central-file edits by builder

## Builder-owned files

- `UserScripts/projects/Main/lib/attenuverter_bias_runtime.lua`
- `UserScripts/projects/Main/ui/behaviors/attenuverter_bias.lua`
- `UserScripts/projects/Main/ui/components/attenuverter_bias.ui.lua`
- optional: `UserScripts/projects/Main/ui/tests/test_attenuverter_bias.lua`

## Coordinator-owned follow-up

If needed, coordinator handles:
- spec registration
- parameter binder registration
- palette/browser integration
