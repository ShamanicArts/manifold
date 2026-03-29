# Module, Composition, and Progressive Exposure Architecture Worksheet

## Abstract

This document is a context-free architectural worksheet for a modular audio application that supports both visual composition and code-driven extension.

It is written for a reader who does not know the codebase, prior implementation history, or prior conversations.

The purpose of this worksheet is to explore how an application can support all of the following at the same time:

- polished, fully-featured instruments and effects for immediate use;
- smaller composable modules for advanced artists and technical users;
- direct code-level inspection and editing of module implementations;
- future macro/composite modules built from the same underlying building blocks;
- a coherent module model that allows the same functionality to be surfaced at multiple layers of abstraction.

This document intentionally does **not** lock the system into a single decomposition strategy up front. It is a working architecture worksheet, not a final irreversible design.

## Temporary implementation note: rack oscillator keyboard parity

During the oscillator vertical-slice extraction, the instantiable `rack_oscillator` module is temporarily allowed to inherit hidden keyboard note pitch when its `v/oct` input is **not** explicitly patched.

This is a compatibility shim to preserve behavioral parity with the legacy sample-synth source path, which still receives note pitch out-of-band from the keyboard/voice allocator while ADSR provides the amplitude envelope.

This shim is transitional only. The intended long-term direction is an explicit rack-visible note/control source path rather than hidden pitch injection.

---

## Document Status

| Field | Value |
|-------|-------|
| Status | Active architecture worksheet |
| Audience | Designers, developers, advanced technical users, future maintainers |
| Scope | Module packaging, palette exposure, composition model, inspection/editing model, macro/composite model, module taxonomy, future extraction strategy |
| Out of scope | Low-level implementation details of any one DSP algorithm |

---

## Problem Statement

A modular creative application often faces a false binary:

- either expose only large, polished modules and hide internals;
- or expose many small utilities and overwhelm normal users.

That binary is unnecessary.

A more capable system should support multiple workflows:

### Workflow A: Immediate use / no-code composition

A user wants to drag in complete instruments, effects, and modulators and make music without programming.

This workflow values:

- strong defaults;
- coherent, high-level modules;
- low cognitive overhead;
- visually understandable signal flow;
- discoverability.

### Workflow B: Advanced artistic composition

A user does not want to write code, but wants more freedom than a fixed set of large modules provides.

This workflow values:

- smaller composable units;
- operators, analysis blocks, utility blocks, automation blocks;
- the ability to route, transform, and recombine modules in non-standard ways;
- layered complexity rather than one rigid preset module.

### Workflow C: Developer / module author workflow

A user wants to inspect and modify how modules are implemented.

This workflow values:

- seeing attached scripts and behaviors;
- seeing what DSP or graph structure is attached to a module;
- understanding exported params, commands, runtime state, and ports;
- the ability to fork, edit, and repackage a module;
- introspection that reveals implementation rather than hiding it.

### Core challenge

The system should support all three workflows without building three unrelated architectures.

The same underlying implementation should be able to appear as:

- a large polished module;
- a smaller utility module;
- an inspectable module definition;
- a macro/composite built from the same building blocks.

---

## Guiding Premises

This section records candidate premises that should be validated or rejected during design. They are not final doctrine.

### Premise 1: One implementation may need multiple abstraction levels

A capability may be useful when presented as:

- a complete end-user instrument;
- a mid-level composable module;
- a low-level utility or analysis block;
- a developer-visible implementation module.

Therefore, the system should not assume a 1:1 mapping between:

- implementation unit,
- palette item,
- inspector item,
- macro,
- and end-user concept.

### Premise 2: Backend decomposition and palette decomposition are different concerns

The backend may need to be decomposed into fairly fine-grained reusable parts.

The palette should not necessarily expose every backend part by default.

A useful rule of thumb is:

- the threshold for "should exist as a backend component" is relatively low;
- the threshold for "should exist as a user-facing palette module" is significantly higher.

### Premise 3: Polished modules and small utility modules should both be first-class

The system should not imply that only large "finished" modules are real.

It should also not imply that small utility modules are second-class hacks.

