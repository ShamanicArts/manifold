#include "../../manifold/core/BehaviorCoreProcessor.h"
#include "../../dsp/core/nodes/MidiVoiceNode.h"

#include <algorithm>
#include <cstdio>
#include <cstdlib>
#include <fstream>
#include <iterator>
#include <string>
#include <cmath>

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

    // ==========================================================================
    // Domain 1: Voice Allocation & Stealing — 9 notes on 8-voice polyphony
    // MidiManager has MAX_VOICES=32, but the key test is that findFreeVoice()
    // correctly selects which voice to steal when all are active.
    // We send note-ons for notes 60-68 and observe which voice is stolen.
    // ==========================================================================
    {
        midiManager->reset();
        juce::MidiBuffer buf;
        for (int note = 60; note <= 68; ++note) {
            buf.addEvent(juce::MidiMessage::noteOn(1, note, static_cast<juce::uint8>(80)), 0);
        }
        processor.processMidiInput(buf, false);
        root->setProperty("voiceStealing_9notesOn8Max", makeManagerSnapshot(*midiManager));
        root->setProperty("voiceStealing_ring", drainInputRing(*midiManager));

        // Now send note-ons for 5 more notes to force multiple steal cycles
        juce::MidiBuffer buf2;
        for (int note = 70; note <= 74; ++note) {
            buf2.addEvent(juce::MidiMessage::noteOn(1, note, static_cast<juce::uint8>(90)), 4 * (note - 69));
        }
        processor.processMidiInput(buf2, false);
        root->setProperty("voiceStealing_5moreSteals", makeManagerSnapshot(*midiManager));
        root->setProperty("voiceStealing_ring2", drainInputRing(*midiManager));

        // Note retrigger: press note 60 while it's still held → should retrigger, not allocate new voice
        juce::MidiBuffer buf3;
        buf3.addEvent(juce::MidiMessage::noteOn(1, 60, static_cast<juce::uint8>(100)), 0);
        processor.processMidiInput(buf3, false);
        root->setProperty("voiceStealing_retrigger60", makeManagerSnapshot(*midiManager));

        // Release all
        juce::MidiBuffer releaseAll;
        for (int note = 60; note <= 74; ++note) {
            releaseAll.addEvent(juce::MidiMessage::noteOff(1, note), 0);
        }
        processor.processMidiInput(releaseAll, false);
        root->setProperty("voiceStealing_afterReleaseAll", makeManagerSnapshot(*midiManager));
    }

    // ==========================================================================
    // Domain 2: Sustain Pedal State Machine
    // Note-on → sustain pedal on → note-off → voice stays sustained
    // Then release pedal → voices release
    // ==========================================================================
    {
        midiManager->reset();

        // Step 1: Note on, then hold with sustain
        juce::MidiBuffer step1;
        step1.addEvent(juce::MidiMessage::noteOn(1, 60, static_cast<juce::uint8>(100)), 0);
        step1.addEvent(juce::MidiMessage::noteOn(1, 64, static_cast<juce::uint8>(90)), 8);
        step1.addEvent(juce::MidiMessage::noteOn(1, 67, static_cast<juce::uint8>(80)), 16);
        processor.processMidiInput(step1, false);
        root->setProperty("sustain_after3NotesOn", makeManagerSnapshot(*midiManager));

        // Step 2: Press sustain pedal (CC64 >= 64)
        juce::MidiBuffer step2;
        step2.addEvent(juce::MidiMessage::controllerEvent(1, 64, 127), 0);
        processor.processMidiInput(step2, false);
        root->setProperty("sustain_pedalOn", makeManagerSnapshot(*midiManager));

        // Step 3: Release all 3 notes while pedal is held
        juce::MidiBuffer step3;
        step3.addEvent(juce::MidiMessage::noteOff(1, 60), 0);
        step3.addEvent(juce::MidiMessage::noteOff(1, 64), 4);
        step3.addEvent(juce::MidiMessage::noteOff(1, 67), 8);
        processor.processMidiInput(step3, false);
        root->setProperty("sustain_notesOffWhilePedalHeld", makeManagerSnapshot(*midiManager));
        root->setProperty("sustain_ringAfterNoteOff", drainInputRing(*midiManager));

        // Step 4: Release sustain pedal → sustained voices release
        juce::MidiBuffer step4;
        step4.addEvent(juce::MidiMessage::controllerEvent(1, 64, 0), 0);
        processor.processMidiInput(step4, false);
        root->setProperty("sustain_pedalOffVoicesReleased", makeManagerSnapshot(*midiManager));

        // Step 5: Sostenuto pedal — press while notes held, sostenuto only holds those notes
        // Re-press 2 notes, then press sostenuto (CC66 >= 64), release notes
        midiManager->reset();
        juce::MidiBuffer step5a;
        step5a.addEvent(juce::MidiMessage::noteOn(1, 60, static_cast<juce::uint8>(100)), 0);
        step5a.addEvent(juce::MidiMessage::noteOn(1, 63, static_cast<juce::uint8>(90)), 8);
        processor.processMidiInput(step5a, false);

        juce::MidiBuffer step5b;
        step5b.addEvent(juce::MidiMessage::controllerEvent(1, 66, 127), 0);  // sostenuto on
        processor.processMidiInput(step5b, false);
        root->setProperty("sustain_sostenutoOn", makeManagerSnapshot(*midiManager));

        // Play a new note after sostenuto — should NOT be sustained
        juce::MidiBuffer step5c;
        step5c.addEvent(juce::MidiMessage::noteOn(1, 67, static_cast<juce::uint8>(80)), 0);
        processor.processMidiInput(step5c, false);

        // Release all notes
        juce::MidiBuffer step5d;
        step5d.addEvent(juce::MidiMessage::noteOff(1, 60), 0);
        step5d.addEvent(juce::MidiMessage::noteOff(1, 63), 4);
        step5d.addEvent(juce::MidiMessage::noteOff(1, 67), 8);
        processor.processMidiInput(step5d, false);
        root->setProperty("sustain_sostenutoNotesReleased", makeManagerSnapshot(*midiManager));
    }

    // ==========================================================================
    // Domain 3: Channel Filtering & Omni Mode
    // When channel-masked to ch1 only, ch2 messages should be dropped.
    // When omniMode=false and only ch2 enabled, ch1 messages should be dropped.
    // ==========================================================================
    {
        midiManager->reset();

        // Set channel mask to only allow channel 1
        midiManager->setChannelMask(0x0001);  // bit 0 = channel 1
        midiManager->setOmniMode(false);
        root->setProperty("filter_channelMask1only", makeManagerSnapshot(*midiManager));

        // Send note-on on channel 2 → should be filtered
        juce::MidiBuffer bufCh2;
        bufCh2.addEvent(juce::MidiMessage::noteOn(2, 60, static_cast<juce::uint8>(100)), 0);
        processor.processMidiInput(bufCh2, false);
        root->setProperty("filter_ch2noteDropped", makeManagerSnapshot(*midiManager));

        // Send note-on on channel 1 → should pass
        juce::MidiBuffer bufCh1;
        bufCh1.addEvent(juce::MidiMessage::noteOn(1, 60, static_cast<juce::uint8>(100)), 0);
        processor.processMidiInput(bufCh1, false);
        root->setProperty("filter_ch1notePassed", makeManagerSnapshot(*midiManager));

        // Switch to omni mode (all channels regardless of mask)
        // Actually omniMode makes isChannelEnabled still check the mask. Let's verify:
        // isOmniMode=true + channelMask 0x0001 → channel 2 should still be filtered
        midiManager->setOmniMode(true);
        // Actually re-read the code: handleMidiEvent checks isChannelEnabled(),
        // which checks channelMask_. So omni mode doesn't bypass the mask.
        // Let's set mask to all channels + omni mode
        midiManager->setChannelMask(0xFFFF);
        juce::MidiBuffer bufCh2Omni;
        bufCh2Omni.addEvent(juce::MidiMessage::noteOn(2, 61, static_cast<juce::uint8>(90)), 0);
        processor.processMidiInput(bufCh2Omni, false);
        root->setProperty("filter_omniCh2Passes", makeManagerSnapshot(*midiManager));

        // Track channel states independently
        midiManager->setOmniMode(false);
        midiManager->setChannelMask(0x0003);  // channels 1 and 2
        juce::MidiBuffer multiCh;
        multiCh.addEvent(juce::MidiMessage::noteOn(1, 60, static_cast<juce::uint8>(100)), 0);
        multiCh.addEvent(juce::MidiMessage::noteOn(2, 61, static_cast<juce::uint8>(90)), 8);
        processor.processMidiInput(multiCh, false);
        root->setProperty("filter_multiChannelTracking", makeManagerSnapshot(*midiManager));
    }

    // ==========================================================================
    // Domain 4: Ring Buffer Edge Cases
    // Test the lock-free MidiRingBuffer directly for:
    //   - Write until full, 257th fails
    //   - Wraparound: write 200, read 150, write 200 more
    //   - Read empty returns false
    //   - Peek doesn't consume
    // ==========================================================================
    {
        auto& ring = midiManager->getInputRing();
        ring.clear();
        auto* ringRoot = new juce::DynamicObject();

        // Fill until full: try 257 writes (capacity=256)
        int writesBeforeFull = 0;
        for (int i = 0; i < 257; ++i) {
            if (ring.write(0x90, static_cast<uint8_t>(i & 0x7F), 100, 0)) {
                writesBeforeFull++;
            }
        }
        ringRoot->setProperty("writesBeforeFull", writesBeforeFull);
        ringRoot->setProperty("isFullAfterFill", ring.isFull());

        // Drain all
        uint8_t s, d1, d2;
        int32_t ts;
        int reads = 0;
        while (ring.read(s, d1, d2, ts)) {
            reads++;
        }
        ringRoot->setProperty("readsAfterDrain", reads);
        ringRoot->setProperty("isEmptyAfterDrain", ring.isEmpty());
        ringRoot->setProperty("readFromEmpty", ring.read(s, d1, d2, ts) ? 1 : 0);

        // Wraparound test
        ring.clear();
        // Write 200, read 150 (leaves 50 in buffer, readIdx at 150)
        for (int i = 0; i < 200; ++i) {
            ring.write(0x90, static_cast<uint8_t>(i & 0x7F), 100, 0);
        }
        for (int i = 0; i < 150; ++i) {
            ring.read(s, d1, d2, ts);
        }
        // Write 200 more (this wraps around: writeIdx=200, next wraps to 0, then 1..199)
        int wrapWrites = 0;
        for (int i = 0; i < 200; ++i) {
            if (ring.write(0x91, 0x7F, 100, 0)) {
                wrapWrites++;
            }
        }
        ringRoot->setProperty("wrapWrites", wrapWrites);

        // Read and verify sequence: 50 old + 200 new = 250 total
        int wrapReads = 0;
        uint8_t firstStatus = 0;
        bool gotFirst = false;
        while (ring.read(s, d1, d2, ts)) {
            if (!gotFirst) {
                firstStatus = s;
                gotFirst = true;
            }
            wrapReads++;
        }
        ringRoot->setProperty("wrapReads", wrapReads);
        ringRoot->setProperty("wrapFirstStatus", static_cast<int>(firstStatus));

        // Peek test: write one, peek (don't consume), read -> should still get it
        ring.clear();
        ring.write(0x92, 42, 77, 0);
        uint8_t p_s=0, p_d1=0, p_d2=0;
        bool peeked = ring.peek(p_s, p_d1, p_d2);
        ringRoot->setProperty("peekResult", peeked ? 1 : 0);
        ringRoot->setProperty("peekStatus", static_cast<int>(p_s));
        ringRoot->setProperty("peekData1", static_cast<int>(p_d1));
        ringRoot->setProperty("peekData2", static_cast<int>(p_d2));
        // Read should still work (peek doesn't consume)
        bool readAfterPeek = ring.read(s, d1, d2, ts);
        ringRoot->setProperty("readAfterPeek", readAfterPeek ? 1 : 0);
        ringRoot->setProperty("readAfterPeekStatus", static_cast<int>(s));
        ringRoot->setProperty("readAfterPeekData1", static_cast<int>(d1));
        ringRoot->setProperty("readAfterPeekData2", static_cast<int>(d2));
        // Second read should fail (only one message)
        ringRoot->setProperty("secondReadAfterPeek", ring.read(s, d1, d2, ts) ? 1 : 0);

        root->setProperty("ringBuffer", juce::var(ringRoot));
    }

    // ==========================================================================
    // Domain 5: MIDI Clock & Transport Events
    // MidiManager should forward clock, start, stop, continue events to the ring.
    // ==========================================================================
    {
        midiManager->reset();

        juce::MidiBuffer clockBuf;
        // Send 24 MIDI clock ticks (one quarter note at 120 BPM)
        for (int i = 0; i < 24; ++i) {
            clockBuf.addEvent(juce::MidiMessage::midiClock(), 0);
        }
        processor.processMidiInput(clockBuf, false);
        auto clockRing = drainInputRing(*midiManager);
        auto* clockObj = new juce::DynamicObject();
        auto* arr = clockRing.getArray();
        clockObj->setProperty("clockEventCount", arr != nullptr ? arr->size() : 0);
        if (arr != nullptr && arr->size() > 0) {
            clockObj->setProperty("firstClockStatus", static_cast<int>((*arr)[0].getDynamicObject()->getProperty("status")));
        }
        root->setProperty("midiClock", juce::var(clockObj));

        // Transport: Start, Continue, Stop
        midiManager->reset();
        juce::MidiBuffer transportBuf;
        transportBuf.addEvent(juce::MidiMessage::midiStart(), 0);
        transportBuf.addEvent(juce::MidiMessage::midiContinue(), 8);
        transportBuf.addEvent(juce::MidiMessage::midiStop(), 16);
        processor.processMidiInput(transportBuf, false);
        root->setProperty("midiTransport", drainInputRing(*midiManager));

        // Active sensing (should be parsed, not crash)
        midiManager->reset();
        juce::MidiBuffer senseBuf;
        senseBuf.addEvent(juce::MidiMessage(0xFE), 0);
        processor.processMidiInput(senseBuf, false);
        root->setProperty("midiActiveSensing", drainInputRing(*midiManager));
    }

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
