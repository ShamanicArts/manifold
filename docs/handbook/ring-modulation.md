# Make metallic sidebands

Two simple sine waves can make a sound that neither oscillator produces alone. A ring modulator multiplies them. With sine inputs at frequencies **a** and **b**, the fully wet result contains their **sum** and **difference**: **a + b** and **|a − b|**.

Start audio, then try **Metallic**. Listen to how a small change to the second oscillator changes the character of the sound. The trace below is measured from the real Manifold output; it is not a diagram of the formula.

```manifold-example
ring
```

## Three things to try

1. **Find the new frequencies.** Choose **Hollow fifth**: carrier 220 Hz, modulator 110 Hz, wet mix 1. Look for peaks near **110 Hz** and **330 Hz**. FFT bins have finite resolution, so the displayed estimates will be nearby rather than exact.
2. **Break the simple ratio.** Choose **Metallic**, or set the modulator to 173 Hz. The new components are near **47 Hz** and **393 Hz**. Listen for the less familiar relationship between them.
3. **Bring the original back.** Move Wet mix towards zero. The 220 Hz carrier returns. At zero you hear the carrier; changing the modulator should no longer change that dry signal.

The oscillator and output levels are deliberately modest. Mixing signals changes measured level as well as timbre; a wet/dry comparison is not automatically loudness matched.

## Read the patch from left to right

Open **Graph**. Two oscillator nodes feed the ring modulator's named `carrier` and `modulator` inputs. Its output passes through a gain stage before Output. The page supplies no oscillator here: both sources are actual Manifold DSP nodes.

Select an oscillator to reveal the highlighted declaration in **Source**. The code has three jobs: create the nodes, expose a few controls, then connect the signal path. The comments and blank lines separate those jobs.

Its imports name all three processor definitions: `oscillator`, `ringModulator` and `gain`. Both `carrier` and `modulator` are created from the same imported `oscillator` definition, but each has its own frequency and level. The quoted names `'carrier'` and `'modulator'` give those instances stable identities. The unquoted local variable names let this JavaScript refer to them. See [imports, definitions and instances](/learn/concepts/#import-the-processors-you-use).

```js
// Connect one signal to each named audio input.
device.connect(carrier.outputs.out, ring.inputs.carrier);
device.connect(modulator.outputs.out, ring.inputs.modulator);
```

`carrier` and `modulator` are local names for processor instances. Their `outputs` members and the ring modulator’s `inputs` members expose typed ports; `device.connect` joins them. `device` is the ordinary JavaScript name chosen for this Device, not a required keyword. This JavaScript assembles a graph that Rust processes. It is not a JavaScript sample-processing loop.

## Keep your version

Change the frequencies and choose **Save project**, or **Open in Manifold Studio**. Studio receives the accepted source and parameter values. Its audio starts stopped; this project generates its own tones, so it does not need microphone input. Its simple parameter view is available, but this lesson does not create a bespoke instrument face.

Studio’s existing graph wrapping workflow is described in [Build a graph inside a node](/learn/studio-graphs/). To hear a different way of changing frequencies, try [spectral transposition](/learn/spectral-pitch/).
