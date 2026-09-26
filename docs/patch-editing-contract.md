# CV rack patch editing contract

The CV rack project declares eight editable control input ports. Each port offers a small list of earlier control-output nodes plus an unconnected choice. The source lists are typed and ordered so the offered routes cannot form a cycle. Audio connections stay fixed in this slice. Rust graph compilation still validates port type, occupancy, IDs, and topology on each start.

The browser copies the authored signal description into session memory. Changing a dropdown replaces one `connections` entry; it never changes the currently running `ExecutionPlan`. Dropdowns are disabled while audio runs. On the next start, the AudioWorklet creates a new Wasm instance, sends the edited graph to Rust, prepares buffers and kernels, then starts processing. Stopping closes the old instance. This is a deliberate stop/start transaction, not a live topology swap.

Node state starts fresh at each start: LFO phase, sample/hold latch and trigger state, gain smoother, oscillator phase, and meter snapshots reset to their initial conditions. The browser retains authored parameter slider values and replays them when the new graph is ready. Edits persist while switching workbench views in one page session, but are not saved as a preset and are lost on reload.

The first live check disconnected both `CvMix` inputs. Its offset alone produced 0.10 mixed CV and 0.65 effective gain from base 0.60 with depth 0.50. Reconnecting the source LFO to mix input 1 produced changing CV values after restart. This verifies that the selector changes the Rust signal path, rather than only redrawing the browser diagram.

Live topology replacement needs preparation away from the callback, block-boundary publication, retirement of the old plan, and explicit rules for state continuity when stable node IDs survive an edit. That mechanism is not provided by this stop/start editor.
