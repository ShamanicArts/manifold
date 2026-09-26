# Checkpoint 45 · Browser MIDI frame scheduling

Open the [Voice workbench](http://127.0.0.1:4173/?primitive=voice). **Request MIDI access** still requires a browser that grants Web MIDI permission; the in-app browser may block that permission. The MIDI section shows a selectable address for opening Voice or Sample instrument in an external browser. The [browser MIDI run](checkpoint-45-browser-midi.json) records a synthetic granted device playing E4 note on and off while the instrument ran.

## Implemented

- Hardware MIDI input forwards `Event.timeStamp` with each note. The browser maps the performance clock to AudioContext time, adds 12 ms lookahead, and sends an absolute audio frame to the AudioWorklet. It uses `getOutputTimestamp()` when available and a `currentTime` fallback otherwise.
- The AudioWorklet keeps 256 event slots prepared outside `process()`. It orders events by frame, sends due events to Rust at within-block offsets, and clamps late arrivals to offset zero. All-notes-off cancels pending events for its target so they cannot sound after a stop. Keyboard notes keep their immediate next-block behavior.
- The MIDI section displays a selectable absolute URL for the selected instrument, so an embedded-browser user can open the same view externally. Worklet event errors now appear in the workbench status after audio is ready. The [event contract](../../docs/event-contract.md) records the timestamp mapping and its limits.

## Verification

- `node scripts/verify-midi-scheduling.mjs`: clock mapping, fallback, 128-frame boundary, sample offsets, same-frame order, late clamp, and target-scoped all-notes-off passed.
- Synthetic Web MIDI browser run: one permission API call, one connected input, note on/off forwarded while audio ran, no page errors. Both instrument URLs fit a 390 px viewport without horizontal overflow. This exercises the app path without claiming hardware access in the in-app browser.
- Production web build passed. The full browser sweep still reported **176 Match** cases across 27 views with no page errors.

## Boundary

Browser scheduling preserves frame offsets for events delivered with enough lead time. Hardware delivery jitter, output latency, and device clock behavior need measurement in an external browser with a real MIDI device. Sustain pedal and other controllers remain outside this slice.
