# Authoring in a running Manifold Studio

Studio is an audio plug-in authoring environment. Its running project is the
source of truth. MCP edits update that project live; do not restart the app or
refresh the Presenter to apply them. General tooling belongs to Studio;
project-specific graphics and devices belong to the authored project.

## Write code for the musician reading it

Expose semantic complexity; hide incidental complexity. New creative audio
source imports `createDevice`, `createEffect` or `createInstrument` and each
processor definition explicitly from `manifold`. Pass definitions directly to
`device.add('meaningful-instance-name', processor)`. Use typed members such as
`processor.inputs.audio` and `processor.parameters.frequency`, `configure` for
initial state, and `device.control` for the public interface. Export the Device.
Controls supply the default presentation; do not repeat their ranges or defaults.

Introductory local names mirror the concept: `device`, `effect`, `instrument`.
Explain that these are ordinary JavaScript names chosen by the author. Distinguish
JavaScript `const`, local names, quoted persistent IDs, imported definitions and
Manifold methods. Preserve persistent IDs when renaming local variables. Code
should show what is being made and why without requiring runtime knowledge.

`manifold/graph` retains the expert graph API for existing low-level projects,
serializers and transformations. Do not introduce numeric node allocation,
reserved boundary IDs, `.type` unwrapping or duplicate view metadata into a new
beginner example. Inspect an older project's actual authoring contract before
editing it; migration must preserve its behaviour and saved identities.

Studio's new-project starter uses an explicit Device. Its graph commands write
readable source for adding/removing processors, connecting/disconnecting ports,
positioning/grouping, exposing controls and wrapping selections. Add a Device
with `effect.add('first', filterStage)` to reuse its inner graph; each instance
owns its DSP state and namespaced controls. `instance.configure` sets its initial
control values. Root controls can promote `instance.controls.brightness` without
repeating metadata. Inner implementation edits affect all instances of that
shared definition. Select the container and use Enter graph; select a child to
follow the highlighted declaration.

For parameter exposure in a Device project, use a simple control path such as
`/brightness`; the Device supplies nested instance prefixes. Graph commands infer
ordinary explicit top-level declarations. If custom dynamic logic prevents a safe
rewrite, inspect the diagnostic and edit source deliberately. A rejected command
must leave the accepted state intact. Older `studioGraph` and saved projects
retain their existing contracts. Never rewrite one wholesale just to change its
spelling. Inspect acceptance, stable identities, control values and signal output.

The wiki has six embedded experiments: gain, ring modulation, spectral pitch,
playable MIDI instrument, reusable Device chain and Nacre-derived presentation.
Start with `/learn/manifest.json`; source links and raw Markdown accompany each
lesson. Use `BrowserDeviceHost` from `manifold/browser` for direct embedding. It
owns its prepared runtime and routes; the application owns AudioContext, user
gestures, device permissions and output choice. Its named `sendMidi` facade uses
`noteOn`, `noteOff`, `allNotesOff` and `pitchBend`. Resource-heavy existing projects
can keep the expert host API. Do not claim a browser or native acceptance check
without actually observing the relevant host.

## Find the thing to change

1. Call `manifold.project.inspect` with `sections: ["summary"]`. Keep its
   `revision` and check `connection.project` to confirm the intended project.
   Request `audio`, `composition`, `parameters`, `files`, `sources`, `catalog`
   or `history` sections as needed. `nodeId` returns one node, its connections,
   source links and definition. Omit filters only when you need the full snapshot.
2. Call `manifold.file.list` to discover embedded scripts and assets, then
   `manifold.file.read` for the relevant path. Definition entries identify their
   implementation source; instance labels and connections explain its role.
3. Read `manifold.workspace.inspect` for the visible workspace and
   `compositionObservation`: each presentation node has a status and current
   output summaries. This reports execution/data, not a screenshot. On Linux
   standalone, `manifold.presenter.capture` returns an actual PNG image of the
   visible Presenter; `maxWidth` defaults to 1200 and is capped at 1600. It
   captures the app's web surface without desktop access or focus changes.

Visual definitions can declare `category`, `keywords`, a preferred `preview`
output name, and `unit` on each port. Use a functional category: `Sound analysis`,
`Values & motion`, `Fields`, `Colour & layers`, `Objects & layout`,
`Reusable graphs` or `Custom scripts`. Explain what the node does in
`description`; avoid storage/packaging explanations there. Origin is derived by
Studio and is separate from category. Focused project inspection returns this
metadata alongside the actual definition and source links.

Workspace observations optionally include `preview` for requested nodes: bounded
scalar/vector histories or reduced field pixels with dimensions, sampled range
and `sampledAt`. These are data observations, not screenshots of the final
renderer. Graph and Inspector request visible previews; absent preview data
does not imply a stopped node. Up to 16 nodes are sampled at 10 Hz, with 48
history entries and at most 32 × 32 field pixels each. Structural edits discard
old observations; compatible control and layout revisions retain continuity.

