# V02: live authored StandaloneOsc delivery

This increment integrates the original StandaloneOsc/Rack oscillator into the
shared creator. V02 and the complete port remain open.

Live browser product: <https://wubulon.tailfac9f9.ts.net:4174/oscillator.html>.
Start audio, raise **Manual → Level**, then edit the face or highlighted source.
The legacy manual level starts at zero. Retained and egui project the same
Source, Unison, Additive and Manual groups. The output scope reads actual audio.

## One authored graph and controller

`@manifold/author/examples/standalone-oscillator` exports editable creator source.
Its factory and control mapping are generated from the existing public
`rack-oscillator.mjs`, rather than independently reconstructed. The graph has
eight voice oscillators plus the manual oscillator, mixer9 and output gain,
47 original controls, and 15 controls on the shared face. Waveform and drive-shape
choices retain the original enumerations.

`LiveProjectRuntime` now accepts source returning `onControl(session,path,value)`.
A control mapping receives a candidate-only session with `toProject`,
`parameterWithControl` and `parametersWithControl`. It maps a project control to
prepared DSP targets synchronously, outside the audio callback. Public
`control.set` and `control.batch` validate values, stage a graph fork, resolve
changed targets, await the existing host acknowledgement, then accept that fork.
Host rejection leaves the source, graph, controls and revision unchanged.

The existing publication bound remains 16 DSP targets per atomic request.
A global oscillator control fans out to nine nodes. Independent global gestures
are coalesced and published individually; an oversized structured batch is
rejected before touching audio. Endpoint batches such as Filter XY stay atomic.
The transient gesture overlay also supports controls in retained, browser egui
and native egui. It does not become a second project or audio state owner.

Compatible source changes retain unchanged control values and node targets;
save/open and authored undo retain source and mapping. Native QuickJS and the
browser execute the same creator runtime. The Filter and oscillator native
controllers reuse one `createLiveCreatorProject` host adapter.

## Evidence and limitations

Browser interaction exercised an actual retained pointer drag, actual egui
pointer drag, external HTTP agent unison edit, highlighted editor source edit,
and Save/Open while Rust audio was running. The accepted global unison target
was read back from all nine sounding nodes. The first development attempt failed
because bundlers rename identifiers in `Function.toString()`; the portable source
is now generated from the actual library file, with a build-time freshness gate.
The initial failure is not counted as successful evidence.

The native callback test checks a nine-node acknowledged unison transaction,
nonzero oscillator output, saved controller/hash and fresh-runtime UI/audio
recall. Filter native lifecycle tests and TypeScript checks also pass. Native
pointer/audio review passed in `native-v3`: a real egui drag accepted level 0.77,
release matched the later same-position click, Save/Open and a new executable
launch retained the controller and source, and recorded audio RMS was 0.002124.
`native-v1` and `native-v2` failed automation setup and are not acceptance evidence.

- Browser report: `web/public/oscillator-delivery/2026-10-01/browser-report.json`.
  A real CodeMirror edit inserted a gain node while audio ran; Save/Open retained
  that 14-node graph and all nine unison targets. The prepared Rust host reported
  no processing failures or callback allocations. This is not a glitch-free proof.
- Native recording: `native-v3/live-native.mp4` under the same public directory.
- Native package: `Manifold-oscillator-linux-x86_64-r1.tgz`, 74,236,223 bytes,
  SHA256 `65a10dda95919f40ca560af5d1f71c1423bec4dce3fd36e4abe47e712056ddf4`.
  It contains the exact unstripped development executable reviewed by native-v3,
  edited and original controller packages, source, audio/video and per-file hashes.
- `cargo test -p manifold-project-js -p manifold-ui`, TypeScript checks, authored
  control acknowledgement/rejection tests, Wasm UI and production browser builds
  passed.
Successful builds alone do not prove UI, sound, DAW or legacy parity.

The legacy waveform preview, exact face colors/spacing, Main Wave composition,
keyboard and hardware MIDI, ADSR workflow, native/DAW event scheduling, native
CLAP/VST3 oscillator interaction and C++ performance/fidelity comparison remain
open. The original `main-voice-control.mjs` already ports Main's allocation and
control-side envelope orchestration; integrate that behavior into the creator
with an explicit control clock independent of rendering. Do not replace the
public authored oscillators with a fixed product-specific voice engine.

## BB browser connection correction

