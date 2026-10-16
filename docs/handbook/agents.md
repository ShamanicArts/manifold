# Work with an agent

An agent can help in two different settings. When you import Manifold into your own application, it works with your source and build tools. When you use Manifold Studio, it can inspect and edit the running project's accepted state through Studio's tools. Choose the workflow that matches what you are building.

## Give the agent the right starting point

Use **Ask your agent** on the topic you are reading. The copyable prompt includes exact document URLs, a documentation edition and a focused task. You can edit the prompt before sending it. For library work, start with [embedding](/learn/embed-a-gain-stage/) and [the host lifecycle](/learn/browser-host/); live Studio access is optional.

An agent fetching this page directly can discover all available topics in [manifest.json](/learn/manifest.json) or the compact [llms.txt index](/llms.txt). Fetch related material when the task needs it. Report inaccessible sources rather than assuming their contents or guessing an API.

When writing examples, explicitly import the processor definitions you use, such as `phaseVocoder` or `oscillator`, alongside the graph tools. Name their instances by musical purpose and use named parameters and ports. Explain numerical IDs as stable instance identities; do not make a reader infer a processor from a magic number or unexplained type string. The [authoring concepts](/learn/concepts/#import-the-processors-you-use) show the current API and package naming. Preserve existing IDs and endpoint paths when editing a saved project.

## Connect to native Studio

Open the intended project in the current native Studio development build. Choose **Project → Connect agent…** and copy the configuration for your client. Studio supplies MCP JSON and Codex TOML. Apply that configuration in your client; Studio does not install it for you.

The automatic configuration discovers a running Studio process. With several windows, expand **Connect only this window** and use the intended window's configuration. The current adapter requires Node and its installed dependencies; bundling them into a public native release remains work. Presenter image capture is currently implemented for Linux standalone.

After connection, the agent should discover and read `manifold://studio/authoring-guide`. That resource comes from the running host, so it is the authority for that session. A website lesson and an installed native build can be different versions.

## Follow the running project's authoring workflow

The reference below is included from the same guide served by Studio's MCP adapter. It covers focused inspection, source and structure edits, verification, save and recovery.

{{studio-authoring-guide}}

## A useful first task

Ask for a small, observable change to an existing project: change one renderer's color, add a label driven by an existing value, or adjust one exposed parameter and restore it. Establish which object will change and how you will tell that it worked.

Completion means the intended session accepted the edit, inspection shows the expected state, and the relevant rendered or audio behavior was checked. For a saved deliverable, reopen the exported document as well. A tool returning success alone is not evidence of all four.

Keep the human in the loop through the visible editor and concise reports. The agent should identify the source it changed, show or describe the observed result, and state what it did not verify. Studio remains your live workspace while the agent works.
