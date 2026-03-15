# gRPC Integration Architecture

This document describes the full gRPC integration for Manifold, replacing/supplementing the existing Unix socket and OSC protocols.

## Overview

gRPC provides:
- **Strongly-typed API**: No more manual JSON parsing
- **Streaming**: Real-time state updates, waveform data, MIDI events
- **Code generation**: Native clients for Python, JavaScript, Rust, Go, C#
- **Bidirectional communication**: Push events without polling
- **Cross-platform**: Works on Windows (unlike Unix sockets)

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CLIENTS                                           │
├─────────────────────────────────────────────────────────────────────────────┤
│  Python        │  Web/JS      │  Mobile      │  Rust        │  Go           │
│  (test harness)│  (React UI)  │  (tablet)    │  (embedded)  │  (backend)    │
└───────┬────────┴──────┬───────┴──────┬───────┴──────┬───────┴───────┬───────┘
        │               │              │              │               │
        └───────────────┴──────────────┴──────────────┴───────────────┘
                              │ HTTP/2
                              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         gRPC SERVER (C++)                                   │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  manifold::grpc::ManifoldServiceImpl                                    ││
│  │  - Implements manifold.proto::ManifoldControl                           ││
│  │  - Manages subscriber lists for streaming                               ││
│  │  - Bridges to ScriptableProcessor API                                   ││
│  └─────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────┬───────────────────────────────────────────────┘
                              │
                    ┌─────────┴─────────┐
                    │   SPSCQueue       │  (existing lock-free queue)
                    ▼                   ▼
┌───────────────────────┐   ┌───────────────────────┐
│   Audio Thread        │   │   Lua Engine          │
│   processBlock()      │   │   (Message Thread)    │
│   - Broadcast state   │   │   - State callbacks   │
│   - MIDI events       │   │   - UI updates        │
└───────────────────────┘   └───────────────────────┘
```

## Protocol Definition

See `proto/manifold.proto` for the full service definition.

### Key Services

#### 1. Parameter Control (Unary)
```protobuf
rpc SetParameter(SetParameterRequest) returns (Ack);
rpc GetParameter(GetParameterRequest) returns (GetParameterResponse);
rpc Trigger(TriggerRequest) returns (Ack);
```

#### 2. State Streaming (Server-Side Streaming)
```protobuf
rpc SubscribeState(StateFilter) returns (stream FullState);
rpc SubscribeStateDeltas(StateFilter) returns (stream StateDelta);
```

#### 3. Bidirectional Control Stream
```protobuf
rpc ControlStream(stream ControlCommand) returns (stream ControlEvent);
```

Perfect for:
- Remote UI (send commands, receive events)
- Automation recording/playback
- Live coding environments

#### 4. Audio Visualization
```protobuf
rpc GetWaveform(WaveformRequest) returns (WaveformData);
rpc StreamWaveform(WaveformRequest) returns (stream WaveformData);
```

#### 5. MIDI
```protobuf
rpc SendMidi(MidiMessage) returns (Ack);
rpc SubscribeMidi(EventFilter) returns (stream MidiEvent);
```

## Integration Points

### 1. BehaviorCoreProcessor

Add gRPC server to processor lifecycle:

```cpp
class BehaviorCoreProcessor : public ScriptableProcessor {
    // ... existing members ...
    
    std::unique_ptr<manifold::grpc::GRPCServer> grpcServer_;
    
    void prepareToPlay(double sampleRate, int samplesPerBlock) {
        // ... existing code ...
        
        // Start gRPC server
        grpcServer_ = std::make_unique<manifold::grpc::GRPCServer>();
        grpcServer_->start(this, 50051);
    }
    
    void processBlock(juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midi) {
        // ... existing code ...
        
        // Broadcast state updates to gRPC subscribers
        if (grpcServer_ && grpcServer_->isRunning()) {
            auto delta = computeStateDelta();
            grpcServer_->getService()->broadcastStateUpdate(delta);
        }
    }
};
```

### 2. State Broadcasting

The gRPC service maintains subscriber lists. On each audio block:

1. Compute state delta (changed parameters only)
2. Serialize to protobuf
3. Push to all streaming subscribers

This is efficient because:
- Only changed parameters are sent
- Protobuf serialization is fast
- HTTP/2 multiplexes streams efficiently

### 3. Command Processing

Incoming gRPC calls are converted to existing `ControlCommand`:

```cpp
::grpc::Status ManifoldServiceImpl::SetParameter(
    const ::manifold::proto::SetParameterRequest* request,
    ::manifold::proto::Ack* response) {
    
    // Convert to existing control command
    ControlCommand cmd;
    cmd.operation = ControlOperation::Set;
    cmd.endpointId = resolvePath(request->path());
    cmd.value.floatValue = request->value().float_value();
    
    // Post to audio thread via existing SPSC queue
    processor_->postControlCommandPayload(cmd);
    
    response->set_success(true);
    return ::grpc::Status::OK;
}
```

## Build Integration

### CMake Changes

```cmake
# Find gRPC
find_package(GRPC REQUIRED)

# Generate protobuf/gRPC code
set(PROTO_FILES proto/manifold.proto)

