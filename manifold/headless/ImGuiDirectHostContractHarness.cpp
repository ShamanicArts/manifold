#include <juce_gui_basics/juce_gui_basics.h>
#include <juce_opengl/juce_opengl.h>
#include <juce_graphics/juce_graphics.h>
#include <juce_core/juce_core.h>
#include <sol/sol.hpp>
#include "external/imgui/imgui.h"

#include "../primitives/ui/RuntimeNode.h"
#include "../primitives/ui/CustomSurfaceProvider.h"

#define private public
#include "../ui/imgui/ImGuiDirectHost.h"
#include "../ui/imgui/DirectHostRuntimeSupport.h"
#include "../ui/imgui/DirectHostInputSupport.h"
#undef private

#include <algorithm>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <fstream>
#include <iomanip>
#include <sstream>
#include <string>
#include <vector>

namespace {

juce::var makeObject() {
    return juce::var(new juce::DynamicObject());
}

juce::var makeArray() {
    juce::var out;
    out.resize(0);
    return out;
}

juce::DynamicObject* asObject(juce::var& value) {
    return value.getDynamicObject();
}

juce::DynamicObject* asObject(const juce::var& value) {
    return value.getDynamicObject();
}

juce::Array<juce::var>* asArray(juce::var& value) {
    return value.getArray();
}

void append(juce::var& array, juce::var value) {
    if (auto* arr = asArray(array)) {
        arr->add(std::move(value));
    }
}

std::string toStdString(const juce::String& value) {
    return value.toStdString();
}

std::string formatFloat(double value, int decimals = 3) {
    return toStdString(juce::String(value, decimals));
}

juce::var makeRect(int x, int y, int w, int h) {
    auto obj = makeObject();
    asObject(obj)->setProperty("x", x);
    asObject(obj)->setProperty("y", y);
    asObject(obj)->setProperty("w", w);
    asObject(obj)->setProperty("h", h);
    return obj;
}

juce::var makeRect(const RuntimeNode::Rect& rect) {
    return makeRect(rect.x, rect.y, rect.w, rect.h);
}

juce::var makeRect(const juce::Rectangle<int>& rect) {
    return makeRect(rect.getX(), rect.getY(), rect.getWidth(), rect.getHeight());
}

juce::var makeRect(const juce::Rectangle<float>& rect) {
    auto obj = makeObject();
    asObject(obj)->setProperty("x", rect.getX());
    asObject(obj)->setProperty("y", rect.getY());
    asObject(obj)->setProperty("w", rect.getWidth());
    asObject(obj)->setProperty("h", rect.getHeight());
    return obj;
}

juce::var makePoint(const juce::Point<float>& point) {
    auto obj = makeObject();
    asObject(obj)->setProperty("x", point.x);
    asObject(obj)->setProperty("y", point.y);
    return obj;
}

juce::var normaliseVar(const juce::var& value) {
    if (value.isVoid()) {
        return juce::String("<void>");
    }
    if (value.isUndefined()) {
        return juce::String("<undefined>");
    }
    if (value.isBool() || value.isInt() || value.isInt64() || value.isDouble() || value.isString()) {
        return value;
    }
    if (auto* array = value.getArray()) {
        auto out = makeArray();
        for (const auto& item : *array) {
            append(out, normaliseVar(item));
        }
        return out;
    }
    if (auto* object = value.getDynamicObject()) {
        std::vector<juce::Identifier> names;
        names.reserve(static_cast<std::size_t>(object->getProperties().size()));
        for (const auto& property : object->getProperties()) {
            names.push_back(property.name);
        }
        std::sort(names.begin(), names.end(), [](const juce::Identifier& a, const juce::Identifier& b) {
            return a.toString() < b.toString();
        });
        auto out = makeObject();
        for (const auto& name : names) {
            asObject(out)->setProperty(name, normaliseVar(object->getProperty(name)));
        }
        return out;
    }
    return value.toString();
}

juce::var makeStyle(const RuntimeNode::StyleState& style) {
    auto obj = makeObject();
    asObject(obj)->setProperty("background", static_cast<juce::int64>(style.background));
    asObject(obj)->setProperty("border", static_cast<juce::int64>(style.border));
    asObject(obj)->setProperty("borderWidth", style.borderWidth);
    asObject(obj)->setProperty("cornerRadius", style.cornerRadius);
    asObject(obj)->setProperty("opacity", style.opacity);
    asObject(obj)->setProperty("padding", style.padding);
    return obj;
}

juce::var makeInputCaps(const RuntimeNode::InputCapabilities& caps) {
    auto obj = makeObject();
    asObject(obj)->setProperty("pointer", caps.pointer);
    asObject(obj)->setProperty("wheel", caps.wheel);
    asObject(obj)->setProperty("keyboard", caps.keyboard);
    asObject(obj)->setProperty("focusable", caps.focusable);
    asObject(obj)->setProperty("interceptsChildren", caps.interceptsChildren);
    return obj;
}

juce::var makeTransform(const RuntimeNode::Transform& transform) {
    auto obj = makeObject();
    asObject(obj)->setProperty("scaleX", transform.scaleX);
    asObject(obj)->setProperty("scaleY", transform.scaleY);
    asObject(obj)->setProperty("translateX", transform.translateX);
    asObject(obj)->setProperty("translateY", transform.translateY);
    return obj;
}

juce::var makePreviewTransform(const ImGuiDirectHost::PreviewTransform& transform) {
    auto obj = makeObject();
    asObject(obj)->setProperty("valid", transform.valid);
    asObject(obj)->setProperty("scale", transform.scale);
    asObject(obj)->setProperty("offsetX", transform.offsetX);
    asObject(obj)->setProperty("offsetY", transform.offsetY);
    asObject(obj)->setProperty("sceneBounds", makeRect(transform.sceneBounds));
    return obj;
}

juce::var makeCallbackPresence(const RuntimeNode::CallbackSlots& callbacks) {
    auto arr = makeArray();
    if (callbacks.onMouseDown.valid()) append(arr, "onMouseDown");
    if (callbacks.onMouseDrag.valid()) append(arr, "onMouseDrag");
    if (callbacks.onMouseUp.valid()) append(arr, "onMouseUp");
    if (callbacks.onMouseMove.valid()) append(arr, "onMouseMove");
    if (callbacks.onMouseWheel.valid()) append(arr, "onMouseWheel");
    if (callbacks.onKeyPress.valid()) append(arr, "onKeyPress");
    if (callbacks.onClick.valid()) append(arr, "onClick");
    if (callbacks.onDoubleClick.valid()) append(arr, "onDoubleClick");
    if (callbacks.onMouseEnter.valid()) append(arr, "onMouseEnter");
    if (callbacks.onMouseExit.valid()) append(arr, "onMouseExit");
    if (callbacks.onDraw.valid()) append(arr, "onDraw");
    if (callbacks.onGLRender.valid()) append(arr, "onGLRender");
    if (callbacks.onGLContextCreated.valid()) append(arr, "onGLContextCreated");
    if (callbacks.onGLContextClosing.valid()) append(arr, "onGLContextClosing");
    if (callbacks.onValueChanged.valid()) append(arr, "onValueChanged");
    if (callbacks.onToggled.valid()) append(arr, "onToggled");
    if (callbacks.onImGuiFrame.valid()) append(arr, "onImGuiFrame");
    return arr;
}

juce::var makeCompiledDisplayList(const std::shared_ptr<const manifold::ui::imgui::CompiledDisplayList>& compiled) {
    auto obj = makeObject();
    asObject(obj)->setProperty("present", compiled != nullptr);
    if (!compiled) {
        return obj;
    }

    auto commands = makeArray();
    for (const auto& cmd : compiled->commands) {
        auto cmdObj = makeObject();
        asObject(cmdObj)->setProperty("type", static_cast<int>(cmd.type));
        asObject(cmdObj)->setProperty("x", cmd.x);
        asObject(cmdObj)->setProperty("y", cmd.y);
        asObject(cmdObj)->setProperty("w", cmd.w);
        asObject(cmdObj)->setProperty("h", cmd.h);
        asObject(cmdObj)->setProperty("radius", cmd.radius);
        asObject(cmdObj)->setProperty("thickness", cmd.thickness);
        asObject(cmdObj)->setProperty("color", static_cast<juce::int64>(cmd.color));
        asObject(cmdObj)->setProperty("hasColor", cmd.hasColor);
        asObject(cmdObj)->setProperty("fontSize", cmd.fontSize);
        asObject(cmdObj)->setProperty("hasFontSize", cmd.hasFontSize);
        asObject(cmdObj)->setProperty("x1", cmd.x1);
        asObject(cmdObj)->setProperty("y1", cmd.y1);
        asObject(cmdObj)->setProperty("x2", cmd.x2);
        asObject(cmdObj)->setProperty("y2", cmd.y2);
        asObject(cmdObj)->setProperty("cx1", cmd.cx1);
        asObject(cmdObj)->setProperty("cy1", cmd.cy1);
        asObject(cmdObj)->setProperty("cx2", cmd.cx2);
        asObject(cmdObj)->setProperty("cy2", cmd.cy2);
        asObject(cmdObj)->setProperty("segments", cmd.segments);
        asObject(cmdObj)->setProperty("text", juce::String(cmd.text));
        asObject(cmdObj)->setProperty("align", juce::String(cmd.align));
        asObject(cmdObj)->setProperty("valign", juce::String(cmd.valign));
        asObject(cmdObj)->setProperty("textureId", static_cast<juce::int64>(cmd.textureId));
        asObject(cmdObj)->setProperty("u0", cmd.u0);
        asObject(cmdObj)->setProperty("v0", cmd.v0);
        asObject(cmdObj)->setProperty("u1", cmd.u1);
        asObject(cmdObj)->setProperty("v1", cmd.v1);
        auto poly = makeArray();
        for (const auto& point : cmd.polyPoints) {
            auto pointObj = makeObject();
            asObject(pointObj)->setProperty("x", point.first);
            asObject(pointObj)->setProperty("y", point.second);
            append(poly, pointObj);
        }
        asObject(cmdObj)->setProperty("polyPoints", poly);
        append(commands, cmdObj);
    }
    asObject(obj)->setProperty("commands", commands);
    return obj;
}

juce::var makeNodeTree(const RuntimeNode* node) {
    if (node == nullptr) {
        return juce::String("<null>");
    }

    auto obj = makeObject();
    asObject(obj)->setProperty("nodeId", juce::String(node->getNodeId()));
    asObject(obj)->setProperty("stableId", static_cast<juce::int64>(node->getStableId()));
    asObject(obj)->setProperty("widgetType", juce::String(node->getWidgetType()));
    asObject(obj)->setProperty("bounds", makeRect(node->getBounds()));
    asObject(obj)->setProperty("clipRect", makeRect(node->getClipRect()));
    asObject(obj)->setProperty("hasClipRect", node->hasClipRect());
    asObject(obj)->setProperty("visible", node->isVisible());
    asObject(obj)->setProperty("openGLEnabled", node->isOpenGLEnabled());
    asObject(obj)->setProperty("zOrder", node->getZOrder());
    asObject(obj)->setProperty("style", makeStyle(node->getStyle()));
    asObject(obj)->setProperty("inputCapabilities", makeInputCaps(node->getInputCapabilities()));
    asObject(obj)->setProperty("transform", makeTransform(node->getTransform()));
    asObject(obj)->setProperty("hovered", node->isHovered());
    asObject(obj)->setProperty("pressed", node->isPressed());
    asObject(obj)->setProperty("focused", node->isFocused());
    asObject(obj)->setProperty("callbacks", makeCallbackPresence(node->getCallbacks()));
    asObject(obj)->setProperty("displayList", normaliseVar(node->getDisplayList()));
    asObject(obj)->setProperty("compiledDisplayList", makeCompiledDisplayList(node->getCompiledDisplayList()));
    asObject(obj)->setProperty("customSurfaceType", juce::String(node->getCustomSurfaceType()));
    asObject(obj)->setProperty("customRenderPayload", normaliseVar(node->getCustomRenderPayload()));
    asObject(obj)->setProperty("structureVersion", static_cast<juce::int64>(node->getStructureVersion()));
    asObject(obj)->setProperty("propsVersion", static_cast<juce::int64>(node->getPropsVersion()));
    asObject(obj)->setProperty("renderVersion", static_cast<juce::int64>(node->getRenderVersion()));

    const auto memoryStats = node->estimateMemoryUsage();
    auto mem = makeObject();
    asObject(mem)->setProperty("nodeCount", static_cast<juce::int64>(memoryStats.nodeCount));
    asObject(mem)->setProperty("callbackCount", static_cast<juce::int64>(memoryStats.callbackCount));
    asObject(mem)->setProperty("userDataEntries", static_cast<juce::int64>(memoryStats.userDataEntries));
    asObject(mem)->setProperty("compiledDisplayListCount", static_cast<juce::int64>(memoryStats.compiledDisplayListCount));
    asObject(mem)->setProperty("compiledDisplayListCommands", static_cast<juce::int64>(memoryStats.compiledDisplayListCommands));
    asObject(mem)->setProperty("nodeBytes", static_cast<juce::int64>(memoryStats.nodeBytes));
    asObject(mem)->setProperty("stringBytes", static_cast<juce::int64>(memoryStats.stringBytes));
    asObject(mem)->setProperty("vectorBytes", static_cast<juce::int64>(memoryStats.vectorBytes));
    asObject(mem)->setProperty("userDataBytes", static_cast<juce::int64>(memoryStats.userDataBytes));
    asObject(mem)->setProperty("customPayloadBytes", static_cast<juce::int64>(memoryStats.customPayloadBytes));
    asObject(mem)->setProperty("compiledDisplayListBytes", static_cast<juce::int64>(memoryStats.compiledDisplayListBytes));
    asObject(mem)->setProperty("totalBytes", static_cast<juce::int64>(memoryStats.totalBytes()));
    asObject(obj)->setProperty("memory", mem);

    auto children = makeArray();
    for (auto* child : node->getChildren()) {
        append(children, makeNodeTree(child));
    }
    asObject(obj)->setProperty("children", children);
    return obj;
}

juce::var makeRenderNodeData(const ImGuiDirectHost::RenderNodeData& node) {
    auto obj = makeObject();
    asObject(obj)->setProperty("sceneBounds", makeRect(node.sceneBounds));
    asObject(obj)->setProperty("style", makeStyle(node.style));
    asObject(obj)->setProperty("visible", node.visible);
    asObject(obj)->setProperty("hasClipRect", node.hasClipRect);
    asObject(obj)->setProperty("clipRect", makeRect(node.clipRect));
    asObject(obj)->setProperty("zOrder", node.zOrder);
    asObject(obj)->setProperty("stableId", static_cast<juce::int64>(node.stableId));
    asObject(obj)->setProperty("compiledDisplayList", makeCompiledDisplayList(node.compiledDisplayList));
    asObject(obj)->setProperty("customSurfaceType", juce::String(node.customSurfaceType));
    asObject(obj)->setProperty("customRenderPayload", normaliseVar(node.customRenderPayload));
    auto childIndices = makeArray();
    for (int index : node.childIndices) {
        append(childIndices, index);
    }
    asObject(obj)->setProperty("childIndices", childIndices);
    return obj;
}

juce::var makeRenderSnapshot(const ImGuiDirectHost::RenderSnapshot& snapshot) {
    auto obj = makeObject();
    asObject(obj)->setProperty("transform", makePreviewTransform(snapshot.transform));
    asObject(obj)->setProperty("rootIndex", snapshot.rootIndex);
    auto nodes = makeArray();
    for (const auto& node : snapshot.nodes) {
        append(nodes, makeRenderNodeData(node));
    }
    asObject(obj)->setProperty("nodes", nodes);
    return obj;
}

juce::var makeStats(const ImGuiDirectHost::StatsSnapshot& stats) {
    auto obj = makeObject();
    asObject(obj)->setProperty("contextReady", stats.contextReady);
    asObject(obj)->setProperty("testWindowVisible", stats.testWindowVisible);
    asObject(obj)->setProperty("wantCaptureMouse", stats.wantCaptureMouse);
    asObject(obj)->setProperty("wantCaptureKeyboard", stats.wantCaptureKeyboard);
    asObject(obj)->setProperty("documentLoaded", stats.documentLoaded);
    asObject(obj)->setProperty("documentDirty", stats.documentDirty);
    asObject(obj)->setProperty("frameCount", static_cast<juce::int64>(stats.frameCount));
    asObject(obj)->setProperty("lastRenderUsObserved", stats.lastRenderUs > 0);
    asObject(obj)->setProperty("lastVertexCount", static_cast<juce::int64>(stats.lastVertexCount));
    asObject(obj)->setProperty("lastIndexCount", static_cast<juce::int64>(stats.lastIndexCount));
    asObject(obj)->setProperty("buttonClicks", static_cast<juce::int64>(stats.buttonClicks));
    asObject(obj)->setProperty("documentLineCount", static_cast<juce::int64>(stats.documentLineCount));
    asObject(obj)->setProperty("fontAtlasBytes", static_cast<juce::int64>(stats.fontAtlasBytes));
    asObject(obj)->setProperty("surfaceColorBytes", static_cast<juce::int64>(stats.surfaceColorBytes));
    asObject(obj)->setProperty("surfaceDepthBytes", static_cast<juce::int64>(stats.surfaceDepthBytes));
    asObject(obj)->setProperty("totalGpuBytes", static_cast<juce::int64>(stats.totalGpuBytes));
    asObject(obj)->setProperty("renderSnapshotBytes", static_cast<juce::int64>(stats.renderSnapshotBytes));
    asObject(obj)->setProperty("renderSnapshotNodeCount", static_cast<juce::int64>(stats.renderSnapshotNodeCount));
    asObject(obj)->setProperty("customSurfaceStateBytes", static_cast<juce::int64>(stats.customSurfaceStateBytes));
    asObject(obj)->setProperty("imguiWindowCount", static_cast<juce::int64>(stats.imguiWindowCount));
    asObject(obj)->setProperty("imguiTableCount", static_cast<juce::int64>(stats.imguiTableCount));
    asObject(obj)->setProperty("imguiTabBarCount", static_cast<juce::int64>(stats.imguiTabBarCount));
    asObject(obj)->setProperty("imguiViewportCount", static_cast<juce::int64>(stats.imguiViewportCount));
    asObject(obj)->setProperty("imguiFontCount", static_cast<juce::int64>(stats.imguiFontCount));
    asObject(obj)->setProperty("imguiWindowStateBytesObserved", stats.imguiWindowStateBytes > 0);
    asObject(obj)->setProperty("imguiDrawBufferBytes", static_cast<juce::int64>(stats.imguiDrawBufferBytes));
    asObject(obj)->setProperty("imguiInternalStateBytesObserved", stats.imguiInternalStateBytes > 0);
    return obj;
}

juce::var makePendingEvent(const ImGuiDirectHost::PendingEvent& event) {
    auto obj = makeObject();
    asObject(obj)->setProperty("type", static_cast<int>(event.type));
    asObject(obj)->setProperty("x", event.x);
    asObject(obj)->setProperty("y", event.y);
    asObject(obj)->setProperty("button", event.button);
    asObject(obj)->setProperty("down", event.down);
    asObject(obj)->setProperty("focused", event.focused);
    return obj;
}

juce::var makePendingDrag(const ImGuiDirectHost::PendingDragEvent& event) {
    auto obj = makeObject();
    asObject(obj)->setProperty("valid", event.valid);
    asObject(obj)->setProperty("stableId", static_cast<juce::int64>(event.stableId));
    asObject(obj)->setProperty("localPosition", makePoint(event.localPosition));
    asObject(obj)->setProperty("dragDelta", makePoint(event.dragDelta));
    asObject(obj)->setProperty("mods", static_cast<juce::int64>(event.mods.getRawFlags()));
    return obj;
}

juce::var makeEmbeddedPanelStates(const std::unordered_map<uint64_t, ImGuiDirectHost::EmbeddedPanelState>& states) {
    std::vector<uint64_t> keys;
    keys.reserve(states.size());
    for (const auto& [key, _] : states) {
        keys.push_back(key);
    }
    std::sort(keys.begin(), keys.end());

    auto arr = makeArray();
    for (auto key : keys) {
        const auto& state = states.at(key);
        auto obj = makeObject();
        asObject(obj)->setProperty("stableId", static_cast<juce::int64>(key));
        asObject(obj)->setProperty("hoveredNodeStableId", static_cast<juce::int64>(state.hoveredNodeStableId));
        asObject(obj)->setProperty("pressedNodeStableId", static_cast<juce::int64>(state.pressedNodeStableId));
        asObject(obj)->setProperty("dragStartScenePosition", makePoint(state.dragStartScenePosition));
        append(arr, obj);
    }
    return arr;
}

juce::var makeSortedIds(const std::unordered_set<uint64_t>& ids) {
    std::vector<uint64_t> sorted(ids.begin(), ids.end());
    std::sort(sorted.begin(), sorted.end());
    auto arr = makeArray();
    for (auto id : sorted) {
        append(arr, static_cast<juce::int64>(id));
    }
    return arr;
}

juce::var makeDeferredSurfaceRequests(const std::unordered_map<uint64_t, ImGuiDirectHost::DeferredSurfaceRequest>& requests) {
    std::vector<uint64_t> keys;
    keys.reserve(requests.size());
    for (const auto& [key, _] : requests) {
        keys.push_back(key);
    }
    std::sort(keys.begin(), keys.end());
    auto arr = makeArray();
    for (auto key : keys) {
        const auto& request = requests.at(key);
        auto obj = makeObject();
        asObject(obj)->setProperty("stableId", static_cast<juce::int64>(request.stableId));
        asObject(obj)->setProperty("nodeId", juce::String(request.nodeId));
        asObject(obj)->setProperty("surfaceType", juce::String(request.surfaceType));
        asObject(obj)->setProperty("payload", normaliseVar(request.payload));
        asObject(obj)->setProperty("width", request.width);
        asObject(obj)->setProperty("height", request.height);
        append(arr, obj);
    }
    return arr;
}

juce::var makeCachedSurfaceTextures(const std::unordered_map<uint64_t, ImGuiDirectHost::CachedSurfaceTexture>& textures) {
    std::vector<uint64_t> keys;
    keys.reserve(textures.size());
    for (const auto& [key, _] : textures) {
        keys.push_back(key);
    }
    std::sort(keys.begin(), keys.end());
    auto arr = makeArray();
    for (auto key : keys) {
        auto obj = makeObject();
        asObject(obj)->setProperty("stableId", static_cast<juce::int64>(key));
        asObject(obj)->setProperty("textureHandle", static_cast<juce::int64>(textures.at(key).textureHandle));
        append(arr, obj);
    }
    return arr;
}

juce::var makeDisplayListDebugStats() {
    const auto stats = RuntimeNode::getDisplayListDebugStats(false);
    auto obj = makeObject();
    asObject(obj)->setProperty("setCalls", static_cast<juce::int64>(stats.setCalls));
    asObject(obj)->setProperty("skippedSetCalls", static_cast<juce::int64>(stats.skippedSetCalls));
    asObject(obj)->setProperty("clearCalls", static_cast<juce::int64>(stats.clearCalls));
    asObject(obj)->setProperty("compileCalls", static_cast<juce::int64>(stats.compileCalls));
    asObject(obj)->setProperty("setCommands", static_cast<juce::int64>(stats.setCommands));
    asObject(obj)->setProperty("compiledCommands", static_cast<juce::int64>(stats.compiledCommands));
    asObject(obj)->setProperty("compileMicrosObserved", stats.compileMicros > 0);

    auto topEntries = [](const std::vector<std::pair<std::string, uint64_t>>& entries) {
        auto arr = makeArray();
        for (const auto& [name, count] : entries) {
            auto item = makeObject();
            asObject(item)->setProperty("name", juce::String(name));
            asObject(item)->setProperty("count", static_cast<juce::int64>(count));
            append(arr, item);
        }
        return arr;
    };

    asObject(obj)->setProperty("topSetByKey", topEntries(stats.topSetByKey));
    asObject(obj)->setProperty("topSkippedSetByKey", topEntries(stats.topSkippedSetByKey));
    asObject(obj)->setProperty("topCompileByKey", topEntries(stats.topCompileByKey));
    return obj;
}

juce::var snapshotHostState(const ImGuiDirectHost& host) {
    auto obj = makeObject();
    asObject(obj)->setProperty("componentBounds", makeRect(host.getBounds()));
    asObject(obj)->setProperty("visible", host.isVisible());
    asObject(obj)->setProperty("showing", host.isShowing());
    asObject(obj)->setProperty("opaque", host.isOpaque());
    asObject(obj)->setProperty("wantsKeyboardFocus", host.getWantsKeyboardFocus());
    asObject(obj)->setProperty("pressedNodeStableId", static_cast<juce::int64>(host.pressedNodeStableId_));
    asObject(obj)->setProperty("hoveredNodeStableId", static_cast<juce::int64>(host.hoveredNodeStableId_));
    asObject(obj)->setProperty("focusedNodeStableId", static_cast<juce::int64>(host.focusedNodeStableId_));
    asObject(obj)->setProperty("hoveredNodeId", juce::String(host.getHoveredNodeId()));
    asObject(obj)->setProperty("selectedNodeId", juce::String(host.getSelectedNodeId()));
    asObject(obj)->setProperty("debugOutlinesEnabled", host.debugOutlinesEnabled_);
    asObject(obj)->setProperty("copyIdModeEnabled", host.copyIdModeEnabled_);
    asObject(obj)->setProperty("openGLAttached", host.openGLContext_.isAttached());
    asObject(obj)->setProperty("eglContextPresent", host.eglOffscreenContext_ != nullptr);
    asObject(obj)->setProperty("imguiContextPresent", host.imguiContext_ != nullptr);
    asObject(obj)->setProperty("contextReady", host.contextReady_);
    asObject(obj)->setProperty("wantCaptureMouse", host.wantCaptureMouse_.load(std::memory_order_relaxed));
    asObject(obj)->setProperty("wantCaptureKeyboard", host.wantCaptureKeyboard_.load(std::memory_order_relaxed));
    asObject(obj)->setProperty("frameCount", static_cast<juce::int64>(host.frameCount_.load(std::memory_order_relaxed)));
    asObject(obj)->setProperty("lastRenderUsObserved", host.lastRenderUs_.load(std::memory_order_relaxed) > 0);
    asObject(obj)->setProperty("lastVertexCount", static_cast<juce::int64>(host.lastVertexCount_.load(std::memory_order_relaxed)));
    asObject(obj)->setProperty("lastIndexCount", static_cast<juce::int64>(host.lastIndexCount_.load(std::memory_order_relaxed)));
    asObject(obj)->setProperty("fontAtlasBytes", static_cast<juce::int64>(host.fontAtlasBytes_.load(std::memory_order_relaxed)));
    asObject(obj)->setProperty("surfaceColorBytes", static_cast<juce::int64>(host.surfaceColorBytes_.load(std::memory_order_relaxed)));
    asObject(obj)->setProperty("surfaceDepthBytes", static_cast<juce::int64>(host.surfaceDepthBytes_.load(std::memory_order_relaxed)));
    asObject(obj)->setProperty("previewTransform", makePreviewTransform(host.previewTransform_));
    asObject(obj)->setProperty("embeddedPanelStates", makeEmbeddedPanelStates(host.embeddedPanelStates_));
    asObject(obj)->setProperty("embeddedPanelTouchedSurfaceIds", makeSortedIds(host.embeddedPanelTouchedSurfaceIds_));
    asObject(obj)->setProperty("deferredSurfaceRequests", makeDeferredSurfaceRequests(host.deferredSurfaceRequests_));
    asObject(obj)->setProperty("deferredSurfaceOrder", normaliseVar(juce::var()));
    auto deferredOrder = makeArray();
    for (auto id : host.deferredSurfaceOrder_) {
        append(deferredOrder, static_cast<juce::int64>(id));
    }
    asObject(obj)->setProperty("deferredSurfaceOrder", deferredOrder);
    asObject(obj)->setProperty("cachedSurfaceTextures", makeCachedSurfaceTextures(host.cachedSurfaceTextures_));
    asObject(obj)->setProperty("pendingDragEvent", makePendingDrag(host.pendingDragEvent_));
    asObject(obj)->setProperty("lastContinuousInputDispatchObserved", host.lastContinuousInputDispatchMs_ > 0.0);
    auto pendingEvents = makeArray();
    for (const auto& event : host.pendingEvents_) {
        append(pendingEvents, makePendingEvent(event));
    }
    asObject(obj)->setProperty("pendingEvents", pendingEvents);
    asObject(obj)->setProperty("leftMouseDown", host.leftMouseDown_);
    asObject(obj)->setProperty("rightMouseDown", host.rightMouseDown_);
    asObject(obj)->setProperty("middleMouseDown", host.middleMouseDown_);
    asObject(obj)->setProperty("renderInProgress", host.renderInProgress_);
    asObject(obj)->setProperty("skipNextSwap", host.skipNextSwap_);
    asObject(obj)->setProperty("forceNextRender", host.forceNextRender_);
    asObject(obj)->setProperty("pendingSnapshot", makeRenderSnapshot(host.pendingSnapshot_));
    asObject(obj)->setProperty("activeSnapshot", makeRenderSnapshot(host.activeSnapshot_));
    asObject(obj)->setProperty("glSnapshot", makeRenderSnapshot(host.glSnapshot_));
    asObject(obj)->setProperty("snapshotReady", host.snapshotReady_.load(std::memory_order_relaxed));
    asObject(obj)->setProperty("surfaceProviderCount", static_cast<int>(host.surfaceProviders_.size()));
    asObject(obj)->setProperty("videoSurfaceProviderPresent", host.videoSurfaceProvider_ != nullptr);
    asObject(obj)->setProperty("generatedSourceProviderPresent", host.generatedSourceProvider_ != nullptr);
    asObject(obj)->setProperty("shaderSurfaceProviderPresent", host.shaderSurfaceProvider_ != nullptr);
    asObject(obj)->setProperty("compositeSurfaceProviderPresent", host.compositeSurfaceProvider_ != nullptr);
#if MANIFOLD_HAS_ML
    asObject(obj)->setProperty("mlMaskSurfaceProviderPresent", host.mlMaskSurfaceProvider_ != nullptr);
#else
    asObject(obj)->setProperty("mlMaskSurfaceProviderPresent", false);
#endif
    asObject(obj)->setProperty("stats", makeStats(host.getStatsSnapshot()));
    asObject(obj)->setProperty("liveRoot", makeNodeTree(host.liveRoot_));
    asObject(obj)->setProperty("displayListDebugStats", makeDisplayListDebugStats());
    return obj;
}

uint64_t fnv1a64(const void* data, size_t size) {
    uint64_t hash = 1469598103934665603ull;
    const auto* bytes = static_cast<const std::uint8_t*>(data);
    for (size_t i = 0; i < size; ++i) {
        hash ^= static_cast<uint64_t>(bytes[i]);
        hash *= 1099511628211ull;
    }
    return hash;
}

std::string encodePngBase64(const juce::Image& image) {
    if (!image.isValid()) {
        return {};
    }

    juce::MemoryOutputStream out;
    juce::PNGImageFormat png;
    if (!png.writeImageToStream(image, out)) {
        return {};
    }
    return toStdString(juce::Base64::toBase64(out.getData(), out.getDataSize()));
}

juce::var makeImageContract(const juce::Image& image, const std::vector<juce::Point<int>>& samplePoints = {}) {
    auto obj = makeObject();
    asObject(obj)->setProperty("valid", image.isValid());
    if (!image.isValid()) {
        return obj;
    }

    const int w = image.getWidth();
    const int h = image.getHeight();
    asObject(obj)->setProperty("width", w);
    asObject(obj)->setProperty("height", h);

    uint64_t alphaNonZero = 0;
    uint64_t opaquePixels = 0;
    uint64_t sumA = 0;
    uint64_t sumR = 0;
    uint64_t sumG = 0;
    uint64_t sumB = 0;
    uint64_t hash = 1469598103934665603ull;

    juce::Image::BitmapData pixels(image, juce::Image::BitmapData::readOnly);
    for (int y = 0; y < h; ++y) {
        const auto* line = pixels.getLinePointer(y);
        for (int x = 0; x < w; ++x) {
            const auto b = static_cast<std::uint8_t>(line[x * 4 + 0]);
            const auto g = static_cast<std::uint8_t>(line[x * 4 + 1]);
            const auto r = static_cast<std::uint8_t>(line[x * 4 + 2]);
            const auto a = static_cast<std::uint8_t>(line[x * 4 + 3]);
            if (a != 0) ++alphaNonZero;
            if (a == 255) ++opaquePixels;
            sumA += a;
            sumR += r;
            sumG += g;
            sumB += b;
            const std::uint8_t rgba[4] = { r, g, b, a };
            hash = fnv1a64(rgba, sizeof(rgba)) ^ (hash << 1);
        }
    }

    asObject(obj)->setProperty("hash64", juce::String::toHexString(static_cast<juce::int64>(hash)));
    asObject(obj)->setProperty("alphaNonZeroPixels", static_cast<juce::int64>(alphaNonZero));
    asObject(obj)->setProperty("opaquePixels", static_cast<juce::int64>(opaquePixels));
    asObject(obj)->setProperty("sumA", static_cast<juce::int64>(sumA));
    asObject(obj)->setProperty("sumR", static_cast<juce::int64>(sumR));
    asObject(obj)->setProperty("sumG", static_cast<juce::int64>(sumG));
    asObject(obj)->setProperty("sumB", static_cast<juce::int64>(sumB));
    asObject(obj)->setProperty("pngBase64", juce::String(encodePngBase64(image)));

    auto samples = makeArray();
    for (const auto& point : samplePoints) {
        auto sample = makeObject();
        asObject(sample)->setProperty("x", point.x);
        asObject(sample)->setProperty("y", point.y);
        if (point.x >= 0 && point.x < w && point.y >= 0 && point.y < h) {
            const auto pixel = image.getPixelAt(point.x, point.y);
            asObject(sample)->setProperty("argb", static_cast<juce::int64>(pixel.getARGB()));
        } else {
            asObject(sample)->setProperty("argb", juce::String("<out-of-bounds>"));
        }
        append(samples, sample);
    }
    asObject(obj)->setProperty("samples", samples);
    return obj;
}

struct ContractSurfaceProvider final : CustomSurfaceProvider {
    bool handlesType(const std::string& surfaceType) const override {
        return surfaceType == "contract_surface";
    }

