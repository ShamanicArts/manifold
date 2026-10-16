# Manifold host networking

Native host services, separate from DSP and the audio callback. `ServiceHost`
uses a bounded worker queue; Rust UI/control callers use `submit` and poll its
receiver. `request` is the blocking convenience for bridge/CLI callers. Dropping
all handles releases that session's sockets, query clients and Link peer.

The native creator consumes the same editable `network` declaration and
`onNetwork(event, accepted)` mapping as the browser. Graph mutations and replies
wait for the ordinary runtime/audio acknowledgement. Network configuration is
saved in `liveAuthoring.network`; operating-system handles are never saved.

## Reviewable example

[Live creator](https://wubulon.tailfac9f9.ts.net:4174/primitives.html?program=network-services)
and [independent importing application](https://wubulon.tailfac9f9.ts.net:4174/examples/instrument-import/?program=network-services).

Start audio, then Connect networking. Actual TCP, UDP, OSC and OSCQuery addresses
appear. Use `examples/network-controller.py` with the desired address to change
`/network/tone` or `/network/volume`. Edit the visible `onNetwork` mapping and Apply
while playing. Retained/egui show the same accepted targets. Enable Link to join a
real SDK session; Follow tempo changes the core LFO rate. Start/stop sync maps the
session's play state to a separate smoothed core gain gate, preserving Volume.

## Running independently

```sh
cargo run --release -p manifold-services -- 127.0.0.1:4180
npm --prefix web run preview -- --port 4174
```

The included Vite adapter proxies `/__manifold/services` to the local bridge. An
external application can provide its own HTTP route or transport:

```js
import { HostServices } from '@manifold/author/host-services';

const network = new HostServices({ endpoint: '/my-service-bridge' });
const socket = await network.bindUdp('127.0.0.1:0');
await network.sendUdp(socket.id, '127.0.0.1:9000', new Uint8Array([1, 2, 3]));
const { events, dropped } = await network.poll();
await network.close();
```

`ProjectServices` attaches these services to a `LiveProjectRuntime` and supplies
JSON message framing, endpoint publication and accepted replies. It is portable
JS with a replaceable request transport; native QuickJS creator projects use the
host's declaration/event adapter. Imperative QuickJS socket calls are not yet
injected into its `host` object. The low-level byte API works independently of
JSON and OSC. TCP reads are stream chunks; UDP events preserve datagrams and peer
addresses. The example explicitly uses newline-framed JSON for TCP.

## Wire contract

POST `/__manifold/services` with `{session, command:{operation,...}}`. Replies are
`{result}` or `{error}`. An explicit `session.close` closes browser resources;
unresponsive browser sessions expire after 15 seconds. Native sessions follow
host lifetime. Up to 16 bridge sessions, 32 sockets/session, 16 KiB payloads,
128 pending events/session and 32 queued service jobs are supported. Event drops
and TCP write backpressure are visible. Addresses use IP:port, including bracketed
IPv6. Name resolution and encrypted raw socket transports are not implemented.

Operations: `capabilities`, `session.inspect`, `events.poll`, `udp.bind`,
`udp.send`, `tcp.listen`, `tcp.connect`, `tcp.write`, `socket.close`, `osc.bind`,
`osc.send`, `endpoints.publish`, `oscQuery.start`, `oscQuery.stop`,
`link.configure` and `link.inspect`. Typed JS definitions describe their arguments.
TCP writes acknowledge queue admission, not remote receipt; example response
messages separately confirm accepted graph changes.

OSC decoding/encoding uses `rosc`. Numeric/string/bool messages and immediate
bundles are supported. Future-timetag bundles are explicitly rejected until the
transport scheduler can honor them. OSCQuery supplies HTTP trees, HOST_INFO,
attributes and binary OSC value notifications through WebSocket LISTEN/IGNORE;
PATH_CHANGED reports changes to the published endpoint set. Automatic mDNS
advertisement and legacy custom dynamic query handlers remain open.

Link uses `ablink`, an independent MIT implementation of the Link protocol. The
official GPL SDK (`rusty_link`) is a dev-dependency only: the integration test and
the `link-peer` example run it as an official peer to prove discovery, tempo and
start/stop interoperability, and it is never linked into distributed binaries.
The current graph example demonstrates tempo and play-state orchestration.
Displayed beat/phase is a control-side SDK snapshot. The LFO phase is not locked
to Link phase; this is not sample-accurate quantized launch or a shared DAW/Link
clock authority. Those are the remaining transport slice. Plug-in service
adapters, broader legacy subscriptions/output-target persistence and complete
legacy service fidelity remain open.
