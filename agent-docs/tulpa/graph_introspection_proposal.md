# Graph Introspection Extension for OSCQuery

## Goal
Extend OSCQuery to expose DSP graph topology for agent debugging, composition, and optimization.

## Proposed Endpoints

### 1. List All Nodes
```http
GET /graph/nodes
```

Response:
```json
{
  "FULL_PATH": "/graph/nodes",
  "CONTENTS": {
    "node_count": 12,
    "nodes": [
      {
        "id": "input",
        "type": "AudioInputNode",
        "category": "io",
        "inputs": [],
        "outputs": ["capture"],
        "enabled": true,
        "params": {
          "gain": {"value": 1.0, "min": 0.0, "max": 2.0}
        }
      },
      {
        "id": "capture",
        "type": "RetrospectiveCaptureNode", 
        "category": "capture",
        "inputs": ["input"],
        "outputs": ["layer1", "layer2"],
        "enabled": true,
        "params": {
          "buffer_seconds": 32.0,
          "write_position": 1459200
        }
      },
      {
        "id": "layer1",
        "type": "LoopPlaybackNode",
        "category": "playback",
        "inputs": ["capture"],
        "outputs": ["mixer"],
        "enabled": true,
        "params": {
          "speed": 1.0,
          "reverse": false,
          "volume": 0.85,
          "position": 0.42,
          "bars": 4.0
        }
      }
    ]
  }
}
```

### 2. Get Node Details
```http
GET /graph/nodes/{node_id}
```

Response:
```json
{
  "FULL_PATH": "/graph/nodes/layer1",
  "TYPE": "container",
  "CONTENTS": {
    "id": "layer1",
    "type": "LoopPlaybackNode",
    "description": "Layer 1 playback with speed/pitch control",
    "inputs": [
      {
        "id": "audio",
        "connected_to": "capture",
        "type": "audio",
        "channels": 2
      }
    ],
    "outputs": [
      {
        "id": "audio",
        "connected_to": ["mixer", "fx_chain"],
        "type": "audio",
        "channels": 2
      }
    ],
    "params": {
      "speed": {
        "FULL_PATH": "/graph/nodes/layer1/speed",
        "TYPE": "f",
        "VALUE": 1.0,
        "RANGE": [{"MIN": -4.0, "MAX": 4.0}],
        "DESCRIPTION": "Playback speed multiplier"
      },
      "reverse": {
        "FULL_PATH": "/graph/nodes/layer1/reverse",
        "TYPE": "i",
        "VALUE": 0,
        "ACCESS": 3,
        "DESCRIPTION": "Reverse playback direction"
      }
    }
  }
}
```

### 3. Connection Graph
```http
GET /graph/connections
```

Response:
```json
{
  "FULL_PATH": "/graph/connections",
  "CONTENTS": {
    "connection_count": 8,
    "connections": [
      {
        "from": "input",
        "from_output": 0,
        "to": "capture",
        "to_input": 0,
        "type": "audio"
      },
      {
        "from": "capture",
        "from_output": 0,
        "to": "layer1",
        "to_input": 0,
        "type": "audio"
      },
      {
        "from": "layer1",
        "from_output": 0,
        "to": "mixer",
        "to_input": 0,
        "type": "audio"
      },
      {
        "from": "mixer",
        "from_output": 0,
        "to": "output",
        "to_input": 0,
        "type": "audio"
      }
    ]
  }
}
```

### 4. Signal Flow Trace
```http
GET /graph/trace?from=layer1
```

Response:
```json
{
  "FULL_PATH": "/graph/trace",
  "CONTENTS": {
    "source": "layer1",
    "upstream": [
      ["capture", "input"]
    ],
    "downstream": [
      ["mixer", "output"]
    ],
    "full_chain": [
      "input",
      "capture", 
      "layer1",
      "mixer",
      "output"
    ]
  }
}
```

### 5. Performance Metrics
```http
GET /graph/metrics
```

Response:
```json
{
  "FULL_PATH": "/graph/metrics",
  "CONTENTS": {
    "sample_rate": 44100,
    "block_size": 512,
    "total_cpu_percent": 12.5,
    "nodes": [
      {
        "id": "input",
        "cpu_percent": 0.1,
        "avg_latency_us": 5
      },
      {
        "id": "capture",
        "cpu_percent": 2.3,
        "avg_latency_us": 12
      },
      {
        "id": "layer1",
        "cpu_percent": 4.5,
        "avg_latency_us": 25,
        "resample_quality": "high"
      },
      {
        "id": "mixer",
        "cpu_percent": 1.2,
        "avg_latency_us": 8
      }
    ],
    "dropouts": 0,
    "buffer_underruns": 0
  }
}
```

## Implementation Sketch

### Add to OSCQueryServer

```cpp
// OSCQueryServer.h additions
class OSCQueryServer {
    // ... existing methods ...
    
private:
    // Graph introspection handlers
    juce::String handleGraphNodesRequest();
    juce::String handleGraphNodeDetail(const juce::String& nodeId);
    juce::String handleGraphConnectionsRequest();
    juce::String handleGraphTraceRequest(const juce::String& fromNode);
    juce::String handleGraphMetricsRequest();
};
```

### GraphRuntime Integration

```cpp
// GraphRuntime needs to expose:
class GraphRuntime {
public:
    struct NodeInfo {
        std::string id;
        std::string type;
        std::vector<std::string> inputs;
        std::vector<std::string> outputs;
        std::map<std::string, float> params;
        float cpuPercent = 0.0f;
    };
    
    std::vector<NodeInfo> getNodeInfos() const;
    std::vector<std::pair<std::string, std::string>> getConnections() const;
    std::vector<std::string> traceUpstream(const std::string& nodeId) const;
    std::vector<std::string> traceDownstream(const std::string& nodeId) const;
    PerformanceMetrics getMetrics() const;
};
```

### Lua Registration

Lua UI scripts can register custom nodes:

```lua
-- In DSP script
function buildPlugin(ctx)
  return {
    nodes = {
      { 
        type = "custom_delay", 
        id = "my_delay",
        introspection = {
          description = "Custom feedback delay",
          expose_params = {"delay_time", "feedback"}
        }
      }
    }
  }
end
```

## Agent Use Cases

### Debugging: "Why is layer 3 silent?"
```bash
curl http://localhost:9001/graph/trace?from=layer3
# Shows: layer3 → mixer (muted) → output
# Aha! mixer is muting this channel
```

### Composition: "Add reverb to layer 2"
```bash
# Agent analyzes current graph
# Finds insertion point between layer2 and mixer
# Suggests: create ReverbNode, connect layer2→reverb→mixer
```

### Optimization: "High CPU usage"
```bash
curl http://localhost:9001/graph/metrics
# Shows: layer1 using 45% CPU
# Agent suggests: reduce resample quality or freeze layer
```

## Security Considerations

- Read-only by default (metrics, topology)
- Write endpoints (create/delete nodes) require authentication
- Rate limiting on metrics endpoints
- Don't expose internal memory addresses or raw pointers

## Future Extensions

1. **WebSocket streaming** for live graph updates
2. **Diff endpoint** for graph changes
3. **Template application** for common patterns
4. **Undo/redo** via graph snapshots
5. **Layer analysis** (RMS, pitch, spectral data)
