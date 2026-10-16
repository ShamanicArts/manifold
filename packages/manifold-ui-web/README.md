# Manifold web UI kit

Presentation reads the project model. The audio engine and host own sound;
controls send edits to the same named endpoints used by scripts and automation.

## Inspector and authored face

`mountProjectView` produces an automatic retained inspector from `view`
declarations. The existing egui projection consumes the same component model.
An authored `webView` can define a separate instrument face using HTML/CSS,
Three.js or other modules supplied by its host.

See [`ui-orbit.mjs`](../manifold-author/examples/ui-orbit.mjs) for a complete
readable example: explicit imports, named inputs, Rust primitive composition,
automatically ordered inspector, layout data and a separate view module.

Inside an authored view module:

```js
import { mountControlPanel } from '@manifold/ui-web/control-panel';

export default function createView() {
  return {
    mount(element, api) {
      const controls = mountControlPanel(element, api, { accent: '#dfae77' });
      return { dispose: () => controls.dispose() };
    },
  };
}
```

Declare the dependency as `{'@manifold/ui-web/control-panel': '0.1.0'}` in
`webView.dependencies`. The host provides the pinned module; the factory's code
runs in the presentation host. It never runs in the audio callback.

`api.layout` places kit controls with `{path,x,y,width}` percentages inside the
panel. `api.value(path)`, `api.set(path,value)` and `api.subscribe(listener)` use
the shared accepted project/gesture state. Mapped controls use `control.set`;
DSP endpoints use `parameter.set`. Disposal releases the kit's subscription and
resize observer. Slider pointer/keyboard behavior comes from the existing kit.

Each component's `style: {accent, background, text}` supplies its own two-tone
slider palette. The filled portion uses `accent`; the remaining portion uses
`background`. Panel options provide fallbacks, and a layout item's `accent`
overrides the component accent. The same authored palette can therefore appear
in the inspector and in a projected custom face.

The same filled sliders support presentation options without changing their
parameter bindings. For an instrument with frequency controls:

```js
const controls = mountControlPanel(element, api, {
  accent: '#a5c4c6', background: '#28343e', text: '#dbe4ec',
  height: 44, fontSize: 11, showChoiceLabels: true,
  scales: { '/synth/pitch': 'log', '/synth/cutoff': 'log' },
  formatters: { '/synth/pitch': value => Math.round(value) + ' Hz' },
});
```

Logarithmic mapping requires a positive minimum. Shift-drag moves relative to
the current value for fine adjustment; Shift-arrow also reduces the step.
Double-click resets the authored default. Formatters change displayed text;
accepted values, exports and automation remain in the endpoint's original units.

For the first studio positioning tool, declare a literal `presentationLayout`
at module scope and return it as `webView.layout`. Arrange controls writes one
accepted source transaction. Direct source authoring remains available, including
fully custom UI without this declaration. `webView.role: 'instrument'` opens the
exported native editor on the face, with Inspector and Script available on demand.

For a compact panel, each layout entry can include `compact: {x, y, width}`.
Pass `variant: 'compact'` to `mountControlPanel`; the same control identity and
parameter binding are retained. Arrange edits the displayed variant, so a compact
drag does not replace the full-width placement. These coordinates are authored
data and survive save/export/recall.

A custom view can return `updateLayout()` from `mount()` to opt into updating
its controls without rebuilding its renderer. The host's `updateDefinition()`
updates `api.layout` and calls this hook when source/dependencies/role match;
source changes still mount a new view. Nacre uses this to keep its liquid field,
particles and GPU canvas alive during arrangement.

This positioning tool handles existing controls; a general insertion/style/
resizing editor remains future work. The current face adapter is retained web UI;
the immediate inspector remains available beside it.
