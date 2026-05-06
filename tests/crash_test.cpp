// Minimal crash test v2
#include "../../manifold/primitives/scripting/DSPPluginScriptHost.h"
#include "../../manifold/primitives/scripting/PrimitiveGraph.h"
#include "../../manifold/primitives/control/OSCServer.h"
#include "../../manifold/primitives/control/OSCEndpointRegistry.h"
#include "../../manifold/primitives/control/OSCQuery.h"
#include "../../manifold/primitives/control/ControlServer.h"
#include "../../manifold/primitives/control/CommandParser.h"
#include "../../manifold/primitives/core/Settings.h"
#include "../../dsp/core/nodes/GainNode.h"
#include "../../dsp/core/nodes/PassthroughNode.h"

#include <cstdio>
#include <juce_core/juce_core.h>

class MockDspProcessor : public ScriptableProcessor {
public:
    MockDspProcessor()
        : graph_(std::make_shared<dsp_primitives::PrimitiveGraph>())
    { er_.setNumLayers(2); er_.rebuild(); }

    std::shared_ptr<dsp_primitives::PrimitiveGraph> getPrimitiveGraph() override { return graph_; }
    void requestGraphRuntimeSwap(std::unique_ptr<dsp_primitives::GraphRuntime>) override { fprintf(stderr, "swap called\n"); }
    void beginGraphMutation() override { fprintf(stderr, "beginGraphMutation\n"); }
    void endGraphMutation() override { fprintf(stderr, "endGraphMutation\n"); }
    double getSampleRate() const override { return 44100.0; }
    int getGraphBlockSize() const override { return 512; }
    int getGraphOutputChannels() const override { return 2; }

    ControlServer& getControlServer() override { return cs_; }
    OSCServer& getOSCServer() override { return osc_; }
    OSCEndpointRegistry& getEndpointRegistry() override { return er_; }
    OSCQueryServer& getOSCQueryServer() override { return oq_; }

    bool postControlCommandPayload(const ControlCommand&) override { return true; }
    bool postControlCommand(ControlCommand::Type, int, float) override { return true; }
    bool setParamByPath(const std::string&, float) override { return true; }
    float getParamByPath(const std::string&) const override { return 0.0f; }
    bool hasEndpoint(const std::string&) const override { return false; }

    int getNumLayers() const override { return 2; }
    bool getLayerSnapshot(int, ScriptableLayerSnapshot& out) const override {
        out.index = 0; out.length = 44100; out.position = 0;
        out.speed = 1.0f; out.volume = 1.0f; out.state = ScriptableLayerState::Stopped;
        return true;
    }
    int getCaptureSize() const override { return 512; }
    bool computeLayerPeaks(int, int, std::vector<float>& p) const override { p.assign(64,0.25f); return true; }
    bool computeCapturePeaks(int,int,int, std::vector<float>& p) const override { p.assign(64,0.1f); return true; }
    float getTempo() const override { return 120.0f; }
    float getTargetBPM() const override { return 120.0f; }
    float getSamplesPerBar() const override { return 44100.0*60.0/120.0*4.0; }
    double getPlayTimeSamples() const override { return 0.0; }
    float getMasterVolume() const override { return 0.75f; }
    float getInputVolume() const override { return 0.8f; }
    bool isPassthroughEnabled() const override { return false; }
    bool isRecording() const override { return false; }
    bool isOverdubEnabled() const override { return false; }
    int getActiveLayerIndex() const override { return 0; }
    bool isForwardCommitArmed() const override { return false; }
    float getForwardCommitBars() const override { return 0.0f; }
    int getRecordModeIndex() const override { return 0; }
    int getCommitCount() const override { return 0; }
    std::array<float, 32> getSpectrumData() const override { return {}; }

private:
    std::shared_ptr<dsp_primitives::PrimitiveGraph> graph_;
    OSCServer osc_;
    ControlServer cs_;
    OSCEndpointRegistry er_;
    OSCQueryServer oq_;
};

static const char* kMinimalScript = R"(
function buildPlugin(ctx)
  local gain = ctx.primitives.GainNode.new(1)
  ctx.graph.nameNode(gain, "/test/gain")
  ctx.params.register("/test/gain", { type = "f", min = 0, max = 1, default = 0.5 })
  ctx.params.bind("/test/gain", gain, "setGain")
  return { params = { "/test/gain" } }
end
)";

int main() {
    fprintf(stderr, "Step 0: init\n");
    juce::ScopedJuceInitialiser_GUI juceInit;
    fprintf(stderr, "Step 1: create mock\n");
    auto mock = std::make_unique<MockDspProcessor>();
    fprintf(stderr, "Step 2: create host\n");
    auto host = std::make_unique<DSPPluginScriptHost>();
    fprintf(stderr, "Step 3: initialise\n");
    host->initialise(mock.get());
    fprintf(stderr, "Step 4: load script\n");
    bool loaded = host->loadScriptFromString(kMinimalScript, "test");
    fprintf(stderr, "Step 5: loaded=%d isLoaded=%d error=%s\n",
        loaded, host->isLoaded(), host->getLastError().c_str());
    fprintf(stderr, "Step 6: unload\n");
    host.reset();
    fprintf(stderr, "Step 7: destroy mock\n");
    mock.reset();
    fprintf(stderr, "Step 8: DONE\n");
    return 0;
}
