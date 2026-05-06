#include "ImGuiHost.h"

#include "TextEditor.h"
#include "backends/imgui_impl_opengl3.h"
#include "imgui.h"

#include <algorithm>
#include <chrono>
#include <cfloat>
#include <functional>
#include <thread>

using namespace juce::gl;

namespace {
[[maybe_unused]] size_t traceThreadId() {
    return std::hash<std::thread::id>{}(std::this_thread::get_id());
}

void logMainImGuiHostEvent(const char* event, ImGuiHost* host, juce::OpenGLContext* context = nullptr) {
    juce::ignoreUnused(event, host, context);
}
}

ImGuiHost::ImGuiHost() {
    setOpaque(false);
    setWantsKeyboardFocus(true);
    setMouseClickGrabsKeyboardFocus(true);
    setFocusContainerType(juce::Component::FocusContainerType::focusContainer);

    textEditor_ = std::make_unique<TextEditor>();
    textEditor_->SetPalette(TextEditor::PaletteId::Mariana);
    textEditor_->SetShowLineNumbersEnabled(true);
    textEditor_->SetShowWhitespacesEnabled(false);
    textEditor_->SetAutoIndentEnabled(true);
    textEditor_->SetTabSize(4);
    textEditor_->SetLineSpacing(1.15f);

    openGLContext.setRenderer(this);
    openGLContext.setComponentPaintingEnabled(false);
#ifndef __ANDROID__
    // openGLContext.setPersistentAttachment(true); // Requires patched JUCE
#endif
    openGLContext.setContinuousRepainting(true);
    openGLContext.setSwapInterval(1);

    refreshDocumentStatsLocked();
}

ImGuiHost::~ImGuiHost() {
    openGLContext.detach();
}

ImGuiHost::StatsSnapshot ImGuiHost::getStatsSnapshot() const {
    StatsSnapshot snapshot;
    snapshot.contextReady = contextReady_.load(std::memory_order_relaxed);
    snapshot.testWindowVisible = isVisible();
    snapshot.wantCaptureMouse = wantCaptureMouse_.load(std::memory_order_relaxed);
    snapshot.wantCaptureKeyboard = wantCaptureKeyboard_.load(std::memory_order_relaxed);
    snapshot.documentLoaded = documentLoaded_.load(std::memory_order_relaxed);
    snapshot.documentDirty = documentDirty_.load(std::memory_order_relaxed);
    snapshot.frameCount = frameCount_.load(std::memory_order_relaxed);
    snapshot.lastRenderUs = lastRenderUs_.load(std::memory_order_relaxed);
    snapshot.lastVertexCount = lastVertexCount_.load(std::memory_order_relaxed);
    snapshot.lastIndexCount = lastIndexCount_.load(std::memory_order_relaxed);
    snapshot.buttonClicks = buttonClicks_.load(std::memory_order_relaxed);
    snapshot.documentLineCount = documentLineCount_.load(std::memory_order_relaxed);
    return snapshot;
}

ImGuiHost::ActionRequests ImGuiHost::consumeActionRequests() {
    ActionRequests requests;
    requests.save = requestSave_.exchange(false, std::memory_order_relaxed);
    requests.reload = requestReload_.exchange(false, std::memory_order_relaxed);
    requests.close = requestClose_.exchange(false, std::memory_order_relaxed);
    return requests;
}

ImGuiHost::DocumentIdentity ImGuiHost::getDocumentIdentity() const {
    std::lock_guard<std::recursive_mutex> lock(documentMutex_);

    DocumentIdentity identity;
    identity.path = documentFile_.getFullPathName().toStdString();
    identity.syncToken = appliedSyncToken_;
    identity.loaded = textEditor_ != nullptr && !identity.path.empty();
    return identity;
}

void ImGuiHost::configureDocument(const juce::File& file,
                                  const std::string& text,
                                  int64_t syncToken,
                                  bool readOnly) {
    std::lock_guard<std::recursive_mutex> lock(documentMutex_);

    documentFile_ = file;
    readOnly_ = readOnly;
    if (textEditor_ != nullptr) {
        textEditor_->SetReadOnlyEnabled(readOnly_);
    }

    const bool shouldReload = (appliedSyncToken_ != syncToken);
    if (shouldReload && textEditor_ != nullptr) {
        appliedSyncToken_ = syncToken;
        updateLanguageDefinitionForPathLocked(file);
        textEditor_->SetText(text);
        documentOriginalText_ = text;
    }

    if (textEditor_ != nullptr) {
        textEditor_->SetReadOnlyEnabled(readOnly_);
    }

    refreshDocumentStatsLocked();
}

