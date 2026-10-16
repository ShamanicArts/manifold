# Studio input switching and Nacre clipping — 11 October 2026

Studio input changes disconnected the source before `BrowserGraphHost.connect`
could detach its owned connection. WebAudio then threw “the given destination
is not connected”, preventing switches and subsequent returns to the old input.
The host now owns that connection change; Studio retires the detached source
afterward. Microphone acquisition and file decoding prepare a candidate before
switching. Generation checks release late microphone streams and ignore stale
decodes after another selection or Stop. Failed preparation restores the selected
input, and a canceled file chooser retains the current selection. Program routing
also retains the microphone gain stage. No DSP or callback code changes.

The Nacre hand defect reproduces at low Grain values, which tilt its image plane
behind the cabinet background at z=0.176. Turning off only the cabinet artwork
revealed 4,259 covered samples out of 8,294 otherwise opaque hand pixels at 20 ms.
The hand's wrist position now maintains clearance for its transformed corners;
depth testing against the socket and control deck stays enabled. This is in the
authored Nacre view, regenerated into the example, portable package and linked
Prism Bend document. The same test then found zero covered samples at 20 ms.

The removed synaptic/reliquary bridge has no remaining mesh, material or texture
loader in the current scene. Its removal was not authorized: the original user
instruction added a shell creature on the circle, while prior feedback explicitly
liked the existing structure. That composition correction is recorded in
[Nacre art direction](nacre-art-direction.md#shell-creature-on-the-field-rim).
This repair does not restore or further rearrange the composition.

## Checks

Both review scripts use a leased BB automation tab via
`MANIFOLD_REVIEW_CONNECTION=/path/to/private-connection.json`. Optional
`MANIFOLD_REVIEW_URL` chooses another Studio origin.

- `node web/review-studio-input-switch.mjs`: repeated round trips between Saw,
  Noise, Silent, File and microphone, with measured output and a working Stop /
  Start cycle. Failed and late microphone requests are covered. Microphone uses
  a generated real MediaStream; no physical microphone is opened. Output uses
  WebAudio's silent sink and monitor gain zero, checked by the script. All 24
  recorded cases passed with no runtime exceptions. An earlier diagnostic run
  failed its sink assertion after a navigation discarded the override; it was
  stopped and excluded from the successful private-output evidence.
- `node web/review-nacre-occlusion.mjs`: actual rendered pixel comparisons across
  three grasp poses and five Grain settings (15–300 ms). All 15 cases passed;
  at most one sampled pixel exceeded the difference threshold, compared with
  thousands before the fix. No audio starts. Temporary scene probes are removed
  and the original authored source restored after review.
- Generated source and primitive-package freshness, document-switch and gesture tests (4),
  and web production build pass. The unchanged native DSP/runtime is not rebuilt
  for these JavaScript host and authored presentation changes. Native artwork
  parity remains subject to the previously recorded host limitations.

Evidence: [corrected hand](../../web/public/studio/2026-10-11-regressions/hand-fixed.jpg),
[input results](../../web/public/studio/2026-10-11-regressions/input-results.json),
[hand results](../../web/public/studio/2026-10-11-regressions/hand-results.json).
