# DSP Node Descriptor Registry - Architecture Improvement Plan

**Date:** 2026-04-05  
**Status:** Planning / Ready for Implementation  
**Related:** `DSPPluginScriptHost` decomposition completion

---

## Executive Summary

The mechanical decomposition of `DSPPluginScriptHost.cpp` is complete. The code is now split into 12 focused implementation files. However, **node definition is still duplicated across 4-5 sites per node**:

1. `new_usertype` registration
2. Legacy `ctx.primitives.*.new()` factory
3. `toPrimitiveNode` direct type check
4. `toPrimitiveNode` table-based (`__node`) check  
5. `ctx.params.bind` explicit dynamic-cast branch (for some nodes)

This document outlines a **descriptor-driven registry pattern** to collapse these into **single-source-of-truth node definitions**.

---

## Current State (Post-Decomposition)

### File Structure
```
manifold/primitives/scripting/dsp_host/
├── DSPHostInternal.h                 # Shared types, LoadSession, Impl
├── DSPHostPathMapping.cpp            # sanitizePath, isRegistryOwnedCategory
├── DSPHostValueConverters.cpp        # Lua conversion helpers
├── DSPHostDeferredMutation.cpp       # Worker thread, runtime swap
├── DSPHostTelemetry.cpp              # Layer queries, peaks, spectrum
├── DSPHostScriptBootstrap.cpp        # Lua init, module loading
├── DSPHostBindingsCore.cpp           # ~975 lines, core/transport/loop nodes
├── DSPHostBindingsSynth.cpp          # ~706 lines, synth/MIDI nodes
├── DSPHostBindingsFx.cpp             # ~954 lines, FX/analysis nodes
├── DSPHostObjectResolver.cpp         # toPrimitiveNode (312 lines of if-ladders)
├── DSPHostParamRegistry.cpp          # ctx.params API (1,127 lines)
├── DSPHostLoopLayerBundle.cpp        # LoopLayer bundle construction
├── DSPHostEndpointSync.cpp           # OSC/OSCQuery endpoint sync
└── (extracted) ../DSPPluginScriptHost.cpp  # ~280 lines, orchestration only
```

### The Duplication Problem

Adding or modifying a node currently requires touching **4-6 disconnected locations**:

**Example: Adding a `NewFilterNode`**

1. **DSPHostBindingsCore.cpp** (or Fx.cpp):
   ```cpp
   // usertype registration
   lua.new_usertype<NewFilterNode>("NewFilterNode", ...);
   
   // legacy factory
   primitives["NewFilter"] = sol::table(lua, sol::create);
   primitives["NewFilter"]["new"] = [trackNode, graph](args...) {
       auto node = std::make_shared<NewFilterNode>(...);
       trackNode(node);
       return node; // or wrapper table
   };
   ```

2. **DSPHostObjectResolver.cpp**:
   ```cpp
   // Direct type check
   if (obj.is<std::shared_ptr<NewFilterNode>>())
       return obj.as<std::shared_ptr<NewFilterNode>>();
   
   // Table-based check
   if (obj.is<sol::table>()) {
       auto table = obj.as<sol::table>();
       sol::object nodeObj = table["__node"];
       if (nodeObj.is<std::shared_ptr<NewFilterNode>>())
           return nodeObj.as<std::shared_ptr<NewFilterNode>>();
   }
   ```

3. **DSPHostParamRegistry.cpp** (if params need explicit binding):
   ```cpp
   // In ctx.params.bind lambda ladder
   if (auto typed = std::dynamic_pointer_cast<NewFilterNode>(node)) {
       // bind specific params
   }
   ```

This is:
- **Error-prone**: Easy to miss one location
- **Maintenance burden**: Changing node signature = 4+ file edits
- **Review noise**: PRs touch many files for simple additions
- **Barrier to entry**: New contributors must understand the full binding matrix

---

## Proposed Solution: Node Descriptor Registry

### Core Concept

Each node exposes a **single descriptor** that drives all binding surfaces:

