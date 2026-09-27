# Graph project to VST3 preset

The Linux `Manifold Graph` class accepts the same `manifold.project` schema v1
bundle used by the browser graph workspace. The Rust exporter parses the
project and prepares it at 48 kHz before putting the original JSON in the VST3
component state chunk. The public host surface stays at 128 fixed macro IDs;
saved `hostBindings` determine which graph control each slot addresses.

```sh
./scripts/build-vst3.sh
cargo run -p manifold-vst3 --example export_graph_preset -- \
  projects/graph-workspace/tone-texture.json tone-texture.vstpreset
```

Load the resulting `.vstpreset` in a host's preset browser. REAPER also accepts
the full path through `TrackFX_SetPreset`, which the isolated
`scripts/probe-reaper-graph-vst3.py` uses. The probe loads the Tone Texture
project from a preset and renders one second from a silent item. Its output
matches direct native Rust over all 48,000 stereo frames within `5.96e-8` peak
sample error. It also renders the default note graph from a MIDI item with the
same peak error. The [review page](../web/public/graph-vst3-host-proof.html)
contains both playable WAV files and the preset.

The container uses Steinberg's [documented VST3 preset format](https://steinbergmedia.github.io/vst3_dev_portal/pages/Technical%2BDocumentation/Locations%2BFormat/Preset%2BFormat.html):
`VST3` header, processor class ID, a `Comp` chunk containing the JSON bytes,
and a trailing `List` of chunk offsets. The processor class ID is the graph
component ID, not its edit controller ID. REAPER's [preset API](https://www.reaper.fm/sdk/reascript/reascripthelp.html)
allows an absolute `.vstpreset` path. The exporter enforces the same 45 MiB
state bound as the VST3 stream reader and rejects projects the native engine
cannot prepare at 48 kHz with 1,024 frame blocks.

The Linux graph class now has an 800×600 native `IPlugView` that uses the ported
original compact slider and dropdown renderers. It shows each bound graph
control beside its stable host slot number. `scripts/probe-reaper-graph-vst3-gui.py`
opens the editor in isolated REAPER, confirms host automation changes the
visible Semitones control, drags that widget to move REAPER's slot 0 from 0.20
to 0.773, then loads Tone Texture through REAPER's preset API. The open editor
rebuilds its cards for the new oscillator, noise, filter, CV gain, and LFO
bindings. The [review](../web/public/graph-vst3-host-proof.html) shows the
capture sequence.

The editor also imports the browser's graph JSON directly. Its file input
validates the graph contract, transfers at most 45 MiB to the companion in
bounded chunks, and reports the result in the editor. The controller sends a
host-created VST3 `IMessage` through the host-connected `IConnectionPoint` to
the processor. The processor parses and prepares the replacement outside the
audio callback and publishes it at a block boundary. Only after the processor
accepts the project does the controller update its node cards and ask the host
to rescan parameter values. This follows Steinberg's
[processor/controller communication model](https://steinbergmedia.github.io/vst3_dev_portal/pages/Technical%2BDocumentation/API%2BDocumentation/Index.html).
The isolated REAPER probe's `--direct-import` mode drives that actual file
input, saves the host project, and verifies that a fresh REAPER render matches
the preset route over all 48,000 stereo frames exactly. Its `--sample-import`
mode generates a 513,055-byte project with 48,000 stereo PCM frames, imports
it through the same editor control, saves and reopens the REAPER project, and
compares the MIDI render with direct native Rust. Peak sample error is
`5.96e-8` over all 48,000 stereo frames. A host may impose a smaller
private-message size than REAPER; still larger embedded sample projects and
other hosts need verification. The automated `--direct-import` probe injects
a `File` into the input handler. The separate `--manual-picker` mode opens
the native file chooser under isolated Xvfb, selects Tone Texture JSON, and
checks the same saved-project audio result.
Deliberate slot reassignment remains to build.