void ImGuiHost::setRenderActive(bool active) {
    renderActive_.store(active, std::memory_order_relaxed);
    if (!active) {
        wantCaptureMouse_.store(false, std::memory_order_relaxed);
        wantCaptureKeyboard_.store(false, std::memory_order_relaxed);
    }
}

bool ImGuiHost::isRenderActive() const {
    return renderActive_.load(std::memory_order_relaxed);
}

std::string ImGuiHost::getCurrentText() const {
    std::lock_guard<std::recursive_mutex> lock(documentMutex_);
    if (textEditor_ == nullptr) {
        return {};
    }
    return textEditor_->GetText();
}

void ImGuiHost::paint(juce::Graphics& g) {
    juce::ignoreUnused(g);
}

void ImGuiHost::resized() {
    logMainImGuiHostEvent("resized", this, &openGLContext);
    releaseAllMouseButtons();
    syncModifierKeys(juce::ModifierKeys::getCurrentModifiersRealtime());
    queueCurrentMousePosition();
    attachContextIfNeeded();
}

void ImGuiHost::visibilityChanged() {
    logMainImGuiHostEvent("visibilityChanged", this, &openGLContext);
    if (!isVisible()) {
        releaseAllMouseButtons();
        releaseAllActiveKeys();
        syncModifierKeys(juce::ModifierKeys::noModifiers);
        queueFocus(false);
    }
    attachContextIfNeeded();
}

void ImGuiHost::setVisible(bool shouldBeVisible) {
    Component::setVisible(shouldBeVisible);
    if (shouldBeVisible) {
        attachContextIfNeeded();
    }
}

void ImGuiHost::mouseMove(const juce::MouseEvent& e) {
    queueMousePosition(e.position);
    syncModifierKeys(e.mods);
}

void ImGuiHost::mouseDrag(const juce::MouseEvent& e) {
    queueMousePosition(e.position);
    syncModifierKeys(e.mods);
}

void ImGuiHost::mouseDown(const juce::MouseEvent& e) {
    grabKeyboardFocus();
    queueMousePosition(e.position);
    syncModifierKeys(e.mods);
}

void ImGuiHost::mouseUp(const juce::MouseEvent& e) {
    queueMousePosition(e.position);
    syncModifierKeys(e.mods);
}

void ImGuiHost::mouseExit(const juce::MouseEvent& e) {
    juce::ignoreUnused(e);

    std::lock_guard<std::mutex> lock(inputMutex);
    manifold::ui::imgui::queueTextInputMouseExitIfIdle(pendingEvents, mouseButtons_);
}

void ImGuiHost::mouseWheelMove(const juce::MouseEvent& e, const juce::MouseWheelDetails& wheel) {
    queueMousePosition(e.position);
    syncModifierKeys(e.mods);

    std::lock_guard<std::mutex> lock(inputMutex);
    manifold::ui::imgui::queueTextInputMouseWheel(pendingEvents, wheel);
}

bool ImGuiHost::keyPressed(const juce::KeyPress& key) {
    syncModifierKeys(key.getModifiers());

    std::lock_guard<std::mutex> lock(inputMutex);
    manifold::ui::imgui::queueTextInputKeyPress(pendingEvents, activeKeyCodes_, key);
    return true;
}

bool ImGuiHost::keyStateChanged(bool isKeyDown) {
    juce::ignoreUnused(isKeyDown);
    syncModifierKeys(juce::ModifierKeys::getCurrentModifiersRealtime());
    releaseInactiveKeys();
    return true;
}

void ImGuiHost::focusGained(FocusChangeType cause) {
    juce::ignoreUnused(cause);
    queueFocus(true);
}

void ImGuiHost::focusLost(FocusChangeType cause) {
    juce::ignoreUnused(cause);
    queueFocus(false);
    releaseAllMouseButtons();
    releaseAllActiveKeys();
    syncModifierKeys(juce::ModifierKeys::noModifiers);
}

