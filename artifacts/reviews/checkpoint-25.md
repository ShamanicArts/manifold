# Review checkpoint 25: inspectable MIDI events

Date: 2026-09-26. Open the [Voice synth](http://127.0.0.1:4173/?primitive=voice), start the instrument, and play its on-screen keyboard or A–K shortcuts. The **Recent note events** list shows up to six note on/off messages with note name and number, channel, velocity, and source. It is an inspection view; the audio event path still goes directly to the worklet.

The hardware button now says **Request MIDI access** to make its action explicit. It calls the browser API on click when Web MIDI is exposed and allowed by page policy. A simulated policy block disabled the button and displayed the reason. A simulated connected input showed messages while audio was stopped as *received only*; with audio running, its channel and velocity appeared as forwarded events. Keyboard C4 generated on/off rows on channel 16 without any MIDI permission. These tests do **not** establish that the in-app browser can grant physical MIDI access; the on-screen keyboard remains the test path there.

The workbench still has **118 matching offline cases**. This checkpoint changes the Voice diagnostics and copy; the Rust audio kernel and fixtures are unchanged. The host Chromium compositor issue from [checkpoint 23](checkpoint-23.md) still prevents a reliable screenshot capture here, so the live served page is the review artifact.
