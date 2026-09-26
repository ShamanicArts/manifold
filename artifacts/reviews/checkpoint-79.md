# Checkpoint 79 · measured old graph-swap mechanics

The [C++ probe](../../tools/legacy-graph-swap-probe.cpp) compiles the old checkout's `PrimitiveGraph.cpp`, `GraphRuntime.cpp`, and Gain, Passthrough, and StereoDelay nodes read-only. Run [the capture script](../../scripts/probe-graph-swap.py) to regenerate the [metrics](checkpoint-79-graph-swap-metrics.json).

At 48 kHz with 128-frame blocks, a closed Gain gate passed zero. Setting its target to one and processing without recompiling gave first-sample gain **`0.00208116462`**, the start of its 10 ms smoothing. Compiling a new `GraphRuntime` after the same target change gave first-sample gain **`1.0`**, because `prepare` initializes current gain from target. This confirms a real boundary missing from the prepared isolated Chorus/Delay fixture.

The delay test then sent an impulse into a 40/60 ms StereoDelay and swapped runtimes before its first echo. With unchanged topology, the new runtime transferred one explicit continuity state and produced a tail peak of **`0.49`**. A further swap inserted a Gain before the same delay node: explicit transfer count fell to zero, yet the tail peak was **`0.238`**. The reused node retained its delay buffer even without an explicit transfer. This measured case narrows the source audit's state-reset concern; it does not prove every effect retains its state or that the full old slot switch matches v2.

This probes the actual old C++ graph compiler and processor, but creates the graph directly in C++. It does not invoke the Lua binding or host's deferred worker. Next: capture the full Chorus/Delay branch and switching sequence through the graph runtime, then test the Lua/deferred-worker path if the full route differs.
