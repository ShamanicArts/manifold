# Checkpoint 38 · Authored and effective gain

Try [LFO modulation](http://127.0.0.1:4173/?primitive=modulation), [Slew modulation](http://127.0.0.1:4173/?primitive=slew-modulation), [CV rack](http://127.0.0.1:4173/?primitive=cv-rack), or [Envelope ducking](http://127.0.0.1:4173/?primitive=envelope-ducking). Start audio, then edit **Base gain**. The filled slider and large number remain the value you authored. The thin gold marker and small **Effective** readout show the latest gain snapshot returned by Rust/Wasm. Stop audio to clear the live marker.

## Implemented

- Added declarative `effectiveMeter: true` to the base gain parameter in four modulated projects. The browser requests those nodes' meter band 0 at 10 Hz and renders the effective value without changing the slider's authored value.
- Extended the compact slider with a second readout and positional marker, retaining the existing pointer and keyboard input. The same component is used in each project.
- Kept CV stage readouts and envelope detector meters alongside effective gain by requesting both meter sources where needed.

## Verification

- Live headless Chromium AudioWorklet sessions in all four projects reached **Audio running**. Each produced a finite effective marker, accepted a base gain edit while running, and cleared the marker on stop while preserving the edited base value.
- At 390px width, the CV rack slider and page had no horizontal overflow.
- Vite production build passed. All 156 browser reference cases across 25 views still reported **Match**, with no page errors.

## Decisions and limits

The effective value is a read-only snapshot of the final sample processed in a block, polled at 10 Hz. It is not a record of the full modulation range or a browser-generated control signal. Audio computation and parameter smoothing remain in Rust/Wasm. The next patching slice is editable typed connections with a prepared graph replacement and explicit state behavior. See the [graph contract](../../docs/graph-contract.md).