```cpp
struct NodeDescriptor {
    // Identity
    std::string name;                    // "NewFilter"
    std::string category;                // "fx", "core", "synth"
    
    // Usertype registration
    std::function<void(sol::state&)> registerUsertype;
    
    // Legacy factory registration  
    std::function<void(sol::table& primitives, 
                       PrimitiveGraphPtr graph,
                       TrackNodeFn trackNode)> registerLegacyFactory;
    
    // Resolution support
    PrimitiveNodeResolverFn resolve;     // unified resolver
    
    // Param binding (optional)
    std::function<void(sol::state&, 
                       sol::table& paramsBinder,
                       PrimitiveNodePtr node)> bindParams;
    
    // Metadata for tooling/documentation
    std::vector<ParamSpec> params;
    std::string description;
};
```

### Registry

```cpp
class NodeRegistry {
    std::unordered_map<std::string, NodeDescriptor> byName_;
    std::vector<std::string> insertionOrder_;  // stable iteration
    
public:
    void registerNode(NodeDescriptor desc);
    
    const NodeDescriptor* find(const std::string& name) const;
    
    // Bulk operations used during loadScriptImpl
    void registerAllUsertypes(sol::state& lua);
    void registerAllLegacyFactories(sol::table& primitives, 
                                    PrimitiveGraphPtr graph,
                                    TrackNodeFn trackNode);
    void registerAllParamBindings(sol::state& lua,
                                  sol::table& paramsBinder);
    
    // Unified resolver
    PrimitiveNodePtr resolve(const sol::object& obj) const;
};
```

### Domain-Specific Registration

Instead of editing 4+ files, add a node in **one location**:

**New file: `DSPHostRegistryCore.cpp`**
```cpp
void registerCoreNodes(NodeRegistry& reg) {
    reg.registerNode({
        .name = "TransportState",
        .category = "core",
        .registerUsertype = [](sol::state& lua) {
            lua.new_usertype<TransportStateNode>(
                "TransportStateNode",
                "getTransport", &TransportStateNode::getTransport,
                ...
            );
        },
        .registerLegacyFactory = [](sol::table& primitives, ...) {
            primitives["TransportState"] = sol::table(lua, sol::create);
            primitives["TransportState"]["new"] = [...](...) {
                auto node = std::make_shared<TransportStateNode>(...);
                trackNode(node);
                return node;  // or wrapper if legacy requires
            };
        },
        .resolve = [](const sol::object& obj) -> PrimitiveNodePtr {
            // Unified: handles both direct and table-wrapped
            if (auto direct = obj.as<std::shared_ptr<TransportStateNode>>())
                return direct;
            if (obj.is<sol::table>()) {
                auto table = obj.as<sol::table>();
                if (auto wrapped = table["__node"].as<std::shared_ptr<TransportStateNode>>())
                    return wrapped;
            }
            return nullptr;
        }
    });
    
    // More core nodes...
}
```

**Similar files:**
- `DSPHostRegistrySynth.cpp` - MidiVoiceNode, OscillatorNode, etc.
- `DSPHostRegistryFx.cpp` - All FX/analysis nodes

---

## Implementation Plan

### Phase 1: Infrastructure (Low Risk)

1. **Create descriptor types** in `DSPHostInternal.h`
   - `NodeDescriptor` struct
   - `NodeRegistry` class declaration

2. **Create registry implementation** `DSPHostRegistry.cpp`
   - Registry storage and lookup
   - Bulk registration methods

3. **Add registration functions** (new files):
   - `DSPHostRegistryCore.cpp`
   - `DSPHostRegistrySynth.cpp`  
   - `DSPHostRegistryFx.cpp`
   - Initially these can be **empty** or have **one migrated node** as proof of concept

### Phase 2: Parallel Implementation (Medium Risk)

Run new registry **alongside** existing code. Each node migrated:

