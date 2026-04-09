# Audio Plugin Format Comparison & Validation Strategies

**Date:** 2026-04-10  
**Context:** Manifold plugin export infrastructure (Filter, EQ8, FX exports)  
**Purpose:** Guide format prioritization and validation approach

---

## Plugin Format Landscape (2026)

### Current State

| Format | Status | Pros | Cons | Priority for Manifold |
|--------|--------|------|------|----------------------|
| **VST3** | Industry standard | Universal DAW support, Steinberg SDK mature | Complex lifecycle, heavy ceremony | **Primary** — must have |
| **CLAP** | Modern challenger | Open standard, clean C API, fast preset handling, no licensing | Newer, limited DAW support (Bitwig, Reaper, FL Studio) | **Secondary** — nice to have |
| **AU** | macOS native | Best macOS integration, GarageBand/Logic support | macOS only, deprecated by Apple (AUv3 is future) | **Platform-specific** — macOS builds only |
| **AUv3** | Apple future | iPad support, sandboxed, modern architecture | Complex packaging, limited desktop DAW support | **Future** — mobile strategy |
| **AAX** | Pro Tools | Pro Tools support | Requires Avid partnership, encryption requirements | **TBD** — commercial decision |
| **LV2** | Linux/open | Open source, Linux native | Limited commercial DAW support | **Linux** — if targeting |

### Recommendation for Manifold

**Phase 1 (Current):** VST3 only — maximum compatibility  
**Phase 2:** Add AU (macOS builds) — complete desktop coverage  
**Phase 3:** Evaluate CLAP — modern features, growing adoption  
**Phase 4:** Consider AUv3 — if iPad export becomes desirable

---

## VST3 Specific Considerations

### Lifecycle Complexity

VST3 uses a factory pattern with reference counting that differs from JUCE's wrapper expectations:

```cpp
// VST3 component lifecycle
IPluginFactory* factory = GetPluginFactory();  // DLL entry point
factory->createInstance(componentCID, IComponent::iid, (void**)&component);
// ... initialization sequence ...
// Reference counting determines destruction
```

**Critical for Manifold:** The `export_plugin_shell.lua` approach of embedding Lua runtime in each plugin instance must handle:
- Multiple plugin instances in same host (shared vs isolated Lua state)
- DLL unload/reload scenarios (development iteration)
- Reference counting compatibility with JUCE VST3 wrapper

### Parameter Handling

VST3 parameters are normalized `0..1` internally. Your manifest generator handles this correctly, but the translation layer needs care:

```cpp
// VST3 normalized -> Internal value
float normalized = 0.5f;  // From host automation
float actual = min + normalized * (max - min);
if (skew != 1.0f) {
    actual = min + (max - min) * std::pow(normalized, skew);
}
```

Current `generate_export_manifest.py` includes skew — verify the C++ side implements the same curve.

### Preset/State Handling

VST3 presets are chunks of binary data via `setState()`/`getState()`. The manifest approach (public/internal path mapping) needs serialization:

```cpp
// Your exported state needs to capture:
// 1. All public params -> write to stream
// 2. Internal module state (effect type, per-effect params)
```

The FX export with 21 effect types and per-effect parameter recall is the stress test here.

---

## CLAP: Why It Matters

CLAP (CLever Audio Plugin) is gaining traction because it solves real VST3 pain points:

### 1. **Fast Preset Loading**
VST3: Full plugin instantiation required  
CLAP: `clap_plugin_preset_loader` allows preset changes without plugin reset

**Relevance to Manifold:** Your FX export with effect type switching could use CLAP's preset mechanism for instant type changes.

### 2. **Threading Model**
VST3: Single audio thread + message thread, complex threading rules  
CLAP: Explicit `clap_process` with thread-safe params, no hidden rules

**Relevance to Manifold:** Simpler DSP scaffold integration with Lua runtime.

### 3. **Parameter Gestures**
CLAP's `clap_input_events` includes gesture begin/end, making automation recording more accurate.

### 4. **No Licensing**
VST3 requires Steinberg license agreement. CLAP is BSD-3.

---

## Validation Strategy

### Automated Testing Approaches

#### 1. **Validation Suites**

| Tool | Purpose | Integration |
|------|---------|-------------|
| **validator** (Steinberg) | Official VST3 compliance | CI pipeline — must pass |
| **clap-validator** | CLAP compliance testing | CI for CLAP builds |
| **PluginVal** (Tracktion) | JUCE-based stress testing | Local dev + CI |
| **AU Lab** (Apple) | AU validation | macOS manual testing |

#### 2. **Fuzz Testing**

Critical for Manifold's Lua-based DSP:

```cpp
// Property-based testing approach
// 1. Generate random valid parameter combinations
// 2. Verify no crashes, no NaN/inf outputs
// 3. Verify state save/restore round-trips correctly
```

