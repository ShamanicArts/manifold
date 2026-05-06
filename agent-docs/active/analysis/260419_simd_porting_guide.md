# SIMD Porting Guide — DSP Primitive Nodes → Highway

**Audience:** anyone (human or agent) porting a `dsp_primitives` node from scalar to Highway SIMD.
**Reference implementations:** `BitCrusherNode_Highway.h`, `ADSREnvelopeNode_Highway.h`, `OscillatorNode_Highway.h`, `GainNode_Highway.h`, `FilterNode_Highway.h`, `MixerNode_Highway.h`.
**Test harness:** `dsp_simd_test/TestNodesApp/main.cpp`.

This doc compresses lessons from the Mixer → Filter → Oscillator → ADSR → BitCrusher → Gain ports, including the trap-filled bugs found along the way.

---

## 1. The shape of a port

Every port lands three pieces:

| File | Role |
|------|------|
| `dsp/core/nodes/<Node>.h` | Owns the parameter atomics and holds `std::unique_ptr<IPrimitiveNodeSIMDImplementation> simd_implementation_` |
| `dsp/core/nodes/<Node>.cpp` | Scalar fallback + creates SIMD impl in `prepare()`, forwards `process()` to it |
| `dsp/core/nodes/<Node>_Highway.h` | The SIMD impl. Included once from the `.cpp` with the Highway multi-dispatch bootstrap |

`IPrimitiveNodeSIMDImplementation` is in `dsp/core/graph/PrimitiveNode.h`. It has `prepare`, `reset`, `configChanged`, `run`, `targetName`.

Add the `.cpp` to `dsp_simd_test/TestNodesApp/CMakeLists.txt` so the test harness picks it up.

---

## 2. The Highway multi-dispatch bootstrap

Every `*_Highway.h` uses the same skeleton. Copy it verbatim, change the type:

```cpp
// Do NOT guard against multiple inclusion — Highway includes this file once per target.
#undef HWY_TARGET_INCLUDE
#define HWY_TARGET_INCLUDE "dsp/core/nodes/MyNode_Highway.h"
#include "manifold/highway/HighwayWrapper.h"
// #include "manifold/highway/HighwayMaths.h"  // only if you need Pow / transcendentals

namespace dsp_primitives {
namespace MyNode_Highway {
namespace HWY_NAMESPACE {

    class MyNodeSIMDImplementation : public IPrimitiveNodeSIMDImplementation { ... };

    HWY_API IPrimitiveNodeSIMDImplementation * __CreateInstanceForCPU(/* ctor args */) {
        return new MyNodeSIMDImplementation(/* ctor args */);
    }
}

#if HWY_ONCE || HWY_IDE
    IPrimitiveNodeSIMDImplementation * __CreateInstance(/* ctor args */) {
        HWY_EXPORT_T(_create_instance_table, __CreateInstanceForCPU);
        return HWY_DYNAMIC_DISPATCH_T(_create_instance_table)(/* ctor args */);
    }
#endif
}}
```

Key points:
- **No include guard.** `HWY_TARGET_INCLUDE` + `foreach_target.h` (pulled in by `HighwayWrapper.h` when `HWY_TARGET_INCLUDE` is defined) re-includes this file for each compiled SIMD target.
- The inner `namespace HWY_NAMESPACE` is mandatory — Highway expands it to something like `N_AVX3`, `N_SSE4`, `N_SCALAR`, etc. **Do not rename.**
- `HWY_EXPORT_T` + `HWY_DYNAMIC_DISPATCH_T` is the runtime dispatch table.
- The `.cpp` is compiled **once** and sees the `__CreateInstance` symbol inside `#if HWY_ONCE`.

### Expected clangd noise

When you open `*_Highway.h` in an editor, clangd will emit:
- `main file cannot be included recursively when building a preamble`
- `Unknown class name 'IPrimitiveNodeSIMDImplementation'`
- `No member named 'HWY_NAMESPACE' in namespace 'hwy'`

Ignore all of it. The Highway multi-include pattern breaks clangd's single-TU assumption. What matters is that the real build (via the `.cpp` that includes this header) succeeds. Verify with `cmake --build build-dev --target ManifoldTestNodesApp`.

