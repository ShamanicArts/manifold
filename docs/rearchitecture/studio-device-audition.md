# Studio Input graph and the Device export boundary

The **Input graph** is a separate Studio-owned graph, shown in a dock immediately
left of the Device graph when the Device declares audio input. Instruments with
no audio inputs hide it. It supplies test audio to the Device's external input;
it is never included in a plug-in build.

## Controls and graph are two views of the same project

The dock opens on **Controls**: the Input graph's ordinary authored presentation,
rendered with the same Manifold widgets as the Inspector. **Graph** exposes its
nodes, connections, nested graphs, source links and editing tools. Adding or
removing an exposed control in source or through graph editing updates Controls
live. There is no separate hard-coded source-control panel or parameter bank.
Tab selection is part of the saved workspace layout.

The starting graph imports `extendedOscillator`, `noise`, `gain` and `crossfader`
from `manifold`. Waveform selects Sine, Saw, Square, Triangle, Blend, Noise, Pulse
or Supersaw. Frequency and noise colour are editable. Two linear crossfaders
blend oscillator/noise and generated/live input; a final gain sets input level.
These are real prepared Rust DSP nodes in both hosts. The patch is editable like
any other graph, including adding processors and reusable Devices.

Start/Stop and the shared Manifold **Master** slider are in the top application
bar. Settings selects actual microphone/interface hardware. Hardware selection
also appears on the Input graph's Live input Inspector. Master affects Studio's
final listening output, not the saved Device's processing or plug-in controls.

## Ownership and persistence

Browser Studio owns a second `LiveProjectRuntime` and prepared graph host. Native
Studio owns a second `NativeScriptControl` and prepared audio handle. Only PCM
crosses from the Input graph to the Device. UI gestures use the existing latest
intent overlay and acknowledged parameter path; structural edits use the normal
runtime publication path. The audio callback does not compile or allocate.

Saving Studio retains the Input graph as `studio.inputGraph` alongside the Device.
Older projects without that field receive the starter Input graph. Saving a
plug-in captures only the Device; browser export, the build service and the native
packager strip Studio metadata, including Input graph scripts, values and assets.
A generator intentionally authored inside the Device remains part of that Device.

Nacre's built-in audition oscillator and selector have been removed from its
canonical source and linked Studio example. Its effect now receives external
input. Its HOST indicator describes that routing; test-source controls belong to
Studio's Input graph. Existing saved user documents are not rewritten silently.

MCP tools accept `graphTarget: "input"` for Input graph inspection, file editing,
graph operations and parameter changes. Omit it, or use `"device"`, to edit the
Device. Each graph has its own revision; root inspection advertises both under
`studioGraphs`. Use the selected graph's revision for its edits.

## Current limits

Studio currently routes the first Input graph output to the first Device audio
input. Hardware feeds the first Input graph input. Additional input buses are
silent; named bus routing controls remain future work. Changing bus shapes while
running requires restarting the browser audio host or reopening native Studio.
Unsupported sidecar source/bus changes are checked before a native project open
replaces the current Device.

The quick view renders the shared parameter/component presentation. Arbitrary
custom web-surface rendering inside this small dock is not implemented.

## Checks

`web/tests/studio-input-graph.test.js` checks independent editing/revisions,
Studio save/recall, input-dependent dock availability and the actual native
packager's exclusion of Input graph nodes, controls and source. Native signal
tests render Input graph audio through an independent effect, exercise silence
and captured stereo input, and recall the saved graph without changing the Device.
The egui graph regression proves drawing and unrelated edits preserve authored
and initial positions, including overlapping nodes.

`web/review-input-graph.mjs` exercises the actual Studio browser UI on a silent
sink: live control generation, real pointer dragging, source inspection,
saw/noise/live switching, silence, save/restore, stable positions and audio
stop/restart. GUI captures and native review receipts are retained under
`~/.cache/manifold/input-graph-20261013/`. Packaging checks do not replace a fresh
exported Nacre CLAP/VST3 DAW acceptance run.

Acceptance results: **575 Rust workspace tests and 198 web tests pass**; final
native/UI checks, DSP/UI Wasm, native release and production website builds pass.
Browser Nacre rendered all eight Input oscillator waveforms, and both native
starter and browser Nacre passed actual Controls/Inspector drags, automatic
control generation, audio stop/restart and Studio save/reopen. The browser
reported zero Rust processing failures and callback allocations in both graphs.
See the [machine-readable receipt](evidence/2026-10-13-studio-input-graph.json).

**Closed 13 October:** full native Nacre now loads, renders and accepts live visual edits/undo. The saved JSON string remained reachable after parsing, exhausting the bounded QuickJS heap. Releasing that duplicate fixes loading without increasing the 32 MiB cap. See [the visual-object acceptance record](studio-nacre-visual-objects.md).

Historical failure: the 4.7 MB linked document fails
QuickJS loading with `QuickJS library created a unknown error`. The pre-change
file and current file both fail; both load when only embedded base64 asset
payloads are removed (about 100 KB remains). That isolated the failure to asset-loading pressure under the native runtime’s
32 MiB heap limit. The retained raw document was subsequently identified as the
cause and removed, with full-project load/edit/undo coverage. No runtime
memory/time limits were raised.
