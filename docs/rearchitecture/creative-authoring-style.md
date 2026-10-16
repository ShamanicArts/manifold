# Manifold scripts as creative material

Status: direction agreed with Lucas on 2 October 2026. The principles below
record the scripting discussion; proposals are implemented only where linked
deliveries provide evidence. [Semantic hover, completion and source color pickers](editor-code-insight.md)
are now available in the shared CodeMirror editor. This supplements the
[authoring contract](authoring-contract-proposal.md) and
[delivery goal](proposed-delivery-goal.md). It does not replace their behavior or
host acceptance gates.

## 12 October clarification: explicit processors and instance identity

The subsequent [Lucas + GPT review](https://github.com/ShamanicArts/gpt-scratchpad/issues/2#issuecomment-6116255716)
selects named-object authoring as the default, with **Device** as the common
declaration model. Effect and instrument factories supply conventional
boundaries; their roles must not prohibit mixed audio, MIDI or other explicitly
supported capabilities. Stable `id` and display `name` are separate.
`configure(...)` declares initial state; device-owned controls define the public
interface once and feed generic/custom presentation and other consumers.

The [working Device implementation](authoring-review/device-prototype.md) was
reviewed and accepted as the basis for migration on 12 October. The public
entry point is now the repository-local `manifold` package. `manifold/graph`
retains the expert contract; existing `@manifold/author` imports remain compatible.
Registry publication is still release work.

Lucas's governing criterion is **expose semantic complexity; hide incidental
complexity**. Design for musicians first, with or without programming experience.
Make the musical objects, dependencies, connections, identity and control choices
explicit. Do not make ordinary authors allocate runtime node numbers, unwrap
processor type strings or construct serialization and host-binding machinery.
Experienced programmers should enjoy the same readable default path.

The [first public example migration](device-authoring-delivery.md) makes gain,
ring modulation and spectral processing real Device examples in the wiki and
adds direct browser hosting with reusable control references. The subsequent
[Device and Studio completion pass](device-authoring-completion.md) adds nested
Devices, source-backed Studio graph edits, the Device starter and instrument
lessons. Historical primitive/advanced projects retain their expert contract.

## Purpose

Manifold scripts are material for artists, producers, musicians and their agents
to understand, experiment with and take ownership of instruments. Shipped
examples express our preferred style as well as demonstrating the API. Optimize
them for finding an idea, changing it and hearing the result.

Use ordinary JavaScript modules and optional TypeScript types. Manifold supplies
domain vocabulary, declarations and an authoring environment. Its creative role
informs how that JavaScript reads. Authors can still write compact, generated or
unconventional code; the preferred style governs our examples, templates and
agent guidance rather than restricting the language.

## Objects define the audio graph

Lucas clarified that object-oriented organization fits the definition of audio
graphs: named modules, instances, ports and parameters expose discoverable
interfaces and compose into a readable instrument definition. Favor composition
and clear object interfaces; a class hierarchy is not a requirement.

Keep reusable module definitions, instance references in an authored graph, and
running DSP state distinct. Calling an authoring method records or edits the
graph definition. Rust validates and prepares that definition into an executable
plan outside the audio callback. Authoring objects must not become another owner
of audio state or a second DSP execution path. Accepted live changes continue
through the same runtime publication contract.

## A recognizable reading order

Prefer the following sections, omitting those the project does not need:

| Section | What a reader should learn |
| --- | --- |
| Imports | Which Manifold tools, primitives and reusable modules this instrument uses. |
| Identity and intent | What it does, its stable project identity and necessary capabilities. |
| Interface | Named inputs, outputs, controls, units, ranges, choices and defaults. |
| Composition | Which instances exist, how signals connect, and how controls bind to them. |
| Live behavior | Responses to MIDI, gestures, transport, network messages and graph edits. |
| Presentation | The controls, groups, meters and custom views the player sees. |

This is a default reading order, not a mandatory linear file format. Large
projects can put composition, behavior and views in separate modules. Keep the
entry module's interface and purpose easy to find. Small examples need little
ceremony: do not add empty sections or a new framework for each instrument.

## Names carry meaning

Introductory examples must distinguish JavaScript vocabulary from Manifold
vocabulary. Do not assume prior programming knowledge because the interface is
code. Use `device` when introducing `createDevice`, `effect` for `createEffect`,
and `instrument` for `createInstrument`, then explain that these are ordinary
author-chosen JavaScript variable names. They are not Manifold keywords,
required identifiers, or runtime roles. Later lessons can introduce more
personal or descriptive names.

Teach the distinctions at the first encounter, beside the example:

```js
const spectral = device.add('spectral', phaseVocoder);
```

| Part | Meaning |
| --- | --- |
| `const` | JavaScript declares a name that cannot be reassigned. The object it refers to can still be configured. |
| `device`, `spectral` | Local JavaScript names chosen by the author. `device` refers to the object declared earlier; `spectral` names the returned processor instance. |
| `'spectral'` | Stable authored identity of that processor inside the device. Its spelling is chosen by the author, but changing it changes identity. |
| `phaseVocoder` | The Manifold processor definition imported at the top of this example. Imports can be aliased; the example should make the origin clear. |
| `.add(...)` | A method supplied by Manifold; parentheses call it with the values inside. Other members such as `inputs` and `parameters` expose references rather than being local variable names. |

Explain a rename concretely: changing the local `device` name to `spectralShift`
means updating its uses to `spectralShift.input(...)`,
`spectralShift.control(...)` and so on. Changing local names consistently keeps
the authored IDs, saved identity and wiring intact. It does not require changing
quoted identity strings. This teaching belongs in human examples and agent
guidance alike; agents should generate code people can understand.

Convenience constructors remain extensible. Adding MIDI does not require
replacing `createEffect` with `createDevice`; use the general constructor when
teaching explicit boundary declaration, not as a supposed escape from a role
restriction.

- Import needed factories or definitions explicitly. A named module import
  should tell the reader whether they are using a multi-effect module, a pulse
  oscillator or a filter. Namespace imports are useful when the namespace adds
  clarity. Avoid blanket imports in teaching examples by default.
- Convenience and teaching have different needs. A namespace import may expose
  a package's public exports; examples should name each dependency and its
  source module so a newcomer knows where to find it. Apply this to utilities,
  host services and event wiring as well as DSP definitions. Describe why the
  host supplies a capability and show the handler registration in the sketch;
  a configuration object alone does not explain where incoming events arrive.
- Show namespace imports as an optional convenience where useful:
  `import * as manifold from 'manifold'`. Members such as
  `manifold.createEffect` and `manifold.gain` retain their explicit origin.
  Host adapters and expert tools use their documented entry points; import
  those explicitly when the example needs them.
- Parameters belong to instances. Import an oscillator definition, create a
  named instance, then access its named pulse-width parameter. Importing a
  parameter definition or enum can be useful, but must not accidentally create
  one shared mutable parameter across every instrument instance.
- Prefer names such as `voice`, `filter`, `cutoff`, `mainInput` and `mainOutput`.
  Public member names describe behavior; internal numerical IDs remain available
  for inspection and compatibility.
- An author must be able to discover a module's ports and parameters without
  memorizing numbers: completion, hover information and an inspectable catalog
  should show names, signal types, units, ranges, enum choices and documentation.
- Distinguish audio, CV, gate and MIDI inputs from user controls. Outputs can be
  audio or events; meters and visual data are separate observable results. The
  same interface model must retain arbitrary bus and channel layouts.
- Declare units and mappings honestly. Hz, semitones, seconds, beats, dB and
  normalized values are different. A number is fine when its context explains
  it. A musical control that transforms into a kernel value exposes that
  transformation rather than implying the two values are identical.
- Keep stable instance and control identity explicit. Reordering construction
  or renaming a local JavaScript variable must not silently change saved
  automation, routes or state identity. Identity changes need migration rules.

## Declare a control once

The public interface is the authoritative declaration of a control's identity,
default, range, unit and choices. Graph bindings, UI widgets, automation and
network endpoints refer to that control. They do not repeat competing defaults
or ranges. Views may choose presentation options and several widgets can expose
the same control.

Keep authored defaults, accepted live values, pending edits and instantaneous
modulated values distinct. Code and UI must make clear which one is being shown
or changed. Saved state restores live values using the established runtime
contract; rebuilding a view does not reset the instrument.

## Show the instrument's relationships

Use explicit signal connections in elementary examples. Separate node creation,
control binding and signal routing so a reader can trace the path. A concise
connection helper can be useful once its semantics are familiar; density alone
does not make it clearer.

For repeated structures, use named builders or modules whose purpose is apparent.
An eight-band EQ can use a loop for eight repeated bands. Its primary example
should reveal the band's interface and routing, rather than consist of opaque
tuples and a generic generator. The expanded graph and module source remain
inspectable. Never hide a product graph inside a special host processor to make
the script shorter.

Use comments to explain musical intent, useful experiments and surprising
behavior. Prefer "Raise resonance for a sharper peak" to narrating an assignment.
Do not replace explicit connections, conversions or capability declarations with
comments. One statement per line is the default for examples; compact expressions
are appropriate when they make the musical relationship easier to read.

Keep graph/control behavior usable without a renderer. Retained JS/TS components
and immediate egui widgets bind to the same interface and accepted runtime.
Custom drawing and browser views remain available. Simple instruments can derive
a default control panel from their interface; deliberate custom presentation
stays visible and editable.

## Structured declarations support the environment

Give the editor recognizable, typed declarations for the interface, composition
and presentation. The declarations produce inspectable records through the same
graph contract. Section comments, variable names and source-text regular
expressions are not the authority for runtime meaning.

Desired assistance includes:

- Insert an input, output, primitive or control with readable source and stable
  identity; offer compatible ports and properties from the canonical catalog.
- Generate a starting control panel from declared controls. Keep generated
  source editable and preserve custom presentation through defined rules.
- Select a control or node and find its declaration, binding and documentation;
  select source and highlight the corresponding live element.
- Offer focused experiments with units and musical explanations, then show an
  accepted change and an audible result.
- Give agents the same discoverable interfaces, source, snapshots, diagnostics
  and acknowledged edit commands that the human author uses. Agent-authored
  code follows the same example style.

Arbitrary JavaScript can compute a graph at runtime, so complete reversible
source mapping cannot be assumed. Record semantic declarations during execution
and attach source locations where supported. If a generated structure has no
safe source edit, show its builder/module origin and explain the available edit
instead of guessing. Helpers must not rewrite user code from an incomplete view.

## Executable reading examples

The [gain effect](../../web/handbook/examples/gain.mjs),
[sideband laboratory](../../web/handbook/examples/ring.mjs) and
[spectral transposition](../../web/handbook/examples/spectral.mjs) are the actual
source used by the interactive wiki lessons. They import rich definitions,
configure initial state, declare controls once and connect typed ports. Studio
can locate those declarations and retain accepted values through source edits
and save/recall. No new DSP owner or graph contract was introduced.

Use two-space indentation, single quotes and roughly 100-character lines; the
checked-in formatter configuration expresses that style. The remaining historic
GraphWorkspace examples are compatibility and migration material, not the
preferred introductory language.

## Current gaps and next delivery

Nested Device composition, richer configuration/resource authoring, custom
presentation helpers and Studio structural source rewriting must still be
integrated with the Device model. The current general graph and reusable audio
composition tools retain their existing contracts. Do not declare these workflows
migrated merely because a new source file can be evaluated.

General dependency loading, published package distribution and broader native
and plug-in lifecycle acceptance remain separate delivery gates. The
[delivery record](device-authoring-delivery.md) identifies the verified scope.

## Later: interactive graph tutorial

Lucas proposed an interactive tutorial for working with graph interfaces, to
follow later. It can teach discovering a module's properties, connecting named
ports, binding controls and hearing live edits using the actual public API and
runtime. This is a future learning feature, not a prerequisite for the next
sounding example or a substitute for porting the remaining behavior.