`/project.mjs` is the audio project source. `/composition.json` is the editable
presentation graph; `/audio-graphs.json`, when present, describes reusable audio
graphs. `/project.json` represents the whole project semantically. These are
virtual views of the same accepted document, not separate authorities. Other
project scripts/assets are embedded files. Writing a file on your computer does
not update an embedded project file; filesystem watching is not implemented.

## Choose the Device or Input graph

An effect's **Input graph** supplies Studio test audio. Its **Controls** tab is the
graph's own exposed controls rendered with the shared widgets; **Graph** opens its
editable implementation. To add a quick control, expose a processor parameter
with `inputGraph.control(...)` in its source, or use `parameter.expose`. The UI
updates on acceptance; do not create a separate settings panel or refresh Studio.

Root inspection includes `studioGraphs` with each graph's independent revision.
Use `graphTarget: "input"` on inspection, file and graph tools to work on the Input
graph. `/project.mjs` then means that graph's source. Omit the target or use
`"device"` for the plug-in Device. Always use the selected graph's revision.

Unscoped `project.save` saves the whole Studio document, including
`studio.inputGraph`; scoped `project.save` saves only that graph. Plug-in builds
export the Device and exclude the Studio Input graph. Do not move test generators
into an effect simply to audition it. A Device intentionally implementing an
instrument can contain its own generators. The top bar owns audio Start/Stop and
final listening Master; Settings owns actual hardware selection.

## Make and verify an edit

Use `manifold.file.write` with `path`, `mediaType`, `encoding`, `content`,
`expectedContent` from the read, and the current `expectedRevision`. Follow each
accepted edit with fresh inspection. All mutations require the current revision;
do dependent edits sequentially. Do not bypass a stale revision/content rejection
or overwrite a human draft: read again and reconcile the intended change.

For structure, use the advertised `component.*` and `graph.*` tools. Read their
schemas and the existing project definitions instead of guessing port names.
`component.define` can publish a definition and its files atomically. A shared
definition's source changes all its instances; local values belong to an instance.

Presentation implementations currently include:

- `presentation-script`: a default factory returns `evaluate(api, frame)` and
  optionally `dispose()`. Read inputs with `api.input(name)` and local values
  with `api.parameter(name)`. Return an object keyed by declared output names.
- `web-surface`: a default factory returns `mount(element, api)`. Mount returns
  an object with `dispose()` and optionally `update(frame)`, `outputs()` and
  `render(frame)`. Rendering runs after every object has updated. Create graphics
  inside that element and clean them up on disposal. Use `api.assetUrl(path)` for
  project assets. Canvas is one option; Three.js is not required.
- `scene-object`: a default factory returns `create(api)`. Read a connected
  renderer resource with `api.resource('scene')`. Return a synchronous object
  with `dispose()` and optional `update(frame)` and `outputs()`. Dispose only
  resources owned by this object. Resource disconnection disposes the instance;
  reconnection creates it. Numerical input changes preserve its state.
- `parameter`: `{kind: 'parameter', path: '/nacre/focus'}` reads an existing
  project parameter or mapped control. It has no source entry or inputs and
  exactly one output, `value: scalar`. Follow its source link to the declaration.
- `composition`: a reusable graph with named interfaces and nested instances.
  Inspect its existing definition before editing its children or interface.

Typed presentation wires carry analysis, scalars, `vector2`, `vector3`, sampled
fields or opaque `resource:<contract>` handles. A renderer/object publishes a
resource with `api.exportResource('resource:my.scene', scene)`, then returns that
same handle from `outputs()` while the scene lives. Keep handle identity stable;
changing it recreates dependent objects. Both ports must name the same resource
contract. Handles are live graphics resources, never serialized GPU objects;
saved definitions, source, assets and wires recreate them on reopen. Scripts
produce numerical data, not resource outputs. Vectors are finite arrays of the
stated length. See Nacre's `/nacre/scene.mjs`, `field.mjs`, `modes.mjs` and
`energy.mjs` for an actual shared scene and attached object. They are
separate from audio-rate wires. A `field2d` is `{width, height, values}` in
row-major order, at most 128 × 128 finite samples. Disconnected inputs are null.
Presentation work must not drive the audio clock.