add_custom_command(
    OUTPUT 
        ${CMAKE_CURRENT_BINARY_DIR}/manifold.pb.cc
        ${CMAKE_CURRENT_BINARY_DIR}/manifold.grpc.pb.cc
    COMMAND protobuf::protoc
    ARGS 
        --grpc_out=${CMAKE_CURRENT_BINARY_DIR}
        --cpp_out=${CMAKE_CURRENT_BINARY_DIR}
        --plugin=protoc-gen-grpc=$<TARGET_FILE:gRPC::grpc_cpp_plugin>
        -I ${CMAKE_CURRENT_SOURCE_DIR}/proto
        ${PROTO_FILES}
    DEPENDS ${PROTO_FILES}
)

# Add gRPC server library
add_library(manifold_grpc STATIC
    manifold/grpc/GRPCServer.cpp
    manifold/grpc/GRPCServer.h
    ${CMAKE_CURRENT_BINARY_DIR}/manifold.pb.cc
    ${CMAKE_CURRENT_BINARY_DIR}/manifold.grpc.pb.cc
)

target_link_libraries(manifold_grpc
    PUBLIC
        gRPC::grpc++
        protobuf::libprotobuf
        manifold_core
)

# Link to main plugin
target_link_libraries(Manifold PRIVATE manifold_grpc)
```

## Client Examples

### Python Test Harness

```python
with ManifoldClient() as client:
    # Hot-reload DSP
    client.load_dsp("""
        function buildPlugin(ctx)
            local osc = ctx.primitives.OscillatorNode.new()
            osc:setFrequency(440)
            return {}
        end
    """)
    
    # Monitor state
    def on_state(state):
        print(f"Tempo: {state.tempo}")
    client.on_state_change(on_state)
    client.start_streaming()
```

### WebSocket Bridge (for browser)

Since browsers can't speak gRPC directly:

```javascript
// Node.js bridge
const grpc = require('@grpc/grpc-js');
const WebSocket = require('ws');

// gRPC client
const client = new manifoldProto.ManifoldControl(
  'localhost:50051', 
  grpc.credentials.createInsecure()
);

// WebSocket server
const wss = new WebSocket.Server({ port: 8080 });

wss.on('connection', (ws) => {
  // Stream state to browser
  const stream = client.SubscribeState({});
  stream.on('data', (state) => {
    ws.send(JSON.stringify(state));
  });
  
  // Receive commands from browser
  ws.on('message', (cmd) => {
    client.SetParameter(JSON.parse(cmd));
  });
});
```

## Performance Considerations

### Latency
- gRPC over localhost: ~1-2ms roundtrip
- HTTP/2 header compression reduces overhead
- Binary protobuf serialization is fast

### Throughput
- Can handle 1000s of parameter updates/second
- Streaming uses flow control (backpressure)
- State deltas only send changed values

### Thread Safety
- gRPC server runs on its own threads
- Commands posted to audio thread via SPSC queue (existing)
- State broadcasts use lock-free subscriber lists

## Migration Strategy

### Phase 1: Add gRPC alongside existing
- Keep Unix socket and OSC
- Add gRPC as additional option
- gRPC used for new features (Python client, web UI)

### Phase 2: Deprecate Unix socket
- Windows already doesn't support Unix sockets
- gRPC works everywhere
- Update documentation

### Phase 3: Optional OSC replacement
- Keep OSC for DAW integration (Bitwig, Ableton)
- gRPC for everything else
- Or maintain both indefinitely

## Security

For remote access (not just localhost):

```cpp
// TLS credentials
::grpc::SslServerCredentialsOptions sslOpts;
sslOpts.pem_key_cert_pairs.push_back({key, cert});
auto credentials = ::grpc::SslServerCredentials(sslOpts);

builder.AddListeningPort("0.0.0.0:50051", credentials);
```

And in Python:
```python
channel = grpc.secure_channel(
    'remote.host:50051',
    grpc.ssl_channel_credentials()
)
```

## Debugging

### Enable gRPC tracing
```bash
export GRPC_VERBOSITY=DEBUG
export GRPC_TRACE=all
./Manifold
```

### Use reflection
```python
# List all methods
from grpc_reflection.v1alpha.proto_reflection_descriptor_database import \
    ProtoReflectionDescriptorDatabase

db = ProtoReflectionDescriptorDatabase(channel)
# Inspect service...
```

## Future Extensions

### 1. Graph Modification
```protobuf
rpc AddNode(AddNodeRequest) returns (NodeInfo);
rpc ConnectNodes(ConnectRequest) returns (Ack);
rpc DisconnectNodes(ConnectRequest) returns (Ack);
```

### 2. Audio Streaming (for recording)
```protobuf
rpc StreamOutput(StreamRequest) returns (stream AudioChunk);
rpc InjectInput(stream AudioChunk) returns (Ack);
```

### 3. Preset Management
```protobuf
rpc SavePreset(PresetRequest) returns (Ack);
rpc LoadPreset(PresetRequest) returns (Ack);
rpc ListPresets(Empty) returns (PresetList);
```

### 4. Time-Synced Commands
```protobuf
rpc ScheduleCommand(ScheduledCommand) returns (Ack);
// Execute at specific beat/sample
```

## Summary

gRPC transforms Manifold from a plugin with basic control into a **platform**:

- **Python developers** can write test harnesses
- **Web developers** can build custom UIs
- **Embedded systems** can control the plugin (Raspberry Pi, etc.)
- **DAWs** can still use OSC for tight integration
- **Mobile apps** can provide remote control

All while maintaining the existing C++/Lua architecture and lock-free audio thread safety.
