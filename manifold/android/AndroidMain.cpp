#include <juce_gui_extra/juce_gui_extra.h>
#include "manifold/core/BehaviorCoreProcessor.h"
#include "manifold/core/BehaviorCoreEditor.h"

class ManifoldAndroidApp : public juce::JUCEApplication
{
public:
    ManifoldAndroidApp() = default;

    const juce::String getApplicationName() override { return "Manifold"; }
    const juce::String getApplicationVersion() override { return "1.0.0"; }
    bool moreThanOneInstanceAllowed() override { return false; }

    void initialise(const juce::String&) override
    {
        mainWindow.reset(new MainWindow(getApplicationName()));
    }

    void shutdown() override
    {
        mainWindow = nullptr;
    }

    void systemRequestedQuit() override
    {
        quit();
    }

    class MainWindow : public juce::DocumentWindow
    {
    public:
        MainWindow(juce::String name)
            : DocumentWindow(name, juce::Colours::black, DocumentWindow::allButtons)
        {
            setUsingNativeTitleBar(true);
            
            // Create the processor and editor
            auto processor = std::make_unique<BehaviorCoreProcessor>();
            auto* editor = processor->createEditor();
            setContentOwned(editor, true);
            
            setResizable(true, false);
            setFullScreen(true);
            setVisible(true);
        }

        void closeButtonPressed() override
        {
            JUCEApplication::getInstance()->systemRequestedQuit();
        }

    private:
        JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(MainWindow)
    };

private:
    std::unique_ptr<MainWindow> mainWindow;
};

START_JUCE_APPLICATION(ManifoldAndroidApp)