void ImGuiHost::newOpenGLContextCreated() {
    logMainImGuiHostEvent("newOpenGLContextCreated", this, &openGLContext);
    IMGUI_CHECKVERSION();
    auto* context = ImGui::CreateContext();
    imguiContext = context;
    ImGui::SetCurrentContext(context);

    auto& io = ImGui::GetIO();
    io.ConfigFlags |= ImGuiConfigFlags_NavEnableKeyboard;
    io.BackendPlatformName = "manifold_juce";

    ImGui::StyleColorsDark();
    auto& style = ImGui::GetStyle();
    style.WindowRounding = 0.0f;
    style.FrameRounding = 4.0f;
    style.GrabRounding = 4.0f;
    style.ScrollbarRounding = 4.0f;
    style.TabRounding = 4.0f;
    style.WindowBorderSize = 0.0f;
    style.WindowPadding = ImVec2(0.0f, 0.0f);

    ImGui_ImplOpenGL3_Init("#version 150");

    contextReady_.store(true, std::memory_order_relaxed);
    queueFocus(hasKeyboardFocus(true));
}

void ImGuiHost::renderOpenGL() {
    if (getWidth() <= 0 || getHeight() <= 0 || !isShowing()) {
        wantCaptureMouse_.store(false, std::memory_order_relaxed);
        wantCaptureKeyboard_.store(false, std::memory_order_relaxed);
        lastVertexCount_.store(0, std::memory_order_relaxed);
        lastIndexCount_.store(0, std::memory_order_relaxed);
        return;
    }

    auto* context = reinterpret_cast<ImGuiContext*>(imguiContext);
    if (context == nullptr) {
        return;
    }

    const auto start = std::chrono::steady_clock::now();
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
                case manifold::ui::imgui::TextInputHostEventType::MousePos:
                    io.AddMousePosEvent(event.x, event.y);
                    break;
                case manifold::ui::imgui::TextInputHostEventType::MouseButton:
                    io.AddMouseButtonEvent(event.button, event.down);
                    break;
                case manifold::ui::imgui::TextInputHostEventType::MouseWheel:
                    io.AddMouseWheelEvent(event.x, event.y);
                    break;
                case manifold::ui::imgui::TextInputHostEventType::Key:
                    io.AddKeyEvent(static_cast<ImGuiKey>(event.key), event.down);
                    break;
                case manifold::ui::imgui::TextInputHostEventType::Char:
                    io.AddInputCharacter(event.codepoint);
                    break;
                case manifold::ui::imgui::TextInputHostEventType::Focus:
                    io.AddFocusEvent(event.focused);
                    break;
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

    glViewport(0, 0, framebufferWidth, framebufferHeight);
    glDisable(GL_SCISSOR_TEST);

    if (!renderActive_.load(std::memory_order_relaxed)) {
        glClearColor(0.0f, 0.0f, 0.0f, 0.0f);
        glClear(GL_COLOR_BUFFER_BIT);
        wantCaptureMouse_.store(false, std::memory_order_relaxed);
        wantCaptureKeyboard_.store(false, std::memory_order_relaxed);
        lastVertexCount_.store(0, std::memory_order_relaxed);
        lastIndexCount_.store(0, std::memory_order_relaxed);
        lastRenderUs_.store(std::chrono::duration_cast<std::chrono::microseconds>(
                                 std::chrono::steady_clock::now() - start)
                                 .count(),
                             std::memory_order_relaxed);
        frameCount_.fetch_add(1, std::memory_order_relaxed);
        return;
    }

    glClearColor(0.07f, 0.09f, 0.13f, 0.96f);
    glClear(GL_COLOR_BUFFER_BIT);

    ImGui_ImplOpenGL3_NewFrame();
    ImGui::NewFrame();

    ImGui::SetNextWindowPos(ImVec2(0.0f, 0.0f), ImGuiCond_Always);
    ImGui::SetNextWindowSize(ImVec2(static_cast<float>(width), static_cast<float>(height)), ImGuiCond_Always);

    constexpr ImGuiWindowFlags windowFlags = ImGuiWindowFlags_NoDecoration
                                           | ImGuiWindowFlags_NoMove
                                           | ImGuiWindowFlags_NoResize
                                           | ImGuiWindowFlags_NoSavedSettings
                                           | ImGuiWindowFlags_NoBringToFrontOnFocus
                                           | ImGuiWindowFlags_NoBackground;

    ImGui::Begin("##ManifoldImGuiEditorHost", nullptr, windowFlags);

    {
        std::lock_guard<std::recursive_mutex> lock(documentMutex_);

        const bool windowFocused = ImGui::IsWindowFocused(ImGuiFocusedFlags_RootAndChildWindows);
        if (windowFocused && ImGui::Shortcut(ImGuiMod_Ctrl | ImGuiKey_S)) {
            requestSave_.store(true, std::memory_order_relaxed);
        }
        if (windowFocused && ImGui::Shortcut(ImGuiMod_Ctrl | ImGuiKey_R)) {
            requestReload_.store(true, std::memory_order_relaxed);
        }
        if (windowFocused && ImGui::Shortcut(ImGuiMod_Ctrl | ImGuiKey_W)) {
            requestClose_.store(true, std::memory_order_relaxed);
        }

        if (documentLoaded_.load(std::memory_order_relaxed) && textEditor_ != nullptr) {
            const ImVec2 contentSize = ImGui::GetContentRegionAvail();
            textEditor_->Render("##ManifoldCodeEditor", windowFocused, contentSize, false);
        } else {
            ImGui::Dummy(ImVec2(12.0f, 12.0f));
            ImGui::SetCursorPos(ImVec2(12.0f, 12.0f));
            ImGui::TextUnformatted("No script loaded.");
        }

        refreshDocumentStatsLocked();
    }

    ImGui::End();

    ImGui::Render();
    auto* drawData = ImGui::GetDrawData();
    ImGui_ImplOpenGL3_RenderDrawData(drawData);

    int64_t vertexCount = 0;
    int64_t indexCount = 0;
    if (drawData != nullptr) {
        for (int listIndex = 0; listIndex < drawData->CmdListsCount; ++listIndex) {
            const auto* cmdList = drawData->CmdLists[listIndex];
            vertexCount += cmdList->VtxBuffer.Size;
            indexCount += cmdList->IdxBuffer.Size;
        }
    }

    wantCaptureMouse_.store(io.WantCaptureMouse, std::memory_order_relaxed);
    wantCaptureKeyboard_.store(io.WantCaptureKeyboard, std::memory_order_relaxed);
    frameCount_.fetch_add(1, std::memory_order_relaxed);
    lastVertexCount_.store(vertexCount, std::memory_order_relaxed);
    lastIndexCount_.store(indexCount, std::memory_order_relaxed);
    lastRenderUs_.store(std::chrono::duration_cast<std::chrono::microseconds>(
                             std::chrono::steady_clock::now() - start)
                             .count(),
                        std::memory_order_relaxed);
}

