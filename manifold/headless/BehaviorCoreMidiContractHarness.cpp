#include "../../manifold/core/BehaviorCoreProcessor.h"

#include <algorithm>
#include <cstdio>
#include <cstdlib>
#include <fstream>
#include <iterator>
#include <string>

#include <juce_core/juce_core.h>

namespace {

struct HarnessOptions {
    enum Mode { Print, Write, Verify } mode = Print;
    std::string contractPath;
};

void printUsage(const char* name) {
    std::fprintf(stderr,
                 "Usage: %s [--print-contract | --write-contract PATH | --verify-contract PATH]\n",
                 name);
}

bool parseOptions(int argc, char* argv[], HarnessOptions& out) {
    for (int i = 1; i < argc; ++i) {
        const std::string arg = argv[i];
        if (arg == "--print-contract") {
            out.mode = HarnessOptions::Print;
        } else if (arg == "--write-contract" && i + 1 < argc) {
            out.mode = HarnessOptions::Write;
            out.contractPath = argv[++i];
        } else if (arg == "--verify-contract" && i + 1 < argc) {
            out.mode = HarnessOptions::Verify;
            out.contractPath = argv[++i];
        } else if (arg == "--help" || arg == "-h") {
            printUsage(argv[0]);
            return false;
        } else {
            std::fprintf(stderr, "Unknown argument: %s\n", argv[i]);
            printUsage(argv[0]);
            return false;
        }
    }
    return true;
}

std::string readFile(const std::string& path) {
    std::ifstream file(path);
    if (!file.is_open()) {
        std::fprintf(stderr, "ERROR: cannot read file: %s\n", path.c_str());
        std::exit(2);
    }
    return std::string((std::istreambuf_iterator<char>(file)),
                       std::istreambuf_iterator<char>());
}

bool verifyContract(const std::string& rawCurrent, const std::string& goldenPath) {
    const auto rawGolden = readFile(goldenPath);
    const auto goldenVar = juce::JSON::parse(rawGolden);
    const auto currentVar = juce::JSON::parse(rawCurrent);

    if (goldenVar.isVoid() || currentVar.isVoid()) {
        std::fprintf(stderr, "FAIL: could not parse contract JSON\n");
        return false;
    }

    const auto goldenStr = juce::JSON::toString(goldenVar).toStdString();
    const auto currentStr = juce::JSON::toString(currentVar).toStdString();
    if (goldenStr == currentStr) {
        std::fprintf(stdout, "OK: MIDI contract matches golden file\n");
        return true;
    }

    const size_t minLen = std::min(goldenStr.size(), currentStr.size());
    size_t diffPos = 0;
    while (diffPos < minLen && goldenStr[diffPos] == currentStr[diffPos]) {
        ++diffPos;
    }

    std::fprintf(stderr, "FAIL: MIDI contract mismatch\n");
    std::fprintf(stderr, "  golden: %zu bytes, current: %zu bytes\n",
                 goldenStr.size(), currentStr.size());
    std::fprintf(stderr, "  first diff at byte %zu\n", diffPos);
    return false;
}

juce::var extractMidiSubcontract(const BehaviorCoreProcessor& processor) {
    const auto fullContract = juce::JSON::parse(processor.exportStateContract());
    if (auto* root = fullContract.getDynamicObject()) {
        return root->getProperty("midi");
    }
    return {};
}

juce::var serialiseMidiBuffer(const juce::MidiBuffer& buffer) {
    juce::Array<juce::var> events;
    for (const auto metadata : buffer) {
        const auto& msg = metadata.getMessage();
        auto* eventObj = new juce::DynamicObject();
        eventObj->setProperty("samplePosition", metadata.samplePosition);
        eventObj->setProperty("status", static_cast<int>(msg.getRawDataSize() > 0 ? msg.getRawData()[0] : 0));
        eventObj->setProperty("data1", static_cast<int>(msg.getRawDataSize() > 1 ? msg.getRawData()[1] : 0));
        eventObj->setProperty("data2", static_cast<int>(msg.getRawDataSize() > 2 ? msg.getRawData()[2] : 0));
        events.add(juce::var(eventObj));
    }
    return juce::var(events);
}

juce::var drainInputRing(midi::MidiManager& manager) {
    juce::Array<juce::var> events;
    auto& ring = manager.getInputRing();
    uint8_t status = 0;
    uint8_t data1 = 0;
    uint8_t data2 = 0;
    int32_t timestamp = 0;
    while (ring.read(status, data1, data2, timestamp)) {
        auto* eventObj = new juce::DynamicObject();
        eventObj->setProperty("status", static_cast<int>(status));
        eventObj->setProperty("data1", static_cast<int>(data1));
        eventObj->setProperty("data2", static_cast<int>(data2));
        eventObj->setProperty("timestamp", timestamp);
        events.add(juce::var(eventObj));
    }
    return juce::var(events);
}

juce::var makeManagerSnapshot(midi::MidiManager& manager) {
    auto* root = new juce::DynamicObject();
    root->setProperty("inputOpen", manager.isInputOpen());
    root->setProperty("outputOpen", manager.isOutputOpen());
    root->setProperty("currentInputDevice", manager.getCurrentInputDevice());
    root->setProperty("currentOutputDevice", manager.getCurrentOutputDevice());
    root->setProperty("omniMode", manager.isOmniMode());
    root->setProperty("numActiveVoices", manager.getNumActiveVoices());

    const auto& channel0 = manager.getChannelState(0);
    auto* channelObj = new juce::DynamicObject();
    channelObj->setProperty("numActiveNotes", channel0.numActiveNotes);
    channelObj->setProperty("program", static_cast<int>(channel0.program));
    channelObj->setProperty("pressure", static_cast<int>(channel0.pressure));
    channelObj->setProperty("pitchBend", channel0.pitchBend);
    channelObj->setProperty("sustainPedal", channel0.sustainPedal);
    channelObj->setProperty("sostenutoPedal", channel0.sostenutoPedal);
    channelObj->setProperty("softPedal", channel0.softPedal);
    channelObj->setProperty("note60Held", channel0.notesHeld[60]);
    channelObj->setProperty("cc74", static_cast<int>(channel0.ccValues[74]));
    channelObj->setProperty("cc64", static_cast<int>(channel0.ccValues[64]));
    root->setProperty("channel1", juce::var(channelObj));

    const auto* voices = manager.getVoiceStates();
    auto* voice0Obj = new juce::DynamicObject();
    voice0Obj->setProperty("note", static_cast<int>(voices[0].note));
    voice0Obj->setProperty("velocity", static_cast<int>(voices[0].velocity));
    voice0Obj->setProperty("channel", static_cast<int>(voices[0].channel));
    voice0Obj->setProperty("active", voices[0].active);
    voice0Obj->setProperty("sustained", voices[0].sustained);
    voice0Obj->setProperty("startTime", voices[0].startTime);
    voice0Obj->setProperty("releaseTime", voices[0].releaseTime);
    voice0Obj->setProperty("currentPitchBend", voices[0].currentPitchBend);
    root->setProperty("voice0", juce::var(voice0Obj));

    juce::Array<juce::var> activeVoices;
    for (int i = 0; i < midi::MidiManager::MAX_VOICES; ++i) {
        if (!voices[i].active) {
            continue;
        }
        auto* voiceObj = new juce::DynamicObject();
        voiceObj->setProperty("index", i);
        voiceObj->setProperty("note", static_cast<int>(voices[i].note));
        voiceObj->setProperty("velocity", static_cast<int>(voices[i].velocity));
        voiceObj->setProperty("channel", static_cast<int>(voices[i].channel));
        voiceObj->setProperty("currentPitchBend", voices[i].currentPitchBend);
        activeVoices.add(juce::var(voiceObj));
    }
    root->setProperty("activeVoices", juce::var(activeVoices));

    uint8_t status = 0;
    uint8_t data1 = 0;
    uint8_t data2 = 0;
    uint64_t seq = 0;
    const bool hasLastInput = manager.getLastInputMessage(status, data1, data2, seq);
    root->setProperty("hasLastInputMessage", hasLastInput);
    if (hasLastInput) {
        auto* lastInputObj = new juce::DynamicObject();
        lastInputObj->setProperty("status", static_cast<int>(status));
        lastInputObj->setProperty("data1", static_cast<int>(data1));
        lastInputObj->setProperty("data2", static_cast<int>(data2));
        lastInputObj->setProperty("seq", static_cast<double>(seq));
        root->setProperty("lastInputMessage", juce::var(lastInputObj));
    }

    return juce::var(root);
}

} // namespace