    std::uintptr_t prepareTexture(const RuntimeNode& node,
                                  int width,
                                  int height,
                                  double timeSeconds) override {
        ++prepareCalls;
        lastStableId = node.getStableId();
        lastWidth = width;
        lastHeight = height;
        lastTime = timeSeconds;
        lastHandle = 0x60000000ull + static_cast<std::uintptr_t>(prepareCalls);
        return lastHandle;
    }

    bool getSurfaceInfo(uint64_t stableId, int& width, int& height, uint64_t& sequence) const override {
        if (stableId != lastStableId || lastStableId == 0) {
            return false;
        }
        width = lastWidth;
        height = lastHeight;
        sequence = static_cast<uint64_t>(prepareCalls);
        return true;
    }

    void prune(const std::unordered_set<uint64_t>& touchedStableIds) override {
        ++pruneCalls;
        lastPruned.assign(touchedStableIds.begin(), touchedStableIds.end());
        std::sort(lastPruned.begin(), lastPruned.end());
    }

    void releaseAll() override {
        ++releaseAllCalls;
    }

    juce::var snapshot() const {
        auto obj = makeObject();
        asObject(obj)->setProperty("prepareCalls", prepareCalls);
        asObject(obj)->setProperty("pruneCalls", pruneCalls);
        asObject(obj)->setProperty("releaseAllCalls", releaseAllCalls);
        asObject(obj)->setProperty("lastStableId", static_cast<juce::int64>(lastStableId));
        asObject(obj)->setProperty("lastWidth", lastWidth);
        asObject(obj)->setProperty("lastHeight", lastHeight);
        asObject(obj)->setProperty("lastTime", juce::String(formatFloat(lastTime)));
        asObject(obj)->setProperty("lastHandle", static_cast<juce::int64>(lastHandle));
        auto arr = makeArray();
        for (auto id : lastPruned) {
            append(arr, static_cast<juce::int64>(id));
        }
        asObject(obj)->setProperty("lastPruned", arr);
        return obj;
    }

