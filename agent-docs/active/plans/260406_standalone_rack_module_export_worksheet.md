# Standalone Rack Module Export Worksheet

**Date:** 2026-04-06  
**Status:** Planning  
**Owner:** Agent + User  
**Related:** `260402_rack_module_factory_refactor_worksheet.md`, `260402_rack_module_swarm_0_plan.md`, `260405_samplesynth_rack_extraction_plan.md`

---

## Goal

Enable each rack module to be exported as its own standalone VST3 plugin binary that can be dropped into any DAW (Ableton, Reaper, etc.) and used independently of the full Manifold instrument.

Each exported plugin is a self-contained VST3 that:
- Compiles the Manifold C++ runtime (Lua engine, DSP primitives, audio graph, JUCE wrapper)
- Boots into a single-module Lua project at launch (no project selector, no multi-module host)
- Presents that module's UI at its canonical aspect ratio
- Accepts MIDI input and/or audio input as appropriate for the module type
- Exposes the module's parameters as VST automatable parameters
- Produces audio output

The RackModuleHost user project serves as the **dev sandbox** — a place to load any module, test it with MIDI/audio, iterate on its UI, and verify standalone behavior — before committing to a per-module VST3 build target.

---

## Non-goals

Do **not**:
- Redesign the rack module DSP architecture — the modules already ARE standalone DSP descriptions
- Build a modular-host VST3 that loads modules at runtime — each export is a fixed, single-module binary
- Fork or duplicate module Lua code — exported plugins reference the exact same `rack_modules/*.lua`, behaviors, and components as Main
- Create a new plugin format — VST3 and Standalone only, same as Manifold
- Change how Main works — this is purely additive infrastructure

---

## Why This Works — The Modules Are Already Standalone

Each rack module in `lib/rack_modules/` is a self-contained DSP description that creates and wires its own C++ primitive nodes:

| Module | File | Creates |
|--------|------|---------|
| Oscillator | `oscillator.lua` | `OscillatorNode` × (voices + manual), `MixerNode`, `GainNode` |
| Sample | `sample.lua` | `SampleRegionPlaybackNode`, `PhaseVocoderNode`, `GainNode`, `MixerNode`, `PassthroughNode` (capture input) |
| Filter | `filter.lua` | `SVFNode` |
| FX | `fx.lua` | `FxSlot` (delegates to effect sub-graph) |
| EQ | `eq.lua` | `EQ8Node` |
| Blend | `blend_simple.lua` | `CrossfaderNode`, `RingModulatorNode`, `AudioFmNode`, `AudioSyncNode`, `MixerNode`, `GainNode` |

Each module's `create(deps)` function receives the primitive runtime (`ctx.primitives`, `ctx.graph`) and returns a table with:
- `createSlot(slotIndex)` — instantiates the DSP graph for one instance
- `applyPath(path, value)` — routes parameter changes to the correct node

They are NOT thin parameter skins over a monolithic synth. They ARE individual DSP plugin descriptions. The Manifold C++ runtime provides the primitive node implementations and audio graph — the Lua module IS the plugin.

---

## Current State — What Exists

### RackModuleHost project (broken, needs fix)
`UserScripts/projects/RackModuleHost/` — 4 files:
- `manifold.project.json5` — project manifest
- `ui/main.ui.lua` — UI layout (sidebar + viewport, all modules stretched to 876×594)
- `ui/behaviors/main.lua` — UI behavior (module switching, sidebar controls)
- `dsp/main.lua` — DSP that wraps `midisynth_integration.lua` (the FULL synth, not individual modules)

**Problems:**
1. Aspect ratios broken — everything stretched to 876×594 regardless of module's canonical size
2. No MIDI input — no `Midi.pollInputEvent()`, no voice triggering
3. No external audio input — can't feed DAW/audio card audio into audio-input modules
4. Input generation doesn't work — utility oscillators in slots 31/32 aren't properly connected
5. Only 6 audio modules — missing all voice/mod/utility modules (ADSR, LFO, Arp, etc.)
6. Doesn't use `rack_module_shell.lua` — no proper framing, header bar, accent strip
7. DSP loads the FULL midisynth — not individual rack module DSP

### Module inventory (from `rack_midisynth_specs.lua`)