Syntax acceptance does not prove rendering succeeded. After acceptance, wait
for `compositionObservation.revision` to match and check the affected nodes'
statuses/outputs. A renderer can fail at runtime while its source is accepted;
Studio can retain the previous visible surface. Inspect diagnostics and repair
the accepted source. Obtain an actual screenshot or human/observer review before
claiming the result looks correct. A hidden/not-ready Presenter returns an error
instead of opening itself. Capture metadata includes the requested revision and
runtime observations; a concurrent source publication rejects the capture so you
can retry. Audio animation continues during capture, so observation values and
the image may reflect slightly different instants. A runtime failure can leave the previous successful artwork visible,
so read those observations even when the image looks plausible.
When testing a meter or binding, exercise its
input, inspect the response, and restore the original parameter values.

## Save and recover

`manifold.project.save` returns the portable project JSON, including embedded
source/assets and composition. It does not write a disk file for you. Store the
returned JSON exactly with your client's file-writing capability; avoid manually
reconstructing a large document. Reopen that saved project to check persistence.
Use `manifold.project.undo` for an intentional undo after inspecting current state.

The app's Allow agent live edits switch governs mutations. A paused gate is not
permission to bypass it. After a timeout, inspect authoritative state before
retrying: the edit may already have been accepted. The development adapter's
loopback port belongs to the current Studio process. **Project → Connect agent…**
provides copyable JSON and Codex TOML configurations. Automatic discovery finds
the only running Studio and follows a restart without restarting the MCP client.
If several windows are open, it refuses to choose; copy the intended window's
configuration from the expanded **Connect only this window** section instead.
Window-specific connections expire when that window closes. Inspect again before
mutating a discovered session after startup/restart; an old revision number alone
does not identify an application process. Explicit legacy `--endpoint` configs
remain supported, but need a new port after a restart.

### Performing a Device in Studio

A Device with a MIDI input accepts the same Studio `event.send` / `event.midi`
commands as other projects. For example:

```json
{"operation":"event.send","event":{"type":"note-on","note":60,"velocity":100,"owner":"agent-demo"}}
```

Release it with `note-off`, or send `panic` with the same `owner`. Audio must be
running. Notes, sustain, pitch bend and scoped panic enter the existing native or
Wasm event queue; processor voice allocation remains in DSP. Studio tracks note
ownership so disconnecting a MIDI source does not silence notes held by another
owner. Performance ownership is ephemeral; saving a Device does not replay held
notes on reopen. The direct website facade uses named camel-case events such as
`host.sendMidi('midi', {type:'noteOn', note:60})`; Studio keeps its existing command
vocabulary.

Device wrapping retains controls and automation slots. It changes the contained
processors' semantic paths; it does not promise preservation of transient DSP
history such as phase, delay tails or held voices. Source-only local-variable
renames retain stable authored identity.

## Audio source ownership

Studio's Settings selects host audio hardware. Source generators, live-input gain,
and source blending are authored graph objects. Use named `sawOscillator`,
`sineOscillator`, `noise`, `gain` and `crossfader` imports from `manifold`;
inspect the actual source example at `/learn/examples/sources.mjs` and its lesson
at `/learn/audio-sources/`. Use declared audio boundaries for microphone/interface
or DAW input. Do not recreate Studio-only Saw/Noise/File selectors or put project
parameters into Settings. Do not inject generators into every user project.

The Audio Sources example routes Saw/Noise through one crossfader, then blends
that result with Live through another. Its controls and routing save in the
project, can be inspected, scripted, and wrapped into a Device. Wiki demos contain
their own authored tones. Start/Stop and the final Master listening gain belong to
the host and remain outside exported project controls. Native capture currently
requires float32 input at the output device's rate; output-device selection uses
`MANIFOLD_AUDIO_DEVICE` at launch. Live output-device switching and sample-rate
conversion are not implemented.

### Image composition

Use `project.inspect` with `sections:["catalog"]` to discover audio and visual
entries, including Manifold’s Image frames, Select image frame, Transform image
and Image layer. `component.add` accepts the returned visual definition ID.
Upload image assets with `file.write`, then configure an Image frames definition
with `component.frames` and its ordered project paths. Use the current revision.
The same edit is available in the human Inspector and supports undo. Frame 0 is
the first image; a scalar wire can select the frame or drive image rotation.
Wrap meaningful groups with `component.wrap`; the existing Enter graph and Up
actions expose their internals. Image viewers consume accepted outputs, and the
Viewers switch stops their observations. See [the image contract and worked
example](studio-image-composition.md) before authoring image scripts.

## Host automation identity

Studio as a plug-in publishes 2,048 stable continuous 0–1 slots; internal graphs
and controls are unrestricted. Preserve `hostAssignments` through edits, wrapping,
undo and save. Deleted controls keep reservations, including unnamed bindings;
never recycle them for unrelated controls. `hostBindings: []` explicitly exposes
no controls. Exported products use the exact active list, with authored names,
ranges and types. Read [the host contract](studio-host-automation.md) before
changing automation assignments or implementing a serializer.
