# How Manifold fits together

A useful starting point is a small effect: audio enters a gain node, a parameter controls its level, and audio leaves the graph. You might put a slider around that effect on a website, run it in a plug-in host, or edit it in Studio. The processing intent can stay the same while the surrounding application changes.

## Library, environment and products

**Manifold** is the library. It supplies audio processing, a serializable graph contract, authoring APIs and runtime facilities. Rust crates serve native applications; the web-facing JavaScript/TypeScript API uses Wasm for processing. Your application chooses the parts it imports.

**Manifold Studio** is an application built on Manifold. It is a live, agentic environment for making and playing with music plug-ins and instruments. Studio owns the workspace: navigation, graph editing, files, inspector, source views, layout and agent integration. An embedded gain stage needs none of that workspace.

**Your instrument, plug-in or pack** is a downstream product. Its source, resources and presentation belong to that product. A reusable capability may belong in the library or Studio; a particular instrument's artwork and musical design remain its own.

## A project describes intent; a host makes it run

A graph describes nodes, connections, initial parameter values and exposed endpoints. Its language-neutral JSON contract lets authoring code and hosts agree on what should run. JavaScript and Rust provide authoring interfaces around that contract.

The host owns audio I/O, preparation, device setup and scheduling. On a website, your page supplies the `AudioContext`, input nodes and output destination. In a plug-in, the plug-in host supplies audio blocks and events. A document alone does not select your microphone or start a device.

This separation matters when you reuse an effect. The same authored gain graph can receive a website oscillator for a tutorial and a track's audio in another host. The oscillator in the tutorial belongs to the surrounding page; it is not secretly part of the effect.

## Import the processors you use

Examples name their dependencies so you can trace each tool back to its source:

```js
import { createDevice, oscillator, ringModulator } from 'manifold';

const device = createDevice({ id: 'sideband-laboratory', name: 'Sideband laboratory' });
const carrier = device.add('carrier', oscillator);
const modulator = device.add('modulator', oscillator);
const ring = device.add('ring', ringModulator);
```

This excerpt creates the parts. The [complete ring-modulation example](/learn/ring-modulation/) declares its audio output, configures its processors and connects them.

Read `const carrier = device.add('carrier', oscillator)` from right to left: ask this device to add an oscillator named `'carrier'`, then keep the returned instance in a local variable called `carrier`.

| Part | Where it comes from and what it means |
| --- | --- |
| `const` | JavaScript: declare a local name that cannot be reassigned. The object it names can still be configured. |
| `device`, `carrier`, `modulator`, `ring` | Local names chosen by this script's author. Every later `device.connect(...)` refers to the same `device` declared above. |
| `'carrier'`, `'modulator'`, `'ring'` | Stable names for those instances inside the device. They identify separate occurrences of a processor. |
| `oscillator`, `ringModulator` | Processor definitions imported from Manifold. The import shows their origin. |
| `.add(...)` | A method supplied by Manifold. Parentheses call it with the values inside. |

You could call the local `device` variable `sidebandLab` and consistently write `sidebandLab.add(...)` and `sidebandLab.connect(...)`. The quoted identities would stay the same. Changing a quoted identity tells Manifold that this is a different authored object; changing a local variable's spelling does not.

One imported oscillator definition can create many oscillators. `carrier.configure({ frequency: 220 })` declares the carrier's initial frequency. It does not configure every oscillator. Type `carrier.parameters.` or `carrier.outputs.` in Studio to discover that instance's named parameters or ports.

Named imports are the teaching convention, not a JavaScript restriction. A namespace import also works: `import * as manifold from 'manifold'`, followed by `manifold.oscillator`. Choose names that make the music and dependencies clear.

## Devices and convenient starting points

A Device declares its parts, connections, boundaries and public controls. `createDevice` starts with explicit boundaries; `createEffect` supplies conventional stereo audio input and output; `createInstrument` supplies MIDI input and stereo output. They produce the same kind of declaration. An effect can also declare MIDI input, and an instrument can also declare audio input.

The Device's `id` preserves authored identity; its `name` is what people see. Neither is a filename or a plug-in distribution identifier. Manifold allocates the graph's internal node numbers.

## Parameters give controls a stable meaning

An endpoint such as `/level` names a parameter independently of the widget that changes it. A slider, script, inspector or agent can address that path. The graph also identifies the underlying node and parameter numerically for the runtime.

An authored default and a live value are different things. The gain lesson declares `0.65` as its default. Moving the slider to `0.25` changes the accepted live value; it does not rewrite the declaration. Saving the live project preserves that value alongside its source.

Stable node identity also matters during editing. Where the runtime supports continuity, it uses identity and type to reconcile the old and new graph. Replacing source is not a promise that every effect tail, voice or external resource survives every structural change.

## Graph and source describe the same project

Studio's graph is a way to navigate and manipulate an implementation. It does not require every implementation detail to be expressed as nodes. A node can refer to a declaration inside a larger script, a dedicated implementation file, or a reusable graph with children.

The Explorer, source editor, graph and inspector share accepted project state. Source locations tell you where a node came from. Nested graphs give larger structures a useful interface while retaining an inspectable interior. See [graphs, files and source](/learn/graphs-and-source/) for the concrete navigation and editing rules.

## Audio and presentation run on different clocks

The audio runtime processes scheduled blocks. Presentation code reads analysis or other published values and draws at its own cadence. A slow canvas frame must not become the audio clock.

Preparation and graph compilation belong outside processing callbacks. The callback uses prepared resources; filesystem access, logging, locks and heap allocation do not belong there. The browser host adapter handles device and worklet setup while the Rust engine owns DSP behavior.

Presentation wires can carry values such as scalars or sampled fields; they are not audio-rate wires. Three.js is one possible renderer. Canvas, another web graphics library, or a project's own rendering implementation can fit the presentation contract. Available native rendering and packaging targets depend on the implementation and host.

## Where the public APIs live

The preview source is on the repository's [manifold-studio bookmark](https://github.com/ShamanicArts/manifold/tree/manifold-studio). This is the current development line, not a published stable release.

The public JavaScript entry point in this checkout is `manifold`. A suffix such as `/browser` selects a purpose-specific entry point; it is JavaScript module syntax, not a Rust convention.

| Surface | Entry point | Responsibility |
| --- | --- | --- |
| JS/TS creative authoring | `manifold` | Devices, imported processors, named ports and controls |
| Browser audio hosting | `manifold/browser` | Run Devices in a caller-owned AudioContext |
| Live project authoring | `manifold/live-project` | Accepted source, state, revisions and semantic edits |
| Expert graph tools | `manifold/graph` | Inspect/lower Devices and manipulate the canonical graph contract |
| Rust graph authoring and hosting | `manifold-native` | Rust authoring interfaces and native project preparation |
| Audio processing | `manifold-core` | DSP and audio state shared with Wasm builds |
| Wasm host adapter | `manifold-web` | Thin memory/host bridge around processing |

The [public JS/TS package](https://github.com/ShamanicArts/manifold/tree/manifold-studio/packages/manifold) is currently a repository-local development package, not a published npm installation. Existing internal packages and older project imports remain compatible. Package publication and a stable release remain separate work.

The expert entry point is useful for serializers, migrations and graph transforms. Ordinary examples do not require authors to allocate node numbers, unwrap processor type strings or build host-binding tables. The Device API lowers to that same graph contract and Rust audio engine.
