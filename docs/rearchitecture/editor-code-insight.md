# Live editor code insight and colors

2 October 2026. The shared CodeMirror editor in DspLiveScripting, Filter,
StandaloneOsc and Main Wave now includes:

- Semantic hover: signature, documentation when present, import provenance, and
  the real type declaration with its file/line and an expandable source preview.
- Highlighting of the hovered symbol, and navigation to definitions in the sketch.
  Select a word and use **Inspect symbol** for the same information on touch devices.
- Completion based on actual JS inference and Manifold declarations, including
  imported aliases, namespaces, node members and named DSP parameters. Ctrl+Space
  requests it explicitly. This replaces the former flat list of API words.
- Inline swatches for quoted CSS hex colors. Click a square for an accessible
  picker with RGB sliders, a hex field and presets. Changes edit the script;
  **Apply live** publishes them through the normal graph/UI transaction. Text
  undo remains available in the editor. Short colors expand; RGB edits preserve
  an existing alpha channel. Manifold's portable styles still require six-digit
  colors; the editor does not weaken that validation.

[Live example](https://wubulon.tailfac9f9.ts.net:4174/primitives.html?program=ui-styled-tone)
· [Browser evidence](https://wubulon.tailfac9f9.ts.net:4174/editor-insight/2026-10-02/browser-report.json)

## Implementation

`web/src/authoring/insight-worker.js` embeds the checked-in author/UI `.d.ts` and
`.d.mts` files, their real package export maps and TypeScript's standard libraries.
`insight-service.js` supplies a virtual workspace to the installed TypeScript
language service. It never evaluates a sketch. Semantic queries run in a dedicated
Worker, outside both the UI thread and the audio callback. No remote language
server, language-model request or external documentation fetch is required.
The worker asset is about 6.85 MB before compression and loads on the first
semantic query; subsequent queries reuse its workspace. The Vite server gives
this worker the same isolation headers required by the audio workers.

`code-insight.js` adapts async hover and completion to CodeMirror, discarding stale
hover results after document edits. Imported names use TypeScript's symbol table
so lexical shadowing is respected. Locations identify declarations, not the Rust
DSP implementation. Local definitions navigate inside the editor; dependency
snippets are read-only. This delivers language-service features; there is no LSP
wire-protocol server or full diagnostics/refactoring client in this increment.

`color-swatches.js` reads literal boundaries from CodeMirror's JS syntax tree.
Comments, URLs and partial/non-color strings do not gain swatches. Picker ranges
map through other edits, close if their literal is replaced, and use ordinary
undoable document transactions. Partial invalid hex input stays editable and does
not overwrite the source. Picker focus and labels support keyboard interaction.

## Verification

Three additional checks exercise real semantic alias/namespace/local type
resolution, lexical shadowing, named parameter completion in incomplete code,
fresh edited source, and color/alpha parsing. **104 web checks pass** and the web
package builds. Actual BB review records hover/declaration information, parameter
completion and picker source edits alongside a sounding instrument. Accepted UI
colors change while the same private audio stream keeps running.

The native egui app's Rust source editor remains its existing editor. The new
CodeMirror features apply to the shared web editor, including its existing native
web-editor adapter; this does not claim a native egui language-service integration.
