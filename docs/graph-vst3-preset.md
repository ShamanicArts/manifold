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

The graph class currently uses host generic parameters. A native graph editor
with the original widget primitives and an in-editor project import path still
needs implementation. The preset route is a usable bridge for exported browser
projects today; the host decides how to present its preset loading action.
