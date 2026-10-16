# Studio: from authored examples to tester builds

Updated 13 October 2026. This is the active delivery order after the image-graph
work. It supplements the historical release ledger; a listed task is not a
claim that it has shipped.

Manifold is the importable audio library. Studio is the environment for creating
and playing audio plug-ins with people and agents. Nacre and the teaching
plug-ins are authored products. General facilities belong to the library or
Studio; a product's art and specific behaviour stay with that product.

## 1. Make real projects explain themselves

Nacre's field, Oracle creature, eye, crystal hand, memory halo, cabinet engraving
and mouth relic now have actual graph relationships and short behaviour scripts.
Their images reuse the public primitives.
Their source, images, references, previews and nested navigation travel in the
saved project. See [image composition](studio-image-composition.md).

Cabinet/relic extraction has browser and standalone acceptance for real image
previews, nested navigation, eye interaction, shared placement, failed replacement
and repair while audio continues. See [relic evidence](../../web/public/studio/2026-10-13-nacre-relic/README.md).

Next: the remaining interaction rules.
Preserve the artwork, placement, drag response and audio path during extraction.
Use each object to identify missing reusable operations: ranges, curves,
smoothing, animation timing, image masks/crops/blends and layout. Do not wrap a
large opaque renderer and call the decomposition complete.

Complete a historical primitive inventory against the old library. The current
71 audio catalog entries are not the complete migration. Bring existing network
capabilities into discoverable graph operations. ML needs explicit worker,
model/resource, asynchronous-result and host-support contracts before adding
palette entries. Catalog counts are evidence of coverage, not a target to pad.

Reusable definitions still need a friendly interface editor, definition forks,
unwrapping and cross-project packaging. Commands can now choose which internal
parameters become outer controls. Detailed controls remain editable inside.

## 2. Recover and report failures

Test invalid source, failed object construction/update, missing assets, renderer
loss, worker failure and native process crashes separately. They have different
recovery boundaries. A healthy audio graph should continue through a visual or
agent-command failure; an unsafe audio failure should mute or bypass safely.

Keep the last working object when replacement preparation fails. Make the
failing node and source discoverable, allow repair without reloading the whole
project, and preserve the author's unsaved work. Prove both failure and repair
in browser and standalone, with real audio routed to a private sink.

Eye and hand construction/first-update failures now have browser and standalone
repair evidence. Dependent resources wait without tearing down the last working
assembly; explicit disconnection still releases it. The browser hand probe also
verifies continued audio and field animation. [Hand evidence](../../web/public/studio/2026-10-13-nacre-hand/README.md).

Still required for testers: durable recovery checkpoints, restart/reopen flow,
opening with a failed component disabled, and a low-friction report containing
build/host/recent-operation context. Project content and assets should be an
explicit attachment choice. Study Chataigne's recovery/reopen/report workflow;
precompute recovery data rather than attempting unsafe serialization inside an
audio callback or crash signal handler.

A successful script-failure test is not proof of survival through every native,
GPU or audio-thread crash. Record the boundary each test actually establishes.

## 3. Teach with useful, expressive small plug-ins

Continue the wiki's sidebar, highlighted code and human/agent paths. Add Nacre
extracts and purpose-built small plug-ins with distinctive presentation and
meaningful sound. Candidate studies include a spatial delay with manipulable
taps, an image-driven spectral effect and a resonant surface instrument. These
are teaching concepts to prototype, not promised designs or implemented APIs.

Each study should have an embedded working portion, a clear graph, readable
source, a short musical task and an Open in Studio path preserving its state.
People can embed only the part they need with Manifold/WebAudio. Explain local
JavaScript names, stable authored identities, imported definitions and API
members early. Named imports from `manifold`; no internal numeric processor IDs
or unintroduced magic names in teaching code. Every code block is highlighted.

Include Studio's workflows: files and source links, graph editing and nesting,
parameter references, images, input graph, host audio setup, layout, Presenter,
agent connection, live edits, save/export and recovery. Copyable agent prompts
must point to the same current contracts that humans learn.

## 4. Exercise a hosted agent connection

Prepare a bounded HTTPS preview with scoped/revocable connections and rollback.
Connect a fresh agent, give it a small musical task and record the editor while
it inspects, edits source, changes wiring, encounters an invalid edit, recovers,
reconnects and exports. Include a concurrent human parameter edit. Local MCP
success does not establish the deployed path, credentials, onboarding or
reconnection experience.

## 5. Open a small tester round

Studio's approved 2,048-slot normalized automation bank and persistent assignments
are implemented; exported plug-ins expose their exact authored controls. Actual
CLAP and VST3 REAPER save/reopen evidence is recorded in
[automation acceptance](../../web/public/studio/2026-10-13-automation-bank/README.md).

Arbitrary graph/document quotas and fixed I/O bus/channel storage have been
removed. [I/O acceptance](../../web/public/studio/2026-10-13-io-scale/README.md)
covers native, SDK callbacks and both Wasm engines beyond the former thresholds,
plus an actual browser/native signal comparison. Imported-sample duration/label
quotas and authored capture/loop-transfer quotas are also removed; see
[sample and capture acceptance](../../web/public/studio/2026-10-13-sample-storage/README.md).
The configurable mixer now derives ports and named controls from its authored
input count. Full-width local control IDs preserve independent automation beyond
the former 32-input restriction. [Mixer acceptance](../../web/public/studio/2026-10-13-mixer-scale/README.md)
covers native, both Wasm engines and host slot reassignment. The legacy Main
instrument's fixed capture storage still needs work; it is not an approved
framework authoring limit.

Package the standalone and its MCP adapter/dependencies. Validate clean starts,
audio device/source changes, project saves/recall, scale/layout, sustained
operation and error reporting on the declared supported platforms. Exercise
CLAP/VST3 in a DAW; audition input graphs must stay outside exported effects.
Use explicit versions, a reviewed main merge, release notes and a rollback.

The maths plug-in then becomes a demanding authoring example, with research
behind the actual audio/visual algorithms. Complete catalog and ML migration
can continue during a clearly bounded alpha; recovery and honest support
boundaries are prerequisites for inviting testers.

## Review practice

Aster implements. Flint uses Pi with OpenCode Go's DeepSeek V4.1 Flash for
read-only adversarial review of concrete changes, architectural boundaries,
authoring clarity, tests and real captures. Findings are checked against source;
reviews do not substitute for native/browser observations. The user stays looped
in through implementation updates and meaningful visual evidence.
