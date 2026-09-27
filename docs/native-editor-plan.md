# Native Standalone FX editor boundary

Date: 2026-09-27. This is the next implementation slice after the loadable
Linux CLAP audio and state proof. The product surface is the existing
`projects/standalone-fx-module/ui.json` rendered by `web/src/widgets/project-ui.js`.
The compact slider and dropdown Canvas renderers are ports of the historical
Manifold widgets. A native editor must mount those same renderers and use the
same type, mix, and five control IDs; it must not introduce another widget set.

## Host and window lifecycle

The [CLAP GUI extension](https://github.com/free-audio/clap/blob/main/include/clap/ext/gui.h)
defines create, size, parent, show, hide, and destroy calls on the host main
thread. Its X11 API supports an embedded child window. Its Wayland API does
not currently support embedding, so the first Linux editor target is X11;
Wayland needs a floating editor or a later host protocol. The plug-in must
continue to advertise its generic parameters if the custom editor cannot be
created.

[Wry's child webview](https://docs.rs/wry/latest/wry/struct.WebViewBuilder.html)
can render inside an X11 parent and uses WebKitGTK on Linux. It requires GTK
initialization and a running GTK loop. A DAW might use another UI toolkit, so
the first editor implementation should put WebKitGTK in a companion editor
process. The CLAP module owns the GUI extension and the bounded control bridge;
the companion owns the webview, browser assets, and its GTK event loop. The
process boundary also prevents the DSP module from requiring a GTK loop.

A browser preview is now available at `fx-module.html?editor=1`. It mounts the
same `project-ui.js` controls in a 500 × 246 shell, accepts a host project
snapshot through `window.manifoldEditorReceive(...)`, and emits versioned
parameter messages through `window.ipc.postMessage(...)`. The current preview
shares the full browser page bundle, although it does not start browser audio;
the packaged native editor build still needs its own entrypoint so it can omit
browser audio code entirely.

```text
DAW main thread: CLAP GUI extension ── X11 parent ── editor companion
                 CLAP params flush  ← bounded IPC → exact browser widgets

DAW audio thread: host events → preallocated CLAP adapter → manifold-native
                                                   → manifold-core DSP
```

## Control and presentation bridge

1. Package the built editor HTML, JavaScript, CSS, layout JSON, and Wasm-free
   widget code with the plug-in. The editor uses the authored project controls
   and `project-ui.js`; it has no AudioWorklet, mic permission, or WebGPU work.
2. On open, the plug-in sends one bounded snapshot: seven public values plus
   the 21 remembered five-control sets. The editor redraws from this snapshot.
3. A pointer gesture sends begin, value, and end messages with stable parameter
   ID and normalized value. The CLAP adapter forwards them through the host
   params flush contract so DAW automation records the change. Host automation
   returns to the editor as small value snapshots. Type changes update all five
   displayed controls from the DSP's remembered set.
4. IPC decoding, JSON handling, window calls, and WebKit execution stay off the
   audio callback. The audio callback consumes only bounded prepared parameter
   events. UI refreshes may skip frames without changing audio timing.
5. The editor shares the project's versioned JSON state. No editor-only state
   may alter audio behavior without a host parameter or explicit project state
   transaction.

## Proof gates

- Render the packaged editor from disk in a headless browser and compare its
  widget geometry and Canvas output to the current Standalone FX page.
- Exercise gesture begin/value/end and host automation in a test CLAP host;
  assert correct seven public values, per-effect memory, and saved state.
- Embed under a disposable X11 host window and test create, resize, hide,
  reopen, and destroy. GUI tests must not take focus on the user's desktop.
- Confirm the audio callback performs no allocation, locking, IPC, logging, or
  browser work while the editor opens, closes, and receives automation.
- Validate the resulting `.clap` again with the independent CLAP validator.

VST3 and Audio Unit adapters can reuse the same packaged editor and stable
project IDs, while implementing each format's own window and automation
contract. The current CLAP audio module does not advertise a GUI extension yet.
