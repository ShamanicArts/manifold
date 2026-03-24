# OSC Tooling

This repo now includes a small set of scripts for documenting and testing live OSC/OSCQuery endpoints.

## Generate live endpoint docs

Dump all live OSCQuery endpoints to Markdown:

```bash
./tools/generate-osc-endpoints > /tmp/manifold-osc-endpoints.md
```

Only dump MidiSynth endpoints:

```bash
./tools/generate-osc-endpoints --prefix /midi/synth --title "MidiSynth OSC Endpoints"
```

Write a generated file into the repo:

```bash
./tools/generate-osc-endpoints \
  --prefix /midi/synth \
  --title "MidiSynth OSC Endpoints" \
  --output docs/generated/midisynth-osc-endpoints.md
```

Emit JSON instead of Markdown:

```bash
./tools/generate-osc-endpoints --format json --output /tmp/manifold-osc-endpoints.json
```

## Verify one OSC write

```bash
./tools/test-osc-write /midi/synth/drive 9.0
./tools/test-osc-write /midi/synth/fx1/type 2 --type float
```

## Sweep MidiSynth OSC writes

```bash
./tools/test-midisynth-osc
./tools/test-midisynth-osc --json
```

## Notes

- These tools talk to the running app over:
  - OSC UDP on `127.0.0.1:9000`
  - OSCQuery HTTP on `http://127.0.0.1:9001`
- The shared helper in `scripts/manifold_osc.py` builds OSC packets correctly:
  - OSC strings are NUL-terminated
  - OSC strings are padded to 4-byte boundaries
- Do **not** hand-roll ad-hoc packet builders unless you want fake failures.
