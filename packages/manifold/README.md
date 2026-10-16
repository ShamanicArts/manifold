# Manifold

Manifold is an audio plug-in library and framework for musicians, developers and
agents. Manifold Studio is the authoring environment built with it. A website can
embed an effect without adopting Studio.

This is the repository-local JavaScript/TypeScript package. It is not yet an npm
release. Existing `@manifold/author` imports remain compatible while public
examples move to the Device API.

```js
import { createEffect, phaseVocoder } from 'manifold';

const effect = createEffect({ id: 'spectral-shift', name: 'Spectral Shift' });
const spectral = effect.add('spectral', phaseVocoder);
spectral.configure({ fftOrder: 11 });

export const pitch = effect.control('pitch', spectral.parameters.pitchSemitones, {
  label: 'Pitch',
  min: -12,
  max: 12,
  default: 7,
  unit: 'semitones',
});

effect.connect(effect.inputs.audio, spectral.inputs.audio);
effect.connect(spectral.outputs.out, effect.outputs.audio);
export default effect;
```

`effect` and `spectral` are local JavaScript names chosen by the author. The
quoted `'spectral'` is persistent identity inside the Device. `phaseVocoder`
is an imported processor definition; `add` is a Manifold method. Renaming a local
variable consistently does not change persistent identity. `configure` declares
initial state; a host applies live changes to the resulting running instance.

`createDevice` declares explicit boundaries. `createEffect` adds conventional
stereo audio input/output; `createInstrument` adds MIDI input/stereo output.
All three produce the same extensible Device declaration. Controls describe the
public musical interface once and produce a default Studio presentation.

| Import | Purpose |
| --- | --- |
| `manifold` | Device factories, audio/MIDI boundary definitions, rich processor definitions |
| `manifold/browser` | `BrowserDeviceHost` for a Device, `BrowserGraphHost` for an existing graph |
| `manifold/live-project` | Source evaluation, accepted edits and portable live-project state |
| `manifold/graph` | Expert graph inspection, transformations and detached Device lowering |

`BrowserDeviceHost` prepares a Device in a caller-owned AudioContext. Connect its
named buses, then call `await host.setControl(pitch, 3)` with the original control
reference. Mono Web Audio sources are mixed into the declared stereo bus using
Web Audio's speaker rules. Each host owns independent runtime state. `close()`
releases its runtime and routes; it leaves the caller's context open.

Browser Device hosting currently requires cross-origin isolation, AudioWorklet,
and the prepared Wasm/worker assets. See the [embedding lesson](../../docs/handbook/embed-a-gain-stage.md)
and [host lifecycle guide](../../docs/handbook/browser-host.md) for complete startup
and cleanup. The runtime is shared with existing graph hosting; this package does
not own another DSP engine.

The Device API currently supports stereo audio buses, one MIDI input, named
processor parameters and controls, nested Devices, constructor configuration and
structural source editing. Higher-level asset loading and custom presentation
helpers remain further work. Existing expert graph projects retain
those workflows where already supported. A library definition being importable
is not a promise that every host supports all its processing capabilities.

## Reuse and inspect a Device

Pass a Device declaration to `effect.add('first', filterStage)` just as you pass
an imported processor definition. Its instance has named `inputs`, `outputs`,
`controls` and `configure`. Two instances own independent DSP state. Studio
projects retain the hierarchy for graph entry and source navigation, while the
existing flat graph contract remains the execution authority. See
`examples/reusable.js` and the wiki's reusable-Device lesson.

Studio's starter and graph source adapter now use this API. Explicit top-level
Device programs support add/remove/connect/disconnect, place/group, control
exposure, wrap and repeated instances. More dynamic programs remain editable in
source; an unsafe structural rewrite is rejected atomically. `place` and `group`
are optional editor metadata and have no DSP effect.

`BrowserDeviceHost.sendMidi('midi', {type:'noteOn',note:60,velocity:100})` resolves
the declared MIDI input. Send `noteOff` on release; `allNotesOff` releases all
held notes. `pitchBend` takes a 14-bit `value` (centre 8192), whose interpretation
belongs to the destination processor. No browser permission or MIDI hardware
ownership is implied by these methods.

`add` accepts optional `{config}` for processor constructor resources/ports.
`control` also accepts an optional `style` with `accent`, `background` and `text`
six-digit hex colours. These use the shared Manifold controls in both the
Inspector and authored panels; no separate widget implementation is needed.

`configure` declares initial parameter values, or a nested instance's initial
control values. Existing expert host services remain the resource-loading path;
the Device facade does not yet cover every sample/transport/presentation API.