1. Add descriptor to registry
2. Comment out (don't delete) old usertype/factory/resolver entries
3. Test thoroughly with real scripts
4. Only delete old code once proven stable

**Migration order (safest first):**
1. Simple nodes with no params (PassthroughNode, GainNode)
2. Nodes with simple params (OscillatorNode)
3. Complex nodes with many methods (LoopPlaybackNode)
4. Nodes with wrapper-table legacy behavior (requires careful handling)

### Phase 3: Cutover (Higher Risk)

Once all nodes migrated:

1. Replace `toPrimitiveNode` ladder with `registry.resolve()`
2. Replace binding registration calls with `registry.registerAll*()`
3. Delete old `DSPHostBindings*.cpp` files (or reduce to thin wrappers)
4. Delete `DSPHostObjectResolver.cpp` (folded into registry)

### Phase 4: Cleanup (Low Risk)

1. Remove commented-out old code
2. Normalize any remaining wrapper-vs-raw inconsistencies
3. Add generated documentation from descriptors

---

## Handling Legacy Compatibility

### The Wrapper Table Problem

Some legacy factories return **wrapper tables** instead of raw nodes:

```lua
-- Legacy wrapper (20 nodes)
local filter = ctx.primitives.Filter.new()
-- filter is a table with { __node = <FilterNode>, method1 = ..., method2 = ... }

-- Raw usertype (29 nodes)  
local osc = ctx.primitives.Oscillator.new()
-- osc is std::shared_ptr<OscillatorNode> directly
```

### Solution: Explicit Factory Shape

```cpp
struct NodeDescriptor {
    enum class FactoryReturnType {
        RawUsertype,        // Return shared_ptr directly
        WrapperTable        // Return sol::table with __node + methods
    };
    
    FactoryReturnType factoryReturn = FactoryReturnType::RawUsertype;
    
    // For wrapper tables, also provide method injection
    std::function<void(sol::table& wrapper, std::shared_ptr<NodeT> node)> 
        injectWrapperMethods;
};

// In registerLegacyFactory for wrapper nodes:
auto node = std::make_shared<FilterNode>(...);
trackNode(node);
sol::table wrapper(lua, sol::create);
wrapper["__node"] = node;
desc.injectWrapperMethods(wrapper, node);  // Add method lambdas
return wrapper;
```

This preserves exact legacy behavior while making the distinction explicit.

---

## Benefits

| Current State | After Registry |
|--------------|----------------|
| 4-6 edits per node | 1 edit per node |
| Resolver: 312-line if-ladder | Registry: table-driven lookup |
| Inconsistent param binding | Uniform optional bindParams hook |
| No runtime introspection | Registry knows all registered nodes |
| Hard to add tooling | Can generate docs/bindings from descriptors |
| Easy to miss a site | Single source of truth |

### Concrete Wins

1. **Adding a node:** Edit 1 file instead of 4-6
2. **Reviewing node PRs:** Single coherent diff
3. **Testing:** Can validate descriptor completeness programmatically
4. **Future features:** 
   - Auto-generated Lua type stubs
   - Node palette in UI from registry
   - Parameter schema extraction
   - Migration path for node renames

---

## Risks and Mitigations

### Risk: Runtime Performance

**Concern:** Registry indirection might be slower than inlined if-ladders.  
**Mitigation:** 
- Registry lookups happen at **registration time** (once per load), not per-call
- Resolution can use typeid hashing or inline caching
- Measure before optimizing; current resolver is already function-call heavy

### Risk: Template Compilation

**Concern:** `std::function` in descriptors might reintroduce template bloat.  
**Mitigation:**
- Use type-erased function pointers where possible
- Keep descriptors in `.cpp` files, not headers
- Consider `void*` + function pointer pattern instead of `std::function` if needed

### Risk: Legacy Behavior Drift

**Concern:** Migrating wrapper-table nodes might subtly change behavior.  
**Mitigation:**
- Keep old code commented, not deleted, during Phase 2
- Extensive smoke testing with existing scripts
- Property-based testing: enumerate all nodes, verify factory returns correct type

### Risk: Build Time Regression

**Concern:** More `.cpp` files might slow clean builds.  
**Mitigation:**
- 3-4 registry files is still fewer TUs than the 12 we have now
- Can combine into single registry TU if needed
- Incremental builds will be much faster (changing one node = one file)

---

## Files to Create/Modify

### New Files

```
manifold/primitives/scripting/dsp_host/
├── DSPHostRegistry.h              # NodeDescriptor, NodeRegistry declarations
├── DSPHostRegistry.cpp            # Registry implementation
├── DSPHostRegistryCore.cpp        # Core/transport/loop node descriptors
├── DSPHostRegistrySynth.cpp       # Synth/MIDI node descriptors
└── DSPHostRegistryFx.cpp          # FX/analysis node descriptors
```

### Files to Modify

```
manifold/primitives/scripting/dsp_host/
├── DSPHostInternal.h              # Add descriptor types, registry access
└── ../DSPPluginScriptHost.cpp     # Use registry for binding registration

CMakeLists.txt                     # Add new source files
```

### Files to Eventually Delete (Post-Migration)

```
manifold/primitives/scripting/dsp_host/
├── DSPHostBindingsCore.cpp        # Merged into RegistryCore
├── DSPHostBindingsSynth.cpp       # Merged into RegistrySynth
├── DSPHostBindingsFx.cpp          # Merged into RegistryFx
└── DSPHostObjectResolver.cpp      # Merged into Registry
```

---

## Testing Strategy

### Unit-Level

```cpp
TEST(NodeRegistry, CanResolveAllRegisteredNodes) {
    NodeRegistry reg;
    registerCoreNodes(reg);
    registerSynthNodes(reg);
    registerFxNodes(reg);
    
    // Verify every registered node can be looked up
    for (const auto& name : reg.getNodeNames()) {
        auto* desc = reg.find(name);
        EXPECT_NE(desc, nullptr);
        EXPECT_EQ(desc->name, name);
    }
}
```

### Integration-Level

1. Load each existing DSP script
2. Verify all nodes resolve correctly
3. Verify params bind correctly
4. Verify OSC endpoints registered

### Regression Testing

- Before/after object file size comparison
- Before/after compile time measurement
- Full plugin smoke test (already in place from decomposition work)

---

## Open Questions

1. **Param binding uniformity:** Should all nodes use explicit `bindParams`, or should we keep generic fallback for simple cases?

2. **Wrapper deprecation:** Do we eventually want to deprecate wrapper-table returns and normalize on raw usertypes?

3. **Hot reload:** Should the registry support runtime node registration for plugin development?

4. **Serialization:** Should descriptors include enough metadata for graph serialization/deserialization?

5. **Documentation generation:** Should we generate Lua API docs from descriptors at build time?

---

## Recommended Next Steps

If proceeding with this work:

1. **Start small:** Migrate 2-3 simple nodes (PassthroughNode, GainNode, OscillatorNode) through the full pipeline
2. **Prove equivalence:** Run existing scripts, compare behavior byte-for-byte if possible
3. **Measure impact:** Check build times, object sizes, runtime performance
4. **Scale up:** Only migrate all nodes once the pattern is validated

**Estimated effort:** 1-2 focused sessions for Phase 1-2 (infrastructure + pilot migration), 1 session for Phase 3 (full cutover), 1 session for Phase 4 (cleanup).

**Total:** ~3-4 sessions to complete the registry transition.

---

## Appendix: Current Node Inventory

### Core/Transport Nodes (11)
- PlayheadNode, PassthroughNode, GainNode
- LoopPlaybackNode, SampleRegionPlaybackNode, PlaybackStateGateNode
- RetrospectiveCaptureNode, RecordStateNode, QuantizerNode
- RecordModePolicyNode, ForwardCommitSchedulerNode, TransportStateNode

### Synth/MIDI Nodes (5)
- OscillatorNode, SineBankNode
- MidiVoiceNode, MidiInputNode, ADSREnvelopeNode

### FX/Analysis Nodes (29)
- ReverbNode, FilterNode, DistortionNode, SVFNode
- StereoDelayNode, CompressorNode, WaveShaperNode, ChorusNode
- StereoWidenerNode, PhaserNode, GranulatorNode, PhaseVocoderNode
- StutterNode, ShimmerNode, MultitapDelayNode, PitchShifterNode
- TransientShaperNode, RingModulatorNode, BitCrusherNode, FormantFilterNode
- ReverseDelayNode, EnvelopeFollowerNode, PitchDetectorNode
- CrossfaderNode, MixerNode, NoiseGeneratorNode
- MSEncoderNode, MSDecoderNode, EQNode, EQ8Node
- LimiterNode, SpectrumAnalyzerNode

**Total: ~45 nodes** (some have factories but no usertypes, some commented out)

---

*Document created after completion of DSPPluginScriptHost mechanical decomposition. This work represents Phase 2: architectural improvement to eliminate multi-site node definition duplication.*
