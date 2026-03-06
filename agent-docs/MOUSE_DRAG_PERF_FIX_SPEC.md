# Mouse Drag Performance Fix Spec

## Problem Proven

**Root cause:** `mouseDrag` events fire at ~1000Hz and each takes ~1.5ms to process (Lua callbacks + setBounds + repaint). This saturates the message thread, starving the 60Hz timer and making the UI feel sluggish.

**Measurements:**
- 969 drag events/sec during typical drag
- Each event: 1-2ms in Lua mouseDrag handler
- Total: ~150% of message thread capacity

## Solution

Throttle mouse drag events to max 60Hz (16ms interval) by tracking time since last processed drag.

### Implementation

**File:** `manifold/primitives/ui/Canvas.cpp`

In `Canvas::mouseDrag()`, add time-based throttling:

```cpp
void Canvas::mouseDrag(const juce::MouseEvent& e) {
    if (!onMouseDrag) return;
    
    // Throttle to ~60Hz max (16ms interval)
    static thread_local auto lastDragTime = std::chrono::steady_clock::now();
    const auto now = std::chrono::steady_clock::now();
    const auto elapsed = std::chrono::duration_cast<std::chrono::microseconds>(now - lastDragTime).count();
    
    if (elapsed < 16000) {  // Skip if < 16ms since last drag
        return;
    }
    lastDragTime = now;
    
    onMouseDrag(e);
}
```

**Remove** the debug logging that was added (drag count and timing).

### Files Changed

| File | Change |
|------|--------|
| `manifold/primitives/ui/Canvas.cpp` | Add 16ms throttle to mouseDrag(), remove debug logging |

### Acceptance Criteria

1. Drag a component rapidly - timer gaps should drop from ~44ms to ~17ms (60Hz)
2. Drag events logged per second should drop from ~1000 to ~60
3. UI should feel responsive during drag, not sluggish
4. No visual artifacts (throttled drag should still look smooth at 60Hz)

### Build

```bash
cmake --build build-dev --target Manifold_Standalone
```
