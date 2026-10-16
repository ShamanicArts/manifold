# Import a playable Manifold instrument

This separate Vite application imports the public authoring and UI packages.
The project source composes eight oscillators and ADSRs, MIDI-style events and
controls. Rust processes every audio sample; JavaScript authors the graph and
maps events and control edits outside the callback.

    npm --prefix examples/instrument-consumer ci --ignore-scripts
    npm --prefix examples/instrument-consumer run build

Serve the resulting application with COOP `same-origin` and COEP `require-corp`
headers for the prepared Wasm runtime. The main Manifold review server serves it
at `/examples/instrument-import/`. Start audio, focus a key, then play A/D/G.
Use `window.manifoldInstrument.request` for live source, event, control, save and
restore operations; all UI and script edits share its one runtime.

Connect MIDI requests browser permission; select an actual input to play that same
graph. The public `AuthoredMidiInput` adapter handles device changes and routes
notes/pedal to the project's `onEvent`. Channel release/disconnect preserves
other owners; **Release all notes** is global. `outputStream` exposes real output
for MediaRecorder capture without copying the processor. Browser device permission
remains a host requirement; failed permission is visible in the product.
