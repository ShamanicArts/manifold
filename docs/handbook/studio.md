# Meet Manifold Studio

Studio is where you make and play a Manifold project. Open an instrument or effect, follow its signal, change a control, look inside a node, and see what your agent changed—all in the same workspace. You can begin by listening and exploring; reading code is optional until you want to change the implementation.

[Open Manifold Studio](/studio/), or follow [your first session](/learn/studio-first-project/) for a guided project.

## One project, several ways in

Imagine changing a filter. **Graph** tells you what feeds it and where its output goes. **Inspector** gives you its parameters. **Explorer** finds it even if it is deep inside another graph. **Source** reveals how it was declared. **Presenter** shows the instrument's playable face, if its author supplied one.

These views refer to the same accepted project. Moving a panel changes your workspace; moving a control can change the project. That distinction is useful when you want to reorganize Studio without changing your instrument.

| Area | Use it for |
| --- | --- |
| Application bar | New/open/save, examples, editing, panels, settings and agent connection |
| Settings → Audio hardware | Choose the microphone/interface feeding the project |
| Audio controls in the top bar | Start/stop audio and set Studio’s final Master listening level |
| Input graph | Quickly adjust test sources in Controls, or edit their patch in Graph; shown for devices with audio inputs |
| Project pane | Browse files and objects in Explorer; read or edit the selected asset beside it |
| Graph | Follow and connect nodes, select several, wrap a patch, enter a nested graph |
| Inspector | Inspect the selected object's controls, ports, connections, implementation and sharing |
| Presenter | Play or preview the project's authored interface, separate from Studio's controls |

![The field project in Studio: Project and Presenter above Graph, with Inspector on the right.](/studio/2026-10-12-wiki/field-in-studio.png)

*An actual browser Studio session opened from the field lesson, with audio stopped. Your layout and selected object may differ.*

## A useful first project

Choose **Project → Open example → Standing field & audio-driven relief**. It has an ordinary **Live input → Gain → Output** audio path and a second chain that turns measured audio energy into a surface. You can understand both chains without reading every file.

Select **Standing field**. Its modes are in the Inspector, its implementation opens in Project, and its output cable leads to a relief rule and a renderer. Select **Gain** instead: Studio highlights its declaration within `/project.mjs`. The native DSP behind that declaration is a built-in implementation; the surrounding JavaScript tells Manifold how to assemble it.

The [embedded version](/learn/sound-into-surface/) lets you try those ideas directly in this documentation.

## Work visually, with source, or with an agent

Use the graph to navigate and compose. Open source when a rule is better expressed as an algorithm. Ask an agent to make a bounded change when you know the result you want. Studio does not need to turn every line of JavaScript into a box to keep the authored objects inspectable.

For example: “Make the relief smoother as the sound gets quieter. Keep both field panels and the existing audio path.” A connected agent can inspect the relevant file, edit it through the accepted project boundary, and verify the live result. [Work with an agent](/learn/agents/) explains setup, revisions and recovery.

## Browser and standalone

The browser and Linux standalone share the egui Studio workspace. The source editor and authored web surfaces are embedded by each host. Audio devices, filesystem access and agent transport belong to that host, so capabilities differ.

Choose **Start audio** in the top bar. **Master** controls Studio’s final listening level. For an effect, the **Input graph** dock sits to the left of its graph. **Controls** offers waveform, frequency, noise colour, source blends and input level; **Graph** lets you edit that patch. Add an exposed control and it appears in Controls automatically. The test patch is saved with Studio and excluded from the plug-in. Devices without audio inputs hide the dock. **Settings → Audio hardware** selects the microphone/interface; native output-device selection currently uses `MANIFOLD_AUDIO_DEVICE` at launch. Use **Project → Connect agent…** for the current MCP connection configuration. That adapter currently requires Node and the checkout's installed dependencies; a self-contained release installer is still being prepared.

Current native workspace and MCP acceptance is on Linux. Earlier exported plug-in proofs include macOS and Windows under Proton; they do not establish full current Studio parity on those platforms. Disabled menu entries show unfinished capabilities. A greyed-out command is not a promise that it works elsewhere.