Both should be legitimate modules. The difference should be in exposure level, category, and default presentation, not in whether they are considered "real" modules.

### Premise 4: Macro/composite modules should be real compositions, not UI illusions

If a high-level module is composed from lower-level building blocks, that relationship should be meaningful in the backend, not merely cosmetic.

The system does not need user-facing visual macro authoring on day one. But backend composition should be real enough that future macro authoring would be possible without replacing the whole architecture.

### Premise 5: Introspection is a primary design requirement, not an afterthought

A module should ideally be inspectable:

- what scripts are attached to it;
- what behaviors it uses;
- what DSP or graph structure it contains;
- what ports, params, commands, and runtime values it exports;
- what metadata, docs, and source files are associated with it.

If this data is not modeled cleanly, later inspection and editing becomes brittle.

---

## Design Goals

### Primary goals

1. Support multiple abstraction levels in one coherent module system.
2. Allow polished high-level modules and granular composable modules to coexist.
3. Make module implementations inspectable and eventually editable in-context.
4. Allow future macro/composite modules to be built from the same core building blocks.
5. Preserve a clean enough module model that code and visual composition can meet in the same system.
6. Avoid forcing every capability into a single type of module or a single signal domain.

### Secondary goals

1. Keep the default palette approachable.
2. Avoid exploding the beginner-facing experience with low-level technical modules.
3. Keep options open for future user-authored modules, scripted modules, or code-generated modules.
4. Support future automation, analysis, and utility module families without inventing one-off systems for each.

### Anti-goals

The system should avoid:

- making every tiny internal helper a default visible palette module;
- hard-coding a permanent divide between "simple users" and "advanced users" in separate incompatible architectures;
- requiring front-end macro tooling before backend composition becomes real;
- forcing all modules into the same domain model when they may belong to different domains (for example, audio source vs control vs analysis);
- conflating persistent parameters with commands or runtime readback.

---

## Core Concept: Module

This worksheet uses the term **module** deliberately.

A module should not be thought of only as a UI box or only as a DSP unit. A module is a named, inspectable unit that may contain several surfaces and several implementation attachments.

### Candidate module definition

A module is a unit that may define all or some of the following:

- visual representation;
- ports;
- persistent parameters;
- commands/actions;
- runtime/readback values;
- attached scripts;
- attached behaviors;
- attached DSP or graph implementation;
- metadata and documentation;
- composition metadata (for example, whether it wraps a subgraph or exposes a subset of internal surfaces).

### Why "module" matters

Thinking in modules instead of only visual components solves several problems:

- a module can have a polished UI *and* a lower-level implementation behind it;
- a module can be exposed in different ways depending on context;
- a module can be inspected in a side panel or editor;
- a module can be wrapped inside a macro/composite;
- a module can be forked, customized, or extended later.

---

## Candidate Surface Model

A module may expose four main operational surfaces. This is not necessarily the only valid model, but it is a useful starting point.

### 1. Parameter surface

Persistent or presettable scalar state.

Examples:

- cutoff frequency;
- resonance;
- playback root note;
- stretch amount;
- additive tilt;
- unison count.

Characteristics:

- should serialize cleanly;
- should generally be automatable and modulatable where appropriate;
- should not be used to represent one-shot actions.

### 2. Command surface

One-shot actions or imperative triggers.

Examples:

- capture now;
- clear sample;
- rescan sources;
- reset phase;
- analyze now;
- reload implementation.

Characteristics:

- may not serialize at all;
- should usually not be treated as a persistent value;
- may be exposed as buttons, triggers, or message endpoints.

### 3. Runtime/readback surface

Ephemeral, inspectable state.

Examples:

- whether analysis is in flight;
- currently loaded asset or source identity;
- measured playback position;
- waveform cache version;
- detected pitch;
- internal mode state;
- debug metrics.

Characteristics:

- often useful for UI display and introspection;
- may be useful as a source for automation or modulation in some systems;
- generally should not be serialized into presets unless intentionally promoted to persistent state.

### 4. Port surface

Explicit graph connectivity surface.

Examples:

- audio input/output;
- control signal output;
- note/gate input;
- modulation input/output;
- analysis signal output;
- utility triggers.

