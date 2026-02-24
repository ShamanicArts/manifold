# GrainFreeze - Early Prototype

This is the original GrainFreeze granular synthesizer plugin, moved here to make room for the new primitives-based architecture.

## Status
**Prototype/Archive** - This version works but is not actively developed.

## Files
- `PluginProcessor.h/cpp` - Main audio processor with MIDI handling
- `PluginEditor.h/cpp` - Custom UI with waveform display
- `GranularEngine.h` - Core granular synthesis (16 voices, 8 grains each)
- `EffectsProcessor.h` - Reverb and shimmer effects

## Future
This plugin should be rewritten using the primitives architecture from the Looper plugin:
- DSP primitives from `primitives/dsp/`
- ControlServer for external control
- Canvas + LuaEngine for UI
- Lock-free, real-time safe design
