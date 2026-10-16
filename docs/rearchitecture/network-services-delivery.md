# Networking and Link: first usable delivery

2 October 2026. This adds a **30th live program** to the DSP creator, with no new
DSP kind. The 29 earlier primitive auditions and their evidence remain intact.

## Builds and interaction

- [Live creator](https://wubulon.tailfac9f9.ts.net:4174/primitives.html?program=network-services): Start audio, Connect networking, then send data to the displayed ports. Retained and real Wasm egui expose Tone, Pulse rate, Volume and Playback gate. The highlighted source contains the full graph, endpoint declarations, network settings and `onNetwork` mapping.
- [Independent importing application](https://wubulon.tailfac9f9.ts.net:4174/examples/instrument-import/?program=network-services): imports public authoring/UI/host-service packages, connects its own service session and receives external control messages. It does not import the creator implementation.
- [Linux native standalone and bridge](https://wubulon.tailfac9f9.ts.net:4174/network-delivery/2026-10-02/Manifold-Networking-Link-linux-x86_64-r1.tgz): run `./manifold-app projects/network-services.manifold.json`, Listen, then expand Networking and Ableton Link and Connect. The native application owns its own service worker; it does not require a browser page. The separate `manifold-services` executable supplies a bridge for browser applications.
- External controller: [`examples/network-controller.py`](../../examples/network-controller.py). Use `tcp`, `udp` or `osc`, an actual displayed address, endpoint path and value. Default audition ports bind loopback; edit source addresses for the intended LAN/Tailscale interface.

Archive SHA256: `28b4746a3185de2396d3d0199d2597feac7f99b0d4edf60ac2362e563e229b97`. [Build manifest](https://wubulon.tailfac9f9.ts.net:4174/network-delivery/2026-10-02/build.json) records executable hashes and remaining host limits.

## Delivered behavior

TCP client/listener/accepted streams, UDP send/receive, raw byte JS/TS bindings
and Rust host worker APIs. TCP writes expose queue admission; the example's framed
response separately confirms accepted graph changes. Split/coalesced UTF-8 JSON
lines and datagram boundaries are handled. Socket/session lifetime, capacity,
write backpressure and event drops are explicit. Socket handles are not presets.

OSC numeric/string/bool packets and immediate bundles use `rosc`. The example
maps OSC paths through its authored handler to ordinary live parameter commands.
Replies and OSCQuery values come from accepted graph targets. Query HTTP supplies
trees, attributes and HOST_INFO. WebSocket LISTEN/IGNORE streams binary OSC values
and PATH_CHANGED reports actual endpoint-set changes.

Ableton Link uses `ablink`, an independent MIT implementation of the protocol (the
official GPL SDK is linked only as a test peer since 16 October 2026): enabled state, peer count,
tempo, beat/phase/quantum, play state, tempo-follow and optional start/stop sync.
The example maps tempo to a Rust LFO rate and play state to a separate smoothed
core gate. Volume remains an independently authored control. Enable, settings
and local play/stop requests are part of the canonical live project and survive
save/reopen. Network settings do not trigger audio graph compilation. Source
changes with unchanged network declarations preserve current settings; changed
socket declarations require reconnecting and retire the prior service session.

## Actual evidence

- [Browser report](https://wubulon.tailfac9f9.ts.net:4174/network-delivery/2026-10-02/browser/report.json): actual external UDP/TCP/OSC changed sounding targets and returned accepted values; OSCQuery tree and binary notification; highlighted source Apply changed an external value of 1000 to a target of 500; actual SDK peer changed tempo and LFO rate. Final private-sink Link playback RMS was approximately **0.03765 → 6.1e-10 → 0.03277** for play/stop/play. [Recorded live output excerpt](https://wubulon.tailfac9f9.ts.net:4174/network-delivery/2026-10-02/browser/live-output.ogg) captures earlier source/message/tempo interaction, not that final gate sequence. [Final UI](https://wubulon.tailfac9f9.ts.net:4174/network-delivery/2026-10-02/browser/final-live-services.png).
- [Native UI/audio recording](https://wubulon.tailfac9f9.ts.net:4174/network-delivery/2026-10-02/native/live-native.mp4): actual egui application receives messages and a source edit, with a verified owned null sink. [Native report](https://wubulon.tailfac9f9.ts.net:4174/network-delivery/2026-10-02/native/report.json) includes two framed TCP responses, UDP and OSC acknowledgements and an accepted source mapping edit. [Link/native state](https://wubulon.tailfac9f9.ts.net:4174/network-delivery/2026-10-02/native/final-link-live.json) records peer discovery, a matching LFO rate and source-edited control values. The exact final query adapter received a subsequent notification fix; interactive recordings precede that fix. It has a real HTTP/WebSocket regression test.
- [Independent importer report](https://wubulon.tailfac9f9.ts.net:4174/network-delivery/2026-10-02/browser/import-report.json) and [screenshot](https://wubulon.tailfac9f9.ts.net:4174/network-delivery/2026-10-02/browser/import-live.png): actual external UDP set Tone to 710 through a separate imported sounding graph and received its accepted revision/targets.
- 90 web tests pass; five actual socket/query/SDK-peer tests pass. Native creator tests cover all 30 programs, compatible history, network settings without audio publication and native settings recall. Production web, independent importer and optimized native builds pass. The intermediate query test exposed a false PATH_CHANGED event on initial subscription; notifications now compare the actual endpoint tree, and its regression passes.

Browser review used BB's actual browser with direct verification of private audio
routing for the reported measurements. A browser restart hit a missing history
latency field and was fixed before the final gate review. Native review used an
isolated X server and owned null audio sink; the first attempted launch selected
Wayland despite the requested X display, so it was terminated and subsequent
launches explicitly removed Wayland environment variables. Do not claim that
initial attempt proved silent desktop placement. Raw intermediate attempts and
failures remain in ignored review artifacts.

## Code and boundaries

[`manifold-services`](../../crates/manifold-services/README.md) owns native socket,
query and Link services. `ServiceHost::submit` is nonblocking for UI/control
callers; its bounded worker runs networking. DSP/audio callbacks do not call it.
The browser uses an optional same-origin bridge, with a replaceable request
transport for external applications. Native QuickJS receives the same authored
network declaration/events through the creator's host adapter.

Public bindings: [`host-services.js`](../../packages/manifold-author/host-services.js),
[TypeScript definitions](../../packages/manifold-author/host-services.d.ts),
[editable complete graph](../../packages/manifold-author/examples/network-services.mjs)
and `network.receive`/`network.configure` in `LiveProjectRuntime`. Accepted
network configuration is validated in both JS and native package parsing.

## Remaining scope

This is working basic networking and Link tempo/play-state integration, not full
legacy service parity or completion of the Manifold port:

- LFO phase remains its own DSP state. Beat/phase display is an SDK control-side
  snapshot, not a sample-accurate Link clock driving quantized graph launches.
  Unified local/DAW/Link clock selection, scheduling and looper integration stay
  in the transport slice.
- CLAP/VST3 service lifecycle/UI adapters remain open. This delivery is native
  standalone plus bridged browser, not automatic service support in every DAW.
- Imperative socket functions are not yet injected directly into QuickJS `host`;
  native projects currently use declarations and authored event handlers. Rust
  worker APIs and public JS bridge/custom-transport APIs are available.
- OSC future timetags are explicitly rejected. Automatic mDNS discovery, custom
  legacy endpoint/query handlers, configurable broadcast targets and wider
  legacy subscription/persistence behavior remain open.
- Settings intent and authored mappings are recalled; live connections/handles
  are recreated. Callback jitter/Link phase accuracy and DAW deadline guarantees
  have not been measured by this increment.

Lucas requested a discussion of JS example readability and authoring philosophy
**after this service implementation**. That is the next design discussion: the
examples should explain presentation, behavior and orchestration clearly to
humans and agents. No new scripting syntax has been imposed by this increment.
