# OSCQuery Real-Time Visualization Patterns for Manifold Remote

**Date:** 2026-04-14  
**Context:** User is building a professional web-based remote control for Manifold plugins with a custom surface builder. The web remote (`web/remote-control/app.ts`) now supports toggle, choice, slider, XY pad, readout, and layout mirror widgets. This document explores patterns for adding **real-time visualization widgets** (oscilloscope, spectrum analyzer, level meters) over OSCQuery.

---

## 1. The Problem

OSCQuery is request/response by default. Real-time visualization requires a **stream of data points** at 30–60 fps. Naïve polling of `/value` endpoints creates:
- **Bandwidth bloat**: 60 × N requests/sec per widget
- **Host CPU load**: JSON serialization overhead in the plugin
- **Jitter**: Network latency causes frame drops

We need patterns that reconcile OSCQuery's REST-like design with continuous data streams.

---

## 2. Data Streaming Strategies

### 2.1 Bundle Polling (Good for Meters)

Instead of polling each endpoint individually, batch related values into a single bundle endpoint.

```
GET /audio/meters/bundle
→ { left: -12.3, right: -14.7, peakLeft: -6.2, peakRight: -8.1 }
```

**Trade-offs:**
- Reduces request count from N → 1
- Still HTTP overhead per frame
- Best for slow meters (10–20 fps)

**Manifold Integration:** Add a Lua behavior that aggregates meter values and exposes them at `/audio/meters/bundle`. The web remote polls this path at 20 Hz.

### 2.2 WebSocket Upgrade (Best for Scopes)

If the plugin host exposes a WebSocket alongside OSCQuery HTTP, the widget subscribes to a stream:

```
WS /__oscq/stream?path=/audio/scope
→ binary float32[] packets at 60 fps
```

**Trade-offs:**
- Lowest latency, lowest overhead
- Requires WebSocket support in the OSCQuery server (not standard)
- Manifold's current server is HTTP-only

**Verdict:** Powerful but requires server work. File as a future enhancement.

### 2.3 Server-Sent Events (SSE) — The Sweet Spot

SSE over HTTP is ideal for unidirectional streams:

```
GET /__oscq/events?path=/audio/scope&rate=60
Content-Type: text/event-stream

data: {"t":123456,"values":[-0.2,0.3,-0.1,...]}
```

**Advantages:**
- Uses existing HTTP infrastructure
- Automatic reconnection and backpressure
- Lower overhead than polling JSON repeatedly
- No custom binary protocol needed

**Manifold Integration:** The Vite proxy (`vite.config.ts`) already intermediates traffic. It could open an SSE connection to the plugin and fan-out to browser tabs.

### 2.4 OSC-over-UDP Direct from Browser

**Not viable.** Browsers cannot send/receive UDP directly. WebRTC data channels are possible but overkill.

---

## 3. Data Format Recommendations

### 3.1 Float32 Arrays for Waveform Data

For scopes and spectra, send raw `Float32Array` data. Options:

| Format | Size (1024 samples) | Pros | Cons |
|--------|---------------------|------|------|
| JSON array | ~8–15 KB | Human readable | Huge, slow to parse |
| Base64 Float32 | ~5.5 KB | Still text | Parsing cost |
| Binary SSE | ~4 KB | Native, fast | Requires `arraybuffer` handling |

**Recommendation:** If using SSE, send Base64-encoded Float32 data with a small header:

```json
{
  "fmt": "f32-b64",
  "n": 1024,
  "d": "//v9P77..."
}
```

Decode in the browser:

```javascript
const bytes = Uint8Array.from(atob(d), c => c.charCodeAt(0));
const samples = new Float32Array(bytes.buffer);
```

This is ~3× faster than parsing a JSON array of numbers.

### 3.2 Decimated Data for UI

Don't send the full plugin buffer (e.g., 480 samples). The screen is only ~1000px wide.

**Rule of thumb:** Send `max(2 * canvasWidth, 512)` samples and decimate on the server. For a 320px wide widget, 640 samples is plenty.

### 3.3 Frame Dropping

If the plugin produces data faster than the screen refreshes (e.g., 60 fps data on a 30 Hz mobile screen), drop frames in the render loop, not the network layer:

```javascript
let lastFrame = 0;
function draw(now) {
  if (now - lastFrame < 33) { // cap at 30 fps
    requestAnimationFrame(draw);
    return;
  }
  lastFrame = now;
  // render...
}
```

---

## 4. Widget-Specific Patterns

### 4.1 Oscilloscope

**Data source:** Time-domain waveform buffer  
**Update rate:** 30–60 fps  
**Recommended transport:** SSE or bundle polling at 30 Hz  
**Canvas strategy:**

```javascript
// Single path draw for performance
ctx.beginPath();
ctx.moveTo(0, centerY);
for (let i = 0; i < samples.length; i++) {
  const x = (i / (samples.length - 1)) * width;
  const y = centerY - samples[i] * height * 0.45;
  ctx.lineTo(x, y);
}
ctx.stroke();
```

**Tip:** Use `devicePixelRatio` scaling so the scope looks crisp on Retina displays:

```javascript
canvas.width = cssWidth * devicePixelRatio;
canvas.height = cssHeight * devicePixelRatio;
ctx.scale(devicePixelRatio, devicePixelRatio);
```

### 4.2 Spectrum Analyzer

**Data source:** FFT magnitude bins (e.g., 256 bins)  
**Update rate:** 30 fps  
**Rendering:** Log-frequency x-axis, dB-scaled y-axis

```javascript
const minDb = -90;
const maxDb = 0;
const barW = width / bins.length;

bins.forEach((mag, i) => {
  const db = 20 * Math.log10(mag + 1e-10);
  const norm = (db - minDb) / (maxDb - minDb);
  const h = Math.max(0, norm * height);
  ctx.fillRect(i * barW, height - h, barW - 1, h);
});
```

**Performance note:** For >256 bins, draw as a filled path rather than individual `fillRect` calls.

### 4.3 Peak Meter

**Data source:** Single float per channel  
**Update rate:** 20–30 fps  
**Recommended transport:** Bundle polling  
**Smoothing:** Exponential decay in the UI:

```javascript
peak = Math.max(peak * 0.9, newPeak);
```

---

## 5. Integration with Manifold's Custom Surface

The current custom surface builder in `app.ts` stores widgets as:

```javascript
{
  id: "...",
  widgetType: "slider",
  path: "/filter/cutoff",
  x: 10, y: 20, w: 220, h: 60
}
```

To add a `scope` widget, extend the schema:

```javascript
{
  id: "...",
  widgetType: "scope",
  path: "/audio/scope/left",
  x: 10, y: 20, w: 320, h: 120,
  options: {
    mode: "waveform", // or "spectrum"
    color: "#00d2ff",
    streamRate: 30
  }
}
```

Then in `buildControl()`, add a branch:

```javascript
if (widgetType === "scope") {
  const canvas = document.createElement("canvas");
  // setup dpr scaling, beginPath render loop
  // subscribe to SSE or start polling bundle endpoint
  controlCard.append(canvas);
  return controlCard;
}
```

**Memory management:** When a widget is removed from the surface, stop its `requestAnimationFrame` loop and close any SSE connections.

---

## 6. Security & Stability

- **Rate limiting:** The plugin should reject visualization endpoints if polled faster than 60 Hz to prevent accidental DoS.
- **Scope hiding:** Mark visualization endpoints as read-only and filter them from the generic parameter list (like `/stats` and `/debug` today).
- **Graceful degradation:** If the endpoint 404s, render a flat line and a subtle "no signal" overlay. Don't crash the surface.

---

## 7. Immediate Next Steps

1. **Prototype:** A self-contained HTML demo of a scope + spectrum widget (see `prototypes/2026-04-14-remote-surface-scope-widget.html`).
2. **Bundle endpoint:** Add `/audio/meters/bundle` to `export_plugin_shell.lua` for quick meter wins.
3. **SSE proxy:** Extend `vite.config.ts` to proxy `/__oscq/events?path=...` as an SSE stream from the plugin's HTTP server.

---

## 8. References

- **TouchOSC**: Uses raw OSC over UDP; not browser-compatible but sets the UX bar for custom surfaces.
- **Open Stage Control**: Web-based OSC control surface. Uses Node.js as a bridge; similar architecture to our Vite proxy.
- **Ableton Push / Bitwig Controllers**: Hardware surfaces use 30 fps LED meter updates. Good benchmark for perceived latency.
