#include "ImGuiInspectorHost.h"

#include "Theme.h"
#include "ToolComponents.h"
#include "WidgetPrimitives.h"
#include "TextEditor.h"
#include "InspectorHostStateSupport.h"
#include "backends/imgui_impl_opengl3.h"
#include "imgui.h"
#include "imgui_internal.h"

#include <algorithm>
#include <cmath>
#include <functional>
#include <thread>

using namespace juce::gl;

namespace {
[[maybe_unused]] size_t traceThreadId() {
    return std::hash<std::thread::id>{}(std::this_thread::get_id());
}

void logInspectorHostEvent(const char* event, ImGuiInspectorHost* host, juce::OpenGLContext* context = nullptr) {
    juce::ignoreUnused(event, host, context);
}

void logInspectorNextWindowLeakIfNeeded(ImGuiInspectorHost* host, int width, int height) {
    juce::ignoreUnused(host, width, height);
}
}

ImGuiInspectorHost::ImGuiInspectorHost() {
    setOpaque(true);
    setWantsKeyboardFocus(true);
    setMouseClickGrabsKeyboardFocus(true);

    inlineTextEditor_ = std::make_unique<TextEditor>();
    inlineTextEditor_->SetPalette(TextEditor::PaletteId::Mariana);
    inlineTextEditor_->SetShowLineNumbersEnabled(true);
    inlineTextEditor_->SetShowWhitespacesEnabled(false);
    inlineTextEditor_->SetAutoIndentEnabled(true);
    inlineTextEditor_->SetTabSize(4);
    inlineTextEditor_->SetLineSpacing(1.15f);
    inlineTextEditor_->SetReadOnlyEnabled(true);

    openGLContext.setRenderer(this);
    openGLContext.setComponentPaintingEnabled(false);
#ifndef __ANDROID__
    // openGLContext.setPersistentAttachment(true); // Requires patched JUCE
#endif
    openGLContext.setContinuousRepainting(true);
    openGLContext.setSwapInterval(1);
}

ImGuiInspectorHost::~ImGuiInspectorHost() {
    openGLContext.detach();
}

void ImGuiInspectorHost::configureData(const BoundsInfo& bounds,
                                      const std::vector<InspectorRow>& rows,
                                      const ActiveProperty& activeProperty) {
    std::lock_guard<std::mutex> lock(dataMutex_);
    mode_ = Mode::HierarchyProperties;
    bounds_ = bounds;
    rows_ = rows;
    activeProperty_ = activeProperty;

    const auto nextTextState = manifold::ui::imgui::syncInspectorTextEditState(
        activeProperty_,
        { textEditPath_, textEditLastSourceValue_, textEditBuffer_ });
    textEditPath_ = nextTextState.path;
    textEditLastSourceValue_ = nextTextState.lastSourceValue;
    textEditBuffer_ = nextTextState.buffer;
}

void ImGuiInspectorHost::configureScriptData(const ScriptInspectorData& scriptData) {
    std::lock_guard<std::mutex> lock(dataMutex_);
    mode_ = Mode::ScriptInspector;
    scriptData_ = scriptData;

    const auto update = manifold::ui::imgui::resolveInspectorInlineDocumentUpdate(
        scriptData_,
        inlineDocumentFile_.getFullPathName().toStdString(),
        inlineAppliedSyncToken_);

    if (inlineTextEditor_ == nullptr || update.clearState) {
        inlineDocumentFile_ = juce::File();
        inlineAppliedSyncToken_ = -1;
        return;
    }

    if (update.setReadOnly) {
        inlineTextEditor_->SetReadOnlyEnabled(scriptData_.inlineReadOnly);
    }
    if (update.reloadDocument) {
        inlineDocumentFile_ = juce::File(update.nextPath);
        inlineAppliedSyncToken_ = update.nextSyncToken;
        updateInlineLanguageDefinitionForPathLocked(inlineDocumentFile_);
        inlineTextEditor_->SetText(scriptData_.text);
    }
}