Characteristics:

- may vary heavily by domain;
- should not be assumed to be only audio;
- may eventually support several categories of flow, not just one.

### Open question: should "implementation attachment surface" be modeled explicitly?

In addition to the four operational surfaces above, it may be useful to treat implementation attachments as a fifth inspectable surface:

- UI component file;
- behavior file;
- DSP script;
- internal graph definition;
- schema file;
- docs or examples.

This is especially relevant if the right-hand inspector/editor is expected to show implementation-level information.

---

## Candidate Taxonomy Dimensions

A single flat module type is unlikely to be sufficient. The system may need several orthogonal dimensions.

These dimensions are presented as candidates, not fixed final enums.

### Domain

Where the module fundamentally lives.

| Domain | Meaning |
|--------|---------|
| voice | Per-voice or voice-instanced sound/control behavior |
| bus | Shared post-mix or global processing behavior |
| control | Modulation, envelopes, generators, utility control logic |
| utility | Support functions, analysis, asset management, transforms, helpers |
| macro | Composite module wrapping one or more lower-level modules or subgraphs |

### Role

What the module fundamentally does.

| Role | Meaning |
|------|---------|
| source | Generates material (audio or control) |
| operator | Combines, transforms, or mediates between sources |
| insert | Processes an incoming stream |
| modulator | Generates control/modulation data |
| analysis | Measures or derives information from a signal or asset |
| automation | Applies timing, mapping, sequencing, or transformation to control data |
| asset | Owns or manages external/media/resource references |
| composite | Wraps several capabilities into one module |

### Exposure level

Who a module is intended for by default.

| Exposure | Meaning |
|----------|---------|
| default | Safe and appropriate for the main landing palette |
| advanced | Useful for deeper composition but not necessary for beginners |
| developer | Mostly useful when inspecting, extending, or authoring modules |
| internal | Not intended for direct normal exposure, though still possibly inspectable |

### Instancing model

How the module behaves at runtime.

| Instancing | Meaning |
|------------|---------|
| singleton | One shared instance for the graph or rack context |
| per_voice | Instanced for each voice or note path |
| per_use | Instanced when inserted or referenced |
| composite | Wraps a subgraph whose internal instancing rules may differ |

### Asset awareness

Whether the module has meaningful external or project resource identity.

Candidate values:

- none;
- reads asset references;
- owns asset references;
- can generate or capture assets;
- can derive analysis artifacts from assets.

### Suggested principle

Taxonomy dimensions should remain orthogonal where possible. For example, a module might be:

- domain = voice,
- role = source,
- exposure = default,
- instancing = per_voice,
- asset awareness = owns asset references.

This is more expressive than a single monolithic "module type."

---

## Progressive Exposure Model

The system should support *graduated reveal* or *progressive disclosure*.

This means a capability can remain one coherent module while being surfaced differently to different users or in different UI contexts.

### Default-facing layer

The default/home palette might emphasize:

- complete instruments;
- complete effects;
- common modulators;
- obvious utilities;
- curated templates/macros.

This layer prioritizes approachability.

### Advanced-facing layer

An advanced palette or search mode might expose:

- operators;
- analysis modules;
- utility modules;
- automation and mapping modules;
- lower-level source variants;
- more granular composition pieces.

This layer prioritizes flexibility.

### Developer-facing layer

A developer or inspector mode might expose:

- internal modules;
- implementation attachments;
- module metadata;
- source file links;
- subgraph internals;
- debugging surfaces.

This layer prioritizes transparency and editability.

### Key principle

A module being hidden from the default palette should **not** imply it is not first-class. Visibility policy and module legitimacy must be separate concerns.

---

## Palette Design Considerations

The palette may eventually contain a large number of modules. This is acceptable if discovery and curation are good.

### Candidate palette strategies

#### Category-first palette

The palette is organized into categories such as:

- Instruments
- Effects
- Modulators
- Utilities
- Analysis
- Operators
- Automation
- Templates / Macros
- Experimental

#### Search-first palette

The palette emphasizes fuzzy search, tags, and metadata over deep category browsing.

#### Hybrid approach