---

## 3. Parameter plumbing — pass atomic pointers, never duplicate them

**The single most common bug.** The SIMD impl must read the *parent node's* atomics, not its own copies.

Wrong:
```cpp
class MyNodeSIMDImplementation : public IPrimitiveNodeSIMDImplementation {
    std::atomic<float> targetGain_{1.0f};   // ← NEVER written by anyone
    std::atomic<bool>  targetMuted_{false}; // ← stays default forever
    ...
};
```
This compiles, tests may even pass if the default happens to match — but in the running plugin, `setGain()`/`setMuted()` updates the parent's atomics and the SIMD keeps using stale defaults. That was the Gain-node bug that made the plugin silent in one channel after parameter changes.

Right (BitCrusher / Oscillator / Gain pattern):
```cpp
MyNodeSIMDImplementation(float sampleRate,
                         int numChannels,
                         const std::atomic<float>* targetGain,
                         const std::atomic<bool>*  targetMuted)
    : targetGain_(targetGain), targetMuted_(targetMuted), ... {}

const std::atomic<float>* targetGain_;
const std::atomic<bool>*  targetMuted_;
```

The SIMD impl is a `unique_ptr` member of the parent node, so its lifetime is strictly shorter — raw pointers to parent atomics are safe.

---

## 4. Buffer view conventions — use `inputs[0].channelData[ch]`

The graph runtime and the test harness pass `std::vector<AudioBufferView>` differently:

| Caller | `inputs.size()` | `inputs[0].numChannels` | Meaning |
|---|---|---|---|
| Test harness | 1 view per test-data buffer | `numChannels` (1 or 2) | One view holds all channels |
| `GraphRuntime` | `inputCount` views per node | `numChannels_` (usually 2) | Multiple views point to the *same* bus accumulator; `inputs[0]` and `inputs[1]` are redundant copies of bus 0; `inputs[2]`/`inputs[3]` are bus 1, etc. |

The only pattern that works for **both** callers is BitCrusher's:

```cpp
const int channels = juce::jmin(numChannels_,
                                inputs[0].numChannels,
                                outputs[0].numChannels);
for (int ch = 0; ch < channels; ++ch) {
    const float* in  = inputs[0].channelData[ch];
    float*       out = outputs[0].channelData[ch];
    ...
}
```

Multi-bus nodes (BitCrusher with sidechain, Mixer) take bus N from `inputs[N * 2]`:
```cpp
const bool hasBusB = inputs.size() >= 3;
const float* busBL = hasBusB ? inputs[2].channelData[0] : nullptr;
const float* busBR = (hasBusB && inputs[2].numChannels > 1) ? inputs[2].channelData[1] : nullptr;
```

### Anti-pattern that burned us

```cpp
// DON'T: collapses to channels=1 in the test harness
const int channels = juce::jmin(numChannels_,
                                (int)inputs.size(),     // 1 in tests, 2 in plugin
                                (int)outputs.size());   // 1 in tests, 2 in plugin
// ...
outputs[idx].setSample(ch, i, inputs[idx].getSample(ch, i) * gain);
```
This version "works" in the plugin by accident (because `inputs[1].channelData[1]` points to the same 2-channel buffer as `inputs[0]`) but silently drops the right channel in tests, producing mysterious "precision error at sample N" failures.

---

## 5. Smoothing recurrences — match scalar sample-by-sample

Scalar DSP does per-sample state updates:
```cpp
for (int i = 0; i < n; ++i) {
    currentGain_ += (target - currentGain_) * coeff;
    out[i] = in[i] * currentGain_;
}
```

The naive SIMD port does **one** smoothing step per `run()` call and applies it to the whole block. That fails the test harness: at block size 256 the scalar has taken 256 steps while SIMD has taken 1. The test catches it around sample 16–64 as "precision error".

Two correct strategies:

### 5a. Closed-form (use for first-order IIR / exponential smoothing)

For `g_{n+1} = g_n + (T − g_n) · c`, let `a = 1 − c`. Then
`g_n = T + (g_0 − T) · a^n`.

