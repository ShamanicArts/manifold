# Web Remote Control for Manifold - Specification

## Purpose
Provide a browser-based remote control surface for Manifold plugins and projects over OSCQuery.

This should support **two modes**:

1. **Generic Remote**
   - Works immediately for any Manifold target that exposes OSCQuery.
   - Auto-discovers parameters, ranges, access, descriptions, and current values.
   - Renders generic web controls (knobs, sliders, toggles, XY pads, buttons, dropdowns).

2. **Native-ish Remote**
   - Reconstructs the plugin's intended layout as closely as possible using web primitives.
   - Uses a **layout JSON contract** exposed by the runtime or generated at build time.
   - Does **not** depend on the browser reading raw Lua files from the plugin bundle.

The long-term goal is a reusable remote-control and alternate-view system for all Manifold plugins.

---

## Reality Check / Constraints

### What we already have
Manifold already exposes:
- OSCQuery HTTP tree discovery
- OSCQuery host info
- HTTP value queries
- WebSocket LISTEN / IGNORE subscriptions
- WebSocket value streaming
- Per-plugin OSC / OSCQuery namespaces and ports

### What we do **not** have yet
We do **not** currently have a clean remote layout endpoint for plugin UI structure.

### Important design correction
The browser should **not** try to fetch arbitrary Lua source files from plugin bundle paths.
That is a brittle and stupid dependency for several reasons:
- browsers cannot freely read local bundle files unless we explicitly serve them
- raw Lua source is not a stable remote API
- layout reconstruction from arbitrary Lua code is much harder than from structured data
- plugin hosts and packaging differ across standalone / VST3 / AU / future targets

So the correct architecture is:
- **OSCQuery for control/state discovery**
- **dedicated layout metadata for native-ish rendering**
- **generic fallback when layout metadata is unavailable**

## First-pass architecture corrections

These points became clearer after the first real browser remote pass.

### Local service is the normal deployment shape
The browser remote is typically served by a **local service** associated with the running Manifold target or plugin type.
It is not useful to think of the browser as a completely standalone OSC client floating in space.

### Host should default from the page origin
For normal use, the target host should default to:
- `window.location.hostname`

If the user opened the remote through a LAN IP, Tailscale IP, or DNS name, the remote should use that same host by default.
A manual host override can still exist for advanced/debug cases, but it should not be the primary workflow.

### Separate origins per plugin type are acceptable
We do **not** require one giant shared origin for all Manifold remotes.
A per-plugin-type or per-remote origin is a valid shape as long as each page has a clean path to its local service and target discovery.

### Browser -> local service -> OSC is a valid architecture
A browser can absolutely drive OSC cleanly when a local service relays browser actions into:
- OSC packets
- direct control writes
- or another plugin-side control API

The real browser limitation is **raw UDP from the page itself**, not browser communication with a local service.
Open Stage Control style relay/proxy behavior is a valid architectural reference here.

That means the transport question is about choosing a clean browser-facing service API, not pretending browser-driven OSC is impossible.

---

## Existing Protocol Behavior

## HTTP
Current OSCQuery server supports:

- `GET /`
  - returns OSCQuery tree JSON
- `GET /info`
  - returns OSCQuery tree JSON
- `GET /?HOST_INFO`
  - returns host info JSON
- `GET /osc/<path>`
  - returns value query JSON for an OSC path
- `GET /<osc-path>`
  - direct path lookup fallback
- `GET /?LISTEN=<osc-path>`
  - returns current value for a listen target

### Host info example
```json
{
  "NAME": "Manifold OSCQuery Server",
  "EXTENSIONS": {
    "ACCESS": true,
    "VALUE": true,
    "RANGE": true,
    "DESCRIPTION": true,
    "TAGS": true,
    "LISTEN": true,
    "PATH_CHANGED": true
  },
  "OSC_IP": "0.0.0.0",
  "OSC_PORT": 9010,
  "OSC_TRANSPORT": "UDP",
  "WS_PORT": 9011
}
```

## WebSocket
The current server accepts WebSocket connections and supports:

### Client → server commands
```json
{"COMMAND":"LISTEN","DATA":"/plugin/params/cutoff"}
{"COMMAND":"IGNORE","DATA":"/plugin/params/cutoff"}
```

### Server → client streaming
The server currently streams **binary OSC packets over WebSocket**, not JSON value objects.

That means the web client must:
- open a WebSocket
- send `LISTEN` / `IGNORE` JSON messages
- decode incoming **binary OSC packets**
- update subscribed control values from decoded OSC messages

### Important note
A remote web client should not assume messages look like:
```json
{"path":"/plugin/params/cutoff","value":0.7}
```

That is **not** the current implementation.

## Current write path
The first-pass browser client currently writes through:
- `POST /api/command`
- command bodies such as `SET /plugin/params/cutoff 1200`

This works as a bootstrap, but it should be treated as a **transitional browser-facing API**, not the final shape.

## Recommended write-path evolution
Preferred long-term write shapes are:

1. **OSC-over-WebSocket**
   - browser sends binary OSC packets to the local service
   - local service/plugin parses and dispatches them
   - browser receives binary OSC packets back for live updates

2. **Structured browser messages relayed by the local service**
   - HTTP or WebSocket messages like:
   ```json
   {"path":"/plugin/params/cutoff","value":1200}
   ```
   - local service translates them into OSC or direct parameter writes

The important point is that the local service can do the relay cleanly. We should not bake the stringly `SET ...` command bridge into the long-term protocol unless it proves to be the best shape after real use.

## Addressing, identity, and context
These are separate concerns and should stay separate.

### Addressing
How the browser reaches the target or local service.
For normal operation this should derive from the page origin host, with manual override only when needed.

### Instance identity
Each remotely controllable plugin instance should have a stable identifier such as:
- `instanceId`
- `pluginType`
- optional human-readable `displayName`

### Context metadata
When available, the target should also expose optional context such as:
- host application name
- project name
- track path
- device path
- slot name/index

Example:
```json
{
  "instanceId": "abc123",
  "pluginType": "fx",
  "displayName": "Manifold FX",
  "context": {
    "hostApp": "Bitwig Studio",
    "projectName": null,
    "trackPath": null,
    "devicePath": null,
    "slotName": null
  }
}
```

This metadata is optional and host-dependent, but the schema should exist now so we have a stable place to surface it later.

### Multi-instance routing
If one local service exposes multiple plugin instances behind a single endpoint, it should provide instance routing through:
- an instance list
- an instance ID
- and/or path prefixes

If each instance or plugin type instead owns its own origin/port, that is also acceptable.
The protocol should support both deployment shapes.

---

## Remote UI Modes

## Mode 1: Generic Remote
This is phase 1 because it works with current infrastructure.

### Inputs
- OSCQuery tree
- current parameter values
- optional descriptions / tags / path naming conventions

### Behavior
- Traverse OSCQuery tree and collect writable endpoints
- Infer widget types from:
  - OSC type
  - range
  - access flags
  - parameter naming
  - optional tags
- Group controls by path prefixes
- Subscribe to visible / active controls over WebSocket
- Send parameter changes via OSC or command bridge

### Generic widget mapping
| Parameter shape | Widget |
|---|---|
| float with range | knob or slider |
| int with small enum-like range | dropdown / segmented control |
| bool | toggle |
| trigger | button |
| paired x/y params | XY pad |
| read-only scalar | meter / readout |

### Generic grouping heuristics
- `/plugin/params/*` → top-level controls
- `/band/<n>/*` → grouped panels
- `/fx/<n>/*` or `/slot/<n>/*` → effect slot sections
- `/env/*`, `/lfo/*`, `/filter/*` → named blocks

### Strengths
- immediate coverage for all current plugins
- no extra plugin-side layout work required
- useful for automation, testing, remote tweaking, tablet control

### Weaknesses
- does not match native UI layout exactly
- path grouping can be ugly unless we provide extra metadata

---

## Mode 2: Native-ish Remote
This mode reconstructs the plugin UI in the browser as closely as possible.

## Required contract
We need a stable layout representation, preferably JSON.

### Recommended endpoint
```text
GET /ui/layout
```