int main(int argc, char* argv[]) {
    HarnessOptions opts;
    if (!parseOptions(argc, argv, opts)) {
        return 1;
    }

    juce::ScopedJuceInitialiser_GUI juceInit;

    BehaviorCoreProcessor processor;
    processor.prepareToPlay(44100.0, 512);
    processor.setMidiThruEnabled(true);

    auto* midiManager = processor.getMidiManager();
    if (midiManager == nullptr) {
        std::fprintf(stderr, "FAIL: processor midi manager is null\n");
        std::_Exit(2);
    }

    auto* root = new juce::DynamicObject();
    root->setProperty("contractVersion", 1);
    root->setProperty("initialProcessorMidi", extractMidiSubcontract(processor));

    const bool invalidOpenInput = processor.openMidiInput(-1);
    const bool invalidOpenOutput = processor.openMidiOutput(-1);
    root->setProperty("invalidOpenInput", invalidOpenInput);
    root->setProperty("invalidOpenOutput", invalidOpenOutput);
    root->setProperty("afterInvalidOpenProcessorMidi", extractMidiSubcontract(processor));

    juce::MidiBuffer firstInput;
    firstInput.addEvent(juce::MidiMessage::noteOn(1, 60, static_cast<juce::uint8>(100)), 0);
    firstInput.addEvent(juce::MidiMessage::controllerEvent(1, 74, 81), 4);
    firstInput.addEvent(juce::MidiMessage::pitchWheel(1, 10000), 8);
    firstInput.addEvent(juce::MidiMessage::programChange(1, 9), 12);
    processor.processMidiInput(firstInput, false);

    root->setProperty("afterInputManager", makeManagerSnapshot(*midiManager));
    root->setProperty("afterInputRing", drainInputRing(*midiManager));

    juce::MidiBuffer secondInput;
    secondInput.addEvent(juce::MidiMessage::noteOff(1, 60), 0);
    processor.processMidiInput(secondInput, false);

    root->setProperty("afterNoteOffManager", makeManagerSnapshot(*midiManager));
    root->setProperty("afterNoteOffRing", drainInputRing(*midiManager));

    processor.sendMidiNoteOn(1, 60, 100);
    processor.sendMidiCC(1, 74, 81);
    processor.sendMidiPitchBend(1, 1234);
    processor.sendMidiProgramChange(1, 9);
    processor.sendMidiNoteOff(1, 60);

    juce::MidiBuffer output;
    processor.drainMidiOutput(output);
    root->setProperty("outgoingEvents", serialiseMidiBuffer(output));
    root->setProperty("finalProcessorMidi", extractMidiSubcontract(processor));

    const auto contract = juce::JSON::toString(juce::var(root), true).toStdString();

    switch (opts.mode) {
        case HarnessOptions::Write: {
            std::ofstream file(opts.contractPath);
            if (!file.is_open()) {
                std::fprintf(stderr, "ERROR: cannot write to %s\n", opts.contractPath.c_str());
                std::_Exit(2);
            }
            file << contract;
            file.close();
            std::fprintf(stdout, "OK: wrote MIDI contract (%zu bytes) to %s\n",
                         contract.size(), opts.contractPath.c_str());
            std::fflush(stdout);
            std::fflush(stderr);
            std::_Exit(0);
        }
        case HarnessOptions::Verify: {
            const bool ok = verifyContract(contract, opts.contractPath);
            std::fflush(stdout);
            std::fflush(stderr);
            std::_Exit(ok ? 0 : 1);
        }
        case HarnessOptions::Print: {
            std::fprintf(stdout, "%s", contract.c_str());
            std::fflush(stdout);
            std::fflush(stderr);
            std::_Exit(0);
        }
    }

    std::_Exit(0);
}
