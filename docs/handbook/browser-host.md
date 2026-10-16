# AudioContext and graph lifetime

A website owns its audio environment. Manifold's `BrowserDeviceHost`, imported from `manifold/browser`, accepts an existing `AudioContext`, prepares an authored Device and connects it to Web Audio nodes. It does not need the Studio shell, choose your microphone, or own your entire application's routing.

## Decide who owns each resource

| Resource | Typical owner | Cleanup rule |
| --- | --- | --- |
| Shared AudioContext | Your application | Close it when the application is finished with audio |
| Example-only AudioContext | The mounted example | Close it when the example stops or unmounts |
| Source, such as an oscillator | The component that created it | Stop and disconnect it when that component finishes |
| Manifold graph host | The component mounting the graph | Call `host.close()` during teardown |
| Shared output or effects chain | Your application | Disconnect this graph without dismantling other routes |

Two components can use one context while owning separate graph hosts. Removing one component should not call `context.close()` on a shared context. Keep explicit references to the nodes and graph host you created so cleanup is precise.

## Prepare before connecting

Create or resume the AudioContext in response to the person's audio-start action. Construct `BrowserDeviceHost` with that context and await `host.prepare(device)` before connecting its named buses:

```js
await host.prepare(effect);
host.connectInput('audio', inputLevel);
host.connectOutput('audio', context.destination);
```

These are the audio boundaries declared by the Device. `createEffect` supplies a stereo bus called `'audio'` on each side. A sound generator may have only an output; an effect with sidechain input can declare an additional named input. Connecting Web Audio nodes does not alter the Device's musical implementation.

A host prepares one Device. Use a new host for another instance. After `close()`, create a new host to start again. No microphone is selected and no output route is connected automatically.

## Deliver the runtime assets

Device hosting currently uses the prepared execution path: the shared Rust/Wasm runtime, a compiler Worker and an AudioWorklet. It requires a secure context (HTTPS or localhost), AudioWorklet, SharedArrayBuffer and cross-origin isolation. Serve the page with these response headers:

```http
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

The isolation policy also applies to resources the page embeds. Deliver Manifold's runtime files from the same origin, or configure appropriate cross-origin resource access. The preview server sets these headers. A plain static host that omits them cannot run this Device host yet.

Module-relative URLs provide the default assets. A bundler must include the worker, worklet and Wasm files in its output. `BrowserDeviceHost` accepts `preparedWasmUrl`, `preparedWorkletUrl` and `preparedCompilerUrl` overrides when your deployment puts them elsewhere.

For local development, build the repository's Wasm artifacts and install its web dependencies. The `manifold` package is currently repository-local, not an independently published npm release. Package installation and distribution are still release work.

`BrowserGraphHost` remains available from the same entry point for applications that already own a serialized project. Its older worklet and worker modes have different capability limits; named audio buses require prepared execution. The Device host chooses that path explicitly rather than silently changing the project's I/O.

## Keep control state and audio state connected

For a fixed Device, pass its declared control reference to `await host.setControl(volume, value)`. The returned number is the accepted value. A reference from a different Device, an invalid value, or a closed host is rejected. The same imported Device can be prepared in two hosts; each has independent audio and control state.

For an editable or saveable project, use a `LiveProjectRuntime` and its semantic requests as the accepted authoring state. Its host adapter publishes the corresponding audio changes. Studio uses that kind of shared authority for source, graph, inspector and agent operations; copying a second editable graph into your UI makes reconciliation your problem.

Read a control's range and default from its endpoint. An amplitude multiplier is not a decibel value. If you display decibels, define and explain that conversion; preserve the parameter's underlying meaning.

## Stop, dispose and recover

First prevent new control requests, then finish or reject pending work, stop the source you own and close the graph host. Disconnect your nodes. Close the context only if this component created and owns it.

A framework's unmount hook, a navigation event and a failed startup all need cleanup. Make teardown safe to call again. When restarting, prepare from the accepted current project so a previous parameter change is retained.

## Verify the integration

Use a controlled input and check three cases: zero gain gives silence, an intermediate gain changes amplitude, and restoring the original value restores the response. Check the signal after smoothing has settled. Then stop, restart and confirm both the parameter and audio response are retained.

Repeat with two mounted graphs if your application supports that. Removing one should leave the other operating and the shared context available. The gain tutorial proves its own lifecycle; it is not a blanket guarantee about every third-party framework's mounting behavior.