A default category landing page plus a global search experience.

This is often the most practical option.

### Candidate category metadata

Each module may declare:

- one primary category;
- zero or more secondary tags;
- exposure level;
- domain;
- role;
- author/source;
- stability level (stable, preview, experimental);
- complexity level (basic, advanced, expert).

### Open question: should low-level modules be hidden by default or merely deprioritized?

Two options exist:

- hide advanced/internal modules unless explicitly enabled;
- show them all in search, but rank default-friendly modules first.

This is a product design choice and may not need to be decided immediately.

---

## Inspector / Side Panel Model

A central idea in this worksheet is that selecting a module should reveal a rich inspector rather than only a shallow property panel.

### Inspector goals

When a module is selected, the inspector should ideally be able to show:

- module identity and category;
- exported params;
- exported commands;
- runtime/readback values;
- port definitions;
- attached scripts and behaviors;
- attached DSP implementation or graph references;
- module docs/notes;
- potentially a subgraph or implementation graph view.

### Candidate inspector sections

#### 1. Summary

- module name;
- description;
- domain;
- role;
- exposure level;
- author/source;
- version or revision identity.

#### 2. Ports

- inputs/outputs by type;
- direction;
- port labels;
- semantic role;
- domain-specific notes.

#### 3. Parameters

- persistent state;
- ranges/defaults;
- modulation/automation eligibility;
- serialization behavior;
- mapping or scaling notes.

#### 4. Commands

- triggerable actions;
- optional payload schema;
- side effects;
- whether safe during playback.

#### 5. Runtime values

- diagnostic values;
- readback state;
- status indicators;
- analysis state;
- current asset binding;
- timing and activity state.

#### 6. Implementation attachments

- UI definition file;
- behavior file(s);
- DSP script(s);
- subgraph definition;
- generated artifacts;
- other implementation modules.

#### 7. Composition view

If the module is a composite or wraps a subgraph:

- internal module list;
- exposed vs internal surfaces;
- exported mappings;
- internal graph view.

### Open question: inspector editing scope

Possible editing modes:

- inspect-only;
- safe parameter editing only;
- script/source editing;
- graph editing;
- fork-and-edit module workflow.

These do not all need to arrive at the same time.

---

## Macro / Composite Model

A major architectural goal is to support larger "mega modules" while preserving a consistent lower-level system.

### Candidate definition of macro/composite module

A macro/composite module is a module that:

- wraps one or more lower-level modules or subgraphs;
- exports a curated subset of internal params, commands, runtime values, and ports;
- may present a custom high-level UI;
- may or may not expose internal structure by default.

### Important distinction

A macro should not merely be a visual skin applied over unrelated internal hacks.

If future composition, inspection, or authoring is desired, then macro internals need to be meaningful in the backend even if the initial UI keeps them hidden.

### Candidate macro capabilities

A macro might define:

- internal subgraph/module references;
- exported port mappings;
- exported param mappings;
- exported command mappings;
- exported runtime mappings;
- custom UI view over the internal graph;
- optional "expand" or "inspect internals" behavior.

### Important non-requirement

The system does not need user-facing macro authoring before backend-valid composition exists.

A practical phased approach is:

1. make backend composition real;
2. build inspectable metadata around it;
3. only later decide how much of that should be user-authored visually.

---

## Two Decomposition Axes

A recurring source of confusion in modular systems is mixing these two questions:

1. What should exist as a reusable backend building block?
2. What should exist as a user-facing palette module?

They are related but not identical.

### Axis 1: backend lego blocks

These can be fine-grained. Examples might include:

- a waveform generator;
- a sample playback engine;
- a phase vocoder stage;
- an additive renderer;
- an analysis service;
- a modulation generator core;
- a drive shaper;
- a routing/operator stage.

Backend blocks are implementation composition units.

### Axis 2: user-facing rack modules

These should usually be more musically or conceptually coherent. Examples might include:

- Oscillator;
- Sampler;
- Filter;
- FX slot;
- EQ;
- ADSR;
- LFO;
- Blend Operator.

These are artist-facing composition units.

### Recommended principle

