# Main rack scalar CV migration boundary

This slice uses the old Main rack's Lua scalar module formulas as behavior references. The browser loads only JavaScript and Rust/Wasm; no Lua runtime or importer runs in v2. The original UI updates these modules in its control loop. The v2 graph evaluates the same kinds of operations at each audio sample, which changes their timing and makes modulation independent of visual frame rate.

`AttenuverterBias` has one typed CV input and output. Amount and bias are parameters 0 and 1, each clamped to −1…1. Its output is `clamp(input × amount + bias, −1, 1)`. Negative amount inverts. It has no hidden normalization or smoothing.

`SampleHold` has a source CV input on port 0 and a trigger CV input on port 1. Parameter 0 selects sample on a rising trigger above 0.5, track while the trigger is high, or twelve-step quantized sample on a rising trigger. Its held value starts at zero; mode changes preserve the held value and trigger state. The quantizer rounds the normalized bipolar range onto twelve intervals. The graph processes source and trigger for the same sample before deciding whether to capture it.

`CvMix` accepts four typed CV inputs. Parameter IDs 0–3 are independent unipolar 0…1 levels, and ID 4 is a bipolar offset. Each input is clamped to −1…1; the sum plus offset is clamped to −1…1. Unconnected input ports receive zero. The project uses two ports and leaves two available for later patch editing.

The authored `CV rack slice` composes source and trigger LFOs, SampleHold, AttenuverterBias, a second free-running LFO, CvMix, ModulatedGain, and an audio oscillator. Live browser readouts poll the held, scaled, and mixed CV values plus effective gain at 10 Hz. These are bounded snapshots; they do not control the audio path. Six native Rust/Wasm cases compare audio and all four stage meters after every block, including mode changes, inversion, bias, mix polarity, and 64-frame blocks. This is cross-target composition evidence, not C++ project parity or preset compatibility.

The current graph remains fixed while audio runs. The outstanding patching work is user-editable connections with prepared plan replacement, explicit state continuity rules, a readable patch view, and base/effective parameter overlays. The four-input mixer and typed ports provide the DSP contract for that work.