void ImGuiHost::openGLContextClosing() {
    logMainImGuiHostEvent("openGLContextClosing", this, &openGLContext);
    auto* context = reinterpret_cast<ImGuiContext*>(imguiContext);
    if (context != nullptr) {
        ImGui::SetCurrentContext(context);
        ImGui_ImplOpenGL3_Shutdown();
        ImGui::DestroyContext(context);
        imguiContext = nullptr;
    }

    contextReady_.store(false, std::memory_order_relaxed);
    wantCaptureMouse_.store(false, std::memory_order_relaxed);
    wantCaptureKeyboard_.store(false, std::memory_order_relaxed);
}

void ImGuiHost::attachContextIfNeeded() {
    if (openGLContext.isAttached()) {
        return;
    }

    if (!isShowing() || getWidth() <= 0 || getHeight() <= 0) {
        return;
    }

    logMainImGuiHostEvent("attachContext", this, &openGLContext);
    openGLContext.attachTo(*this);
}

void ImGuiHost::queueMousePosition(juce::Point<float> position) {
    std::lock_guard<std::mutex> lock(inputMutex);
    manifold::ui::imgui::queueTextInputMousePosition(pendingEvents, position);
}

void ImGuiHost::queueCurrentMousePosition() {
    if (!isShowing()) {
        return;
    }

    const auto screenPos = juce::Desktop::getInstance().getMainMouseSource().getScreenPosition();
    const juce::Point<int> screenPosInt(juce::roundToInt(screenPos.x), juce::roundToInt(screenPos.y));
    const auto localPos = getLocalPoint(nullptr, screenPosInt).toFloat();
    queueMousePosition(localPos);
}

void ImGuiHost::syncMouseButtons(const juce::ModifierKeys& mods) {
    std::lock_guard<std::mutex> lock(inputMutex);
    manifold::ui::imgui::syncTextInputMouseButtons(pendingEvents, mouseButtons_, mods);
}

