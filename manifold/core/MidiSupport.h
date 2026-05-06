#pragma once

#include "../primitives/midi/MidiManager.h"
#include "../primitives/midi/MidiRingBuffer.h"

#include <juce_audio_basics/juce_audio_basics.h>
#include <juce_audio_devices/juce_audio_devices.h>
#include <juce_core/juce_core.h>

#include <memory>
#include <string>
#include <vector>

namespace manifold::midi_support {

inline std::vector<std::string> getMidiInputDevices() {
    std::vector<std::string> devices;
    const auto deviceInfos = juce::MidiInput::getAvailableDevices();
    devices.reserve(static_cast<std::size_t>(deviceInfos.size()));
    for (const auto& info : deviceInfos) {
        devices.push_back(info.name.toStdString());
    }
    return devices;
}

inline std::vector<std::string> getMidiOutputDevices() {
    std::vector<std::string> devices;
    const auto deviceInfos = juce::MidiOutput::getAvailableDevices();
    devices.reserve(static_cast<std::size_t>(deviceInfos.size()));
    for (const auto& info : deviceInfos) {
        devices.push_back(info.name.toStdString());
    }
    return devices;
}

inline bool openMidiInputDevice(std::unique_ptr<juce::MidiInput>& midiInputDevice,
                                int deviceIndex,
                                juce::MidiInputCallback* callback) {
    const auto deviceInfos = juce::MidiInput::getAvailableDevices();
    if (deviceIndex < 0 || deviceIndex >= deviceInfos.size()) {
        return false;
    }

    if (midiInputDevice != nullptr) {
        midiInputDevice->stop();
        midiInputDevice.reset();
    }

    auto device = juce::MidiInput::openDevice(deviceInfos[deviceIndex].identifier,
                                              callback);
    if (device == nullptr) {
        return false;
    }

    midiInputDevice = std::move(device);
    midiInputDevice->start();
    return true;
}

inline bool openMidiOutputDevice(std::unique_ptr<juce::MidiOutput>& midiOutputDevice,
                                 int deviceIndex) {
    const auto deviceInfos = juce::MidiOutput::getAvailableDevices();
    if (deviceIndex < 0 || deviceIndex >= deviceInfos.size()) {
        return false;
    }

    if (midiOutputDevice != nullptr) {
        midiOutputDevice.reset();
    }

    auto device = juce::MidiOutput::openDevice(deviceInfos[deviceIndex].identifier);
    if (device == nullptr) {
        return false;
    }

    midiOutputDevice = std::move(device);
    return true;
}

inline void closeMidiInputDevice(std::unique_ptr<juce::MidiInput>& midiInputDevice) {
    if (midiInputDevice != nullptr) {
        midiInputDevice->stop();
        midiInputDevice.reset();
    }
}

inline void closeMidiOutputDevice(std::unique_ptr<juce::MidiOutput>& midiOutputDevice) {
    if (midiOutputDevice != nullptr) {
        midiOutputDevice.reset();
    }
}

inline void enqueueIncomingHardwareMidi(MidiRingBuffer& midiInputRing,
                                        const juce::MidiMessage& msg) {
    const uint8_t channel = static_cast<uint8_t>((juce::jlimit(1, 16, msg.getChannel()) - 1) & 0x0F);
    if (msg.isNoteOn()) {
        midiInputRing.write(static_cast<uint8_t>(MidiStatus::NOTE_ON | channel),
                            static_cast<uint8_t>(msg.getNoteNumber()),
                            static_cast<uint8_t>(msg.getVelocity()),
                            0);
        return;
    }

    if (msg.isNoteOff()) {
        midiInputRing.write(static_cast<uint8_t>(MidiStatus::NOTE_OFF | channel),
                            static_cast<uint8_t>(msg.getNoteNumber()),
                            static_cast<uint8_t>(msg.getVelocity()),
                            0);
        return;
    }

    if (msg.isController()) {
        midiInputRing.write(static_cast<uint8_t>(MidiStatus::CONTROL_CHANGE | channel),
                            static_cast<uint8_t>(msg.getControllerNumber()),
                            static_cast<uint8_t>(msg.getControllerValue()),
                            0);
        return;
    }

    if (msg.isPitchWheel()) {
        const int value = msg.getPitchWheelValue();
        midiInputRing.write(static_cast<uint8_t>(MidiStatus::PITCH_BEND | channel),
                            static_cast<uint8_t>(value & 0x7F),
                            static_cast<uint8_t>((value >> 7) & 0x7F),
                            0);
        return;
    }

    if (msg.isProgramChange()) {
        midiInputRing.write(static_cast<uint8_t>(MidiStatus::PROGRAM_CHANGE | channel),
                            static_cast<uint8_t>(msg.getProgramChangeNumber()),
                            0,
                            0);
    }
}

inline void sendMidiMessageNow(juce::MidiOutput* midiOutputDevice,
                               uint8_t status,
                               uint8_t data1,
                               uint8_t data2) {
    if (midiOutputDevice != nullptr) {
        midiOutputDevice->sendMessageNow(juce::MidiMessage(status, data1, data2, {}));
    }
}

inline void sendMidiNoteOn(midi::MidiManager* midiManager,
                           juce::MidiOutput* midiOutputDevice,
                           int channel,
                           int note,
                           int velocity) {
    if (midiManager != nullptr) {
        midiManager->sendNoteOn(static_cast<uint8_t>(channel - 1),
                                static_cast<uint8_t>(note),
                                static_cast<uint8_t>(velocity));
    }
    sendMidiMessageNow(midiOutputDevice,
                       static_cast<uint8_t>(MidiStatus::NOTE_ON | ((channel - 1) & 0x0F)),
                       static_cast<uint8_t>(note & 0x7F),
                       static_cast<uint8_t>(velocity & 0x7F));
}

inline void sendMidiNoteOff(midi::MidiManager* midiManager,
                            juce::MidiOutput* midiOutputDevice,
                            int channel,
                            int note) {
    if (midiManager != nullptr) {
        midiManager->sendNoteOff(static_cast<uint8_t>(channel - 1),
                                 static_cast<uint8_t>(note));
    }
    sendMidiMessageNow(midiOutputDevice,
                       static_cast<uint8_t>(MidiStatus::NOTE_OFF | ((channel - 1) & 0x0F)),
                       static_cast<uint8_t>(note & 0x7F),
                       0);
}

inline void sendMidiCC(midi::MidiManager* midiManager,
                       juce::MidiOutput* midiOutputDevice,
                       int channel,
                       int cc,
                       int value) {
    if (midiManager != nullptr) {
        midiManager->sendCC(static_cast<uint8_t>(channel - 1),
                            static_cast<uint8_t>(cc),
                            static_cast<uint8_t>(value));
    }
    sendMidiMessageNow(midiOutputDevice,
                       static_cast<uint8_t>(MidiStatus::CONTROL_CHANGE | ((channel - 1) & 0x0F)),
                       static_cast<uint8_t>(cc & 0x7F),
                       static_cast<uint8_t>(value & 0x7F));
}

inline void sendMidiPitchBend(midi::MidiManager* midiManager,
                              juce::MidiOutput* midiOutputDevice,
                              int channel,
                              int value) {
    if (midiManager != nullptr) {
        midiManager->sendPitchBend(static_cast<uint8_t>(channel - 1),
                                   static_cast<int16_t>(value));
    }
    sendMidiMessageNow(midiOutputDevice,
                       static_cast<uint8_t>(MidiStatus::PITCH_BEND | ((channel - 1) & 0x0F)),
                       static_cast<uint8_t>(value & 0x7F),
                       static_cast<uint8_t>((value >> 7) & 0x7F));
}

inline void sendMidiProgramChange(midi::MidiManager* midiManager,
                                  juce::MidiOutput* midiOutputDevice,
                                  int channel,
                                  int program) {
    if (midiManager != nullptr) {
        midiManager->sendProgramChange(static_cast<uint8_t>(channel - 1),
                                       static_cast<uint8_t>(program));
    }
    sendMidiMessageNow(midiOutputDevice,
                       static_cast<uint8_t>(MidiStatus::PROGRAM_CHANGE | ((channel - 1) & 0x0F)),
                       static_cast<uint8_t>(program & 0x7F),
                       0);
}

inline void processMidiInput(midi::MidiManager* midiManager,
                             const juce::MidiBuffer& midiMessages,
                             double sampleRate) {
    if (midiManager != nullptr) {
        midiManager->processIncomingMidi(midiMessages, sampleRate);
    }
}

inline void drainMidiOutput(midi::MidiManager* midiManager,
                            MidiRingBuffer& midiOutputRing,
                            juce::MidiBuffer& outMidi) {
    if (midiManager != nullptr) {
        midiManager->fillOutgoingMidi(outMidi);
    }

    uint8_t status = 0;
    uint8_t data1 = 0;
    uint8_t data2 = 0;
    int32_t timestamp = 0;
    while (midiOutputRing.read(status, data1, data2, timestamp)) {
        outMidi.addEvent(juce::MidiMessage(status, data1, data2), timestamp);
    }
}

inline juce::var makeMidiContract(bool inputDeviceOpen,
                                  bool outputDeviceOpen,
                                  bool thruEnabled,
                                  const std::shared_ptr<midi::MidiManager>& midiManager) {
    juce::DynamicObject::Ptr midiObj = new juce::DynamicObject();
    midiObj->setProperty("inputDeviceOpen", inputDeviceOpen);
    midiObj->setProperty("outputDeviceOpen", outputDeviceOpen);
    midiObj->setProperty("thruEnabled", thruEnabled);
    midiObj->setProperty("midiManagerActive", midiManager != nullptr);

    juce::DynamicObject::Ptr managerObj = new juce::DynamicObject();
    managerObj->setProperty("inputOpen", midiManager != nullptr ? midiManager->isInputOpen() : false);
    managerObj->setProperty("outputOpen", midiManager != nullptr ? midiManager->isOutputOpen() : false);
    managerObj->setProperty("currentInputDevice", midiManager != nullptr ? midiManager->getCurrentInputDevice() : -1);
    managerObj->setProperty("currentOutputDevice", midiManager != nullptr ? midiManager->getCurrentOutputDevice() : -1);
    managerObj->setProperty("omniMode", midiManager != nullptr ? midiManager->isOmniMode() : false);
    managerObj->setProperty("numActiveVoices", midiManager != nullptr ? midiManager->getNumActiveVoices() : 0);

    uint8_t status = 0;
    uint8_t data1 = 0;
    uint8_t data2 = 0;
    uint64_t seq = 0;
    const bool hasLastInput = midiManager != nullptr && midiManager->getLastInputMessage(status, data1, data2, seq);
    managerObj->setProperty("hasLastInputMessage", hasLastInput);
    if (hasLastInput) {
        juce::DynamicObject::Ptr lastInputObj = new juce::DynamicObject();
        lastInputObj->setProperty("status", static_cast<int>(status));
        lastInputObj->setProperty("data1", static_cast<int>(data1));
        lastInputObj->setProperty("data2", static_cast<int>(data2));
        lastInputObj->setProperty("seq", static_cast<double>(seq));
        managerObj->setProperty("lastInputMessage", juce::var(lastInputObj.get()));
    }

    midiObj->setProperty("manager", juce::var(managerObj.get()));
    return juce::var(midiObj.get());
}

} // namespace manifold::midi_support