    int prepareCalls = 0;
    int pruneCalls = 0;
    int releaseAllCalls = 0;
    uint64_t lastStableId = 0;
    int lastWidth = 0;
    int lastHeight = 0;
    double lastTime = 0.0;
    std::uintptr_t lastHandle = 0;
    std::vector<uint64_t> lastPruned;
};

juce::var makeCallbackLog(const std::vector<std::string>& log) {
    auto arr = makeArray();
    for (const auto& entry : log) {
        append(arr, juce::String(entry));
    }
    return arr;
}

void logEntry(std::vector<std::string>& log, const std::string& entry) {
    log.push_back(entry);
}

juce::var makeDisplayList() {
    auto list = makeArray();

    auto fill = makeObject();
    asObject(fill)->setProperty("cmd", "fillRect");
    asObject(fill)->setProperty("x", 4);
    asObject(fill)->setProperty("y", 4);
    asObject(fill)->setProperty("w", 60);
    asObject(fill)->setProperty("h", 22);
    asObject(fill)->setProperty("color", static_cast<juce::int64>(0xffdd8844u));
    append(list, fill);

    auto border = makeObject();
    asObject(border)->setProperty("cmd", "drawRect");
    asObject(border)->setProperty("x", 2);
    asObject(border)->setProperty("y", 2);
    asObject(border)->setProperty("w", 64);
    asObject(border)->setProperty("h", 26);
    asObject(border)->setProperty("color", static_cast<juce::int64>(0xffffffffu));
    asObject(border)->setProperty("thickness", 2.0);
    append(list, border);

    auto line = makeObject();
    asObject(line)->setProperty("cmd", "drawLine");
    asObject(line)->setProperty("x1", 0);
    asObject(line)->setProperty("y1", 0);
    asObject(line)->setProperty("x2", 70);
    asObject(line)->setProperty("y2", 30);
    asObject(line)->setProperty("color", static_cast<juce::int64>(0xff44ddee));
    asObject(line)->setProperty("thickness", 1.5);
    append(list, line);

    auto circle = makeObject();
    asObject(circle)->setProperty("cmd", "fillCircle");
    asObject(circle)->setProperty("x", 52);
    asObject(circle)->setProperty("y", 18);
    asObject(circle)->setProperty("radius", 8.0);
    asObject(circle)->setProperty("color", static_cast<juce::int64>(0xff55ff99u));
    append(list, circle);

    return list;
}

void fillPanelRoot(RuntimeNode& panel) {
    panel.setNodeId("embedded_root");
    panel.setBounds(0, 0, 180, 120);
    RuntimeNode::StyleState rootStyle;
    rootStyle.background = 0xff112233u;
    rootStyle.border = 0xff88aaffu;
    rootStyle.borderWidth = 2.0f;
    rootStyle.cornerRadius = 6.0f;
    panel.setStyle(rootStyle);

    auto* child = panel.createChild("EmbeddedChild");
    child->setNodeId("embedded_child");
    child->setBounds(12, 14, 90, 40);
    RuntimeNode::StyleState childStyle;
    childStyle.background = 0xff335577u;
    childStyle.border = 0xffffcc66u;
    childStyle.borderWidth = 1.0f;
    childStyle.cornerRadius = 4.0f;
    child->setStyle(childStyle);
    child->setDisplayList(makeDisplayList());
}

void fillMainRoot(RuntimeNode& root,
                  sol::state& lua,
                  std::vector<std::string>& callbackLog,
                  RuntimeNode& panelRoot) {
    root.setNodeId("root");
    root.setBounds(0, 0, 640, 360);
    RuntimeNode::StyleState rootStyle;
    rootStyle.background = 0xff203040u;
    rootStyle.border = 0xff90a0b0u;
    rootStyle.borderWidth = 3.0f;
    rootStyle.cornerRadius = 8.0f;
    root.setStyle(rootStyle);

    lua.set_function("cb_mouse_down", [&](double x, double y, bool shift, bool ctrl, bool alt, bool right) {
        logEntry(callbackLog, "mouseDown:" + formatFloat(x) + "," + formatFloat(y) + ":" + (shift ? "S" : "-") + (ctrl ? "C" : "-") + (alt ? "A" : "-") + (right ? "R" : "L"));
    });
    lua.set_function("cb_mouse_drag", [&](double x, double y, double dx, double dy, bool shift, bool ctrl, bool alt, bool right) {
        juce::ignoreUnused(shift, ctrl, alt, right);
        logEntry(callbackLog, "mouseDrag:" + formatFloat(x) + "," + formatFloat(y) + ":" + formatFloat(dx) + "," + formatFloat(dy));
    });
    lua.set_function("cb_mouse_up", [&](double x, double y, bool shift, bool ctrl, bool alt, bool right) {
        juce::ignoreUnused(shift, ctrl, alt, right);
        logEntry(callbackLog, "mouseUp:" + formatFloat(x) + "," + formatFloat(y));
    });
    lua.set_function("cb_mouse_move", [&](double x, double y, bool shift, bool ctrl, bool alt) {
        juce::ignoreUnused(shift, ctrl, alt);
        logEntry(callbackLog, "mouseMove:" + formatFloat(x) + "," + formatFloat(y));
    });
    lua.set_function("cb_mouse_wheel", [&](double x, double y, double dy, bool shift, bool ctrl, bool alt) {
        juce::ignoreUnused(shift, ctrl, alt);
        logEntry(callbackLog, "mouseWheel:" + formatFloat(x) + "," + formatFloat(y) + ":" + formatFloat(dy));
    });
    lua.set_function("cb_click", [&]() {
        logEntry(callbackLog, "click");
    });
    lua.set_function("cb_double_click", [&]() {
        logEntry(callbackLog, "doubleClick");
    });
    lua.set_function("cb_enter", [&]() {
        logEntry(callbackLog, "enter");
    });
    lua.set_function("cb_exit", [&]() {
        logEntry(callbackLog, "exit");
    });
    lua.set_function("cb_key", [&](int keyCode, int textCharacter, bool shift, bool ctrl, bool alt) {
        juce::ignoreUnused(shift, ctrl, alt);
        logEntry(callbackLog, "key:" + std::to_string(keyCode) + ":" + std::to_string(textCharacter));
        return true;
    });
    lua.set_function("cb_imgui_frame", [&](RuntimeNode&) {
        logEntry(callbackLog, "imguiFrame");
        if (auto* host = ImGuiDirectHost::getActiveInstance()) {
            ImGui::SetNextWindowPos(ImVec2(420.0f, 24.0f), ImGuiCond_Always);
            ImGui::SetNextWindowSize(ImVec2(200.0f, 140.0f), ImGuiCond_Always);
            constexpr ImGuiWindowFlags flags = ImGuiWindowFlags_NoSavedSettings | ImGuiWindowFlags_NoCollapse;
            if (ImGui::Begin("ContractEmbeddedPanel", nullptr, flags)) {
                ImGuiDirectHost::EmbeddedPanelOptions options;
                options.fitToView = true;
                options.captureWheel = true;
                const bool hovered = host->renderEmbeddedRuntimePanel(panelRoot, 180.0f, 120.0f, options);
                logEntry(callbackLog, std::string("embeddedPanelHovered:") + (hovered ? "true" : "false"));
            }
            ImGui::End();
        }
    });

    auto* button = root.createChild("ButtonNode");
    button->setNodeId("button");
    button->setWidgetType("Button");
    button->setBounds(48, 36, 140, 72);
    button->setClipRect(4, 4, 120, 56);
    RuntimeNode::StyleState buttonStyle;
    buttonStyle.background = 0xff446688u;
    buttonStyle.border = 0xffffcc66u;
    buttonStyle.borderWidth = 2.0f;
    buttonStyle.cornerRadius = 10.0f;
    button->setStyle(buttonStyle);
    RuntimeNode::InputCapabilities buttonCaps;
    buttonCaps.pointer = true;
    buttonCaps.wheel = true;
    buttonCaps.keyboard = true;
    buttonCaps.focusable = true;
    button->setInputCapabilities(buttonCaps);
    button->setDisplayList(makeDisplayList());
    auto& callbacks = button->getCallbacks();
    callbacks.onMouseDown = lua["cb_mouse_down"];
    callbacks.onMouseDrag = lua["cb_mouse_drag"];
    callbacks.onMouseUp = lua["cb_mouse_up"];
    callbacks.onMouseMove = lua["cb_mouse_move"];
    callbacks.onMouseWheel = lua["cb_mouse_wheel"];
    callbacks.onClick = lua["cb_click"];
    callbacks.onDoubleClick = lua["cb_double_click"];
    callbacks.onMouseEnter = lua["cb_enter"];
    callbacks.onMouseExit = lua["cb_exit"];
    callbacks.onKeyPress = lua["cb_key"];

    auto* transformed = root.createChild("TransformNode");
    transformed->setNodeId("transformer");
    transformed->setWidgetType("Panel");
    transformed->setBounds(260, 54, 130, 92);
    transformed->setTransform(1.2f, 0.9f, 8.0f, 12.0f);
    RuntimeNode::StyleState transformedStyle;
    transformedStyle.background = 0xff884455u;
    transformedStyle.border = 0xffddeeffu;
    transformedStyle.borderWidth = 1.0f;
    transformedStyle.cornerRadius = 5.0f;
    transformed->setStyle(transformedStyle);
    transformed->setDisplayList(makeDisplayList());

    auto* hidden = root.createChild("HiddenNode");
    hidden->setNodeId("hidden");
    hidden->setBounds(420, 80, 120, 80);
    hidden->setVisible(false);

    root.getCallbacks().onImGuiFrame = lua["cb_imgui_frame"];
}

juce::MouseEvent makeMouseEvent(juce::Component& component,
                                juce::Point<float> position,
                                juce::ModifierKeys mods,
                                juce::Point<float> mouseDownPos,
                                int clicks,
                                bool dragged,
                                int64_t eventMs,
                                int64_t downMs) {
    auto source = juce::Desktop::getInstance().getMainMouseSource();
    return juce::MouseEvent(source,
                            position,
                            mods,
                            1.0f,
                            0.0f,
                            0.0f,
                            0.0f,
                            0.0f,
                            &component,
                            &component,
                            juce::Time(eventMs),
                            mouseDownPos,
                            juce::Time(downMs),
                            clicks,
                            dragged);
}

std::string buildContract() {
    RuntimeNode::getDisplayListDebugStats(true);

    sol::state lua;
    lua.open_libraries(sol::lib::base, sol::lib::math, sol::lib::table, sol::lib::string);

    std::vector<std::string> callbackLog;
    std::vector<std::string> globalKeyLog;
    std::vector<std::string> copyIdLog;

    RuntimeNode panelRoot("EmbeddedPanelRoot");
    fillPanelRoot(panelRoot);
    RuntimeNode root("Root");
    fillMainRoot(root, lua, callbackLog, panelRoot);

    auto hostPtr = std::make_unique<ImGuiDirectHost>();
    ImGuiDirectHost& host = *hostPtr;
    host.setBounds(0, 0, 640, 360);
    host.setVisible(true);
    host.setCopyIdCallback([&](const std::string& value) {
        copyIdLog.push_back(value);
    });
    host.setGlobalKeyHandler([&](const juce::KeyPress& key) {
        globalKeyLog.push_back("global:" + std::to_string(key.getKeyCode()));
        return key.getKeyCode() == juce::KeyPress::F1Key;
    });

    auto provider = std::make_shared<ContractSurfaceProvider>();
    host.registerSurfaceProvider(provider);

    RuntimeNode surfaceNode("SurfaceNode");
    surfaceNode.setNodeId("surface_node");
    surfaceNode.setBounds(0, 0, 32, 24);
    surfaceNode.setCustomSurfaceType("contract_surface");
    auto payload = makeObject();
    asObject(payload)->setProperty("kind", "contract");
    asObject(payload)->setProperty("seed", 17);
    surfaceNode.setCustomRenderPayload(payload);

    auto contract = makeObject();
    asObject(contract)->setProperty("initialState", snapshotHostState(host));

    host.resized();
    host.visibilityChanged();
    host.parentHierarchyChanged();
    asObject(contract)->setProperty("afterLifecycleCalls", snapshotHostState(host));

    host.setRootNode(&root);
    host.buildRenderSnapshot();
    asObject(contract)->setProperty("afterSetRoot", snapshotHostState(host));

    const bool eglReady = host.ensureEglOffscreenContext(640, 360);
    asObject(contract)->setProperty("ensureEglOffscreenContext", eglReady);
    asObject(contract)->setProperty("afterEnsureEglOffscreenContext", snapshotHostState(host));

    const auto buttonStableId = root.findById("button") ? root.findById("button")->getStableId() : 0;
    const auto transformerStableId = root.findById("transformer") ? root.findById("transformer")->getStableId() : 0;

    auto hitTests = makeObject();
    {
        auto pointerHit = host.hitTestLiveTree(juce::Point<float>(80.0f, 60.0f), manifold::ui::imgui::RuntimeNodeRenderer::HitTestMode::Pointer);
        auto wheelHit = host.hitTestLiveTree(juce::Point<float>(80.0f, 60.0f), manifold::ui::imgui::RuntimeNodeRenderer::HitTestMode::Wheel);
        auto anyHit = host.hitTestLiveTree(juce::Point<float>(300.0f, 90.0f), manifold::ui::imgui::RuntimeNodeRenderer::HitTestMode::AnyVisible);
        auto encodeHit = [](const manifold::ui::imgui::RuntimeNodeRenderer::HitTestResult& hit) {
            auto obj = makeObject();
            asObject(obj)->setProperty("nodeId", juce::String(hit.node ? hit.node->getNodeId() : std::string{}));
            asObject(obj)->setProperty("stableId", static_cast<juce::int64>(hit.stableId));
            asObject(obj)->setProperty("sceneBounds", makeRect(hit.sceneBounds));
            asObject(obj)->setProperty("scenePosition", makePoint(hit.scenePosition));
            return obj;
        };
        asObject(hitTests)->setProperty("pointer", encodeHit(pointerHit));
        asObject(hitTests)->setProperty("wheel", encodeHit(wheelHit));
        asObject(hitTests)->setProperty("anyVisible", encodeHit(anyHit));
    }
    asObject(contract)->setProperty("hitTests", hitTests);

    auto geometry = makeObject();
    asObject(geometry)->setProperty("sceneFromLocal_80_60", makePoint(host.scenePositionFromLocal({80.0f, 60.0f})));
    asObject(geometry)->setProperty("sceneFromLocal_300_90", makePoint(host.scenePositionFromLocal({300.0f, 90.0f})));
    auto* foundButton = host.findLiveNodeByStableId(buttonStableId);
    auto* foundWheelTarget = host.findLiveWheelTarget(foundButton);
    asObject(geometry)->setProperty("findLiveNode_button", juce::String(foundButton ? foundButton->getNodeId() : std::string{}));
    asObject(geometry)->setProperty("findLiveWheelTarget_button", juce::String(foundWheelTarget ? foundWheelTarget->getNodeId() : std::string{}));
    asObject(contract)->setProperty("geometryQueries", geometry);

    auto surfaceApi = makeObject();
    const auto prepareImmediate = host.prepareCustomSurfaceTextureImmediate(surfaceNode, 32, 24, 1.5);
    const auto prepareIndirect = host.prepareCustomSurfaceTexture(surfaceNode, 48, 28, 2.25);
    host.processDeferredSurfaceRequests(3.5);
    int infoW = 0;
    int infoH = 0;
    uint64_t infoSeq = 0;
    const bool infoOk = host.getVideoSurfaceInfo(surfaceNode.getStableId(), infoW, infoH, infoSeq);
    host.unregisterSurfaceProvider("contract_surface");
    const auto prepareAfterUnregister = host.prepareCustomSurfaceTexture(surfaceNode, 64, 32, 4.0);
    asObject(surfaceApi)->setProperty("prepareImmediate", static_cast<juce::int64>(prepareImmediate));
    asObject(surfaceApi)->setProperty("prepareIndirect", static_cast<juce::int64>(prepareIndirect));
    asObject(surfaceApi)->setProperty("getVideoSurfaceInfoOk", infoOk);
    asObject(surfaceApi)->setProperty("getVideoSurfaceInfoWidth", infoW);
    asObject(surfaceApi)->setProperty("getVideoSurfaceInfoHeight", infoH);
    asObject(surfaceApi)->setProperty("getVideoSurfaceInfoSequence", static_cast<juce::int64>(infoSeq));
    asObject(surfaceApi)->setProperty("prepareAfterUnregister", static_cast<juce::int64>(prepareAfterUnregister));
    asObject(surfaceApi)->setProperty("providerState", provider->snapshot());
    asObject(contract)->setProperty("surfaceApi", surfaceApi);

    const std::vector<juce::Point<int>> samplePoints {
        { 0, 0 }, { 80, 60 }, { 118, 72 }, { 300, 90 }, { 500, 40 }, { 639, 359 }
    };

    const auto screenshot = host.captureScreenshot();
    asObject(contract)->setProperty("captureScreenshot", makeImageContract(screenshot, samplePoints));
    asObject(contract)->setProperty("afterCaptureScreenshot", snapshotHostState(host));

    const auto readback = host.readbackFramebuffer();
    asObject(contract)->setProperty("readbackFramebuffer", makeImageContract(readback, samplePoints));

    auto bounds = makeObject();
    auto buttonBounds = host.getRenderedNodeBounds("button", buttonStableId);
    auto transformBounds = host.getRenderedNodeBounds("transformer", transformerStableId);
    asObject(bounds)->setProperty("button", buttonBounds ? makeRect(*buttonBounds) : juce::var("<none>"));
    asObject(bounds)->setProperty("transformer", transformBounds ? makeRect(*transformBounds) : juce::var("<none>"));
    asObject(bounds)->setProperty("missing", host.getRenderedNodeBounds("missing") ? juce::String("<unexpected>") : juce::String("<none>"));
    asObject(contract)->setProperty("renderedNodeBounds", bounds);

    host.setDebugOutlinesEnabled(true);
    asObject(contract)->setProperty("debugOutlinesScreenshot", makeImageContract(host.captureScreenshot(), samplePoints));
    host.setDebugOutlinesEnabled(false);

    host.setCopyIdModeEnabled(true);
    asObject(contract)->setProperty("copyIdOverlayScreenshot", makeImageContract(host.captureScreenshot(), samplePoints));
    const auto copyDown = makeMouseEvent(host,
                                         {80.0f, 60.0f},
                                         juce::ModifierKeys::leftButtonModifier,
                                         {80.0f, 60.0f},
                                         1,
                                         false,
                                         1000,
                                         1000);
    host.mouseDown(copyDown);
    host.setCopyIdModeEnabled(false);

    const auto moveEvent = makeMouseEvent(host, {80.0f, 60.0f}, juce::ModifierKeys(), {80.0f, 60.0f}, 0, false, 1100, 1000);
    host.mouseMove(moveEvent);
    const auto downEvent = makeMouseEvent(host,
                                          {80.0f, 60.0f},
                                          juce::ModifierKeys::leftButtonModifier,
                                          {80.0f, 60.0f},
                                          1,
                                          false,
                                          1200,
                                          1200);
    host.mouseDown(downEvent);
    const auto dragEvent = makeMouseEvent(host,
                                          {118.0f, 72.0f},
                                          juce::ModifierKeys::leftButtonModifier,
                                          {80.0f, 60.0f},
                                          1,
                                          true,
                                          1300,
                                          1200);
    host.mouseDrag(dragEvent);
    juce::MouseWheelDetails wheel { 0.0f, 1.25f, false, false, false };
    const auto wheelEvent = makeMouseEvent(host, {86.0f, 64.0f}, juce::ModifierKeys(), {80.0f, 60.0f}, 0, false, 1350, 1200);
    host.mouseWheelMove(wheelEvent, wheel);
    const auto upEvent = makeMouseEvent(host,
                                        {118.0f, 72.0f},
                                        juce::ModifierKeys::leftButtonModifier,
                                        {80.0f, 60.0f},
                                        1,
                                        true,
                                        1400,
                                        1200);
    host.mouseUp(upEvent);
    host.keyPressed(juce::KeyPress(juce::KeyPress::F1Key));
    host.keyPressed(juce::KeyPress('k', juce::ModifierKeys::ctrlModifier, 'k'));
    host.mouseExit(makeMouseEvent(host, {-1.0f, -1.0f}, juce::ModifierKeys(), {80.0f, 60.0f}, 0, false, 1500, 1200));

    asObject(contract)->setProperty("callbackLog", makeCallbackLog(callbackLog));
    asObject(contract)->setProperty("copyIdLog", makeCallbackLog(copyIdLog));
    asObject(contract)->setProperty("globalKeyLog", makeCallbackLog(globalKeyLog));
    asObject(contract)->setProperty("afterInput", snapshotHostState(host));
    asObject(contract)->setProperty("postInputScreenshot", makeImageContract(host.captureScreenshot(), samplePoints));

    host.shutdown();
    asObject(contract)->setProperty("afterShutdown", snapshotHostState(host));
    asObject(contract)->setProperty("readbackAfterShutdown", makeImageContract(host.readbackFramebuffer(), samplePoints));

    hostPtr.release();
    return juce::JSON::toString(contract, true).toStdString();
}

void usage(const char* argv0) {
    std::fprintf(stderr,
                 "Usage: %s [--print-contract | --write-contract PATH | --verify-contract PATH]\n",
                 argv0);
}

bool writeFile(const std::string& path, const std::string& content) {
    std::ofstream out(path, std::ios::binary);
    if (!out) {
        return false;
    }
    out << content;
    return out.good();
}

bool readFile(const std::string& path, std::string& content) {
    std::ifstream in(path, std::ios::binary);
    if (!in) {
        return false;
    }
    content.assign(std::istreambuf_iterator<char>(in), std::istreambuf_iterator<char>());
    return true;
}

} // namespace

