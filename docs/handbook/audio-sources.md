# Choose and blend audio sources

A saw oscillator makes sound. Noise makes sound. Live input brings sound from outside the project. Here they are ordinary graph objects, connected through two crossfaders. Their parameters and wires are part of the saved project.

```manifold-example
sources
```

## Follow the sound

Start audio, then open **Graph**. Follow Saw and Noise into **saw-or-noise**, then follow that output and Live input into **generated-or-live**. The final gain controls this patch's output. Select any processor to find its declaration in the highlighted source.

The first blend at `−1` selects Saw; at `+1` it selects Noise. Values between them mix both. The second blend at `−1` selects that generated sound; at `+1` it selects Live. These are two instances of Manifold's existing crossfader utility. Unselected generators remain running; this example does not claim to suspend their processing.

Change **Saw frequency** and hear the pitch move. Change **Noise color** and **Noise level** to shape the noise. **Live input gain** belongs to the gain node immediately after the input boundary. Set **Patch level** to zero for silence. These controls address the same parameters you can inspect in Studio.

## Connect real input

The microphone button requests browser permission and binds the chosen device to the graph's `live` input. Select Live with the second crossfader to hear it. Disconnecting the microphone leaves that boundary silent; the saw and noise still work.

In Studio, choose the microphone or interface in **Settings → Audio hardware**. In a plug-in, the DAW supplies the input bus. Hardware selection belongs to the host; signal generation, gain and blending belong to the project. Studio's **Master** sets the final listening level for whichever project is open and is not exported as a project parameter.

## Read the names

```js
import { createDevice, audio, sawOscillator } from 'manifold';

const device = createDevice({ id: 'source-demo', name: 'Source demo' });
const liveInput = device.input('live', audio.stereo);
const saw = device.add('saw', sawOscillator);
saw.configure({ frequency: 220, level: 0.15 });
```

`device`, `liveInput` and `saw` are ordinary JavaScript variables chosen by the author. The quoted `'live'` and `'saw'` are stable identities inside this Device. `sawOscillator` is the imported definition; `.input`, `.add` and `.configure` are Manifold operations. The named saw definition uses the oscillator processor with its saw waveform selected; its frequency and other parameters remain editable.

## Make it your own

Open the example in Studio. Select the processors you want to reuse and choose **Wrap as node**; Studio declares a Device with the necessary boundary connections. Enter that node to inspect its inner graph. Save and reopen to retain both its authored connections and accepted parameter values.

This patch is an example, not a mandatory part of every project. A blank effect can simply connect live input to output. A synthesizer can contain its own sound generators. An embedded website can connect another Web Audio source to a declared input through the public host API.
