#include "ContractHarnessUtils.h"
#include "../ui/imgui/ManifoldImGuiConfig.h"

#include <juce_core/juce_core.h>

#include <thread>

namespace {

juce::var makeObject() { return juce::var(new juce::DynamicObject()); }
juce::DynamicObject* asObject(juce::var& value) { return value.getDynamicObject(); }

juce::var encodeThreadState(bool initialNull,
                            bool afterSetMainThreadNonNull,
                            bool workerInitialNull,
                            bool workerLocalSetVisible,
                            bool workerAfterClearNull,
                            bool mainStillNonNull) {
    auto obj = makeObject();
    asObject(obj)->setProperty("initialNull", initialNull);
    asObject(obj)->setProperty("afterSetMainThreadNonNull", afterSetMainThreadNonNull);
    asObject(obj)->setProperty("workerInitialNull", workerInitialNull);
    asObject(obj)->setProperty("workerLocalSetVisible", workerLocalSetVisible);
    asObject(obj)->setProperty("workerAfterClearNull", workerAfterClearNull);
    asObject(obj)->setProperty("mainStillNonNull", mainStillNonNull);
    return obj;
}

} // namespace

int main(int argc, char* argv[]) {
    contract_harness_utils::HarnessOptions options;
    if (!contract_harness_utils::parseOptions(argc, argv, options)) {
        return 1;
    }

    const bool initialNull = (ManifoldGImGui == nullptr);
    auto* mainSentinel = reinterpret_cast<ImGuiContext*>(static_cast<uintptr_t>(0x1));
    ManifoldGImGui = mainSentinel;
    const bool afterSetMainThreadNonNull = (ManifoldGImGui == mainSentinel);

    bool workerInitialNull = false;
    bool workerLocalSetVisible = false;
    bool workerAfterClearNull = false;
    std::thread worker([&]() {
        workerInitialNull = (ManifoldGImGui == nullptr);
        auto* workerSentinel = reinterpret_cast<ImGuiContext*>(static_cast<uintptr_t>(0x2));
        ManifoldGImGui = workerSentinel;
        workerLocalSetVisible = (ManifoldGImGui == workerSentinel);
        ManifoldGImGui = nullptr;
        workerAfterClearNull = (ManifoldGImGui == nullptr);
    });
    worker.join();

    const bool mainStillNonNull = (ManifoldGImGui == mainSentinel);
    ManifoldGImGui = nullptr;

    auto contract = encodeThreadState(initialNull,
                                      afterSetMainThreadNonNull,
                                      workerInitialNull,
                                      workerLocalSetVisible,
                                      workerAfterClearNull,
                                      mainStillNonNull);

    const auto raw = juce::JSON::toString(contract, true).toStdString();
    return contract_harness_utils::finishJsonContract(options, "ManifoldImGuiGlobals contract", raw);
}