int main(int argc, char** argv) {
    bool printContract = false;
    bool writeContractFlag = false;
    bool verifyContract = false;
    std::string path;

    for (int i = 1; i < argc; ++i) {
        const std::string arg = argv[i];
        if (arg == "--print-contract") {
            printContract = true;
        } else if (arg == "--write-contract" && i + 1 < argc) {
            writeContractFlag = true;
            path = argv[++i];
        } else if (arg == "--verify-contract" && i + 1 < argc) {
            verifyContract = true;
            path = argv[++i];
        } else {
            usage(argv[0]);
            return 2;
        }
    }

    if (!printContract && !writeContractFlag && !verifyContract) {
        usage(argv[0]);
        return 2;
    }

    const auto contract = buildContract();

    if (printContract) {
        std::printf("%s\n", contract.c_str());
        return 0;
    }

    if (writeContractFlag) {
        if (!writeFile(path, contract)) {
            std::fprintf(stderr, "Failed to write contract to %s\n", path.c_str());
            return 1;
        }
        return 0;
    }

    std::string golden;
    if (!readFile(path, golden)) {
        std::fprintf(stderr, "Failed to read contract from %s\n", path.c_str());
        return 1;
    }

    const auto currentVar = juce::JSON::parse(contract);
    const auto goldenVar = juce::JSON::parse(golden);
    const auto currentStr = juce::JSON::toString(currentVar, true).toStdString();
    const auto goldenStr = juce::JSON::toString(goldenVar, true).toStdString();
    if (currentStr != goldenStr) {
        std::fprintf(stderr, "ImGuiDirectHost contract mismatch against %s\n", path.c_str());
        return 1;
    }

    return 0;
}
