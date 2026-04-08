# VST Export System Architecture Analysis

**Date:** 2026-04-08  
**Based on:** User's implementation of `ExportPluginConfig` and `ExportParamAlias` in `BehaviorCoreProcessor`

---

## What the User Built

### Core Data Structures

```cpp
struct ExportParamAlias {
    juce::String path;           // Public/host-facing path
    juce::String internalPath;   // Internal Manifold state path
    juce::String type{"f"};      // "f" | "i" | "c" (choice)
    float rangeMin = 0.0f;
    float rangeMax = 1.0f;
    float defaultValue = 0.0f;
    float skew = 1.0f;           // For log/exponential scaling
    juce::String hostParamId;    // VST parameter ID
    juce::String hostParamName;  // Display name
    juce::String hostParamKind{"float"}; // "float" | "choice" | "bool"
    juce::StringArray choices;   // For choice parameters
    std::atomic<float>* rawHostValue = nullptr; // Direct atomic access
};

struct ExportPluginConfig {
    bool enabled = false;
    juce::String headerTitle{"Plugin"};
    int compactWidth = 236;      // Compact view dimensions
    int compactHeight = 220;
    int splitWidth = 472;        // Split view dimensions
    int splitHeight = 220;
    int defaultViewMode = 1;     // 0=compact, 1=split
    bool oscDefaultEnabled = false;
    bool oscQueryDefaultEnabled = false;
    int oscBasePort = 9010;
    std::vector<ExportParamAlias> paramAliases;
};
```

### Key Implementation Patterns

1. **Dual-Path State System**: Parameters have both public (VST-facing) and internal (Manifold) paths
2. **Atomic Value Pointers**: `rawHostValue` points to JUCE's atomic parameter storage for lock-free audio thread access
3. **Bidirectional Sync**: 
   - `syncPublicPathToHostParameter()` - Manifold → Host
   - `parameterChanged()` callback - Host → Manifold
4. **Port Scanning**: `findAvailableOscPortPair()` scans for available UDP/TCP ports

### Project Manifest Schema

```json5
{
  "name": "Standalone Filter",
  "plugin": {
    "view": {
      "defaultMode": "split",  // "compact" | "split"
      "compact": { "w": 236, "h": 220 },
      "split": { "w": 472, "h": 220 }
    },
    "osc": {
      "enabled": false,
      "queryEnabled": false,
      "basePort": 9010
    },
    "params": [
      {
        "path": "/plugin/params/cutoff",          // VST-facing
        "internalPath": "/midi/synth/rack/filter/1/cutoff", // Internal
        "type": "f",
        "min": 80, "max": 16000,
        "default": 3200,
        "skew": 0.35,  // Logarithmic for frequency
        "hostParamId": "cutoff",
        "hostParamName": "Cutoff",
        "hostParamKind": "float"
      }
    ]
  }
}
```

---

## Architecture Strengths

1. **Clean Separation**: Export configuration isolated from core DSP
2. **Flexible Parameter Mapping**: Any internal path can be exposed to host
3. **View Mode Support**: Compact and split views for different use cases
4. **OSC Fallback**: Remote control even when DAW automation isn't available
5. **Thread Safety**: Atomic values for audio thread, callbacks on message thread

---

## Research: VST3 Best Practices

### Parameter Normalization

VST3 uses **normalized values (0.0-1.0)** internally. The user's implementation maps directly to Manifold's float parameters - this is correct but consider:

```cpp
// For discrete/choice parameters, use stepped normalization
int numSteps = alias.choices.size() - 1;
float normalized = static_cast<float>(index) / numSteps;

// For skewed parameters (log frequency), VST3 recommends:
// Physical -> Normalized: normalized = (log(value) - log(min)) / (log(max) - log(min))
// The user's skew factor handles this correctly
```

### Thread Safety Patterns

The user's approach with `std::atomic<float>* rawHostValue` is solid:
- Audio thread reads atomically
- UI thread writes via `AudioProcessorValueTreeState`
- Avoids locks in real-time path

### JUCE Parameter Attachment Pattern

For UI components syncing to host parameters:

```cpp
// In editor constructor:
cutoffAttachment = std::make_unique<juce::SliderParameterAttachment>(
    *params->getParameter("cutoff"), cutoffSlider, nullptr);

// Automatically handles:
// - UI updates when automation changes
// - Host notification when user drags
// - Gesture begin/end for automation recording
```

---

## Potential Improvements

### 1. Parameter Grouping
VST3 supports parameter groups for organization:
```cpp
// Group filter params visually in host
auto& filterGroup = params->createAndAddParameterGroup("filter", "Filter", "|");
filterGroup.addParameter(/* cutoff param */);
filterGroup.addParameter(/* resonance param */);
```

### 2. Program Change Support
The current `getNumPrograms() = 1` could be expanded:
```cpp
// Allow hosts to switch between project presets
void setCurrentProgram(int index) {
    loadPreset(presetPaths[index]);
}
```

### 3. MIDI CC to Parameter Mapping
The TODO mentions "MIDI learn" - could integrate with export system:
```cpp
// Learn mode: click param in UI, move MIDI controller
void startLearning(const juce::String& paramId);
void handleMidiCC(int cc, int value);
```

### 4. Sidechain Support
For processors that need sidechain input (compressors, gates):
```cpp
bool acceptsSidechain() const override { return config.hasSidechainInput; }
```

---

## Related Papers & References

1. **"Designing Audio Effect Plugins in C++"** - Will Pirkle
   - Chapter 12: VST3/AU plugin architecture
   - Parameter normalization strategies

2. **JUCE VST3 Client Implementation**
   - `juce_VST3_Wrapper.cpp` - Reference for host integration
   - `juce_AudioProcessorValueTreeState` - Best practices

3. **Steinberg VST3 SDK Documentation**
   - Parameter quantization and display strings
   - Host automation throttling

---

## Next Steps for User

1. **Preset Management**: Add preset loading/saving to exported plugins
2. **Undo/Redo**: Integrate with host's undo system for parameter changes
3. **MIDI Learn**: Connect the MIDI learn TODO to exported parameters
4. **Sidechain I/O**: For dynamics processors
5. **Latency Reporting**: If exported modules introduce processing delay

---

## Integration with Existing TODOs

| TODO Item | Status | Connection |
|-----------|--------|------------|
| Build wrapper project for exporting standalone modules as VSTs | **IN PROGRESS** | This is the current work |
| Implement MIDI learn functionality | Related | Could extend to exported params |
| Improve bug and crash handling | Related | VST validation/testing needed |
| Sandbox agents for safe PRs | Related | Automated VST testing |

---

*Analysis generated by Manifold Tulpa - Proactive R&D Mode*
