# Graphs, files and source

Studio's graph helps you navigate an implementation and change exposed relationships. Source remains available wherever code is the clearest way to express behavior. You can move between those views without maintaining separate projects.

## Find an object's implementation

Select an object in the graph or the Explorer and inspect its source information. A declaration in `/project.mjs` can be opened at its highlighted location. A custom component with its own implementation file points to that file instead. The node's role in the project and the file that implements its behavior are related, but they are not the same identity.

For example, a Gain instance exposes `/level`; its declaration identifies the graph node and endpoint. The Gain DSP implementation is part of the library. Editing the authored parameter declaration changes how that project exposes Gain; it does not replace the Rust gain kernel.

A custom visual node may have an editable script implementing its behavior. Follow its definition's source link to edit that script. If an agent created it, the same source and relationships remain available to you.

## Distinguish a definition from an instance

A definition specifies a component's ports, parameters and implementation. An instance places that component in a graph and supplies local values or connections. Several instances may share one definition.

Changing a shared implementation can affect every instance using it. Before making such an edit, inspect the definition and its uses. Changing an instance parameter is a different operation and should stay local to that instance. A unique label in the Explorer does not by itself mean the underlying implementation is unique.

## Enter a graph inside a node

Reusable audio graphs and presentation compositions can contain child graphs behind a named interface. Select a node with an interior and use the graph's entry action to inspect it. Parent navigation returns to its containing graph; the inspector can also expose the entry action.

Inside, inspect the actual children, connections and boundary ports. The outer node's interface explains how the rest of the project connects to it. Audio-rate connections and presentation connections remain distinct even when both kinds of objects appear in the authoring workspace.

Nested navigation and reusable definitions are implemented. Broader interface editing, forking, unwrapping and cross-project library workflows remain under development. Inspect the currently offered operations instead of assuming every node supports every transformation.

## Understand the project files

| Path | Meaning |
| --- | --- |
| `/project.mjs` | Authored audio project source |
| `/project.json` | Semantic view of the whole accepted project |
| `/composition.json` | Editable presentation graph |
| `/audio-graphs.json`, when present | Reusable audio graph definitions |
| Other embedded paths | Project scripts and assets |

These semantic paths are views of the accepted document. They are not independent files that each own a conflicting copy of the project. Embedded assets and scripts travel with the portable saved project.

Writing a similarly named file on your computer does not update an embedded project file. Filesystem watching is not currently implemented. Use the Studio editor or its advertised file operations for live authoring.

## Make the smallest meaningful edit

Change an instance value when you want a local variation. Change a wire when you want a different dependency. Change a shared definition when you intend to change the behavior of its instances. Change source when that is the most expressive implementation surface.

After applying, inspect the accepted state and the relevant output. A script can parse successfully while its renderer fails at runtime; the previous successful image may remain visible. Check diagnostics and observation state as well as the picture. [The agent workflow](/learn/agents/) describes revision checks and recovery for automated edits.