Codex's `iab` connector failed discovery; BB's browser was available through
`bb browser instances/create/acquire/connection/capture`. The actual oscillator
was opened there, and `bb-retained.jpg` captures it running. Do not report a
connector failure as product/browser unavailability. Release browser control when
the user is reviewing; keep automated audio on the private sink.

## Playable keyboard increment (0.2.0)

Open <https://wubulon.tailfac9f9.ts.net:4174/instrument.html>. This separate saved
project key preserves the earlier oscillator editor's local edits. Start audio,
click the keyboard, then play **A/D/G** together. Source, Unison, Additive, Manual,
ADSR and Play are shared component groups in retained JS and egui. Manual Level
remains the original independent manual voice.

The original eight authored Rack oscillators now feed eight reusable core `adsr`
primitives. Allocation reuses `chooseMainVoice` from the original Main control
port: idle first, quietest releasing voice next, oldest held voice last. Sample
processing and envelopes run in Rust. Project `onEvent(session,event,state)` maps
notes, velocity, sustain and panic to atomic acknowledged target batches outside
the callback. `event.send` commits its finite JSON state only after acknowledgement;
source edits, undo, portable save/restore and native QuickJS keep that state.
An explicit `eventStateSchema` identifies compatible controller state. Elapsed
control time estimates release levels for allocation only; it does not run audio
or depend on UI repaint. Exact legacy envelope/allocation fidelity remains open.

Browser MIDI is a device adapter to that same event contract. Connect MIDI asks
for actual browser MIDI permission and presents actual inputs. Device selection,
pedal CC64, velocity-zero note-off and all-notes-off decoding are implemented.
No physical MIDI device has been exercised. Channel-scoped all-notes-off and
native/DAW MIDI routing remain work for the next increment.

### Actual delivery evidence

All following files are under `oscillator-delivery/2026-10-01/keyboard-v1/` on the
same live server:

- `browser/report.json`, `browser/retained-full.png`, `browser/egui-full.png` and
  `browser/browser-chords.flac`: the actual BB in-app browser played chords in
  both renderers. A live source edit added gain node 22 with all three notes held.
  A real egui sustain drag read back its target from all eight sounding envelopes
  before pointer release. Recorded RMS 0.011217, final half-second RMS zero. The
  processor reported no callback allocations or processing failures. The browser
  control connection subsequently disconnected; repeated discovery returned no
  desktop instances. This does not imply that the browser/platform is unsupported.
- `native/report.json`, `native/live-native.mp4`, `native/native-held.png` and
  `native/native-envelope.png`: actual native egui pointer/keyboard input, held
  notes through a graph edit, ADSR pointer changes before release, real Save/Open
  buttons and new-process startup recall. Private-sink audio RMS 0.0018845 and
  completed-release RMS zero. The exact reviewed development binary SHA256 is
  `d0d7ca2a75de8ed6f14f1b9f37bf960972fc60f57be7bb18b8009f9af298b01f`.
  Failed reviews v1–v8 remain scratch material and are not accepted evidence.
- `imported/report.json`, `imported/instrument.png`, `imported/chords.flac`: a
  separate Vite application imports only the public packages, plays a real UI
  chord, accepts a live source edit with three notes held and releases to silence.
  This review used isolated headless Chromium, not BB. Its live application is
  <https://wubulon.tailfac9f9.ts.net:4174/examples/instrument-import/> and its source
  is `examples/instrument-consumer`. No copied processor or internal Main API.
- `Oscillator.package.manifold.json` is the self-contained native controller and
  graph package. `Manifold-oscillator-linux-x86_64-r2.tgz` in the parent directory
  contains the exact reviewed executable, original and edited packages, source
  and actual native recordings. SHA256
  `02252587745dafe88e59bc52a9fe13b90ab111de447f77d6356af625f8eb25f9`,
  75,554,999 bytes. Earlier r1 delivery remains available.

Native source preparation measured 304.9 ms in the development callback test;
actual native GUI source preparation plus publication measured 501.5 ms. A 250 ms
script limit was rejecting legitimate compilation; authoring calls now receive
the same bounded two-second control budget as initial loading. Note/parameter
calls retain 250 ms. Compilation stays outside audio processing. Browser prepared
compilation/publication measured roughly 1.2/15–17 ms in these runs. These are
separate scenarios and profiles, **not a fair performance comparison**. Native
control latency, optimized builds and bounded C++/Rust/Wasm comparisons remain open.

