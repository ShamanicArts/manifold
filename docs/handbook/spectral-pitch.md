# Move sound through the spectrum

A phase vocoder works on short overlapping windows of sound. Here, Manifold's spectral processor shifts a 220 Hz sawtooth from an oscillator in the same graph; the website displays the result. Start with the fully wet sound, then compare it with the dry source.

```manifold-example
spectral
```

## Hear and see the change

1. Choose **Down an octave**. The fundamental should move from 220 Hz towards **110 Hz**. Its harmonics move with it.
2. Choose **Up a fifth**. Seven semitones corresponds to a frequency multiplier of about 1.498, so the fundamental moves towards **330 Hz**.
3. Choose **Dry / wet octave**. You are hearing the original and the transposed signal together. Sweep the mix, then return to fully wet to separate the two spectra.

The readout finds peaks in a finite-resolution FFT of the actual output. A strong harmonic may appear before the fundamental in that list. Use the whole trace and your ears rather than treating the first number as a pitch detector.

## What the example exposes

Open **Source**. There is one processing node between the saw oscillator and Output. Its **Pitch** endpoint is in semitones; its **Wet mix** endpoint crossfades the processed result with the input. The source sets FFT order 11 before the host prepares audio.

```js
import { createDevice, phaseVocoder } from 'manifold';

const device = createDevice({ id: 'spectral-shift', name: 'Spectral transposition' });
const spectral = device.add('spectral', phaseVocoder);
spectral.configure({ fftOrder: 11 });

const pitch = device.control('pitch', spectral.parameters.pitchSemitones, {
  label: 'Pitch',
  min: -12,
  max: 12,
  default: 7,
  unit: 'semitones',
});
```

`device` and `spectral` are local JavaScript names chosen by this example. The imported `phaseVocoder` is Manifold's processor definition; `device.add` creates an instance with the stable identity `'spectral'`. You can rename the local variables consistently without changing that identity. See [imports, definitions and instances](/learn/concepts/#import-the-processors-you-use).

The device owns its public `pitch` control. The underlying processor parameter is `spectral.parameters.pitchSemitones`. Declaring the control once supplies its range, default, label and unit to the page and Studio's default presentation.

The stable path `/pitch` lets the page, inspector or agent address the same exposed control. The range here is a choice made by this project; it need not expose the processor's entire possible range.

## Why FFT size is different

Order 11 means a **2048-sample FFT**. At 48 kHz that window spans about **42.7 ms**. That duration is not an end-to-end latency measurement: overlap, processing and host buffering also matter.

Larger windows improve frequency resolution but spread information over more time. Fast attacks can smear, and pitch-shifted sound can acquire spectral artifacts. This lesson is an invitation to hear those tradeoffs, not a claim of transparent transposition for every input.

FFT resources are prepared before processing. This page deliberately makes pitch and mix live controls while keeping FFT size in source. Audio callbacks should not allocate FFT buffers because a slider moved.

## Use a different source

The graph contains its quiet saw oscillator. Edit that node's frequency or replace its connection with a declared live input. The [source laboratory](/learn/audio-sources/) demonstrates saw, noise and live audio connected through crossfaders. External Web Audio sources remain supported through the host's declared input bindings.

Saving or opening this lesson in Studio retains both the oscillator and the processing graph. The spectrum canvas belongs to the wiki; the sound belongs to the project.
