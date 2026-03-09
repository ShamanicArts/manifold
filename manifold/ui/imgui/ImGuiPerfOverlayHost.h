#pragma once

#include <juce_gui_basics/juce_gui_basics.h>
#include <juce_opengl/juce_opengl.h>

#include <mutex>
#include <string>
#include <utility>
#include <vector>

class ImGuiPerfOverlayHost : public juce::Component, private juce::OpenGLRenderer {
public:
    struct MetricRow {
        std::string label;
        std::string value;
    };

    struct TabData {
        std::string id;
        std::string label;
        std::vector<MetricRow> rows;
    };

    struct Snapshot {
        std::string activeTab;
        std::string title;
        std::vector<TabData> tabs;
    };

    ImGuiPerfOverlayHost();
    ~ImGuiPerfOverlayHost() override;

    void configureSnapshot(const Snapshot& snapshot);

    std::function<void(const std::string& tabId)> onTabChanged;
    std::function<void()> onClosed;

    void paint(juce::Graphics& g) override;
    void resized() override;
    void visibilityChanged() override;

    void mouseMove(const juce::MouseEvent& e) override;
    void mouseDrag(const juce::MouseEvent& e) override;
    void mouseDown(const juce::MouseEvent& e) override;
    void mouseUp(const juce::MouseEvent& e) override;
    void mouseExit(const juce::MouseEvent& e) override;
    void mouseWheelMove(const juce::MouseEvent& e, const juce::MouseWheelDetails& wheel) override;
    bool keyPressed(const juce::KeyPress& key) override;
    bool keyStateChanged(bool isKeyDown) override;
    void focusGained(FocusChangeType cause) override;
    void focusLost(FocusChangeType cause) override;

private:
    void newOpenGLContextCreated() override;
    void renderOpenGL() override;
    void openGLContextClosing() override;

    Snapshot currentSnapshot() const;
    void setActiveTabLocally(const std::string& tabId);
    void requestClose();
    juce::Rectangle<int> titleBarBounds() const;
    juce::Rectangle<int> closeButtonBounds() const;

    void* imguiContext = nullptr;

    mutable std::mutex dataMutex_;
    Snapshot snapshot_;
    std::vector<std::pair<std::string, juce::Rectangle<int>>> tabHitRegions_;
    bool draggingTitle_ = false;
    juce::Point<int> dragStartScreen_;
    juce::Rectangle<int> dragStartBounds_;
    int scrollRows_ = 0;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(ImGuiPerfOverlayHost)
};
