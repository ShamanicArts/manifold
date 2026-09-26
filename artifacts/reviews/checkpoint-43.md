# Checkpoint 43 · Chorus in the Standalone FX slot

Open the [Standalone FX slice](http://127.0.0.1:4173/?primitive=standalone-fx). Start audio, select **Chorus**, raise **Wet mix**, and move rate, depth, feedback, spread, and voices. Switch to another type and back to hear the old Chorus delay tail clear. In **Offline comparison**, choose **Chorus rate and depth**; its [stereo overlay](checkpoint-43-chorus-slot-wave.png) and [sample difference](checkpoint-43-chorus-slot-difference.png) compare native Rust with Rust/Wasm.

## Implemented

- Added historical effect type **0** to the prepared swappable slot. Its five normalized controls map to the physical Chorus parameters from the old Lua definition; the slot uses the old 1.4 wet gain and keeps sine waveform with a fully wet internal Chorus.
- Switching into Chorus restores its saved normalized controls, resets its phases, and invalidates the prepared delay ring through generation tags. The selection path performs no ring allocation or full buffer clear.
- Added three slot cases for Chorus modulation and switches between Chorus and other effects. The slice now offers five types and 16 native Rust/Wasm cases.

## Verification

- `cargo test --workspace`: 62 core tests passed, including Chorus slot mapping and delay invalidation on reconfiguration.
- `python3 scripts/check-chorus-parity.py`: all seven standalone C++/native Rust cases still agree at float32 precision.
- Browser: all 16 slot cases reported **Match**. Live audio continued after selecting type 0, with the five relevant controls visible and no page errors. The Chorus modulation capture differed by at most **7.23e-7** in the browser.
- Rust/Wasm and production web builds passed. The full browser sweep reported **173 Match** results across 27 views with no page errors.

## Boundary

The slot cases compare native Rust with Wasm. The standalone Chorus primitive has C++ sample parity, but this does not establish exact legacy project routing or preset parity. The old Chorus voice mapping requests up to six before the C++ setter clamps it to four; this slice preserves that behavior.
