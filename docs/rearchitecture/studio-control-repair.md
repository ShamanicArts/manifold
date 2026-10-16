# Studio audio access and parameter interaction

Delivered 13 October 2026.

Audio Start/Stop and the final Master listening level are in Studio's top
application bar. Selecting a root Live input also exposes the host hardware
selector in its Inspector. Hardware remains available in Settings. These controls
do not add generators or routing to the authored Device.

Browser Studio was awaiting each parameter acknowledgement inside its workspace
frame loop. Pointer changes therefore accumulated behind old writes instead of
reaching the existing gesture coalescer. The workspace now drains commands before
receiving its next presentation snapshot, sends pointer intent immediately, and
continues painting while publication completes. Structural commands retain their
ordering. Native Studio overlays the existing `ParameterGesture` state on its
workspace controls every frame, including while an older write is acknowledged.

The shared filled slider now calculates the pointer value before painting it,
responds on pointer-down, and rounds only explicitly discrete parameters during
a drag. Long labels elide before the displayed value. Numeric text formatting and
keyboard increments remain separate from the continuous pointer value. Parameter
revisions no longer invalidate graph positions. Unchanged embedded-pane placement
does not repeatedly rewrite DOM styles.

`workspace.inspect` reports the latest painted control rectangles and values,
alongside accepted parameter values. Pending pointer intent is still transient;
accepted project state, saving, undo and audio publication retain their owners.

Standalone listening starts off. Its audio toggle gates the final output while
preserving the Master value; the processing callback continues to acknowledge
live edits when listening is off. Browser Start/Stop starts and closes its audio
host. Neither host sends automated review audio to physical speakers.

## Verification

- The command-pump regression holds an audio acknowledgement while sending newer
  positions: every position paints immediately, the old receipt cannot pull it
  backward, and only the newest pending target is subsequently published.
- The egui pointer test checks same-frame pointer-down and fractional drag values.
- `web/review-studio-controls.mjs` uses an owned BB browser tab, a verified null
  sink and generated microphone input. It exercises Nacre's graph and Inspector
  with real pointer events, delays parameter acknowledgement by 160 ms, verifies
  audio through Nacre, checks Live input hardware access, and cycles audio off/on.
- An isolated native Xvfb review exercises the source graph's frequency control
  in both graph and Inspector and clicks the audio toggle through an off/on cycle.
  Its PulseAudio stream is verified on the private null sink.
- 573 Rust workspace tests and 194 web tests pass. The final shared-widget test
  also passes after the pointer-down and label refinements. Native release, UI
  Wasm and production website builds pass.

Actual captures, signal measurements and pointer samples are retained at
`~/.cache/manifold/control-repair-20261013/`. These checks prove pointer-value and
acknowledgement behavior; they are not a universal frame-rate guarantee for
arbitrary authored renderers or browser hosts.

The subsequent [Input graph delivery](studio-device-audition.md) implements the
separate Studio test graph and excludes it from the Device export.
