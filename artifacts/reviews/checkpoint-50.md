# Checkpoint 50 · Effective EQ response

[Open the EQ8 workbench](http://127.0.0.1:4173/?primitive=eq8) · [Visual review](checkpoint-50-eq8-response.png) · [Browser response check](checkpoint-50-browser-response.json)

The EQ8 workbench now plots the effective magnitude response from 20 Hz to 20 kHz. The curve comes from the Rust kernel's current biquad coefficients, band enable states, output gain, and dry/wet mix. A read-only Wasm query returns a decibel value for one frequency. The AudioWorklet samples 64 logarithmic frequencies into a fixed typed array every 250 ms and sends the snapshot to the page; Canvas draws it off the audio path. No extra processing or allocation was added to `Eq8::process_planar`.

The browser check observed a flat 0 dB response with all bands off, then approximately −0.8 to +12.8 dB after enabling a 60 Hz low shelf with +12 dB gain. The response status changes to *last captured* when audio stops. Rust tests verify neutral response, a low-frequency boost, dry mix, and invalid-frequency handling. All 69 Rust workspace tests passed; the Wasm and web builds passed; all 189 offline comparison cases across 28 views still showed **Match** with zero page errors.

The response is an effective transfer estimate for the current coefficient state, not a measurement of a microphone or the live program material. It is bounded to 64 points and may skip frames independently of audio rendering.
