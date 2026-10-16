# Nacre creator vertical slice

The [live Nacre Studio](https://wubulon.tailfac9f9.ts.net:4174/studio.html?program=ui-nacre&project=%2Fnacre%2F2026-10-10-graph%2Fnacre-prism-bend.manifold.json) opens an authored spectral effect with a reusable two-primitive Prism Bend node in its wet branch. The module definition lives in the project's `studioGraph` source declaration. Both the agent and the graph canvas edit that declaration; `GraphWorkspace` remains the DSP graph authority.

## What is in the review build

- The user library accepts a versioned module definition with named inputs, outputs and controls. A shared project also advertises its embedded modules in the Add node palette, even in a fresh browser profile with an empty library.
- The graph shows typed ports and a two-lane signal path at readable node width. It scrolls horizontally, moves to a selected node and groups each module instance. Both the source and Nacre's Three.js face remain visible. The inspector renders exposed module controls with the same two-tone control kit.
- The website's Export drawer built the exact accepted project as Linux CLAP and VST3 while browser audio kept running. The resulting archive SHA-256 is `b59f996f87bb94617c12590c8976ee516e84028b9c7a3a5260152743882bf759`.

The [project JSON](../../web/public/nacre/2026-10-10-graph/nacre-prism-bend.manifold.json), [module definition](../../web/public/nacre/2026-10-10-graph/prism-bend-module.json), [screenshots](../../web/public/nacre/2026-10-10-graph/graph-and-inspector.jpg), and [measurement report](../../web/public/nacre/2026-10-10-graph/report.json) are checked into the project. The [build receipt](../../web/public/nacre/2026-10-10-graph/receipt.json) and [manifest](../../web/public/nacre/2026-10-10-graph/manifest.json) identify the captured export.

## Measured behavior

- The browser used an `AudioContext` sink of `none`; the H6 and speakers were untouched. Recording 31,680 frames from the live graph gave 0.110 RMS before changing Prism edge and heat and 0.354 RMS afterward. The audio host remained ready.
- During that same session, a second Prism Bend instance was created from the embedded project definition with an empty local node library. Nodes changed from 12 to 14; undo restored 12 while the audio host remained ready.
- The downloaded website export matched its receipt hash. Its packaged project preserved the exact authored source and signal graph. The exported CLAP loaded in a separate host process and rendered 300 blocks of audio at 48 kHz, with 0.051 RMS output. The archive contains a VST3 shared library with `GetPluginFactory`; VST3 audio in a DAW was not tested in this slice.

## Remaining product gaps

The standalone `manifold-app` has the shared egui graph, source and inspector but does not yet embed the custom Three.js face. Plug-in editor and browser Studio both use the web creator presentation. The graph still needs deliberate work on cable routing, zoom/minimap, module collapse, and direct user authoring/saving of composite nodes. Linux export is exercised here; Windows and macOS exports remain separate gates. The new module's controls appear in the inspector and can be placed in a face, but this Nacre example has not authored their final physical panel placement.