ImGuiInspectorHost::ActionRequests ImGuiInspectorHost::consumeActionRequests() {
    ActionRequests requests;
    requests.selectRowIndex = requestSelectRowIndex_.exchange(-1, std::memory_order_relaxed);
    requests.setBoundsX = requestSetBoundsX_.exchange(false, std::memory_order_relaxed);
    requests.setBoundsY = requestSetBoundsY_.exchange(false, std::memory_order_relaxed);
    requests.setBoundsW = requestSetBoundsW_.exchange(false, std::memory_order_relaxed);
    requests.setBoundsH = requestSetBoundsH_.exchange(false, std::memory_order_relaxed);
    requests.boundsX = requestBoundsX_.load(std::memory_order_relaxed);
    requests.boundsY = requestBoundsY_.load(std::memory_order_relaxed);
    requests.boundsW = requestBoundsW_.load(std::memory_order_relaxed);
    requests.boundsH = requestBoundsH_.load(std::memory_order_relaxed);
    requests.applyNumber = requestApplyNumber_.exchange(false, std::memory_order_relaxed);
    requests.numberValue = requestNumberValue_.load(std::memory_order_relaxed);
    requests.applyBool = requestApplyBool_.exchange(false, std::memory_order_relaxed);
    requests.boolValue = requestBoolValue_.load(std::memory_order_relaxed);
    requests.applyColor = requestApplyColor_.exchange(false, std::memory_order_relaxed);
    requests.colorValue = requestColorValue_.load(std::memory_order_relaxed);
    requests.applyEnumIndex = requestApplyEnumIndex_.exchange(-1, std::memory_order_relaxed);
    requests.applyText = requestApplyText_.exchange(false, std::memory_order_relaxed);
    if (requests.applyText) {
        std::lock_guard<std::mutex> lock(textRequestMutex_);
        requests.textValue = requestTextValue_;
    }

    {
        std::lock_guard<std::mutex> lock(scriptRequestMutex_);
        requests.runPreview = requestRunPreview_;
        requests.stopPreview = requestStopPreview_;
        requests.setEditorCollapsed = requestSetEditorCollapsed_;
        requests.editorCollapsed = requestEditorCollapsed_;
        requests.setGraphCollapsed = requestSetGraphCollapsed_;
        requests.graphCollapsed = requestGraphCollapsed_;
        requests.setGraphPan = requestSetGraphPan_;
        requests.graphPanX = requestGraphPanX_;
        requests.graphPanY = requestGraphPanY_;
        requests.applyRuntimeParam = requestApplyRuntimeParam_;
        requests.runtimeParamEndpointPath = requestRuntimeParamEndpointPath_;
        requests.runtimeParamValue = requestRuntimeParamValue_;

        requestRunPreview_ = false;
        requestStopPreview_ = false;
        requestSetEditorCollapsed_ = false;
        requestSetGraphCollapsed_ = false;
        requestSetGraphPan_ = false;
        requestApplyRuntimeParam_ = false;
        requestRuntimeParamEndpointPath_.clear();
        requestRuntimeParamValue_ = 0.0;
    }

    return requests;
}

void ImGuiInspectorHost::paint(juce::Graphics& g) {
    juce::ignoreUnused(g);
}

void ImGuiInspectorHost::resized() {
    logInspectorHostEvent("resized", this, &openGLContext);
    releaseAllMouseButtons();
    syncModifierKeys(juce::ModifierKeys::getCurrentModifiersRealtime());
    queueCurrentMousePosition();
    attachContextIfNeeded();
}

void ImGuiInspectorHost::visibilityChanged() {
    logInspectorHostEvent("visibilityChanged", this, &openGLContext);
    if (!isVisible()) {
        releaseAllMouseButtons();
        releaseAllActiveKeys();
        syncModifierKeys(juce::ModifierKeys::noModifiers);
        queueFocus(false);
    }
    attachContextIfNeeded();
}

