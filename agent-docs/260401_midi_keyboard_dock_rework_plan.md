# MIDI Keyboard Dock Rework Plan

## Status

**Status:** Planning / Architecture Definition  
**Date:** 2026-04-01  
**Risk Level:** Medium  
**Dependencies:** MidiSynth modulation endpoint registry (partially complete)

This document captures the architectural direction for reworking the MIDI keyboard panel and dock system in the Main project. The work consolidates three disparate view modes into a single unified split-view layout with variable-height keyboard sizing.

---

## 1. Core Purpose

The keyboard dock system currently maintains three separate layout modes (`full`, `compact_split`, `compact_collapsed`) with complex conditional visibility logic. This creates visual inconsistency and redundant code paths. The rework unifies all modes into a single continuous layout where only the keyboard height varies.

The unification enables:
- A cleaner mental model: "the keyboard grows/shrinks, everything else stays"
- Continuous drag-to-resize with snap presets
- Persistent utility space for the palette and MIDI device controls
- Elimination of mode-switching complexity

---

## 2. What Was Discussed

### 2.1 The Gap Observation

There is currently visual dead space between the third rack row and the keyboard panel in compact modes. The rack container is 452px tall, but rackRow3 starts at y=465 and extends to y=685, creating a clipped overflow. Meanwhile the keyboard panel (in compact mode) shows just a 44px header, leaving unused screen real estate.

### 2.2 The Unified Layout Vision

All modes collapse into one structure:

```
┌─────────────────────────────┐
│                             │
│    UTILITY SPLIT AREA       │  ← palette, scopes, spectrum
│    (expands/contracts)      │     user racks, etc.
│                             │
├─────────────────────────────┤  ← DRAG HANDLE (thin bar)
│    MIDI PARAMETER RACK      │  ← device CC sliders + macros
│    (fixed ~60-80px)         │     always visible
├─────────────────────────────┤
│    KEYBOARD CANVAS          │  ← piano keys
│    (0-200px+ variable)      │     grows/shrinks
├─────────────────────────────┤
│    CONTROL BAR              │  ← octave, key count,
│    (fixed ~42px)            │     MIDI input, panic
└─────────────────────────────┘
```

**Three height presets via dots:**
- **Collapsed**: keyboardCanvas = 0px (hidden, utility + MIDI rack only)
- **Compact**: keyboardCanvas = ~60-80px (mini keys visible)
- **Full**: keyboardCanvas = ~200px+ (full-size keys)

**Drag behavior:**
- Handle sits between utility split and MIDI rack
- Drag up: utility shrinks, keyboard grows downward
- Drag down: utility expands, keyboard shrinks
- MIDI rack stays fixed height, shifts with keyboard
- Snap to nearest preset when near threshold

### 2.3 The MIDI Parameter Rack

The new `midiParamRack` container sits between utility split and keyboard, always visible. It displays:

- MIDI CC sliders for the currently connected device (0-127, discovered via existing `midi_sources.lua` provider)
- Macro/favorites section (paginated or tabbed)
- Possibly quick-access parameter assignments

This rack is the dedicated home for hardware MIDI device parameters, fulfilling the existing requirement to expose controller-advertised parameters in a scrollable UI surface.

### 2.4 Naming Changes

The `keyboardHeader` widget (currently at bottom) becomes `controlBar` to reflect that it houses general utility controls beyond just keyboard concerns (octave, key count, MIDI input selection, panic, etc.).

### 2.5 Mode Simplification

The current three-mode system (`full`, `compact_split`, `compact_collapsed`) collapses to:

- **One layout**: Always split view
- **Three height presets**: Just different `keyboardHeight` values
- **Continuous drag**: Override height temporarily, snap on release

The dock mode dots cycle through presets but no longer trigger complex layout switches.

---

## 3. Core Files to Touch

### Primary Behavior Files
- `UserScripts/projects/Main/ui/behaviors/midisynth.lua` — dock mode simplification, height calculations, layout rendering
- `UserScripts/projects/Main/lib/ui/rack_controller.lua` — dock mode controls, dot click handlers
- `UserScripts/projects/Main/lib/ui/init_controls.lua` — drag handle binding, MIDI rack initialization

### UI Component Files
- `UserScripts/projects/Main/ui/components/midisynth_view.ui.lua` — layout structure, new midiParamRack container, renamed controlBar
- `UserScripts/projects/Main/ui/components/rack_container.lua` — possible pagination dot repositioning

### State/Persistence Files
- `UserScripts/projects/Main/ui/behaviors/midisynth.lua` (save/load functions) — persist `keyboardHeight` instead of mode enum

### Modulation Integration (related)
- `UserScripts/projects/Main/lib/modulation/endpoint_registry.lua` — already exposes MIDI device endpoints via `midi_sources.lua`
- `UserScripts/projects/Main/lib/ui/midi_devices.lua` — device discovery, already integrated

---

## 4. Descriptive Outline of Work

### 4.1 State Model Simplification

**Current state:**
```lua
ctx._dockMode = "full" | "compact_split" | "compact_collapsed"
ctx._keyboardCollapsed = boolean
dock.heightMode = "full" | "compact" | "collapsed"
dock.layoutMode = "single" | "split"
```

