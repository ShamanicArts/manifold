# Web Remote Control for Manifold - Specification

## Purpose
Web-based remote control interface for Manifold plugins that connects via OSCQuery to discover and control parameters in real-time.

## How It Works

### Connection
1. User enters host:port of running Manifold plugin in browser
2. Web app fetches OSCQuery tree from `GET http://host:port/`
3. Tree contains all parameters with types, ranges, and descriptions
4. WebSocket opens on same port for bidirectional value streaming
5. App subscribes to parameters via `LISTEN` commands

### OSCQuery Tree Format
```json
{
  "FULL_PATH": "/",
  "CONTENTS": {
    "midi": {
      "FULL_PATH": "/midi",
      "CONTENTS": {
        "synth": {
          "FULL_PATH": "/midi/synth",
          "CONTENTS": {
            "cutoff": {
              "FULL_PATH": "/midi/synth/cutoff",
              "TYPE": "f",
              "ACCESS": 3,
              "RANGE": [{"MIN": 20, "MAX": 20000}],
              "DESCRIPTION": "Filter cutoff frequency"
            }
          }
        }
      }
    }
  }
}
```

### WebSocket Protocol
- Upgrade request on same port as HTTP
- Commands:
  - `{"command":"LISTEN","path":"/midi/synth/cutoff"}` - subscribe to changes
  - `{"command":"SET","path":"/midi/synth/cutoff","value":0.5}` - send value
  - Server pushes: `{"path":"/midi/synth/cutoff","value":0.7}` - value update

## Widget Mapping

### Lua to Web
| Lua Widget | Implementation |
|------------|---------------|
| Knob | SVG rotary, -135° to 135° arc, 3-layer rendering |
| Slider | Custom horizontal/vertical |
| Toggle | CSS switch |
| XYPad | Canvas 2D with grid, crosshair, filled quadrant, glow |
| Button | HTML button |

### Colors
- Lua uses ARGB format: `0xAARRGGBB`
- Need Utils.darken() and Utils.brighten() ported from Lua

## XY Pad Specifics

### Visual Elements
1. Rounded background rect (bgColour)
2. 3×3 grid lines (gridColour)
3. Crosshair at center (brightened grid)
4. Crosshair at current position (colMid)
5. Filled quadrant showing active region (colDim)
6. 3-layer glow behind handle (larger when dragging)
7. Outer ring (white when dragging)
8. Main handle circle (handleColour normally, white when dragging)
9. Inner dot (inverted color)
10. X/Y value labels at corners

### Interaction
- Drag sets X/Y (0-1 range)
- Y is inverted: top = 1.0, bottom = 0.0
- 20px margin inside widget bounds
- Immediate updates during drag

### OSC Binding
- xPath: OSC path for X parameter
- yPath: OSC path for Y parameter
- Both parameters updated together

## Layout Approaches

### Generic (Phase 1)
- Parse OSCQuery tree
- Auto-generate knob grid
- Works with any plugin immediately

### Layout Endpoint (Phase 2)
- Add C++ endpoint: `GET /module/{id}/layout`
- Returns widget positions matching Lua UI
- JSON format mirrors Lua component definitions

## Testing

### With Real Plugins
1. Launch any Manifold plugin (Tempus has OSCQuery enabled)
2. Check Settings for OSCQuery port (usually 9001)
3. Enter localhost:port in web UI
4. Should fetch tree and render controls
5. Dragging controls should affect plugin in real-time

## C++ Integration Needed

### Minimal (works now)
- No changes needed - uses existing `/` and `/osc/{path}` endpoints

### Layout Endpoint
```cpp
// In OSCQueryServer::handleHttpRequest
if (path.startsWith("/module/") && path.endsWith("/layout")) {
    // Serialize Lua UI component to JSON
    // Return widget positions, types, colors
}
```

## Key Requirements

1. **Host:Port input** - user must enter connection details
2. **Tree parsing** - extract all parameters from nested CONTENTS
3. **Type handling** - f=float, i=integer, T/F=boolean
4. **Range handling** - use RANGE for min/max on sliders/knobs
5. **WebSocket lifecycle** - connect, reconnect, error handling
6. **Y-axis inversion** - XY pad Y is upside-down vs screen coordinates
7. **Color conversion** - ARGB to CSS RGBA
