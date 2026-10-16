# Local MCP authoring against standalone Studio

11 October 2026. The development adapter `web/native-mcp.mjs` serves MCP over
stdio using the installed official SDK. It sends semantic operations directly
to the running standalone app's existing loopback command endpoint. There is no
browser relay, second project runtime or page refresh. The SDK owns protocol
negotiation and transport; see its [server documentation](https://ts.sdk.modelcontextprotocol.io/server).

For authoring, start with the [agent quickstart](studio-agent-quickstart.md).
The adapter also supplies it through MCP resource discovery at
`manifold://studio/authoring-guide`, with initialization instructions pointing
clients to it. Agents do not need repository paths to read this guidance.

Start the current `target/release/manifold-app` with a Studio project. Open
**Project → Connect agent…** and copy either MCP JSON or Codex TOML into your
client's configuration. This opens the Agent inspector alongside the existing
workspace. The automatic configuration discovers the only running Studio and
reconnects after an application restart without changing ports or restarting MCP.
If several Studio windows are open, it refuses to choose one. Expand **Connect
only this window** to copy a configuration for the intended window instead;
that connection expires when the window closes.

A development MCP client configuration is:

```json
{
  "mcpServers": {
    "manifold-studio": {
      "command": "node",
      "args": [
        "/absolute/path/to/Manifold-v2/web/native-mcp.mjs",
        "--discover"
      ]
    }
  }
}
```

Use the checkout's installed `web` dependencies and Node. Studio finds the adapter
through `MANIFOLD_STUDIO_MCP`, a sibling `mcp/native-mcp.mjs`, or the development
checkout, in that order. Packaging those files and dependencies with a release
remains separate work. Studio only copies configuration; it does not install or
modify client settings. Closing the MCP client does not terminate Studio.

Discovery records are per process, under `manifold/studio-sessions` in
`XDG_RUNTIME_DIR`, falling back to the user's cache. `MANIFOLD_STUDIO_SESSIONS`
overrides the directory; copied configurations include its path explicitly.
The adapter verifies each record against the live loopback endpoint, ignores
stale records and requires `project.inspect` before the first mutation of a new
session. Revision zero in a restarted process is not the previous process's
revision zero. `--session-file FILE` selects one window. The legacy
`--endpoint http://127.0.0.1:PORT/__manifold/request` option remains supported,
but has neither automatic restart discovery nor the discovered-session guard.

There are 34 advertised tools. The 33 authoring tools use the public Manifold
schemas used by web authoring. They cover inspection, source/files, parameters, graphs, nested
components, history, presentation and the existing native module library. It
does not advertise browser export/build services or unsupported host operations.
Native remains responsible for its Allow agent live edits gate, revision checks,
publication and conflict handling.

A typical agent workflow starts with `project.inspect` and `sections:["summary"]`,
then requests relevant sections or a `nodeId`. This returns a node's connections,
source links and definition without unrelated catalog data or source blobs.
An unfiltered call retains the full response. These are projections over the
accepted host snapshot, not a separate state model. Continue with `file.read`,
then `file.write` with both `expectedRevision` and `expectedContent`. Inspect the accepted revision
and `workspace.inspect` composition observations afterward. The app updates its
embedded Presenter from the accepted source; it does not reload the page. Read
the authoritative state after a transport timeout rather than assuming rollback.

The native-only `presenter.capture` tool returns a real MCP PNG image block and
separate revision/runtime metadata. The current implementation uses Linux
WebKit's snapshot API for the visible Presenter; it does not capture the desktop
or move focus. A hidden or not-yet-published Presenter returns an actionable
error. Source publication during capture rejects the image. Check runtime
observations as well as pixels: a failed renderer can retain its last successful
surface. Other native platforms do not yet implement this capture backend.

Native control processing and Presenter publication run in eframe's logic
callback, independently of UI painting. Covered windows continue to handle
agent edits and WebKit callbacks even when eframe skips their paint pass.
Hiding the Presenter retains its WebKit allocation, using the same pixel/input
clipping approach as the native script editor. Publication and capture pause
while hidden, and the rendered surface survives reopening the pane.

`web/review-native-mcp.mjs` uses a separate SDK client process to list tools, read
and edit the inner relief script in a running standalone instance, reject a stale
edit, inspect both live nested results and save the document. It also rejects
stale file content and invalid source, then accepts a valid
definition update, including its authored rule description. The accompanying
native GUI review confirms visible pixel changes, the same process, continued
audio blocks, safe private output and save/recall. This proves the protocol and
live application path, not every agent client's configuration/lifecycle behaviour.

## Real BB agent acceptance

The [Luna trial](../../web/public/studio/2026-10-11-native-agent/README.md)
used GPT-6 Luna through BB's Codex provider with a workspace-local stdio MCP
configuration. The worker independently found and edited the existing field
renderer, added an energy bar and exported the accepted project. A continuous
native screen recording shows the change and a subsequent zero/intermediate/full
energy check without a refresh or application restart. The original gain was
restored, the audio graph was preserved and the worker's export exactly matched
Studio's authoritative save. A separate cold reopen preserved that document and
rendered it successfully at normal and narrow window sizes.

The coordinator supplied the endpoint/configuration and links to existing docs;
this does not prove self-service connection setup. After stopping the worker's
client, a second BB turn reconnected to the same Studio process and discovered
and read the new authoring guide through MCP resources. The read-only
`web/review-native-mcp-discovery.mjs ENDPOINT OUTPUT.json` checks guide
discovery, the current tool set and two fresh adapter connections to the same project.

The trial found that inspection is too large and catalog-heavy, and export
instructions were unclear. The guide and save-tool description clarify the
workflow; focused inspection and screenshot access are covered by the follow-up
below. The installed CUA backend could only target the shared desktop, so this test recorded an
isolated Xvfb display without shared-desktop input or compositor focus commands;
it is not a CUA-driven interaction test.

### Discovery, focused inspection and image follow-up

The [follow-up evidence](../../web/public/studio/2026-10-11-native-agent-tools/README.md)
includes the actual Agent inspector, MCP Presenter images, automated results and
Luna's independent read-only report. The worker used Studio's generated automatic
configuration, discovered the updated guide, traced the renderer's three input
wires and source file, and described the actual returned image through BB/Codex.
It correctly distinguished the reopened project's new session and revision zero
from the previous trial's revision four.

`MANIFOLD_REVIEW_DISPLAY=:1 node web/review-native-agent-workflow.mjs OUTPUT_DIR`
requires a pre-existing isolated X display and the `manifold_review_null` sink.
It verifies the owned process's audio routing and uses real SDK clients and
standalone apps to check:

- Copyable configuration and rendered connection controls.
- Focused inspection (570 bytes versus 63,094 for this fixture's full snapshot).
- Presenter PNG delivery, hidden-Presenter rejection and valid pixels after reopening it.
- Multiple-window ambiguity, explicit selection, and editing/capturing a covered window.
- Reconnection with the same MCP client after every Studio app closes and a new one starts.
- Inspection before editing the restarted process, and rejection of expired window connections.

The driver closes its apps and clients. It uses semantic workspace operations
and isolated display capture; it does not establish mouse-driven menu or clipboard
acceptance. The real Luna check verifies image visibility and guidance in one
client; restart handling is additionally exercised by the SDK acceptance driver.
PNG dimensions and color variation are checked against this rendered fixture.
The covered-window gain edit also produces a visibly reduced energy meter.

## Next native acceptance work

1. Package the adapter and dependencies with Studio. Discovery and copyable
   configuration are implemented; the release binary retains its semantic
   HTTP endpoint; MCP itself runs in this Node adapter, not embedded in the binary.
2. Extend real-client coverage to pause/resume, concurrent human drafts and source
   error/recovery. Application restart/discovery now passes the SDK acceptance
   driver; broaden the client/platform matrix and native capture backends.
3. Finish filesystem-linked reload for scripts/assets through the same accepted
   transaction boundary. Current `file.write` edits embedded project files live;
   it is not a filesystem watcher.
4. Broaden native host acceptance to packaged plug-ins and DAWs as appropriate.

Keep this milestone visible alongside nested composition, richer objects,
behaviours/bindings, Nacre coverage and the intended plug-in.