In `prepare()`, precompute `powers_[k] = a^(k+1)` for `k ∈ [0, numLanes)` and `aPowLanes_ = a^numLanes`. In `run()`:

```cpp
const FltType powsVec = HWY::Load(_flttype, powers_.get());
float g = currentGain_;

while (samplesRemain >= numLanes) {
    // gains[k] = T + (g − T) · a^(k+1)
    const FltType gains = HWY::MulAdd(powsVec,
                                      HWY::Set(_flttype, g - target),
                                      HWY::Set(_flttype, target));
    for (int ch = 0; ch < channels; ++ch) {
        FltType v = HWY::LoadU(_flttype, in[ch] + offset);
        HWY::StoreU(HWY::Mul(v, gains), _flttype, out[ch] + offset);
    }
    g = target + (g - target) * aPowLanes_;          // advance by a^numLanes
    offset += numLanes; samplesRemain -= numLanes;
}
// partial last chunk: same gains vector, MaskedLoad / BlendedStore,
// advance g via powers_[samplesRemain - 1]
currentGain_ = g;
```

### 5b. Lane-serial smoothing (BitCrusher pattern — use when a closed form is hard)

Walk the lanes scalar-style inside the block and broadcast when the state stops moving:

```cpp
stateMask = HWY::Not(HWY::MaskFalse(_flttype));
for (int lane = 0; lane < sampleLaneCount; ++lane) {
    newState = HWY::MulAdd(HWY::Sub(targetState, currentState), smooth, currentState);
    if (lane > 0 && HWY::AllFalse(_flttype, HWY::MaskedNe(laneMask, newState, currentState))) {
        stateMask = HWY::SlideMaskUpLanes(_flttype, stateMask, sampleLaneCount - lane);
        break;  // remaining lanes stay at broadcast value
    }
    currentState = newState;
    // ...broadcast into per-param vectors via IfThenElse(stateMask, ...)
    stateMask = HWY::SlideMaskUpLanes(_flttype, stateMask, 1);
}
```

The early-exit is a real speed win when parameters are stable (the common case).

### 5c. Beware of rounding drift in per-lane subtractions

BitCrusher ran into this with its hold-counter: subtracting `holdInterval` out of all lanes in parallel diverges from scalar over time because each lane accumulates a different rounding trajectory. The fix: extract the lane that should be "authoritative," broadcast it, then re-add `laneNumbers − 1` to restore the per-lane offsets. See `BitCrusherNode_Highway.h:403-417` for the pattern. Use it any time you have a recurrence that can drift.

---

## 6. Lane-count changes — always check `HWY::Lanes()` in `run()`

`HWY::Lanes(tag)` can change across runtime dispatches (e.g., different test targets, or if a system reports a different best target after `prepare`). All aligned allocations sized against `numLanes` must be reallocated when this happens:

```cpp
HWY_ATTR void run(...) override {
    const size_t numLanes = HWY::Lanes(_flttype);
    if (numLanes != laneCount_) {
        prepare(sampleRate_);  // or a lighter `configure()` helper
    }
    ...
}
```

Track `laneCount_` as a member. Do the same check in `reset()` if it allocates.

---

## 7. Partial-block tail handling

Every block iteration follows the same pattern:

```cpp
while (samplesRemain > 0) {
    if (samplesRemain >= numLanes) {
        auto v = HWY::LoadU(_flttype, inPtr + offset);
        // ...compute...
        HWY::StoreU(result, _flttype, outPtr + offset);
        samplesRemain -= numLanes;
        offset         += numLanes;
    } else {
        const auto mask = HWY::FirstN(_flttype, samplesRemain);
        auto v = HWY::MaskedLoad(mask, _flttype, inPtr + offset);
        // ...compute...
        HWY::BlendedStore(result, mask, _flttype, outPtr + offset);
        // OR: HWY::StoreN(result, _flttype, outPtr + offset, samplesRemain);
        samplesRemain = 0;
    }
}
```

`MaskedLoad`/`BlendedStore` touch only the first `samplesRemain` lanes. `StoreN` is a write-only variant. Don't use plain `StoreU` on a partial tail — you'll corrupt the bytes past the buffer.