**Audio modules (have rack_modules/*.lua DSP):**
| Module ID | Category | DSP File | UI Component | UI Behavior |
|-----------|----------|----------|--------------|-------------|
| `rack_oscillator` | audio | `rack_modules/oscillator.lua` | `rack_oscillator.ui.lua` (560×200) | `rack_oscillator.lua` |
| `rack_sample` | audio | `rack_modules/sample.lua` | `rack_sample.ui.lua` (560×200) | `rack_sample.lua` |
| `filter` | audio | `rack_modules/filter.lua` | `filter.ui.lua` | `filter.lua` |
| `fx` | fx | `rack_modules/fx.lua` | `fx_slot.ui.lua` | `fx_slot.lua` |
| `eq` | fx | `rack_modules/eq.lua` | `eq.ui.lua` | `eq.lua` |
| `blend_simple` | audio | `rack_modules/blend_simple.lua` | `rack_blend_simple.ui.lua` (280×200) | `rack_blend_simple.lua` |

**Voice modules (have runtime.lua, behavior, component):**
| Module ID | Category | Runtime | UI Component | UI Behavior |
|-----------|----------|---------|--------------|-------------|
| `adsr` | voice | `adsr_runtime.lua` | `envelope.ui.lua` | `envelope.lua` |
| `arp` | voice | `arp_runtime.lua` | `arp.ui.lua` | `arp.lua` |
| `transpose` | voice | `transpose_runtime.lua` | `transpose.ui.lua` | `transpose.lua` |
| `velocity_mapper` | voice | `velocity_mapper_runtime.lua` | `velocity_mapper.ui.lua` | `velocity_mapper.lua` |
| `scale_quantizer` | voice | `scale_quantizer_runtime.lua` | `scale_quantizer.ui.lua` | `scale_quantizer.lua` |
| `note_filter` | voice | `note_filter_runtime.lua` | `note_filter.ui.lua` | `note_filter.lua` |

**Mod/utility modules (have runtime.lua, behavior, component):**
| Module ID | Category | Runtime | UI Component | UI Behavior |
|-----------|----------|---------|--------------|-------------|
| `lfo` | mod | `lfo_runtime.lua` | `lfo.ui.lua` | `lfo.lua` |
| `slew` | mod | `slew_runtime.lua` | `slew.ui.lua` | `slew.lua` |
| `sample_hold` | mod | `sample_hold_runtime.lua` | `sample_hold.ui.lua` | `sample_hold.lua` |
| `compare` | mod | `compare_runtime.lua` | `compare.ui.lua` | `compare.lua` |
| `cv_mix` | mod | `cv_mix_runtime.lua` | `cv_mix.ui.lua` | `cv_mix.lua` |
| `attenuverter_bias` | mod | `attenuverter_bias_runtime.lua` | `attenuverter_bias.ui.lua` | `attenuverter_bias.lua` |
| `range_mapper` | mod | `range_mapper_runtime.lua` | `range_mapper.ui.lua` | `range_mapper.lua` |

### C++ Runtime Structure
- `BehaviorCoreProcessor` — JUCE AudioProcessor that hosts the Lua engine, DSP script host, MIDI, audio I/O
- `BehaviorCoreEditor` — JUCE AudioProcessorEditor that hosts the Lua UI canvas
- `Settings` — singleton loaded from `.manifold.settings.json`, determines which project/UI/DSP to load
- `DSPPluginScriptHost` — runs Lua DSP scripts in `buildPlugin()` pattern
- C++ DSP primitives — `OscillatorNode`, `SVFNode`, `EQ8Node`, `FilterNode`, etc. — all in `dsp/core/nodes/`

---

## Architecture — How Per-Module Export Works

### The Core Insight

The Manifold binary IS the runtime. Every exported plugin is the same C++ code compiled with the same sources. The only per-module difference is **which Lua project the runtime boots into at launch**.

```
┌─────────────────────────────────────────────┐
│              Manifold C++ Runtime            │
│  ┌─────────────┐  ┌──────────────────────┐  │
│  │  JUCE Plugin │  │  DSP Primitives      │  │
│  │  Wrapper     │  │  (OscillatorNode,    │  │
│  │  (Processor  │  │   SVFNode, EQ8Node,  │  │
│  │  + Editor)   │  │   MixerNode, etc.)   │  │
│  └──────┬───────┘  └──────────┬───────────┘  │
│         │                     │              │
│  ┌──────┴─────────────────────┴───────────┐  │
│  │           Lua Engine (sol2)             │  │
│  │  ┌─────────────┐  ┌─────────────────┐  │  │
│  │  │  UI Script  │  │  DSP Script     │  │  │
│  │  │  (Canvas)   │  │  (buildPlugin)  │  │  │
│  │  └─────────────┘  └─────────────────┘  │  │
│  └────────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
         │                    │
    MIDI In/Audio In    Audio Out/MIDI Out
```

For per-module export, the Lua scripts loaded are:
- **UI:** A thin wrapper that loads the module's component at its canonical size
- **DSP:** A thin `buildPlugin()` that instantiates the module's `rack_modules/*.lua`, wires input → module → output

### Per-Module Project Structure

Each exported module gets its own directory under `UserScripts/projects/`:

```
UserScripts/projects/
├── Main/                          # Full instrument (existing)
├── RackModuleHost/                # Dev sandbox (existing, needs fix)
├── Standalone_Filter/             # Per-module project (new)
│   ├── manifold.project.json5
│   ├── dsp/main.lua               # Thin DSP wrapper
│   └── ui/main.ui.lua             # Thin UI wrapper
├── Standalone_Oscillator/
│   ├── manifold.project.json5
│   ├── dsp/main.lua
│   └── ui/main.ui.lua
├── Standalone_Sample/
│   ├── manifold.project.json5
│   ├── dsp/main.lua
│   └── ui/main.ui.lua
├── Standalone_EQ/
├── Standalone_FX/
├── Standalone_Blend/
├── Standalone_ADSR/
├── Standalone_LFO/
├── Standalone_Arp/
├── Standalone_Transpose/
├── Standalone_VelocityMapper/
├── Standalone_ScaleQuantizer/
├── Standalone_NoteFilter/
├── Standalone_Slew/
├── Standalone_SampleHold/
├── Standalone_Compare/
├── Standalone_CvMix/
├── Standalone_AttenuverterBias/
└── Standalone_RangeMapper/
```

Each project's `dsp/main.lua` is minimal — it:
1. Requires the module's `rack_modules/*.lua` (or runtime.lua for voice/mod modules)
2. Creates the module's DSP graph via `buildPlugin()`
3. Connects plugin audio input → module input → module output → plugin audio output
4. Forwards MIDI to voice-carrying modules
5. Exposes the module's parameters

Each project's `ui/main.ui.lua` is minimal — it:
1. Sets the window to the module's canonical size
2. Loads the module's existing UI component from Main
3. Loads the module's existing behavior from Main
4. Wraps in `rack_module_shell.lua` for consistent framing

### CMake Integration

Each module gets a `juce_add_plugin()` target:

```cmake
# --- Standalone Rack Module: Filter ---
juce_add_plugin(Manifold_Filter
    VERSION 1.0.0
    PLUGIN_MANUFACTURER_CODE Shmc
    PLUGIN_CODE Fltr
    FORMATS VST3 Standalone
    PRODUCT_NAME "Manifold Filter"
    IS_SYNTH FALSE
    NEEDS_MIDI_INPUT FALSE
    NEEDS_MIDI_OUTPUT FALSE
    IS_MIDI_EFFECT FALSE
    EDITOR_WANTS_KEYBOARD_FOCUS FALSE
    COPY_PLUGIN_AFTER_BUILD FALSE)

target_sources(Manifold_Filter PRIVATE ${MANIFOLD_DSP_SOURCES} ${MANIFOLD_RUNTIME_SOURCES} ${MANIFOLD_CORE_SOURCES})

target_compile_definitions(Manifold_Filter PUBLIC
    JUCE_WEB_BROWSER=0 JUCE_USE_CURL=0 JUCE_VST3_CAN_REPLACE_VST2=0
    JUCE_DISPLAY_SPLASH_SCREEN=0 ASIO_STANDALONE=1 SOL_ALL_SAFETIES_ON=1
    MANIFOLD_SOURCE_DIR="${CMAKE_CURRENT_SOURCE_DIR}"
    MANIFOLD_DEFAULT_PROJECT="${CMAKE_CURRENT_SOURCE_DIR}/UserScripts/projects/Standalone_Filter/manifold.project.json5"
    ${MANIFOLD_LINK_PLATFORM_DEFINE})

target_link_libraries(Manifold_Filter PRIVATE
    juce::juce_audio_utils juce::juce_audio_formats juce::juce_dsp
    juce::juce_gui_extra juce::juce_opengl
    imgui imgui_color_text_edit ${MANIFOLD_LUA_TARGET} sol2::sol2
    PUBLIC juce::juce_recommended_config_flags juce::juce_recommended_lto_flags juce::juce_recommended_warning_flags)
```

Module-specific CMake properties:

| Module | `IS_SYNTH` | `NEEDS_MIDI_INPUT` | `PLUGIN_CODE` | `PRODUCT_NAME` |
|--------|-----------|-------------------|---------------|----------------|
| Oscillator | TRUE | TRUE | RkOsc | Manifold Oscillator |
| Sample | TRUE | TRUE | RkSmp | Manifold Sample |
| Filter | FALSE | FALSE | RkFlt | Manifold Filter |
| FX | FALSE | FALSE | RkFx1 | Manifold FX |
| EQ | FALSE | FALSE | RkEq8 | Manifold EQ |
| Blend | FALSE | FALSE | RkBld | Manifold Blend |
| ADSR | FALSE | TRUE | RkAdsr | Manifold ADSR |
| LFO | FALSE | FALSE | RkLfo | Manifold LFO |
| Arp | FALSE | TRUE | RkArp | Manifold Arp |
| Transpose | FALSE | TRUE | RkTrn | Manifold Transpose |
| Velocity Mapper | FALSE | TRUE | RkVel | Manifold Velocity |
| Scale Quantizer | FALSE | TRUE | RkScQ | Manifold Scale Quant |
| Note Filter | FALSE | TRUE | RkNf | Manifold Note Filter |
| Slew | FALSE | FALSE | RkSlw | Manifold Slew |
| Sample & Hold | FALSE | FALSE | RkSh | Manifold S&H |
| Compare | FALSE | FALSE | RkCmp | Manifold Compare |
| CV Mix | FALSE | FALSE | RkCvm | Manifold CV Mix |
| Attenuverter/Bias | FALSE | FALSE | RkAtv | Manifold ATV/Bias |
| Range Mapper | FALSE | FALSE | RkRng | Manifold Range Mapper |

---

## Work Phases

### Phase 1 — Settings / Project Path Override

**Objective:** Allow a compile-time define to override which project the Manifold runtime boots.

**Current state:** `Settings::getInstance()` is a singleton that loads from `.manifold.settings.json` in the repo root. `defaultUiScript` determines which project loads. There is no per-build or per-target override.

**Required changes:**

#### 1A. Add compile-time project path define
- File: `manifold/primitives/core/Settings.h` / `Settings.cpp`
- Add `#ifdef MANIFOLD_DEFAULT_PROJECT` support
- When defined, `getDefaultUiScript()` returns the hardcoded path instead of reading from settings file
- This is the minimal change — the full settings singleton still works for everything else (OSC ports, etc.)

```cpp
// Settings.cpp
juce::String Settings::getDefaultUiScript() const {
#ifdef MANIFOLD_DEFAULT_PROJECT
    return JUCE_STRINGIFY(MANIFOLD_DEFAULT_PROJECT);
#else
    return defaultUiScript_;
#endif
}
```

#### 1B. Add compile-time DSP script override (optional)
- If the per-module project manifest already specifies its DSP via `dsp.default`, this may not be needed
- Investigate whether the project manifest's DSP path is sufficient or if we also need a compile-time `MANIFOLD_DEFAULT_DSP`

#### 1C. Verify per-target CMake define propagation
- Ensure `MANIFOLD_DEFAULT_PROJECT` is properly set per `juce_add_plugin()` target
- Test with one module target first (Filter is simplest — no MIDI, no voices)

**Files touched:** `Settings.h`, `Settings.cpp`, `CMakeLists.txt`  
**Validation:** Build `Manifold_Filter` target, verify it boots the Filter project manifest

---

### Phase 2 — Per-Module DSP Wrapper

**Objective:** Create minimal `buildPlugin()` wrappers for each module that instantiate the module's DSP graph, wire audio I/O, and expose parameters.

**Pattern for audio processor modules (filter, fx, eq, blend):**

Each module's `dsp/main.lua` follows this pattern:

```lua
local ModuleDSP = require("rack_modules/<module_name>")

function buildPlugin(ctx)
  local slots = {}
  local module = ModuleDSP.create({
    ctx = ctx,
    slots = slots,
    -- module-specific deps...
  })

  -- Create one slot
  module.createSlot(1)
  local slot = slots[1]

  -- Wire: plugin input → module input → module output → plugin output
  local input = ctx.primitives.PassthroughNode.new(2, 0)   -- stereo passthrough for audio input
  local output = slot.output or slot.node  -- module's output node

  ctx.graph.connect(ctx.input, input)
  ctx.graph.connect(input, slot.node)      -- or slot.inputA for blend
  ctx.graph.connect(output, ctx.output)

  -- Build param schema from module's parameter space
  local params = {}
  -- ... register module params ...

  return {
    description = "<Module Name> - Standalone Rack Module",
    params = params,
    onParamChange = function(path, value)
      module.applyPath(path, value)
    end,
    process = function(blockSize, sampleRate)
      -- per-block updates if needed
    end,
  }
end
```

**Pattern for source modules (oscillator, sample):**

Source modules are synths — they need voice allocation and MIDI input handling:

```lua
local OscillatorDSP = require("rack_modules/oscillator")

function buildPlugin(ctx)
  local slots = {}
  local module = OscillatorDSP.create({...})
  module.createSlot(1)
  local slot = slots[1]

  -- Source modules produce audio from their output node
  ctx.graph.connect(slot.output, ctx.output)

  -- Need MIDI → voice gate/freq routing
  -- This is the voice allocation piece that needs design

  return { ... }
end
```

**Pattern for voice/mod modules (ADSR, LFO, arp, etc.):**

These don't produce audio directly — they transform voice/control signals. For standalone export they need:
- MIDI input → voice bundle creation
- The module's runtime processing
- Some way to produce output (either as audio via a simple oscillator, or as a MIDI output)

This needs careful design — a standalone LFO doesn't make sound by itself. Options:
1. **Audio output mode** — LFO modulates a simple oscillator, you hear the result
2. **MIDI/mod output mode** — LFO outputs as MIDI CC or VST parameter automation
3. **Developer tool mode** — LFO just shows its waveform UI, no audio output needed for testing

**Decision needed:** How to handle non-audio modules in standalone VST3 context.

**Per-module DSP work items:**

| Module | DSP Pattern | Complexity | Notes |
|--------|------------|------------|-------|
| filter | passthrough → SVFNode → output | Low | Simplest. Stereo audio in/out. |
| eq | passthrough → EQ8Node → output | Low | Similar to filter. |
| fx | passthrough → FxSlot → output | Medium | FxSlot has internal sub-graph. |
| blend | passthrough A + passthrough B → blend → output | Medium | Dual audio input. |
| oscillator | MIDI → OscillatorNodes → output | High | Voice allocation, polyphony. |
| sample | MIDI + audio capture → SamplePlayback → output | High | Capture, phase vocoder, polyphony. |
| adsr | MIDI → voice → ADSR → ? | Design needed | No audio output. |
| lfo | LFO → ? | Design needed | No audio output. |
| arp | MIDI → voice → arp → MIDI out | Design needed | Voice transform. |

**Files created:** `UserScripts/projects/Standalone_*/dsp/main.lua` (one per module)  
**Validation:** Each module's DSP wrapper loads without error, processes audio/MIDI correctly

---

### Phase 3 — Per-Module UI Wrapper

**Objective:** Create minimal UI wrappers that load each module's existing component at its canonical aspect ratio.

**Pattern:**

```lua
-- UserScripts/projects/Standalone_Filter/ui/main.ui.lua
local function dirname(path)
  return (tostring(path or ""):gsub("/+$", ""):match("^(.*)/[^/]+$") or ".")
end

local function join(...)
  -- ... standard join helper ...
end

local function appendPackageRoot(root)
  -- ... standard package.path append ...
end

local projectRoot = tostring(__manifoldProjectRoot or dirname(__manifoldProjectManifest or ""))
local mainRoot = join(projectRoot, "../Main")
appendPackageRoot(join(mainRoot, "ui"))
appendPackageRoot(join(mainRoot, "lib"))

return {
  id = "standalone_filter",
  type = "Panel",
  x = 0, y = 0,
  w = 472, h = 220,          -- canonical size from rack_midisynth_specs
  style = { bg = 0xff0f1726 },
  behavior = "ui/behaviors/main.lua",
  children = {
    {
      id = "module_host",
      type = "Panel",
      x = 0, y = 0, w = 472, h = 220,
      components = {
        {
          id = "filter_component",
          x = 0, y = 0, w = 472, h = 220,
          behavior = "../Main/ui/behaviors/filter.lua",
          ref = "../Main/ui/components/filter.ui.lua",
          props = {
            instanceNodeId = "standalone_filter_1",
            paramBase = "/midi/synth/rack/filter/1",
            specId = "filter",
          },
        },
      },
    },
  },
}
```

**Canonical module sizes (from specs and component files):**

| Module | Canonical Size | Notes |
|--------|---------------|-------|
| rack_oscillator | 560 × 200 | From `rack_oscillator.ui.lua` |
| rack_sample | 560 × 200 | From `rack_sample.ui.lua` |
| filter | 472 × 220 | 1x2 slot in rack_container |
| fx | 472 × 220 | 1x2 slot in rack_container |
| eq | 236 × 220 | 1x1 slot in rack_container |
| blend_simple | 280 × 200 | From `rack_blend_simple.ui.lua` |
| adsr | 236 × 220 | 1x1 slot |
| lfo | 236 × 220 | 1x1 slot |
| arp | 236 × 220 | 1x1 slot |
| Other voice/mod | 236 × 220 | 1x1 slot default |

**Per-module UI work items:**

Each module gets a `ui/main.ui.lua` + `ui/behaviors/main.lua`. The behavior handles:
- Parameter sync between UI widgets and DSP params
- MIDI input display (for modules that take MIDI)
- Module-specific state management

**Files created:** `UserScripts/projects/Standalone_*/ui/main.ui.lua` + `ui/behaviors/main.lua`  
**Validation:** Each module's UI loads at canonical size, widgets are functional, parameters update

---

### Phase 4 — Fix RackModuleHost Dev Sandbox

**Objective:** Fix the existing RackModuleHost project to work as a proper dev sandbox for testing any module before export.

**Current state:** Broken in all the ways listed above.

#### 4A. Fix aspect ratios
- Remove the shared 876×594 container
- Each module host panel sizes to the module's canonical dimensions
- Center the module in the viewport
- Scale if viewport is too small, but maintain aspect ratio

#### 4B. Add MIDI input
- Add `Midi.pollInputEvent()` to the behavior's `update()` function
- Route note-on/note-off to the appropriate module's voice gate/freq params
- For source modules (oscillator, sample): full polyphonic voice allocation
- For processor modules (filter, fx, eq, blend): pass-through (audio input, no MIDI needed)
- For voice/mod modules: route MIDI to the module's voice bundle input

#### 4C. Add external audio input
- For audio-input modules (filter, fx, eq, blend): accept DAW audio input
- Wire `ctx.input` → module input in the DSP
- Add an audio source selector in the sidebar (External / Internal Generator)

#### 4D. Fix input generation
- Utility oscillators in slots 31/32 need to actually be instantiated and connected
- OR: replace with a simpler approach using the plugin's audio input passthrough
- The current approach tries to use the full midisynth's dynamic oscillator system — that's wrong for a standalone host

#### 4E. Add ALL modules
- Currently 6 modules. Add all 20:
  - Audio: rack_oscillator, rack_sample, filter, fx, eq, blend_simple
  - Voice: adsr, arp, transpose, velocity_mapper, scale_quantizer, note_filter
  - Mod: lfo, slew, sample_hold, compare, cv_mix, attenuverter_bias, range_mapper

#### 4F. Fix DSP to use individual module instantiation
- Stop loading `midisynth_integration.lua` (the full synth)
- Instead, instantiate individual `rack_modules/*.lua` directly
- Each module's DSP graph is created in isolation
- Audio routing: input → selected module → output

**Files modified:** All 4 files in `UserScripts/projects/RackModuleHost/`  
**Validation:** Switch between all modules in the host, each renders at canonical size, MIDI works for source modules, audio passthrough works for processor modules

---

### Phase 5 — CMake Build Targets

**Objective:** Add `juce_add_plugin()` targets for each module that produce individual VST3 binaries.

#### 5A. Create CMake macro for rack module plugin targets
- DRY up the per-module target definitions
- A function/macro that takes module name, plugin code, product name, IS_SYNTH, NEEDS_MIDI_INPUT
- Generates the `juce_add_plugin()` call with all the right settings

```cmake
function(add_rack_module_plugin MODULE_NAME PLUGIN_CODE PRODUCT_NAME IS_SYNTH NEEDS_MIDI)
    string(TOUPPER "${MODULE_NAME}" MODULE_UPPER)
    juce_add_plugin(Manifold_${MODULE_NAME}
        VERSION 1.0.0
        PLUGIN_MANUFACTURER_CODE Shmc
        PLUGIN_CODE ${PLUGIN_CODE}
        FORMATS VST3 Standalone
        PRODUCT_NAME "${PRODUCT_NAME}"
        IS_SYNTH ${IS_SYNTH}
        NEEDS_MIDI_INPUT ${NEEDS_MIDI}
        NEEDS_MIDI_OUTPUT FALSE
        IS_MIDI_EFFECT FALSE
        EDITOR_WANTS_KEYBOARD_FOCUS FALSE
        COPY_PLUGIN_AFTER_BUILD FALSE)
    target_sources(Manifold_${MODULE_NAME} PRIVATE
        ${MANIFOLD_DSP_SOURCES} ${MANIFOLD_RUNTIME_SOURCES} ${MANIFOLD_CORE_SOURCES})
    target_include_directories(Manifold_${MODULE_NAME} PRIVATE
        ${CMAKE_CURRENT_SOURCE_DIR}
        ${ableton_link_SOURCE_DIR}/include
        ${ableton_link_SOURCE_DIR}/modules/asio-standalone/asio/include)
    target_compile_definitions(Manifold_${MODULE_NAME} PUBLIC
        JUCE_WEB_BROWSER=0 JUCE_USE_CURL=0 JUCE_VST3_CAN_REPLACE_VST2=0
        JUCE_DISPLAY_SPLASH_SCREEN=0 ASIO_STANDALONE=1 SOL_ALL_SAFETIES_ON=1
        SOL_SAFE_NUMERICS=0
        MANIFOLD_SOURCE_DIR="${CMAKE_CURRENT_SOURCE_DIR}"
        MANIFOLD_DEFAULT_PROJECT="${CMAKE_CURRENT_SOURCE_DIR}/UserScripts/projects/Standalone_${MODULE_NAME}/manifold.project.json5"
        ${MANIFOLD_LINK_PLATFORM_DEFINE})
    target_link_libraries(Manifold_${MODULE_NAME} PRIVATE
        juce::juce_audio_utils juce::juce_audio_formats juce::juce_dsp
        juce::juce_gui_extra juce::juce_opengl
        imgui imgui_color_text_edit ${MANIFOLD_LUA_TARGET} sol2::sol2
        PUBLIC
        juce::juce_recommended_config_flags
        juce::juce_recommended_lto_flags
        juce::juce_recommended_warning_flags)
    # Copy Lua files to build output
    add_custom_command(TARGET Manifold_${MODULE_NAME} POST_BUILD
        COMMAND ${CMAKE_COMMAND} -E copy_directory
            ${CMAKE_CURRENT_SOURCE_DIR}/manifold/ui
            $<TARGET_FILE_DIR:Manifold_${MODULE_NAME}>
        COMMAND ${CMAKE_COMMAND} -E copy_directory
            ${CMAKE_CURRENT_SOURCE_DIR}/manifold/SystemScripts
            $<TARGET_FILE_DIR:Manifold_${MODULE_NAME}>/SystemScripts
        COMMAND ${CMAKE_COMMAND} -E copy_directory
            ${CMAKE_CURRENT_SOURCE_DIR}/UserScripts
            $<TARGET_FILE_DIR:Manifold_${MODULE_NAME}>/UserScripts
        COMMENT "Copying Lua scripts for Manifold ${MODULE_NAME}")
endfunction()
```

#### 5B. Register all module targets
- Call the macro for each module with appropriate flags
- Group by category in CMakeLists.txt

#### 5C. Add a meta-target to build all rack module plugins
- `cmake --build build --target Manifold_RackModules` builds all module VST3s

#### 5D. Add dev build integration
- Each target uses `build-dev` (RelWithDebInfo, no LTO) for fast iteration
- Release builds use full LTO optimization

**Files modified:** `CMakeLists.txt`  
**Validation:** `cmake --build build-dev --target Manifold_Filter` produces a working VST3 binary

---

### Phase 6 — Parameter Exposure

**Objective:** Expose module parameters as VST automatable parameters so they appear in DAW automation lanes.

#### 6A. Understand current parameter registration
- `DSPPluginScriptHost` registers params via `ctx.params.register()` in Lua `buildPlugin()`
- These become VST parameters via JUCE's AudioProcessor parameter system
- Need to verify that per-module params register correctly

#### 6B. Per-module parameter schemas
- Each module's `buildPlugin()` must register all its parameters with the DSP host
- Use the parameter paths already defined in `rack_midisynth_specs.lua` for each module
- Parameter metadata (name, range, default, format) comes from the spec

#### 6C. VST parameter name formatting
- Convert internal param paths (`/midi/synth/rack/filter/1/cutoff`) to human-readable names (`Filter Cutoff`)
- Ensure parameter groups make sense in the DAW's parameter list

**Files touched:** Per-module `dsp/main.lua` wrappers  
**Validation:** Open exported VST3 in Ableton, verify all module parameters appear and are automatable

---

## Chunk 1 — Fix RackModuleHost Dev Sandbox

This is the first chunk of work. The dev sandbox must work before we build any per-module VST3 targets.

### The Sizing Problem (The Core Issue)

Every module host panel is currently hard-stretched to 876×594 regardless of the module's actual size. This is fundamentally wrong. Modules have canonical aspect ratios derived from their size key:

| Size Key | Pixel Dimensions | Aspect Ratio |
|----------|-----------------|--------------|
| 1x1 | 236 × 220 | 1.073:1 |
| 1x2 | 472 × 220 | 2.145:1 |
| 2x1 | 236 × 440 | 0.536:1 |
| 2x2 | 472 × 440 | 1.073:1 |
| Future 1x3 | 708 × 220 | 3.218:1 |
| Future 1x4 | 944 × 220 | 4.291:1 |

The viewport must:
1. **Size the module to fill the viewport width** (or height, whichever constrains first) while **maintaining the module's aspect ratio**
2. **Center the module** in the viewport both horizontally and vertically
3. **Render empty space below/around the module** as an adaptive container panel (reserved for future use — code editor, preset browser, etc.)
4. **Support all valid size keys** — currently 1x1 and 1x2, but the system must handle 1x3, 1x4, 2x1, 2x2 without code changes

### The Layout Architecture

```
┌──────────────────────────────────────────────────┐
│                    Viewport (948×720)              │
│  ┌────────────────────────────────────────────┐  │
│  │           Module Display Area               │  │
│  │  ┌──────────────────────────────────────┐  │  │
│  │  │  rack_module_shell (correct AR)      │  │  │
│  │  │  ┌────────────────────────────────┐  │  │  │
│  │  │  │  [header bar with accent]      │  │  │  │
│  │  │  ├────────────────────────────────┤  │  │  │
│  │  │  │                                │  │  │  │
│  │  │  │  Module Component Content      │  │  │  │
│  │  │  │  (existing behavior + UI)      │  │  │  │
│  │  │  │                                │  │  │  │
│  │  │  └────────────────────────────────┘  │  │  │
│  │  └──────────────────────────────────────┘  │  │
│  ├────────────────────────────────────────────┤  │
│  │  Adaptive Container (reserved, empty)       │  │
│  │  Future: code editor, preset browser, etc.  │  │
│  └────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────┘
```

The module display area:
- Takes up the width of the viewport minus padding
- Heights to the module's aspect ratio × the allocated width
- If the resulting height would exceed the viewport, it constrains by height instead and the module is narrower

The adaptive container:
- Fills all remaining vertical space below the module
- Empty panel for now, with a subtle visual boundary (dashed border or slight bg difference)
- Reserved for future expansion (code editor, oscilloscope, preset browser, etc.)

### Step-by-Step Work Items

#### 1A. Replace hard-stretched host panels with aspect-ratio-correct layout

**Current:** Six `*_host` panels, all 876×594, all components stretched to fill.
**Target:** A single `module_host` panel that dynamically sizes to the selected module's aspect ratio.

Changes to `ui/main.ui.lua`:
- Replace the six `*_host` panels with ONE `module_host` container inside the viewport
- The `module_host` panel has NO fixed w/h — it's computed from the module's size key and the viewport dimensions
- Inside `module_host`, a single component slot that swaps behavior/ref based on module selection
- Below `module_host`, add `adaptive_container` panel that fills remaining space
- The sizing logic lives in the behavior's `update()` — it reads the current module's size key, calculates the correct dimensions, and applies them via `widget.setW()` / `widget.setH()`

#### 1B. Build the module size registry

Create a mapping from module ID → size dimensions that the behavior can query:

```lua
local MODULE_SIZES = {
  -- sizeKey → { w, h }
  ["1x1"] = { w = 236, h = 220 },
  ["1x2"] = { w = 472, h = 220 },
  ["2x1"] = { w = 236, h = 440 },
  ["2x2"] = { w = 472, h = 440 },
}
```

Each module entry includes its valid sizes and a current size key (defaulting to `defaultSize` from spec):

```lua
local MODULES = {
  { id = "filter", label = "Filter", sizeKey = "1x2",
    behavior = "../Main/ui/behaviors/filter.lua",
    component = "../Main/ui/components/filter.ui.lua",
    accent = 0xff3b82f6, ... },
  ...
}
```

#### 1C. Add size toggle to sidebar

When a module supports multiple sizes (e.g., filter supports 1x1, 1x2, 2x1), show a size toggle control in the sidebar. The toggle cycles through `validSizes` for the current module. Modules with only one valid size don't show the toggle.

#### 1D. Add all 20 modules to the MODULES registry

Currently 6 modules. Add:
- **Voice:** adsr, arp, transpose, velocity_mapper, scale_quantizer, note_filter
- **Mod:** lfo, slew, sample_hold, compare, cv_mix, attenuverter_bias, range_mapper

Each entry maps to its existing behavior/component in Main with the correct size key.

#### 1E. Fix DSP — use individual module instantiation

**Current:** `dsp/main.lua` loads `midisynth_integration.lua` (the full synth DSP).
**Target:** Instantiates only the selected module's DSP directly.

Changes to `dsp/main.lua`:
- `require("rack_modules.<module>")` for the selected audio module
- Create one slot, wire `ctx.input` → module → `ctx.output`
- For source modules (oscillator, sample): no audio input needed, they produce their own audio
- For processor modules (filter, fx, eq, blend): audio input passthrough
- For voice/mod modules: MIDI input handling, no direct audio processing (they output control signals)

#### 1F. Add MIDI input polling

In the behavior's `update()` loop, add `Midi.pollInputEvent()` to capture incoming MIDI.
- For source modules: route note-on/note-off to voice gate/freq params
- For voice modules: route to the module's voice bundle input
- For processor/mod modules: no MIDI needed (they process audio or control signals)

#### 1G. Add external audio input option

Add an audio source selector to the sidebar:
- **Internal Generator** — the existing utility oscillator (sine/saw/square/pulse/noise)
- **External Input** — passthrough from DAW/audio card input
- When "External Input" is selected, wire `ctx.input` directly to the module's audio input

### Files Modified

| File | What Changes |
|------|-------------|
| `RackModuleHost/ui/main.ui.lua` | Replace six host panels with single dynamic `module_host` + `adaptive_container` |
| `RackModuleHost/ui/behaviors/main.lua` | Add size registry, aspect ratio calc, all 20 modules, size toggle, MIDI polling |
| `RackModuleHost/dsp/main.lua` | Replace `midisynth_integration.lua` with individual module DSP instantiation |

### Validation

1. Switch between filter (1x2) and EQ (1x1) — verify different aspect ratios render correctly
2. Toggle a module from 1x1 to 1x2 — verify it resizes maintaining aspect ratio
3. Select oscillator — play MIDI notes, verify sound output
4. Select filter — feed internal sine generator, verify filter processes audio
5. Verify adaptive container fills remaining space below each module
6. All 20 modules appear in the sidebar and load without errors

---

## Dependency Graph

```
Chunk 1 (Fix RackModuleHost)
    │
    ▼
Phase 1 (Settings Override)
    │
    ├──→ Phase 2 (Per-Module DSP Wrappers)
    │       │
    │       └──→ Phase 5 (CMake Targets) ──→ Phase 6 (Parameter Exposure)
    │
    └──→ Phase 3 (Per-Module UI Wrappers)
            │
            └──→ Phase 5 (CMake Targets) ──→ Phase 6 (Parameter Exposure)
```

**Recommended order:**

1. **Chunk 1** — Fix RackModuleHost (dev sandbox, proves modules work standalone)
2. **Phase 1** — Settings override (enables per-module C++ builds)
3. **Phase 2** — Filter DSP wrapper (simplest audio module, proves the pattern)
4. **Phase 3** — Filter UI wrapper (proves UI loads at canonical size)
5. **Phase 5** — Filter CMake target (first actual VST3 binary)
6. **Phase 6** — Filter parameter exposure (first DAW-usable plugin)
7. **Phases 2-3-5-6** for remaining modules (oscillator, sample, eq, fx, blend)
8. **Design decision** for voice/mod modules (Phase 2 design items)
9. **Phases 2-3-5-6** for voice/mod modules

---

## Open Design Decisions

### D1. Voice/Mod Module Standalone Behavior
Voice modules (ADSR, arp, transpose, etc.) and mod modules (LFO, slew, etc.) don't produce audio on their own. How should they behave as standalone VST3s?

**Options:**
- **A:** Don't export them as standalone — they only make sense inside a modular rack
- **B:** Wrap them with a passthrough oscillator — LFO modulates a sine wave, ADSR shapes a sine wave
- **C:** Export them as MIDI effects — they output MIDI/parameter data, not audio
- **D:** Export them as parameter-only plugins — they expose their outputs as VST parameters (LFO rate output, ADSR envelope output) that other plugins can map to

**Recommendation:** Defer decision. Start with audio-producing modules (filter, fx, eq, blend, oscillator, sample). Decide on voice/mod modules once the audio pipeline is proven.

### D2. DSP Host Input/Output Wiring
The current `DSPPluginScriptHost` provides `ctx.input` and `ctx.output` nodes. Need to verify:
- Does `ctx.input` actually carry DAW audio input?
- Does `ctx.output` actually route to the plugin's audio output?
- How does stereo vs mono work?
- Can we have multiple audio inputs (for blend's A/B inputs)?

### D3. MIDI-to-Voice Allocation in Standalone
Source modules (oscillator, sample) need voice allocation. The Main project does this in the UI behavior (`midisynth.lua`'s `triggerVoice()`/`releaseVoice()`). For standalone export, this needs to happen in the DSP script or a shared Lua module. Where does it live?

### D4. Shared Lua Script Bundling
Exported VST3s need access to the Main project's Lua scripts. Options:
- **A:** Copy the entire `UserScripts/` tree into each plugin's build output (current plan)
- **B:** Create a minimal script bundle per module with only the files it needs
- **C:** Embed Lua scripts as string constants in the C++ binary (true standalone)

**Recommendation:** Start with (A) for simplicity. Optimize to (B) or (C) later for smaller binaries.

---

## Success Criteria

The project is successful when:

1. **`cmake --build build-dev --target Manifold_Filter`** produces a `Manifold_Filter.vst3` that can be loaded in Ableton and processes audio through an SVF filter with cutoff/resonance/type controls automatable from the DAW.

2. **`cmake --build build-dev --target Manifold_Oscillator`** produces a `Manifold_Oscillator.vst3` that responds to MIDI notes with polyphonic voice allocation, renders waveforms, and exposes all oscillator parameters as VST automatable controls.

3. **The RackModuleHost project** loads any module at its canonical aspect ratio, accepts MIDI input for source modules, accepts audio input for processor modules, and provides a functional dev/test environment.

4. **Adding a new module export** requires only:
   - A `Standalone_<Module>/` directory with 3 files (manifest, DSP wrapper, UI wrapper)
   - One `add_rack_module_plugin()` call in CMakeLists.txt
   - No C++ changes

5. **Module Lua code is shared** — the same `rack_modules/filter.lua` that runs in Main also runs in the standalone filter VST3. No duplication.

---

## Risk Register

| Risk | Impact | Mitigation |
|------|--------|-----------|
| `ctx.input`/`ctx.output` don't route DAW audio correctly | High — audio modules won't work | Verify in Phase 2 with Filter early |
| Voice allocation too coupled to `midisynth.lua` UI behavior | High — source modules won't work standalone | Extract voice allocation into a shared Lua module |
| Settings singleton override breaks existing Manifold build | Medium — main plugin stops working | `#ifdef MANIFOLD_DEFAULT_PROJECT` is additive — only triggers when defined |
| VST3 binary size too large (full Manifold runtime) | Low — 50-100MB per module is fine for now | Optimize script bundling later (D4) |
| Voice/mod modules can't be meaningfully standalone | Low — defer to later | Start with audio modules only |
| `DSPPluginScriptHost` doesn't support IS_SYNTH/NEEDS_MIDI_INPUT properly | High — MIDI input won't reach DSP | Verify JUCE MIDI routing in processBlock, ensure `midiInputRing` feeds Lua |

---

## File Impact Summary

### New files
- `UserScripts/projects/Standalone_*/manifold.project.json5` — one per module (20 files)
- `UserScripts/projects/Standalone_*/dsp/main.lua` — one per module (20 files)
- `UserScripts/projects/Standalone_*/ui/main.ui.lua` — one per module (20 files)
- `UserScripts/projects/Standalone_*/ui/behaviors/main.lua` — one per module (20 files)

### Modified files
- `manifold/primitives/core/Settings.h` — compile-time project path override
- `manifold/primitives/core/Settings.cpp` — compile-time project path override
- `CMakeLists.txt` — per-module build targets
- `UserScripts/projects/RackModuleHost/ui/main.ui.lua` — fix aspect ratios, add all modules
- `UserScripts/projects/RackModuleHost/ui/behaviors/main.lua` — add MIDI, fix controls, add all modules
- `UserScripts/projects/RackModuleHost/dsp/main.lua` — use individual module DSP instead of full midisynth

### Existing files referenced (not modified)
- `UserScripts/projects/Main/lib/rack_modules/*.lua` — module DSP (shared)
- `UserScripts/projects/Main/lib/*_runtime.lua` — voice/mod module runtimes (shared)
- `UserScripts/projects/Main/ui/behaviors/*.lua` — module UI behaviors (shared)
- `UserScripts/projects/Main/ui/components/*.ui.lua` — module UI components (shared)
- `UserScripts/projects/Main/ui/behaviors/rack_midisynth_specs.lua` — module specs (read-only reference)
- `manifold/core/BehaviorCoreProcessor.cpp` — JUCE plugin wrapper (unchanged)
- `manifold/core/BehaviorCoreEditor.cpp` — JUCE editor wrapper (unchanged)
