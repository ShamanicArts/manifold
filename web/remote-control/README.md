# Manifold Remote Control

First-pass browser remote for Manifold OSCQuery targets.

## What it does

- Connects to any Manifold OSCQuery HTTP/WS endpoint
- Discovers parameters from the OSCQuery tree
- Renders a **generic** grouped control surface
- Lets you build a **custom surface** by adding parameters from the browser
- Tries to load `/ui/layout` for a future native-ish mirrored view
- Receives live value updates over WebSocket OSC packets
- Sends control writes through `POST /api/command`

## How to run

This is just static HTML/CSS/JS.

Any static file server is fine, for example:

```bash
cd web/remote-control
python -m http.server 8080
```

Then open:

```text
http://127.0.0.1:8080
```

## Required plugin/server support

The current first pass expects the target to expose:

- `GET /`
- `GET /?HOST_INFO`
- `GET /osc/<path>`
- WebSocket LISTEN / IGNORE
- `POST /api/command` for `SET` / `TRIGGER`

`/ui/layout` is optional for now.

## Current limitations

- No real layout mirroring yet unless the target exposes `/ui/layout`
- Generic widget inference is heuristic-based
- Enum/dropdown metadata is not exposed by OSCQuery yet
- Custom surface layout is simple browser-side persistence, not a full editor yet
