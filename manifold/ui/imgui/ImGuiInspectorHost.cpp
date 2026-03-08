#include "ImGuiInspectorHost.h"

#include "backends/imgui_impl_opengl3.h"
#include "imgui.h"
#include "misc/cpp/imgui_stdlib.h"

#include <algorithm>
#include <cmath>

using namespace juce::gl;

namespace {
static ImVec4 argbToImVec4(std::uint32_t argb) {
    const float a = static_cast<float>((argb >> 24) & 0xffu) / 255.0f;
    const float r = static_cast<float>((argb >> 16) & 0xffu) / 255.0f;
    const float g = static_cast<float>((argb >> 8) & 0xffu) / 255.0f;
    const float b = static_cast<float>(argb & 0xffu) / 255.0f;
    return ImVec4(r, g, b, a);
}

static std::uint32_t imVec4ToArgb(const ImVec4& rgba) {
    const auto clampByte = [](float v) {
        return static_cast<std::uint32_t>(std::clamp(v, 0.0f, 1.0f) * 255.0f + 0.5f);
    };
    const std::uint32_t r = clampByte(rgba.x);
    const std::uint32_t g = clampByte(rgba.y);
    const std::uint32_t b = clampByte(rgba.z);
    const std::uint32_t a = clampByte(rgba.w);
    return (a << 24) | (r << 16) | (g << 8) | b;
}

static double resolveRuntimeStep(const ImGuiInspectorHost::RuntimeParam& param) {
    if (param.stepValue > 0.0) {
        return param.stepValue;
    }

    if (param.hasMin && param.hasMax) {
        const auto span = std::abs(param.maxValue - param.minValue);
        if (span <= 2.0) {
            return 0.01;
        }
        if (span <= 20.0) {
            return 0.1;
        }
        return std::max(0.01, span / 100.0);
    }

    return std::max(0.01, std::abs(param.value) * 0.05);
}

static juce::Rectangle<int> toLocalRect(const ImVec2& min, const ImVec2& size) {
    return {
        juce::roundToInt(min.x),
        juce::roundToInt(min.y),
        std::max(1, juce::roundToInt(size.x)),
        std::max(1, juce::roundToInt(size.y)),
    };
}
}

ImGuiInspectorHost::ImGuiInspectorHost() {
    setOpaque(true);
    setWantsKeyboardFocus(true);
    setMouseClickGrabsKeyboardFocus(true);

    openGLContext.setRenderer(this);
    openGLContext.setComponentPaintingEnabled(false);
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

    if (!activeProperty_.valid) {
        textEditPath_.clear();
        textEditLastSourceValue_.clear();
        textEditBuffer_.clear();
        return;
    }

    if (activeProperty_.editorType == "text") {
        if (textEditPath_ != activeProperty_.path || textEditLastSourceValue_ != activeProperty_.textValue) {
            textEditPath_ = activeProperty_.path;
            textEditLastSourceValue_ = activeProperty_.textValue;
            textEditBuffer_ = activeProperty_.textValue;
        }
    }
}

