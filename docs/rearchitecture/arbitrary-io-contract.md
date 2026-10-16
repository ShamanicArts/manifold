# Arbitrary graph and host I/O

User requirement, 30 September 2026: **Manifold must support arbitrary input/output.**
This applies to authored primitive/module ports and to host buses/channel layouts.
Main's stereo default is one project configuration. It must not define the library's
I/O model. No gate is complete while browser/native/plug-in adapters enforce stereo
as the universal graph contract.

## Current evidence and limits

- The core already supports multiple named outputs and indexed, typed connections.
- The public configurable `mixer` now accepts 1–32 stereo input ports. Rust and JS/TS
  expose the configured ports, gains and pans; imported documents validate against
  those actual ports. This remaining primitive storage restriction must be removed;
  it is not an approved authoring quota.
- Fan-out is a connection property. Audio fan-in is currently represented explicitly
  by sum/mixer nodes because a compiled input owns one source.
- [The explicit audio bus checkpoint](explicit-audio-buses.md) adds `signal.io`
  version 1: named buses, channel counts, optional inputs and explicit channel maps.
  Rust, JS/TS, native scripted processing and prepared browser execution share it.
  The former library bus/channel quotas are removed. Storage follows the actual
  project; host adapters separately validate their protocol and device capabilities.
  [Scale proofs](io-storage.md) render up to 669 channels in native, SDK and Wasm
  paths, including a 300-channel logical bus.
- The old `AudioBlock` is a stereo convenience API. Explicit layouts use planar
  bus views and reject that convenience path. Existing version-1 projects keep
  their audible routes. The author workspace retains compatibility IDs 1/3, but
  those nodes no longer define the host I/O layout. Core compilation with an
  explicit layout needs no conventional stereo output node.
- Existing audio kernels still expose two lanes. Channel extraction, duplication
  and routing are explicit maps; arbitrary primitive/module widths and MIDI/control
  host buses remain open. [CLAP now discovers and processes the authored buses](clap-declared-io.md),
  with inactive host-supported layout changes and live compatible route changes.
  [VST3 projects wider logical buses as named mono host ports](vst3-declared-io.md)
  and shares the native copy boundary and allocation-free processing.

## Required implementation

1. Introduce versioned, named host bus declarations with stable IDs, direction,
   signal kind, channel count/layout and optionality. Accept generator-only inputs,
   mono, stereo, multichannel, multiple inputs/outputs and disconnected optional buses.
2. Declare primitive and authored module input/output ports from their configuration.
   Introspection, TypeScript, Rust, import validation and compilation must use the
   same resolved description. Scripts can compose modules with any admitted port
   arrangement; no Main-only builder or fixed host shape substitutes for that API.
3. Give audio ports explicit widths and channel maps. Validate each route. Mixing,
   duplication, extraction and channel conversion are explicit authored operations;
   host adapters must never silently truncate a declared bus or invent a connection.
   Keep MIDI, scalar control and voice payloads distinct from audio channel storage.
4. Compile channel/port slot offsets and capacities off callback. The processing API
   consumes planar channel views and a frame range; stereo kernels advertise their
   real capabilities. No callback allocates scratch or pointer arrays, compiles
   routes or creates kernels. Bounded borrowed views may use stack storage.
5. Import existing version-1 stereo documents into the new declarations without
   changing their audible routes, endpoint IDs, PCM bindings or saved controller state.
   Configuration edits preflight dangling cables, exported ports and automation.
6. Carry the same layout through standalone/native library rendering, Wasm memory ABI,
   AudioWorklet channel negotiation, CLAP audio-port configuration and VST3 bus
   arrangement negotiation. An unsupported host layout returns a concrete capability
   error while preserving the active graph and sound.
7. Prove mono → stereo routing, stereo → multiple outputs, an asymmetric multichannel
   layout and multiple independent buses, including absent optional inputs, saved
   recall and live layout/configuration edits. Check actual channel identity with
   distinct signals, callback heap guards, native/Wasm agreement and real SDK probes.

This work remains part of R01/R04/R05/R06/R09, and is a dependency of Main's public
composition and module APIs. It is not deferred to an unspecified post-port release.

Continue native device/service negotiation, broader real-host shape replacement
coverage, public primitive/module port widths and non-audio host boundaries.
Library and SDK proofs do not establish every physical device or DAW capability.
