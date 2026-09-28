# Main native host boundary

Main is a dedicated product with one assembled `MainInstrument` core. The browser `manifold_looper_*` ABI wraps that core in Wasm. The general Graph CLAP/VST3 classes load `manifold.project` graph bundles, while Standalone FX has its own product classes. Neither host class currently accepts `manifold.main-looper` session version 15 or exposes the Main looper transport and capture controls. A new Main host class should wrap the same `MainInstrument`, rather than translating Main into an incomplete generic graph.

## First native slice

`manifold-native::main_instrument::MainNativeProcessor` prepares the Main core and a silent input bus before processing. Its callback accepts variable planar blocks up to the prepared limit and sorted MIDI events targeting the dedicated Main input. It validates lengths, offsets, and target IDs before changing output; a host event splits the block at its exact sample offset. The core handles Arpeggiator deadlines within each segment. This path allocates no scratch in `process`.

Native tests prove an absent input bus stays silent until a note at offset 40, the Arpeggiator's first audio starts 240 samples later at 8 kHz, a source note-off clears held state, a First Loop take records host input and plays its committed layer, and an invalid event leaves output unchanged. CLAP/VST3 class registration is still separate work.

## Product and state contract

- Keep `projects/main-looper/project.json` as the product ID and parameter-ID source. Host parameters need fixed IDs for transport, layer controls, source, FX/EQ, and the connected voice modules. Dynamic module instances require reserved stable slots so a DAW automation lane does not change identity when a rack row moves.
- Accept the browser's versioned Main session as the portable state envelope: four loop PCM assets, sample PCM, layer/transport metadata, and rack module controls. Decode, validate, and prepare it on the host control side. Publish a complete prepared Main runtime at a block boundary; retire the old runtime away from the callback. The browser currently imports layers one at a time, so native atomic publication will be a stronger host guarantee.
- State capture needs a synchronized snapshot of Main controls and bounded PCM copies. Existing `MainLooper::copy_loop_interleaved`, sample copy APIs, and browser chunked transfer establish the data path, but `MainInstrument` does not yet expose one complete immutable state snapshot. A host save must never read mutable loop buffers concurrently with the callback.
- Keep Main's inferred First Loop tempo and host transport tempo distinct. The host supplies timeline/tempo as an explicit input; only an explicit user or project choice should adopt it. The current native slice does not yet consume host transport.

## Export sequence

1. Add a Rust Main session loader/saver around `MainNativeProcessor`, including an exact browser v15 fixture, v1–v14 defaults, PCM bounds, and a native/Wasm audio comparison at the same block partition.
2. Expose a fixed Main host parameter bank and time-stamped automation. Test one audible parameter, First Loop command, layer volume, and an Arpeggiator control at sample offsets. Handle zero-audio host flushes without touching DSP buffers.
3. Add a distinct Main CLAP class and editor route to the existing package. Discover it in an external host, import a browser session, record/commit a loop, save/reopen, and compare rendered audio with direct native Rust.
4. Add the Main VST3 processor/controller pair with the same state and fixed IDs. Run the SDK validator and a fresh DAW-process audio/state probe. Package the actual Main browser surface in both editors; reuse the current headless browser and native audio fixtures.

The Main host boundary does not depend on Lua or JUCE. Full dynamic patchbay connections and multiple utility instances remain Main core/product work and can be added without changing the native audio adapter's block shape.
