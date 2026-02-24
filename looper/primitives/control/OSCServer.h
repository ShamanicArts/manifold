#pragma once

#include <array>
#include <atomic>
#include <mutex>
#include <string>
#include <thread>
#include <vector>

#include <juce_core/juce_core.h>

#include "ControlServer.h"

class LooperProcessor;

struct OSCSettings {
    int inputPort = 8000;
    int queryPort = 8001;
    bool oscEnabled = false;
    bool oscQueryEnabled = false;
    juce::StringArray outTargets;
};

struct OSCMessage {
    juce::String address;
    std::vector<juce::var> args;
    juce::String sourceIP;
    int sourcePort = 0;
};

// ============================================================================
// Cached snapshot of AtomicState for diff-based broadcasting.
// Only includes values that make sense to broadcast over OSC.
// ============================================================================

struct OSCStateSnapshot {
    float tempo = 120.0f;
    bool isRecording = false;
    bool overdubEnabled = false;
    int recordMode = 0;
    int activeLayer = 0;
    float masterVolume = 1.0f;

    struct LayerSnapshot {
        int state = 0;
        float speed = 1.0f;
        float volume = 1.0f;
        bool reversed = false;
        float position = 0.0f;  // normalized 0-1
        float bars = 0.0f;
    };

    static const int MAX_LAYERS = 4;
    LayerSnapshot layers[MAX_LAYERS];
};

class OSCServer {
public:
    OSCServer();
    ~OSCServer();

    void start(LooperProcessor* processor);
    void stop();

    void setSettings(const OSCSettings& settings);
    OSCSettings getSettings() const;

    // Target management - use "host:port" format (e.g. "192.168.1.100:9000")
    void addOutTarget(const juce::String& ipPort);
    void removeOutTarget(const juce::String& ipPort);
    void clearOutTargets();
    juce::StringArray getOutTargets() const;

    // Broadcast an OSC message to all configured targets
    void broadcast(const juce::String& address, const std::vector<juce::var>& args);

    bool isRunning() const { return running.load(); }

    // Set broadcast rate in Hz (default 30). 0 = disabled.
    void setBroadcastRate(int hz);

private:
    void receiveLoop();
    void broadcastLoop();
    void parseAndDispatch(const char* data, int size, const juce::String& sourceIP, int sourcePort);
    bool parseOSCMessage(const char* data, int size, OSCMessage& out);
    void dispatchMessage(const OSCMessage& msg);
    juce::var parseArgument(char tag, const char* data, int dataLen, int& offset);

    void sendToTargets(const juce::String& address, const std::vector<juce::var>& args);

    // State-diff broadcaster: reads AtomicState, compares to snapshot, broadcasts changes
    void broadcastStateChanges();

    LooperProcessor* owner = nullptr;
    OSCSettings settings;
    mutable std::mutex settingsMutex;

    juce::DatagramSocket* socket = nullptr;
    std::atomic<bool> running{false};
    std::thread receiveThread;
    std::thread broadcastThread;

    juce::StringArray configuredTargets;  // explicitly added targets (not ephemeral)
    mutable std::mutex targetsMutex;

    std::atomic<int> messagesReceived{0};
    std::atomic<int> messagesSent{0};
    std::atomic<int> broadcastRateHz{30};

    // Cached state for diff-based broadcasting
    OSCStateSnapshot cachedState;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(OSCServer)
};
