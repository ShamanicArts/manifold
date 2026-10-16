# Script-created fields and downstream presentation rules

11 October 2026. Extends the [node source workflow](studio-node-source-navigation.md)
and uses the [Nacre authoring map](studio-nacre-authoring-map.md) to choose a real
object/rule path. It preserves the accepted Studio layout and Nacre's artwork.

## Usable slice

Open **Project → Open example → Standing field & audio-driven relief** in the
browser, or open `web/public/studio/field-rules.manifold.json` in standalone.
The example remains an audio plug-in: **Live input → Gain → Output**.

- **Standing field** produces a 64 × 64 sampled object from Nacre's standing-mode
  expression. Its N/M parameters change the field itself.
- **Level response** maps measured output RMS to energy with Nacre's square-root,
  clamp and exponential follower. The sensitivity and response rate are local
  instance parameters; this is presentation-rate data, not audio-rate CV.
- **Field relief** takes that field and energy, then applies Nacre's sinusoidal
  relief law. Folds, resting depth and audio-driven depth are editable separately.
- **Field comparison** consumes the source and resulting fields, displaying both.
  Its Canvas implementation uses the same data ports another renderer could use.

Selecting any node opens its own script. The Inspector shows its description,
parameters, named typed inputs, connected sources, outputs, downstream consumers
and current scalar value or field size/range. The source is authoritative for
implementation behaviour; the definition's description is authored documentation,
not an automatically inferred formula. Shared-source audio declarations retain
the accepted highlighted navigation pattern.

Draw a cable from Standing field's **field** to Field comparison's **relief** to
bypass the rule. Disconnecting that input clears the result. All edits use the
existing command/revision/history boundary, whether made by canvas, JSON, script
or agent. `/composition.json` remains the editable graph; `/project.json` includes
both audio and composition. The example generator constructs it through public
`component.define/add/update/connect` commands. No hidden per-example graph exists.

## Contract and ownership

Composition version **2** adds `presentation-script` implementations and named
`scalar` and `field2d` outputs. Version 1 surfaces remain supported without
rewriting their saved documents. A typed definition edit upgrades the composition
to version 2. Old hosts reject the newer version rather than dropping its rules.
Native Rust admits the same versioned container; the shared authoring runtime
validates its definitions and wiring before publication.

`field2d` is a detached immutable `{width, height, values}` grid of finite numbers,
row-major, at most 128 × 128. `scalar` is a finite number. A disconnected or
unavailable value is `null`. Audio Output's `analysis` adapter remains the source
of measured RMS/peak/bands; scripts cannot invent audio analysis output ports.
Port types must match, each input accepts one source, and cycles are rejected.
Multiple consumers can share one field. Removing a node removes both inbound and
outbound cables. There are no arbitrary definition, instance or cable limits. Field samples are frame values, not saved project assets.

Each presentation script's default factory returns:

```js
export default function createRule() {
  return {
    evaluate(api, frame) {
      const field = api.input('field');
      const amount = api.parameter('amount');
      // Return every declared output, or null when unavailable.
      return { result: field && {
        width: field.width, height: field.height,
        values: field.values.map(value => value * amount),
      } };
    },
    // Optional dispose() releases resources owned by this instance.
  };
}
```

The shared presentation executor advances scripts in dependency order once per
render frame, then calls optional `update(frame)` on mounted web surfaces.
`frame.time` is presentation time in seconds; `delta` is clamped to 0–0.05 seconds.
Existing surfaces that schedule their own animation remain supported. Data is
validated and frozen before it reaches a downstream consumer. An invalid,
throwing or asynchronous evaluate result clears that node's outputs, reports its
identity and allows downstream nodes to handle null. Repair recovers on a later
frame. The executor does not mutate accepted project state or run in the audio
callback.

Factories are per instance. Parameter/wiring edits retain their private transient
state; replacing definition source or its imported helper rebuilds affected
instances. Those transient values reset on a fresh open. Sources, local parameters,
stable IDs and wires are persisted. As before, invalid syntax/module closure is
rejected before acceptance; a runtime failure in syntactically valid authored code
is a presentation error in the accepted document. A failed replacement surface
can retain its prior rendering with an explicit issue. Computation failures never
publish stale outputs as current values.

Browser and Linux standalone use the same executor; standalone runs it in its
embedded webview. Telemetry returns to the shared egui Inspector at 10 Hz outside
the accepted document/revision. A hidden native Presenter reports paused values.
This supplies backend-independent **data**, not portable Three.js/GPU handles,
and does not claim a native Rust graphics implementation. Scripts are trusted
authored code, as in the existing module loader.

## Evidence

- `web/tests/studio-field-rules.test.js` checks the actual Nacre formulas,
  dependency order, immutable fan-out, edits, bypass, disconnect/remove, recall,
  undo, atomic type/cycle rejection, runtime failure and recovery.
- `crates/manifold-project-js/tests/studio_components.rs` opens the version-2
  document in native QuickJS, edits parameters/wires, rejects a mismatched wire
  and cold-recalls the saved document. Every acknowledgement block and twenty
  subsequent blocks match an untouched audio instance sample-for-sample.
- `web/review-field-rules.mjs` edits the actual source editor, draws a real canvas
  cable, disconnects/reconnects, drives energy with actual Wasm output, changes
  audio gain, and saves/reopens. Audio uses a verified private `none` sink.
- `web/review-field-rules-native.py` opens that browser-saved project on an
  isolated Xvfb, checks the process's null sink, clicks nodes/ports, edits local
  values/source, checks rendered pixels and separate source/result images, then
  saves/reopens. Native WebKit initially reused a shared backing image for both
  panels; independent panel buffers fix the observed discrepancy.
- The standalone-edited save also reopens in the browser with its changed formula,
  local parameters, connections and rendered result intact. The preceding
  source-navigation GUI regression still passes, including optional source
  visibility, draft retention and human/agent edit conflicts.

Final screenshots and check results are under
`web/public/studio/2026-10-11-field-rules/`. These are Studio browser/standalone
checks, not a new DAW/CLAP/VST3 certification run.

The affected JavaScript tests pass 11/11, native QuickJS component tests 2/2 and
app/shared-UI tests 6/6. TypeScript, generated-package/example freshness, release
standalone, audio/UI Wasm and production web builds pass. Full JavaScript tests
pass 144/145; the existing creative-example gain maximum mismatch remains.
`cargo test --workspace` reaches the native crate at 134/136 and stops on the two
previously recorded gain-range expectations; it does not complete the remaining
workspace suites. Those known failures are retained in `checks.json`.

## Remaining scope

This is the first real object → rule → renderer path. It does not yet expose
Nacre's hand, eye, scene hierarchy, materials or interaction behaviours as objects.
Arbitrary script attachments, reusable nested compositions and interfaces,
renderer-owned resources, richer field/transform types, Rust authoring helpers,
native graphics, audio-rate field sampling and the intended four-dimensional
plug-in remain ahead. Nacre's original implementation and artwork are unchanged.
The framework owns this execution/tooling capability; these Nacre-derived
equations remain custom example scripts rather than newly blessed core devices.

Follow-up: [nested compositions](studio-nested-compositions.md) now supplies
reusable presentation graphs, named interfaces and instance navigation over this
example. The wider remaining scope above is unchanged.