Decompose backend implementation aggressively enough to enable reuse and composition. Expose user-facing modules selectively enough to preserve usability.

---

## Candidate Family Model

A useful way to think about future growth is to organize modules into families.

### Source / instrument family

Modules that generate or provide material. Examples:

- oscillators;
- samplers;
- spectral/sample-derived sources;
- future instrument sources.

### Operator family

Modules that combine, cross-modulate, route, or otherwise mediate between sources. Examples:

- blend operators;
- ring/FM/sync style combiners;
- crossfaders;
- source selectors.

### Insert / processing family

Modules that process an incoming stream. Examples:

- filters;
- effects;
- equalizers;
- utility processors.

### Modulation / control family

Modules that generate or transform control data. Examples:

- envelopes;
- LFOs;
- sequencers;
- random sources;
- mappers;
- lag/slew;
- utility math blocks.

### Analysis / utility family

Modules that observe, derive, or expose information. Examples:

- followers;
- analyzers;
- source inspectors;
- asset or signal analysis modules.

### Asset / media family

Modules that manage sample/media/resource identity and capture/load behavior. Examples:

- source browsers;
- capture modules;
- asset selectors;
- media registries.

### Composite / macro family

Modules that wrap several other modules or subgraphs into a single higher-level instrument or effect.

---

## Notes on Source and Operator Complexity

Some capabilities resist a naive "one self-contained module" model.

Examples include:

- hybrid sound sources;
- operators that require two or more upstream sources;
- source-domain transforms that can also be embedded inside larger instruments;
- modules that are useful both as standalone modules and as hidden internals of larger modules.

This means the module system should not assume:

- one module equals one single algorithm;
- one module has only one mode of use;
- all composition happens only at one granularity.

---

## Notes on Control and Automation

Control and automation should likely be first-class citizens of the module model, not an afterthought or side subsystem.

### Why this matters

If the application intends to support:

- no-code composition,
- advanced artistic routing,
- and code-defined module authoring,

then automation and control modules must be as legitimate as audio modules.

### Candidate control/automation families

Potential modules include:

- ADSR;
- LFO;
- function generators;
- step sequencers;
- clock utilities;
- probability and trigger utilities;
- remap/scale/curve processors;
- math blocks;
- envelopes derived from analysis;
- event-to-control converters.

### Important distinction

Control-family modules may belong to a different domain than bus inserts or voice sources.

A design that forces all modules through the same simplistic audio-centric model will likely become limiting.

---

## Module Metadata Worksheet

This section proposes a candidate metadata shape for each module.

This is a worksheet, not a locked schema.

### Identity

| Field | Purpose |
|-------|---------|
| module_id | Stable internal identity |
| display_name | Human-facing name |
| description | Short readable summary |
| author | Origin or maintainer |
| version | Optional semantic or revision version |
| stability | Stable / preview / experimental / internal |

### Classification

| Field | Purpose |
|-------|---------|
| domain | voice / bus / control / utility / macro / other future values |
| role | source / operator / insert / modulator / analysis / automation / asset / composite |
| exposure | default / advanced / developer / internal |
| primary_category | Main palette category |
| tags | Search and discovery metadata |
| complexity | Basic / advanced / expert |

### Surface declarations

| Field | Purpose |
|-------|---------|
| ports | Declared graph interface |
| params | Persistent or automatable state |
| commands | Imperative actions |
| runtime | Readback or status endpoints |
| surface_docs | Optional human-readable notes on surfaces |

### Implementation attachments

| Field | Purpose |
|-------|---------|
| ui_definition | Visual component definition |
| behavior_attachments | UI/runtime behavior logic |
| dsp_attachments | DSP or processing scripts/modules |
| subgraph_definition | Internal graph/composite definition |
| docs | Module-specific docs |
| examples | Example usage or patches |

### Composition metadata

| Field | Purpose |
|-------|---------|
| instancing_model | singleton / per_voice / composite / other |
| asset_awareness | Whether module references, creates, or analyzes assets |
| composite_exports | Mappings from internal surfaces to external ones |
| inspectability | Whether and how internals may be inspected |
| editability | Whether and how internals may be edited/forked |

---

