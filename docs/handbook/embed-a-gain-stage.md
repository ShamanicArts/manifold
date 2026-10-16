# Embed a gain stage

Embed a small Manifold graph into your own page. This example contains a real sine oscillator and a gain stage. Its source, graph, live controls and saved Studio project all describe the same sound.

## Try the effect

Select **Start audio**, then change Gain. At `1` the gain stage leaves the oscillator's amplitude unchanged; at `0.5` it halves it; at `0` its output is silent. The scope measures actual output with a fixed scale.

```manifold-example
gain
```

The oscillator is configured to a quiet level of `0.12` at `220 Hz`. Those settings belong to the oscillator in the graph. The gain control demonstrates attenuation; it does not control your computer's system volume.

## Read the graph

Open **Graph** and follow Tone → Level → Audio output. Select a processor to reveal its declaration in **Source**. The highlighted source is the exact running [gain.mjs](/learn/examples/gain.mjs).

```js
import { createDevice, audio, sineOscillator, gain } from 'manifold';

const device = createDevice({ id: 'gain-stage', name: 'Gain stage' });
const output = device.output('audio', audio.stereo);
const tone = device.add('tone', sineOscillator);
tone.configure({ frequency: 220, level: 0.12 });
const level = device.add('level', gain);
```

`const` is JavaScript. `device`, `tone`, `level` and `output` are ordinary local names chosen by this script. Each later `device.connect(...)` refers to the object declared above. You can rename a local variable if you update its uses consistently.

`sineOscillator` and `gain` are imported processor definitions. The quoted `'tone'` and `'level'` are stable authored identities for particular instances. The imported `audio.stereo` describes the output boundary. This Device makes its own sound, so it does not need an audio input.

## Understand the declaration

The example exposes one public control:

```js
export const volume = device.control('level', level.parameters.level, {
  label: 'Gain',
  min: 0,
  max: 1,
  default: 0.65,
  unit: '×',
});
```

The processor's `level` parameter controls amplification. The Device chooses which part of that capability to expose: here, silence through unity gain. `volume` is our local name for that control reference. `export` lets another JavaScript module import the reference.

The range, label, default and unit are declared once. Studio derives its default controls from this declaration; the wiki derives its HTML slider from the same metadata.

```js
device.connect(tone.outputs.out, level.inputs.audio);
device.connect(level.outputs.out, output);
```

These connections are what the graph displays and the Rust audio engine executes.

## Host the effect in your application

`BrowserDeviceHost` accepts the Device and resolves its control references. Your application owns the AudioContext, start/stop interaction and final destination. Call this function from a Start button and retain the returned object:

```js
import device, { volume } from './gain.mjs';
import { BrowserDeviceHost } from 'manifold/browser';

async function startTone() {
  const context = new AudioContext();
  const host = new BrowserDeviceHost(context);
  async function stop() {
    await host.close();
    if (context.state !== 'closed') await context.close();
  }
  try {
    await host.prepare(device);
    host.connectOutput('audio', context.destination);
    await context.resume();
    return {
      setVolume: (value) => host.setControl(volume, value),
      stop,
    };
  } catch (error) {
    await stop();
    throw error;
  }
}
```

`await playing.setVolume(0.25)` changes the running parameter and waits for acceptance. `await playing.stop()` releases the resources. Here `playing` means the object your Start handler kept from `await startTone()`.

This host requires cross-origin isolation and its worklet, worker and Wasm assets. See [AudioContext and graph lifetime](/learn/browser-host/) for deployment details. If your application supplies a shared context, dispose the host without closing that shared context.

The wiki also uses `LiveProjectRuntime` to retain accepted edits, inspect source and save a Studio draft. A fixed embedded graph can use the smaller Device host directly.

## Continue in Studio

**Open in Manifold Studio** creates a separate draft with the same oscillator, gain, source and accepted value. Start audio in Studio's top bar and adjust **Master** for your listening level. The handoff does not start playback.

Select Tone in Studio to inspect its frequency and level. To process external sound instead, declare an audio input and connect it to the gain stage. The [audio sources lesson](/learn/audio-sources/) shows live input alongside saw and noise, with all selection and gain inside the graph. An ordinary effect can use `createEffect` for its conventional stereo input and output; a website can bind another Web Audio node through `host.connectInput`.

## If something does not work

Startup errors appear below the example. Check HTTPS or localhost, runtime asset loading and AudioWorklet support. A failed draft save leaves you on the lesson; moving to Studio requires browser storage on this site. Save a portable project when moving between browsers or computers.
