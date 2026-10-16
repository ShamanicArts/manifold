// Generated from manifold-core graph metadata. Run scripts/update-port-catalog.sh.
export declare const PORT_CATALOG: {
  readonly "adsr": {
    readonly code: 12;
    readonly args: {  };
    readonly configuration: {  };
    readonly inputs: readonly [{ readonly name: "audio"; readonly signal: "audio" }];
    readonly outputs: readonly [{ readonly name: "out"; readonly signal: "audio" }];
    readonly parameters: readonly { readonly id: number; readonly min: number; readonly max: number; readonly default: number; readonly discrete: boolean }[];
  };
  readonly "attenuverter-bias": {
    readonly code: 31;
    readonly args: { readonly a: 1; readonly b: 0; };
    readonly configuration: {  };
    readonly inputs: readonly [{ readonly name: "cv"; readonly signal: "control" }];
    readonly outputs: readonly [{ readonly name: "out"; readonly signal: "control" }];
    readonly parameters: readonly { readonly id: number; readonly min: number; readonly max: number; readonly default: number; readonly discrete: boolean }[];
  };
  readonly "audio-fm": {
    readonly code: 71;
    readonly args: {  };
    readonly configuration: {  };
    readonly inputs: readonly [{ readonly name: "carrier"; readonly signal: "audio" }, { readonly name: "modulator"; readonly signal: "audio" }];
    readonly outputs: readonly [{ readonly name: "out"; readonly signal: "audio" }];
    readonly parameters: readonly { readonly id: number; readonly min: number; readonly max: number; readonly default: number; readonly discrete: boolean }[];
  };
  readonly "audio-sync": {
    readonly code: 72;
    readonly args: {  };
    readonly configuration: {  };
    readonly inputs: readonly [{ readonly name: "carrier"; readonly signal: "audio" }, { readonly name: "modulator"; readonly signal: "audio" }];
    readonly outputs: readonly [{ readonly name: "out"; readonly signal: "audio" }];
    readonly parameters: readonly { readonly id: number; readonly min: number; readonly max: number; readonly default: number; readonly discrete: boolean }[];
  };
  readonly "bit-crusher": {
    readonly code: 44;
    readonly args: {  };
    readonly configuration: {  };
    readonly inputs: readonly [{ readonly name: "audio"; readonly signal: "audio" }, { readonly name: "sidechain"; readonly signal: "audio" }];
    readonly outputs: readonly [{ readonly name: "out"; readonly signal: "audio" }];
    readonly parameters: readonly { readonly id: number; readonly min: number; readonly max: number; readonly default: number; readonly discrete: boolean }[];
  };
  readonly "chorus": {
    readonly code: 35;
    readonly args: { readonly a: 0.6; readonly b: 0.45; };
    readonly configuration: {  };
    readonly inputs: readonly [{ readonly name: "audio"; readonly signal: "audio" }];
    readonly outputs: readonly [{ readonly name: "out"; readonly signal: "audio" }];
    readonly parameters: readonly { readonly id: number; readonly min: number; readonly max: number; readonly default: number; readonly discrete: boolean }[];
  };
  readonly "compressor": {
    readonly code: 24;
    readonly args: { readonly a: -12; readonly b: 4; };
    readonly configuration: {  };
    readonly inputs: readonly [{ readonly name: "audio"; readonly signal: "audio" }];
    readonly outputs: readonly [{ readonly name: "out"; readonly signal: "audio" }];
    readonly parameters: readonly { readonly id: number; readonly min: number; readonly max: number; readonly default: number; readonly discrete: boolean }[];
  };
  readonly "constant": {
    readonly code: 2;
    readonly args: { readonly a: 0; };
    readonly configuration: {  };
    readonly inputs: readonly [];
    readonly outputs: readonly [{ readonly name: "out"; readonly signal: "audio" }];
    readonly parameters: readonly { readonly id: number; readonly min: number; readonly max: number; readonly default: number; readonly discrete: boolean }[];
  };
  readonly "crossfader": {
    readonly code: 8;
    readonly args: { readonly a: 0; readonly b: 1; };
    readonly configuration: {  };
    readonly inputs: readonly [{ readonly name: "a"; readonly signal: "audio" }, { readonly name: "b"; readonly signal: "audio" }];
    readonly outputs: readonly [{ readonly name: "out"; readonly signal: "audio" }];
    readonly parameters: readonly { readonly id: number; readonly min: number; readonly max: number; readonly default: number; readonly discrete: boolean }[];
  };
  readonly "cv-compare": {
    readonly code: 68;
    readonly args: {  };
    readonly configuration: {  };
    readonly inputs: readonly [{ readonly name: "cv"; readonly signal: "control" }];
    readonly outputs: readonly [{ readonly name: "gate"; readonly signal: "control" }, { readonly name: "trig"; readonly signal: "control" }];
    readonly parameters: readonly { readonly id: number; readonly min: number; readonly max: number; readonly default: number; readonly discrete: boolean }[];
  };
  readonly "cv-mix": {
    readonly code: 33;
    readonly args: { readonly a: 1; readonly b: 0.5; };
    readonly configuration: {  };
    readonly inputs: readonly [{ readonly name: "in-1"; readonly signal: "control" }, { readonly name: "in-2"; readonly signal: "control" }, { readonly name: "in-3"; readonly signal: "control" }, { readonly name: "in-4"; readonly signal: "control" }];
    readonly outputs: readonly [{ readonly name: "out"; readonly signal: "control" }];
    readonly parameters: readonly { readonly id: number; readonly min: number; readonly max: number; readonly default: number; readonly discrete: boolean }[];
  };
  readonly "cv-range": {
    readonly code: 69;
    readonly args: {  };
    readonly configuration: {  };
    readonly inputs: readonly [{ readonly name: "cv"; readonly signal: "control" }];
    readonly outputs: readonly [{ readonly name: "out"; readonly signal: "control" }];
    readonly parameters: readonly { readonly id: number; readonly min: number; readonly max: number; readonly default: number; readonly discrete: boolean }[];
  };
  readonly "distortion": {
    readonly code: 17;
    readonly args: { readonly a: 4; readonly b: 0.7; };
    readonly configuration: {  };
    readonly inputs: readonly [{ readonly name: "audio"; readonly signal: "audio" }];
    readonly outputs: readonly [{ readonly name: "out"; readonly signal: "audio" }];
    readonly parameters: readonly { readonly id: number; readonly min: number; readonly max: number; readonly default: number; readonly discrete: boolean }[];
  };
  readonly "effect-slot-legacy": {
    readonly code: 52;
    readonly args: { readonly a: 0; readonly b: 0; };
    readonly configuration: {  };
    readonly inputs: readonly [{ readonly name: "audio"; readonly signal: "audio" }];
    readonly outputs: readonly [{ readonly name: "out"; readonly signal: "audio" }];
    readonly parameters: readonly { readonly id: number; readonly min: number; readonly max: number; readonly default: number; readonly discrete: boolean }[];
  };
  readonly "envelope-control": {
    readonly code: 23;
    readonly args: { readonly a: 10; readonly b: 120; };
    readonly configuration: {  };
    readonly inputs: readonly [{ readonly name: "audio"; readonly signal: "audio" }];
    readonly outputs: readonly [{ readonly name: "out"; readonly signal: "control" }];
    readonly parameters: readonly { readonly id: number; readonly min: number; readonly max: number; readonly default: number; readonly discrete: boolean }[];
  };
  readonly "envelope-follower": {
    readonly code: 22;
    readonly args: { readonly a: 10; readonly b: 120; };
    readonly configuration: {  };
    readonly inputs: readonly [{ readonly name: "audio"; readonly signal: "audio" }];
    readonly outputs: readonly [{ readonly name: "out"; readonly signal: "audio" }];
    readonly parameters: readonly { readonly id: number; readonly min: number; readonly max: number; readonly default: number; readonly discrete: boolean }[];
  };
  readonly "eq8": {
    readonly code: 36;
    readonly args: {  };
    readonly configuration: {  };
    readonly inputs: readonly [{ readonly name: "audio"; readonly signal: "audio" }];
    readonly outputs: readonly [{ readonly name: "out"; readonly signal: "audio" }];
    readonly parameters: readonly { readonly id: number; readonly min: number; readonly max: number; readonly default: number; readonly discrete: boolean }[];
  };
  readonly "extended-oscillator": {
    readonly code: 73;
    readonly args: { readonly a: 220; readonly b: 0; };
    readonly configuration: {  };
    readonly inputs: readonly [{ readonly name: "sync"; readonly signal: "audio" }];
    readonly outputs: readonly [{ readonly name: "out"; readonly signal: "audio" }];
    readonly parameters: readonly { readonly id: number; readonly min: number; readonly max: number; readonly default: number; readonly discrete: boolean }[];
  };
  readonly "fft-spectrum": {
    readonly code: 28;
    readonly args: { readonly a: 0.45; readonly b: -72; };
    readonly configuration: {  };
    readonly inputs: readonly [{ readonly name: "audio"; readonly signal: "audio" }];
    readonly outputs: readonly [{ readonly name: "out"; readonly signal: "audio" }];
    readonly parameters: readonly { readonly id: number; readonly min: number; readonly max: number; readonly default: number; readonly discrete: boolean }[];
  };
  readonly "fixed-gain": {
    readonly code: 67;
    readonly args: { readonly a: 4; };
    readonly configuration: { readonly "gain": { readonly argument: "a"; readonly min: 0; readonly max: 4; readonly default: 4 }; };
    readonly inputs: readonly [{ readonly name: "audio"; readonly signal: "audio" }];
    readonly outputs: readonly [{ readonly name: "out"; readonly signal: "audio" }];
    readonly parameters: readonly { readonly id: number; readonly min: number; readonly max: number; readonly default: number; readonly discrete: boolean }[];
  };
  readonly "formant-filter": {
    readonly code: 46;
    readonly args: {  };
    readonly configuration: {  };
    readonly inputs: readonly [{ readonly name: "audio"; readonly signal: "audio" }];
    readonly outputs: readonly [{ readonly name: "out"; readonly signal: "audio" }];
    readonly parameters: readonly { readonly id: number; readonly min: number; readonly max: number; readonly default: number; readonly discrete: boolean }[];
  };
  readonly "gain": {
    readonly code: 3;
    readonly args: { readonly a: 0.7; };
    readonly configuration: {  };
    readonly inputs: readonly [{ readonly name: "audio"; readonly signal: "audio" }];
    readonly outputs: readonly [{ readonly name: "out"; readonly signal: "audio" }];
    readonly parameters: readonly { readonly id: number; readonly min: number; readonly max: number; readonly default: number; readonly discrete: boolean }[];
  };
  readonly "granulator": {
    readonly code: 51;
    readonly args: {  };
    readonly configuration: {  };
    readonly inputs: readonly [{ readonly name: "audio"; readonly signal: "audio" }];
    readonly outputs: readonly [{ readonly name: "out"; readonly signal: "audio" }];
    readonly parameters: readonly { readonly id: number; readonly min: number; readonly max: number; readonly default: number; readonly discrete: boolean }[];
  };
  readonly "input.raw": {
    readonly code: 0;
    readonly args: {  };
    readonly configuration: {  };
    readonly inputs: readonly [];
    readonly outputs: readonly [{ readonly name: "out"; readonly signal: "audio" }];
    readonly parameters: readonly { readonly id: number; readonly min: number; readonly max: number; readonly default: number; readonly discrete: boolean }[];
  };
  readonly "input.sidechain": {
    readonly code: 65;
    readonly args: {  };
    readonly configuration: {  };
    readonly inputs: readonly [];
    readonly outputs: readonly [{ readonly name: "out"; readonly signal: "audio" }];
    readonly parameters: readonly { readonly id: number; readonly min: number; readonly max: number; readonly default: number; readonly discrete: boolean }[];
  };
  readonly "legacy-filter": {
    readonly code: 39;
    readonly args: {  };
    readonly configuration: {  };
    readonly inputs: readonly [{ readonly name: "audio"; readonly signal: "audio" }];
    readonly outputs: readonly [{ readonly name: "out"; readonly signal: "audio" }];
    readonly parameters: readonly { readonly id: number; readonly min: number; readonly max: number; readonly default: number; readonly discrete: boolean }[];
  };
  readonly "lfo": {
    readonly code: 14;
    readonly args: { readonly a: 2; };
    readonly configuration: {  };
    readonly inputs: readonly [];
    readonly outputs: readonly [{ readonly name: "out"; readonly signal: "control" }, { readonly name: "inv"; readonly signal: "control" }, { readonly name: "uni"; readonly signal: "control" }];
    readonly parameters: readonly { readonly id: number; readonly min: number; readonly max: number; readonly default: number; readonly discrete: boolean }[];
  };
  readonly "limiter": {
    readonly code: 25;
    readonly args: { readonly a: -1; readonly b: 60; };
    readonly configuration: {  };
    readonly inputs: readonly [{ readonly name: "audio"; readonly signal: "audio" }];
    readonly outputs: readonly [{ readonly name: "out"; readonly signal: "audio" }];
    readonly parameters: readonly { readonly id: number; readonly min: number; readonly max: number; readonly default: number; readonly discrete: boolean }[];
  };
  readonly "linear-blend": {
    readonly code: 5;
    readonly args: { readonly a: 0.5; };
    readonly configuration: {  };
    readonly inputs: readonly [{ readonly name: "a"; readonly signal: "audio" }, { readonly name: "b"; readonly signal: "audio" }];
    readonly outputs: readonly [{ readonly name: "out"; readonly signal: "audio" }];
    readonly parameters: readonly { readonly id: number; readonly min: number; readonly max: number; readonly default: number; readonly discrete: boolean }[];
  };
  readonly "loop-capture": {
    readonly code: 20;
    readonly args: { readonly a: 2; readonly b: 1; };
    readonly configuration: { readonly "capacitySeconds": { readonly argument: "a"; readonly min: 0;  readonly default: 2 }; };
    readonly inputs: readonly [{ readonly name: "audio"; readonly signal: "audio" }];
    readonly outputs: readonly [{ readonly name: "out"; readonly signal: "audio" }];
    readonly parameters: readonly { readonly id: number; readonly min: number; readonly max: number; readonly default: number; readonly discrete: boolean }[];
  };
  readonly "main-voice-bank": {
    readonly code: 64;
    readonly args: { readonly a: 9; };
    readonly configuration: {  };
    readonly inputs: readonly [{ readonly name: "midi"; readonly signal: "midi" }];
    readonly outputs: readonly [{ readonly name: "out"; readonly signal: "audio" }];
    readonly parameters: readonly { readonly id: number; readonly min: number; readonly max: number; readonly default: number; readonly discrete: boolean }[];
  };
  readonly "midi-arpeggiator": {
    readonly code: 59;
    readonly args: { readonly a: 8; readonly b: 0; };
    readonly configuration: {  };
    readonly inputs: readonly [{ readonly name: "midi"; readonly signal: "midi" }];
    readonly outputs: readonly [{ readonly name: "out"; readonly signal: "midi" }];
    readonly parameters: readonly { readonly id: number; readonly min: number; readonly max: number; readonly default: number; readonly discrete: boolean }[];
  };
  readonly "midi-input": {
    readonly code: 54;
    readonly args: {  };
    readonly configuration: {  };
    readonly inputs: readonly [];
    readonly outputs: readonly [{ readonly name: "out"; readonly signal: "midi" }];
    readonly parameters: readonly { readonly id: number; readonly min: number; readonly max: number; readonly default: number; readonly discrete: boolean }[];
  };
  readonly "midi-note-filter": {
    readonly code: 56;
    readonly args: { readonly a: 36; readonly b: 96; };
    readonly configuration: {  };
    readonly inputs: readonly [{ readonly name: "midi"; readonly signal: "midi" }];
    readonly outputs: readonly [{ readonly name: "out"; readonly signal: "midi" }];
    readonly parameters: readonly { readonly id: number; readonly min: number; readonly max: number; readonly default: number; readonly discrete: boolean }[];
  };
  readonly "midi-scale-quantizer": {
    readonly code: 57;
    readonly args: { readonly a: 0; readonly b: 1; };
    readonly configuration: {  };
    readonly inputs: readonly [{ readonly name: "midi"; readonly signal: "midi" }];
    readonly outputs: readonly [{ readonly name: "out"; readonly signal: "midi" }];
    readonly parameters: readonly { readonly id: number; readonly min: number; readonly max: number; readonly default: number; readonly discrete: boolean }[];
  };
  readonly "midi-transpose": {
    readonly code: 55;
    readonly args: { readonly a: 0; };
    readonly configuration: {  };
    readonly inputs: readonly [{ readonly name: "midi"; readonly signal: "midi" }];
    readonly outputs: readonly [{ readonly name: "out"; readonly signal: "midi" }];
    readonly parameters: readonly { readonly id: number; readonly min: number; readonly max: number; readonly default: number; readonly discrete: boolean }[];
  };
  readonly "midi-velocity-mapper": {
    readonly code: 58;
    readonly args: { readonly a: 1; readonly b: 0; };
    readonly configuration: {  };
    readonly inputs: readonly [{ readonly name: "midi"; readonly signal: "midi" }];
    readonly outputs: readonly [{ readonly name: "out"; readonly signal: "midi" }];
    readonly parameters: readonly { readonly id: number; readonly min: number; readonly max: number; readonly default: number; readonly discrete: boolean }[];
  };
  readonly "mixer": {
    readonly code: 9;
    readonly args: { readonly a: 32; readonly b: 1; };
    readonly configuration: { readonly "inputs": { readonly argument: "a"; readonly min: 1;  readonly default: 32 }; };
    readonly inputs: readonly [{ readonly name: "in-1"; readonly signal: "audio" }, { readonly name: "in-2"; readonly signal: "audio" }, { readonly name: "in-3"; readonly signal: "audio" }, { readonly name: "in-4"; readonly signal: "audio" }, { readonly name: "in-5"; readonly signal: "audio" }, { readonly name: "in-6"; readonly signal: "audio" }, { readonly name: "in-7"; readonly signal: "audio" }, { readonly name: "in-8"; readonly signal: "audio" }, { readonly name: "in-9"; readonly signal: "audio" }, { readonly name: "in-10"; readonly signal: "audio" }, { readonly name: "in-11"; readonly signal: "audio" }, { readonly name: "in-12"; readonly signal: "audio" }, { readonly name: "in-13"; readonly signal: "audio" }, { readonly name: "in-14"; readonly signal: "audio" }, { readonly name: "in-15"; readonly signal: "audio" }, { readonly name: "in-16"; readonly signal: "audio" }, { readonly name: "in-17"; readonly signal: "audio" }, { readonly name: "in-18"; readonly signal: "audio" }, { readonly name: "in-19"; readonly signal: "audio" }, { readonly name: "in-20"; readonly signal: "audio" }, { readonly name: "in-21"; readonly signal: "audio" }, { readonly name: "in-22"; readonly signal: "audio" }, { readonly name: "in-23"; readonly signal: "audio" }, { readonly name: "in-24"; readonly signal: "audio" }, { readonly name: "in-25"; readonly signal: "audio" }, { readonly name: "in-26"; readonly signal: "audio" }, { readonly name: "in-27"; readonly signal: "audio" }, { readonly name: "in-28"; readonly signal: "audio" }, { readonly name: "in-29"; readonly signal: "audio" }, { readonly name: "in-30"; readonly signal: "audio" }, { readonly name: "in-31"; readonly signal: "audio" }, { readonly name: "in-32"; readonly signal: "audio" }];
    readonly outputs: readonly [{ readonly name: "out"; readonly signal: "audio" }];
    readonly parameters: readonly { readonly id: number; readonly min: number; readonly max: number; readonly default: number; readonly discrete: boolean }[];
  };
  readonly "mixer9": {
    readonly code: 9;
    readonly args: { readonly a: 9; readonly b: 1; };
    readonly configuration: {  };
    readonly inputs: readonly [{ readonly name: "in-1"; readonly signal: "audio" }, { readonly name: "in-2"; readonly signal: "audio" }, { readonly name: "in-3"; readonly signal: "audio" }, { readonly name: "in-4"; readonly signal: "audio" }, { readonly name: "in-5"; readonly signal: "audio" }, { readonly name: "in-6"; readonly signal: "audio" }, { readonly name: "in-7"; readonly signal: "audio" }, { readonly name: "in-8"; readonly signal: "audio" }, { readonly name: "in-9"; readonly signal: "audio" }];
    readonly outputs: readonly [{ readonly name: "out"; readonly signal: "audio" }];
    readonly parameters: readonly { readonly id: number; readonly min: number; readonly max: number; readonly default: number; readonly discrete: boolean }[];
  };
  readonly "modulated-gain": {
    readonly code: 15;
    readonly args: { readonly a: 0.5; readonly b: 0.4; };
    readonly configuration: {  };
    readonly inputs: readonly [{ readonly name: "audio"; readonly signal: "audio" }, { readonly name: "cv"; readonly signal: "control" }];
    readonly outputs: readonly [{ readonly name: "out"; readonly signal: "audio" }];
    readonly parameters: readonly { readonly id: number; readonly min: number; readonly max: number; readonly default: number; readonly discrete: boolean }[];
  };
  readonly "modulated-svf": {
    readonly code: 16;
    readonly args: { readonly a: 2000; };
    readonly configuration: {  };
    readonly inputs: readonly [{ readonly name: "audio"; readonly signal: "audio" }, { readonly name: "cv"; readonly signal: "control" }];
    readonly outputs: readonly [{ readonly name: "out"; readonly signal: "audio" }];
    readonly parameters: readonly { readonly id: number; readonly min: number; readonly max: number; readonly default: number; readonly discrete: boolean }[];
  };
  readonly "multitap-delay": {
    readonly code: 41;
    readonly args: {  };
    readonly configuration: {  };
    readonly inputs: readonly [{ readonly name: "audio"; readonly signal: "audio" }];
    readonly outputs: readonly [{ readonly name: "out"; readonly signal: "audio" }];
    readonly parameters: readonly { readonly id: number; readonly min: number; readonly max: number; readonly default: number; readonly discrete: boolean }[];
  };
  readonly "noise": {
    readonly code: 13;
    readonly args: { readonly a: 0.08; readonly b: 0.5; };
    readonly configuration: {  };
    readonly inputs: readonly [];
    readonly outputs: readonly [{ readonly name: "out"; readonly signal: "audio" }];
    readonly parameters: readonly { readonly id: number; readonly min: number; readonly max: number; readonly default: number; readonly discrete: boolean }[];
  };
  readonly "oscillator": {
    readonly code: 11;
    readonly args: { readonly a: 220; readonly b: 0.4; };
    readonly configuration: {  };
    readonly inputs: readonly [{ readonly name: "sync"; readonly signal: "audio" }];
    readonly outputs: readonly [{ readonly name: "out"; readonly signal: "audio" }];
    readonly parameters: readonly { readonly id: number; readonly min: number; readonly max: number; readonly default: number; readonly discrete: boolean }[];
  };
  readonly "output": {
    readonly code: 7;
    readonly args: {  };
    readonly configuration: {  };
    readonly inputs: readonly [{ readonly name: "in"; readonly signal: "audio" }];
    readonly outputs: readonly [];
    readonly parameters: readonly { readonly id: number; readonly min: number; readonly max: number; readonly default: number; readonly discrete: boolean }[];
  };
  readonly "phase-vocoder": {
    readonly code: 62;
    readonly args: {  };
    readonly configuration: {  };
    readonly inputs: readonly [{ readonly name: "audio"; readonly signal: "audio" }];
    readonly outputs: readonly [{ readonly name: "out"; readonly signal: "audio" }];
    readonly parameters: readonly { readonly id: number; readonly min: number; readonly max: number; readonly default: number; readonly discrete: boolean }[];
  };
  readonly "phaser": {
    readonly code: 34;
    readonly args: { readonly a: 0.4; readonly b: 0.7; };
    readonly configuration: {  };
    readonly inputs: readonly [{ readonly name: "audio"; readonly signal: "audio" }];
    readonly outputs: readonly [{ readonly name: "out"; readonly signal: "audio" }];
    readonly parameters: readonly { readonly id: number; readonly min: number; readonly max: number; readonly default: number; readonly discrete: boolean }[];
  };
  readonly "phrase-gain": {
    readonly code: 63;
    readonly args: { readonly a: 1; readonly b: 0.2; };
    readonly configuration: {  };
    readonly inputs: readonly [{ readonly name: "audio"; readonly signal: "audio" }, { readonly name: "cv"; readonly signal: "control" }];
    readonly outputs: readonly [{ readonly name: "out"; readonly signal: "audio" }];
    readonly parameters: readonly { readonly id: number; readonly min: number; readonly max: number; readonly default: number; readonly discrete: boolean }[];
  };
  readonly "pitch-shifter": {
    readonly code: 49;
    readonly args: {  };
    readonly configuration: {  };
    readonly inputs: readonly [{ readonly name: "audio"; readonly signal: "audio" }];
    readonly outputs: readonly [{ readonly name: "out"; readonly signal: "audio" }];
    readonly parameters: readonly { readonly id: number; readonly min: number; readonly max: number; readonly default: number; readonly discrete: boolean }[];
  };
  readonly "pulse-oscillator": {
    readonly code: 70;
    readonly args: { readonly a: 220; readonly b: 0.4; };
    readonly configuration: {  };
    readonly inputs: readonly [{ readonly name: "sync"; readonly signal: "audio" }];
    readonly outputs: readonly [{ readonly name: "out"; readonly signal: "audio" }];
    readonly parameters: readonly { readonly id: number; readonly min: number; readonly max: number; readonly default: number; readonly discrete: boolean }[];
  };
  readonly "resonator": {
    readonly code: 60;
    readonly args: {  };
    readonly configuration: {  };
    readonly inputs: readonly [{ readonly name: "audio"; readonly signal: "audio" }];
    readonly outputs: readonly [{ readonly name: "out"; readonly signal: "audio" }];
    readonly parameters: readonly { readonly id: number; readonly min: number; readonly max: number; readonly default: number; readonly discrete: boolean }[];
  };
  readonly "retrospective-capture": {
    readonly code: 66;
    readonly args: { readonly a: 30; readonly b: 0; };
    readonly configuration: { readonly "capacitySeconds": { readonly argument: "a"; readonly min: 0;  readonly default: 30 }; };
    readonly inputs: readonly [{ readonly name: "audio"; readonly signal: "audio" }];
    readonly outputs: readonly [{ readonly name: "out"; readonly signal: "audio" }];
    readonly parameters: readonly { readonly id: number; readonly min: number; readonly max: number; readonly default: number; readonly discrete: boolean }[];
  };
  readonly "reverb": {
    readonly code: 40;
    readonly args: {  };
    readonly configuration: {  };
    readonly inputs: readonly [{ readonly name: "audio"; readonly signal: "audio" }];
    readonly outputs: readonly [{ readonly name: "out"; readonly signal: "audio" }];
    readonly parameters: readonly { readonly id: number; readonly min: number; readonly max: number; readonly default: number; readonly discrete: boolean }[];
  };
  readonly "reverse-delay": {
    readonly code: 47;
    readonly args: {  };
    readonly configuration: {  };
    readonly inputs: readonly [{ readonly name: "audio"; readonly signal: "audio" }];
    readonly outputs: readonly [{ readonly name: "out"; readonly signal: "audio" }];
    readonly parameters: readonly { readonly id: number; readonly min: number; readonly max: number; readonly default: number; readonly discrete: boolean }[];
  };
  readonly "ring-modulator": {
    readonly code: 42;
    readonly args: {  };
    readonly configuration: {  };
    readonly inputs: readonly [{ readonly name: "carrier"; readonly signal: "audio" }, { readonly name: "modulator"; readonly signal: "audio" }];
    readonly outputs: readonly [{ readonly name: "out"; readonly signal: "audio" }];
    readonly parameters: readonly { readonly id: number; readonly min: number; readonly max: number; readonly default: number; readonly discrete: boolean }[];
  };
  readonly "sample-hold": {
    readonly code: 32;
    readonly args: { readonly a: 0; };
    readonly configuration: {  };
    readonly inputs: readonly [{ readonly name: "cv"; readonly signal: "control" }, { readonly name: "trigger"; readonly signal: "control" }];
    readonly outputs: readonly [{ readonly name: "out"; readonly signal: "control" }];
    readonly parameters: readonly { readonly id: number; readonly min: number; readonly max: number; readonly default: number; readonly discrete: boolean }[];
  };
  readonly "sample-instrument": {
    readonly code: 27;
    readonly args: {  };
    readonly configuration: {  };
    readonly inputs: readonly [{ readonly name: "midi"; readonly signal: "midi" }];
    readonly outputs: readonly [{ readonly name: "out"; readonly signal: "audio" }];
    readonly parameters: readonly { readonly id: number; readonly min: number; readonly max: number; readonly default: number; readonly discrete: boolean }[];
  };
  readonly "sample-region": {
    readonly code: 26;
    readonly args: {  };
    readonly configuration: {  };
    readonly inputs: readonly [{ readonly name: "midi"; readonly signal: "midi" }];
    readonly outputs: readonly [{ readonly name: "out"; readonly signal: "audio" }];
    readonly parameters: readonly { readonly id: number; readonly min: number; readonly max: number; readonly default: number; readonly discrete: boolean }[];
  };
  readonly "shimmer": {
    readonly code: 50;
    readonly args: {  };
    readonly configuration: {  };
    readonly inputs: readonly [{ readonly name: "audio"; readonly signal: "audio" }];
    readonly outputs: readonly [{ readonly name: "out"; readonly signal: "audio" }];
    readonly parameters: readonly { readonly id: number; readonly min: number; readonly max: number; readonly default: number; readonly discrete: boolean }[];
  };
  readonly "slew-audio": {
    readonly code: 29;
    readonly args: { readonly a: 64; readonly b: 64; };
    readonly configuration: {  };
    readonly inputs: readonly [{ readonly name: "audio"; readonly signal: "audio" }];
    readonly outputs: readonly [{ readonly name: "out"; readonly signal: "audio" }];
    readonly parameters: readonly { readonly id: number; readonly min: number; readonly max: number; readonly default: number; readonly discrete: boolean }[];
  };
  readonly "slew-control": {
    readonly code: 30;
    readonly args: { readonly a: 16; readonly b: 16; };
    readonly configuration: {  };
    readonly inputs: readonly [{ readonly name: "cv"; readonly signal: "control" }];
    readonly outputs: readonly [{ readonly name: "out"; readonly signal: "control" }];
    readonly parameters: readonly { readonly id: number; readonly min: number; readonly max: number; readonly default: number; readonly discrete: boolean }[];
  };
  readonly "spectrum-analyzer": {
    readonly code: 21;
    readonly args: { readonly a: 1; readonly b: 0.85; };
    readonly configuration: {  };
    readonly inputs: readonly [{ readonly name: "audio"; readonly signal: "audio" }];
    readonly outputs: readonly [{ readonly name: "out"; readonly signal: "audio" }];
    readonly parameters: readonly { readonly id: number; readonly min: number; readonly max: number; readonly default: number; readonly discrete: boolean }[];
  };
  readonly "stereo-delay": {
    readonly code: 18;
    readonly args: { readonly a: 250; readonly b: 375; };
    readonly configuration: {  };
    readonly inputs: readonly [{ readonly name: "audio"; readonly signal: "audio" }];
    readonly outputs: readonly [{ readonly name: "out"; readonly signal: "audio" }];
    readonly parameters: readonly { readonly id: number; readonly min: number; readonly max: number; readonly default: number; readonly discrete: boolean }[];
  };
  readonly "stereo-widener": {
    readonly code: 38;
    readonly args: {  };
    readonly configuration: {  };
    readonly inputs: readonly [{ readonly name: "audio"; readonly signal: "audio" }];
    readonly outputs: readonly [{ readonly name: "out"; readonly signal: "audio" }];
    readonly parameters: readonly { readonly id: number; readonly min: number; readonly max: number; readonly default: number; readonly discrete: boolean }[];
  };
  readonly "stutter": {
    readonly code: 48;
    readonly args: {  };
    readonly configuration: {  };
    readonly inputs: readonly [{ readonly name: "audio"; readonly signal: "audio" }];
    readonly outputs: readonly [{ readonly name: "out"; readonly signal: "audio" }];
    readonly parameters: readonly { readonly id: number; readonly min: number; readonly max: number; readonly default: number; readonly discrete: boolean }[];
  };
  readonly "sum2": {
    readonly code: 4;
    readonly args: { readonly a: 1; readonly b: 1; };
    readonly configuration: {  };
    readonly inputs: readonly [{ readonly name: "a"; readonly signal: "audio" }, { readonly name: "b"; readonly signal: "audio" }];
    readonly outputs: readonly [{ readonly name: "out"; readonly signal: "audio" }];
    readonly parameters: readonly { readonly id: number; readonly min: number; readonly max: number; readonly default: number; readonly discrete: boolean }[];
  };
  readonly "svf": {
    readonly code: 6;
    readonly args: {  };
    readonly configuration: {  };
    readonly inputs: readonly [{ readonly name: "audio"; readonly signal: "audio" }];
    readonly outputs: readonly [{ readonly name: "out"; readonly signal: "audio" }];
    readonly parameters: readonly { readonly id: number; readonly min: number; readonly max: number; readonly default: number; readonly discrete: boolean }[];
  };
  readonly "three-band-eq": {
    readonly code: 45;
    readonly args: {  };
    readonly configuration: {  };
    readonly inputs: readonly [{ readonly name: "audio"; readonly signal: "audio" }];
    readonly outputs: readonly [{ readonly name: "out"; readonly signal: "audio" }];
    readonly parameters: readonly { readonly id: number; readonly min: number; readonly max: number; readonly default: number; readonly discrete: boolean }[];
  };
  readonly "transient-shaper": {
    readonly code: 43;
    readonly args: {  };
    readonly configuration: {  };
    readonly inputs: readonly [{ readonly name: "audio"; readonly signal: "audio" }];
    readonly outputs: readonly [{ readonly name: "out"; readonly signal: "audio" }];
    readonly parameters: readonly { readonly id: number; readonly min: number; readonly max: number; readonly default: number; readonly discrete: boolean }[];
  };
  readonly "voice-synth": {
    readonly code: 10;
    readonly args: {  };
    readonly configuration: {  };
    readonly inputs: readonly [{ readonly name: "midi"; readonly signal: "midi" }];
    readonly outputs: readonly [{ readonly name: "out"; readonly signal: "audio" }];
    readonly parameters: readonly { readonly id: number; readonly min: number; readonly max: number; readonly default: number; readonly discrete: boolean }[];
  };
  readonly "wave-shaper": {
    readonly code: 37;
    readonly args: {  };
    readonly configuration: {  };
    readonly inputs: readonly [{ readonly name: "audio"; readonly signal: "audio" }];
    readonly outputs: readonly [{ readonly name: "out"; readonly signal: "audio" }];
    readonly parameters: readonly { readonly id: number; readonly min: number; readonly max: number; readonly default: number; readonly discrete: boolean }[];
  };
};
export type PrimitiveType = keyof typeof PORT_CATALOG;
export type SignalType = "audio" | "control" | "midi";
export interface PortDescription { readonly name: string; readonly signal: SignalType; }
export type PrimitiveDescription = typeof PORT_CATALOG[PrimitiveType];