## Preset and Serialization Considerations

A module model is incomplete unless it defines what should and should not serialize.

### Suggested serialization categories

#### Persistent module state

Examples:

- parameter values;
- explicit option selections;
- exported composition choices;
- stable asset references;
- explicit module configuration.

#### Topology state

Examples:

- module placement;
- connections;
- macro composition membership;
- exposed mappings.

#### Ephemeral runtime state (usually not serialized)

Examples:

- playback position;
- in-flight analysis requests;
- waveform caches;
- temporary worker state;
- transient debug counters.

#### Derived caches (usually not serialized)

Examples:

- generated preview data;
- partial analysis caches;
- graph compilation caches;
- temporary render buffers.

### Open question: promoted artifacts

Some runtime-derived things may eventually need explicit promotion to persistent artifacts. For example:

- a captured sample might become a project asset;
- an analysis artifact might become explicitly saved if the user requests it.

This should be a deliberate promoted artifact flow, not an accidental side effect of "save everything."

---

## Sample-Centric Instrument Worksheet

This section is intentionally generic and avoids assuming a specific existing implementation.

The goal is to reason about complex sample-centric instruments that combine:

- sample playback,
- source selection or loading,
- capture/recording into the same playback object,
- alternate pitch/playback modes,
- analysis,
- and sample-derived rendering or transformation.

### Important caution

Do not assume that "recording into it" and "loading into it" necessarily imply two different modules.

If both actions feed the same playback identity and same user concept, then splitting them into separate modules may be artificial.

### Candidate decomposition for a sample-centric instrument

A complex sample-centric instrument may contain several conceptual layers:

#### 1. Sampler core

Responsibilities may include:

- selecting or binding a source or asset;
- loading and/or capturing into the same playback path;
- playback region handling;
- play start and loop region handling;
- root note and playback pitch behavior;
- alternate playback modes (for example, classic vs stretched/transposed modes);
- retrigger and playback behavior.

This is often a good candidate for a standalone user-facing module.

#### 2. Analysis service

Responsibilities may include:

- requesting analysis;
- tracking analysis state;
- producing partials or temporal descriptors;
- serving readback data to UIs and derived modules.

This may be:

- purely backend infrastructure at first,
- an inspectable service,
- or eventually an advanced exposed utility module.

#### 3. Sample-derived renderer or source

Responsibilities may include:

- generating additive or spectral playback from sample-derived analysis;
- exposing derived rendering parameters;
- consuming analysis outputs or sample references;
- acting as a source in its own right.

This may be useful as:

- a backend component,
- an advanced module,
- and an ingredient of a larger macro instrument.

#### 4. Source operator layer

Responsibilities may include:

- mixing two source domains;
- ring/FM/sync or other source-domain combination strategies;
- crossfading or directional routing between two source spaces;
- higher-level source recombination behavior.

This is often difficult to model if the system only understands single-source modules. This suggests that source/operator composition may need explicit support.

#### 5. Composite mega-instrument shell

Responsibilities may include:

- presenting all of the above as one coherent high-level instrument;
- hiding internal complexity by default;
- exporting a musically coherent default UI;
- remaining inspectable and ideally internally composable.

### Open questions for sample-centric design

- When should analysis remain backend-only vs become a visible utility module?
- Which parts deserve direct palette exposure?
- Which parts should remain internal to a macro/instrument module?
- How should assets and captures be represented in module metadata and serialization?
- How should source operators be represented in a rack if they need multiple source inputs?

---

## Oscillator and Generator Worksheet

This section addresses a different kind of complexity: a broad "oscillator" or generator module that internally contains several conceptual behaviors.

### Candidate internal generator building blocks

Potential backend-level building blocks might include:

- waveform generator;
- additive render variant;
- pulse-width behavior;
- voice stacking/unison behavior;
- drift and spread behavior;
- drive/shaping stage;
- preview/render helper logic.

### Important observation

A module may legitimately remain a single user-facing "Oscillator" while being decomposed internally into smaller reusable blocks.

This is a good example of why backend decomposition and palette exposure should not be conflated.

### Open questions for oscillator/generator design

