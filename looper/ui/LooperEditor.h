#pragma once

#include <juce_audio_processors/juce_audio_processors.h>
#include <juce_gui_basics/juce_gui_basics.h>
#include "../engine/LooperProcessor.h"
#include "../primitives/ui/Canvas.h"
#include <array>
#include <vector>

class LooperEditor : public juce::AudioProcessorEditor, private juce::Timer {
public:
    LooperEditor(LooperProcessor& p);
    ~LooperEditor() override = default;
    
    void paint(juce::Graphics& g) override;
    void resized() override;
    
private:
    void timerCallback() override;
    void buildCanvasUi();
    void layoutCanvasUi();
    void refreshUiState();
    void onCaptureSegmentClicked(float bars);
    juce::String recordModeText(RecordMode mode) const;
    juce::String layerStateText(LooperLayer::State state, int lengthSamples) const;
    juce::Colour layerStateColour(LooperLayer::State state) const;
    void drawLayerWaveform(juce::Graphics& g,
                           juce::Rectangle<int> bounds,
                           const LooperLayer& layer,
                           juce::Colour colour) const;
    void drawCaptureWindowWaveform(juce::Graphics& g,
                                   juce::Rectangle<int> bounds,
                                   int startSamplesAgo,
                                   int endSamplesAgo,
                                   juce::Colour colour) const;
    
    LooperProcessor& processor;

    Canvas rootCanvas{"root"};
    Canvas* titleNode = nullptr;
    Canvas* controlsNode = nullptr;
    Canvas* captureNode = nullptr;
    Canvas* captureNowIndicator = nullptr;
    Canvas* layersNode = nullptr;
    Canvas* statusNode = nullptr;

    Canvas* recButton = nullptr;
    Canvas* overdubButton = nullptr;
    Canvas* stopButton = nullptr;
    Canvas* modeButton = nullptr;
    Canvas* clearButton = nullptr;
    Canvas* clearAllButton = nullptr;
    Canvas* tempoDownButton = nullptr;
    Canvas* tempoUpButton = nullptr;
    Canvas* volumeDownButton = nullptr;
    Canvas* volumeUpButton = nullptr;

    std::array<Canvas*, LooperProcessor::MAX_LAYERS> layerRows{};
    std::array<Canvas*, LooperProcessor::MAX_LAYERS> layerMuteButtons{};
    std::array<Canvas*, LooperProcessor::MAX_LAYERS> layerReverseButtons{};
    std::array<Canvas*, LooperProcessor::MAX_LAYERS> layerStopButtons{};
    std::array<Canvas*, LooperProcessor::MAX_LAYERS> layerClearButtons{};
    std::array<Canvas*, LooperProcessor::MAX_LAYERS> layerSpeedDownButtons{};
    std::array<Canvas*, LooperProcessor::MAX_LAYERS> layerSpeedUpButtons{};
    std::array<Canvas*, LooperProcessor::MAX_LAYERS> layerVolumeDownButtons{};
    std::array<Canvas*, LooperProcessor::MAX_LAYERS> layerVolumeUpButtons{};

    struct CaptureSegment {
        float bars = 0.0f;
        juce::String label;
        Canvas* node = nullptr;
    };
    std::vector<CaptureSegment> captureStrips;
    std::vector<CaptureSegment> captureSegments;
    
    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(LooperEditor)
};
