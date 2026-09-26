# Checkpoint 95 — browser MIDI permission path

The Voice, MIDI Transpose, and Sample Instrument views already call `navigator.requestMIDIAccess({ sysex: false })` when **Request MIDI access** is clicked. The call is gated by secure context, Web MIDI availability, and the page's MIDI permissions policy. An in-app browser that blocks MIDI cannot grant access from this page.

The Hardware MIDI panel now says when to click the request button and offers a **Copy URL** action for opening the current instrument view in a browser that supports Web MIDI. If clipboard access is blocked, it selects the URL for manual copying. The panel no longer describes a new in-app tab as an external browser.

Verified: `node scripts/test-midi-input.mjs` passes, `npm run build` passes, and the local server at `http://127.0.0.1:4173/` serves the updated panel. Hardware permission and device input need a browser and device that grant Web MIDI access.
