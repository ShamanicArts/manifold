# Type Safety Patterns for Real-Time Audio C++

**Date:** 2025-01-07  
**Context:** User is systematically converting `int` → `std::size_t` for array indices and improving atomic memory ordering throughout the Manifold codebase.

## Observed Changes

### 1. Index Type Conversions
User is adding helper functions to safely convert indices:

```cpp
// Pattern emerging in codebase:
constexpr std::size_t toIndex(int value) noexcept {
    return static_cast<std::size_t>(value);
}

// Usage in OscillatorNode.cpp:
unisonVoiceGains_[toIndex(v)]  // instead of unisonVoiceGains_[v]
```

### 2. SPSC Queue Improvements
ControlServer.h changes show conversion of lock-free queues:

```cpp
// Before: std::atomic<int> for indices
// After:  std::atomic<std::size_t> for indices
template<std::size_t Capacity>
class SPSCQueue {
    std::atomic<std::size_t> writeIdx{0};  // Was: std::atomic<int>
    std::atomic<std::size_t> readIdx{0};   // Was: std::atomic<int>
};
```

### 3. Memory Ordering Annotations
Adding explicit memory ordering to atomic operations:

```cpp
// In MidiVoiceNode.cpp:
voices_[voiceIndex(v)].active.load(std::memory_order_acquire)
// vs implicit/default ordering
```

## Research: Best Practices for Audio DSP Type Safety

### 1. Index Types in Real-Time Code

**Recommendation:** Use `std::size_t` for all array indices, but with explicit bounds checking at API boundaries.

```cpp
// Safe pattern for audio buffers
class AudioBuffer {
public:
    float& operator[](std::size_t index) noexcept {
        // In debug builds:
        assert(index < size_ && "Buffer overflow in audio thread!");
        return data_[index];
    }
    
    // API boundary - validate external input
    void setSample(int channel, int sample, float value) {
        // Validate at boundary
        if (channel < 0 || channel >= numChannels_) return;
        if (sample < 0 || static_cast<std::size_t>(sample) >= numSamples_) return;
        
        data_[static_cast<std::size_t>(channel) * numSamples_ + 
              static_cast<std::size_t>(sample)] = value;
    }
};
```

### 2. Lock-Free Queue Design for Audio

Key considerations for the user's SPSCQueue pattern:

**Cache Line Separation:**
```cpp
class alignas(64) SPSCQueue {  // Prevent false sharing
    // Write index (producer only)
    alignas(64) std::atomic<std::size_t> writeIdx{0};
    
    // Read index (consumer only)  
    alignas(64) std::atomic<std::size_t> readIdx{0};
    
    // Ring buffer (shared, read-only after init)
    alignas(64) std::array<T, Capacity> buffer;
};
```

**Memory Ordering for Audio:**
- `memory_order_relaxed` for write index (producer only)
- `memory_order_acquire` for read index compare (synchronizes-with)
- `memory_order_release` after write (publishes data)

### 3. Integer Conversion Safety

The user's pattern for clamping:

```cpp
// Safe conversion with bounds checking
template<typename T>
constexpr std::size_t toSizeT(T value) noexcept {
    static_assert(std::is_integral_v<T>, "Only integral types");
    
    if constexpr (std::is_signed_v<T>) {
        return value < 0 ? 0 : static_cast<std::size_t>(value);
    } else {
        return static_cast<std::size_t>(value);
    }
}
```

### 4. Build System Observations

User added CMake policy fixes for FetchContent:

```cmake
# Pattern for dependency management
set(_saved_policy "${CMAKE_POLICY_VERSION_MINIMUM}")
set(CMAKE_POLICY_VERSION_MINIMUM 3.10)
set(CMAKE_WARN_DEPRECATED OFF)
FetchContent_MakeAvailable(dependency)
set(CMAKE_POLICY_VERSION_MINIMUM "${_saved_policy}")
unset(_saved_policy)
```

This is a clean pattern for handling older dependencies.

## Suggestions for Continued Cleanup

### 1. Consolidate Helper Functions
Multiple files define similar `toIndex()` helpers. Consider a central utility:

```cpp
// manifold/primitives/core/TypeUtils.h
#pragma once
#include <cstddef>
#include <type_traits>

namespace manifold::utils {
    constexpr std::size_t toSizeT(int value) noexcept {
        return static_cast<std::size_t>(value < 0 ? 0 : value);
    }
    
    // For loops where -1 is sentinel
    constexpr std::size_t voiceIndex(int value) noexcept {
        return static_cast<std::size_t>(value);
    }
}
```

### 2. Static Analysis Integration
Consider adding compiler warnings:

```cmake
if(CMAKE_CXX_COMPILER_ID MATCHES "GNU|Clang")
    add_compile_options(
        -Wsign-conversion      # Catch int/size_t mismatches
        -Wshorten-64-to-32     # Catch truncation
    )
endif()
```

### 3. Unit Tests for Lock-Free Structures
The SPSCQueue and EventRing changes warrant tests:

```cpp
TEST(SPSCQueue, SingleProducerSingleConsumer) {
    SPSCQueue<int, 1024> queue;
    
    std::thread producer([&] {
        for (int i = 0; i < 10000; ++i) {
            while (!queue.enqueue(i)) {
                // Spin wait - realistic for audio
            }
        }
    });
    
    std::thread consumer([&] {
        for (int i = 0; i < 10000; ++i) {
            int val;
            while (!queue.dequeue(val)) {
                // Spin wait
            }
            EXPECT_EQ(val, i);
        }
    });
    
    producer.join();
    consumer.join();
}
```

## References

1. **C++ Core Guidelines** - ES.100: Don't use signed types for array indices
2. **Real-Time C++** - Christopher Kormanyos - Lock-free patterns
3. **Ableton Link** - Reference implementation of lock-free sync
4. **JUCE** - Their atomic/lock-free queue implementations

## Integration Notes

The user's changes to `ControlServer.h` SPSCQueue align with industry best practices. The conversion from `int` to `std::size_t` for indices eliminates a class of potential bugs (negative indices) while the explicit memory ordering improves documentation and potentially performance.

The pattern of helper functions (`toIndex()`, `voiceIndex()`) centralizes the conversion logic, making future audits easier.
