# Your first Studio session

In this session you will change a standing-wave pattern, make its relief respond to sound, find the implementation, and save your own version. Allow about ten minutes. You do not need an audio interface, an agent or a script of your own.

## 1. Open something worth exploring

[Open Studio](/studio/). Choose **Project → Open example → Standing field & audio-driven relief**. In the default Classic layout, Project and Presenter sit above the Graph, with the Inspector on the right.

The Presenter shows two fields: **SOURCE** and **RESULT**. The source is a sampled standing-wave pattern. The result applies another rule to those samples. The project also has a normal audio path: **Live input → Gain → Output**.

If the workspace looks different, choose the **Classic** layout in View. If a pane is missing, show it under **View → Panels**.

## 2. Change a pattern before starting audio

Select **Standing field** in the Graph or Explorer. Change **Mode N** or **Mode M** in the Inspector. Both images should change: the original field feeds the relief rule, so an upstream edit reaches both consumers.

Set N and M to the same value. The two terms in this field's expression cancel, giving a flat field. Restore different values to bring the pattern back. This is an especially useful check that you are looking at the actual equation's output.

> Try it here first: [Turn sound into a surface](/learn/sound-into-surface/) embeds the same project and its actual scripts.

## 3. Give it some audio

Choose **Start audio** in the top bar and raise **Master** for listening. This project contains a sine oscillator in its graph, so it works without microphone permission. Enter **Field audio** in the graph, select **level**, and move **Output gain**. The level-response node should report changing energy, and the result's relief should deepen or flatten.

With gain at zero, energy settles to zero. The relief can still show a shallow pattern because its **Rest depth** is intentionally nonzero. Audio and the visual response have different jobs: audio runs in its own processing host; the visual follower smooths observations at presentation rate.

If you hear nothing, check Master, audio start state, the oscillator’s level, gain and the wires leading to Output. A project can be valid while its host supplies silence. For a project wired to live input, connect hardware in Settings; microphone access requires browser permission.

## 4. Find the rule, then change it

Select **Field relief**. Project opens `/nodes/relief.mjs`. Look for the `values.map` expression that transforms each sample. The **Code** section in the Inspector also links to the implementation.

Change a small, visible part of that rule—for example, multiply the final depth by `0.5`—then choose **Apply live** in the file header (or the file editor's save action for that file type). The result panel should become shallower while the source pattern stays the same. Inspect any diagnostic if the edit is rejected; the accepted project remains your reference.

You can leave an unfinished file edit and select another node. Studio retains that file's draft. If an agent changes its accepted source meanwhile, your older draft must be reconciled rather than silently replacing the agent's edit.

## 5. Save something you can reopen

Use **File → Save project** to download the portable browser project. Give the file a name you recognize. Open that saved document and verify the pattern, your source change and the audio path. Workspace layout is a separate preference; do not expect the project file to impose your panel arrangement on someone else.

A downloaded project is not a compiled plug-in. [Save, move and export](/learn/studio-save-export/) explains the difference and the current build-service limits.

## Take it further

Select the field and relief nodes together and explore wrapping them into a reusable presentation node. Or open the **Reusable audio graphs** example and compare two instances with different local controls. [Build a graph inside a node](/learn/studio-graphs/) walks through what is shared and what stays independent.