void ImGuiHost::syncModifierKeys(const juce::ModifierKeys& mods) {
    std::lock_guard<std::mutex> lock(inputMutex);
    manifold::ui::imgui::syncTextInputModifierKeys(pendingEvents, modifierKeys_, mods);
}

void ImGuiHost::releaseAllMouseButtons() {
    std::lock_guard<std::mutex> lock(inputMutex);
    manifold::ui::imgui::releaseAllTextInputMouseButtons(pendingEvents, mouseButtons_);
}

void ImGuiHost::releaseInactiveKeys() {
    std::lock_guard<std::mutex> lock(inputMutex);
    manifold::ui::imgui::releaseInactiveTextInputKeys(pendingEvents, activeKeyCodes_);
}

void ImGuiHost::releaseAllActiveKeys() {
    std::lock_guard<std::mutex> lock(inputMutex);
    manifold::ui::imgui::releaseAllTextInputKeys(pendingEvents, activeKeyCodes_);
}

void ImGuiHost::queueFocus(bool focused) {
    std::lock_guard<std::mutex> lock(inputMutex);
    manifold::ui::imgui::queueTextInputFocus(pendingEvents, focused);
}

void ImGuiHost::refreshDocumentStatsLocked() {
    const bool loaded = textEditor_ != nullptr && documentFile_.getFullPathName().isNotEmpty();
    documentLoaded_.store(loaded, std::memory_order_relaxed);

    if (!loaded || textEditor_ == nullptr) {
        documentDirty_.store(false, std::memory_order_relaxed);
        documentLineCount_.store(0, std::memory_order_relaxed);
        return;
    }

    const auto currentText = textEditor_->GetText();
    documentDirty_.store(currentText != documentOriginalText_, std::memory_order_relaxed);
    documentLineCount_.store(textEditor_->GetLineCount(), std::memory_order_relaxed);
}

void ImGuiHost::updateLanguageDefinitionForPathLocked(const juce::File& file) {
    if (textEditor_ == nullptr) {
        return;
    }

    const auto language = manifold::ui::imgui::resolveLanguageDefinitionForFile(file);
    switch (language) {
        case manifold::ui::imgui::TextInputHostLanguageDefinition::Cpp:
            textEditor_->SetLanguageDefinition(TextEditor::LanguageDefinitionId::Cpp);
            break;
        case manifold::ui::imgui::TextInputHostLanguageDefinition::C:
            textEditor_->SetLanguageDefinition(TextEditor::LanguageDefinitionId::C);
            break;
        case manifold::ui::imgui::TextInputHostLanguageDefinition::Cs:
            textEditor_->SetLanguageDefinition(TextEditor::LanguageDefinitionId::Cs);
            break;
        case manifold::ui::imgui::TextInputHostLanguageDefinition::Python:
            textEditor_->SetLanguageDefinition(TextEditor::LanguageDefinitionId::Python);
            break;
        case manifold::ui::imgui::TextInputHostLanguageDefinition::Lua:
            textEditor_->SetLanguageDefinition(TextEditor::LanguageDefinitionId::Lua);
            break;
        case manifold::ui::imgui::TextInputHostLanguageDefinition::Json:
            textEditor_->SetLanguageDefinition(TextEditor::LanguageDefinitionId::Json);
            break;
        case manifold::ui::imgui::TextInputHostLanguageDefinition::Sql:
            textEditor_->SetLanguageDefinition(TextEditor::LanguageDefinitionId::Sql);
            break;
        case manifold::ui::imgui::TextInputHostLanguageDefinition::Glsl:
            textEditor_->SetLanguageDefinition(TextEditor::LanguageDefinitionId::Glsl);
            break;
        case manifold::ui::imgui::TextInputHostLanguageDefinition::Hlsl:
            textEditor_->SetLanguageDefinition(TextEditor::LanguageDefinitionId::Hlsl);
            break;
        case manifold::ui::imgui::TextInputHostLanguageDefinition::None:
        default:
            textEditor_->SetLanguageDefinition(TextEditor::LanguageDefinitionId::None);
            break;
    }
}

int ImGuiHost::translateKeyCodeToImGuiKey(int keyCode) {
    return manifold::ui::imgui::translateTextInputKeyCodeToImGuiKey(keyCode);
}