**New state:**
```lua
ctx._keyboardHeight = number (0 to max, persisted)
ctx._dockMode = "compact" | "compact_split" | "full"  -- now just snap presets
-- heightMode and layoutMode consolidate to always-split behavior
```

The height becomes the source of truth. Mode presets simply set canonical heights (0, 80, 200). Dragging overrides temporarily.

### 4.2 Layout Rendering Consolidation

**Current:** Three separate visibility/ordering branches in `refreshManagedLayoutState()` based on mode.

**New:** Single layout path where:
- `utilitySplitArea` always visible, order=1
- `midiParamRack` always visible, order=2, fixed basisH
- `keyboardBody`/`keyboardCanvas` order=3, variable basisH from `ctx._keyboardHeight`
- `controlBar` always visible, order=4, fixed basisH

The `splitVisible` conditional logic disappears.

### 4.3 Height Calculation

**Current:** `computeKeyboardPanelHeight()` returns mode-based discrete values.

**New:** Returns `controlBarHeight + keyboardHeight + midiParamRackHeight` where `keyboardHeight` comes from state (with min/max clamping).

Total panel height varies continuously with keyboard height, bounded by available space below rack.

### 4.4 Drag Handle Implementation

New thin horizontal bar widget (`keyboardResizeHandle`) positioned between utility split and MIDI rack.

Mouse interaction:
- `setOnMouseDown`: Record start Y, current keyboard height
- `setOnMouseDrag`: Calculate delta Y, update `ctx._keyboardHeight`, trigger relayout
- `setOnMouseUp`: Snap to nearest preset (0, 80, 200), persist height

### 4.5 MIDI Parameter Rack Population

The `midiParamRack` container initializes as empty placeholder initially. Population happens via:

- Query `ctx._modEndpointRegistry:getSources()` for provider="midi-device"
- Filter by currently selected device (from `MidiDevices.getCurrentMidiInputLabel()`)
- Generate slider widgets for each CC endpoint (0-127 or subset advertised)
- Paginate or tab between "Device CCs" and "Macros/Favorites"

This leverages existing endpoint discovery in `midi_sources.lua`.

### 4.6 Control Bar Rename

Widget ID `keyboardHeader` becomes `controlBar` in UI component file. All references in behavior files updated.

### 4.7 Persistence Update

`saveRuntimeState()` and `loadSavedState()` updated to save/load `keyboardHeight` numeric value instead of complex dock mode enums.

### 4.8 Mode Dot Rewiring

The three pagination dots (currently `full`, `compact_split`, `compact_collapsed`) rewire to:
- Dot 1: Set `keyboardHeight = 0` (collapsed)
- Dot 2: Set `keyboardHeight = 80` (compact)
- Dot 3: Set `keyboardHeight = 200` (full)

Visual selection follows current height proximity.

---

## 5. Integration with Existing Systems

### 5.1 Modulation Endpoint Registry

The MIDI parameter rack consumes endpoints from the existing modulation system:

```lua
local endpoints = registry:getSources()
-- filter for provider == "midi-device" and deviceKey == currentDevice
```

This was already designed to expose hardware device parameters. The keyboard panel MIDI rack becomes the first UI projection over that data.

### 5.2 MIDI Device Discovery

Existing `MidiDevices` module (`lib/ui/midi_devices.lua`) already:
- Enumerates available inputs
- Handles device selection
- Triggers endpoint registry rebuilds on device change

The MIDI rack observes `ctx._modKnownMidiDevices` and `ctx._selectedMidiInputLabel` to repopulate when devices change.

### 5.3 Existing Drag Patterns

The rack node dragging implementation (`setupShellDragHandlers`) provides the interaction pattern:
- `dragState` for tracking
- `setOnMouseDown/Drag/Up` on node accents
- Delta calculation and visual preview

Similar pattern applies to the resize handle.

---

## 6. Non-Goals for This Work

- Converting audio-rate modulation (not relevant to keyboard UI)
- New LFO/modulation source types (use existing endpoint registry)
- Complete modulation matrix UI (out of scope, patchbay handles that)
- Spectrum/scope implementations (utility split area hosts them, doesn't implement them)
- MIDI learn functionality (future work, registry supports it but UI doesn't expose it yet)

---

## 7. Success Criteria

- Single layout structure, no mode-dependent visibility branches
- Drag handle resizes keyboard smoothly between 0-200px+
- Three preset dots snap to canonical heights
- MIDI parameter rack always visible, shows current device CCs
- Control bar renamed and functional
- State persists across sessions
- No regression in existing octave/key count/MIDI input functionality
- Utility split area visible in all modes, expands/contracts with drag

---

## 8. Notes on Adjacent Future Work

This rework enables but does not implement:

- **MIDI learn:** The endpoint registry already tracks device CCs. Future work could add "click to assign" flow.
- **Spectrum/scope panels:** Utility split area will host these as one of its view options.
- **User rack thumbnails:** Palette view in utility split area could show saved rack configurations.
- **Modulation visualization:** Control bar and MIDI rack controls could show modulation overlays once target-state separation is complete.

The architecture supports these without requiring further layout changes.
