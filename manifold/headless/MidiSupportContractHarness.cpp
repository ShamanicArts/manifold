#include "ContractHarnessUtils.h"

#include "../core/MidiSupport.h"
#include "../primitives/midi/MidiRingBuffer.h"

#include <juce_core/juce_core.h>

namespace {

using namespace contract_harness_utils;
using namespace manifold::midi_support;

juce::var drainRingBuffer(MidiRingBuffer& ring) {
    auto* arr = new juce::Array<juce::var>();
    uint8_t status = 0, data1 = 0, data2 = 0;
    int32_t timestamp = 0;
    while (ring.read(status, data1, data2, timestamp)) {
        auto* msg = new juce::DynamicObject();
        msg->setProperty("status", static_cast<int>(status));
        msg->setProperty("data1", static_cast<int>(data1));
        msg->setProperty("data2", static_cast<int>(data2));
        msg->setProperty("timestamp", static_cast<double>(timestamp));
        arr->add(juce::var(msg));
    }
    return juce::var(*arr);
}

juce::var deviceListSnapshot() {
    auto* obj = new juce::DynamicObject();
    obj->setProperty("inputDevices", juce::var(juce::Array<juce::var>()));
    obj->setProperty("outputDevices", juce::var(juce::Array<juce::var>()));

    const auto inputs = getMidiInputDevices();
    const auto outputs = getMidiOutputDevices();
    obj->setProperty("numInputs", static_cast<int>(inputs.size()));
    obj->setProperty("numOutputs", static_cast<int>(outputs.size()));
    return juce::var(obj);
}

} // namespace

int main(int argc, char* argv[]) {
    HarnessOptions opts;
    if (!parseOptions(argc, argv, opts)) {
        return 1;
    }

    auto* root = new juce::DynamicObject();
    root->setProperty("contractVersion", 1);

    // =====================================================================
    // Domain 1: device listing (returns empty in headless – no hardware)
    // =====================================================================
    {
        auto* obj = new juce::DynamicObject();
        obj->setProperty("devices", deviceListSnapshot());

        // open with invalid index – should gracefully fail
        std::unique_ptr<juce::MidiInput> inputDevice;
        std::unique_ptr<juce::MidiOutput> outputDevice;
        obj->setProperty("openInvalidInputIndex", openMidiInputDevice(inputDevice, -1, nullptr));
        obj->setProperty("openInvalidOutputIndex", openMidiOutputDevice(outputDevice, -1));
        obj->setProperty("closeNullInput", (closeMidiInputDevice(inputDevice), true));
        obj->setProperty("closeNullOutput", (closeMidiOutputDevice(outputDevice), true));

        // sendMidiMessageNow with null output – safe no-op
        sendMidiMessageNow(nullptr, 0x90, 60, 100);
        obj->setProperty("sendWithNullOutput", true);

        // sendMidiMessageNow with null output – safe no-op
        sendMidiNoteOn(nullptr, nullptr, 1, 60, 100);
        obj->setProperty("sendNoteOnNullManager", true);

        sendMidiNoteOff(nullptr, nullptr, 1, 60);
        obj->setProperty("sendNoteOffNullManager", true);

        sendMidiCC(nullptr, nullptr, 1, 7, 100);
        obj->setProperty("sendCCNullManager", true);

        sendMidiPitchBend(nullptr, nullptr, 1, 8192);
        obj->setProperty("sendPitchBendNullManager", true);

        sendMidiProgramChange(nullptr, nullptr, 1, 0);
        obj->setProperty("sendProgramChangeNullManager", true);

        root->setProperty("deviceAndNullSafety", juce::var(obj));
    }

    // =====================================================================
    // Domain 2: enqueueIncomingHardwareMidi – message translation
    // =====================================================================
    {
        MidiRingBuffer ring;

        // Note On

        {
            auto msg = juce::MidiMessage::noteOn(1, 60, static_cast<uint8_t>(100));
            enqueueIncomingHardwareMidi(ring, msg);
        }
        // Note Off
        {
            auto msg = juce::MidiMessage::noteOff(1, 60);
            enqueueIncomingHardwareMidi(ring, msg);
        }
        // CC 7 value 64
        {
            auto msg = juce::MidiMessage::controllerEvent(1, 7, 64);
            enqueueIncomingHardwareMidi(ring, msg);
        }
        // Pitch wheel centre
        {
            auto msg = juce::MidiMessage::pitchWheel(1, 8192);
            enqueueIncomingHardwareMidi(ring, msg);
        }
        // Program change
        {
            auto msg = juce::MidiMessage::programChange(1, 5);
            enqueueIncomingHardwareMidi(ring, msg);
        }
        // Channel 16 (index 15) – verify channel masking
        {
            auto msg = juce::MidiMessage::noteOn(16, 72, static_cast<uint8_t>(127));
            enqueueIncomingHardwareMidi(ring, msg);
        }

        auto* obj = new juce::DynamicObject();
        obj->setProperty("messages", drainRingBuffer(ring));
        root->setProperty("midiMessageTranslation", juce::var(obj));
    }

    // =====================================================================
    // Domain 3: drainMidiOutput – empty ring buffer, null manager
    // =====================================================================
    {
        MidiRingBuffer emptyRing;
        juce::MidiBuffer midiBuf;
        drainMidiOutput(nullptr, emptyRing, midiBuf);

        auto* obj = new juce::DynamicObject();
        obj->setProperty("drainWithNullManager", true);
        obj->setProperty("numMidiMessages", static_cast<int>(midiBuf.getNumEvents()));

        // drain with non-null manager (default constructed = not active)
        {
            auto manager = std::make_shared<midi::MidiManager>();
            MidiRingBuffer ring;
            juce::MidiBuffer buf2;
            drainMidiOutput(manager.get(), ring, buf2);
            obj->setProperty("numMidiMessagesWithInactiveManager", static_cast<int>(buf2.getNumEvents()));
        }

        root->setProperty("drainMidiOutput", juce::var(obj));
    }

    // =====================================================================
    // Domain 4: processMidiInput with null manager
    // =====================================================================
    {
        auto* obj = new juce::DynamicObject();
        auto emptyBuf = juce::MidiBuffer();
        processMidiInput(nullptr, emptyBuf, 48000.0);
        obj->setProperty("processWithNullManager", true);

        // process with active manager and a note on
        {
            auto manager = std::make_shared<midi::MidiManager>();
            manager->openInput(-1);
            juce::MidiBuffer buf;
            buf.addEvent(juce::MidiMessage::noteOn(1, 60, static_cast<uint8_t>(100)), 0);

            // Should not crash, but results depend on MidiManager internal state
            processMidiInput(manager.get(), buf, 48000.0);
            obj->setProperty("processWithManager", true);
        }

        root->setProperty("processMidiInput", juce::var(obj));
    }

    // =====================================================================
    // Domain 5: makeMidiContract snapshot
    // =====================================================================
    {
        auto* obj = new juce::DynamicObject();

        // With null manager
        obj->setProperty("nullManager", makeMidiContract(false, false, false, nullptr));

        // With active manager
        {
            auto manager = std::make_shared<midi::MidiManager>();
            manager->openInput(-1);
            manager->openOutput(-1);
            obj->setProperty("activeManager", makeMidiContract(true, true, false, manager));
        }

        root->setProperty("midiContract", juce::var(obj));
    }

    const auto contract = juce::JSON::toString(juce::var(root), true).toStdString();
    return finishJsonContract(opts, "MidiSupport contract", contract);
}
