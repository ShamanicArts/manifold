# Checkpoint 66 · Granulator preloaded source

Review the [Granulator workbench](http://127.0.0.1:4173/?primitive=granulator), [file-source screenshot](checkpoint-66-file-source.png), [Granulator comparison screenshot](checkpoint-66-granulator.png), [comparison metrics](checkpoint-66-metrics.json), and [file-picker metrics](checkpoint-66-file-metrics.json).

Granulator now accepts decoded stereo PCM through the existing prepare-time sample upload ABI. The browser file picker accepts audio up to 30 seconds and 32 MB, exposes source start/end controls for a selected file, and returns to live capture when the file is cleared. Rust owns the loaded source without locking or allocating in `process_planar`; if its sample rate differs from the graph rate, it resamples during upload. The running file-source test used a one-second WAV and showed a nonflat output spectrum.

Three new C++ cases exercise the original `copyFromCaptureBuffer` source path, region and position changes, and pitch and envelope changes. All **11 Granulator C++ cases** match Rust/Wasm; the largest maximum sample difference remains `2.38e-7`. All **79 Standalone FX slot cases** match, and the full browser sweep passes **373 cases across 43 views** with zero page errors. The browser file test loaded and played a WAV, kept the clear control disabled while running, and hid source-region controls again after clearing. All 86 Rust workspace tests and the Wasm and web builds pass.

The C++ runner uses zero spray and a constant random draw for repeatability; v2 nonzero spray is seeded. Standalone FX type 11 still uses its live capture ring. Direct transfer of a Loop Capture take into Granulator, adjustable ring duration, exact Standalone FX project routing, and preset roundtrips remain separate work.
