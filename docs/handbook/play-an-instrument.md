# Play and shape an instrument

An instrument turns a performance into sound. This one starts with MIDI notes, gives each note a soft envelope, then passes the voice through a low-pass filter. The buttons below send real notes to Manifold's audio engine.

```manifold-example
instrument
```

## Play first, then look inside

Choose **Start audio**, then play **C4**, **E4** and **G4**. Each button holds a note for 450 milliseconds before releasing it. You can overlap different notes.

Turn **Release** towards two seconds and play another note. Its tail continues after the button releases. Turn Release down again for a short, more percussive ending. This changes the envelope's release time; it does not change how long the website holds the key.

Move **Brightness** below the note's frequency. The filter begins removing that note. The voice uses its default sine waveform, so this is a round, simple tone; try the [ring-modulation experiment](/learn/ring-modulation/) for a sound with richer sidebands.

## Read the declaration

Open **Source** beside the running example. Its first statements introduce three things:

```js
import { createInstrument, voiceSynth, lowPassFilter } from 'manifold';

const instrument = createInstrument({ id: 'soft-keys', name: 'Soft Keys' });
const voice = instrument.add('voice', voiceSynth);
const filter = instrument.add('filter', lowPassFilter);
```

`import` brings named tools into this file. `voiceSynth` is a processor definition supplied by Manifold. `instrument.add` makes a particular voice from that definition.

`const voice` gives the resulting instance an ordinary JavaScript name. You chose that name: `sound` would also work if you changed its later uses consistently. The quoted `'voice'` is its stable identity inside the instrument. Keep that identity when you want saved state to continue referring to the same processor.

The next connections describe the performance in order:

```js
instrument.connect(instrument.inputs.midi, voice.inputs.midi);
instrument.connect(voice.outputs.out, filter.inputs.audio);
instrument.connect(filter.outputs.out, instrument.outputs.audio);
```

MIDI carries note events. Audio carries the resulting sound. The first wire carries MIDI; the other two carry audio. Connecting a MIDI output to an audio input is rejected before a running graph changes.

## Initial settings and live controls

`voice.configure` declares the initial envelope and level. Configuration does not reach into an already playing host. To let someone change a parameter during performance, declare a Device control, then address that control through the host or Studio.

```js
const release = instrument.control('release', voice.parameters.release, {
  label: 'Release',
  min: 0.02,
  max: 2,
  default: 0.35,
  unit: 's',
});
```

This is the single declaration of the control's range, initial value and unit. The website and Studio read it. `release` is your local reference to that control; `/release` is its stable project path.

## Host the instrument on your website

The application owns its AudioContext and the decision to start audio. Prepare the instrument after a user gesture and connect the output to your application's audio destination:

```js
import instrument from './instrument.mjs';
import { BrowserDeviceHost } from 'manifold/browser';

const context = new AudioContext();
await context.resume();
const host = await new BrowserDeviceHost(context).prepare(instrument);
host.connectOutput('audio', context.destination);

await host.sendMidi('midi', { type: 'noteOn', note: 60, velocity: 100 });
// When the player's key is released:
await host.sendMidi('midi', { type: 'noteOff', note: 60 });
```

Note 60 is MIDI's pitch number for middle C. Velocity 100 describes how strongly the note was played on MIDI's 0–127 scale. Those numbers describe the performance; Manifold selects the graph's internal event destination from the named `'midi'` input.

`allNotesOff` releases held notes. `pitchBend` accepts a 14-bit `value`, with 8192 at the centre; whether it changes the sound depends on the connected processor. The facade supports the current host's one MIDI input. Browser MIDI hardware access and device permission remain the application's responsibility.

Close the host when you remove the instrument, then close the AudioContext if your application owns it. See [browser hosting](/learn/browser-host/) for required Wasm assets, cross-origin isolation and lifetime rules.

## Continue in Studio

Choose **Open in Manifold Studio**. Select the voice in the graph to inspect its parameters and jump to the highlighted `instrument.add` statement. Edit the initial envelope in Source, apply, and inspect the accepted result. Exposed controls also appear in the default Presenter.

Studio routes its selected MIDI input to the Device’s declared MIDI input. Notes, sustain, pitch bend and panic use the existing engine event queue. Disconnecting an input releases its notes while retaining notes held by another owner, such as an agent. Held notes are performance state and are not replayed on project reopen.

The lesson's note buttons belong to this website. They are not exported as the plug-in's artwork. Your instrument retains its MIDI input, audio graph and controls, and the destination host supplies the performance input.
