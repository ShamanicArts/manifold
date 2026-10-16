# Rack Sample historical C++ / native Rust / Wasm workload comparison

29 September 2026. This is an **offline workload comparison**, not audio-output
parity or a device callback guarantee. The historical source was built read-only
from revision `d56a1ec73887c727e692d1e640f8e3199f904619` into
`/tmp/manifold-legacy-sample-perf-build`. The v2 repository owns the separate
[C++ harness](../../tools/legacy_rack_sample_bench.cpp) and its
[build/runner](../../scripts/bench-legacy-rack-sample.py); neither changes the
historical checkout.

All three runs use the same [portable fixture](../../projects/graph-workspace/authored-rack-sample-eight-voice-unison3.json)
(SHA-256 `a808788ab472f9793186aaa6a876b46f44b1a821c4a110bee08fa9876d30884b`):
48 kHz, stereo 4,800-frame PCM, eight Sample Region → Phase Vocoder → Gain
chains, unison 3, detune 38 cents, spread 0.6, crossfade 0.1, order-11
vocoder at full wet mix, output through a nine-input mixer, and note-on on all
eight voices every 32 blocks. Each run has 128 warmup and 2,048 measured
blocks of 128 frames. The budget is 2,666.67 µs per block. The C++ graph has
26 compiled DSP nodes and 25 routes. The portable Rust/Wasm project also has
an explicit input and output node (28 total nodes, 26 connections). The old
C++ Sample copies the PCM into each playback node; v2 shares one prepared
source. The engines use distinct DSP implementations and hosts.

| Offline metric, median of three runs | Historical C++ | Native Rust | Node/V8 Wasm worklet simulation |
| --- | ---: | ---: | ---: |
| p50 block | 119.5 µs | 120.4 µs | 138.2 µs |
| p95 block | 2,172.5 µs | 2,022.5 µs | 2,670.2 µs |
| p99 block | 2,302.6 µs | 2,175.1 µs | 2,766.3 µs |
| max block, median of run maxima | 3,032.1 µs | 2,779.6 µs | 3,480.6 µs |
| blocks over budget, range per run | 2–5 | 2–3 | 99–188 |
| output checksum, first run | 382.762 | 382.753 | 382.776 |

The Wasm simulation's p95 is about 23% above the historical C++ p95 and just
above the block budget. Rust's p95 is about 7% below C++. Each value is a sequential
wall-clock measurement on this Ryzen 9 3900X; OS scheduling and V8 can affect
the tail. In particular, a budget miss here indicates a risk to investigate,
while a run without misses does not prove real-time safety.

The first matched workload exposed a 10.9% C++/Rust checksum difference. A
[dry block trace](evidence/2026-09-29-rack-sample-legacy-cpp-dry-trace.json)
against the [native/Wasm dry trace](evidence/2026-09-29-rack-sample-native-wasm-dry-trace.json)
showed the difference after every retrigger, fading over the first ~27 blocks.
The historical Sample Region sets secondary unison voice gains to zero on
trigger, then smooths them toward one with an 8 ms time constant. The v2
primitive had started all secondary voices at full gain. The reusable Rust
Sample Region now implements that trigger envelope. Its
[new dry trace](evidence/2026-09-29-rack-sample-native-wasm-dry-ramp-trace.json)
has C++/Rust checksums 626.485/626.470 (0.0023% apart), with a maximum
per-block absolute-sum difference of 0.00165. Rust and Wasm block sums are
identical in that dry trace. With the full vocoder, C++/Rust/Wasm checksums
are now within 0.006% of each other. This is strong evidence for this one
repeated-trigger signal, not general C++ project parity. C++ preparation,
native preparation after JSON parse, and Wasm worklet initialization cover
different setup work and are recorded without treating them as like-for-like.

The [current C++ raw runs](evidence/2026-09-29-rack-sample-legacy-cpp-ramp-comparison.json) retain
the old revision, kernel hashes, compiler, fixture and harness hashes. The
[current native/Wasm raw runs](evidence/2026-09-29-rack-sample-ramp-native-wasm.json)
retain the native binary and Wasm hashes, exact fixture hash, setup timings,
per-run timing distribution, and checksums. Both runners are repeatable:

```sh
cmake -S /home/shamanic/dev/my-plugin -B /tmp/manifold-legacy-sample-perf-build -DCMAKE_BUILD_TYPE=Release -DCMAKE_EXPORT_COMPILE_COMMANDS=ON
cmake --build /tmp/manifold-legacy-sample-perf-build --target GraphRuntimePerfHarness -j4
python scripts/bench-legacy-rack-sample.py --output docs/rearchitecture/evidence/2026-09-29-rack-sample-legacy-cpp-ramp-comparison.json
cargo build --release -p manifold-native --example bench_authored_graph
./scripts/build-wasm.sh
node scripts/bench-authored-graph-native-wasm.mjs docs/rearchitecture/evidence/2026-09-29-rack-sample-ramp-native-wasm.json --fixture=projects/graph-workspace/authored-rack-sample-eight-voice-unison3.json --all-sample-voices --vocoder
```

Next measurement gates: profile and reduce Wasm's hop-aligned order-11 spikes; repeat
on a real AudioWorklet and native plug-in callback under representative host
load and multiple instances.

The [live Rack page](https://wubulon.tailfac9f9.ts.net:4173/rack-filter-eq.html)
was rebuilt with the corrected Wasm primitive. A headless Chromium run on a
verified private null sink started the authored graph, selected Sample, set
unison to three and voice 1 gate to 100%, then read those accepted controls
back from the portable project. The [screenshot](evidence/web-rack-sample-unison-ramp-live.png)
shows the running page and named graph processors. There were no page errors;
the H6 retained its two preexisting streams and the private sink was removed.

## Follow-up FFT work

The prepared FFT now has separate compile-time forward and inverse paths, and
synthesis uses one `sin_cos` call for each bin's phase. The
[retained offline run](evidence/2026-09-29-rack-sample-fft-direction-native-wasm.json)
keeps the exact native/Wasm checksums above. Across three runs, Wasm median
p95 moved from 2,670 to 2,633 µs, and budget misses from 99–188 to 19–75
per 2,048 blocks. The [intermediate `sin_cos` run](evidence/2026-09-29-rack-sample-sincos-native-wasm.json)
is retained for the separate change. A guarded `sqrt(re²+im²)` magnitude path
was [measured](evidence/2026-09-29-rack-sample-fast-magnitude-native-wasm.json)
at 2,690 µs p95 and changed the checksum; it was rejected. Build artifact
hashes after reverting it match the retained FFT run. Sequential offline
timings vary, and the retained version still has p99 above the deadline.