void ImGuiInspectorHost::setVisible(bool shouldBeVisible) {
    Component::setVisible(shouldBeVisible);
    if (shouldBeVisible) {
        attachContextIfNeeded();
    }
}

void ImGuiInspectorHost::mouseMove(const juce::MouseEvent& e) {
    queueMousePosition(e.position);
    syncModifierKeys(e.mods);
}

void ImGuiInspectorHost::mouseDrag(const juce::MouseEvent& e) {
    queueMousePosition(e.position);
    syncModifierKeys(e.mods);
}

void ImGuiInspectorHost::mouseDown(const juce::MouseEvent& e) {
    grabKeyboardFocus();
    queueMousePosition(e.position);
    syncModifierKeys(e.mods);
}

void ImGuiInspectorHost::mouseUp(const juce::MouseEvent& e) {
    queueMousePosition(e.position);
    syncModifierKeys(e.mods);
}

void ImGuiInspectorHost::mouseExit(const juce::MouseEvent& e) {
    juce::ignoreUnused(e);

    std::lock_guard<std::mutex> lock(inputMutex);
    manifold::ui::imgui::queueTextInputMouseExitIfIdle(pendingEvents, mouseButtons_);
}

void ImGuiInspectorHost::mouseWheelMove(const juce::MouseEvent& e, const juce::MouseWheelDetails& wheel) {
    queueMousePosition(e.position);
    syncModifierKeys(e.mods);

    std::lock_guard<std::mutex> lock(inputMutex);
    manifold::ui::imgui::queueTextInputMouseWheel(pendingEvents, wheel);
}

bool ImGuiInspectorHost::keyPressed(const juce::KeyPress& key) {
    syncModifierKeys(key.getModifiers());

    std::lock_guard<std::mutex> lock(inputMutex);
    manifold::ui::imgui::queueTextInputKeyPress(pendingEvents, activeKeyCodes_, key);
    return true;
}

bool ImGuiInspectorHost::keyStateChanged(bool isKeyDown) {
    juce::ignoreUnused(isKeyDown);
    syncModifierKeys(juce::ModifierKeys::getCurrentModifiersRealtime());
    releaseInactiveKeys();
    return true;
}

void ImGuiInspectorHost::focusGained(FocusChangeType cause) {
    juce::ignoreUnused(cause);
    queueFocus(true);
}

void ImGuiInspectorHost::focusLost(FocusChangeType cause) {
    juce::ignoreUnused(cause);
    queueFocus(false);
    releaseAllMouseButtons();
    releaseAllActiveKeys();
    syncModifierKeys(juce::ModifierKeys::noModifiers);
}

void ImGuiInspectorHost::newOpenGLContextCreated() {
    logInspectorHostEvent("newOpenGLContextCreated", this, &openGLContext);
    IMGUI_CHECKVERSION();
    auto* context = ImGui::CreateContext();
    imguiContext = context;
    ImGui::SetCurrentContext(context);

    auto& io = ImGui::GetIO();
    io.ConfigFlags |= ImGuiConfigFlags_NavEnableKeyboard;
    io.BackendPlatformName = "manifold_juce_inspector";

    manifold::ui::imgui::applyToolTheme();

    ImGui_ImplOpenGL3_Init("#version 150");
    queueFocus(hasKeyboardFocus(true));
}