Optional alternates:
- `GET /module/main/layout`
- `GET /ui/layout?view=main`
- `GET /ui/layout?component=filter`

### Recommended response shape
```json
{
  "version": 1,
  "name": "Manifold Filter",
  "theme": {
    "bg": "#0f172a",
    "fg": "#e2e8f0",
    "accent": "#22d3ee"
  },
  "root": {
    "id": "root",
    "type": "panel",
    "x": 0,
    "y": 0,
    "w": 920,
    "h": 360,
    "children": [
      {
        "id": "cutoff",
        "type": "knob",
        "x": 248,
        "y": 80,
        "w": 72,
        "h": 72,
        "label": "Cutoff",
        "bind": { "path": "/plugin/params/cutoff" },
        "style": {
          "bg": "#1e293b",
          "colour": "#22d3ee"
        }
      }
    ]
  }
}
```

## Source of layout data
Preferred sources, in order:

### A. Runtime-exported structured UI tree
Best option if the plugin/project already has structured UI runtime data.

Manifold already maintains structured UI runtime state internally. That makes this route promising because it avoids parsing raw Lua source in the browser.

### B. Build-time generated layout JSON
For export plugins, generate a sidecar layout JSON from the component spec during build.

Example output path:
- `Resources/remote-ui/layout.json`

Then expose it through the plugin's OSCQuery HTTP server.

### C. Manual remote layout descriptors
For legacy / hand-authored UIs that are not easily serialized automatically.

This is a fallback, not the preferred path.

---

## Widget Model

## Core widgets
The remote renderer should support a small stable subset first:
- panel
- label
- button
- knob
- slider
- vslider
- toggle
- dropdown
- segmented control
- XY pad
- meter
- waveform view (optional later)
- graph / plot panel (optional later)

## Style model
Need a normalized style layer for web rendering:
- background
- foreground/text color
- border color / width
- corner radius
- font size
- opacity
- accent color

### Color conversion
Lua UI commonly uses ARGB integers:
- `0xAARRGGBB`

Remote layer must convert these to CSS-compatible color values.

---

## Parameter Binding Model

Each interactive widget should bind to one or more OSC paths.

### Single-path binding
```json
{ "path": "/plugin/params/mix" }
```

### Multi-path binding (XY etc.)
```json
{
  "xPath": "/plugin/params/x",
  "yPath": "/plugin/params/y"
}
```

### Optional metadata
```json
{
  "path": "/plugin/params/cutoff",
  "display": "log",
  "unit": "Hz",
  "default": 1000.0
}
```

---

## XY Pad Requirements

## Visual behavior
Remote XY pads should support:
1. background panel
2. grid lines
3. center crosshair
4. handle position crosshair
5. active-region fill
6. glow / highlight layers
7. drag-state styling
8. corner value labels (optional)

## Interaction
- drag updates X and Y continuously
- Y axis is inverted relative to screen space
  - top = high value
  - bottom = low value
- should support mouse + touch
- should batch / throttle outbound updates sensibly

## Binding
An XY widget binds to two OSC parameters.

---

## Generic Spawnable Controls

A major feature of the web remote should be the ability to create **custom remote surfaces** from discovered parameters.

## User capabilities
- browse all exported parameters
- drag parameters onto a blank canvas
- choose control type (knob / slider / XY / toggle / button / meter)
- save named remote layouts
- create plugin-specific or personal control pages
- make tablet-friendly macro pages

## Why this matters
This is more valuable than just cloning the native layout.
It turns remote control into a real product feature instead of a tech demo.

## Current first-pass status
The current "custom surface" implementation is **not** this full feature yet.
Right now it is closer to:
- a saved flat list of chosen controls
- browser-local persistence
- simple control-type overrides

It is **not yet** a true authored surface system with:
- spatial layout/canvas editing
- robust interaction design
- shareable/project-backed persistence
- a stable custom-page schema

The spec should describe the real target, while being honest that the current first pass is only a stub toward it.

---

## Suggested Delivery Phases

## Phase 1 — Generic Web Inspector / Remote
Ship first.