Other fixes found by real integration: ADSR target readback; retaining gate targets
through native processing reset; quick-click egui keyboard focus; bounded event
metadata validation; accepting pure event bookkeeping without an audio publication
while rejecting unpublished graph/source/schema/parameter changes. Native held
cold-recall audio and release tests pass. The shared catalog/package freshness,
TypeScript and 80 browser tests, plus project-JS/UI tests, passed for this increment.

This delivers a playable shared creator increment. Main Wave composition, exact
legacy face/preview, hardware MIDI, native/DAW scheduling, CLAP/VST3 oscillator
interaction and the full port remain open. Recorded continuity is not a
sample-accurate glitch-free proof.

### Optimized native update 3

The exact optimized executable passed the same actual native egui/audio review:
keyboard chord, held notes through the source edit, envelope drag acknowledged
before pointer release, Save/Open and fresh-process recall. Source preparation
measured 90.8 ms in the callback integration test; actual GUI preparation plus
publication measured 210.9 ms. Recorded sounding RMS was 0.001918 and completed
release RMS zero. This measures this workload and does not establish glitch-free
continuity or a matched C++/native/Wasm comparison.

Download <https://wubulon.tailfac9f9.ts.net:4174/oscillator-delivery/2026-10-01/Manifold-oscillator-linux-x86_64-r3.tgz>.
The archive is 9,326,419 bytes, SHA256
`8f04c697e4e65564ef72c4be5190e565ed9a9719d4b236d2100f22887d49658a`.
Executable SHA256 is
`e66ef22a3ddc6f70b3c483b91e1c0b80395e1cfdf3197a9fc4ed527bf05b4a2a`.
The adjacent JSON lists packaged file hashes. Actual recording, screenshots,
audio, accepted snapshots and report are published under
`keyboard-v1/native-release/`. Earlier r1/r2 archives remain available.

After the BB restart, these live routes returned HTTP 200 and BB desktop discovery
succeeded again. Next delivery is scoped MIDI input through the authored event
contract, demonstrated in the real instrument with an owned virtual MIDI fixture;
physical hardware and DAW acceptance remain separate open requirements.

## Authored MIDI increment (0.3.0)

The native standalone now exposes **Refresh MIDI / input selection** in its real
creator UI. Device messages enter a bounded control queue and public `event.midi`
request, decode to the same `onEvent` as keyboard/tool commands, and publish DSP
targets through the existing graph host. Allocation and routing remain editable
project source. No product-specific voice processor was introduced. Device scans
release a disconnected input's ownership; the UI's explicit Release all notes is
global in retained and egui. CC123 releases channel keys and respects sustain;
CC120 silences only the issuing input/channel, following oscillator smoothing.

The public `AuthoredMidiInput` class supplies browser selection/disconnect without
holding any voice/graph state. Both the creator and independent package consumer
use it. Failed switches retain the previous message handler when graph release is
rejected. Incomplete note/controller packets are rejected. The native device queue
is bounded at 256 messages, with an explicit scoped release on overflow; this
increment has not measured flood recovery or timestamp/sample scheduling.

### Delivered native evidence

Native review `native-midi-v6` used the exact optimized binary through actual egui
pointer selection and an owned temporary ALSA virtual port. It passed two MIDI
channels, a sounding held-note topology edit, sustain/CC123, channel CC120,
disconnect preserving an agent-owned note and the actual global release button.
Recorded RMS was 0.001530 and final release RMS zero; source preparation plus
publication measured 197.6 ms. This is virtual protocol evidence, not physical
keyboard or DAW acceptance and not a glitch-free continuity claim.

- Exact reviewed build:
  <https://wubulon.tailfac9f9.ts.net:4174/oscillator-delivery/2026-10-01/Manifold-oscillator-linux-x86_64-r5.tgz>.
  8,762,278 bytes, SHA256
  `e80dcd1dc9ba0e80e60f190002723e970e55ae985b98cb1411cb9e39d0b6dbc1`.
  Binary SHA256
  `ac1d0cffcd34991d8bd45ef874bf815f14a8a72dd3f6383d024188219cb585c0`.
- Real native screen/audio, snapshots, MIDI packet trace and report:
  `midi-v1/native-r5/`. Original and edited portable controller packages are in
  the archive. Reviews v1–v3 failed setup/audio routing and are not acceptance;
  v4/v5 passed the previous build, v6 additionally exercises the release button.
- Actual BB browser UI/audio: `midi-v1/browser/`. A retained chord survived a
  scoped raw MIDI command from the structured API; actual egui input also sounded.
  Browser device permission was denied on two requests. The scoped bridge cannot
  grant that permission. This is UI/command evidence, not browser device proof.
