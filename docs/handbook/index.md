# Start here

Manifold is a library for building audio plug-ins, instruments and audio applications. Use it from Rust, or bring its Wasm processing into a website with JavaScript or TypeScript. Choose the processing, controls and graphics your application needs.

Manifold Studio is a product built on that library: a live, agentic environment for creating and playing with music plug-ins and instruments. It puts the project graph, files, source, inspector, presentation and agent activity in one workspace. A plug-in, instrument or pack you build has its own identity; it can use Manifold directly or be authored through Studio.

## Make something move

Start with a sound or a surface, then look inside it. Each experiment runs the real library, exposes its controls and graph, and keeps the exact source beside the result.

- [Play and shape an instrument](/learn/play-an-instrument/) — play MIDI notes, alter their release, and follow a voice through a filter.
- [Build a reusable sound](/learn/reusable-devices/) — use two copies of a Device and enter each inner graph.
- [Make metallic sidebands](/learn/ring-modulation/) — multiply two oscillators, break their frequency ratio, and hear a simple tone become metallic.
- [Move sound through the spectrum](/learn/spectral-pitch/) — transpose a sawtooth, mix it with the original, and inspect the measured harmonics.
- [Turn sound into a surface](/learn/sound-into-surface/) — explore Nacre's standing-wave patterns and let actual audio energy deepen their relief.

Choose **Save project** to keep a version, or **Open in Manifold Studio** to keep developing it. Audio only starts when you choose to play.

## Find your way in

| I want to… | Start here |
| --- | --- |
| Make and explore an instrument in Studio | [Your first Studio session](/learn/studio-first-project/) |
| Understand the panels and navigation | [Meet Manifold Studio](/learn/studio/) |
| Reuse a patch as a node | [Build a graph inside a node](/learn/studio-graphs/) |
| Put a small audio graph in my website | [Embed a gain stage](/learn/embed-a-gain-stage/) |
| Understand the library, product and host boundaries | [How Manifold fits together](/learn/concepts/) |
| Save a project or build a plug-in | [Save, move and export](/learn/studio-save-export/) |

The gain example remains the smallest integration lesson. The experiments show why you might want the integration in the first place. Every page includes observations to check and links to the next useful topic.

## Bring your agent

Every page has **Ask your agent**. Open it to read and copy a topic-specific prompt containing links to the Markdown lesson, architecture explanation and documentation index. The prompt tells your agent what to establish and how to verify the result.

Copying a prompt does not connect an agent or grant access to a running project. For live Studio editing, follow [the connection guide](/learn/agents/). For library work in your own application, your normal code editor and build tools are sufficient.

Agents can start at [the documentation manifest](/learn/manifest.json), fetch individual Markdown pages, and follow topic relationships. The pages shown to people and the Markdown served to agents are generated from the same authored text.

## Preview status

This is preview documentation for the current implementation. Manifold's public release number and release packaging have not been finalized. Examples distinguish working APIs from planned capabilities; the documentation edition identifies the text you are reading, not a promised stable API version.

The public JavaScript entry point in the repository is `manifold`, with host and expert tools at named subpaths such as `manifold/browser` and `manifold/graph`. It is currently a local development package, not a published registry release. Rust consumers use the repository's crates, including `manifold-native` for graph authoring and host preparation. Distribution as independently released packages is still being prepared. The [architecture page](/learn/concepts/#where-the-public-apis-live) points to their source and explains these boundaries.
