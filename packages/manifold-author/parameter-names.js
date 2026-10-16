// Stable author-facing names over the existing Rust numeric parameter contract.
// Rename only with a source compatibility policy; labels can change independently.
export const PARAMETER_NAMES = {
  "adsr": {
    "0": "attack",
    "1": "decay",
    "2": "sustain",
    "3": "release",
    "4": "gate",
    "5": "retriggerSequence"
  },
  "gain": {
    "0": "level"
  },
  "distortion": {
    "0": "drive",
    "1": "wetMix",
    "2": "output"
  },
  "svf": {
    "0": "mode",
    "1": "cutoff",
    "2": "resonance"
  },
  "modulated-svf": {
    "0": "mode",
    "1": "cutoff",
    "2": "resonance",
    "3": "cvDepthHz"
  },
  "effect-slot-legacy": {
    "0": "effect",
    "1": "mix",
    "2": "p1",
    "3": "p2",
    "4": "p3",
    "5": "p4",
    "6": "p5"
  },
  "eq8": {
    "0": "band1Enabled",
    "1": "band1Curve",
    "2": "band1Frequency",
    "3": "band1GainDb",
    "4": "band1Q",
    "5": "band2Enabled",
    "6": "band2Curve",
    "7": "band2Frequency",
    "8": "band2GainDb",
    "9": "band2Q",
    "10": "band3Enabled",
    "11": "band3Curve",
    "12": "band3Frequency",
    "13": "band3GainDb",
    "14": "band3Q",
    "15": "band4Enabled",
    "16": "band4Curve",
    "17": "band4Frequency",
    "18": "band4GainDb",
    "19": "band4Q",
    "20": "band5Enabled",
    "21": "band5Curve",
    "22": "band5Frequency",
    "23": "band5GainDb",
    "24": "band5Q",
    "25": "band6Enabled",
    "26": "band6Curve",
    "27": "band6Frequency",
    "28": "band6GainDb",
    "29": "band6Q",
    "30": "band7Enabled",
    "31": "band7Curve",
    "32": "band7Frequency",
    "33": "band7GainDb",
    "34": "band7Q",
    "35": "band8Enabled",
    "36": "band8Curve",
    "37": "band8Frequency",
    "38": "band8GainDb",
    "39": "band8Q",
    "40": "outputDb",
    "41": "mix"
  },
  "wave-shaper": {
    "0": "curve",
    "1": "driveDb",
    "2": "outputDb",
    "3": "preFilterHz",
    "4": "postFilterHz",
    "5": "bias",
    "6": "wetMix",
    "7": "legacyToneFactor"
  },
  "legacy-filter": {
    "0": "cutoffHz",
    "1": "resonance",
    "2": "wetMix"
  },
  "mixer9": {
    "0": "masterLevel"
  },
  "mixer": {
    "0": "masterLevel",
    "1": "input1Gain",
    "2": "input2Gain",
    "3": "input3Gain",
    "4": "input4Gain",
    "5": "input5Gain",
    "6": "input6Gain",
    "7": "input7Gain",
    "8": "input8Gain",
    "9": "input9Gain",
    "10": "input10Gain",
    "11": "input11Gain",
    "12": "input12Gain",
    "13": "input13Gain",
    "14": "input14Gain",
    "15": "input15Gain",
    "16": "input16Gain",
    "17": "input17Gain",
    "18": "input18Gain",
    "19": "input19Gain",
    "20": "input20Gain",
    "21": "input21Gain",
    "22": "input22Gain",
    "23": "input23Gain",
    "24": "input24Gain",
    "25": "input25Gain",
    "26": "input26Gain",
    "27": "input27Gain",
    "28": "input28Gain",
    "29": "input29Gain",
    "30": "input30Gain",
    "31": "input31Gain",
    "32": "input32Gain",
    "33": "input1Pan",
    "34": "input2Pan",
    "35": "input3Pan",
    "36": "input4Pan",
    "37": "input5Pan",
    "38": "input6Pan",
    "39": "input7Pan",
    "40": "input8Pan",
    "41": "input9Pan",
    "42": "input10Pan",
    "43": "input11Pan",
    "44": "input12Pan",
    "45": "input13Pan",
    "46": "input14Pan",
    "47": "input15Pan",
    "48": "input16Pan",
    "49": "input17Pan",
    "50": "input18Pan",
    "51": "input19Pan",
    "52": "input20Pan",
    "53": "input21Pan",
    "54": "input22Pan",
    "55": "input23Pan",
    "56": "input24Pan",
    "57": "input25Pan",
    "58": "input26Pan",
    "59": "input27Pan",
    "60": "input28Pan",
    "61": "input29Pan",
    "62": "input30Pan",
    "63": "input31Pan",
    "64": "input32Pan"
  },
  "phase-vocoder": {
    "0": "mode",
    "1": "pitchSemitones",
    "2": "timeStretch",
    "3": "wetMix",
    "4": "fftOrder"
  },
  "crossfader": {
    "0": "position",
    "1": "curve",
    "2": "wetMix"
  },
  "ring-modulator": {
    "0": "carrierHz",
    "1": "depth",
    "2": "wetMix",
    "3": "spread",
    "4": "enabled"
  },
  "audio-fm": {
    "0": "amount",
    "1": "wetMix"
  },
  "audio-sync": {
    "0": "hardness",
    "1": "wetMix"
  },
  "loop-capture": {
    "0": "record",
    "1": "play",
    "2": "overdub",
    "3": "speed",
    "4": "reverse",
    "5": "loopMix",
    "6": "overdubLevel"
  },
  "oscillator": {
    "0": "waveform",
    "1": "frequency",
    "2": "level"
  },
  "extended-oscillator": {
    "0": "waveform",
    "1": "frequency",
    "2": "level",
    "3": "syncEnabled",
    "4": "pulseWidth",
    "5": "drive",
    "6": "driveShape",
    "7": "driveBias",
    "8": "driveMix",
    "9": "retriggerOnLevelRise",
    "10": "unisonVoices",
    "11": "detuneCents",
    "12": "stereoSpread",
    "13": "renderMode",
    "14": "additivePartials",
    "15": "additiveTilt",
    "16": "additiveDrift"
  },
  "pulse-oscillator": {
    "1": "frequency",
    "2": "level",
    "4": "pulseWidth"
  },
  "noise": {
    "0": "level",
    "1": "color"
  },
  "lfo": {
    "0": "waveform",
    "1": "rate"
  },
  "modulated-gain": {
    "0": "base",
    "1": "depth"
  },
  "slew-control": {
    "0": "riseSamples",
    "1": "fallSamples"
  },
  "attenuverter-bias": {
    "0": "amount",
    "1": "bias"
  },
  "sample-hold": {
    "0": "mode"
  },
  "cv-mix": {
    "0": "input1",
    "1": "input2",
    "2": "input3",
    "3": "input4",
    "4": "offset"
  },
  "cv-compare": {
    "0": "direction",
    "1": "threshold",
    "2": "hysteresis"
  },
  "cv-range": {
    "0": "minimum",
    "1": "maximum",
    "2": "mode"
  },
  "stereo-widener": {
    "0": "width",
    "1": "monoLowCutoff",
    "2": "monoLow"
  },
  "midi-transpose": {
    "0": "semitones"
  },
  "voice-synth": {
    "0": "waveform",
    "1": "attack",
    "2": "decay",
    "3": "sustain",
    "4": "release",
    "5": "level"
  },
  "sample-instrument": {
    "0": "rootNote",
    "1": "keyTracking",
    "2": "level",
    "3": "speed",
    "4": "reverse",
    "5": "oneShot",
    "6": "playStart",
    "7": "loopStart",
    "8": "loopEnd",
    "9": "crossfade",
    "10": "release",
    "11": "unison",
    "12": "detune",
    "13": "spread"
  },
  "sample-region": {
    "0": "speed",
    "1": "reverse",
    "2": "oneShot",
    "3": "playStart",
    "4": "loopStart",
    "5": "loopEnd",
    "8": "crossfade",
    "9": "unison",
    "10": "detune",
    "11": "spread"
  },
  "granulator": {
    "0": "grainSize",
    "1": "density",
    "2": "position",
    "3": "pitch",
    "4": "spray",
    "5": "wetMix",
    "6": "freeze",
    "7": "envelope",
    "8": "enabled",
    "9": "regionStart",
    "10": "regionEnd"
  },
  "main-voice-bank": {
    "0": "waveShape",
    "1": "waveSample",
    "2": "sampleRoot",
    "3": "keytrack",
    "4": "samplePitch",
    "5": "pitchEngine",
    "6": "blendMode",
    "7": "directionDepth",
    "8": "waveToSample",
    "9": "sampleToWave",
    "10": "syncRetrigger",
    "11": "attack",
    "12": "decay",
    "13": "sustain",
    "14": "release",
    "15": "output",
    "16": "vocoderTime",
    "17": "phraseContour",
    "18": "phraseReference",
    "19": "addWaveSource"
  },
  "compressor": {
    "0": "thresholdDb",
    "1": "ratio",
    "5": "makeupDb",
    "10": "mix"
  },
  "limiter": {
    "0": "thresholdDb",
    "1": "releaseMs",
    "2": "makeupDb",
    "3": "softClip",
    "4": "mix"
  },
  "stereo-delay": {
    "0": "leftTimeMs",
    "1": "rightTimeMs",
    "2": "feedback",
    "3": "crossfeed",
    "4": "lowpassEnabled",
    "5": "cutoffHz",
    "7": "mix",
    "8": "pingPong",
    "9": "width",
    "10": "freeze",
    "11": "ducking",
    "12": "tempoSync",
    "13": "leftDivision",
    "14": "rightDivision",
    "15": "tempoBpm"
  },
  "phaser": {
    "0": "rateHz",
    "1": "depth",
    "2": "stages",
    "3": "feedback",
    "4": "spreadDegrees"
  },
  "chorus": {
    "0": "rateHz",
    "1": "depth",
    "2": "voices",
    "3": "spread",
    "4": "feedback",
    "5": "waveform",
    "6": "mix"
  },
  "reverb": {
    "0": "roomSize",
    "1": "damping",
    "2": "wet",
    "3": "dry",
    "4": "width"
  },
  "multitap-delay": {
    "0": "taps",
    "1": "feedback",
    "2": "mix",
    "3": "tap1TimeMs",
    "4": "tap1Gain",
    "5": "tap1Pan",
    "6": "tap2TimeMs",
    "7": "tap2Gain",
    "8": "tap2Pan",
    "9": "tap3TimeMs",
    "10": "tap3Gain",
    "11": "tap3Pan",
    "12": "tap4TimeMs",
    "13": "tap4Gain",
    "14": "tap4Pan",
    "15": "tap5TimeMs",
    "16": "tap5Gain",
    "17": "tap5Pan",
    "18": "tap6TimeMs",
    "19": "tap6Gain",
    "20": "tap6Pan",
    "21": "tap7TimeMs",
    "22": "tap7Gain",
    "23": "tap7Pan",
    "24": "tap8TimeMs",
    "25": "tap8Gain",
    "26": "tap8Pan"
  },
  "transient-shaper": {
    "0": "attack",
    "1": "sustain",
    "2": "sensitivity",
    "3": "mix"
  },
  "bit-crusher": {
    "0": "bits",
    "1": "rateReduction",
    "2": "mix",
    "3": "output",
    "4": "logic"
  },
  "three-band-eq": {
    "0": "lowGainDb",
    "1": "lowFrequencyHz",
    "2": "midGainDb",
    "3": "midFrequencyHz",
    "4": "midQ",
    "5": "highGainDb",
    "6": "highFrequencyHz",
    "7": "outputDb",
    "8": "mix"
  },
  "formant-filter": {
    "0": "vowel",
    "1": "shiftSemitones",
    "2": "resonance",
    "3": "drive",
    "4": "mix"
  },
  "resonator": {
    "0": "gain",
    "1": "frequencyHz",
    "2": "q"
  },
  "reverse-delay": {
    "0": "timeMs",
    "1": "windowMs",
    "2": "feedback",
    "3": "mix"
  },
  "stutter": {
    "0": "lengthBeats",
    "1": "gate",
    "2": "filterDecay",
    "3": "pitchDecay",
    "4": "probability",
    "5": "pattern",
    "6": "tempoBpm",
    "7": "mix"
  },
  "pitch-shifter": {
    "0": "pitchSemitones",
    "1": "windowMs",
    "2": "feedback",
    "3": "mix"
  },
  "shimmer": {
    "0": "size",
    "1": "pitchSemitones",
    "2": "feedback",
    "3": "mix",
    "4": "modulation",
    "5": "cutoffHz"
  },
  "spectrum-analyzer": {
    "0": "sensitivity",
    "1": "smoothing",
    "2": "floorDb"
  },
  "fft-spectrum": {
    "0": "smoothing",
    "1": "floorDb"
  },
  "envelope-follower": {
    "0": "attackMs",
    "1": "releaseMs",
    "2": "sensitivity",
    "3": "highpassHz",
    "4": "mode"
  },
  "envelope-control": {
    "0": "attackMs",
    "1": "releaseMs",
    "2": "sensitivity",
    "3": "highpassHz",
    "4": "mode"
  },
  "midi-note-filter": {
    "0": "lowNote",
    "1": "highNote",
    "2": "rangeMode"
  },
  "midi-scale-quantizer": {
    "0": "root",
    "1": "scale",
    "2": "direction"
  },
  "midi-velocity-mapper": {
    "0": "amount",
    "1": "curve",
    "2": "offset"
  },
  "midi-arpeggiator": {
    "0": "rateHz",
    "1": "direction",
    "2": "octaves",
    "3": "gate",
    "4": "hold"
  },
  "constant": {
    "0": "value"
  },
  "linear-blend": {
    "0": "mix"
  },
  "slew-audio": {
    "0": "riseSamples",
    "1": "fallSamples"
  },
  "phrase-gain": {
    "0": "amount",
    "1": "reference"
  }
};
