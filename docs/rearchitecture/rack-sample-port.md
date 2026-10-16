# Rack Sample module port ledger

Status: incomplete, 29 September 2026. Historical behavior is in the read-only
`my-plugin/UserScripts/projects/Main/lib/rack_modules/sample.lua`, its
`lib/sample_synth.lua` dependency, the RackModuleHost project script, and the
`SampleRegionPlaybackNode` and `PhaseVocoderNode` C++ kernels. RackModuleHost
selects this module at index 2. The current v2 combined Rack graph now offers
selection 2 through the authored public Sample graph; the behavior gaps below
remain open.

## Historical authored shape

`sample.lua` authors a per-slot mixer and gain, a capture input, a SampleSynth
capture service, and eight voice chains. Each chain connects Sample Region
Playback → Phase Vocoder → Gain → the slot mixer. The script owns the slot and
voice tables, path dispatch, capture requests, analysis/readbacks, and source
selection. These are project behaviors; a hidden Rack-only DSP processor would
lose the graph's inspectability and rewriteability.

Each voice exposes gate and vOct. A gate rise triggers or resumes playback
according to the `retrigger` setting, resets the vocoder, and applies the
current pitch mode; gate fall stops playback. The slot exposes source,
capture trigger/bars/mode/start offset and readbacks, pitch map, classic and
two vocoder modes, FFT order 9–12, time stretch, root note, unison 1–8,
detune, spread, play/loop window, crossfade, retrigger, and output. Capture
copies a selected retrospective window into every voice's playback buffer,
then publishes length, analysis, and peaks outside rendering. State continuity
and portable PCM need explicit tests at the module boundary.

## Public phase vocoder prerequisite

The existing Rust [PhaseVocoder](../../crates/manifold-core/src/phase_vocoder.rs)
was already used by a fixed Main voice path but could not be added from a
public graph project. ABI code 62 is now exposed as `phase-vocoder` in the
[shared catalog](../../crates/manifold-core/src/node_catalog.rs), with an
audio input/output and the five historical controls. FFT order 9–12 is
prepare-only: authoring and project import validate the discrete choice;
native loading inserts the authored order into the graph before DSP
allocation. Other controls remain live parameter edits. The frontend's
discrete parameter handling now supports explicit values such as 9–12, so the
number of choices no longer silently changes the parameter's numeric ABI.

The [JS example](../../packages/manifold-author/examples/phase-vocoder-chain.mjs)
scripts a replaceable test oscillator → vocoder → output chain. Its
[portable snapshot](../../projects/graph-workspace/authored-phase-vocoder-chain.json)
uses FFT order 9, +12 semitones, and full wet mix. A
[Wasm test](../../web/tests/phase-vocoder-authoring.test.js) imports/reopens it,
rejects fractional FFT order, and checks that a live mix edit changes audible
samples. A native test verifies order 9 is prepared before processing and
survives a save/reopen. The [offline native/Wasm report](evidence/2026-09-29-phase-vocoder-native-wasm.json)
uses 48 kHz/128 frames: median block cost 59.72/75.84 µs, output checksums
561.787/561.791, and no measured deadline misses. This is not a matched old
C++ comparison or an actual callback timing measurement.

