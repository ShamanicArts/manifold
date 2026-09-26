# Checkpoint 35 · Browser MIDI permission feedback

Open [Voice synth](http://127.0.0.1:4173/?primitive=voice) or [Sample instrument](http://127.0.0.1:4173/?primitive=sample-instrument). Each view has an explicit **Request MIDI access** button and a direct link for testing the same view in an external browser.

The button calls `navigator.requestMIDIAccess({ sysex: false })` on click. A browser test with a stubbed Web MIDI API confirmed the call, successful input state, and status update. In the embedded browser, the request remained pending with no result. The page now changes its status after four seconds to explain that it is waiting for browser permission and points to the external-browser link. It leaves the pending request in place so a later user permission decision can still resolve it.

The embedded browser test confirmed the new waiting status and direct Voice URL. The on-screen keyboard remains usable without Web MIDI. Actual hardware device delivery through the embedded browser remains unverified; the browser permission response is outside the Manifold audio graph.