### Scope
- connect to the local service for the current remote origin
- default target host from the page URL host
- fetch OSCQuery tree
- fetch host info
- fetch instance metadata/context when available
- decode WebSocket OSC packets
- render generic grouped controls
- allow control writes through the local service relay
- save/load lightweight browser-side custom pages

### Outcome
Immediate utility for every plugin with no layout endpoint work.

## Phase 2 — Layout Endpoint
Add plugin-served remote layout metadata.

### Scope
- `GET /ui/layout`
- serialize a stable widget tree
- render native-ish layout in browser
- preserve binding paths and styling metadata

### Outcome
Remote UI starts to resemble the plugin itself.

## Phase 3 — Rich Components
Add higher-level components:
- filter graphs
- EQ curves
- waveform displays
- modulators / envelopes
- rack views / patchbay views

## Phase 4 — Remote Authoring
- custom remote page editor
- plugin templates
- touch-first panels
- macro dashboards
- performance pages

---

## Recommended Plugin-Side Changes

## 1. Add layout metadata endpoint
Add HTTP support for:
- `GET /ui/layout`

## 2. Expose capabilities
Add optional endpoint:
- `GET /ui/capabilities`

Example:
```json
{
  "genericRemote": true,
  "layoutRemote": true,
  "customPages": false,
  "graphs": ["filter", "eq"],
  "widgets": ["knob", "slider", "toggle", "dropdown", "xy"]
}
```

## 3. Optional: expose plugin metadata
- plugin name
- version
- project id
- theme hints
- module category hints
- stable `instanceId`
- `pluginType`
- human-readable `displayName`

## 4. Optional: expose host/context metadata
When available, expose:
- host application name
- project name
- track path
- device path
- slot/index labels

This must be optional and best-effort, because host support varies, but the schema should exist.

## 5. Optional: expose grouped parameter metadata
This can reduce generic-layout ugliness.

Example:
```json
{
  "groups": [
    {
      "id": "main",
      "label": "Main",
      "paths": ["/plugin/params/mix", "/plugin/params/gain"]
    }
  ]
}
```

---

## Browser App Architecture

## Transport layer
- browser page is typically served by a local Manifold remote service
- default target host from the current page origin host
- separate origins per plugin type/remote are acceptable
- HTTP for discovery and metadata
- WebSocket for live updates
- OSC decoder for binary incoming messages
- preferred long-term writes are either OSC-over-WebSocket or structured service messages relayed into OSC/direct control writes

## Data model
- host info
- instance identity metadata
- optional host/context metadata
- endpoint registry
- current value store
- subscriptions
- layout metadata (optional)
- saved custom pages / authored remote pages

## Renderer layer
- generic inspector renderer
- native-ish renderer
- custom-page renderer

## State update policy
- subscribe only to visible / active controls where possible
- coalesce rapid updates for UI painting
- avoid echo loops when local writes round-trip back from server

---

## Testing Strategy

## Phase 1 testing
Use real running plugins with OSCQuery enabled.

Test:
1. discover host info
2. fetch full tree
3. subscribe to writable endpoints
4. move controls in browser
5. verify plugin reacts
6. move controls in plugin
7. verify browser updates

## Targets
- Standalone Filter
- Standalone EQ8
- Standalone FX
- Main MidiSynth
- any future exported utility plugin such as Scale Quantizer

---

## Product Positioning

This is potentially a real differentiator for Manifold.

Not just:
- “a web debug page”

But:
- a remote control surface
- an alternate renderer
- a control-page authoring environment
- a plugin-agnostic browser-based control protocol for Manifold products

That is actually interesting.

---

## Bottom Line

The right plan is:

1. **Ship a generic OSCQuery-based remote first**
2. **Default host/addressing from the page origin, not manual re-entry as the primary path**
3. **Treat browser -> local service -> OSC as a valid first-class architecture**
4. **Add a proper layout metadata endpoint**
5. **Add stable instance identity and optional host/context metadata**
6. **Do not rely on raw Lua source fetches from the browser**
7. **Support real custom user-authored remote pages as a first-class feature, not just a saved flat control list**

That gets us something useful fast without painting ourselves into a stupid corner.