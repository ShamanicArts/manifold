# Export Manifest + CMake Sharedization

**Date:** 2026-04-10  
**Scope:** Remove hand-maintained export manifest duplication and collapse repeated export plugin target wiring into shared build infrastructure.

---

## What was added

### 1. Shared manifest generator
Added:
- `tools/generate_export_manifest.py`

Purpose:
- read a small per-export spec file
- generate the runtime manifest at:
  - `manifold.project.json5`

Current supported generators:
- `filter_single`
- `eq8_single`
- `static` (manual entry passthrough if needed later)

---

### 2. Per-export manifest spec files
Added:
- `UserScripts/projects/Standalone_Filter/manifest.spec.json`
- `UserScripts/projects/Standalone_Eq/manifest.spec.json`

These now act as the source of truth for export manifest generation.

The generated outputs remain at the existing runtime paths:
- `UserScripts/projects/Standalone_Filter/manifold.project.json5`
- `UserScripts/projects/Standalone_Eq/manifold.project.json5`

That preserves existing runtime behavior and project-relative path resolution.

---

### 3. Shared CMake export macro
Added in `CMakeLists.txt`:
- `manifold_add_export_lua_assets(...)`
- `manifold_add_export_plugin(...)`

Purpose:
- generate export manifest before build
- create the JUCE plugin target
- apply common compile definitions and link libraries
- set `MANIFOLD_DEFAULT_PROJECT`
- add post-build Lua/SystemScripts/UserScripts asset copy

This replaced the duplicated hand-written Filter/EQ target setup.

---

### 4. Quick deploy helper
Added:
- `scripts/deploy_export_vst3.sh`

Supports:
- `./scripts/deploy_export_vst3.sh Filter`
- `./scripts/deploy_export_vst3.sh EQ8`
- or passing a direct bundle path

It copies the chosen built VST3 bundle into:
- `~/.vst3`

This is intentionally tiny and dumb, which is fine for now.

---

## Refactored build usage

These targets now go through the shared macro:
- `Manifold_Filter`
- `Manifold_EQ8`

That means the duplicated blocks for:
- `juce_add_plugin(...)`
- `target_sources(...)`
- `target_compile_definitions(...)`
- `target_link_libraries(...)`
- post-build asset copy

are no longer repeated separately for Filter and EQ.

---

## Why this is better

### Manifest side
Before:
- giant hand-authored `plugin.params` arrays
- EQ especially was a brittle pile of repetitive entries
- easy to get path mismatches between UI expectations and exported aliases

Now:
- small spec file
- generated manifest output
- one place to encode generator rules for module-shaped exports

### CMake side
Before:
- duplicated Filter/EQ target blocks
- duplicated compile defs
- duplicated post-build asset copy commands
- easy for one target to drift from the other

Now:
- one function owns export target wiring
- adding another processor-style export is much less fucking stupid

---

## Current limitations

This is better, but not magic yet.

### 1. Manifest generators are currently limited
Supported today:
- Filter single-module export
- EQ8 single-module export

Still to do later if needed:
- FX export generator
- more generalized generator rules from shared module metadata

### 2. Generated manifest writes into the source project path
This is deliberate for now, because:
- runtime already expects that project path
- relative references like `../Main/...` keep working

If we later want a fully build-dir-only manifest pipeline, that needs a more careful path strategy.

### 3. Deploy is still manual in workflow terms
There is now a script, but deployment is still not folded into CMake target execution.
That is acceptable for now per current request.

---

## Commands now available

Build export targets:
- `cmake --build build-dev --target Manifold_Filter_Standalone Manifold_Filter_VST3`
- `cmake --build build-dev --target Manifold_EQ8_Standalone Manifold_EQ8_VST3`

Deploy built VST3 bundles quickly:
- `./scripts/deploy_export_vst3.sh Filter`
- `./scripts/deploy_export_vst3.sh EQ8`

---

## Result

We now have:
- shared manifest generation
- shared export target CMake wiring
- reduced duplication in both source manifests and plugin target definitions
- a tiny deploy helper for the current manual-install workflow

This is a real cleanup, not cosmetic rearranging.