#### 3. **Performance Profiling**

From your memory profiling work — extend to:
- RT stability test (continuous 48+ hour run)
- Load/unload cycles (1000x plugin open/close)
- Host switch test (load in DAW A, save, open in DAW B)

### Validation Dashboard Concept

A prototype web interface for plugin validation:

```
┌─────────────────────────────────────────────────────────────┐
│  Manifold Plugin Validator                                  │
├─────────────────────────────────────────────────────────────┤
│  Plugin: [Manifold_FX_VST3 ▼]  [Run Full Suite]            │
├─────────────────────────────────────────────────────────────┤
│  Results:                                                   │
│  ✅ VST3 Validator    - 142/142 tests passed               │
│  ✅ PluginVal Stress  - 1000 iterations, no crash          │
│  ⚠️  Memory Profile   - 73MB PSS (expected: <70MB)         │
│  ✅ State Round-trip  - 1000 random params, exact match    │
│  ✅ NaN/Inf Check     - No invalid samples detected        │
│  ⏳  48hr Stability   - Running: 18:42:13 elapsed          │
├─────────────────────────────────────────────────────────────┤
│  Details: [View Report]  [Export CSV]  [Compare Baseline]  │
└─────────────────────────────────────────────────────────────┘
```

---

## Specific Risks for Manifold Export

### 1. **Lua Runtime Isolation**

Each exported plugin embeds Lua. Risks:
- **Multiple instances:** If host loads 10 Manifold Filter instances, do they share Lua state? (Shouldn't — causes cross-talk)
- **Static initialization:** `luaL_newstate()` in `DllMain`/`constructor` can deadlock some hosts

**Mitigation:** Ensure `export_plugin_scaffold.lua` creates isolated `ctx` per instance.

### 2. **OSCQuery Port Conflicts**

Your exports use fixed ports:
- Filter: 9010/9011
- EQ: 9020/9021
- FX: 9030/9031

**Risk:** Loading two FX instances in same host = port conflict.

**Mitigation:** Dynamic port allocation or instance indexing:
```lua
-- Option 1: Instance-based offset
local instanceIndex = getInstanceIndex() -- 1, 2, 3...
local oscPort = 9030 + (instanceIndex - 1) * 10

-- Option 2: Random free port
local oscPort = findFreePort(9030, 9100)
```

### 3. **Preset Compatibility Across Versions**

When you update the synth engine, exported plugin state format may change.

**Strategy:** Versioned state format with migration:
```cpp
// State header
struct StateHeader {
    uint32_t magic = 'MNFD';
    uint32_t version = 2;  // Increment on breaking changes
    uint32_t paramCount;
};

// Load with migration
if (header.version == 1) {
    migrateV1ToV2(stateData);
}
```

### 4. **Thread Safety in Parameter Updates**

Your `onParamChange` callback in `export_plugin_scaffold.lua` runs from host's message thread, but DSP runs on audio thread.

**Current approach:** Via `module.applyPath()` — verify this uses lock-free queues or atomic updates.

---

## Recommended Next Steps

### Immediate (this week)

1. **Add PluginVal to CI**
   ```bash
   # Install
   wget https://github.com/Tracktion/pluginval/releases/download/v1.0.3/pluginval-1.0.3-linux.zip
   # Run
   ./pluginval --verbose --strictness 10 --validate Manifold_Filter.vst3
   ```

2. **OSC Port Dynamic Allocation**
   - Modify `manifold.project.json5` template to support `{{INSTANCE_INDEX}}` substitution
   - Or detect collision at runtime and auto-rebind

3. **State Versioning**
   - Add version field to exported state serialization
   - Document breaking change policy

### Short-term (next month)

1. **AU Export for macOS**
   - Extend CMake targets for AU wrapper
   - AU requires different packaging (component bundle structure)

2. **CLAP Evaluation**
   - Prototype CLAP export for one module
   - Compare binary size, load time, preset switching performance

3. **Fuzz Testing**
   - Property-based random parameter generator
   - Automated crash detection

### Long-term

1. **Validation Dashboard** (prototype in repo)
2. **Cross-host preset compatibility testing**
3. **iOS/AUv3 evaluation** for iPad export

---

## References

- VST3 SDK: https://github.com/steinbergmedia/vst3sdk
- CLAP Spec: https://github.com/free-audio/clap
- PluginVal: https://github.com/Tracktion/pluginval
- JUCE Plugin Basics: https://docs.juce.com/master/tutorial_plugin_basics.html
- AUv3 Transition Guide: https://developer.apple.com/documentation/audiotoolbox/audio_unit_v3_plug-ins

---

*Generated for Manifold Tulpa project. Focus areas: VST3 stability, Lua runtime isolation, OSC port conflicts.*
