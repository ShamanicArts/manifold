# Nacre authored on the website through WebMCP

3 October 2026.

## Workflow

The proof opens the HTTPS test website with the unrelated `ui-styled-tone`
starter. It discovers the site's native browser WebMCP tools and submits the
complete locally authored Nacre JavaScript through `manifold.source.apply`.
The accepted graph gains its phase vocoder, filter, waveshaper, input/audition
branches and authored Three.js face. This is a complete source submission,
not a preset switch or an edit to an already loaded Nacre page.

Native WebMCP edits the face layout and live parameters. A separate official
MCP SDK client connects through the site's Agent panel and HTTPS project-scoped
connection, inspects the same revision and changes displacement and waveform.
Both transports use the same accepted runtime and source-edit commands.

The human Arrange button then captures an actual pointer drag. The compact
position is accepted into source; the full-width position and sounding focus
are preserved. The Three.js canvas retains object identity. Escape cancels a
second drag without creating a revision. Undo restores the clean layout before
export. The agent selects external input for the shipped effect rather than
capturing the preview audition as enabled.

`manifold.build.create` and `manifold.build.inspect` run through native WebMCP.
The website's configured build worker produces the native archive. The captured
project, tool transcript, build receipt, video, audio and resulting download are
published together. Source strings in the transcript are replaced by byte counts
and SHA-256 hashes; the complete accepted source is available separately.

## Review and connection

- Studio: https://wubulon.tailfac9f9.ts.net:4174/studio.html?program=ui-nacre&project=/nacre/2026-10-03-webmcp/nacre.manifold.json
- Evidence: https://wubulon.tailfac9f9.ts.net:4174/nacre/2026-10-03-webmcp/
- Consumer: `web/review-nacre-webmcp.mjs`.
- Connection instructions: [WebMCP and remote MCP](webmcp-delivery.md).

The test site is available on the existing Tailscale HTTPS route. Native browser
WebMCP was exercised in Chromium 152 with `WebMCP,WebMCPTesting` enabled, using
real `document.modelContext.getTools()` and `executeTool()` with no polyfill.
Ordinary local MCP clients use the displayed HTTPS connection through **Agent →
Connect local agent**, which does not require native browser WebMCP support.
This proves the prepared-source/local-agent authoring workflow and website
build path. It does not claim a public account service or that a browser without
the WebMCP feature enabled can execute its native tools.

## Product corrections

- Removed the touch instructions and blurred spectral subtitle from the authored
  face. Its diegetic NACRE name is retained; the standalone toolbar says Manifold.
- Compact coordinates are explicit `compact: {x,y,width}` entries in the public
  layout contract, visible to humans and agents. The compact renderer no longer
  overwrites accepted placements by recomputing them from array order.
- The Manifold control panel selects a layout variant and exposes that choice
  to the authoring host. Human dragging and appearance edits write that variant.
- Authored views can opt into `updateLayout()`; compatible layout-only updates
  change `api.layout` without recreating their renderer. Nacre adopts it.
- Cancellation restores the preview and releases pointer capture. Positions are
  constrained to the visible panel. Both Studio and native Arrange use the
  displayed variant.

The default audition graph, effect DSP and native audio ownership are unchanged.

## Acceptance

- Native WebMCP discovered 15 real site tools. Complete source submission,
  layout editing, parameters, undo and build submission/progress passed.
- The external SDK 2.3.0 client discovered the same tools through the site's
  HTTPS connection and edited the same live project.
- Actual human drag/cancel preserved source ownership, sound targets and the
  renderer; compact layout survived the captured project.
- The final build captured revision 8, job
  `291ad1a8-03fd-46bc-b825-053451704c1b`.
- Download SHA-256:
  `6cdba1e7450840ac6805ec75e0ef9e45783798c2c83afb1df5b4c0f74a7fd55d`.
- That exact archive opened in REAPER as Linux CLAP and VST3. Both used real
  host input with audition disabled, rendered WebGL2, consumed native spectrum,
  changed parameters while the field was held, accepted source edits, recalled
  the DAW project and continued audio after closing the editor. Editor-closed
  RMS was approximately 0.0603/0.0602 respectively.
- Production build and 120 web tests passed. Preview input/file selection is
  accessible beside the source editor rather than hidden in the old panel.

Automated audio used a verified private null sink; native review used an isolated
X server. No new Windows/macOS validation or hardware frame-rate claim is made.
