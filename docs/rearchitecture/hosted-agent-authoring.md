# Hosted Manifold authoring with local agents

3 October 2026. The first website integration is delivered: portable tools,
native browser WebMCP registration, a project-scoped remote MCP connection,
and agent-triggered website capture/build/download. See
[the delivery](webmcp-delivery.md) for live review and acceptance evidence.
Persistent accounts and the production hosted service remain work.

## Product intent

Lucas clarified that the target is a website people use to create instruments
and effects with their own local agents. A signed-in account owns projects and
can request platform builds, packaging and downloads from our service. Local
development remains supported through the same portable Manifold library.
The offer is a complete creation/build workflow, not merely tool discovery for
the current editor workspace.

## Protocol fit, verified from primary sources

WebMCP exposes page JavaScript functions as described, typed agent tools. The
current 2 October draft uses `document.modelContext.registerTool`; lifecycle uses
an AbortSignal. It is a draft, not a completed W3C standard.
[WebMCP specification](https://webmachinelearning.github.io/webmcp/)

Chrome documents an origin trial and a local testing flag. Feature detection is
necessary. A compatible browser/agent integration is needed to discover page
tools; ordinary desktop MCP clients do not acquire that integration merely by
receiving a website URL.
[Chrome WebMCP documentation](https://developer.chrome.com/docs/ai/webmcp)

Normal MCP supports a remote Streamable HTTP endpoint. Its HTTP authorization
specification provides the account-delegation model based on OAuth. This is a
second way for desktop agents to access the hosted service directly.
[MCP transports](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports),
[MCP authorization](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization)

## Recommended service shape

| Entry point | User experience | Implementation role |
| --- | --- | --- |
| WebMCP in the website | A compatible browser-connected local agent works alongside the human in the visible editor. | Page tools call shared project commands and build APIs. |
| Remote MCP at the hosted service | A desktop MCP client signs in and connects to the user's hosted projects/builds. | HTTP MCP adapter over the same project/build service. |
| Native/local MCP | A local agent authors and plays through the installed application. | Local adapter over the portable runtime/project contract. |

Keep one project contract and semantic command vocabulary. A browser has its
local sounding execution state; the service stores accepted project revisions
and immutable build captures. Neither protocol introduces another DSP graph or
independently editable parameter values. Versioned commands and synchronization
must reconcile the browser's accepted state with the persisted revision.

The hosted workflow should be:

1. Sign in, create/open a project and connect an agent.
2. Discover primitives, project source, parameters and presentation capabilities.
3. Author graph/source and bound UI through validated revision-checked commands;
   preview changes in the website with the existing audio runtime.
4. Capture an accepted project revision with source, assets/dependencies,
   parameter values, product identity and requested platform targets.
5. Start a durable build job, inspect progress and retrieve artifacts/receipts.
   A page closing or a tool call ending must not lose the captured build job.
6. Download native plugins and/or a browser package built from that capture.

Build jobs should return IDs promptly. Cancelling a tool's polling request is
different from explicitly cancelling the build, and neither undoes an already
accepted authoring transaction.

## What can be bundled

Delivered optional library entry: `@manifold/author/webmcp`. Supply a host's
semantic command dispatcher and advertised capabilities; register a curated set
of typed tools and return a dispose handle. Multiple imported instruments need
distinct tool namespaces/project IDs. Unsupported browser APIs should leave the
instrument functional and report transport support accurately.

The studio would include that adapter by default where supported. Imported
instruments could opt into parameter/performance tools; authoring tools depend
on the host providing authoring facilities. Exported native players keep their
local MCP/agent adapter without depending on browser WebMCP availability.

Use imperative registration so egui, canvas and Three.js actions are exposed
through actual commands. Share tool descriptions/schemas between transports.
Keep the agent-enabled switch, draft guards, stale-revision checks, undo and
accepted-state publication in a common dispatcher rather than only HTTP code.

## Existing foundation and concrete missing work

- Orbit Studio already demonstrates browser authoring and website capture/build/
  download, with actual Linux CLAP/VST3 host evidence.
- `web/src/filter.js` has HTTP command polling and a native agent bridge. These
  are application bridges, not proof of standards-compliant MCP/WebMCP support.
- `creator-workspace.js` routes exposure and layout edits through validated
  source transactions. Its visual source conventions remain bounded.
- `scripts/serve-plugin-exports.py` already captures jobs and emits receipts.
  It is a development build service, without a hosted account/tenant boundary.
- Delivered: reusable typed tool registry/dispatcher, WebMCP adapter exercised
  through Chromium's actual native API, and authenticated remote MCP exercised
  through the official SDK client. Both edit the website's accepted runtime and
  its existing immutable build captures. This proves protocol invocation, not
  autonomous creative quality of an LLM agent.
- Missing: persistent account projects/synchronization, OAuth authorization,
  tenant-isolated platform workers and artifact access, and release signing/host
  gates for the promised target platforms. Preview project tokens expire in one
  hour; the live page remains the authoring authority. The legacy HTTP bridge
  remains a private development facility rather than an account service.
- Extra dependencies/assets need explicit package support. Current successful
  Three.js bundling does not establish arbitrary dependency support.

Read-only probe of the actual Orbit BB browser: secure context, Manifold loaded,
Electron 44.3.0 / Chromium 152.0.7977.78; both
`document.modelContext?.registerTool` and
`navigator.modelContext?.registerTool` were undefined. No browser flags were
changed. This is the API status of that running configuration, not a claim that
BB's browser or Manifold is unavailable.

## First product acceptance slice

A local agent connects to the website's real tools, changes the sounding graph
and authored face, and starts a build. The human sees each accepted change.
The agent retrieves a captured-revision artifact, and that exact plugin runs
in a DAW. Then demonstrate the same hosted project/build through authenticated
remote MCP from a desktop client. Those are the meaningful delivery gates;
registration-only mocks are not proof of the intended product.
