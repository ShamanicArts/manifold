# State Subscription Patterns for Real-Time Audio Systems

**Date:** 2026-04-09  
**Context:** Based on TODOs in `BehaviorCoreProcessor.cpp` for `subscribeToPath`, `unsubscribeFromPath`, and `processPendingChanges`  
**Related Work:** OSCQuery WebSocket LISTEN/IGNORE protocol already implemented

---

## The Problem

The user needs a state subscription system that:
1. **Audio thread safe** - No locks, no allocations in real-time callback
2. **Low latency** - State changes propagate quickly to UI and network
3. **Scalable** - Support many paths, many subscribers
4. **Selective** - Only notify subscribers for paths they care about

Current OSCQuery uses per-client state caching with diff-based streaming:
```cpp
struct StateCache {
    float tempo = 0.0f;
    bool isRecording = false;
    // ... 30+ fields hardcoded
};
```

This doesn't scale to arbitrary state paths from exported plugins.

---

## Pattern 1: Lock-Free Path-Subscriber Map (Recommended)

### Architecture

```cpp
// Fixed-size pool for audio thread safety
class PathSubscriptionManager {
    // Subscriber token - unique ID per subscription
    using SubscriberId = uint32_t;
    
    // Pre-allocated node in linked list (no malloc in audio thread)
    struct SubscriptionNode {
        std::atomic<SubscriberId> subscriberId{0};  // 0 = empty
        std::atomic<SubscriptionNode*> next{nullptr};
    };
    
    // Path -> subscriber list mapping
    // Uses lock-free hash map or sorted array + binary search
    struct PathEntry {
        std::atomic<uint64_t> pathHash{0};
        std::atomic<SubscriptionNode*> head{nullptr};
    };
    
    static constexpr size_t MAX_PATHS = 1024;
    static constexpr size_t MAX_SUBSCRIPTIONS = 4096;
    
    // Pre-allocated pools
    std::array<PathEntry, MAX_PATHS> paths_;
    std::array<SubscriptionNode, MAX_SUBSCRIPTIONS> nodePool_;
    std::atomic<size_t> nextNodeIndex_{0};
};
```

### Audio Thread Path (Lock-Free)

```cpp
void onStateChanged(const std::string& path, float value) {
    // O(1) hash lookup
    uint64_t hash = fnv1a(path);
    size_t idx = hash & (MAX_PATHS - 1);  // Power-of-2 size
    
    // CAS loop for lock-free traversal
    auto* entry = &paths_[idx];
    if (entry->pathHash.load(std::memory_order_acquire) != hash) {
        return;  // No subscribers for this path
    }
    
    // Queue notification for non-realtime thread
    auto* node = entry->head.load(std::memory_order_acquire);
    while (node) {
        auto id = node->subscriberId.load(std::memory_order_relaxed);
        if (id != 0) {
            pendingNotifications_.enqueue({id, path, value});
        }
        node = node->next.load(std::memory_order_acquire);
    }
}
```

### Non-Realtime Thread Path

```cpp
void processPendingChanges() {
    Notification note;
    while (pendingNotifications_.try_dequeue(note)) {
        auto it = callbacks_.find(note.subscriberId);
        if (it != callbacks_.end()) {
            it->second(note.path, note.value);
        }
    }
}
```

---

## Pattern 2: Hierarchical State Observer (For Complex Nesting)

If paths are hierarchical (e.g., `/midi/synth/rack/filter/1/cutoff`):

```cpp
class HierarchicalObserver {
    struct ObserverNode {
        std::string segment;  // "midi", "synth", "rack", etc.
        std::vector<std::unique_ptr<ObserverNode>> children;
        std::vector<SubscriberId> subscribers;  // Only at leaf nodes
        
        // Wildcard support: "/midi/synth/rack/*/cutoff"
        std::unique_ptr<ObserverNode> wildcardChild;
    };
    
    // Parse path into segments
    // Walk tree, notify subscribers at matching nodes
    // Supports wildcards for "notify me of any filter cutoff changes"
};
```

