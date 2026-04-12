# MIDI Effect Validation Strategies — Manifold Export Architecture

**Date:** 2026-04-12  
**Context:** User building MIDI effects export system (Arp, ScaleQuantizer, NoteFilter, Transpose, VelocityMapper)  
**Architecture:** `export_midi_effect_scaffold.lua` + adapters + standalone projects

---

## 1. Unique Challenges of MIDI Effect Exports

Unlike audio FX exports, MIDI effects present distinct validation challenges:

| Challenge | Audio FX | MIDI Effects |
|-----------|----------|--------------|
| **Output determinism** | Same input → same samples | Same input → same MIDI *only if* timing identical |
| **State space** | Bounded (buffer sizes, coeffs) | Unbounded (note history, voice states) |
| **Timing sensitivity** | Block-based, forgiving | Sample-accurate MIDI critical |
| **Host interaction** | Simple I/O buffers | Complex voice allocation, note stealing |
| **Side effects** | None (pure function) | Note on/off state changes host synth |

### Specific Risks in Manifold's Architecture

1. **Voice router eviction logic** — LRU voice stealing in `createNoteRouter()` can cause non-deterministic output if multiple notes compete for limited slots
2. **Runtime state coupling** — `arp_runtime` maintains state across process calls; initialization order matters
3. **Parameter change timing** — Async parameter changes vs. MIDI event processing order
4. **MIDI output emitter** — `buildEmitter()` forwards events; double-send or dropped notes possible

---

## 2. Validation Patterns for MIDI Effects

### Pattern A: Golden File Testing

Record MIDI output for known input sequences, compare against reference.

```lua
-- Test harness concept for scaffold-based effects
local function testGoldenFile(effect, inputMidiFile, expectedOutputFile)
  local inputEvents = parseMidiFile(inputMidiFile)
  local expected = parseMidiFile(expectedOutputFile)
  local actual = {}
  
  -- Mock emitter that captures instead of sends
  local captureEmitter = {
    noteOn = function(ch, note, vel) table.insert(actual, {type="note_on", ch=ch, note=note, vel=vel, time=currentTime}) end,
    noteOff = function(ch, note) table.insert(actual, {type="note_off", ch=ch, note=note, time=currentTime}) end,
    -- ... other methods
  }
  
  -- Run through effect
  for _, event in ipairs(inputEvents) do
    effect.handleMidiEvent(event, captureEmitter)
  end
  
  -- Compare with tolerance for timing
  return compareMidiEvents(expected, actual, {timingToleranceMs=1.0})
end
```

**Best for:** Arpeggiator patterns, ScaleQuantizer output verification

### Pattern B: Property-Based Testing

Define invariants that must hold regardless of input.

| Effect | Invariant |
|--------|-----------|
| Arp | Every `note_on` has corresponding `note_off` (no stuck notes) |
| ScaleQuantizer | Output note is always in defined scale |
| NoteFilter | Filtered notes never produce output |
| Transpose | Output note = input note + offset (clamped 0-127) |
| VelocityMapper | Output velocity monotonically related to input |

**Implementation approach:**
```lua
-- QuickCheck-style property test
function testArpNoStuckNotes()
  for i = 1, 1000 do
    local randomInput = generateRandomNoteSequence()
    local emitter = MockEmitter.new()
    local effect = createArpEffect()
    
    processSequence(effect, randomInput, emitter)
    
    -- Invariant: activeNoteCount should return to 0 after all note offs
    assert(emitter:allNotesReleased(), "Stuck notes detected!")
  end
end
```

### Pattern C: Stress Testing

Test edge cases that rarely occur in normal use but can crash/freeze:

1. **Note flood** — 1000 note_ons at exact same timestamp
2. **Rapid mode switching** — Change arp mode every sample
3. **Extreme parameters** — Rate = 0, Octaves = 100, Gate = 0.001
4. **MIDI panic scenarios** — All notes off (CC 123) mid-arpeggio
5. **Buffer size boundaries** — Process with block sizes 1, 16, 4096, 8192

### Pattern D: Cross-Validation Against Reference

Compare Manifold export output against:
- The same effect running inside full Manifold
- Industry-standard equivalents (Ableton Arpeggiator, Logic Arpeggiator)

This catches export-specific bugs (parameter mapping, timing drift).

---

## 3. Host-Specific Validation

### VST3 MIDI I/O Quirks

From VST3 SDK documentation and empirical testing:

1. **Note expression vs. CC** — VST3 prefers note expressions for per-note modulation; CCs are global
2. **MPE support** — Modern hosts expect MPE compatibility for polyphonic expression
3. **Bus configuration** — MIDI effects should expose `kMain` as in/out, not aux
4. **Parameter automation** — Host automation vs. internal parameter smoothing conflicts

### Testing Matrix

| Host | MIDI Effect Support | Known Quirks |
|------|---------------------|--------------|
| Ableton Live 12 | Full | Aggressive PDC, can shift MIDI timing |
| Bitwig Studio 5 | Full | Excellent MPE support, strict timing |
| Reaper 7 | Full | User-configurable PDC, test at various settings |
| Logic Pro | Full (AU) | Bus validation stricter than VST3 |
| FL Studio | Partial | Some MIDI FX routing limitations |

---

## 4. Automated CI Pipeline

Suggested validation stages for each MIDI effect export:

```
Stage 1: Unit Tests (Lua, fast)
  - Voice router edge cases
  - Parameter binding correctness
  - State machine transitions

Stage 2: Integration Tests (C++ plugin, medium)
  - Load plugin in JUCE test host
  - Send MIDI, capture output
  - Verify against golden files

Stage 3: Host Compatibility (slow, optional)
  - Load in Reaper via scripting
  - Automated interaction via OSC
  - Screenshot comparison for UI

Stage 4: Stress Tests (overnight)
  - Fuzzing random MIDI streams
  - Memory leak detection (valgrind/drmemory)
  - Long-running stability (24hr test)
```

---

## 5. Recommendations for Current Work

### Immediate Actions

1. **Add deterministic mode to scaffold** — Optional flag that disables LRU eviction, uses round-robin instead (enables golden file testing)

2. **Create test adapter** — A `test_emitter` that records all output with timestamps for comparison

3. **Property tests for each adapter** — Invariants specific to each effect type:
   ```lua
   -- export_midi_effects/arp_test.lua
   test("arp never outputs note > 127 or < 0", function()
     -- fuzz test
   end)
   ```

4. **Timing validation** — Ensure `process()` calls maintain consistent `dt` calculations across buffer size changes

### Architectural Improvements

1. **State serialization round-trip** — Test that save/restore produces identical output
2. **Multi-instance isolation** — Two Arp plugins shouldn't share state
3. **Thread safety validation** — GUI thread vs. audio thread parameter access

---

## 6. References

- VST3 MIDI Specification: Steinberg VST3 SDK docs (v3.7.8+)
- MIDI 2.0 Specification: midi.org
- JUCE MIDI classes: `juce::MidiBuffer`, `juce::MidiMessage`
- Manifold internal: `arp_runtime.lua`, `voice_router.lua` patterns

---

*Generated for Manifold Tulpa — MIDI Effect Export Validation*
