# AMXD Toolbox

This is the little box of scalpels for future agents working on Max for Live / `.amxd` reverse-engineering in this repo.

The point is not to be a perfect generic importer yet.
The point is to make it fast to:

- inspect an AMXD
- extract its assets
- count and classify what is inside
- find the important boxes / patchers / params
- generate report bundles that the next agent can trust

The main script is:

- `tools/amxd/amxd_tool.py`

It uses only the Python standard library.

---

## Quick start

### High-level summary

```bash
python tools/amxd/amxd_tool.py summary '/path/to/device.amxd'
```

### Recursive object inventory

```bash
python tools/amxd/amxd_tool.py inventory '/path/to/device.amxd'
```

### Root visible parameter surface

```bash
python tools/amxd/amxd_tool.py params '/path/to/device.amxd' --visible-only
```

### Exact `pattr` targets

```bash
python tools/amxd/amxd_tool.py pattrs '/path/to/device.amxd'
```

### Recursive patcher tree

```bash
python tools/amxd/amxd_tool.py tree '/path/to/device.amxd'
```

### Search boxes

```bash
python tools/amxd/amxd_tool.py search '/path/to/device.amxd' clap
python tools/amxd/amxd_tool.py search '/path/to/device.amxd' jsui --field maxclass
python tools/amxd/amxd_tool.py search '/path/to/device.amxd' sampleSelector --field varname
```

### Inspect a repeated box id across recursive patchers

```bash
python tools/amxd/amxd_tool.py box '/path/to/device.amxd' obj-143
```

### Resource catalog

```bash
python tools/amxd/amxd_tool.py resources '/path/to/device.amxd'
python tools/amxd/amxd_tool.py jsui '/path/to/device.amxd'
```

### Full report bundle

```bash
python tools/amxd/amxd_tool.py report '/path/to/device.amxd' /tmp/amxd-report
```

### Extract assets

```bash
python tools/amxd/amxd_tool.py extract '/path/to/device.amxd' /tmp/amxd-extract --json --scripts --images
```

If you also want the embedded WAV bank:

```bash
python tools/amxd/amxd_tool.py extract '/path/to/device.amxd' /tmp/amxd-extract --json --scripts --images --media
```

---

## What the script knows how to do

## 1. Balanced JSON extraction

`.amxd` is not treated like a zip.
The script:

- finds the first `{`
- walks forward with balanced-brace parsing
- respects strings and escapes
- returns the exact embedded patcher JSON region

This is the first thing worth getting right. Everything else depends on it.

## 2. Recursive patcher walking

The script walks every inline subpatcher and preserves stable-ish paths like:

```text
root/obj-297:p human_claps/obj-80:p Clap/obj-224:p clap_resonance
```

That is useful for:

- classification
- search
- later override manifests
- handoff docs

## 3. Object inventories

It will produce:

- recursive `maxclass` counts
- recursive `newobj` counts
- exact `pattr` counts
- `pattr` leaf-target summaries
- root parameter-enabled controls

## 4. Resource discovery

It catalogs:

- embedded WAVE/RIFF assets
- embedded PNGs
- dependency cache entries
- project media names
- embedded JSUI script blobs discovered via `mgraphics.init()`

The JSUI script extraction is heuristic, but it is good enough for inspection and manual porting.

## 5. Report bundles

`report` writes a ready-to-read bundle with:

- `summary.json`
- `inventory.json`
- `root_parameter_enabled.json`
- `root_visible_parameter_enabled.json`
- `pattr_targets.json`
- `resources.json`
- `jsui_report.json`
- `root_boxes.json`
- `patcher_tree.txt`

That is the easiest thing to hand another agent.

---

## Suggested workflow for future agents

### A. Start with archive truth

```bash
python tools/amxd/amxd_tool.py report '/path/to/device.amxd' /tmp/device-report
```

Read:

- `summary.json`
- `resources.json`
- `patcher_tree.txt`

before you start inventing architecture.

### B. Find the front panel and real parameter surface

```bash
python tools/amxd/amxd_tool.py params '/path/to/device.amxd' --visible-only
python tools/amxd/amxd_tool.py pattrs '/path/to/device.amxd'
```

Use visible parameter-enabled controls as the likely host surface.
Do not blindly expose every `pattr`.

### C. Search for the subsystem you care about

Examples:

```bash
python tools/amxd/amxd_tool.py search '/path/to/device.amxd' 'p sample'
python tools/amxd/amxd_tool.py search '/path/to/device.amxd' 'notein'
python tools/amxd/amxd_tool.py search '/path/to/device.amxd' 'jsui' --field maxclass
python tools/amxd/amxd_tool.py search '/path/to/device.amxd' 'windowTest'
```

### D. Inspect repeated ids carefully

Max box ids repeat across subpatchers. Use `box` to see all matches in context.

```bash
python tools/amxd/amxd_tool.py box '/path/to/device.amxd' obj-79
```

### E. Extract only the assets you actually need

For manual-port work, it is often enough to extract:

- patcher JSON
- scripts
- PNGs

Only pull the WAV bank when you are ready to audition the real sample path.

---

## How to structure follow-on Python tooling

If the next agent wants to extend this, do **not** write ten random one-off scripts unless the problem really demands it.

Recommended structure:

### Layer 1: one core archive/parser module
Keep these concerns together:

- file reading
- balanced JSON extraction
- recursive patcher walking
- resource scanning

That is already what `amxd_tool.py` does.

### Layer 2: one command surface with subcommands
Subcommands are easier to grow than loose snippet scripts.

Current good command families are:

- `summary`
- `inventory`
- `params`
- `pattrs`
- `tree`
- `search`
- `box`
- `resources`
- `jsui`
- `report`
- `extract`

### Layer 3: device-specific report generation
If BÄPP-specific reports are needed later, add them as:

- report writers
- focused search helpers
- validation scripts

Do not bake BÄPP assumptions into the core parsing logic unless the assumptions are truly format-level.

### Layer 4: validation harnesses separate from archive parsing
Keep these separate:

- archive inspection
- DSP validation
- UI validation
- event-runtime validation

The archive tool should tell you what exists.
The harness projects should prove behavior.

---

## Known limitations

- JSUI extraction is heuristic and based on `mgraphics.init()` script blobs.
- PNG extraction is simple signature-based extraction.
- Generic embedded JSON resources beyond the main patcher JSON are not fully reconstructed.
- WAVE naming assumes project media ordering matches RIFF ordering when counts line up.
- This is an inspection toolbox, not a full transpiler.

That is fine. The point is leverage, not fake perfection.

---

## Recommended next-agent sequence

For BÄPP specifically:

1. run `report`
2. inspect `patcher_tree.txt`
3. inspect `resources.json`
4. inspect `root_visible_parameter_enabled.json`
5. extract scripts / images / maybe WAVs as needed
6. start building the primitive lab and event lab

Do not disappear into generic importer fantasies before you have squeezed the real file for truth.
