# Product

## Register

product

## Users

Musicians, producers and creative coders, including artists designing plug-in
presentations, and agents working with them. They author, inspect and perform
audio plug-ins with their own processing, controls and graphics, then distribute
those products independently.

## Product Purpose

**Manifold is the library.** Rust applications can use its crates; web
applications can use its JavaScript/TypeScript authoring and host APIs backed
by Wasm. Importing and using the library must not require Manifold Studio.

**Manifold Studio is a product built on Manifold:** an agentic, live environment
for creating and playing with music plug-ins and instruments. It provides files
and assets, the visual node-and-wire workspace, inspector, viewer, source editing,
agent interaction and project packaging.

Projects can be authored in Studio or built directly against Manifold and shipped independently. Nacre,
Orbit and other instruments are projects, not names or definitions of Studio.
Capabilities added while building a project belong to Studio or the framework
when they provide general authoring or runtime behavior.

Plug-ins, instruments and packs are downstream products, with their own identity
and dependencies. General framework capabilities belong in Manifold; editor and
agent-workspace capabilities belong in Studio. Audit the package boundaries
against these distinct responsibilities rather than requiring every consumer to
adopt the authoring environment.

Audio plug-ins remain the product scope. A project may keep a default audio
path and add no processing of its own; visual-only projects are not a separate
supported product category. Visual and mathematical components expand what
authors can build within a plug-in.

Embedded website audio is also a supported use of the Manifold library. Authors
can mount only the graph, component, controls or presentation they need, using
Web Audio without the Studio shell or a plug-in export. The interactive handbook
should demonstrate both project fragments and complete projects through these
same public capabilities. This does not introduce a visual-only project model.

Public naming is **Manifold** and **Manifold Studio**. “v2” is an internal
development name. A public version number, logo and landing page remain design
and release decisions; do not invent them. The wiki comes first: substantial,
accurate documentation for people and agents, with runnable examples and easy
paths between explanation, source, Studio and focused agent prompts.

Core and custom devices use the same authoring environment. Authors should be
able to use their chosen graphics library or framework, or author graphics
through Manifold's own facilities. Browser, embedded webview and native delivery
depend on the implementations and capabilities included in a project package.
This is the product direction, not a claim that every target already works.

See the [Studio boundary and redesign review](docs/rearchitecture/manifold-studio.md)
for the 11 October 2026 decision, current implementation gaps and proposed cut.

## Brand Personality

Expressive, legible, tactile. This follows Lucas's creative-authoring direction.

## Anti-references

Backend-only lab views, dense unexplained scripts, disposable toy exports and a
creator website embedded wholesale as the finished plugin face.

## Design Principles

- Studio is a usable product in its own right, independent of any example.
- Instruments and other authored products retain their own identity and presentation.
- One visual graph workspace contains components from different domains; domain
  runtimes retain their own scheduling and real-time requirements.
- Inspector, viewer, source and agents edit the same accepted project state.
- Script- and graph-declared objects can expose the same stable identity and
  interfaces. Authors can inspect and edit downstream rules, bindings and
  dependencies in the graph without having to open every implementation script.
- Both core and custom components are inspectable, reusable and packageable.
- A unified project browser exposes semantic objects, files and optional source;
  visual authoring does not require keeping scripts open.
- Workspace docking is a user preference; authored presentation sizing and
  nested composition belong to the project.
- Explicit imports and named controls make examples starting points for ownership.
- Automatic inspector layout supports iteration; authored presentation is separate.
- Immediate and retained views are choices over the same control semantics.

## Accessibility & Inclusion

Preserve accessible names and keyboard controls; avoid relying solely on color.
Use responsive layout and respect reduced motion. No conformance audit claimed.
