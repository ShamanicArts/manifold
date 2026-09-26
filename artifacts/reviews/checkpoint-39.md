# Checkpoint 39 · CV rack patch editor

Open the [CV rack](http://127.0.0.1:4173/?primitive=cv-rack). In **Control patch**, choose a source or **Unconnected** for each of eight CV inputs. Stop the instrument before editing, then start it to compile and hear the changed Rust graph. The mix has four independent input ports; only two are connected in the authored starting patch.

## Implemented

- Added a session-local editor for the Sample/Hold source and trigger, scale input, four CV mixer inputs, and modulated gain CV input. The available sources are typed control outputs arranged so choices cannot create a cycle.
- The editor changes the graph description used on the next start. The worklet prepares a new Wasm instance and Rust execution plan; no graph compilation runs inside `process()`.
- Kept authored controls separate from topology. Their current values replay into the new graph after preparation. Patch edits persist while navigating between workbench views in the same page.

## Verification

- In a live browser AudioWorklet, disconnecting both CV mixer inputs produced a mixed CV of **0.10** and effective gain of **0.65** from base **0.60** and depth **0.50**. Reconnecting Source LFO to mix input 1 gave changing mixed CV values after restart. The editor was disabled during audio playback and retained its selection after navigating away and back.
- At 390px width, all eight patch rows fit without horizontal overflow.
- `cargo test --workspace`: 57 core tests passed. Vite production build passed. The browser runner reported **Match** for all 156 reference cases in 25 views, with no page errors.

## State rule and limit

Each restart creates fresh LFO, oscillator, sample/hold, gain smoother, and meter state. Connection edits are currently stop/start transactions, not live topology swaps. The choices persist only for this page session, not in a preset. A live replacement mechanism will require preparation away from the callback, block-boundary publication, and explicit state migration. See the [patch editing contract](../../docs/patch-editing-contract.md).
