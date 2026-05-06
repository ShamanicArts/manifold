#include "../primitives/ui/RuntimeNode.h"
#include "../primitives/video/VideoCaptureManager.h"
#include "../primitives/video/VideoSurfaceProvider.h"
#include "../ui/imgui/ImGuiDirectHost.h"

#include "ContractHarnessUtils.h"

#include <juce_core/juce_core.h>
#include <juce_opengl/juce_opengl.h>

#include <algorithm>
#include <cstdint>
#include <cstdlib>
#include <string>
#include <vector>

namespace {

using namespace contract_harness_utils;
using namespace manifold::video;

// Deterministic mock frame supplier — returns fixed RGBA data without touching any singleton.
manifold::video::FrameData makeMockFrame(uint64_t sequence) {
    // 2x2 RGBA image: red, green, blue, white
    static const std::vector<std::uint8_t> pixels = {
        255, 0,   0,   255,  // red
        0,   255, 0,   255,  // green
        0,   0,   255, 255,  // blue
        255, 255, 255, 255,  // white
    };
    manifold::video::FrameData frame;
    frame.width = 2;
    frame.height = 2;
    frame.sequence = sequence;
    frame.rgba = pixels;
    return frame;
}

juce::var makeVideoInputPayload(const std::string& source) {
    auto* obj = new juce::DynamicObject();
    obj->setProperty("source", juce::String(source));
    obj->setProperty("position", 0.0);
    return juce::var(obj);
}

juce::var buildContract() {
    // --- EGL context setup via ImGuiDirectHost ---
    auto host = std::make_unique<ImGuiDirectHost>();
    host->setBounds(0, 0, 64, 64);
    host->setVisible(true);

    const bool eglReady = host->ensureEglOffscreenContext(64, 64);
    if (!eglReady) {
        juce::Logger::outputDebugString("SKIP: EGL context could not be created");
        auto* err = new juce::DynamicObject();
        err->setProperty("error", "EGL context not available");
        err->setProperty("eglReady", false);
        return juce::var(err);
    }

    // Make the EGL context current before doing any GL operations
    const bool eglCurrent = host->makeEglContextCurrent();

    // --- Create VideoSurfaceProvider with mock FrameSupplier ---
    uint64_t mockSequence = 0;
    auto frameSupplier = [&mockSequence]() {
        return makeMockFrame(++mockSequence);
    };

    VideoSurfaceProvider provider{std::move(frameSupplier)};

    // --- Create RuntimeNode for video_input ---
    RuntimeNode node("video_test");
    node.setNodeId("video_node");
    node.setBounds(0, 0, 64, 64);
    RuntimeNode::StyleState style;
    style.background = 0x00000000u;
    style.border = 0x00000000u;
    style.borderWidth = 0.0f;
    node.setStyle(style);
    node.setCustomSurfaceType("video_input");
    node.setCustomRenderPayload(makeVideoInputPayload("live"));

    // --- Test handlesType ---
    const bool handlesVideoInput = provider.handlesType("video_input");
    const bool handlesOther = provider.handlesType("generated_source");

    // --- Test prepareTexture ---
    const uint64_t stableId = node.getStableId();
    auto textureHandle = provider.prepareTexture(node, 64, 64, 1.0);
    const bool textureValid = (textureHandle != 0);

    // --- Test getSurfaceInfo ---
    int infoW = 0, infoH = 0;
    uint64_t infoSeq = 0;
    bool infoOk = provider.getSurfaceInfo(stableId, infoW, infoH, infoSeq);
    const bool infoMatches = infoOk && infoW == 2 && infoH == 2 && infoSeq == 1;

    // --- Test getSurfaceInfo for unknown stableId ---
    int unknownW = 0, unknownH = 0;
    uint64_t unknownSeq = 0;
    bool unknownInfoOk = provider.getSurfaceInfo(999999, unknownW, unknownH, unknownSeq);

    // --- Test estimateStateBytes ---
    const int64_t stateBytes = provider.estimateStateBytes();
    const bool stateBytesReasonable = stateBytes > 0;

    // --- Test getOwnedGpuBytes ---
    int64_t colorBytes = 0, depthBytes = 0;
    provider.getOwnedGpuBytes(colorBytes, depthBytes);
    // 2x2 RGBA = 16 bytes, plus overhead
    const bool colorBytesReasonable = colorBytes >= 16;
    const bool depthBytesZero = depthBytes == 0;

    // --- Test that the mock frame supplier was actually called ---
    const bool supplierWasCalled = (mockSequence > 0);

    // --- Collect contract ---
    auto* contract = new juce::DynamicObject();
    contract->setProperty("contractVersion", 1);
    contract->setProperty("eglReady", eglReady);
    contract->setProperty("handlesVideoInput", handlesVideoInput);
    contract->setProperty("handlesOther", handlesOther);
    contract->setProperty("textureValid", textureValid);
    contract->setProperty("textureHandle", static_cast<juce::int64>(textureHandle));
    contract->setProperty("surfaceInfoOk", infoOk);
    contract->setProperty("surfaceInfoWidth", infoW);
    contract->setProperty("surfaceInfoHeight", infoH);
    contract->setProperty("surfaceInfoSequence", static_cast<juce::int64>(infoSeq));
    contract->setProperty("infoMatches", infoMatches);
    contract->setProperty("unknownStableIdReturnsFalse", !unknownInfoOk);
    contract->setProperty("stateBytesReasonable", stateBytesReasonable);
    contract->setProperty("colorBytesReasonable", colorBytesReasonable);
    contract->setProperty("depthBytesZero", depthBytesZero);
    contract->setProperty("supplierWasCalled", supplierWasCalled);
    contract->setProperty("mockFrameSequence", static_cast<juce::int64>(mockSequence));

    return juce::var(contract);
}

} // namespace

int main(int argc, char* argv[]) {
    HarnessOptions options;
    if (!parseOptions(argc, argv, options)) {
        return 1;
    }

    // JUCE's GUI-optional init is needed for OpenGL on some platforms
    juce::ScopedJuceInitialiser_GUI libraryInit;

    const auto contract = juce::JSON::toString(buildContract(), true).toStdString();

    return finishJsonContract(options, "VideoSurfaceProvider contract", contract);
}
