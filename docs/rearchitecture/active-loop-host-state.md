# Active CLAP/VST3 loop state handoff

Status: partial implementation. The deactivation snapshot in `4318f600`
preserves stopped or in-progress authored takes when the host deactivates a
graph. Active CLAP and VST3 graph instances now use a prepared loop mailbox:
the audio callback copies stopped PCM in slices of at most 4096 stereo frames
per loop, and the host state thread encodes a complete take only after its
revision has been checked. A recording or incomplete copy makes state export
fail instead of reporting stale PCM as a successful save.

`cargo test --workspace` passes the active CLAP state-save and VST3 published
state tests. Each records a stereo block, saves while active, opens those exact
bytes in a fresh component, and captures the restored loop under silent input.
The VST3 test now uses the actual `getState` and `setState` `IBStream` calls;
the CLAP test already uses its `state.save` stream callback.
The native mailbox test also proves a failed encode can be retried and that a
new take with the same length replaces the old one. The next checkpoint carries
the prepared loop's seven current controls alongside PCM. A host value-bank
snapshot cannot overwrite those published loop controls during an active save;
on host stop the bank is updated from the synchronized runtime before state
encoding. CLAP and VST3 tests now queue a route-only edit on a small authored
loop graph, record a newer take, and stop the host before route publication.
Reopening the saved project renders two copies of that newer take through the
edited sum route. A different node table is rejected by the merge guard.

The native route fast path now admits graphs of up to 16 nodes with authored
loop-capture assets as their only media resources. This is a bounded extension,
not full structural graph publication. The full Rust workspace tests, Wasm
build, all 48 web tests, and production web build pass after these edits.
The [REAPER Graph active-loop probe](../../scripts/probe-reaper-graph-active-loop.py)
now proves real-host save/reopen in both VST3 and CLAP. It records the authored
loop through host parameter automation, saves while transport runs, replaces
the source with silence, and renders a freshly loaded host project. Retained
VST3 [metrics](../../web/public/graph-vst3-reaper-loop-active-state.json) and
[replay](../../web/public/graph-vst3-reaper-loop-active-replay.wav) show a
24,576-frame take and a one-second stereo render peaking at 0.300. Retained
CLAP [metrics](../../web/public/graph-clap-reaper-loop-active-state.json) and
[replay](../../web/public/graph-clap-reaper-loop-active-replay.wav) show a
23,552-frame take and the same 0.300 replay peak. In both runs the first 4,096
rendered frames match the expected 0.2/-0.3 input within 0.03. The host used a
disposable Weston display and a separate PipeWire server whose only sink was
a verified null sink. Repeat after building each bundle with
`python3 scripts/with-headless-weston.py -- python3 scripts/probe-reaper-graph-active-loop.py`
and append `--clap` for the CLAP run.

The CLAP probe caught a lifecycle error: its host reset erased the loop ring
while the saved state still contained PCM and play=1. `LoopCapture` now has a
processing reset that restarts the cursor while retaining authored PCM;
explicit take reset still clears it. Graph CLAP also advertises an infinite
[tail under the CLAP contract](https://github.com/free-audio/clap/blob/main/include/clap/ext/tail.h)
because user-authored graphs can generate audio without input. The reset fix,
not the tail declaration, was the observed cause of restored CLAP silence.

## Required contract

1. Each authored `loop-capture` take has a revision that changes when record,
   overdub, load, or reset changes its PCM. A stable stopped take is eligible
   for state export. The revision is inspectable in the prepared graph without
   copying PCM.
2. A prepared worker copies eligible loop PCM in bounded slices across render
   blocks into host-owned buffers. Its storage and queue slots are allocated
   before activation. The callback performs no allocation, JSON encoding,
   locking, waiting, or filesystem access.
3. The host control thread takes only a complete snapshot whose revision still
   matches the active loop. It encodes the existing portable `assets` entry
   and publishes a coherent project document. A stale or incomplete snapshot
   must never be returned as a successful save.
4. State saves preserve the last *published* graph generation. A pending route
   edit needs the current take merged into that route if both are committed at
   host stop; an unpublished imported graph must not inherit unrelated PCM.
5. CLAP `state.save` and VST3 `getState` pass tests that record and stop a loop
   while audio remains active, save without deactivating, instantiate a new
   component from those exact bytes, and render the restored take under silent
   host input. Repeat for overdub, new take with equal length, pending route,
   and multiple loop layers. Then verify in a real DAW with a private audio
   sink and no physical output routing.

The existing retrospective capture mailbox stages one user-requested window;
the new authored-loop mailbox tracks every prepared loop node separately.
Remaining gaps: verify concurrent state save and callback publication; measure
callback cost with several full-length layers; support route-only edits in
larger resource graphs and full structural graph publication; prove multiple
layer saves, overdub and equal-length take changes in a real host, and
recording-in-progress host behavior.
The former eight-loop/80 MiB prepared-mirror quotas were removed on 13 October
2026. Transfer buffers now follow every authored loop and its actual capacity,
with fallible allocation off callback. The sample-storage acceptance exercises
nine recorded loops and a 240-second ring; it does not replace the open real-DAW
scenarios above.
