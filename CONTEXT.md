# Manifold authoring language

Manifold audio plug-in projects describe authored behavior and presentation as
inspectable graphs. Audio, visual and mathematical components share the vocabulary;
the current executable graph is still primarily DSP. Proposed extensions are
recorded in [the Studio review](docs/rearchitecture/manifold-studio.md).

## Products

**Manifold**:
The audio plug-in library/framework for authoring and running projects, with or
without Studio.

**Manifold Studio**:
The primary Manifold v2 product: files, assets, the visual graph workspace,
inspector, viewer, source editing and distribution tools.
_Avoid_: Nacre editor, an instrument face

**Authored product**:
A project distributed as an audio plug-in or its standalone/browser form.
Nacre and Orbit are examples. Its presentation belongs to that product.

## Composition

**DSP primitive**:
An atomic audio, control, or event operation exposed with documented ports, parameters, and behavior.
_Avoid_: preset, module, instrument

**Graph module**:
A reusable authored composition with an explicit public interface. Today's
Studio modules expand bounded sets of DSP primitives; general nested multidomain
composites are a proposed extension, not a delivered capability.
_Avoid_: primitive, hidden processor

**Component / device**:
An authorable unit with a definition, named typed ports, parameters and lifecycle.
It may be a core implementation, custom code or a composition. Core/custom
describes distribution and maintenance, not whether it appears in the graph.

**Project**:
A versioned, loadable audio plug-in with authored behavior, resources and
optional presentation. It retains a valid audio contract even when the author
adds no custom audio processing. Visual-only projects are not a separate category.
_Avoid_: patch, plug-in binary

**Preset**:
A named set of project configuration and parameter choices.
_Avoid_: project, graph module

**Graph instance**:
A uniquely identified occurrence of a component within a project.
_Avoid_: node type

**Port**:
A named, typed point on a graph instance or project boundary. Existing executable
ports carry audio, control or MIDI. Resource, geometry and presentation ports
need distinct types and lifecycle rules in the multidomain extension.
_Avoid_: implicit route

## State and presentation

**Authored graph**:
The accepted project structure that authors can inspect and edit, including
graph instances and their connections. The proposed multidomain document is
distinct from its compiled DSP or presentation plans.
_Avoid_: execution plan, rack layout

**Visual graph workspace**:
Studio's node-and-wire editing canvas, containing components from all supported
domains. Here "visual" describes the editor, not a separate graphics-only graph.

**Viewer**:
A Studio surface showing a selected project output or authored presentation.
Its camera and preview controls are distinct from authored project behavior.

**Execution plan**:
The prepared domain-specific form used to execute authored behavior. The
existing DSP plan produces sound/events; presentation must not drive its clock.
_Avoid_: project, saved graph

**Project state**:
The persistent choices needed to reopen a project with the same intended behavior.
_Avoid_: editor frame state

**View**:
A presentation of project state and graph behavior that can request edits but does not own the graph.
_Avoid_: project logic