- Independent browser importing product now passed actual Web MIDI input in
  isolated headless Chromium (`midi-v1/imported/`): real device selection, two
  channels, held source edit, sustain, scoped panic/disconnect and actual global
  release. Recorded RMS 0.003210, final quarter-second RMS zero. Audio is a real
  MediaRecorder Opus capture, not a fidelity reference. Reviews v1/v2 failed
  permission; v3 failed MIDI initialization because the private test ALSA config
  lacked hardware discovery definitions. Granting MIDI/SysEx to the owned test
  context and using normal ALSA discovery fixed v4; audio remained on the verified
  private/null sink. Failed review JSON/screenshot remain under
  `midi-v1/imported-permission/` and are not acceptance evidence.

The public creator package is `packages/oscillator-creator.manifold.json` on the
live server; its source/state generation is covered by the package freshness gate.
Saved source is deliberately retained. **Original oscillator** loads the updated
default into an existing creator; publishing new library code does not overwrite
user-authored source. Native input uses midir's documented control-side connection
API; hardware timing and DAW event handoff remain open. The 82 web tests and focused
native oscillator controller tests passed; release standalone and Wasm UI builds
passed. Full workspace/DAW/physical-device acceptance was not run for this increment.

Next visible product interaction: recover the original oscillator waveform/drive
preview and face behavior in both renderers, then integrate the Main Wave authored
voice composition. Preserve the open Filter gates and complete inventory.

## Original static waveform / drive preview (0.4.0)

The creator and independent importer now show the waveform and drive transfer
beside each other, using the same public `ui.curve` component in retained Canvas
and egui. Accepted waveform, pulse width, additive mode/partials/tilt/drift and
drive/shape/bias determine both plots. The source contains the visual helper from
`Main/lib/ui/oscillator_preview.lua`; Rust still processes the actual audio.
Preview points are bounded and cached by the relevant accepted controls. Dynamic
curve updates preserve the retained keyboard element and its held ownership.

`node scripts/check-oscillator-preview.mjs` executes the actual read-only legacy
Lua drawing helper. All 9,472 static segments across 64 waveform/render/drive
configurations matched integer drawing coordinates with zero pixel error. Stock
Lua lacked `math.tanh`; the comparison supplies its standard exponential identity.
This is static drawing parity, not audio parity, animated active-voice overlays,
analysis-port behavior or exact full-face layout acceptance.

Actual BB review: `preview-bb-v1` captured both renderers, an actual computer-keyboard
note held through an agent waveform change from Saw to Pulse, and Fold drive
preview after acknowledged drive/shape changes. Automated audio remained on the
private sink. Existing saved source stays intact; click **Original oscillator**
if the editor is reopening an earlier authored version. Live browser evidence is
published under `preview-v1/browser/`.


Native `native-preview-v3` passed actual egui/MIDI/audio review with both preview
widgets present: device selection, two channels, source edit while held, pedal,
scoped release/disconnect, agent-owned voice and the actual global release button.
Recorded RMS 0.001532; released RMS zero. GUI source preparation plus publication
measured 195.3 ms. Actual recording and snapshots are under `preview-v1/native-r7/`.
The exact executable and original/edited packages are published at
<https://wubulon.tailfac9f9.ts.net:4174/oscillator-delivery/2026-10-01/Manifold-oscillator-linux-x86_64-r7.tgz>.
Archive 8,784,324 bytes, SHA256 `238e35e937f21ed980319d744f0d6754a8282a48b37feb1a04bba43ba5a07a86`; binary SHA256 `5be63924ae50a959d25eb11ace7df9be133776ce24a425903061851082fc116d`.

Independent importer `preview-imported-v3` passed real Web MIDI input and an actual
computer-keyboard note through an agent preview control edit without replacing
that keyboard element. Source edits, sustain, scoped release and actual global
release passed. Recorded RMS 0.005700, final quarter-second RMS zero. Evidence is
under `preview-v1/imported/`. A prior concurrent review picked another review's
similarly named virtual port; fixtures now identify their own port and browser
fixtures have a distinct name. That failed review is not acceptance.

The 82 web tests, focused native oscillator controller tests, optimized standalone,
production web/importer and Wasm UI builds passed. Old delivered native packages
remain available; no full workspace, DAW, physical keyboard, matched performance,
animated overlays or complete Main acceptance is implied. Next: original face
interactions/animation and authored Main Wave composition in this same creator.