void ImGuiInspectorHost::configureScriptData(const ScriptInspectorData& scriptData) {
    std::lock_guard<std::mutex> lock(dataMutex_);
    mode_ = Mode::ScriptInspector;
    scriptData_ = scriptData;
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

ImGuiInspectorHost::LayoutSnapshot ImGuiInspectorHost::getLayoutSnapshot() const {
    std::lock_guard<std::mutex> lock(layoutMutex_);
    return layoutSnapshot_;
}

void ImGuiInspectorHost::paint(juce::Graphics& g) {
    juce::ignoreUnused(g);
}

void ImGuiInspectorHost::resized() {
    attachContextIfNeeded();
}

void ImGuiInspectorHost::visibilityChanged() {
    if (!isVisible()) {
        releaseAllMouseButtons();
        releaseAllActiveKeys();
        syncModifierKeys(juce::ModifierKeys::noModifiers);
        queueFocus(false);
        std::lock_guard<std::mutex> lock(layoutMutex_);
        layoutSnapshot_ = {};
    }
    attachContextIfNeeded();
}

void ImGuiInspectorHost::mouseMove(const juce::MouseEvent& e) {
    queueMousePosition(e.position);
    syncModifierKeys(e.mods);
}

void ImGuiInspectorHost::mouseDrag(const juce::MouseEvent& e) {
    queueMousePosition(e.position);
    syncMouseButtons(e.mods);
    syncModifierKeys(e.mods);
}

void ImGuiInspectorHost::mouseDown(const juce::MouseEvent& e) {
    grabKeyboardFocus();
    queueMousePosition(e.position);
    syncMouseButtons(e.mods);
    syncModifierKeys(e.mods);
}

void ImGuiInspectorHost::mouseUp(const juce::MouseEvent& e) {
    queueMousePosition(e.position);
    syncMouseButtons(e.mods);
    if (!e.mods.isAnyMouseButtonDown()) {
        releaseAllMouseButtons();
    }
    syncModifierKeys(e.mods);
}

void ImGuiInspectorHost::mouseExit(const juce::MouseEvent& e) {
    juce::ignoreUnused(e);

    if (leftMouseDown_ || rightMouseDown_ || middleMouseDown_) {
        return;
    }

    PendingEvent event;
    event.type = EventType::MousePos;
    event.x = -1.0f;
    event.y = -1.0f;

    std::lock_guard<std::mutex> lock(inputMutex);
    pendingEvents.push_back(std::move(event));
}

void ImGuiInspectorHost::mouseWheelMove(const juce::MouseEvent& e, const juce::MouseWheelDetails& wheel) {
    queueMousePosition(e.position);
    syncModifierKeys(e.mods);

    PendingEvent event;
    event.type = EventType::MouseWheel;
    event.x = wheel.deltaX;
    event.y = wheel.deltaY;

    std::lock_guard<std::mutex> lock(inputMutex);
    pendingEvents.push_back(std::move(event));
}

bool ImGuiInspectorHost::keyPressed(const juce::KeyPress& key) {
    syncModifierKeys(key.getModifiers());

    if (const int imguiKey = translateKeyCodeToImGuiKey(key.getKeyCode()); imguiKey != 0) {
        if (activeKeyCodes_.insert(key.getKeyCode()).second) {
            PendingEvent event;
            event.type = EventType::Key;
            event.key = imguiKey;
            event.down = true;
            std::lock_guard<std::mutex> lock(inputMutex);
            pendingEvents.push_back(std::move(event));
        }
    }

    const auto textCharacter = key.getTextCharacter();
    if (textCharacter >= 32 && !key.getModifiers().isCtrlDown() && !key.getModifiers().isCommandDown()) {
        PendingEvent event;
        event.type = EventType::Char;
        event.codepoint = static_cast<unsigned int>(textCharacter);
        std::lock_guard<std::mutex> lock(inputMutex);
        pendingEvents.push_back(std::move(event));
    }

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
    IMGUI_CHECKVERSION();
    auto* context = ImGui::CreateContext();
    imguiContext = context;
    ImGui::SetCurrentContext(context);

    auto& io = ImGui::GetIO();
    io.ConfigFlags |= ImGuiConfigFlags_NavEnableKeyboard;
    io.BackendPlatformName = "manifold_juce_inspector";

    ImGui::StyleColorsDark();
    auto& style = ImGui::GetStyle();
    style.WindowRounding = 0.0f;
    style.FrameRounding = 4.0f;
    style.WindowBorderSize = 0.0f;
    style.WindowPadding = ImVec2(8.0f, 8.0f);
    style.FramePadding = ImVec2(8.0f, 5.0f);
    style.ItemSpacing = ImVec2(8.0f, 6.0f);
    style.Colors[ImGuiCol_WindowBg] = ImVec4(0.06f, 0.09f, 0.14f, 1.0f);
    style.Colors[ImGuiCol_ChildBg] = ImVec4(0.04f, 0.07f, 0.11f, 1.0f);
    style.Colors[ImGuiCol_Header] = ImVec4(0.12f, 0.23f, 0.37f, 0.90f);
    style.Colors[ImGuiCol_HeaderHovered] = ImVec4(0.18f, 0.36f, 0.57f, 0.95f);
    style.Colors[ImGuiCol_HeaderActive] = ImVec4(0.22f, 0.45f, 0.70f, 1.0f);
    style.Colors[ImGuiCol_Button] = ImVec4(0.12f, 0.16f, 0.23f, 1.0f);
    style.Colors[ImGuiCol_ButtonHovered] = ImVec4(0.16f, 0.24f, 0.35f, 1.0f);
    style.Colors[ImGuiCol_ButtonActive] = ImVec4(0.20f, 0.31f, 0.46f, 1.0f);
    style.Colors[ImGuiCol_FrameBg] = ImVec4(0.08f, 0.12f, 0.18f, 1.0f);
    style.Colors[ImGuiCol_FrameBgHovered] = ImVec4(0.11f, 0.17f, 0.25f, 1.0f);
    style.Colors[ImGuiCol_FrameBgActive] = ImVec4(0.14f, 0.21f, 0.32f, 1.0f);

    ImGui_ImplOpenGL3_Init("#version 150");
    queueFocus(hasKeyboardFocus(true));
}

void ImGuiInspectorHost::renderOpenGL() {
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

    const auto realtimeMods = juce::ModifierKeys::getCurrentModifiersRealtime();
    syncMouseButtons(realtimeMods);
    syncModifierKeys(realtimeMods);

    {
        std::lock_guard<std::mutex> lock(inputMutex);
        for (const auto& event : pendingEvents) {
            switch (event.type) {
                case EventType::MousePos: io.AddMousePosEvent(event.x, event.y); break;
                case EventType::MouseButton: io.AddMouseButtonEvent(event.button, event.down); break;
                case EventType::MouseWheel: io.AddMouseWheelEvent(event.x, event.y); break;
                case EventType::Key: io.AddKeyEvent(static_cast<ImGuiKey>(event.key), event.down); break;
                case EventType::Char: io.AddInputCharacter(event.codepoint); break;
                case EventType::Focus: io.AddFocusEvent(event.focused); break;
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

    LayoutSnapshot nextLayout;

    glViewport(0, 0, framebufferWidth, framebufferHeight);
    glDisable(GL_SCISSOR_TEST);
    glClearColor(0.08f, 0.10f, 0.14f, 0.98f);
    glClear(GL_COLOR_BUFFER_BIT);

    ImGui_ImplOpenGL3_NewFrame();
    ImGui::NewFrame();

    ImGui::SetNextWindowPos(ImVec2(0.0f, 0.0f), ImGuiCond_Always);
    ImGui::SetNextWindowSize(ImVec2(static_cast<float>(width), static_cast<float>(height)), ImGuiCond_Always);

    constexpr ImGuiWindowFlags windowFlags = ImGuiWindowFlags_NoDecoration
                                           | ImGuiWindowFlags_NoMove
                                           | ImGuiWindowFlags_NoResize
                                           | ImGuiWindowFlags_NoSavedSettings
                                           | ImGuiWindowFlags_NoBringToFrontOnFocus;

    ImGui::Begin("##ManifoldInspectorHost", nullptr, windowFlags);

    const auto queueRuntimeParamRequest = [&](const RuntimeParam& param, double value) {
        std::lock_guard<std::mutex> lock(scriptRequestMutex_);
        requestApplyRuntimeParam_ = true;
        requestRuntimeParamEndpointPath_ = param.endpointPath;
        requestRuntimeParamValue_ = value;
    };

    if (mode == Mode::HierarchyProperties) {
        if (bounds.enabled) {
            ImGui::SeparatorText("Bounds");
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

        ImGui::SeparatorText("Selected Value");
        if (!activeProperty.valid) {
            ImGui::TextDisabled("Select a property to edit.");
        } else {
            if (activeProperty.mixed) {
                ImGui::TextDisabled("Mixed values");
            }
            ImGui::TextUnformatted(activeProperty.key.c_str());

            if (activeProperty.editorType == "number") {
                double value = activeProperty.numberValue;
                const char* format = (activeProperty.displayValue.find('.') != std::string::npos) ? "%.3f" : "%.0f";
                if (ImGui::InputDouble("##number", &value,
                                       activeProperty.stepValue > 0.0 ? activeProperty.stepValue : 1.0,
                                       0.0, format)) {
                    if (activeProperty.hasMin) value = std::max(value, activeProperty.minValue);
                    if (activeProperty.hasMax) value = std::min(value, activeProperty.maxValue);
                    requestNumberValue_.store(value, std::memory_order_relaxed);
                    requestApplyNumber_.store(true, std::memory_order_relaxed);
                }
            } else if (activeProperty.editorType == "bool") {
                bool value = activeProperty.boolValue;
                if (ImGui::Checkbox("##bool", &value)) {
                    requestBoolValue_.store(value, std::memory_order_relaxed);
                    requestApplyBool_.store(true, std::memory_order_relaxed);
                }
            } else if (activeProperty.editorType == "text") {
                std::string localText = textBuffer;
                if (ImGui::InputText("##text", &localText)) {
                    {
                        std::lock_guard<std::mutex> lock(dataMutex_);
                        textEditBuffer_ = localText;
                    }
                    {
                        std::lock_guard<std::mutex> lock(textRequestMutex_);
                        requestTextValue_ = localText;
                    }
                    requestApplyText_.store(true, std::memory_order_relaxed);
                }
            } else if (activeProperty.editorType == "enum") {
                if (!activeProperty.enumLabels.empty()) {
                    int selectedIndex = std::clamp(activeProperty.enumSelectedIndex - 1, 0,
                                                   static_cast<int>(activeProperty.enumLabels.size()) - 1);
                    const char* comboLabel = activeProperty.enumLabels[static_cast<std::size_t>(selectedIndex)].c_str();
                    if (ImGui::BeginCombo("##enum", comboLabel)) {
                        for (int i = 0; i < static_cast<int>(activeProperty.enumLabels.size()); ++i) {
                            const bool selected = (i == selectedIndex);
                            if (ImGui::Selectable(activeProperty.enumLabels[static_cast<std::size_t>(i)].c_str(), selected)) {
                                requestApplyEnumIndex_.store(i + 1, std::memory_order_relaxed);
                            }
                            if (selected) {
                                ImGui::SetItemDefaultFocus();
                            }
                        }
                        ImGui::EndCombo();
                    }
                }
            } else if (activeProperty.editorType == "color") {
                ImVec4 rgba = argbToImVec4(activeProperty.colorValue);
                if (ImGui::ColorEdit4("##color", &rgba.x, ImGuiColorEditFlags_NoInputs)) {
                    requestColorValue_.store(imVec4ToArgb(rgba), std::memory_order_relaxed);
                    requestApplyColor_.store(true, std::memory_order_relaxed);
                }
                ImGui::SameLine();
                ImGui::TextDisabled("%s", activeProperty.displayValue.c_str());
            } else {
                ImGui::TextDisabled("No editor for this property.");
            }
        }

        ImGui::SeparatorText("Properties");
        const float rowsHeight = std::max(120.0f, ImGui::GetContentRegionAvail().y);
        if (ImGui::BeginTable("##InspectorRows", 2,
                              ImGuiTableFlags_RowBg | ImGuiTableFlags_BordersInnerV | ImGuiTableFlags_ScrollY,
                              ImVec2(0.0f, rowsHeight))) {
            ImGui::TableSetupColumn("Key", ImGuiTableColumnFlags_WidthStretch, 0.55f);
            ImGui::TableSetupColumn("Value", ImGuiTableColumnFlags_WidthStretch, 0.45f);

            for (const auto& row : rows) {
                if (row.section) {
                    ImGui::TableNextRow();
                    ImGui::TableSetColumnIndex(0);
                    ImGui::TextDisabled("%s", row.key.c_str());
                    ImGui::TableSetColumnIndex(1);
                    continue;
                }

                ImGui::TableNextRow();
                ImGui::TableSetColumnIndex(0);
                const bool activated = ImGui::Selectable(row.key.c_str(), row.selected,
                    ImGuiSelectableFlags_SpanAllColumns | ImGuiSelectableFlags_AllowOverlap);
                if (activated && row.interactive && row.rowIndex > 0) {
                    requestSelectRowIndex_.store(row.rowIndex, std::memory_order_relaxed);
                }
                ImGui::TableSetColumnIndex(1);
                if (row.value.empty()) {
                    ImGui::TextUnformatted("");
                } else if (row.interactive) {
                    ImGui::TextUnformatted(row.value.c_str());
                } else {
                    ImGui::TextDisabled("%s", row.value.c_str());
                }
            }
            ImGui::EndTable();
        }
    } else {
        const auto infoRow = [&](const char* label, const std::string& value) {
            ImGui::TableNextRow();
            ImGui::TableSetColumnIndex(0);
            ImGui::TextDisabled("%s", label);
            ImGui::TableSetColumnIndex(1);
            ImGui::TextWrapped("%s", value.c_str());
        };

        if (!scriptData.hasSelection || scriptData.path.empty()) {
            ImGui::TextDisabled("Select a script to inspect.");
            ImGui::Spacing();
            ImGui::TextDisabled("Single-click: inspect | Double-click: open editor");
        } else {
            ImGui::SeparatorText("Script");
            if (ImGui::BeginTable("##ScriptInspectorInfo", 2,
                                  ImGuiTableFlags_BordersInnerV | ImGuiTableFlags_SizingStretchProp,
                                  ImVec2(0.0f, 0.0f))) {
                ImGui::TableSetupColumn("Label", ImGuiTableColumnFlags_WidthFixed, 74.0f);
                ImGui::TableSetupColumn("Value", ImGuiTableColumnFlags_WidthStretch);
                infoRow("Script", scriptData.name);
                infoRow("Kind", scriptData.kind);
                if (!scriptData.ownership.empty()) {
                    infoRow("Ownership", scriptData.ownership);
                    if (scriptData.hasStructuredStatus) {
                        infoRow("Dirty", scriptData.structuredDirty ? std::string{"yes"} : std::string{"no"});
                    }
                    if (!scriptData.projectLastError.empty()) {
                        infoRow("Last Error", scriptData.projectLastError);
                    }
                }
                infoRow("Path", scriptData.path);
                if (scriptData.kind == "dsp") {
                    int activeRuntimeCount = 0;
                    for (const auto& runtimeParam : scriptData.runtimeParams) {
                        if (runtimeParam.active) {
                            ++activeRuntimeCount;
                        }
                    }
                    infoRow("Declared", std::to_string(scriptData.declaredParams.size()));
                    infoRow("Runtime", std::to_string(activeRuntimeCount) + "/" + std::to_string(scriptData.runtimeParams.size()) + " active");
                    infoRow("Graph", std::to_string(scriptData.graphNodes.size()) + " nodes / " + std::to_string(scriptData.graphEdges.size()) + " edges");
                }
                ImGui::EndTable();
            }

            if (scriptData.kind == "dsp") {
                const float buttonWidth = (ImGui::GetContentRegionAvail().x - 8.0f) * 0.5f;
                if (ImGui::Button("Run in Preview Slot", ImVec2(buttonWidth, 0.0f))) {
                    std::lock_guard<std::mutex> lock(scriptRequestMutex_);
                    requestRunPreview_ = true;
                }
                ImGui::SameLine();
                if (ImGui::Button("Stop Preview Slot", ImVec2(buttonWidth, 0.0f))) {
                    std::lock_guard<std::mutex> lock(scriptRequestMutex_);
                    requestStopPreview_ = true;
                }

                if (!scriptData.runtimeStatus.empty()) {
                    ImGui::TextColored(ImVec4(0.49f, 0.83f, 0.99f, 1.0f), "%s", scriptData.runtimeStatus.c_str());
                }

                ImGui::SeparatorText("Declared Params");
                if (scriptData.declaredParams.empty()) {
                    ImGui::TextDisabled("No ctx.params.register(...) found.");
                } else {
                    const float declaredHeight = std::min(140.0f,
                        std::max(58.0f, 26.0f + static_cast<float>(scriptData.declaredParams.size()) * 18.0f));
                    ImGui::BeginChild("##DeclaredParams", ImVec2(0.0f, declaredHeight), true);
                    ImGuiListClipper clipper;
                    clipper.Begin(static_cast<int>(scriptData.declaredParams.size()));
                    while (clipper.Step()) {
                        for (int i = clipper.DisplayStart; i < clipper.DisplayEnd; ++i) {
                            const auto& param = scriptData.declaredParams[static_cast<std::size_t>(i)];
                            ImGui::PushID(i);
                            ImGui::TextDisabled("%s", param.path.c_str());
                            if (!param.defaultValue.empty()) {
                                ImGui::SameLine();
                                ImGui::Text("d=%s", param.defaultValue.c_str());
                            }
                            ImGui::PopID();
                        }
                    }
                    ImGui::EndChild();
                }

                ImGui::SeparatorText("Runtime Params");
                if (scriptData.runtimeParams.empty()) {
                    ImGui::TextDisabled("No runtime params. Run the script first.");
                } else {
                    const float runtimeHeight = std::min(220.0f,
                        std::max(84.0f, 28.0f + static_cast<float>(scriptData.runtimeParams.size()) * 28.0f));
                    ImGui::BeginChild("##RuntimeParams", ImVec2(0.0f, runtimeHeight), true);
                    ImGui::TextDisabled("Buttons nudge. Drag the control to update the live runtime param.");
                    ImGui::Separator();
                    ImGuiListClipper clipper;
                    clipper.Begin(static_cast<int>(scriptData.runtimeParams.size()));
                    while (clipper.Step()) {
                        for (int i = clipper.DisplayStart; i < clipper.DisplayEnd; ++i) {
                            const auto& param = scriptData.runtimeParams[static_cast<std::size_t>(i)];
                            const auto step = resolveRuntimeStep(param);
                            double value = param.value;
                            ImGui::PushID(i);
                            ImGui::BeginDisabled(!param.active || param.endpointPath.empty());
                            ImGui::TextDisabled("%s", param.path.c_str());
                            if (!param.active) {
                                ImGui::SameLine();
                                ImGui::TextDisabled("inactive");
                            }
                            if (ImGui::Button("-", ImVec2(20.0f, 0.0f))) {
                                double nextValue = value - step;
                                if (param.hasMin) nextValue = std::max(nextValue, param.minValue);
                                if (param.hasMax) nextValue = std::min(nextValue, param.maxValue);
                                queueRuntimeParamRequest(param, nextValue);
                            }
                            ImGui::SameLine();
                            ImGui::SetNextItemWidth(std::max(72.0f, ImGui::GetContentRegionAvail().x - 88.0f));
                            bool changed = false;
                            if (param.hasMin && param.hasMax) {
                                double sliderMin = param.minValue;
                                double sliderMax = param.maxValue;
                                changed = ImGui::SliderScalar("##runtimeValue", ImGuiDataType_Double,
                                                              &value, &sliderMin, &sliderMax,
                                                              "%.4f");
                            } else {
                                changed = ImGui::DragScalar("##runtimeValue", ImGuiDataType_Double,
                                                            &value, static_cast<float>(step), nullptr, nullptr,
                                                            "%.4f");
                            }
                            if (changed) {
                                if (param.hasMin) value = std::max(value, param.minValue);
                                if (param.hasMax) value = std::min(value, param.maxValue);
                                queueRuntimeParamRequest(param, value);
                            }
                            ImGui::SameLine();
                            if (ImGui::Button("+", ImVec2(20.0f, 0.0f))) {
                                double nextValue = value + step;
                                if (param.hasMin) nextValue = std::max(nextValue, param.minValue);
                                if (param.hasMax) nextValue = std::min(nextValue, param.maxValue);
                                queueRuntimeParamRequest(param, nextValue);
                            }
                            ImGui::SameLine();
                            ImGui::TextDisabled("%s", param.displayValue.c_str());
                            ImGui::EndDisabled();
                            ImGui::Spacing();
                            ImGui::PopID();
                        }
                    }
                    ImGui::EndChild();
                }
            }

            ImGui::SetNextItemOpen(!scriptData.editorCollapsed, ImGuiCond_Always);
            const bool editorOpen = ImGui::CollapsingHeader("Inline Script", ImGuiTreeNodeFlags_DefaultOpen);
            if (editorOpen != !scriptData.editorCollapsed) {
                std::lock_guard<std::mutex> lock(scriptRequestMutex_);
                requestSetEditorCollapsed_ = true;
                requestEditorCollapsed_ = !editorOpen;
            }
            if (editorOpen) {
                float editorHeight = 160.0f;
                if (scriptData.kind == "dsp" && !scriptData.graphCollapsed) {
                    editorHeight = std::clamp(ImGui::GetContentRegionAvail().y - 180.0f, 80.0f, 180.0f);
                } else {
                    editorHeight = std::clamp(ImGui::GetContentRegionAvail().y - 24.0f, 80.0f, 180.0f);
                }
                const ImVec2 editorMin = ImGui::GetCursorScreenPos();
                const ImVec2 editorSize(std::max(1.0f, ImGui::GetContentRegionAvail().x), editorHeight);
                ImGui::BeginChild("##InlineScriptHostSlot", editorSize, true,
                                  ImGuiWindowFlags_NoScrollbar | ImGuiWindowFlags_NoScrollWithMouse);
                ImGui::TextDisabled("Inline editor");
                ImGui::Spacing();
                ImGui::TextDisabled("Lua-backed content is mounted here.");
                ImGui::EndChild();
                nextLayout.hasInlineEditorRect = true;
                nextLayout.inlineEditorRect = toLocalRect(editorMin, editorSize);
            }

            if (scriptData.kind == "dsp") {
                ImGui::SetNextItemOpen(!scriptData.graphCollapsed, ImGuiCond_Always);
                const bool graphOpen = ImGui::CollapsingHeader("DSP Graph", ImGuiTreeNodeFlags_DefaultOpen);
                if (graphOpen != !scriptData.graphCollapsed) {
                    std::lock_guard<std::mutex> lock(scriptRequestMutex_);
                    requestSetGraphCollapsed_ = true;
                    requestGraphCollapsed_ = !graphOpen;
                }

                if (graphOpen) {
                    const float graphHeight = std::max(120.0f, ImGui::GetContentRegionAvail().y - 4.0f);
                    ImGui::BeginChild("##DspGraph", ImVec2(0.0f, graphHeight), true,
                                      ImGuiWindowFlags_NoScrollbar | ImGuiWindowFlags_NoScrollWithMouse);
                    const ImVec2 canvasSize = ImGui::GetContentRegionAvail();
                    ImGui::InvisibleButton("##graphCanvas", canvasSize,
                                           ImGuiButtonFlags_MouseButtonLeft | ImGuiButtonFlags_MouseButtonRight);
                    const ImVec2 canvasMin = ImGui::GetItemRectMin();
                    const ImVec2 canvasMax = ImGui::GetItemRectMax();
                    auto* drawList = ImGui::GetWindowDrawList();
                    drawList->AddRectFilled(canvasMin, canvasMax, IM_COL32(11, 18, 32, 255), 4.0f);
                    drawList->AddRect(canvasMin, canvasMax, IM_COL32(51, 65, 85, 255), 4.0f);
                    drawList->PushClipRect(canvasMin, canvasMax, true);

                    if (ImGui::IsItemActive() && ImGui::IsMouseDragging(ImGuiMouseButton_Left)) {
                        const auto delta = ImGui::GetIO().MouseDelta;
                        if (delta.x != 0.0f || delta.y != 0.0f) {
                            std::lock_guard<std::mutex> lock(scriptRequestMutex_);
                            requestSetGraphPan_ = true;
                            requestGraphPanX_ = scriptData.graphPanX + juce::roundToInt(delta.x);
                            requestGraphPanY_ = scriptData.graphPanY + juce::roundToInt(delta.y);
                        }
                    }

                    drawList->AddText(ImVec2(canvasMin.x + 8.0f, canvasMin.y + 6.0f),
                                      IM_COL32(148, 163, 184, 255), "Drag to pan");

                    if (scriptData.graphNodes.empty()) {
                        drawList->AddText(ImVec2(canvasMin.x + 8.0f, canvasMin.y + 28.0f),
                                          IM_COL32(100, 116, 139, 255), "No graph parsed");
                    } else {
                        const int cols = std::max(1, static_cast<int>(std::ceil(std::sqrt(static_cast<double>(scriptData.graphNodes.size())))));
                        const float cellW = 110.0f;
                        const float cellH = 48.0f;
                        const float nodeW = 96.0f;
                        const float nodeH = 24.0f;
                        const float originX = canvasMin.x + 12.0f + static_cast<float>(scriptData.graphPanX);
                        const float originY = canvasMin.y + 24.0f + static_cast<float>(scriptData.graphPanY);
                        std::vector<ImVec2> centers(scriptData.graphNodes.size());
                        std::vector<ImVec2> corners(scriptData.graphNodes.size());

                        for (std::size_t i = 0; i < scriptData.graphNodes.size(); ++i) {
                            const int col = static_cast<int>(i) % cols;
                            const int row = static_cast<int>(i) / cols;
                            const float x = originX + static_cast<float>(col) * cellW;
                            const float y = originY + static_cast<float>(row) * cellH;
                            corners[i] = ImVec2(x, y);
                            centers[i] = ImVec2(x + nodeW * 0.5f, y + nodeH * 0.5f);
                        }

                        for (const auto& edge : scriptData.graphEdges) {
                            if (edge.fromIndex < 1 || edge.toIndex < 1) {
                                continue;
                            }
                            const auto fromIndex = static_cast<std::size_t>(edge.fromIndex - 1);
                            const auto toIndex = static_cast<std::size_t>(edge.toIndex - 1);
                            if (fromIndex >= centers.size() || toIndex >= centers.size()) {
                                continue;
                            }
                            drawList->AddLine(centers[fromIndex], centers[toIndex], IM_COL32(71, 85, 105, 255), 1.0f);
                        }

                        for (std::size_t i = 0; i < scriptData.graphNodes.size(); ++i) {
                            const auto& node = scriptData.graphNodes[i];
                            const auto& corner = corners[i];
                            const ImVec2 nodeMax(corner.x + nodeW, corner.y + nodeH);
                            drawList->AddRectFilled(corner, nodeMax, IM_COL32(30, 41, 59, 255), 4.0f);
                            drawList->AddRect(corner, nodeMax, IM_COL32(56, 189, 248, 255), 4.0f);
                            const auto label = node.var + ":" + node.prim;
                            drawList->AddText(ImVec2(corner.x + 4.0f, corner.y + 5.0f),
                                              IM_COL32(226, 232, 240, 255), label.c_str());
                        }
                    }

                    drawList->PopClipRect();
                    ImGui::EndChild();
                }
            }
        }
    }

    ImGui::End();

    {
        std::lock_guard<std::mutex> lock(layoutMutex_);
        layoutSnapshot_ = nextLayout;
    }

    ImGui::Render();
    ImGui_ImplOpenGL3_RenderDrawData(ImGui::GetDrawData());
}

void ImGuiInspectorHost::openGLContextClosing() {
    auto* context = reinterpret_cast<ImGuiContext*>(imguiContext);
    if (context != nullptr) {
        ImGui::SetCurrentContext(context);
        ImGui_ImplOpenGL3_Shutdown();
        ImGui::DestroyContext(context);
        imguiContext = nullptr;
    }
}

void ImGuiInspectorHost::attachContextIfNeeded() {
    if (!isShowing() || getWidth() <= 0 || getHeight() <= 0) {
        return;
    }
    if (!openGLContext.isAttached()) {
        openGLContext.attachTo(*this);
    }
}

void ImGuiInspectorHost::queueMousePosition(juce::Point<float> position) {
    PendingEvent event;
    event.type = EventType::MousePos;
    event.x = position.x;
    event.y = position.y;
    std::lock_guard<std::mutex> lock(inputMutex);
    pendingEvents.push_back(std::move(event));
}

void ImGuiInspectorHost::syncMouseButtons(const juce::ModifierKeys& mods) {
    const bool nextLeft = mods.isLeftButtonDown();
    const bool nextRight = mods.isRightButtonDown();
    const bool nextMiddle = mods.isMiddleButtonDown();

    std::lock_guard<std::mutex> lock(inputMutex);
    const auto pushMouseButton = [&](bool& current, int button, bool nextState) {
        if (current == nextState) {
            return;
        }
        current = nextState;
        PendingEvent event;
        event.type = EventType::MouseButton;
        event.button = button;
        event.down = nextState;
        pendingEvents.push_back(std::move(event));
    };
    pushMouseButton(leftMouseDown_, 0, nextLeft);
    pushMouseButton(rightMouseDown_, 1, nextRight);
    pushMouseButton(middleMouseDown_, 2, nextMiddle);
}

void ImGuiInspectorHost::syncModifierKeys(const juce::ModifierKeys& mods) {
    const bool nextCtrl = mods.isCtrlDown();
    const bool nextShift = mods.isShiftDown();
    const bool nextAlt = mods.isAltDown();
    const bool nextSuper = mods.isCommandDown();

    std::lock_guard<std::mutex> lock(inputMutex);
    const auto syncMod = [&](bool& state, int key, bool nextState) {
        if (state == nextState) {
            return;
        }
        state = nextState;
        PendingEvent event;
        event.type = EventType::Key;
        event.key = key;
        event.down = nextState;
        pendingEvents.push_back(std::move(event));
    };
    syncMod(ctrlDown_, ImGuiMod_Ctrl, nextCtrl);
    syncMod(shiftDown_, ImGuiMod_Shift, nextShift);
    syncMod(altDown_, ImGuiMod_Alt, nextAlt);
    syncMod(superDown_, ImGuiMod_Super, nextSuper);
}

void ImGuiInspectorHost::releaseAllMouseButtons() {
    std::lock_guard<std::mutex> lock(inputMutex);
    const auto releaseButton = [&](bool& current, int button) {
        if (!current) {
            return;
        }
        current = false;
        PendingEvent event;
        event.type = EventType::MouseButton;
        event.button = button;
        event.down = false;
        pendingEvents.push_back(std::move(event));
    };
    releaseButton(leftMouseDown_, 0);
    releaseButton(rightMouseDown_, 1);
    releaseButton(middleMouseDown_, 2);
}

void ImGuiInspectorHost::releaseInactiveKeys() {
    if (activeKeyCodes_.empty()) {
        return;
    }
    std::lock_guard<std::mutex> lock(inputMutex);
    for (auto it = activeKeyCodes_.begin(); it != activeKeyCodes_.end();) {
        if (juce::KeyPress::isKeyCurrentlyDown(*it)) {
            ++it;
            continue;
        }
        const int imguiKey = translateKeyCodeToImGuiKey(*it);
        if (imguiKey != 0) {
            PendingEvent event;
            event.type = EventType::Key;
            event.key = imguiKey;
            event.down = false;
            pendingEvents.push_back(std::move(event));
        }
        it = activeKeyCodes_.erase(it);
    }
}

void ImGuiInspectorHost::releaseAllActiveKeys() {
    if (activeKeyCodes_.empty()) {
        return;
    }
    std::lock_guard<std::mutex> lock(inputMutex);
    for (const int keyCode : activeKeyCodes_) {
        const int imguiKey = translateKeyCodeToImGuiKey(keyCode);
        if (imguiKey == 0) {
            continue;
        }
        PendingEvent event;
        event.type = EventType::Key;
        event.key = imguiKey;
        event.down = false;
        pendingEvents.push_back(std::move(event));
    }
    activeKeyCodes_.clear();
}

void ImGuiInspectorHost::queueFocus(bool focused) {
    PendingEvent event;
    event.type = EventType::Focus;
    event.focused = focused;
    std::lock_guard<std::mutex> lock(inputMutex);
    pendingEvents.push_back(std::move(event));
}

int ImGuiInspectorHost::translateKeyCodeToImGuiKey(int keyCode) {
    if (keyCode == juce::KeyPress::tabKey) return ImGuiKey_Tab;
    if (keyCode == juce::KeyPress::leftKey) return ImGuiKey_LeftArrow;
    if (keyCode == juce::KeyPress::rightKey) return ImGuiKey_RightArrow;
    if (keyCode == juce::KeyPress::upKey) return ImGuiKey_UpArrow;
    if (keyCode == juce::KeyPress::downKey) return ImGuiKey_DownArrow;
    if (keyCode == juce::KeyPress::pageUpKey) return ImGuiKey_PageUp;
    if (keyCode == juce::KeyPress::pageDownKey) return ImGuiKey_PageDown;
    if (keyCode == juce::KeyPress::homeKey) return ImGuiKey_Home;
    if (keyCode == juce::KeyPress::endKey) return ImGuiKey_End;
    if (keyCode == juce::KeyPress::insertKey) return ImGuiKey_Insert;
    if (keyCode == juce::KeyPress::deleteKey) return ImGuiKey_Delete;
    if (keyCode == juce::KeyPress::backspaceKey) return ImGuiKey_Backspace;
    if (keyCode == juce::KeyPress::returnKey) return ImGuiKey_Enter;
    if (keyCode == juce::KeyPress::escapeKey) return ImGuiKey_Escape;
    if (keyCode == juce::KeyPress::spaceKey) return ImGuiKey_Space;
    if (keyCode >= '0' && keyCode <= '9') return ImGuiKey_0 + (keyCode - '0');
    if (keyCode >= 'a' && keyCode <= 'z') return ImGuiKey_A + (keyCode - 'a');
    if (keyCode >= 'A' && keyCode <= 'Z') return ImGuiKey_A + (keyCode - 'A');
    if (keyCode == ';') return ImGuiKey_Semicolon;
    if (keyCode == '\'') return ImGuiKey_Apostrophe;
    if (keyCode == ',') return ImGuiKey_Comma;
    if (keyCode == '-') return ImGuiKey_Minus;
    if (keyCode == '.') return ImGuiKey_Period;
    if (keyCode == '/') return ImGuiKey_Slash;
    if (keyCode == '=') return ImGuiKey_Equal;
    if (keyCode == '[') return ImGuiKey_LeftBracket;
    if (keyCode == '\\') return ImGuiKey_Backslash;
    if (keyCode == ']') return ImGuiKey_RightBracket;
    if (keyCode == '`') return ImGuiKey_GraveAccent;
    return 0;
}
