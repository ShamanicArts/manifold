# MidiSynth OSC Endpoints

Generated from live OSCQuery.

| Path | Type | Access | Range | Description |
|---|---|---:|---|---|
| `/midi/synth/adsr/attack` | `f` | 3 | 0.0 .. 5.0 | ADSR attack |
| `/midi/synth/adsr/decay` | `f` | 3 | 0.0 .. 5.0 | ADSR decay |
| `/midi/synth/adsr/release` | `f` | 3 | 0.0 .. 10.0 | ADSR release |
| `/midi/synth/adsr/sustain` | `f` | 3 | 0 .. 1 | ADSR sustain |
| `/midi/synth/cutoff` | `f` | 3 | 80 .. 16000 | Filter cutoff |
| `/midi/synth/delay/feedback` | `f` | 3 | 0.0 .. 1.0 | Delay feedback |
| `/midi/synth/delay/mix` | `f` | 3 | 0 .. 1 | Delay mix |
| `/midi/synth/delay/timeL` | `f` | 3 | 10 .. 2000 | Delay time left |
| `/midi/synth/delay/timeR` | `f` | 3 | 10 .. 2000 | Delay time right |
| `/midi/synth/drive` | `f` | 3 | 0 .. 20 | Drive amount |
| `/midi/synth/filterType` | `f` | 3 | 0 .. 3 | Filter type |
| `/midi/synth/fx1/mix` | `f` | 3 | 0 .. 1 | FX1 wet/dry |
| `/midi/synth/fx1/p/0` | `f` | 3 | 0 .. 1 | FX1 param 0 |
| `/midi/synth/fx1/p/1` | `f` | 3 | 0 .. 1 | FX1 param 1 |
| `/midi/synth/fx1/p/2` | `f` | 3 | 0 .. 1 | FX1 param 2 |
| `/midi/synth/fx1/p/3` | `f` | 3 | 0 .. 1 | FX1 param 3 |
| `/midi/synth/fx1/p/4` | `f` | 3 | 0 .. 1 | FX1 param 4 |
| `/midi/synth/fx1/type` | `f` | 3 | 0 .. 16 | FX1 type |
| `/midi/synth/fx2/mix` | `f` | 3 | 0 .. 1 | FX2 wet/dry |
| `/midi/synth/fx2/p/0` | `f` | 3 | 0 .. 1 | FX2 param 0 |
| `/midi/synth/fx2/p/1` | `f` | 3 | 0 .. 1 | FX2 param 1 |
| `/midi/synth/fx2/p/2` | `f` | 3 | 0 .. 1 | FX2 param 2 |
| `/midi/synth/fx2/p/3` | `f` | 3 | 0 .. 1 | FX2 param 3 |
| `/midi/synth/fx2/p/4` | `f` | 3 | 0 .. 1 | FX2 param 4 |
| `/midi/synth/fx2/type` | `f` | 3 | 0 .. 16 | FX2 type |
| `/midi/synth/noise/color` | `f` | 3 | 0 .. 1 | Noise color |
| `/midi/synth/noise/level` | `f` | 3 | 0 .. 1 | Noise level |
| `/midi/synth/osc/mode` | `f` | 3 | 0 .. 1 | Osc mode (0=classic, 1=sample loop) |
| `/midi/synth/output` | `f` | 3 | 0 .. 1 | Output gain |
| `/midi/synth/resonance` | `f` | 3 | 0.1 .. 2.0 | Filter resonance |
| `/midi/synth/reverb/wet` | `f` | 3 | 0 .. 1 | Reverb wet |
| `/midi/synth/sample/captureBars` | `f` | 3 | 0.1 .. 16.0 | Capture length in bars |
| `/midi/synth/sample/captureTrigger` | `f` | 3 | 0 .. 1 | Trigger sample capture from current source |
| `/midi/synth/sample/crossfade` | `f` | 3 | 0.0 .. 0.5 | Boundary crossfade window |
| `/midi/synth/sample/loopLen` | `f` | 3 | 0.1 .. 1.0 | Sample loop length (normalized) |
| `/midi/synth/sample/loopStart` | `f` | 3 | 0.0 .. 0.9 | Sample loop start - green flag (normalized) |
| `/midi/synth/sample/playStart` | `f` | 3 | 0.0 .. 0.9 | Sample play start - yellow flag (normalized) |
| `/midi/synth/sample/retrigger` | `f` | 3 | 0 .. 1 | Retrigger sample from loop start on note-on |
| `/midi/synth/sample/rootNote` | `f` | 3 | 12 .. 96 | Sample root MIDI note |
| `/midi/synth/sample/source` | `f` | 3 | 0 .. 4 | Sample source (0=live, 1..4=layers) |
| `/midi/synth/voice/1/amp` | `f` | 3 | 0.0 .. 0.5 | Voice amplitude 1 |
| `/midi/synth/voice/1/freq` | `f` | 3 | 20 .. 8000 | Voice frequency 1 |
| `/midi/synth/voice/1/gate` | `f` | 3 | 0 .. 1 | Voice gate 1 |
| `/midi/synth/voice/2/amp` | `f` | 3 | 0.0 .. 0.5 | Voice amplitude 2 |
| `/midi/synth/voice/2/freq` | `f` | 3 | 20 .. 8000 | Voice frequency 2 |
| `/midi/synth/voice/2/gate` | `f` | 3 | 0 .. 1 | Voice gate 2 |
| `/midi/synth/voice/3/amp` | `f` | 3 | 0.0 .. 0.5 | Voice amplitude 3 |
| `/midi/synth/voice/3/freq` | `f` | 3 | 20 .. 8000 | Voice frequency 3 |
| `/midi/synth/voice/3/gate` | `f` | 3 | 0 .. 1 | Voice gate 3 |
| `/midi/synth/voice/4/amp` | `f` | 3 | 0.0 .. 0.5 | Voice amplitude 4 |
| `/midi/synth/voice/4/freq` | `f` | 3 | 20 .. 8000 | Voice frequency 4 |
| `/midi/synth/voice/4/gate` | `f` | 3 | 0 .. 1 | Voice gate 4 |
| `/midi/synth/voice/5/amp` | `f` | 3 | 0.0 .. 0.5 | Voice amplitude 5 |
| `/midi/synth/voice/5/freq` | `f` | 3 | 20 .. 8000 | Voice frequency 5 |
| `/midi/synth/voice/5/gate` | `f` | 3 | 0 .. 1 | Voice gate 5 |
| `/midi/synth/voice/6/amp` | `f` | 3 | 0.0 .. 0.5 | Voice amplitude 6 |
| `/midi/synth/voice/6/freq` | `f` | 3 | 20 .. 8000 | Voice frequency 6 |
| `/midi/synth/voice/6/gate` | `f` | 3 | 0 .. 1 | Voice gate 6 |
| `/midi/synth/voice/7/amp` | `f` | 3 | 0.0 .. 0.5 | Voice amplitude 7 |
| `/midi/synth/voice/7/freq` | `f` | 3 | 20 .. 8000 | Voice frequency 7 |
| `/midi/synth/voice/7/gate` | `f` | 3 | 0 .. 1 | Voice gate 7 |
| `/midi/synth/voice/8/amp` | `f` | 3 | 0.0 .. 0.5 | Voice amplitude 8 |
| `/midi/synth/voice/8/freq` | `f` | 3 | 20 .. 8000 | Voice frequency 8 |
| `/midi/synth/voice/8/gate` | `f` | 3 | 0 .. 1 | Voice gate 8 |
| `/midi/synth/waveform` | `f` | 3 | 0 .. 4 | Oscillator waveform |
