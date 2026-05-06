# ONNX Runtime Integration for ML Pipelines

## Why not TFLite

TFLite works for MediaPipe's legacy models, but the newer MediaPipe models
(including the current selfie segmenter) use custom ops (`Convolution2DTransposeBias`)
that aren't in `BuiltinOpResolver`. ONNX Runtime supports everything out of the box —
any model from any framework, no custom op registration.

## Build Strategy: Prebuilt Shared Library

ONNX Runtime distributes prebuilt `.tgz` packages via GitHub releases, including a
shared library (`libonnxruntime.so`), C/C++ headers, and CMake config.

**Not building from source.** The source build is massive (protobuf, flatbuffers, etc.)
and we don't need that pain. Same URL-download pattern as our other externals.

## C++ API Surface

```cpp
#include <onnxruntime/core/session/onnxruntime_cxx_api.h>

// 1) Environment + session
Ort::Env env(ORT_LOGGING_LEVEL_WARNING, "ManifoldML");
Ort::SessionOptions opts;
opts.SetIntraOpNumThreads(4);

Ort::Session session(env, "model.onnx", opts);

// 2) Query input/output info
auto input_dims = session.GetInputTypeInfo(0)
    .GetTensorTypeAndShapeInfo().GetShape();
// input_dims = {1, 256, 256, 3} for selfie segmentation

// 3) Create input tensor
auto memory_info = Ort::MemoryInfo::CreateCpu(
    OrtArenaAllocator, OrtMemTypeDefault);
std::vector<float> input_data(/* resized normalized pixels */);
Ort::Value input_tensor = Ort::Value::CreateTensor<float>(
    memory_info, input_data.data(), input_data.size(),
    input_dims.data(), input_dims.size());

// 4) Run inference
const char* input_names[] = {"input"};
const char* output_names[] = {"output"};
auto output_tensors = session.Run(Ort::RunOptions{},
    input_names, &input_tensor, 1,
    output_names, 1);

// 5) Get output
float* output = output_tensors[0].GetTensorMutableData<float>();
```

## CMake Integration

ONNX Runtime team publishes CMake-friendly packages. On Linux:

```cmake
# After downloading and extracting onnxruntime-linux-x64-*.tgz:
find_path(ONNXRUNTIME_INCLUDE_DIR onnxruntime_cxx_api.h
    PATH_SUFFIXES include)
find_library(ONNXRUNTIME_LIB onnxruntime
    PATH_SUFFIXES lib)

add_library(ONNXRuntime SHARED IMPORTED)
set_target_properties(ONNXRuntime PROPERTIES
    IMPORTED_LOCATION "${ONNXRUNTIME_LIB}"
    INTERFACE_INCLUDE_DIRECTORIES "${ONNXRUNTIME_INCLUDE_DIR}")
```

Or via FetchContent with URL (no source build):

```cmake
FetchContent_Declare(onnxruntime
    URL https://github.com/microsoft/onnxruntime/releases/download/v1.20.1/onnxruntime-linux-x64-1.20.1.tgz
    SOURCE_SUBDIR "")
FetchContent_MakeAvailable(onnxruntime)
```

## Available Models (ONNX)

The MediaPipe selfie segmenter is available as ONNX through various sources.
Also supports: SAM, YOLO, CLIP, Whisper, Depth Anything, etc.

## Wrapper

Same `MLPipeline` interface, just swap the TFLite guts for ONNX Runtime.
Lua API stays identical: `ml.load()`, `ml.infer()`, `ml.inferFrame()`.
