# MidiSynth DSP Signal Chain

## Per-Voice Architecture (×8 voices)

Each voice mixes 4 sources together:

```
┌─────────────────┐
│  OscillatorNode │──┐
│  (Wave/Saw/etc) │  │
└─────────────────┘  │
                     │
┌─────────────────┐  │    ┌──────────────┐
│ NoiseGenerator  │──┤    │              │
│   (global)      │  ├───▶│  VoiceMixer  │──┐
└─────────────────┘  │    │  (4 inputs)  │  │
                     │    │              │  │
┌─────────────────┐  │    └──────────────┘  │
│ SampleRegion    │──┤                      │
│ Playback        │  │                      │
└─────────────────┘  │                      │
                     │                      │
┌──────────────────────────────────────┐  │
│ BLEND CHAIN (only in Blend mode):    │  │
│                                      │  │
│   Osc ──▶ Crossfader ──▶ RingMod  ──▶│  │
│            (Mix A/B)     (Ring FX)   │  │
│                 │                    │  │
│                 ▼                    │  │
│            BitCrusher ──────────────▶│──┘
│             (XOR FX)                 │
└──────────────────────────────────────┘
```

## Master Effects Chain

```
┌─────────┐   ┌─────────────┐   ┌─────────┐   ┌─────────┐
│ 8-Voice │   │             │   │         │   │         │
│  Mixer  │──▶│    SVF      │──▶│  Dist   │──▶│   FX1   │
│ (×8 in) │   │  (Filter)   │   │ (Drive) │   │ (Slot)  │
└─────────┘   └─────────────┘   └─────────┘   └────┬────┘
                                                   │
┌─────────┐   ┌─────────┐   ┌─────────┐   ┌──────┴────┐
│  Gain   │◀──│ Spectrum│◀──│  EQ8    │◀──│    FX2    │
│ (Out)   │   │Analyzer │   │(8-band) │   │   (Slot)  │
└────┬────┘   └─────────┘   └─────────┘   └───────────┘
     │
     │  ┌─────────────┐
     └──▶│ GainNode(2) │──▶ To Looper Layer (optional)
        │   (Send)    │      (for recording)
        └─────────────┘
```

## FX Slot Internal Routing

Each FX slot (FX1, FX2) contains 17 selectable effects in parallel:

```
         ┌──────────┐
         │   Dry    │──────────┐
Source ─▶│  Path    │          │
         └──────────┘          │
                                ▼
         ┌──────────────────────────────────────────────┐
         │           Wet FX Path (17 effects)          │
         │  ┌─────┐  ┌─────┐  ┌─────┐      ┌────────┐ │
         │  │Chor │  │Phas │  │Wave │  …   │Trans   │ │
         │  │us   │  │er   │  │Shap │      │ient    │ │
         │  └──┬──┘  └──┬──┘  └──┬──┘      └───┬────┘ │
         │     └─────────┴────────┴─────────────┘      │
         │              (Mix to one)                    │
         └──────────────────────────────────────────────┘
                                │
                                ▼
                         ┌────────────┐
                    ┌───▶│ Wet/Dry    │──▶ Output
                    │    │  Mixer     │
                    └────│  (mix)     │
                         └────────────┘
```

## Available FX Types (per slot)

| Index | Effect | Description |
|-------|--------|-------------|
| 0 | Chorus | 3-voice chorus with rate/depth |
| 1 | Phaser | Multi-stage phaser |
| 2 | WaveShaper | Distortion/waveshaping |
| 3 | Compressor | Dynamics control |
| 4 | StereoWidener | Stereo field manipulation |
| 5 | Filter | State-variable filter |
| 6 | SVF Filter | Alternative SVF implementation |
| 7 | Reverb | Room reverb (now in FX slot) |
| 8 | Stereo Delay | Ping-pong delay (now in FX slot) |
| 9 | Multitap | Multi-tap delay |
| 10 | Pitch Shift | Pitch shifter |
| 11 | Granulator | Granular synthesis |
| 12 | Ring Mod | Ring modulator |
| 13 | Formant | Formant/vowel filter |
| 14 | EQ | 3-band EQ |
| 15 | Limiter | Peak limiter |
| 16 | Transient | Transient shaper |

## Sample Capture Sources

```
Live Input ──▶[+12dB]──▶ RetrospectiveCapture
                              │
Layer 1 ──────▶[+12dB]──▶ RetrospectiveCapture
                              │
Layer 2 ──────▶[+12dB]──▶ RetrospectiveCapture
                              │
Layer 3 ──────▶[+12dB]──▶ RetrospectiveCapture
                              │
Layer 4 ──────▶[+12dB]──▶ RetrospectiveCapture
                              │
                              ▼
                    (Copied to SampleRegionPlayback
                     for each voice when triggered)
```

## Key Parameters

| Path | Range | Default | Description |
|------|-------|---------|-------------|
| `/midi/synth/osc/mode` | 0-2 | 0 | 0=Classic, 1=Sample, 2=Blend |
| `/midi/synth/waveform` | 0-7 | 1 | Oscillator waveform |
| `/midi/synth/cutoff` | 80-16000 | 3200 | Filter cutoff |
| `/midi/synth/fx1/type` | 0-16 | 0 | FX1 effect type |
| `/midi/synth/fx1/mix` | 0-1 | 0 | FX1 wet/dry mix |
| `/midi/synth/fx2/type` | 0-16 | 0 | FX2 effect type |
| `/midi/synth/fx2/mix` | 0-1 | 0 | FX2 wet/dry mix |
| `/midi/synth/output` | 0-1 | 0.8 | Master output gain |

## Removed from Chain

- ~~StereoDelayNode (fixed chain position)~~ → Now available in FX slots
- ~~ReverbNode (fixed chain position)~~ → Now available in FX slots