void ImGuiInspectorHost::renderOpenGL() {
    if (getWidth() <= 0 || getHeight() <= 0 || !isShowing()) {
        return;
    }

    auto* context = reinterpret_cast<ImGuiContext*>(imguiContext);
    if (context == nullptr) {
        return;
    }

    ImGui::SetCurrentContext(context);

    auto& io = ImGui::GetIO();
    const auto scale = static_cast<float>(openGLContext.getRenderingScale());
    const auto width = std::max(1, getWidth());
    const auto height = std::max(1, getHeight());
    const auto framebufferWidth = std::max(1, juce::roundToInt(scale * static_cast<float>(width)));
    const auto framebufferHeight = std::max(1, juce::roundToInt(scale * static_cast<float>(height)));

    io.DisplaySize = ImVec2(static_cast<float>(width), static_cast<float>(height));
    io.DisplayFramebufferScale = ImVec2(scale, scale);

    {
        std::lock_guard<std::mutex> lock(inputMutex);
        for (const auto& event : pendingEvents) {
            switch (event.type) {
                case manifold::ui::imgui::TextInputHostEventType::MousePos: io.AddMousePosEvent(event.x, event.y); break;
                case manifold::ui::imgui::TextInputHostEventType::MouseButton: io.AddMouseButtonEvent(event.button, event.down); break;
                case manifold::ui::imgui::TextInputHostEventType::MouseWheel: io.AddMouseWheelEvent(event.x, event.y); break;
                case manifold::ui::imgui::TextInputHostEventType::Key: io.AddKeyEvent(static_cast<ImGuiKey>(event.key), event.down); break;
                case manifold::ui::imgui::TextInputHostEventType::Char: io.AddInputCharacter(event.codepoint); break;
                case manifold::ui::imgui::TextInputHostEventType::Focus: io.AddFocusEvent(event.focused); break;
            }
        }
        pendingEvents.clear();
    }

    syncMouseButtons(juce::ModifierKeys::getCurrentModifiersRealtime());

    {
        std::lock_guard<std::mutex> lock(inputMutex);
        for (const auto& event : pendingEvents) {
            if (event.type == manifold::ui::imgui::TextInputHostEventType::MouseButton) {
                io.AddMouseButtonEvent(event.button, event.down);
            }
        }
        pendingEvents.clear();
    }

    Mode mode;
    BoundsInfo bounds;
    std::vector<InspectorRow> rows;
    ActiveProperty activeProperty;
    ScriptInspectorData scriptData;
    std::string textBuffer;
    {
        std::lock_guard<std::mutex> lock(dataMutex_);
        mode = mode_;
        bounds = bounds_;
        rows = rows_;
        activeProperty = activeProperty_;
        scriptData = scriptData_;
        textBuffer = textEditBuffer_;
    }

    const auto& theme = manifold::ui::imgui::toolTheme();

    glViewport(0, 0, framebufferWidth, framebufferHeight);
    glDisable(GL_SCISSOR_TEST);
    glClearColor(theme.panelBg.x, theme.panelBg.y, theme.panelBg.z, theme.panelBg.w);
    glClear(GL_COLOR_BUFFER_BIT);

    ImGui_ImplOpenGL3_NewFrame();
    ImGui::NewFrame();

    logInspectorNextWindowLeakIfNeeded(this, width, height);
    manifold::ui::imgui::beginFullWindow("##ManifoldInspectorHost", width, height);

    const auto queueRuntimeParamRequest = [&](const RuntimeParam& param, double value) {
        std::lock_guard<std::mutex> lock(scriptRequestMutex_);
        requestApplyRuntimeParam_ = true;
        requestRuntimeParamEndpointPath_ = param.endpointPath;
        requestRuntimeParamValue_ = value;
    };

    if (mode == Mode::HierarchyProperties) {
        if (bounds.enabled) {
            manifold::ui::imgui::drawSectionHeader("Bounds");
            ImGui::PushItemWidth((ImGui::GetContentRegionAvail().x - 8.0f) * 0.5f);
            int x = bounds.x;
            int y = bounds.y;
            int w = bounds.w;
            int h = bounds.h;
            if (ImGui::InputInt("X", &x)) {
                requestBoundsX_.store(x, std::memory_order_relaxed);
                requestSetBoundsX_.store(true, std::memory_order_relaxed);
            }
            ImGui::SameLine();
            if (ImGui::InputInt("Y", &y)) {
                requestBoundsY_.store(y, std::memory_order_relaxed);
                requestSetBoundsY_.store(true, std::memory_order_relaxed);
            }
            if (ImGui::InputInt("W", &w)) {
                requestBoundsW_.store(std::max(1, w), std::memory_order_relaxed);
                requestSetBoundsW_.store(true, std::memory_order_relaxed);
            }
            ImGui::SameLine();
            if (ImGui::InputInt("H", &h)) {
                requestBoundsH_.store(std::max(1, h), std::memory_order_relaxed);
                requestSetBoundsH_.store(true, std::memory_order_relaxed);
            }
            ImGui::PopItemWidth();
        }

        manifold::ui::imgui::drawSectionHeader("Selected Value");
        manifold::ui::imgui::PropertyEditorCallbacks propertyCallbacks;
        propertyCallbacks.onApplyNumber = [this](double value) {
            requestNumberValue_.store(value, std::memory_order_relaxed);
            requestApplyNumber_.store(true, std::memory_order_relaxed);
        };
        propertyCallbacks.onApplyBool = [this](bool value) {
            requestBoolValue_.store(value, std::memory_order_relaxed);
            requestApplyBool_.store(true, std::memory_order_relaxed);
        };
        propertyCallbacks.onApplyText = [this](const std::string& value) {
            {
                std::lock_guard<std::mutex> lock(dataMutex_);
                textEditBuffer_ = value;
            }
            {
                std::lock_guard<std::mutex> lock(textRequestMutex_);
                requestTextValue_ = value;
            }
            requestApplyText_.store(true, std::memory_order_relaxed);
        };
        propertyCallbacks.onApplyColor = [this](std::uint32_t value) {
            requestColorValue_.store(value, std::memory_order_relaxed);
            requestApplyColor_.store(true, std::memory_order_relaxed);
        };
        propertyCallbacks.onApplyEnumIndex = [this](int value) {
            requestApplyEnumIndex_.store(value, std::memory_order_relaxed);
        };
        manifold::ui::imgui::drawPropertyEditor(activeProperty, textBuffer, propertyCallbacks);

        manifold::ui::imgui::drawSectionHeader("Properties");
        manifold::ui::imgui::drawInspectorRowsPanel(
            rows,
            [this](int rowIndex) {
                requestSelectRowIndex_.store(rowIndex, std::memory_order_relaxed);
            });
    } else {
        if (!scriptData.hasSelection || scriptData.path.empty()) {
            manifold::ui::imgui::drawEmptyState("Script Inspector",
                                                "Select a script to inspect. Single-click: inspect | Double-click: open editor");
        } else {
            manifold::ui::imgui::drawSectionHeader("Script");
            manifold::ui::imgui::drawScriptInspectorInfo(scriptData);

            manifold::ui::imgui::ScriptInspectorCallbacks scriptCallbacks;
            scriptCallbacks.onRunPreview = [this]() {
                std::lock_guard<std::mutex> lock(scriptRequestMutex_);
                requestRunPreview_ = true;
            };
            scriptCallbacks.onStopPreview = [this]() {
                std::lock_guard<std::mutex> lock(scriptRequestMutex_);
                requestStopPreview_ = true;
            };
            scriptCallbacks.onSetEditorCollapsed = [this](bool collapsed) {
                std::lock_guard<std::mutex> lock(scriptRequestMutex_);
                requestSetEditorCollapsed_ = true;
                requestEditorCollapsed_ = collapsed;
            };
            scriptCallbacks.onSetGraphCollapsed = [this](bool collapsed) {
                std::lock_guard<std::mutex> lock(scriptRequestMutex_);
                requestSetGraphCollapsed_ = true;
                requestGraphCollapsed_ = collapsed;
            };
            scriptCallbacks.onSetGraphPan = [this](int panX, int panY) {
                std::lock_guard<std::mutex> lock(scriptRequestMutex_);
                requestSetGraphPan_ = true;
                requestGraphPanX_ = panX;
                requestGraphPanY_ = panY;
            };
            scriptCallbacks.onApplyRuntimeParam = [queueRuntimeParamRequest](const RuntimeParam& param, double value) {
                queueRuntimeParamRequest(param, value);
            };

            manifold::ui::imgui::drawScriptInspectorDspControls(scriptData, scriptCallbacks);

            ImGui::SetNextItemOpen(!scriptData.editorCollapsed, ImGuiCond_Always);
            const bool editorOpen = ImGui::CollapsingHeader("Inline Script", ImGuiTreeNodeFlags_DefaultOpen);
            if (editorOpen != !scriptData.editorCollapsed && scriptCallbacks.onSetEditorCollapsed) {
                scriptCallbacks.onSetEditorCollapsed(!editorOpen);
            }
            if (editorOpen) {
                float editorHeight = 160.0f;
                if (scriptData.kind == "dsp" && !scriptData.graphCollapsed) {
                    editorHeight = std::clamp(ImGui::GetContentRegionAvail().y - 180.0f, 80.0f, 180.0f);
                } else {
                    editorHeight = std::clamp(ImGui::GetContentRegionAvail().y - 24.0f, 80.0f, 180.0f);
                }

                std::lock_guard<std::mutex> lock(dataMutex_);
                if (inlineTextEditor_ != nullptr) {
                    const bool windowFocused = ImGui::IsWindowFocused(ImGuiFocusedFlags_RootAndChildWindows);
                    inlineTextEditor_->Render("##ManifoldInlineCodeEditor", windowFocused,
                                              ImVec2(std::max(1.0f, ImGui::GetContentRegionAvail().x), editorHeight),
                                              true);
                } else {
                    ImGui::BeginChild("##InlineScriptMissing", ImVec2(0.0f, editorHeight), true,
                                      ImGuiWindowFlags_NoScrollbar | ImGuiWindowFlags_NoScrollWithMouse);
                    ImGui::TextDisabled("Inline editor unavailable");
                    ImGui::EndChild();
                }
            }

            manifold::ui::imgui::drawDspGraphPanel(scriptData, scriptCallbacks);
        }
    }

    ImGui::End();

    ImGui::Render();
    ImGui_ImplOpenGL3_RenderDrawData(ImGui::GetDrawData());
}