The [live page](https://wubulon.tailfac9f9.ts.net:4173/phase-vocoder.html)
plays that authored graph through the browser AudioWorklet. It accepted live
pitch -7 semitones and mix 35%, saving both to the portable project. Its
[screenshot](evidence/web-phase-vocoder-live.png) shows those values. The new
Chromium audio stream was verified on private null sink 149695; the H6 stayed
at its two preexisting streams. The sink was removed and no page errors were
reported.

## Portable PCM and first authored voice

`GraphWorkspace.setSampleAsset` now attaches a bounded, interleaved stereo
Float32 source to a public sample node. The PCM is encoded as little endian
Base64 in `assets`, so the project document can be reopened by the JS authoring
package and the native reader. A graph fork and a live control edit preserve
the saved PCM without decoding and reencoding it on every gesture. The browser
host decodes and transfers it to the AudioWorklet during preparation, outside
the processing callback, and exposes targeted note events to project logic.

The [one-voice script](../../packages/manifold-author/examples/sample-voice-chain.mjs)
authors Sample Region Playback → Phase Vocoder → voice gain → output gain from
public primitives. Its [saved project](../../projects/graph-workspace/authored-sample-voice-chain.json)
contains 4,800 frames of stereo PCM and stable instance and control paths.
Gate rise sends a note event and opens the voice gain; gate fall stops playback;
vOct and root note derive sample speed; pitch mode, time stretch, window, and
output map to public parameters. Reopening a project with an open gate calls
`activate()` after host preparation to restart that voice. The script also
routes unison, detune, and spread to the public Sample Region primitive.
Retrigger, capture, and source selection remain incomplete in this standalone
voice script.

[Wasm block tests](../../web/tests/sample-assets-authoring.test.js) check PCM
roundtrip, invalid encoding rejection, real sample playback, live controls,
save/reopen with an open gate, and a stopped voice. A native test imports the
same authored fixture, sends a note event, and checks nonzero stereo output.
The [live browser page](https://wubulon.tailfac9f9.ts.net:4173/sample-voice-chain.html)
accepted gate 60%, MIDI pitch 72, and vocoder mode while running via the
packaged authoring adapter; the [screenshot](evidence/web-sample-voice-chain-live.png)
shows the accepted values and inspectable graph. Chromium's stream used private
null sink 149846, the H6 retained exactly its two preexisting streams, and
no page errors occurred. The sink was removed after the check. This verifies
one voice; it is not selection 2 of the combined Rack graph.

## Eight public voice chains and shared sample storage

The [eight-voice script](../../packages/manifold-author/examples/rack-sample-eight-voice.mjs)
authors the old Sample Region Playback → Phase Vocoder → Gain shape eight
times and connects them to a public mixer and output gain. The
[portable project](../../projects/graph-workspace/authored-rack-sample-eight-voice.json)
contains one decoded PCM asset and seven `sampleBindings` that attach the same
source to the other voice nodes. The Rust core clones an `Arc` during graph
preparation, so each Sample Region has its own play cursor without eight PCM
copies. The browser host transfers PCM once and invokes the same share operation
through Wasm before processing. Native and JS readers reject dangling,
duplicate, self, or incompatible bindings; removing a source clears its
bindings. The project has eight named playback/vocoder/gain instances and
individual gate and vOct controls, plus broadcast pitch mode, time stretch,
window, crossfade, root note, and output controls. It uses the historical
FFT order 11 on each voice.

[Wasm tests](../../web/tests/sample-assets-authoring.test.js) trigger voice 8
and voice 1 separately and check that gate fall stops playback and pitch mode
updates all eight vocoders. Native imports the same fixture, triggers the
first and last voice, and hears stereo output. CLAP and VST3 Graph host tests
import the fixture while processing and preserve the single asset and seven
bindings in published state. The [live page](https://wubulon.tailfac9f9.ts.net:4173/rack-sample-eight-voice.html)
accepted voice 1 and 8 gates, voice 8 pitch, and shared vocoder mode. Its
[screenshot](evidence/web-rack-sample-eight-voice-live.png) shows the eight
controls. Chromium ran on private null sink 149946, the H6 kept two
preexisting streams, no page errors occurred, and the sink was removed.

The [offline native/Wasm report](evidence/2026-09-29-rack-sample-eight-active-vocoder-native-wasm.json)
uses all eight voiced vocoders at 48 kHz/128 frames, order 11. Median block
cost across runs is 60/63 µs, but hop-aligned FFT work drives p95 to
1,995/2,614 µs and p99 to 2,165/2,745 µs. Wasm exceeded the 2,667 µs
block budget 32–57 times per 2,048-block run; native exceeded it 0–3 times.
Checksums agree within 0.03%. This offline proxy is not actual device callback
timing and has no matched C++ baseline. The result is a concrete performance
gate for eight simultaneous order-11 vocoders, especially in Wasm.

## Combined Rack and Graph workbench

The [combined Rack project](../../projects/graph-workspace/authored-rack-module-host-sample.json)
places the eight-voice Sample graph alongside the authored oscillator, filter,
EQ, and module selector. Selecting index 2 changes the public graph cables and
the same project logic sends gate, pitch, and mode edits to its voice chains.
It has 65 public nodes, one PCM asset, and seven bindings to that source.
The [live Rack page](https://wubulon.tailfac9f9.ts.net:4173/rack-filter-eq.html)
accepted those controls and rendered the resulting graph; its
[screenshot](evidence/web-rack-module-host-sample-live.png) records the run.
Native, Wasm, CLAP, and VST3 tests load the same project contract.

The general [Graph workbench](https://wubulon.tailfac9f9.ts.net:4173/?primitive=graph-workspace)
can now import that saved project, start its Wasm AudioWorklet graph, and export
the project with the PCM asset and all seven shared bindings intact. The
[roundtrip test](../../web/tests/graph-sample-bindings.test.js) also rejects
invalid or duplicate bindings. The first live headless Chromium check opened
the 63-node revision,
saved one exact PCM asset plus seven bindings, and started audio on private null
sink 150173; the H6 retained its two prior streams and no page errors occurred.
The [workbench screenshot](evidence/web-workbench-shared-sample-open.png) shows
the imported graph. The temporary sink was removed after the check.

The public graph bound is now 128 nodes, 512 connections, and 128 named
instances across the JS authoring package, browser workbench, native reader,
and Wasm graph ABI. This removes the 64-node ceiling reached by the earlier
Rack graph while retaining explicit project limits. A [Wasm signal test](../../web/tests/sample-assets-authoring.test.js)
and native project test extend the current Rack project to 69 nodes and 67
named instances, then trigger Sample voice 1 through the extended chain and
check audible stereo output.

The authored Rack Sample module now connects the host's stereo input to a
public 30-second Retrospective Capture node. A public gain fixed at zero sends
that branch into the ninth mixer input, keeping the capture node in the
prepared graph without monitoring the input. The JS/TS `GraphWorkspace`
contract authors, lists, selects, saves, and reopens the named capture source.
The same contract also reopens the existing two-source retrospective sampler
project, preserves its sidechain and capture window settings, and scripts a
source/window change without dropping either capture node. The
[authoring test](../../web/tests/capture-authoring.test.js) rejects inconsistent
source IDs and invalid window values.
The [saved Rack project](../../projects/graph-workspace/authored-rack-module-host-sample.json)
registers source ID 0 at node 65. Native and Wasm tests feed distinct left and
right values, freeze a 128-frame window, and recover the exact interleaved PCM
while the Sample output stays silent. A second live browser check opened the
65-node project, exported one unchanged asset and all seven bindings, and
started audio on private null sink 150293 with no page errors; the H6 still
had its two prior streams. Its [screenshot](evidence/web-workbench-rack-capture-open.png)
records the revised graph. A follow-up import/export check also asserted the
saved capture node and selected source ID; audio started on private sink
150355 with the H6 unchanged and no page errors. Both temporary sinks were
removed. Analysis/readbacks and historical source selection remain open.

A native end-to-end test now freezes that authored source, prepares the 128-frame
take as the single Sample asset on the host control side, rebinds the seven
other voice players, and triggers voice 8. Both stereo outputs are audible;
the saved project retains the take label, frame count, selected capture source,
and seven shared bindings. This proves capture publication by complete native
project replacement; uninterrupted capture-ring continuity during that
replacement remains open.

The public `BrowserGraphHost` now stages a retrospective window through the
existing bounded Wasm capture copy, exports its PCM to the JS project script,
and publishes that source to the running Sample Region. The script replaces
the one saved asset only after host acknowledgement and retains the seven
shared bindings. [A real Wasm test](../../web/tests/sample-assets-authoring.test.js)
captures host stereo, replaces the source, reopens the saved project, and
triggers voice 8. The [live Rack page](https://wubulon.tailfac9f9.ts.net:4173/rack-filter-eq.html)
captured a one-second, 48,000-frame window from its browser oscillator and
then accepted Sample voice 8 gate. Its [screenshot](evidence/web-rack-module-host-live-capture.png)
shows the control and running graph. The final Chromium build check used
private null sink 150690;
the H6 kept its two existing streams, no page errors occurred, and the sink
was removed. The publication cuts held Sample Region voices over to the new
source; uninterrupted held-note continuity and full historical capture timing
remain open.

The Rack script now reads the saved `captureWindowMode`, seconds, bars, tempo,
and meter when triggering capture. `LiveGraphSession` serializes source and
window edits with the same project revision stream as routes and parameters.
The browser page offers one- and two-second windows and 1/16- or one-bar
windows at 120 BPM. A [Wasm event test](../../web/tests/sample-assets-authoring.test.js)
captures both a 128-frame seconds window and a 2,400-frame bar window (1/16
bar, 300 BPM, 4/4), publishes the latter to all eight Sample voices, and
reopens its saved PCM. The [live bar-window check](evidence/web-rack-module-host-bar-capture.png)
selected 1/16 bar at 120 BPM and saved a 6,000-frame, 125 ms take with seven
bindings before triggering voice 8. The final Chromium run used private null
sink 150767,
reported no page errors, and left the H6 with its two preexisting streams.
Transport-driven tempo remains open.

The public browser host now exposes the worklet's prepared Free capture arm
cursor. In the Rack project, `captureSample()` first arms the selected source;
the next call freezes the elapsed span and publishes it through the same
single-asset/seven-binding path. Leaving Free mode or stopping the page
cancels the arm. A Wasm sequence test records 1,280 frames between
presses and reopens the saved take. Switching source while Free capture is
armed is rejected so the visible selection cannot disagree with its frozen
cursor. The [live Free capture screenshot](evidence/web-rack-module-host-free-capture.png)
shows the final 18,432-frame take and its Rust analysis readbacks. Manual
start-offset entry is covered below; host transport integration remains open.

The reusable [analysis package](../../packages/manifold-author/analysis.js)
now runs the shared Rust/Wasm Sample analyzer on a separate Worker. The Rack
project keeps peak, RMS, pitch confidence, and stereo waveform peaks as
recomputable readbacks after capture; the PCM remains the saved source of
truth. The live Free capture check measured peak 1.000, RMS 0.706, and
110.0 Hz pitch at 100% confidence from the browser oscillator, painted its
stereo peaks, and published an 18,432-frame
take to the eight voices. The final Chromium check after the center-pan
correction used private null sink 151017, reported
no page errors, and left the H6's two streams untouched. Automatic root-note
application, exact historical peak layout, and native UI readbacks remain open.

## Rack Sample main and sidechain sources

The historical RackModuleHost Sample registers input and sidechain sources.
The authored graph now places a second `RetrospectiveCapture` behind the public
`input.sidechain` primitive and retains both capture paths through a silent
send to the Sample mixer. The project registry gives main input ID 0/node 65
and sidechain ID 1/node 68. The reusable browser host accepts separate main
and sidechain `AudioNode` sources; a project script selects either prepared
capture node, and the selection survives save/reopen. Free capture source
switches are rejected while armed. The Rust native and Wasm tests capture
distinct stereo values on both buses; the CLAP and VST3 suites accept the
revised portable graph.

In the [live browser build](https://wubulon.tailfac9f9.ts.net:4173/rack-filter-eq.html),
main input captured the 110.0 Hz test tone and sidechain captured the 220.0 Hz
test tone, each at 100% pitch confidence. The saved sidechain take contained
48,000 frames, one PCM asset, and seven shared voice bindings. The
[screenshot](evidence/web-rack-module-host-sidechain-capture.png) shows the
source selector, pitch readback, waveform, and saved node registry. Chromium
ran against private null sink 151099, left the H6's two existing streams
untouched, and reported no page errors. The null sink was removed afterward.
This covers the two RackModuleHost capture sources; Main's Live and four
layer sources remain a separate migration task.

The historical Free request also accepts a manual start offset: a negative
integer takes that many frames back, while a positive integer denotes a ring
cursor; zero retains the two-press arm flow. The public browser host now
accepts `manualStartOffsetFrames` and can read a source's prepared cursor and
capacity. The Rack script sends either offset through the selected source's
bounded capture and acknowledged Sample replacement path. The browser page
lets a user enter a negative offset or read the selected source cursor for a
positive offset. A [Wasm event test](../../web/tests/sample-assets-authoring.test.js)
checks negative and positive offsets, one saved PCM asset, and seven shared
bindings. A packaging regression check requires the published AudioWorklet and
Wasm copy to match the tested source/build: an earlier live run caught an old
copied worklet that ignored the new request.

The fresh [live manual Free screenshot](evidence/web-rack-module-host-manual-free.png)
shows the sidechain source, manual control, 220.0 Hz analysis, and waveform.
Chromium captured 4,800 frames from `-4800`, then read cursor 113,664 and
captured a further 10,752-frame span from that absolute cursor. Both takes
kept seven bindings. It ran on private null sink 151228 with no page errors;
the H6 retained its two existing streams and the null sink was removed.
Native editor gestures for manual offsets and transport-derived starts remain
to be ported.

The Rack UI now exposes the historical manual root-note control. After a
capture, a separate action can use a confident analysis pitch as the root;
the project script rounds hertz to MIDI and commits all eight voice speed
parameters with one acknowledged batch. Low-confidence or out-of-range
analysis leaves the saved root unchanged. The Wasm test checks the eight
pitch-map values and project reopen. In the [live browser proof](evidence/web-rack-module-host-detected-root.png),
the user first set MIDI 64, captured the sidechain's 220.0 Hz tone, then
applied detected MIDI 57 to all eight voice paths. The 48,000-frame asset and
seven bindings remained intact. Chromium used private null sink 151351 with
no page errors, left the H6's two existing streams untouched, and the sink
was removed. This is an explicit user action; automatic application and exact
historical pitch-map behavior remain to be assessed from the old project.

Analysis readbacks can also be regenerated after loading a saved Sample asset.
`analyzeSavedSample()` decodes the one portable PCM asset off the audio thread,
uses the shared Rust/Wasm worker, caches the result for unchanged PCM, and
discards a result if the asset changes while analysis runs. The project test
reopens a captured sidechain asset and verifies its 220 Hz result without
changing project state. In the fresh [live startup proof](evidence/web-rack-module-host-reopened-analysis.png),
the page opened its saved 4,800-frame fixture and displayed peak 0.600,
RMS 0.415, 220.0 Hz pitch, and a painted stereo waveform before any new
capture. It kept the one PCM asset and seven voice bindings. Chromium ran on
private null sink 151401, left the H6's two streams untouched, reported no
page errors, and the sink was removed.

The Rack audition page can now open a downloaded authored Rack project while
stopped. It validates the portable graph and the page's required instance and
control identities before replacing the current project. In the
[live file round trip](evidence/web-rack-module-host-file-roundtrip.png), the
page captured a 48,000-frame sidechain take, mapped its detected root to MIDI
57, downloaded the project, stopped, reopened that file, restarted the graph,
regenerated the 220.0 Hz pitch and waveform readbacks, and switched to the
saved Sample route. The one PCM asset, seven bindings, source ID 1, and root
57 survived. Uploading malformed JSON afterward was rejected without losing
the reopened project. Chromium reported no page errors on private null sink
151470; the H6 kept its two existing streams and the sink was removed.

The [live Rack page](https://wubulon.tailfac9f9.ts.net:4173/rack-filter-eq.html)
earlier restarted with the then-65-node authored graph and accepted Sample selection,
voice 8 gate and pitch, voice 1 gate, and pitch mode. Its
[screenshot](evidence/web-rack-module-host-capture-input-live.png) records the
controls. Chromium used private null sink 150327, the H6 kept its two prior
streams, and the sink was removed after the no-error check.

The native replacement test also takes the combined Rack project, prepares a
new silent PCM source for its first Sample Region, and republishes the complete
graph. Triggering voice 8 then produces silence, while save/reopen retains one
replacement asset and all seven bindings. This proves the existing native
control-thread replacement rebinds every prepared voice. Historical capture
timing and source selection remain open.

## Public Sample Region stacking

The historical Sample Region Playback primitive owns per-voice unison (1–8),
detune (0–100 cents), and stereo spread (0–1). The reusable Rust
`SampleRegion` now has those controls at parameter IDs 9–11, with independent
fixed-size cursors and no per-sample allocation. One-voice rendering now
applies the historical equal-power center pan. Newly authored Sample and Rack
projects serialize
the controls; older projects without IDs 9–11 load with defaults and retain
their original parameter list until an author edits one. The eight-voice
Sample script broadcasts each setting through one acknowledged parameter batch
and saves the project control.

[Core signal tests](../../crates/manifold-core/src/sample_region.rs) check
detuned stereo output, and [Wasm tests](../../web/tests/sample-assets-authoring.test.js)
check a live parameter change plus the eight-voice broadcast. The
[live Rack page](https://wubulon.tailfac9f9.ts.net:4173/rack-filter-eq.html)
accepted three voices, 38 cents, and 60% spread while Sample selection 2 was
playing; its [screenshot](evidence/web-rack-module-host-unison-live.png) shows
the controls and named processors. Chromium used private null sink 150515,
the H6 kept its two prior streams, no page errors occurred, and the sink was
removed. Exact C++ smoothing and pan-law parity has not yet been measured.

The [matched pre-optimization](evidence/2026-09-29-rack-sample-unison3-native-wasm.json)
and [coefficient-cached](evidence/2026-09-29-rack-sample-unison3-optimized-native-wasm.json)
offline runs both exercise all eight voices with FFT order 11 at 48 kHz and
128 frames. Moving detune exponent and pan square roots from each output sample
to parameter edits reduces median native block cost from 136 to 118 µs and
Wasm from 163 to 127 µs. The p95 costs move from 2,123/2,905 µs to
2,104/2,773 µs (native/Wasm). Across three 2,048-block runs, native deadline
misses change from 0–13 to 1–7; Wasm from 362–413 to 290–368. The output
checksums are unchanged: native 429.6451935 and Wasm 429.6468823. The
[unison-one control](evidence/2026-09-29-rack-sample-unison1-optimized-native-wasm.json)
has 62/68 µs median and 1,998/2,601 µs p95 after the same rebuild, compared
with [64.8/69.0 µs and 2,100/2,672 µs before](evidence/2026-09-29-rack-sample-unison1-current-native-wasm.json).
These sequential offline Node/V8 measurements have scheduling noise and are
not actual browser or DAW callback timing. The eight-voice Wasm workload still
misses the 2,667 µs budget and remains a performance gate.

## Sample Region C++ behavior inspection

The historical `SampleRegionPlaybackNode` applies equal-power pan at the
center even with one unison voice: each stereo channel is multiplied by
`sqrt(0.5)`. The Rust Sample Region previously returned full-level left and
right in that case. The shared primitive now applies the historical center
gain. Main's voice path no longer applies a second center gain, and the
separate Sample Instrument compensates before its own subvoice pan, preserving
its previous output level. Core tests probe the corrected signal and the full
native, CLAP, VST3, and Wasm suites pass. This is a source-level behavior
comparison, not a matched execution of the C++ binary.

The new [one-voice native/Wasm run](evidence/2026-09-29-rack-sample-centered-unison1-native-wasm.json)
records native/Wasm output checksums of 478.848/479.291, compared with
677.356/677.206 before center pan. The [unison-three run](evidence/2026-09-29-rack-sample-centered-unison3-native-wasm.json)
keeps its prior 429.645/429.647 checksums because the multivoice path already
used equal-power pan. Median block costs are 63/69 µs for unison one and
119/128 µs for unison three; Wasm still exceeds the 2,667 µs budget on
hop-aligned FFT blocks. The native/Wasm one-voice checksum gap is now about
0.09%, close to the benchmark's 0.1% tolerance and worth investigating.
These are offline sequential runs, not audio callback timing. The old
`GraphRuntimePerfHarness` is fixed at 44.1 kHz/512 frames and does not include
this Sample graph; its existing binary is not a matched C++ comparison.

The prepared Phase Vocoder now stores FFT bit-reversal indices once and reuses
them on the audio path. On the same eight-voice order-11 fixture, the
[table run](evidence/2026-09-29-rack-sample-bitrev-native-wasm.json) kept the
native/Wasm output checksums exactly unchanged at 429.645/429.647. Its
three-run median Wasm p95 was 2,665 µs with 78–108 measured blocks over the
2,667 µs deadline, compared with the baseline 2,769 µs and 270–309 blocks.
An alternative [precomputed swap-list run](evidence/2026-09-29-rack-sample-swaps-native-wasm.json)
measured worse (2,679 µs p95, 100–167 misses), so the table form was retained.
The table adds prepared memory (the Wasm instance rounded from 4,194,304 to
4,259,840 bytes). These are sequential Node/V8 offline timings, not a browser
AudioWorklet or real DAW deadline guarantee. Hop-aligned spikes still need work.

## Remaining acceptance work

The [historical C++ / Rust / Wasm Rack Sample workload comparison](rack-sample-cpp-native-wasm-benchmark.md)
now runs the old C++ graph from a separate read-only-source build alongside
the same 48 kHz/128-frame unison-three fixture used by native Rust and Wasm.
The first pass found a 10.9% checksum gap. Per-block traces isolated it to
the historical eight-millisecond fade-in of secondary unison voices after each
trigger, now implemented in the reusable Rust Sample Region. Updated C++/Rust/
Wasm full-vocoder checksums agree within 0.006%. Median p95 times are
2,172/2,023/2,670 µs; the Wasm simulation still misses the deadline on
99–188 of 2,048 blocks per run. This is one matched signal, not broad project
parity.
Earlier sections describing the absence of a C++ baseline refer to their
earlier checkpoints; the new raw C++ and native/Wasm runs are linked in the
comparison document. Actual browser and plug-in callback timing remains open.
The follow-up FFT specialization reduced the three-run Wasm p95 to 2,633 µs
and budget misses to 19–75 per run without changing the signal checksum; the
remaining p99 and callback deadline problem is still open.

The historical Main source registry names Live (0) and layer 1–4 (1–4).
The v2 combined Rack graph already persisted sidechain as source 1, so the
reusable `attachRackSampleLayerSource` composer maps layer 1–4 to v2 IDs 2–5.
It attaches any current **public graph audio output** to its own public
Retrospective Capture node and keeps that node in the prepared graph through
the silent capture bus. The
[portable four-source fixture](../../projects/graph-workspace/authored-rack-sample-layer-capture.json)
uses four distinct scaled input branches as test layer outputs. A Wasm test
and a native graph test captured 0.1/0.2/0.3/0.4 per channel from the four
registered sources, and both saved/opened the selected source ID 5. The Rack
browser UI now lists capture choices from saved source metadata. Actual Main
looper playback outputs are not yet connected to this Rack module, and a
legacy Main state importer must translate old layer IDs without confusing
them with v2 sidechain ID 1.
The [live browser import](evidence/web-rack-sample-layer-source-live.png)
opened the 80-node portable fixture, displayed all six sources, started the
AudioWorklet, captured 48,000 frames from selected v2 source 5, and measured
110 Hz with the shared analysis path. The page reported no errors. Chromium
used a verified private null sink; the H6 retained its two existing streams,
and the temporary sink was removed. The fixture's four branches are scaled
test signals, so this check proves source composition and selection rather
than Main looper audio parity.

The [four-layer Loop Capture composition](../../packages/manifold-author/examples/four-layer-loops.mjs)
now supplies real public playback nodes to those source ports. Its
[portable project](../../projects/graph-workspace/authored-rack-four-layer-loops.json)
opens in native and Wasm: record layer 1 for 512 frames, stop, play with a
silent host input, then freeze source 2. Both engines recover the recorded
0.2/-0.3 stereo signal while the untouched layer 2 source yields silence.
The JS controller sends acknowledged edits through the same
`LiveGraphSession` that saves the Rack graph. The
[live Rack screenshot](evidence/web-rack-sample-loop-layer-live.png) shows
four layer record/play rows, layer 1 playing, selected source 2, and a
48,000-frame Sample take analyzed at 110 Hz. Chromium had no page errors on a
private null sink; the H6 retained its two original streams. This proves a
real authored loop source and capture path. It does not yet port Main's
transport quantization, seek/scrub, four-layer recording semantics, or loop
PCM save/reopen.

The [browser export/reopen check](evidence/web-rack-sample-loop-export-reopen.png)
downloaded a real layer-1 capture as a 48,000-frame Sample asset, cleared the
unserialized loop play/record/overdub flags **only in the exported copy**, then
reopened and reanalyzed the Sample at 110 Hz. The live graph still reported
layer 1 playing before stop. One initial strict analysis wait timed out; a
retry completed without page errors. The UI now explicitly says that layer
recordings are live only and labels the download as graph plus Sample take.
True loop PCM persistence across save/reopen remains an acceptance gate; this
export path does not substitute for it.

The [loop PCM persistence checkpoint](loop-pcm-persistence.md) extends portable
`assets` to authored `loop-capture` nodes. Rust restores loop PCM into the
prepared ring, resampling at graph preparation if the host rate differs, then
applies playback state. The browser host freezes stopped loop audio using the
prepared staged-copy path; the Rack page downloads it with the graph. The
native library also captures a live recorded loop during synchronized state
save and proves the saved project reopens audibly. Live DAW-host save/reopen
through CLAP and VST3 remains unverified.

1. Finish historical source selection across Live and four layer capture
   sources, native manual Free start gestures, transport timing, and automatic
   pitch-map/root-note behavior. Match the old readback path and waveform
   layout. Keep PCM decode and analysis outside audio.
2. Translate the historical slot and voice path logic into a reusable project
   module. Check gate/retrigger, classic/vocoder pitch, windows, unison parity,
   capture/readbacks, save/reopen, and source changes as event sequences in
   browser and native hosts.
3. Import an actual old Rack sample state and compare C++/Lua audio, controls,
   timing, and callback cost against native Rust and Wasm on matched workloads.
   The general native project logic runner and browser structural publication
   gates remain prerequisites for full runtime authoring.
4. Bring all-eight order-11 vocoder callback cost below the 128-frame deadline
   with margin in browser and native hosts. Diagnose the hop-aligned spikes
   before claiming real-time performance parity.
