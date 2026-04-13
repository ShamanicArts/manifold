# Voice State Visualization Patterns — MIDI Effect UI Design

**Date:** 2026-04-13  
**Context:** User implementing voice data bridge in `export_midi_effect_scaffold.lua`  
**New Fields:** `voiceIndex`, `inputNote`, `outputNote`, `note`, `inputAmp`, `outputAmp`, `passes`  

---

## 1. What the User Built Today

The latest commit adds bidirectional voice state flow:

```lua
-- Scaffold publishes voice entries:
publishVoiceEntries(base .. "/activeVoices", voiceEntries)
-- Fields: voiceIndex, inputNote, outputNote, note, inputAmp, outputAmp, passes

-- UI reads back via OSC:
local activeVoiceCount = osc.getValue(base .. "/activeVoices/count")
for i = 1, activeVoiceCount do
  local entry = osc.getValue(base .. "/activeVoices/" .. i)
  -- entry.voiceIndex, entry.inputNote, etc.
end
```

This enables **real-time visualization of polyphonic voice allocation** — critical for MIDI effects like arpeggiators, chord generators, and voice processors.

---

## 2. Voice Visualization Patterns

### Pattern A: Piano Roll Voice Display

Shows active voices as bars on a piano keyboard representation.

```
    ┌─────────────────────────────────────┐
    │ C5  ┌───┐                          │
    │     │ 3 │  ← Voice 3 active on C5  │
    │ B4  ├───┤                          │
    │     │   │                          │
    │ A4  ├───┤                          │
    │     │ 1 │  ← Voice 1 active on A4  │
    │ G4  ├───┤                          │
    │     │   │                          │
    │ F4  ├───┤                          │
    │     │ 2 │  ← Voice 2 active on F4  │
    └─────────────────────────────────────┘
```

**Best for:** Arpeggiators, chord generators, note filters  
**Data needed:** `voiceIndex`, `outputNote`, `outputAmp`  
**Update rate:** 30-60fps for smooth animations

### Pattern B: Voice Slot Grid

Fixed slots showing each voice's state (inspired by vintage polyphonic synths).

```
    ┌─────┬─────┬─────┬─────┬─────┬─────┬─────┬─────┐
    │  1  │  2  │  3  │  4  │  5  │  6  │  7  │  8  │
    ├─────┼─────┼─────┼─────┼─────┼─────┼─────┼─────┤
    │ C3  │ OFF │ E3  │ OFF │ G3  │ OFF │ OFF │ OFF │
    │ ▓▓▓ │     │ ░░░ │     │ ▓▓▓ │     │     │     │
    └─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┘
     Active  Idle  Active
```

**Best for:** Voice allocators, drum machines, limited-voice synths  
**Data needed:** `voiceIndex`, `outputNote`, `outputAmp` (for level meter)  
**Advantage:** Shows voice stealing behavior clearly

### Pattern C: Input/Output Comparison

Side-by-side display showing transformation (critical for ScaleQuantizer, Transpose).

```
    Input:     C   D   E   F   G   A   B
               ↓   ↓   ↓   ↓   ↓   ↓   ↓
    Output:    C   D   D♯  F   G   G♯  B
              
    Active:   [█] [█] [░] [█] [█] [░] [█]
              
    Key:      ▓ = in scale, ░ = quantized to scale
```

**Best for:** ScaleQuantizer, Transpose, NoteFilter  
**Data needed:** `inputNote`, `outputNote`, `passes` (filter result)  
**Insight:** Shows *what changed* — educational for users learning music theory

### Pattern D: Voice Activity Timeline

Scrollable history showing note on/off events over time.

```
    ──────┬───────────────────────────────→ time
    Voice1│  ▄▄▄▄      ▄▄▄▄
    Voice2│      ▄▄▄▄      ▄▄▄▄
    Voice3│  ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
    Voice4│
          └───────────────────────────────
          C4   E4   G4   C5
```