void ImGuiInspectorHost::openGLContextClosing() {
    logInspectorHostEvent("openGLContextClosing", this, &openGLContext);
    auto* context = reinterpret_cast<ImGuiContext*>(imguiContext);
    if (context != nullptr) {
        ImGui::SetCurrentContext(context);
        ImGui_ImplOpenGL3_Shutdown();
        ImGui::DestroyContext(context);
        imguiContext = nullptr;
    }
}

void ImGuiInspectorHost::attachContextIfNeeded() {
    if (openGLContext.isAttached()) {
        return;
    }
    if (!isShowing() || getWidth() <= 0 || getHeight() <= 0) {
        return;
    }
    logInspectorHostEvent("attachContext", this, &openGLContext);
    openGLContext.attachTo(*this);
}

void ImGuiInspectorHost::queueMousePosition(juce::Point<float> position) {
    std::lock_guard<std::mutex> lock(inputMutex);
    manifold::ui::imgui::queueTextInputMousePosition(pendingEvents, position);
}

void ImGuiInspectorHost::queueCurrentMousePosition() {
    if (!isShowing()) {
        return;
    }

    const auto screenPos = juce::Desktop::getInstance().getMainMouseSource().getScreenPosition();
    const juce::Point<int> screenPosInt(juce::roundToInt(screenPos.x), juce::roundToInt(screenPos.y));
    const auto localPos = getLocalPoint(nullptr, screenPosInt).toFloat();
    queueMousePosition(localPos);
}

