# Build a reusable sound

A useful patch should be something you can name, reuse and open again. Here a filter and a level stage become one Device. The outer Device contains a saw oscillator and two independent instances of it.

```manifold-example
reusable
```

## Hear the two stages

Start audio. Open the first filter towards 8000 Hz while leaving the second near 600 Hz: the second still limits the sound. Reverse their positions. Both filters shape the same sawtooth because they are connected in series.

The two brightness sliders control different instances. Changing one never changes the other's value. The two level stages each multiply amplitude by 0.7, so together they also reduce the signal's level.

## Enter the sound

Open **Graph**, then choose **Enter first** or **Enter second** in its toolbar. You will see the actual filter, level stage, input and output boundary. Select the filter to highlight its shared source declaration. **Parent graph** returns to the chain.

Studio provides the same scope relationship in its main graph and Explorer. Select a reusable node and use **Enter graph**. Its inspector shows that instance's parameters; opening its declaration lets you edit the common implementation.

## A definition and its instances

The exact source beside this lesson contains the complete inner Device. These lines reuse it:

```js
const device = createDevice({ id: 'double-filter', name: 'Two Filter Stages' });
const output = device.output('audio', audio.stereo);
const tone = device.add('tone', sawOscillator);
tone.configure({ frequency: 220, level: 0.12 });
const first = device.add('first', filterStage);
const second = device.add('second', filterStage);
second.configure({ brightness: 600 });

device.connect(tone.outputs.out, first.inputs.audio);
device.connect(first.outputs.audio, second.inputs.audio);
device.connect(second.outputs.audio, output);
```

`filterStage` is the Device declaration created earlier in that file. `first` and `second` are ordinary JavaScript variables referring to two instances. The strings `'first'` and `'second'` are their persistent identities. The runtime prepares separate processing state for each copy.

The inner control `'brightness'` becomes `/first/brightness` and `/second/brightness`. `second.configure` overrides that instance's initial brightness. Editing the shared filter implementation changes both instances when the new source is accepted.

## Decide which controls to bring forward

The outer Device exposes inner controls automatically. You can also promote a particular inner control to a name that suits the whole instrument:

```js
const brightness = device.control('brightness', first.controls.brightness);
```

That reuses the inner control's label, range, default and unit. It addresses the same parameter through `/brightness`; it does not create a second competing automation binding. The first copy's automatic `/first/brightness` path is replaced by the promoted control. The second copy stays independent.

Declare a custom outer label or range with the optional third argument when the outer instrument has a different musical purpose. Address the promoted control reference when hosting that version of the device.

## Make a Device from an existing selection

In Studio, select processors in the same graph and choose **Wrap as node**. The source adapter writes a named Device declaration, its input/output boundaries, the contained processors and their connections. It then adds an instance to the original graph. Already exposed outer controls and their accepted values are retained. Wrapping changes contained processors’ semantic paths; transient processing history, such as oscillator phase or a held voice, can restart. Save before reorganizing a performance that depends on that history.

Try **Add another instance** in the inspector, wire the new instance into the chain, save a portable project, then reopen it. Check both control values and both sets of boundary wires.

The adapter handles explicit top-level Device declarations. If the selected processors depend on custom helper logic that cannot be safely extracted, Studio rejects the wrap and leaves the accepted project intact. Use Source to move that logic deliberately. Arbitrary JavaScript remains a valid way to author; the graph does not have to rewrite every possible program.

## What runs in audio

Containers are authoring structure. The Device hierarchy lowers to the same flat Rust graph contract used by the rest of Manifold. It does not add a nested JavaScript interpreter to the audio callback.

Nested audio/MIDI input connections and audio outputs are supported, including input fan-out. Recursive containment is rejected, and composition is bounded. General control-signal interfaces, MIDI output buses, unwrapping and publishing reusable packs remain further work. Use the expert graph API when an existing advanced project needs a capability that the Device facade has not exposed yet.