For recurrences where the tail must still advance state, either:
- use `HWY::ExtractLane(state, samplesRemain - 1)` to grab the authoritative last value, or
- apply a `samplesRemain`-sized closed-form advance (e.g. `powers_[samplesRemain - 1]`).

---

## 8. Useful Highway ops (curated)

| Op | When to reach for it |
|---|---|
| `HWY::Set(d, x)` | Broadcast a scalar to all lanes |
| `HWY::Iota(d, start)` | Per-lane `[start, start+1, ...]` — great for building `laneNumber_` offsets |
| `HWY::Load` / `HWY::LoadU` | Aligned vs unaligned load (buffer offsets are unaligned) |
| `HWY::MaskedLoad(mask, d, p)` | Partial load, unused lanes = 0 |
| `HWY::StoreU` / `HWY::BlendedStore(v, mask, d, p)` / `HWY::StoreN(v, d, p, n)` | Full / masked / first-N store |
| `HWY::MulAdd(a, b, c)` | `a*b + c` — prefer over `Add(Mul(a,b), c)` for FMA |
| `HWY::IfThenElse(mask, a, b)` | Lane-wise select |
| `HWY::FirstN(d, n)` | Build a mask for the first `n` lanes |
| `HWY::Compress(v, mask)` / `HWY::Expand(v, mask)` | Pack/unpack selected lanes to low end / from low end |
| `HWY::BroadcastLane<N>(v)` | Copy lane N to all lanes (authoritative-value trick) |
| `HWY::ExtractLane(v, i)` | Pull a lane out to scalar (runtime-indexed) |
| `HWY::Pow`, `HWY::Sin`, ... | In `manifold/highway/HighwayMaths.h` — slower than arithmetic, hoist out of inner loops |
| `hwy::Prefetch(ptr)` | Prefetch long-reach input pointers per iteration (BitCrusher) |
| `hwy::AllocateAligned<float>(n)` | Returns `AlignedFreeUniquePtr<float[]>`; use for every per-lane buffer |

---

## 9. Required parent-side changes

In `<Node>.cpp`:

```cpp
void MyNode::prepare(double sampleRate, int maxBlockSize) {
    // ... scalar-fallback state setup ...
    simd_implementation_ = std::unique_ptr<IPrimitiveNodeSIMDImplementation>(
        dsp_primitives::MyNode_Highway::__CreateInstance(
            static_cast<float>(sampleRate), numChannels_,
            &targetParamA_, &targetParamB_ /* , ... */));
    simd_implementation_->prepare(static_cast<float>(sampleRate));
}

void MyNode::process(const std::vector<AudioBufferView>& inputs,
                     std::vector<WritableAudioBufferView>& outputs,
                     int numSamples) {
    if (simd_implementation_) {
        simd_implementation_->run(inputs, outputs, numSamples);
        return;
    }
    // scalar fallback — used by the test harness baseline via disableSIMD()
    ...
}

void MyNode::setParamA(float x) {
    targetParamA_.store(x, std::memory_order_release);
    notifyConfigChangeSimdImplementation();   // calls simd->configChanged() if non-null
}

void MyNode::disableSIMD() { simd_implementation_.reset(); }  // required by test harness
```

In `<Node>.h`:
- Keep `targetParamX_` as `std::atomic<T>` members. These are the *single source of truth*; SIMD reads them via pointer.
- Forward-declare `IPrimitiveNodeSIMDImplementation` (or include `PrimitiveNode.h`).
- Expose `disableSIMD()`.

---

## 10. Scalar fallback — the test oracle, not dead code

`dsp_simd_test/TestNodesApp` constructs two instances of each node, calls `disableSIMD()` on one, and compares sample-by-sample with a tolerance (typically `0.01–0.025`). **The scalar path must produce the exact result the SIMD path is supposed to match.** If the scalar has a bug — e.g. the `inputs[idx].getSample(ch, ...)` anti-pattern from §4 — the comparison lies to you in both directions.

Rules:
- Use the same channel-access convention in scalar and SIMD (`inputs[0].channelData[ch]`).
- Read the same atomics the SIMD reads.
- Do per-sample smoothing scalar-style — no shortcuts. This *is* the reference.

