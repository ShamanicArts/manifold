# Main note ownership boundary

The original Main project has two distinct voice layers:

- `UserScripts/projects/Main/ui/behaviors/voice_manager.lua` allocates eight slots from incoming MIDI. It picks the first inactive/idle slot, then the quietest releasing slot, then the oldest stamp. Note-on of an already held pitch can use a different idle slot. Note-off releases all active slots with that pitch. Velocity maps to `clamp(0.03 + velocity / 127 × 0.37, 0, 0.40)`.
- `UserScripts/projects/Main/lib/adsr_runtime.lua` advances the UI envelope and produces voice amplitude. `UserScripts/projects/Main/dsp/midisynth_integration.lua` registers eight DSP voices and receives `/midi/synth/voice/{i}/{freq,amp,gate}` paths through `VoicePool`. Gate-on triggers or resumes sample playback and resets the phase vocoder; gate-off clears additive amplitudes immediately but lets release amplitude finish. The old voice graph does not construct an ADSR node.

Checkpoint 120 ports only the allocation decisions into a fixed eight-slot Rust `MainVoiceAllocator`. The [reference trace](../web/public/reference/main-voice-allocation/manifest.json) calls the original UI function across 21 steps and matches Rust exactly for slot choice, state masks, and notes. It does not establish an audio envelope, callback timing, or mixed polyphonic Main output. The existing v2 `VoiceSynth` allocator differs: it prefers an already playing matching note and then the oldest slot, so reusing it directly would change Main note semantics.

Next, prepare eight independent Main voice source states without allocating on the audio callback, publish note events at sample offsets, and define how a sample-clock envelope drives each voice amplitude. Compare single-note attack/release, repeated notes, quiet-release steal, oldest steal, and panic against bounded old-project behavior. Keep the old Lua runner only as a reference tool; product note handling belongs in Rust.
