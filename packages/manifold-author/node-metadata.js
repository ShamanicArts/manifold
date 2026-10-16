// Shared human and agent descriptions. Ports and numeric contracts come from Rust.
export const NODE_METADATA = {
  'input.sidechain': {
    category: 'Sources & voices',
    description: 'Reads an auxiliary host audio input for sidechain processing.',
  },
  oscillator: {
    category: 'Sources & voices',
    description: 'Generates basic pitched waveforms with frequency and level control.',
  },
  'extended-oscillator': {
    category: 'Sources & voices',
    description: 'Generates pitched audio with unison, sync, shaping and additive modes.',
  },
  'pulse-oscillator': {
    category: 'Sources & voices',
    description: 'Generates a pitched pulse wave with adjustable width.',
  },
  noise: {
    category: 'Sources & voices',
    description: 'Generates colored noise as an audio source.',
  },
  'midi-input': {
    category: 'MIDI',
    description: 'Receives host MIDI notes and sends them along MIDI connections.',
  },
  'voice-synth': {
    category: 'Sources & voices',
    description: 'Renders a playable synth voice from note events.',
  },
  'sample-instrument': {
    category: 'Sources & voices',
    description: 'Plays a prepared sample instrument from note events.',
  },
  'sample-region': {
    category: 'Sources & voices',
    description: 'Plays an addressed region of prepared sample audio.',
  },
  'main-voice-bank': {
    category: 'Sources & voices',
    description: 'Combines the voices used by the authored Main instrument.',
  },
  adsr: {
    category: 'Modulation & CV',
    description: 'Generates a control envelope with attack, decay, sustain and release.',
  },
  lfo: {
    category: 'Modulation & CV',
    description: 'Generates a repeating low frequency modulation signal.',
  },
  'modulated-gain': {
    category: 'Modulation & CV',
    description: 'Applies gain controlled by an incoming CV signal.',
  },
  'slew-control': {
    category: 'Modulation & CV',
    description: 'Smooths changes in a control signal over time.',
  },
  'attenuverter-bias': {
    category: 'Modulation & CV',
    description: 'Scales, inverts and offsets a control signal.',
  },
  'sample-hold': {
    category: 'Modulation & CV',
    description: 'Samples or tracks a control signal on trigger events.',
  },
  'cv-mix': {
    category: 'Modulation & CV',
    description: 'Blends control signals together.',
  },
  'cv-compare': {
    category: 'Modulation & CV',
    description: 'Compares control signals and emits the result.',
  },
  'cv-range': {
    category: 'Modulation & CV',
    description: 'Maps a control signal into a chosen range.',
  },
  gain: {
    category: 'Mix & routing',
    description: 'Changes audio level with a live gain parameter.',
  },
  'fixed-gain': {
    category: 'Mix & routing',
    description: 'Multiplies audio by a fixed gain factor.',
  },
  sum2: {
    category: 'Mix & routing',
    description: 'Adds two audio signals together.',
  },
  mixer9: {
    category: 'Mix & routing',
    description: 'Mixes up to nine audio inputs into one output.',
  },
  mixer: {
    category: 'Mix & routing',
    description: 'Mixes multiple audio inputs with level and pan controls.',
  },
  crossfader: {
    category: 'Mix & routing',
    description: 'Blends two audio sources with an equal power curve.',
  },
  'stereo-widener': {
    category: 'Mix & routing',
    description: 'Adjusts the perceived width of a stereo signal.',
  },
  'midi-transpose': {
    category: 'MIDI',
    description: 'Shifts incoming MIDI note pitches.',
  },
  svf: {
    category: 'Filters & EQ',
    description: 'Filters audio with selectable modes, cutoff and resonance.',
  },
  'modulated-svf': {
    category: 'Filters & EQ',
    description: 'Filters audio while CV moves the cutoff frequency.',
  },
  'legacy-filter': {
    category: 'Filters & EQ',
    description: 'Runs the legacy filter response with cutoff and resonance.',
  },
  eq8: {
    category: 'Filters & EQ',
    description: 'Shapes audio with eight configurable EQ bands.',
  },
  'phase-vocoder': {
    category: 'Time & spectral',
    description: 'Shifts pitch or stretches time in the spectral domain.',
  },
  granulator: {
    category: 'Time & spectral',
    description: 'Resynthesizes audio as overlapping grains.',
  },
  'loop-capture': {
    category: 'Time & spectral',
    description: 'Records, plays and overdubs a live audio loop.',
  },
  'retrospective-capture': {
    category: 'Time & spectral',
    description: 'Keeps a rolling audio history for later capture.',
  },
  'wave-shaper': {
    category: 'Shape & FX',
    description: 'Transforms waveform shape with selectable curves and drive.',
  },
  distortion: {
    category: 'Shape & FX',
    description: 'Adds nonlinear saturation with drive and wet mix controls.',
  },
  'effect-slot-legacy': {
    category: 'Shape & FX',
    description: 'Hosts a selectable effect in the legacy Main FX slot.',
  },
  'ring-modulator': {
    category: 'Shape & FX',
    description: 'Multiplies audio by a carrier to create sidebands.',
  },
  'audio-fm': {
    category: 'Shape & FX',
    description: "Uses an audio signal to modulate another signal's frequency.",
  },
  'audio-sync': {
    category: 'Shape & FX',
    description: 'Synchronizes one audio oscillator to another signal.',
  },
  'input.raw': {
    category: 'Sources & voices',
    description: 'Reads the audio supplied to the device by its host.',
  },
  output: {
    category: 'Mix & routing',
    description: 'Sends the connected audio to the device output.',
  },
  compressor: {
    category: 'Dynamics',
    description:
      'Reduces audio above a threshold, with ratio, makeup gain and wet mix. Uses a fixed 10 ms attack and 100 ms release.',
  },
  limiter: {
    category: 'Dynamics',
    description: 'Limits audio peaks to a threshold, with release, makeup gain and soft clipping.',
  },
  'stereo-delay': {
    category: 'Time & spectral',
    description:
      'Repeats left and right audio with independent timing, feedback, filtering and tempo sync.',
  },
  phaser: {
    category: 'Shape & FX',
    description: 'Sweeps six or twelve all-pass stages to create moving notches in the sound.',
  },
  chorus: {
    category: 'Shape & FX',
    description: 'Layers modulated delays to thicken audio, with voice count and stereo spread.',
  },
  reverb: {
    category: 'Time & spectral',
    description: 'Adds a stereo room tail with size, damping and independent wet and dry levels.',
  },
  'multitap-delay': {
    category: 'Time & spectral',
    description: 'Repeats audio through up to eight taps, each with its own time, gain and pan.',
  },
  'transient-shaper': {
    category: 'Dynamics',
    description: 'Emphasizes or softens attacks and sustains without changing the input routing.',
  },
  'bit-crusher': {
    category: 'Shape & FX',
    description: 'Reduces sample precision and rate, with optional XOR or gate processing.',
  },
  'three-band-eq': {
    category: 'Filters & EQ',
    description: 'Shapes lows, mids and highs, with mid-band Q, output gain and wet mix.',
  },
  'formant-filter': {
    category: 'Filters & EQ',
    description: 'Shapes audio with vowel resonances, pitch shift, resonance and drive.',
  },
  resonator: {
    category: 'Filters & EQ',
    description: 'Emphasizes a tuned frequency with adjustable gain and resonance.',
  },
  'reverse-delay': {
    category: 'Time & spectral',
    description: 'Replays overlapping sections of audio backwards, with feedback and wet mix.',
  },
  stutter: {
    category: 'Time & spectral',
    description:
      'Repeats short rhythmic fragments using a gate, probability and eight-step pattern.',
  },
  'pitch-shifter': {
    category: 'Time & spectral',
    description: 'Shifts audio pitch using overlapping delay windows, with feedback and wet mix.',
  },
  shimmer: {
    category: 'Time & spectral',
    description: 'Adds pitched, modulated delay feedback for a sustained shimmering tail.',
  },
  'spectrum-analyzer': {
    category: 'Sound analysis',
    description:
      'Passes audio through and measures eight frequency bands. Per-node graph meters are not yet available.',
  },
  'fft-spectrum': {
    category: 'Sound analysis',
    description:
      'Passes audio through and measures its FFT spectrum. Per-node graph meters are not yet available.',
  },
  'envelope-follower': {
    category: 'Sound analysis',
    description:
      'Passes audio through while measuring its level. Use Audio envelope when you need a connectable control output.',
  },
  'envelope-control': {
    category: 'Modulation & CV',
    description:
      'Turns audio level into a control signal, with attack, release and peak or RMS detection.',
  },
  'midi-note-filter': {
    category: 'MIDI',
    description: 'Passes notes inside or outside a chosen pitch range while tracking held notes.',
  },
  'midi-scale-quantizer': {
    category: 'MIDI',
    description: 'Moves incoming notes onto a musical scale with a chosen root and direction.',
  },
  'midi-velocity-mapper': {
    category: 'MIDI',
    description: 'Reshapes note velocity with amount, curve and offset.',
  },
  'midi-arpeggiator': {
    category: 'MIDI',
    description:
      'Turns held notes into a repeating pattern with rate, direction, octaves and gate length.',
  },
  constant: {
    category: 'Sources & voices',
    description: 'Produces a constant-valued audio signal for offsets and signal calculations.',
  },
  'linear-blend': {
    category: 'Mix & routing',
    description: 'Crossfades linearly between two audio inputs.',
  },
  'slew-audio': {
    category: 'Shape & FX',
    description: 'Smooths rising and falling audio samples independently.',
  },
  'phrase-gain': {
    category: 'Modulation & CV',
    description: 'Shapes audio gain from a control envelope relative to a chosen reference level.',
  },
};