Tolerances in test entries are tuned for expected float drift from reordered FMA / FMA-vs-mul-add, not for algorithmic divergence. If you need >0.03 to pass, the algorithms don't match — don't tune the tolerance, fix the SIMD.

---

## 11. Testing workflow

```bash
cmake --build /home/shamanic/dev/my-plugin/build-dev --target ManifoldTestNodesApp
/home/shamanic/dev/my-plugin/build-dev/dsp_simd_test/TestNodesApp/ManifoldTestNodesApp_artefacts/RelWithDebInfo/ManifoldTestNodesApp
```

Each node prints per-test `Base: X ns SIMD: Y ns Speed: Y/X`. Expect 1.1×–9× on simple kernels, sub-1× on complex kernels like BitCrusher with sidechain (still acceptable if correctness holds and it unlocks vectorization elsewhere).

### Add your node to the harness

1. New test-data function `template<> bool GetTestData<MyNode>(std::vector<NodeTestEntry>& out)` in `main.cpp` — cover mono, stereo, extreme-parameter, and any edge modes (muted, bypass, sidechain).
2. New `ConfigureNode(MyNode& node, const std::map<...>& params)` overload.
3. Call `TestNode<MyNode>(c_samplerate, c_blockSize)` from `main()`.
4. Add `<Node>.cpp` to `dsp_simd_test/TestNodesApp/CMakeLists.txt`.

Blockers: `c_blockSize = 256`, `c_samplerate = 44100`. If your node behaves differently at small blocks or high sample rates, add cases. Stereo Gain 0.5 was specifically the case that broke the one-step-per-block smoothing shortcut — include a "parameter differs from default" stereo test for every smoothed parameter.

---

## 12. Port checklist

- [ ] `<Node>_Highway.h` created with the multi-dispatch skeleton
- [ ] SIMD ctor takes `const std::atomic<T>*` for every parameter — **no duplicated atomics**
- [ ] `prepare()` computes coeffs from `sampleRate`, allocates per-lane buffers, captures `laneCount_`
- [ ] `run()` re-calls `prepare()` (or a `configure()` helper) when `HWY::Lanes()` changes
- [ ] `run()` uses `inputs[0].channelData[ch]` / `outputs[0].channelData[ch]` with `channels = min(numChannels_, inputs[0].numChannels, outputs[0].numChannels)`
- [ ] Smoothing matches scalar per-sample (closed-form or lane-serial with broadcast) — no one-step-per-block
- [ ] Partial-tail path uses `MaskedLoad` / `BlendedStore` or `StoreN`, and advances state correctly
- [ ] Scalar fallback in `<Node>.cpp` uses identical conventions to SIMD
- [ ] `<Node>.cpp` exposes `disableSIMD()` and forwards `setXxx()` through `notifyConfigChangeSimdImplementation()`
- [ ] `<Node>.cpp` added to `dsp_simd_test/TestNodesApp/CMakeLists.txt`
- [ ] `GetTestData<MyNode>`, `ConfigureNode(MyNode&, ...)`, and `TestNode<MyNode>` call added to `main.cpp`
- [ ] Tests cover stereo + non-default smoothed parameters
- [ ] `cmake --build build-dev --target ManifoldTestNodesApp` clean, harness passes

---

## 13. Lessons from the Gain port, condensed

The Gain node failed in three ways at once. Each one is a named trap above:

1. **Duplicated atomics** → SIMD never saw `setGain()` / `setMuted()`. Fix: ctor takes `&parent.targetGain_`, `&parent.muted_`. (§3)
2. **One-step-per-block smoothing** → scalar did 256 steps, SIMD did 1, diverged at sample ~16. Fix: closed-form `g_n = T + (g_0 − T)·a^n` with precomputed per-lane powers. (§5a)
3. **`inputs.size()`-based channel count** → tests have `inputs.size() = 1`, so `channels = 1`, so only L was processed on the scalar baseline — which *also* corrupted the SIMD comparison because the baseline was wrong. Fix: use `inputs[0].channelData[ch]`. (§4)

All three were trivial once identified. The common root is "copy a pattern that looked right and skip reading how the test harness and graph runtime actually call the node." Read both call sites once before porting. The five minutes saves hours.
