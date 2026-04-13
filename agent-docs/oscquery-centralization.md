# OSCQuery Centralization Architecture

## Table of Contents

1. [Purpose](#purpose)
2. [Scope](#scope)
3. [Current Implementation](#current-implementation)
   - [Architecture Overview](#architecture-overview)
   - [Current Ownership Boundaries](#current-ownership-boundaries)
   - [BehaviorCoreProcessor Responsibilities](#behaviorcoreprocessor-responsibilities)
   - [OSCQuery Server Responsibilities](#oscquery-server-responsibilities)
   - [Endpoint Registry Responsibilities](#endpoint-registry-responsibilities)
   - [UI Metadata and Layout](#ui-metadata-and-layout)
   - [Current Web Remote Model](#current-web-remote-model)
   - [Current Port Model](#current-port-model)
   - [Current Strengths](#current-strengths)
   - [Current Problems](#current-problems)
4. [Target Architecture](#target-architecture)
   - [Core Goal](#core-goal)
   - [Design Principles](#design-principles)
   - [What Centralization Means](#what-centralization-means)
   - [What Centralization Does Not Mean](#what-centralization-does-not-mean)
   - [Central Aggregation Layer](#central-aggregation-layer)
   - [Instance Identity](#instance-identity)
   - [Namespace Design](#namespace-design)
   - [Aggregated HTTP Surface](#aggregated-http-surface)
   - [Aggregated WebSocket Surface](#aggregated-websocket-surface)
   - [Per-Instance UI Meta and Layout](#per-instance-ui-meta-and-layout)
   - [Command Routing](#command-routing)
   - [Value Routing and LISTEN Bridging](#value-routing-and-listen-bridging)
   - [Diagnostics and Introspection](#diagnostics-and-introspection)
   - [Relationship to the Web Remote](#relationship-to-the-web-remote)
   - [Relationship to Broader Hub Concerns](#relationship-to-broader-hub-concerns)
5. [Reference Data Model](#reference-data-model)
   - [Instance Descriptor](#instance-descriptor)
   - [Aggregated Surface Descriptor](#aggregated-surface-descriptor)
   - [Routing Table](#routing-table)
   - [UI Meta Envelope](#ui-meta-envelope)
6. [Implementation Plan](#implementation-plan)
   - [Phase 0: Invariants and Constraints](#phase-0-invariants-and-constraints)
   - [Phase 1: Extract Surface Model from Local Serving](#phase-1-extract-surface-model-from-local-serving)
   - [Phase 2: Introduce Central Registry](#phase-2-introduce-central-registry)
   - [Phase 3: Build Aggregated Tree and Routing Layer](#phase-3-build-aggregated-tree-and-routing-layer)
   - [Phase 4: Bridge Per-Instance Updates and Commands](#phase-4-bridge-per-instance-updates-and-commands)
   - [Phase 5: Expose Aggregated UI Metadata and Layout](#phase-5-expose-aggregated-ui-metadata-and-layout)
   - [Phase 6: Refactor Web Remote to a Single Connection Model](#phase-6-refactor-web-remote-to-a-single-connection-model)
   - [Phase 7: Fold the Same Control Plane into Broader Hub Work](#phase-7-fold-the-same-control-plane-into-broader-hub-work)
   - [Phase 8: Optional Reduction of Local Public Serving](#phase-8-optional-reduction-of-local-public-serving)
7. [Detailed Work Breakdown](#detailed-work-breakdown)
   - [C++ Runtime Work](#c-runtime-work)
   - [OSCQuery Refactor Work](#oscquery-refactor-work)
   - [Instance Registration Work](#instance-registration-work)
   - [Web Remote Work](#web-remote-work)
   - [Hub Integration Work](#hub-integration-work)
8. [Testing and Validation](#testing-and-validation)
   - [Correctness Checks](#correctness-checks)
   - [Protocol Checks](#protocol-checks)
   - [UI/Remote Checks](#uiremote-checks)
   - [Diagnostics Checks](#diagnostics-checks)
   - [Migration Checks](#migration-checks)
9. [Benefits](#benefits)
10. [Migration Path](#migration-path)
11. [Open Questions](#open-questions)
12. [Conclusion](#conclusion)

---

## Purpose

This document describes how Manifold should move from a **plugin-local / instance-local OSCQuery model** to a **single unified discoverable OSCQuery space**.

The point is not to throw away the strong per-instance OSCQuery surface that already exists.

The point is to:

- preserve that surface,
- aggregate it cleanly,
- expose it through one coherent entry point,
- make the web remote the first concrete consumer,
- and give the broader hub/platform work the same control/discovery backbone.

This is an architecture and refactor plan.

It is grounded in the current project shape:

- per-instance `BehaviorCoreProcessor` ownership of OSC/OSCQuery,
- per-instance `OSCQueryServer`,
- registry-driven endpoints,
- current `/ui/meta` and `/ui/layout` behavior,
- current browser remote as a multi-target client,
- and first-class debug/introspection surfaces already exposed through OSCQuery.

---

## Scope

This document is specifically about:

- OSCQuery centralization,
- aggregated discovery,
- preserving per-instance product surfaces,
- refactoring current serving logic into reusable surface primitives,
- and moving the web remote to a one-connection model.

This document is **not** about inventing an unrelated plugin lifecycle model.

It does not assume the central layer launches plugin instances.

It does not assume the browser itself implements OSCQuery serving logic.

It does not assume that current per-instance public paths should be flattened away.

It also does not treat marketplace, licensing, auth, or other hub concerns as fake or irrelevant. Those concerns are real, but they sit **on top of the same central control/discovery plane** rather than replacing the architecture described here.

---

## Current Implementation

### Architecture Overview

The current architecture is straightforward:

```text
Running Product / Instance
├── BehaviorCoreProcessor
│   ├── OSCServer (UDP)
│   ├── OSCQueryServer (HTTP + WS)
│   ├── OSCEndpointRegistry
│   ├── public plugin param aliases
│   ├── plugin UI/debug/perf endpoints
│   └── command routing into processor/runtime state
└── project-local UI metadata / layout

Web Remote
├── target A: host:port
├── target B: host:port
├── target C: host:port
└── client-side state manages multiplicity
```

Each running export product or target owns its own public OSC/OSCQuery surface.

The browser remote then connects to each one individually.

That model is not broken. In fact, it is already powerful.

But it leaves the system with **no aggregate namespace or control plane above the instance boundary**.

### Current Ownership Boundaries

Right now, these concerns are mostly bundled together at the per-instance level:

- endpoint registration,
- tree construction,
- value lookup,
- command handling,
- live update streaming,
- host info,
- UI metadata,
- layout serving,
- and local port exposure.

That bundling is fine for getting a single product working.

It becomes painful once the platform wants to reason about:

- more than one product,
- more than one instance,
- one remote spanning multiple targets,
- one user/session identity spanning products,
- platform features like licensing/store/product discovery,
- support/diagnostics across products.

### BehaviorCoreProcessor Responsibilities

`BehaviorCoreProcessor` currently acts as the local owner of export/plugin-facing control state.

That includes:

- reading export config from project manifests,
- applying OSC enable/query enable defaults,
- managing input/query ports,
- registering curated plugin param aliases,
- exposing public plugin UI paths,
- exposing performance/debug/introspection paths,
- forwarding writes into the underlying processor/runtime state,
- rebuilding the OSCQuery tree as needed.

In other words:

> the processor currently owns both the runtime behavior **and** the local public network-facing surface for that instance.

That is the current reality this plan is refactoring around.

### OSCQuery Server Responsibilities

`OSCQueryServer` currently handles:

- building a tree from `OSCEndpointRegistry`,
- serving the tree over HTTP,
- serving `HOST_INFO`,
- responding to `GET /osc/<path>` reads,
- handling `POST /api/command`,
- serving `/ui/meta`,
- serving `/ui/layout`,
- accepting WebSocket connections,
- tracking LISTEN / IGNORE subscriptions,
- broadcasting value changes.

That is already most of the protocol machinery we need.

The architectural problem is not that this logic does not exist.

The problem is that it currently exists **only as a per-instance public surface**, not as an aggregate platform-level one.

### Endpoint Registry Responsibilities

`OSCEndpointRegistry` is already the right kind of primitive for this refactor.

It provides a registry-driven model of public endpoints and associated metadata.

That means the system already has a shape that is compatible with centralization:

- endpoints can be enumerated,
- metadata can be preserved,
- trees can be rebuilt,
- custom/script-defined endpoints can participate,
- and backend-owned versus custom/public-owned distinctions already exist.

This is a big deal.

It means centralization is not inventing a discovery model from scratch.

It is mostly about:

- extracting reusable surface descriptions,
- introducing a central registry above instances,
- and routing/proxying coherently.

### UI Metadata and Layout

Current products can expose:

- `/ui/meta`
- `/ui/layout`

Those are not incidental extras.

They are part of the product surface.

They allow the remote to:

- know what product it is looking at,
- know parameter metadata beyond raw OSCQuery node info,
- know capabilities,
- optionally mirror a more product-specific layout.

Any centralization work that loses these endpoints would be architecturally dumb.

The central layer must preserve them as **per-instance** surfaces.

### Current Web Remote Model

The browser remote is currently a multi-target client.

It maintains state like:

- `targets: Map<string, Target>`
- `activeTargetId`
- per-target values
- per-target WebSocket
- per-target custom surface state
- per-target layout state

Typical flow:

1. User enters host and port.
2. Browser fetches host info from one target.
3. Browser fetches the OSCQuery tree from one target.
4. Browser fetches `/ui/meta` and maybe `/ui/layout` from that target.
5. Browser flattens the tree into controls.
6. Browser opens a WebSocket to that target.
7. Browser subscribes to readable paths.
8. Browser stores all this state keyed by target id.

That works.

But it means the browser is doing too much of the platform coordination work itself.

### Current Port Model

Current export projects use a base port in the project manifest.

Operationally, that gives each product instance:

- OSC UDP input on the configured base port,
- OSCQuery HTTP/WS on the next port,
- dynamic fallback to another pair if preferred ports are unavailable.

Examples in current export manifests:

- Filter → base `9010`
- EQ → base `9020`
- FX → base `9030`
- Arp → base `9040`
- ScaleQuantizer → base `9050`
- Transpose → base `9060`
- VelocityMapper → base `9070`
- NoteFilter → base `9080`

This is workable, but the existence of multiple exposed public entry points is still part of the fragmentation problem.

### Current Strengths

The existing architecture already has a lot going for it.

#### 1. Public surfaces already exist
We are not starting from zero.

#### 2. Endpoints are registry-driven
This is the right substrate for centralization.

#### 3. Per-instance products are already well-defined
The exports already look like distinct products with distinct param surfaces and layout behavior.

#### 4. Diagnostics and introspection are already first-class
This repo already treats OSCQuery as a serious support/debug/profiling surface.

#### 5. The remote already proves the usefulness of machine-readable surfaces
The browser client is already consuming the current public contract.

### Current Problems

#### 1. Discovery is fragmented
There is no one place to see “what Manifold surfaces exist right now?”

#### 2. Client complexity is too high
The browser remote currently has to be a multi-target connection manager.

#### 3. Aggregation happens nowhere
There is no central namespace above product/instance surfaces.

#### 4. Platform concerns have no unified control plane
Marketplace, licensing, entitlement-aware discovery, user-facing product browsing, and support tooling all want a platform-readable model of products and instances.

#### 5. Instance-local serving is operationally duplicated
Even though the code is shared, the runtime still creates multiple HTTP/WS public entry points.

#### 6. Cross-product coherence is weak
There is no single surface a future hub can treat as the system-of-record for active products.

---

## Target Architecture

### Core Goal

Expose **one unified discoverable OSCQuery-visible space** that aggregates all relevant Manifold product/instance surfaces while preserving:

- per-instance identity,
- per-instance public plugin paths,
- per-instance `/ui/meta`,
- per-instance `/ui/layout`,
- per-instance diagnostics/perf/debug/introspection,
- and routing correctness for reads, writes, and subscriptions.

The first concrete consumer of that unified space is the web remote.

The same architecture then becomes the control/discovery backbone for broader hub/platform concerns.

### Design Principles

#### 1. Centralize discovery, not semantics
We are not flattening away product identity.

#### 2. Preserve existing public paths inside an instance namespace
Current `/plugin/params/...` meaning should survive.

#### 3. Keep instance identity explicit
A central tree with no stable notion of “which instance is this?” is useless.

#### 4. Keep UI metadata and layout first-class
Those are part of the product surface.

#### 5. Keep diagnostics first-class
Support/profiling/introspection matter just as much after centralization as before.

#### 6. The browser is a client, not the architecture
The heavy lifting belongs in runtime/backend infrastructure.

#### 7. Hub/platform concerns should consume the same control plane
Store, marketplace, licensing, auth, and support should reason over the same central model rather than inventing separate product-discovery pipelines.

### What Centralization Means

Centralization means:

- a single public aggregate entry point,
- a central registry of active surfaces,
- one aggregated OSCQuery tree,
- one aggregated HTTP and WebSocket surface,
- centralized routing of reads/writes/listens,
- per-instance product surfaces preserved under a collision-safe namespace,
- remote and platform consumers talking to the same control/discovery layer.

Conceptually:

```text
Instance A public surface ─┐
Instance B public surface ─┼──► Central aggregation layer ───► Web remote
Instance C public surface ─┘                               └──► Hub/platform consumers
```

### What Centralization Does Not Mean

Centralization does **not** mean:

- flattening all products into one giant anonymous param bucket,
- discarding `/ui/meta` or `/ui/layout`,
- discarding diagnostics,
- forcing the browser to implement protocol serving behavior,
- or inventing a fake plugin-launching responsibility for the central layer.

That last point matters because the architecture here is about **discovery, aggregation, routing, and platform visibility**.

It is not about pretending the central layer somehow owns the existence of plugin instances.

### Central Aggregation Layer

The central aggregation layer is the main new architectural piece.

Responsibilities:

- register active product/instance surfaces,
- maintain stable descriptors for those surfaces,
- build one aggregated OSCQuery tree,
- expose one aggregate HTTP root and WebSocket endpoint,
- route reads and writes to the correct backing instance,
- bridge live subscriptions and value updates,
- expose per-instance metadata and layout,
- expose a system-level view that other platform features can consume.

It should be designed so the same surface model can back:

- the current local per-instance server,
- the future aggregated server,
- tooling and tests,
- and hub/product logic.

### Instance Identity

Every registered surface needs a stable identity.

At minimum:

```ts
interface InstanceIdentity {
  instanceId: string;
  productId: string;
  displayName: string;
  transportKind: "local" | "ipc" | "proxy" | "direct";
}
```

Likely additional fields:

```ts
interface InstanceIdentity {
  instanceId: string;
  productId: string;
  productName: string;
  displayName: string;
  version?: string;
  capabilities?: string[];
  hostContext?: string;
  sessionId?: string;
  transportKind: "local" | "ipc" | "proxy" | "direct";
}
```

The central layer cannot be correct without stable instance identity.

### Namespace Design

This is where we avoid doing something fucking stupid.

Current products already have real public paths like:

- `/plugin/params/type`
- `/plugin/params/cutoff`
- `/plugin/params/p/0`
- `/plugin/ui/perf/...`

So the aggregated tree must add a namespace **above** those paths.

Bad idea:

```text
/plugin/params/p/0/...   # collision-prone and semantically wrong
```

Good shape:

```text
/instances/<instance-id>/plugin/params/...
/instances/<instance-id>/plugin/ui/...
/instances/<instance-id>/ui/meta
/instances/<instance-id>/ui/layout
```

If we need product grouping as well:

```text
/products/<product-id>/instances/<instance-id>/plugin/params/...
/products/<product-id>/instances/<instance-id>/plugin/ui/...
```

For now, the simplest good answer is probably:

```text
/instances/<instance-id>/...
```

That keeps routing simple and avoids collisions with existing plugin paths.

### Aggregated HTTP Surface

The central HTTP surface should preserve the expectations remote/tooling consumers already have while making aggregation explicit.

A reference shape:

```text
GET  /                                   -> aggregated OSCQuery tree
GET  /?HOST_INFO                         -> central host info
GET  /osc/instances/<id>/plugin/...      -> value read routed to instance
POST /api/command                        -> command routed by aggregated path
GET  /instances                          -> list registered instances (optional convenience endpoint)
GET  /instances/<id>/ui/meta             -> per-instance UI metadata
GET  /instances/<id>/ui/layout           -> per-instance mirrored layout
GET  /instances/<id>/host-info           -> per-instance host info (optional)
```

`GET /` should return a normal OSCQuery tree rooted at a central namespace, not some separate parallel data model.

### Aggregated WebSocket Surface

The central WebSocket endpoint should accept LISTEN / IGNORE against aggregated paths.

Example:

```json
{ "COMMAND": "LISTEN", "DATA": "/instances/filter-1/plugin/params/cutoff" }
```

The central layer then:

1. parses the aggregated path,
2. resolves which instance owns it,
3. ensures that instance is being observed,
4. routes/bridges the subscription,
5. rebroadcasts updates using the aggregated path.

This preserves a single WebSocket connection for the remote while retaining per-instance ownership internally.

### Per-Instance UI Meta and Layout

Current products already expose useful metadata and optional mirrored layouts.

The aggregated architecture must expose them without flattening them into one global blob.

Reference endpoints:

```text
GET /instances/<id>/ui/meta
GET /instances/<id>/ui/layout
```

Potential response envelope:

```json
{
  "instanceId": "filter-1",
  "productId": "standalone-filter",
  "name": "Manifold Filter",
  "version": 1,
  "capabilities": {
    "genericRemote": true,
    "layoutRemote": true,
    "customSurface": true
  },
  "plugin": {
    "params": []
  },
  "ui": {}
}
```

The main point is simple:

- per-instance metadata stays per-instance,
- layout stays per-instance,
- aggregation provides discovery and routing above it.

### Command Routing

The central layer must route writes and triggers to the correct backing instance.

There are two broad models:

#### Model A: central path parsing
The client sends aggregated paths:

```text
SET /instances/filter-1/plugin/params/cutoff 4200
```

The central layer parses:

- `instanceId = filter-1`
- local path = `/plugin/params/cutoff`

Then forwards the local command to the backing instance.

#### Model B: explicit target envelope
The client sends structured commands:

```json
{
  "instanceId": "filter-1",
  "command": "SET /plugin/params/cutoff 4200"
}
```

For compatibility with current remote behavior, Model A is likely easier because it preserves path-based command semantics.

### Value Routing and LISTEN Bridging

The central layer needs to do two related jobs:

#### Reads
For a read like:

```text
GET /osc/instances/filter-1/plugin/params/cutoff
```

it should:

1. resolve `filter-1`,
2. strip the aggregate prefix,
3. query the backing surface for `/plugin/params/cutoff`,
4. return the result under normal OSCQuery `VALUE` semantics.

#### LISTEN / live updates
For a subscription like:

```text
LISTEN /instances/filter-1/plugin/params/cutoff
```

it should:

1. map that to the backing surface,
2. ensure the backing surface is observed,
3. on update, rewrite the path back into aggregate form,
4. send the update through the central WebSocket.

That makes the central layer a routing and path-rewrite bridge, not a dumb static snapshot.

### Diagnostics and Introspection

Current products already expose diagnostics/perf counters and other support surfaces.

That must remain true after centralization.

Examples include paths under:

- `/plugin/ui/perf/...`
- diagnostics endpoints
- state/reporting endpoints

These should simply appear in the aggregate tree under the instance namespace:

```text
/instances/filter-1/plugin/ui/perf/...
```

The central layer should not treat diagnostics as second-class.

The whole point of this architecture is to preserve strong machine-readable introspection while making it coherent across products.

### Relationship to the Web Remote

The web remote is the first concrete consumer.

Today it connects to many targets.

After centralization it should:

- connect once,
- fetch one aggregated tree,
- discover products/instances through that tree or through a convenience instance index,
- fetch per-instance metadata/layout through the central layer,
- switch active instance inside one connection,
- store custom surfaces keyed by instance identity rather than host/port.

This is a major simplification of client complexity.

### Relationship to Broader Hub Concerns

The broader hub/platform work is relevant here because it wants the same central control/discovery plane.

Examples:

- store and marketplace can reason about products,
- licensing and auth can affect what products/surfaces are visible or controllable,
- support tooling can discover all active products/instances,
- product browsing can bind to one coherent central model,
- remote control can share identity and entitlement logic with the broader platform.

The key point is:

> the central OSCQuery aggregation layer becomes infrastructure for the platform, not just a trick to simplify the web remote.

---

## Reference Data Model

### Instance Descriptor

A registered instance descriptor should carry enough data to build trees and route operations.

```ts
interface InstanceDescriptor {
  identity: InstanceIdentity;
  rootPath: string; // e.g. /instances/filter-1
  localTreeProvider: () => Promise<OSCQueryNodeLike> | OSCQueryNodeLike;
  localValueReader: (path: string) => Promise<any> | any;
  localCommandWriter: (command: string) => Promise<any> | any;
  localMetaProvider: () => Promise<any> | any;
  localLayoutProvider: () => Promise<any> | any;
  listenBridge?: ListenBridge;
  hostInfoProvider?: () => Promise<any> | any;
}
```

### Aggregated Surface Descriptor

The central layer should keep an aggregate-facing descriptor as well.

```ts
interface AggregatedSurfaceDescriptor {
  instanceId: string;
  productId: string;
  aggregatePrefix: string;   // /instances/filter-1
  localRootPath: string;     // /
  capabilities: string[];
}
```

### Routing Table

A routing table needs to answer:

- which instance owns this aggregated path?
- what local path corresponds to it?
- how do I read it?
- how do I write it?
- how do I subscribe to it?

Reference shape:

```ts
interface RouteResolution {
  instanceId: string;
  aggregatePath: string;
  localPath: string;
  descriptor: InstanceDescriptor;
}
```

### UI Meta Envelope

The aggregated layer may want to add a small wrapper around current `ui/meta` responses.

```json
{
  "instanceId": "filter-1",
  "productId": "standalone-filter",
  "displayName": "Manifold Filter",
  "meta": {
    "name": "Manifold Filter",
    "version": 1,
    "description": "Single-module Manifold filter export target"
  }
}
```

That envelope is optional, but the central layer needs some explicit per-instance identity attached somewhere.

---

## Implementation Plan

### Phase 0: Invariants and Constraints

Before moving code, lock in the invariants.

#### Invariants

1. Existing public plugin paths stay meaningful inside an instance namespace.
2. `/ui/meta` and `/ui/layout` remain available per instance.
3. Diagnostics/perf endpoints remain visible.
4. The browser becomes simpler, not more coupled.
5. Current direct per-instance tooling should not be broken casually during migration.

#### Constraints

- The browser is not the place to implement protocol aggregation.
- The central layer must be able to work with current per-instance surfaces during migration.
- We must not create namespace collisions with real plugin paths.
- We must not regress observability while centralizing it.

### Phase 1: Extract Surface Model from Local Serving

**Goal:** separate “what a surface is” from “how one local HTTP server exposes it.”

Current `OSCQueryServer` and `BehaviorCoreProcessor` combine several concerns:

- endpoint enumeration,
- tree construction,
- value lookup,
- command routing,
- metadata/layout serving,
- WebSocket broadcast state,
- transport serving.

That needs to be split into reusable layers.

#### Phase 1.1: define an instance surface abstraction
Introduce a local abstraction, for example:

```cpp
struct InstanceSurface {
    juce::String instanceId;
    juce::String productId;
    std::function<juce::String()> buildTreeJson;
    std::function<juce::String(const juce::String&)> queryValue;
    std::function<juce::String(const juce::String&)> runCommand;
    std::function<juce::String()> buildUiMeta;
    std::function<juce::String()> buildUiLayout;
};
```

That exact shape is not sacred; the point is to extract a reusable surface description.

#### Phase 1.2: separate local serving from surface generation
`OSCQueryServer` should not need to own all surface semantics directly.

Instead:

- a surface provider builds/answers data,
- the local server serves that surface,
- the future aggregate server can serve many such surfaces.

#### Phase 1.3: make current local server consume the abstraction
The current local per-instance server should be reworked to read from the same surface abstraction the aggregate layer will use.

Deliverable:

- local serving still works,
- but serving logic is no longer the only place where surface semantics exist.

### Phase 2: Introduce Central Registry

**Goal:** create a central registry of active surfaces.

The central registry should support:

- `registerSurface()`
- `unregisterSurface()`
- `getSurface(instanceId)`
- `listSurfaces()`
- `resolveAggregatedPath(path)`
- `buildAggregatedTree()`

Reference sketch:

```cpp
class CentralSurfaceRegistry {
public:
    void registerSurface(const InstanceSurface& surface);
    void unregisterSurface(const juce::String& instanceId);
    std::vector<InstanceSurface> listSurfaces() const;
    std::optional<RouteResolution> resolveAggregatedPath(const juce::String& path) const;
    juce::String buildAggregatedTreeJson() const;
};
```

#### Phase 2.1: decide how instance ids are formed
Examples:

- explicit manifest identity + runtime suffix,
- stable runtime instance guid,
- host-aware identity if needed,
- human-readable display name separate from stable id.

#### Phase 2.2: decide root namespace
Adopt one root shape early and stick to it.

Recommended initial choice:

```text
/instances/<instance-id>/...
```

### Phase 3: Build Aggregated Tree and Routing Layer

**Goal:** produce one valid OSCQuery tree across all registered surfaces.

#### Phase 3.1: tree mounting
For each instance surface:

- take its local tree,
- mount it under `/instances/<instance-id>`.

If local root is:

```text
/plugin/params/cutoff
```

aggregate root becomes:

```text
/instances/filter-1/plugin/params/cutoff
```

#### Phase 3.2: path resolution
Add a resolver that can map:

```text
/instances/filter-1/plugin/params/cutoff
```

to:

```text
instanceId = filter-1
localPath   = /plugin/params/cutoff
```

#### Phase 3.3: aggregate host info
Provide one `HOST_INFO` response for the aggregate service.

Potentially also expose a convenience endpoint for per-instance host info if useful.

### Phase 4: Bridge Per-Instance Updates and Commands

**Goal:** route real reads/writes/subscriptions through the aggregate layer.

#### Reads
Aggregate HTTP read path:

```text
GET /osc/instances/filter-1/plugin/params/cutoff
```

Central layer does:

1. resolve route,
2. call surface `queryValue(localPath)`,
3. return JSON.

#### Writes
Aggregate command path:

```text
POST /api/command
body: SET /instances/filter-1/plugin/params/cutoff 5000
```

Central layer does:

1. parse command,
2. resolve route,
3. rewrite to local command,
4. call `runCommand("SET /plugin/params/cutoff 5000")`,
5. return result.

#### LISTEN
Aggregate WebSocket path:

```json
{ "COMMAND": "LISTEN", "DATA": "/instances/filter-1/plugin/params/cutoff" }
```

Central layer does:

1. resolve route,
2. create/attach a listen bridge for the backing surface,
3. on local update, republish as aggregate path.

#### Phase 4 rollout note
The safest first rollout is to **bridge/mirror existing local surfaces**, not immediately remove them.

That gives us:

- parity testing,
- direct tooling fallback,
- and a clear path to later consolidation.

### Phase 5: Expose Aggregated UI Metadata and Layout

**Goal:** make product identity and product-specific remote surfaces available through the aggregate layer.

#### Required endpoints

```text
GET /instances/<id>/ui/meta
GET /instances/<id>/ui/layout
```

#### Required behavior

- preserve current manifest-derived metadata,
- preserve current sidecar layout loading,
- attach explicit instance identity,
- expose capabilities the remote can use,
- make it easy to show a product switcher without reconnecting.

#### Optional convenience endpoint

```text
GET /instances
```

Return:

```json
[
  {
    "instanceId": "filter-1",
    "productId": "standalone-filter",
    "displayName": "Manifold Filter",
    "hasLayout": true
  }
]
```

This is not strictly required if the tree already encodes enough information, but it can simplify the first remote implementation.

### Phase 6: Refactor Web Remote to a Single Connection Model

**Goal:** stop treating every product as a separate browser network target.

#### Current state

```ts
state.targets = new Map<string, Target>();
state.activeTargetId = ...
```

#### Target state

```ts
state.server = {
  host: "127.0.0.1",
  port: 9010,
  tree: ..., 
  instances: new Map<string, InstanceView>(),
  activeInstanceId: ...
};
```

#### Remote changes

1. connect once to the aggregate layer,
2. fetch aggregate tree and instance metadata,
3. derive per-instance endpoint views from the aggregate tree,
4. fetch `/instances/<id>/ui/meta` and `/instances/<id>/ui/layout`,
5. keep custom surfaces keyed by instance id,
6. switch active instance without reconnecting.

#### Browser/backend layering

The browser remains just the app renderer.

The aggregate OSCQuery/server logic lives behind it.

The Vite proxy/backend bridge can be adapted to talk to the central service rather than many plugin-local ones.

### Phase 7: Fold the Same Control Plane into Broader Hub Work

**Goal:** let broader hub/platform work consume the exact same central product/instance model.

#### Examples

- product catalog can map known product ids to richer metadata,
- entitlement/licensing can determine which products should be surfaced or controllable,
- support tooling can list all active product surfaces,
- marketplace integration can sit alongside the same product identity model,
- user/session state can bind to the same instance/product descriptors.

The central point is:

> one control/discovery plane, many consumers.

### Phase 8: Optional Reduction of Local Public Serving

Only after the aggregate layer reaches parity should we decide whether to reduce direct per-instance public serving.

This is optional and should be treated cautiously.

Possible end states:

#### Option A: keep local surfaces + aggregate over them
Pros:

- easy direct debugging,
- protocol fallback,
- tooling continuity.

Cons:

- still multiple public entry points.

#### Option B: keep local surface semantics but reduce local public serving
Pros:

- cleaner central public architecture,
- fewer direct listeners.

Cons:

- more migration risk,
- direct tooling has to adapt.

Do not force this decision early.

---

## Detailed Work Breakdown

### C++ Runtime Work

#### 1. Surface abstraction
Files likely touched:

- `manifold/primitives/control/OSCQuery.h`
- `manifold/primitives/control/OSCQuery.cpp`
- `manifold/core/BehaviorCoreProcessor.h`
- `manifold/core/BehaviorCoreProcessor.cpp`

Tasks:

- define reusable surface provider types,
- make current local server consume them,
- expose per-instance identity and providers cleanly.

#### 2. Registration plumbing
Likely work:

- add central registry class,
- add registration hooks from relevant runtime owners,
- ensure endpoint rebuilds can notify both local and aggregate surfaces.

#### 3. Diagnostics parity
Make sure aggregate routing does not drop:

- perf counters,
- diagnostics endpoints,
- state reporting,
- custom/script-defined endpoint visibility.

### OSCQuery Refactor Work

#### 1. Split tree building from socket serving
Today those concerns are too close together.

#### 2. Split path querying from HTTP endpoint parsing
Value routing should be reusable outside one local server.

#### 3. Split LISTEN state from one socket server assumption
We need a bridge model, not just a local client list.

#### 4. Keep local server behavior working during extraction
No cowboy rewrite.

### Instance Registration Work

We need a clean place where active surfaces become known to the central registry.

Possible strategies:

#### Strategy A: in-process shared registry
Best if the aggregate layer lives in the same runtime.

#### Strategy B: local IPC registration
Useful if the aggregate layer lives in a separate process/service later.

#### Strategy C: hybrid
Start in-process now, leave shape compatible with future externalization.

Recommended tactical move:

- start with in-process / same-runtime abstraction,
- do not over-engineer transport too early.

### Web Remote Work

#### 1. Connection model
Collapse from many targets to one central target.

#### 2. Navigation model
Switch from target pills keyed by host/port to instance/product switching keyed by instance identity.

#### 3. Value cache
Keep values keyed by aggregate path or by `(instanceId, localPath)`.

#### 4. Layout/meta fetches
Fetch them per instance through central endpoints.

#### 5. Custom surfaces
Move persistence keys from `host:port` to stable instance identity.

#### 6. Backwards compatibility
Potentially keep a direct-target mode during migration for testing parity.

### Hub Integration Work

The broader platform/hub concerns should consume the same central model.

#### Product layer
Need mapping from:

- product id
- display name
- icon/brand/category metadata
- entitlement state
- store metadata if available

#### Access layer
Need policy decisions such as:

- visible vs hidden products,
- controllable vs discoverable-only,
- auth-required routes,
- entitlement-dependent UI behavior.

#### Support layer
Need easy enumeration of:

- active instances,
- versions,
- diagnostics paths,
- layout capabilities,
- debug surfacing.

---

## Testing and Validation

### Correctness Checks

#### Aggregated tree correctness
- every registered instance appears once,
- all expected plugin paths appear under the right aggregate prefix,
- no collisions between instances,
- no collisions with current public plugin paths.

#### Read correctness
- aggregate read returns same value as direct local read,
- type/range/access metadata remains intact,
- custom/script endpoints remain queryable.

#### Write correctness
- aggregate `SET` and `TRIGGER` route to the correct instance,
- direct and aggregated writes produce the same underlying behavior,
- error cases are routed and reported cleanly.

### Protocol Checks

#### HTTP checks
- `GET /` returns a valid aggregate tree,
- `GET /?HOST_INFO` returns valid aggregate host info,
- `GET /instances/<id>/ui/meta` works,
- `GET /instances/<id>/ui/layout` works,
- `POST /api/command` correctly rewrites aggregate paths.

#### WebSocket checks
- aggregated LISTEN works,
- aggregated IGNORE works,
- updates arrive with aggregate paths,
- multiple listeners do not cross streams incorrectly,
- unsubscribe cleanup is correct.

### UI/Remote Checks

#### Single connection
- remote connects once,
- instances are discovered without manual multi-port management,
- switching instance does not require reconnecting.

#### Layout and generic UI
- generic controls render from aggregate paths,
- product-specific layout can still be loaded per instance,
- custom surfaces still work and persist.

#### Persistence
- custom surfaces survive instance switching,
- persistence keys remain stable when ports change,
- state no longer depends on manual host/port identity.

### Diagnostics Checks

- perf endpoints remain visible,
- diagnostics endpoints remain readable,
- support tooling can enumerate active instances,
- no regression in exposed debug data.

### Migration Checks

If local direct serving remains during migration:

- direct local surface still works,
- aggregate surface matches it,
- discrepancies can be compared quickly,
- tooling can be pointed at either surface for parity validation.

---

## Benefits

### 1. One coherent discoverable space
The system stops being “a bunch of separate OSCQuery targets” and becomes “one platform-readable tree of active products/instances.”

### 2. Simpler remote UX
The browser stops acting like a mini connection manager and becomes a cleaner product/instance browser on one connection.

### 3. Preserved product specificity
Products keep their own metadata, layout, diagnostics, and public param semantics.

### 4. Better platform leverage
Marketplace, licensing, auth, support, and product browsing all get a real control/discovery plane instead of building ad-hoc side channels.

### 5. Stronger long-term architecture
The things that belong at the platform level stop being smeared across many instance-local public entry points.

### 6. Better supportability
Aggregated diagnostics and product enumeration make support tooling easier without sacrificing instance-level introspection.

---

## Migration Path

### Step 1
Define and extract a reusable instance surface abstraction.

### Step 2
Refactor current local server to consume that abstraction.

### Step 3
Introduce a central registry and aggregate tree builder.

### Step 4
Bridge real reads/writes/LISTEN updates through the central layer.

### Step 5
Expose per-instance metadata and layout centrally.

### Step 6
Refactor the web remote to one connection and instance switching.

### Step 7
Bind broader platform concerns to the same central model.

### Step 8
Only after parity is proven, decide whether local public serving should remain fully exposed, be partially reduced, or stay as-is for tooling convenience.

---

## Open Questions

### 1. Registration transport
Should the first central registry be:

- in-process,
- IPC-based,
- or designed as a clean abstraction that can support both later?

Recommended first answer:

- in-process abstraction first,
- transport generalization later only if needed.

### 2. Instance identity source
What is the stable source of `instanceId`?

Candidates:

- runtime-generated UUID,
- manifest identity + runtime suffix,
- host-aware instance identity,
- explicit identity injected by the owning runtime.

### 3. Convenience index endpoint or pure tree discovery?
Should the remote discover instances only via the OSCQuery tree, or should there also be a convenience endpoint like `GET /instances`?

Likely answer:

- support both,
- keep tree canonical,
- use convenience endpoint pragmatically for remote UX.

### 4. Aggregate path storage format in the browser
Should browser state be keyed by:

- full aggregate path,
- instance id + local path tuple,
- or both?

### 5. LISTEN bridge implementation details
Should the central layer:

- subscribe lazily only when central clients care,
- or mirror some data continuously?

Likely answer:

- lazy where practical,
- cache current values where useful,
- do not add dumb always-on overhead unnecessarily.

### 6. Direct tooling coexistence
How long should direct per-instance OSCQuery access remain a supported migration/testing path?

### 7. Entitlement-aware visibility
How should platform licensing/auth affect aggregate discovery?

Examples:

- hidden products absent from the aggregate index,
- visible-but-locked products shown but marked restricted,
- write access disabled while read access remains visible.

### 8. Aggregate host info contents
What should central `HOST_INFO` say about:

- supported extensions,
- per-instance count,
- backing transport details,
- product-aware capabilities?

### 9. Layout fallback behavior
If a product lacks `/ui/layout`, should aggregate consumers rely purely on generic rendering from the tree and `ui/meta`? Probably yes, but the exact client behavior should be documented.

### 10. Central layer implementation location
Should the aggregate layer initially live:

- inside the current runtime process,
- behind the Vite/backend bridge,
- or as a distinct service once the abstractions are stable?

Recommended tactical answer:

- do the refactor so this remains an implementation choice,
- do not prematurely hardwire the architecture to one deployment shape.

---

## Conclusion

Manifold already has the important ingredients:

- strong per-instance OSC/OSCQuery surfaces,
- registry-driven endpoints,
- first-class diagnostics,
- per-product UI metadata and mirrored layouts,
- and a working browser remote proving the value of machine-readable control surfaces.

The problem is not lack of capability.

The problem is that all of that capability is still fragmented at the instance boundary.

This plan solves that by introducing a **single central aggregated OSCQuery-visible space** that:

- preserves instance identity,
- preserves current product semantics,
- preserves metadata/layout/diagnostics,
- gives the web remote one coherent connection model,
- and gives the broader hub/platform work a real shared control/discovery plane.

That is the actual architectural move.

Not flattening products.
Not stuffing more complexity into the browser.
Not hallucinating responsibilities the central layer does not have.

Just one unified, discoverable, routable, product-aware OSCQuery space built on the architecture the project already has.
