#include <juce_audio_processors_headless/juce_audio_processors_headless.h>
#include <juce_events/juce_events.h>

#include <iostream>

namespace {

int fail(const std::string& message) {
    std::cerr << message << '\n';
    return 1;
}

} // namespace

int main(int argc, char** argv) {
    if (argc != 2) {
        return fail("usage: ManifoldVST3Probe <path-to-plugin.vst3>");
    }

    juce::ScopedJuceInitialiser_GUI juceInit;

    const juce::File pluginFile(juce::String::fromUTF8(argv[1]));
    if (!pluginFile.exists()) {
        return fail("plugin path does not exist: " + pluginFile.getFullPathName().toStdString());
    }

    juce::AudioPluginFormatManager formatManager;
    formatManager.addFormat(std::make_unique<juce::VST3PluginFormatHeadless>());

    auto* format = formatManager.getFormat(0);
    if (format == nullptr) {
        return fail("failed to create VST3 format manager");
    }

    juce::OwnedArray<juce::PluginDescription> descriptions;
    format->findAllTypesForFile(descriptions, pluginFile.getFullPathName());

    if (descriptions.isEmpty()) {
        return fail("no plugin descriptions found in: " + pluginFile.getFullPathName().toStdString());
    }

    std::cout << "found " << descriptions.size() << " description(s)" << std::endl;
    for (int i = 0; i < descriptions.size(); ++i) {
        const auto& desc = *descriptions.getUnchecked(i);
        std::cout << "[" << i << "] " << desc.name << " id=" << desc.createIdentifierString() << std::endl;
    }

    juce::String errorMessage;
    auto instance = formatManager.createPluginInstance(*descriptions.getUnchecked(0),
                                                       48000.0,
                                                       1024,
                                                       errorMessage);
    if (instance == nullptr) {
        return fail("createPluginInstance failed: " + errorMessage.toStdString());
    }

    std::cout << "loaded instance: " << instance->getName() << std::endl;
    std::cout << "inputs=" << instance->getTotalNumInputChannels()
              << " outputs=" << instance->getTotalNumOutputChannels()
              << " params=" << instance->getParameters().size() << std::endl;

    instance->prepareToPlay(48000.0, 1024);
    std::cout << "prepareToPlay completed" << std::endl;
    instance->releaseResources();
    std::cout << "releaseResources completed" << std::endl;
    return 0;
}
