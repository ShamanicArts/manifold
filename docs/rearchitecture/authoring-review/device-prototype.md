# A refined around Device: working prototype

The [Lucas + GPT review](https://github.com/ShamanicArts/gpt-scratchpad/issues/2#issuecomment-6116255716) selects A as the default style and makes Device the shared model. This prototype implements that decision without migrating the handbook or authored example library to new syntax.

Open the [highlighted source review](prototype.html). Its four examples are real imported modules, and its control/boundary descriptions come from actually lowering those modules. The review itself plays no audio.

## Public source and ownership

- [Gain effect](../../../packages/manifold/examples/gain.js): audio in, gain, audio out; one device-owned Volume control.
- [Filtered instrument](../../../packages/manifold/examples/tone.js): oscillator and low-pass filter with initial values declared through `configure`. The instrument also declares the conventional MIDI input; this free-running oscillator example does not consume it.
- [Spectral effect](../../../packages/manifold/examples/spectral.js): phase vocoder with Pitch/Mix controls and a configured FFT order.
- [Explicit Device](../../../packages/manifold/examples/explicit-device.js): the same spectral composition with explicit audio boundaries and an additional MIDI input. Declaring MIDI makes the port available; it does not automatically make pitch follow notes.

`createDevice({ id, name })` owns semantic processor instances, ports, controls and connections. `id` determines the instance namespace and continuity; `name` is display text retained in source. Neither is a filename, marketplace ID or binary plug-in ID. No new export-ID contract is introduced.

`createEffect` adds conventional stereo input/output. `createInstrument` adds MIDI input/stereo output. Both return the same Device declaration and allow more boundaries. Runtime behaviour follows those boundaries, not a role enum. Device contains no DSP state and opens no audio device.

In the explicit example, `device` is an ordinary JavaScript variable name chosen
for clarity. Each later `device.input(...)` or `device.control(...)` uses that
same object. The author could choose `effect` or `spectralShift` and update those
uses consistently. In `const spectral = device.add('spectral', phaseVocoder)`,
the unquoted `spectral` is a local variable, the quoted `'spectral'` is stable
authored identity, `phaseVocoder` is the imported definition, and `add` is a
Manifold method. Renaming a local variable does not rename the stable identity.
The [example-writing rule](../creative-authoring-style.md#names-carry-meaning)
requires teaching these distinctions before assuming them in the wiki.

Imported definitions retain their parameter and port types. `lowPassFilter` is a definition over the existing SVF with low-pass mode configured. `configure` records initial parameter values; live changes still use accepted host commands. Device controls own their public ranges/defaults/labels and produce reusable references. A default view derives from those controls; it does not declare their metadata again. A control's default is the initial value of its target parameter when exposed.

The private local [manifold package](../../../packages/manifold/package.json) provides the creative entry point. Its `manifold/graph` entry exposes `lowerDevice` and the existing expert graph contract. Existing `@manifold/author` imports retain their contracts. The implementation stays over the current authoring machinery; there is no second runtime. This local package is not an npm release or a claim to registry availability.

`lowerDevice` returns a detached GraphWorkspace draft, existing portable project and generated view. Source evaluation uses the same lowering in browser and native JS. Existing saved instance records and explicit host-slot mappings preserve identity across reconstruction; new declarations allocate unused numeric IDs in sorted semantic order. Local variable names and construction order do not define identity. Removed IDs are reserved during the next transition, not stored as permanent tombstones.

## Evidence

The focused JS/type checks cover actual module imports, convenience-to-explicit equivalence with mixed audio/MIDI, processor/control reordering, local variable renaming, additions with preserved node IDs and host slots, accepted values through save/reopen, atomic source rejection, detached expert drafts, ownership errors and source navigation. Studio's real TypeScript service offers phase-vocoder members and `configure` fields; invalid parameter members and incompatible port domains fail type checking.

Browser inspection of the real shared runtime retained Pitch = 3 through a source edit and reopen, found the spectral declaration, and returned its generated view. All four source-review pages matched their source files, had no JS exceptions, and fit a 390px viewport. This was a runtime/source review in an automation tab, not an audible browser or native GUI session.

The native JS integration test starts with the Device's declared buses, processes actual gain audio, accepts a Volume change, renames the local processor variable, and recalls both the accepted value and edited source. It uses the existing native controller and `process_io` adapter. Changing host bus identities on an already-running native plug-in requires a new host; this prototype does not override that existing constraint.

Offline native/Wasm comparison rendered 6,144 frames of each example at 48 kHz, with no audio device opened:

| Example | Maximum absolute sample difference | Wasm RMS |
| --- | ---: | ---: |
| Gain | 0 | 0.1284675252 |
| Filtered tone | 0.0000000298 | 0.0571907215 |
| Spectral | 0.0000011623 | 0.0908877033 |

The native renderer applies its existing callback heap guard. These finite offline comparisons do not establish glitch-free live switching, timing under load or every processor's state continuity.

Validation at this checkpoint: `npm --prefix web test` passed its generated catalog/package checks, existing TypeScript contract checks and all **177 JavaScript tests**. The production web build passed. The focused native Device integration test passed. The complete Rust workspace suite and physical native/browser GUI audio sessions were not rerun for this prototype.

Reproduce from the checkout:

```bash
npm --prefix packages/manifold ci --ignore-scripts
npm --prefix web ci --ignore-scripts
npm --prefix web test
npm --prefix web run build
cargo test -p manifold-project-js --test device_authoring
cargo build -p manifold-native --example render_io_graph
node scripts/verify-device-prototype.mjs /tmp/manifold-device-proof
node docs/rearchitecture/authoring-review/build-prototype.mjs
```

Generated controller bundles/packages were rebuilt because the shared evaluator gained Device imports. Their existing authored source/examples retain the old syntax; rebuilding those bundles is not the requested broad authoring migration.

## Limits before broad migration

This first slice supports stereo audio buses and one host MIDI event input. Extra signal/boundary types fail explicitly. Wider channels, MIDI outputs, service declarations and nested Device composition remain open; the common model must grow through explicit capabilities rather than role restrictions.

Explicit named declarations support source navigation. Arbitrary helpers still fall back to their source file. Studio's visual graph rewrite operations still expect its older editable-source conventions; do not present these prototype files as replacements for the current blank template yet. Custom presenter helpers, compiled identity tombstones/migrations, full host capability reporting and public packaging are also follow-up work.

The source is ready for the review requested in the feedback. Review the working syntax before migrating the wiki, starter template, generated primitive examples and agent guidance.
