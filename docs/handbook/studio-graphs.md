# Build a graph inside a node

A useful patch can become a node of its own. Its internal graph stays inspectable. You can enter it, change its wiring, return to the parent, and reuse the same definition elsewhere in that project.

The key distinction is **definition versus instance**. A definition describes the internal structure. An instance is one occurrence, with its own exposed values. Changing shared structure reaches every occurrence; changing a local control affects the selected occurrence.

## Try the audio example

In Studio choose **Project → Open example → Two Filter Stages**. First and second are independent instances of the **Filter Stage** Device. Each contains a filter and level stage.

1. Select a stage. **Enter graph** appears in the graph toolbar. Click it, or double-click the node.
2. Select the filter inside it. The Inspector shows its parameters; its Code link highlights the shared declaration in `/project.mjs`.
3. Use **Up one level** or the breadcrumbs to return. Explorer follows the same hierarchy.
4. Change one stage's brightness. Compare the other stage: its value remains independent.
5. Edit the shared filter declaration and apply. The accepted implementation updates both instances.

[Build a reusable sound](/learn/reusable-devices/) embeds this same Device directly in the wiki. The older **Reusable audio graphs** example demonstrates the saved JSON definition format, including two levels of nesting and `/audio-graphs.json` source links. Both forms remain supported.

## Wrap your own patch

Shift-click the audio processing nodes you want to keep together, then choose **Wrap as node** in the graph toolbar. Wires crossing the selection become named input/output ports. Existing exposed controls stay connected to their targets.

Use **Add another instance** in the Inspector, or insert the definition from **Reusable graphs**. Connect the new instance's ports explicitly. Merely adding a disconnected node does not put it in the sounding signal path.

Inside the definition, adding a child or changing a cable changes shared structure. Inner controls edit that occurrence's values. Check the Inspector's sharing information before changing a reusable definition with several instances.

## Presentation graphs work this way too

Open **Reusable fields · graphs inside nodes**. The two Reactive field instances share an internal definition and have different mode/fold values. Both consume Output analysis.

Shift-select presentation nodes and choose **Wrap as reusable node** in the Inspector. Enter the result from the graph toolbar. Boundary nodes expose the graph's named ports; child scripts and the renderer remain accessible. A bound child's control is driven by the parent parameter—edit that exposed parent control to change it.

A script can produce a portable `field2d` value; another script transforms it; a surface consumes it. This makes the relationship visible without forcing the algorithm itself into hundreds of tiny boxes. [Turn sound into a surface](/learn/sound-into-surface/) demonstrates that distinction directly.

## Find a node and read its result

**Add node** groups nodes by their function. Look under **Sound analysis** for
level responses, **Values & motion** for parameter references and mappings, or
**Fields** for patterns and field transformations. The separate **Library**
filter selects Manifold or definitions from this project. A custom node still
belongs alongside nodes that do the same kind of work.

Search matches the name, purpose and authored search terms. Browse with the
arrow keys, inspect the named ports, and press Enter to insert. **Open code**
opens a custom definition's actual implementation. On a narrow window the
category column becomes a dropdown; results and details keep their own scroll.

Numerical outputs have a small recent history on the node. Field outputs have a
thumbnail of the actual grid, its dimensions and sampled range. Select the node
to see the same preview and its connections in the Inspector. Try changing
**Mode N** in the standing-field example: the field and downstream relief
thumbnails respond, even when you have maximized the graph.

These previews observe the running presentation. They do not execute a second
copy of its script. The field thumbnail averages down to at most 32 × 32 samples
and maps that thumbnail's minimum and maximum to dark and light; it is a view
of the numerical field, not the final colour treatment. Graph positions remain
where you put them. Distant zoom hides previews, and hidden previews stop
sampling. Missing values and preparation errors appear explicitly.

Renderer resources, such as Nacre's shared scene, still show their typed ports
and relationships. They do not yet have object thumbnails. Audio processors do
not yet have individual waveform taps; the existing Output analysis remains the
source of audio observations.

## Explore Nacre’s actual field

Choose **Project → Open example → Nacre**. Its presentation appears alongside the audio graph:

- **Spectral focus**, **Displacement** and **Afterimage** read the named controls on the effect.
- **Energy response** turns output analysis into smoothed energy, peak and upper-band values.
- **Standing-wave modes** combines those values with focus and displacement.
- **Nacre scene** owns the shared camera, artwork, interaction and final render.
- **Standing-wave field** builds the moving surface and particles inside that scene.

Select **Standing-wave modes** and follow its **Code** link. Studio opens `/nacre/modes.mjs`, a short script containing the actual formula. Change the formula and apply it: the visible field responds while the scene and particle state continue running. Select **Energy response** to adjust its sensitivity or response in the Inspector, or open its own script.

The wires are executable relationships. Disconnect the field’s **scene** input and the field disappears while the enclosure remains. Undo restores it. Numerical wires carry behaviour; the scene wire tells the object which scene it belongs to. Save and reopen to retain your code, wiring and artwork together.

## Follow an image from its file to its animation

In Nacre, select **Oracle creature** and choose **Enter graph**. Follow **Oracle poses → Select image frame → Transform image → Creature in scene**. The first node contains the image files; the motion script chooses a pose and tilt from Prism edge, Prism heat, sound and touch. The outer node previews the image the creature has actually accepted. Its position, scale and opacity controls remain available outside; enter it to inspect the driven pose and rotation.

Now enter **Relic eye**. **Eye images** contains the left gaze, right gaze and closed eyelid. Each has a selection node and a fade. **Gaze and blink** supplies their opacity, using the pointer, sound, displacement and Hold. **Eye on relic** draws those images over the face, using the cabinet's relief and placement. Its three-number output is the actual opacity of each layer; the image previews inside show the individual layers, not a screenshot of the complete face.

Try clicking the eye in the Presenter: Hold changes the eyelid. Select **Gaze and blink → Code** to open `/nacre/eye-motion.mjs`. This is where its timing and response are written. You can change that script, change an image in **Eye images**, or adjust a fade's transform inside the graph. Those are three different edits to the same running implementation.

A transparent thumbnail can be correct: a fade with zero opacity produces an invisible image. Compare it with the selection node immediately before it. **Viewers** turns previews off when you don't need them.

The hand and halo still live in `scene.mjs`, along with the cabinet and relic's relief. Their further extraction is ongoing.

## Source and graph stay connected

New Device projects keep their declarations, connections and nested definitions in `/project.mjs`. Graph tools update that source. For existing expert GraphWorkspace projects, `/audio-graphs.json` is an editable virtual view of the `studioGraph.audioGraphs` declaration in source. `/composition.json` describes presentation definitions, instances and wires. These edits use the same accepted project, history and revision checks as other authoring operations.

Audio containers expand into normal DSP nodes before execution. Presentation compositions expand into script/surface instances. A container is not another audio engine, and visual-frame timing does not schedule audio processing.

## Current boundaries

Audio wrapping currently excludes nodes with sample/PCM, capture or host-channel resource bindings and does not clone arbitrary controller callbacks. Unsupported candidates are rejected. Named interfaces can be edited as JSON; a friendlier interface editor, unwrapping, definition forks and cross-project package installation remain unfinished.

Per-instance controls work; per-instance structural overrides do not. Arbitrary structural changes can restart transient DSP or presentation state. Live publication does not mean every possible edit preserves every oscillator phase, sample voice or delay tail.