void ImGuiInspectorHost::syncMouseButtons(const juce::ModifierKeys& mods) {
    std::lock_guard<std::mutex> lock(inputMutex);
    manifold::ui::imgui::syncTextInputMouseButtons(pendingEvents, mouseButtons_, mods);
}

void ImGuiInspectorHost::syncModifierKeys(const juce::ModifierKeys& mods) {
    std::lock_guard<std::mutex> lock(inputMutex);
    manifold::ui::imgui::syncTextInputModifierKeys(pendingEvents, modifierKeys_, mods);
}

void ImGuiInspectorHost::releaseAllMouseButtons() {
    std::lock_guard<std::mutex> lock(inputMutex);
    manifold::ui::imgui::releaseAllTextInputMouseButtons(pendingEvents, mouseButtons_);
}

void ImGuiInspectorHost::releaseInactiveKeys() {
    std::lock_guard<std::mutex> lock(inputMutex);
    manifold::ui::imgui::releaseInactiveTextInputKeys(pendingEvents, activeKeyCodes_);
}

void ImGuiInspectorHost::releaseAllActiveKeys() {
    std::lock_guard<std::mutex> lock(inputMutex);
    manifold::ui::imgui::releaseAllTextInputKeys(pendingEvents, activeKeyCodes_);
}