**Best for:** Arpeggiators with complex patterns, debugging timing issues  
**Data needed:** All voice fields + timestamps  
**Note:** Requires buffer/history management in UI layer

---

## 3. Design Considerations for Manifold

### Update Rate vs. Audio Thread

The scaffold publishes voice state on every process call. Consider:

| Approach | Latency | CPU Cost | Visual Quality |
|----------|---------|----------|----------------|
| Direct OSC read (current) | ~1-5ms | Low | Excellent |
| Throttled (30fps) | ~33ms | Lower | Good |
| Event-driven | Variable | Lowest | May miss fast changes |

**Recommendation:** Keep direct OSC reads for now — the `activeVoices/count` field lets UI detect changes efficiently.

### Field Semantics by Effect Type

| Effect | `inputNote` | `outputNote` | `passes` | Primary Visualization |
|--------|-------------|--------------|----------|----------------------|
| Arpeggiator | Original held notes | Arpeggiated output | Always true | Timeline or Piano roll |
| ScaleQuantizer | Input note | Quantized note | true if changed | Input/Output comparison |
| NoteFilter | Input note | Same as input or nil | Filter result | Active notes grid |
| Transpose | Input note | Transposed note | Always true | Input/Output comparison |
| VelocityMapper | Input velocity | Output velocity | Always true | Velocity bars |

### Edge Cases to Handle

1. **Rapid note changes** — Voice slot may show previous note briefly before update
2. **Voice stealing** — Same `voiceIndex` with different `inputNote` indicates steal
3. **Zero-velocity note on** (MIDI convention for note off) — `outputAmp` goes to 0
4. **MIDI panic (CC 123)** — All voices should clear within one frame

---

## 4. Implementation Sketch for Manifold UI

```lua
-- VoiceGrid widget for dynamic_module_ui
local VoiceGrid = {}

function VoiceGrid.new(maxVoices)
  local self = {
    maxVoices = maxVoices or 8,
    voices = {}, -- cached voice state
    lastCount = 0,
  }
  return setmetatable(self, { __index = VoiceGrid })
end

function VoiceGrid:updateFromOSC(osc, base)
  local count = math.max(0, math.floor(tonumber(osc.getValue(base .. "/count")) or 0))
  self.lastCount = count
  
  for i = 1, count do
    local entryBase = base .. "/" .. tostring(i)
    self.voices[i] = {
      voiceIndex = osc.getValue(entryBase .. "/voiceIndex"),
      inputNote = osc.getValue(entryBase .. "/inputNote"),
      outputNote = osc.getValue(entryBase .. "/outputNote"),
      outputAmp = osc.getValue(entryBase .. "/outputAmp") or 127,
    }
  end
  
  -- Clear stale entries
  for i = count + 1, self.maxVoices do
    self.voices[i] = nil
  end
end

function VoiceGrid:draw(ctx, x, y, w, h)
  local slotHeight = h / self.maxVoices
  
  for i = 1, self.maxVoices do
    local voice = self.voices[i]
    local slotY = y + (i - 1) * slotHeight
    
    if voice and voice.outputNote then
      -- Active voice: draw note name + level bar
      local noteName = noteNumberToName(voice.outputNote)
      local level = (voice.outputAmp or 127) / 127
      
      drawNoteSlot(ctx, x, slotY, w, slotHeight, 
                   i, noteName, level, voice.inputNote ~= voice.outputNote)
    else
      -- Inactive slot
      drawEmptySlot(ctx, x, slotY, w, slotHeight, i)
    end
  end
end
```

---

## 5. References

- **Roland Juno-106**: Classic voice allocation display (LED per voice)
- **Ableton Live Arpeggiator**: Visual feedback on held vs. playing notes
- **Xfer Serum**: Voice stack visualization in OSC section
- **Bitwig Studio**: Voice monitoring in Note Receiver device

---

*Generated for Manifold Tulpa — Voice State Visualization Patterns*