**Use case:** UI component showing all filter parameters across multiple racks.

---

## Pattern 3: Ring Buffer Notifications (Simplest)

For the VST export use case (small, fixed set of parameters):

```cpp
class SimpleStateNotifier {
    struct Change {
        uint32_t paramIndex;  // Pre-registered parameter index
        float value;
        uint64_t timestamp;   // Sample clock
    };
    
    // Single-producer (audio thread), single-consumer (UI thread)
    SPSCQueue<Change, 256> changes_;
    
    // Pre-register paths to get indices
    std::unordered_map<std::string, uint32_t> pathToIndex_;
};
```

**Trade-off:** Requires pre-registration, but simplest implementation.

---

## Integration with Existing OSCQuery

The user's OSCQuery already has `WebSocketClient::listenPaths`. The new subscription system should:

1. **Bridge to OSCQuery**: When a WebSocket sends `LISTEN /plugin/params/cutoff`, subscribe via the new manager
2. **Share state cache**: The per-client `StateCache` can be populated from subscription notifications
3. **Unified interface**: Single API for both internal (VST) and external (OSC) subscribers

```cpp
class StateSubscriptionSystem {
public:
    // Called by WebSocket on LISTEN command
    void subscribe(const std::string& path, SubscriberId id, Callback cb);
    
    // Called by audio thread on parameter change
    void notifyChange(const std::string& path, float value);
    
    // Called by message thread each frame
    void processNotifications();
    
    // Get current value for OSCQuery VALUE queries
    std::optional<float> getValue(const std::string& path);
};
```

---

## Memory Ordering Strategy

Based on user's existing patterns in `SPSCQueuePtr`:

```cpp
// Audio thread (producer)
writeIdx.store(next, std::memory_order_release);

// Message thread (consumer)  
readIdx.load(std::memory_order_acquire);
```

Same pattern applies to subscription notifications:
- **Audio thread**: `release` after writing notification to queue
- **Message thread**: `acquire` before reading notification

This ensures proper synchronization without locks.

---

## Implementation Recommendations for User

### Phase 1: Simple Ring Buffer (Immediate)
For the VST export MVP, use Pattern 3:
- Fixed-size ring buffer for notifications
- Pre-registered paths from `ExportParamAlias`
- Process in `timerCallback()` or similar

### Phase 2: Generic Subscription (Later)
Implement Pattern 1 for arbitrary path subscriptions:
- OSCQuery WebSocket integration
- UI component data binding
- Lua script observation

### Phase 3: Hierarchical (If Needed)
Pattern 2 if wildcard subscriptions become important.

---

## References

1. **"Wait-Free Synchronization"** - Maurice Herlihy (1991)
   - Theoretical foundation for lock-free data structures

2. **"The JUCE SPSC Queue"** - `juce_AbstractFifo.h`
   - Production lock-free queue used in user's codebase

3. **"Real-Time Programming in C++"** - Timur Doumler (CppCon 2019)
   - Real-time safe patterns, memory allocation strategies

4. **"OSCQuery Specification"** - CNMAT
   - LISTEN/IGNORE protocol semantics

---

## Code Location Integration

The TODOs in `BehaviorCoreProcessor.cpp` map to:

| TODO | Suggested Pattern | Notes |
|------|------------------|-------|
| `subscribeToPath` | Pattern 1 or 3 | Store callback in map |
| `unsubscribeFromPath` | Same | Mark for deletion (don't erase - allocation) |
| `clearSubscriptions` | Same | Atomic reset of subscription list |
| `processPendingChanges` | Ring buffer dequeue | Call on message thread |
| `serializeStateToJson` | N/A | Build from current Lua state |
| `getStateSchema` | N/A | Introspect Lua tables or parse manifest |

---

*Analysis generated by Manifold Tulpa - Proactive R&D Mode*
