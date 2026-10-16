# Website authoring through WebMCP and remote MCP

3 October 2026. A delivered vertical slice of the hosted authoring direction.

## Review

- [Live agent-authored Orbit project](https://wubulon.tailfac9f9.ts.net:4174/studio.html?program=ui-orbit&project=/webmcp/2026-10-03/example.manifold.json)
- [Pictures, reports, audio and source](https://wubulon.tailfac9f9.ts.net:4174/webmcp/2026-10-03/)
- [Exact website-built Linux CLAP/VST3 archive](https://wubulon.tailfac9f9.ts.net:4174/webmcp/2026-10-03/Manifold-Orbit-linux.tgz)
- [Portable authoring package including WebMCP](https://wubulon.tailfac9f9.ts.net:4174/webmcp/2026-10-03/manifold-author-0.1.0.tgz)

Studio now has charcoal/blue chrome. Orbit keeps its independently authored skin.
Start audio to hear the graph, change Brightness or Mode on the face/inspector,
and edit the graph beside the live preview. Agent changes appear in these same
surfaces; Export displays agent-submitted jobs and their downloads.

## Connect a local agent to the website

Open **Agent → Connect local agent**. Copy the displayed JSON into a private
file, for example `/tmp/my-manifold-connection.json`, with permissions `0600`.
Configure a Streamable HTTP MCP client with its `url` and `headers`. The token
belongs to this live project and expires in one hour. Renew replaces it;
Disconnect revokes it. Keep the page open for authoring calls.

The repository includes an actual SDK client for trying the connection:

```sh
node web/manifold-agent.mjs --connection /tmp/my-manifold-connection.json --list
node web/manifold-agent.mjs --connection /tmp/my-manifold-connection.json \
  --call manifold.project.inspect
```

The inspection returns the accepted revision. Pass that revision as
`expectedRevision` on each edit. Discover names/ranges with `catalog.list` and
inspect the mounted UI with `view.inspect` or `workspace.inspect`. Mutations
respect **Allow live edits**, human gesture settlement, dirty-source guards and
runtime validation. A build captures accepted source, graph, values, product
identity and presentation; subsequent edits cannot change that capture. The job
is durable after submission even if the page or MCP polling call closes.

WebMCP automatically registers the same tools when the browser supports it. The
Agent panel reports actual support. The current BB configuration has remote
MCP available and native browser WebMCP disabled. Native WebMCP was separately
exercised in Chromium 152 with its WebMCP/WebMCPTesting flags, through the real
`document.modelContext.getTools()` and `executeTool()` APIs. No polyfill was used.

## Shared ownership and packaging

`@manifold/studio/agent-tools` (moved from `@manifold/author` on 16 October 2026;
Studio product code outside the MIT library) publishes typed schemas/descriptions and the
shared dispatcher. `@manifold/studio/webmcp` is an optional lifecycle adapter:
it registers an existing host's tools, reports unsupported browsers, supports
unique instrument namespaces and disposes registrations. Both entries and
their declarations are included in the npm package manifest. They introduce no
DSP state, renderer requirement or automatic registration on import.

The website routes WebMCP, remote MCP, legacy HTTP and native IPC commands into
the same gate and existing accepted `LiveProjectRuntime`. Human and agent
exports share `mountPluginExport`'s immutable capture/build function. The remote
MCP adapter uses the official server 2.3.0 and Node transport 2.1.1 SDKs; the
consumer uses client 2.3.0. It exposes Streamable HTTP with a project-scoped bearer
connection, origin checks, renewal and revocation. The broker relays commands to
the sounding page; it does not construct a second audio graph.

Fifteen public tools cover inspection, primitive discovery, live parameter
edits/batches, source replacement, undo, named parameter exposure, face insertion/
styling, and build capabilities/submission/progress. A generic importing host
chooses only the tools it supplies; a plain runtime does not provide builds.

## Delivered evidence

`web/review-webmcp.mjs` invoked actual native browser tools to expose/place Mode,
change pitch/cutoff and apply source while audio was running. The official
external MCP client then styled Brightness, submitted a Linux build, inspected
progress and downloaded the archive. Both transports rejected paused edits;
stale and invalid source edits preserved the accepted graph. Audio used an
explicit silent sink. This verifies protocol execution, not an autonomous LLM's
creative quality.

- Build `550972c4-13f0-4372-bb56-3059ae2d4bd8`, captured revision 5.
- Archive SHA256 `8f0687fc852324cd39b14d9e37336bfb73c8c1c60e012c09b180034fab1c4f1a`.
- Cutoff captured at 1234 Hz; a later website edit to 2345 Hz did not change it.
- That exact archive opened in actual Linux REAPER as CLAP and VST3, with
  authored source/layout, Mode and current captured values intact. Face pointer
  input changed cutoff to 4406 Hz; a subsequent live 2345 Hz edit survived DAW
  save/reopen. Both formats retained actual WebGL2 presentation.
- Audio with the editor closed: CLAP RMS 0.03991, VST3 RMS 0.03977. Recordings
  used a verified private null sink and isolated X server.
- The real BB automation browser created a connection through the Tailscale
  website; the standalone SDK client discovered tools and inspected its project.
  Missing/wrong tokens returned 401, cross-origin access returned 403, and renewal
  invalidated the old token.
- The published project reopened in the actual BB browser with Mode and captured
  cutoff intact. Fetching the public archive through that browser produced the
  same SHA256 as the build receipt and DAW-reviewed download.
- 110 web tests and TypeScript/package freshness gates passed; UI Wasm and Vite
  builds passed. The actual npm archive includes both portable agent entries/types;
  an independent consumer imported them successfully. It is supplied for review,
  and has not been published to an npm registry.

## Remaining hosted product work

This is a project-scoped preview service. Persistent account-owned projects,
OAuth delegation, multi-client persisted revision synchronization, tenant worker
isolation, protected artifacts/quotas and release signing remain required for
the public account service. Existing legacy HTTP/build preview routes are private
development facilities; the bearer connection does not convert them into an
account boundary. Authoring currently depends on a live page; build jobs survive
it. The new archive was reviewed on Linux; previous platform reviews do not
establish a newly signed Windows/macOS release. Arbitrary dependencies/assets
remain broader packaging work beyond the bundled Three.js path.