- Which internal blocks should become publicly composable advanced modules?
- Which should remain internal to a larger generator module?
- Which of these are implementation details vs artist-meaningful modules?
- Is there value in exposing smaller generator utilities to advanced users, or is internal reuse sufficient?

---

## Utility, Analysis, and Automation Worksheet

This worksheet intentionally leaves room for a large family of utility and automation modules.

### Why this family matters

In many creative applications, advanced users eventually want to compose with:

- automation processors;
- analysis outputs;
- mapping and remapping blocks;
- signal followers;
- clocks and triggers;
- control transforms;
- helper utilities.

These may not belong on the beginner-facing landing page. But they can still be fully valid modules.

### Candidate advanced utility module classes

Potential classes include:

- analysis modules;
- source inspectors;
- mappers and remappers;
- automation processors;
- control math blocks;
- signal conditioners;
- utility routers and selectors.

### Open question

Should these advanced modules be explicitly visible in a dedicated advanced palette, or only become visible through search and inspector-driven workflows?

This remains a product decision.

---

## Exposure Strategy Worksheet

This section captures several plausible strategies for deciding what users see and when.

### Option A: Single palette, heavily tagged

Everything is in one palette, but ranked and filtered well.

Pros:

- transparent;
- nothing is hidden;
- easier long-term consistency.

Cons:

- may be intimidating;
- search and sorting quality become critical.

### Option B: Tiered palettes

Different palette layers or modes exist:

- default;
- advanced;
- developer/internal.

Pros:

- easier onboarding;
- clear audience targeting.

Cons:

- risk of hidden capabilities becoming hard to discover;
- requires good transitions between layers.

### Option C: Contextual reveal via inspector/editor

Modules are not always inserted from the palette directly. Sometimes they are discovered by inspecting a high-level module and choosing to reveal or extract internal capabilities.

Pros:

- elegant path from beginner to advanced use;
- aligns with module introspection.

Cons:

- may be less obvious for discovery;
- requires strong inspector design.

### Likely practical direction

A hybrid of all three options is plausible:

- curated default landing palette;
- searchable advanced catalog;
- inspector-based reveal for internal or composite modules.

---

## Future User-Authored Module Model

A significant long-term goal is to support users who write or modify their own modules directly inside the application.

### Why this matters

If module identity and surfaces are modeled well enough, then future workflows may include:

- editing a module's scripts directly from the inspector;
- forking a module into a custom project module;
- replacing a module's UI while keeping its DSP;
- replacing a module's DSP while keeping its UI contract;
- exposing hidden internal surfaces of a composite.

### Candidate capabilities for future user-authored modules

- module manifest/schema;
- script attachments;
- exposed surfaces declaration;
- docs/examples;
- validation and linting;
- module-local assets;
- module-local subgraphs.

### Important implication

The module model should be designed so that user-authored modules are not a separate special-case architecture later. They should be an eventual extension of the same module concept.

---

## Risks and Failure Modes

### Risk 1: Over-decomposition

If every tiny internal implementation detail becomes a visible default module, the user experience becomes incoherent.

### Risk 2: Under-decomposition

If every capability remains embedded in giant special-case modules, then composition, reuse, and inspection all become difficult.

### Risk 3: Fake macros

If large modules are not truly composed from meaningful internals, future macro expansion or editor workflows may become impossible or inconsistent.

### Risk 4: Surface conflation

If parameters, commands, runtime state, and implementation attachments are mixed together informally, serialization and inspection become unreliable.

### Risk 5: Domain collapse

If voice-source, bus-insert, control, analysis, and utility behaviors are all forced into the same simplistic model, later growth may become awkward.

### Risk 6: Hidden internals with no path to reveal

If internal building blocks exist but cannot be inspected, exposed, or promoted, the system may never support the advanced workflows it intends to enable.

---

## Candidate Decision Heuristics

The following heuristics may help future decisions.

### Heuristic 1: backend component test

Ask:

- Is this capability reused or likely to be reused?
- Does separating it simplify composition or maintenance?
- Does it meaningfully clarify module boundaries?

If yes, it may deserve backend decomposition.

### Heuristic 2: user-facing module test

Ask:

- Is this meaningful as an artist-facing building block?
- Would a user intentionally choose it as a module?
- Does it present a coherent mental model?

If not, it may be better as an internal module or advanced-only module.

### Heuristic 3: default palette test

Ask:

- Is this useful for a new or typical user immediately?
- Does it have a clear and stable interaction model?
- Is the name and purpose understandable without internal knowledge?

If not, it may belong in advanced or developer exposure layers.

### Heuristic 4: serialization test

Ask:

- Is this state actually part of the user's intended creation?
- Is it reproducible and stable?
- Would saving it as-is be meaningful?

If not, it may be runtime or cache state rather than preset state.

---

## Open Questions

This worksheet deliberately leaves many questions open. They should be answered through further design and implementation slices.

### Module model

- What minimum metadata is required for every module?
- What metadata is optional?
- How much implementation detail should always be inspectable?

### Surfaces

- Should runtime values be addressable similarly to params, or through a separate namespace?
- How should commands be represented and validated?
- How should surface permissions be modeled (inspectable, editable, exportable, modulatable)?

### Macro model

- How much of macro internals should be visible by default?
- Should composites export a curated surface manifest?
- Should composites support "expand into graph" and "collapse into module" workflows?

### Palette model

- Which exposure model best balances discoverability and usability?
- Should advanced/internal modules appear in search by default?
- How should category and search ranking interact?

### Inspection/editing

- What should be editable directly in the side panel vs external editor?
- How should module forking work?
- How should implementation graphs and source files be represented?

### Domain model

- Which domains are actually needed in the first stable version?
- Are additional domains required later (for example, event or asset domains)?
- How should source operators that require multiple source inputs be represented?

---

## Phased Planning Suggestions

This section does not prescribe exact tasks. It outlines a sensible order for future work.

### Phase 1: formalize module contract

Define the minimum module model:

- metadata;
- surfaces;
- implementation attachments;
- exposure classification.

### Phase 2: formalize inspector expectations

Define what any selected module should expose to the side panel, even if some sections are initially stubbed.

### Phase 3: formalize domain and role taxonomy

Decide which classifications are genuinely necessary for the first working version. Avoid overfitting the taxonomy before it is useful.

### Phase 4: extract one complex module family carefully

Pick a complex family and decompose it along the module model, without prematurely exposing every internal block as a default module.

### Phase 5: validate advanced exposure model

Prove that one or more internal or advanced-only modules can be surfaced meaningfully without destroying default usability.

### Phase 6: validate composite/macro backend composition

Make at least one larger module a genuine backend composition of smaller pieces, even if the UI still presents it as one polished module.

### Phase 7: consider user-facing authoring/editing workflows

Only after the module model is stable enough should direct user authoring or macro editing UI be considered.

---

## Checklist for Future Module Design Reviews

When reviewing a new module family, ask:

1. What domain does it live in?
2. What role does it play?
3. What surfaces does it expose?
4. Which state is persistent, command-like, runtime, or cache-like?
5. Is it meaningful as a user-facing module?
6. If yes, should it be default, advanced, or developer-facing?
7. If not, should it still exist as a backend module or inspector-visible unit?
8. Could it be used inside a composite/macro later?
9. If it is a composite, are its internals backend-real or merely cosmetic?
10. Could a future user inspect or edit it coherently?

---

## Summary

This worksheet argues for a module-centric architecture where:

- the same capabilities can be surfaced at multiple levels of abstraction;
- backend decomposition and palette exposure are treated as separate design decisions;
- polished modules, advanced utility modules, and developer-visible internals are all first-class;
- modules expose explicit surfaces such as params, commands, runtime values, ports, and implementation attachments;
- macros/composites are real backend compositions, even before user-facing macro tooling exists;
- the system is designed to support immediate use, advanced no-code composition, and in-context code-driven modification without fragmenting into separate incompatible architectures.

The central unresolved question is not whether the system should contain large modules or small modules. The better question is:

> **How can one coherent module model allow the same underlying building blocks to appear as polished instruments, advanced composition units, and inspectable/editable implementation modules?**

That is the architectural direction this worksheet is intended to support.