void ImGuiInspectorHost::queueFocus(bool focused) {
    std::lock_guard<std::mutex> lock(inputMutex);
    manifold::ui::imgui::queueTextInputFocus(pendingEvents, focused);
}

void ImGuiInspectorHost::updateInlineLanguageDefinitionForPathLocked(const juce::File& file) {
    if (inlineTextEditor_ == nullptr) {
        return;
    }

    const auto language = manifold::ui::imgui::resolveLanguageDefinitionForFile(file);
    switch (language) {
        case manifold::ui::imgui::TextInputHostLanguageDefinition::Cpp:
            inlineTextEditor_->SetLanguageDefinition(TextEditor::LanguageDefinitionId::Cpp);
            break;
        case manifold::ui::imgui::TextInputHostLanguageDefinition::C:
            inlineTextEditor_->SetLanguageDefinition(TextEditor::LanguageDefinitionId::C);
            break;
        case manifold::ui::imgui::TextInputHostLanguageDefinition::Cs:
            inlineTextEditor_->SetLanguageDefinition(TextEditor::LanguageDefinitionId::Cs);
            break;
        case manifold::ui::imgui::TextInputHostLanguageDefinition::Python:
            inlineTextEditor_->SetLanguageDefinition(TextEditor::LanguageDefinitionId::Python);
            break;
        case manifold::ui::imgui::TextInputHostLanguageDefinition::Lua:
            inlineTextEditor_->SetLanguageDefinition(TextEditor::LanguageDefinitionId::Lua);
            break;
        case manifold::ui::imgui::TextInputHostLanguageDefinition::Json:
            inlineTextEditor_->SetLanguageDefinition(TextEditor::LanguageDefinitionId::Json);
            break;
        case manifold::ui::imgui::TextInputHostLanguageDefinition::Sql:
            inlineTextEditor_->SetLanguageDefinition(TextEditor::LanguageDefinitionId::Sql);
            break;
        case manifold::ui::imgui::TextInputHostLanguageDefinition::Glsl:
            inlineTextEditor_->SetLanguageDefinition(TextEditor::LanguageDefinitionId::Glsl);
            break;
        case manifold::ui::imgui::TextInputHostLanguageDefinition::Hlsl:
            inlineTextEditor_->SetLanguageDefinition(TextEditor::LanguageDefinitionId::Hlsl);
            break;
        case manifold::ui::imgui::TextInputHostLanguageDefinition::None:
        default:
            inlineTextEditor_->SetLanguageDefinition(TextEditor::LanguageDefinitionId::None);
            break;
    }
}

int ImGuiInspectorHost::translateKeyCodeToImGuiKey(int keyCode) {
    return manifold::ui::imgui::translateTextInputKeyCodeToImGuiKey(keyCode);
}
