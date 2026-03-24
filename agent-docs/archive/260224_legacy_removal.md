# Legacy Looper Removal Summary

## Date
2026-03-01

## Files Removed

### Legacy Processor/Editor
| File | Description |
|------|-------------|
| `looper/engine/LooperProcessor.cpp` | Legacy monolithic looper processor (1395 lines) |
| `looper/engine/LooperProcessor.h` | Legacy processor header (337 lines) |
| `looper/ui/LooperEditor.cpp` | Legacy editor implementation |
| `looper/ui/LooperEditor.h` | Legacy editor header |
| `looper/headless/LooperHeadless.cpp` | Legacy headless harness |

### Cruft Files
| File | Description |
|------|-------------|
| `looper/ui/looper_widgets_old.lua` | Old widget library (superseded by OOP version) |
| `looper/ui/wiring_demo.lua` | Deprecated demo script |

## Renaming: LooperPrimitives → Manifold

### New Target Names
- `Manifold` - Main plugin target (was `LooperPrimitives`)
- `Manifold_Standalone` - Standalone executable
- `ManifoldHeadless` - Headless test harness

### New Binary Output
`build-dev/Manifold_artefacts/RelWithDebInfo/Standalone/Manifold`

## Build Commands

```bash
# Configure
cmake -S . -B build-dev -G Ninja -DCMAKE_BUILD_TYPE=RelWithDebInfo

# Build standalone
cmake --build build-dev --target Manifold_Standalone

# Run
./build-dev/Manifold_artefacts/RelWithDebInfo/Standalone/Manifold
```

## Verification
- Binary launches without crash
- DSP script loads (40 nodes, 16 connections)
- UI script loads
- CLI responds with `OK PONG`

## Architecture Post-Cleanup

Only the BehaviorCore-based runtime remains:
- `looper_primitives/BehaviorCoreProcessor.cpp/h` - Core processor
- `looper_primitives/BehaviorCoreEditor.cpp/h` - Editor
- `looper/dsp/looper_primitives_dsp.lua` - Behavior script
- `looper/ui/looper_primitives_ui.lua` - UI script

## Note on LooperLayer.h

`looper/engine/LooperLayer.h` is retained as it's referenced by the runtime sources. It contains the layer state definitions used by both legacy and new runtime.
