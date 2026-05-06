#include "../core/EditorLifecycleSupport.h"

#include "ContractHarnessUtils.h"

#include <juce_core/juce_core.h>
#include <juce_graphics/juce_graphics.h>

#include <algorithm>
#include <vector>

namespace {

using namespace contract_harness_utils;
using namespace editor_lifecycle;

juce::String indentString(int indent) {
  juce::String out;
  for (int i = 0; i < indent; ++i) out += "  ";
  return out;
}

void appendCanonicalJson(const juce::var& value, juce::String& out, int indent) {
  if (auto* object = value.getDynamicObject()) {
    struct PropertyEntry { juce::String name; juce::var value; };
    std::vector<PropertyEntry> properties;
    const auto& namedValues = object->getProperties();
    properties.reserve(static_cast<std::size_t>(namedValues.size()));
    for (int i = 0; i < namedValues.size(); ++i) {
      properties.push_back({namedValues.getName(i).toString(), namedValues.getValueAt(i)});
    }
    std::sort(properties.begin(), properties.end(),
              [](const PropertyEntry& a, const PropertyEntry& b) { return a.name < b.name; });

    out += "{\n";
    for (std::size_t i = 0; i < properties.size(); ++i) {
      out += indentString(indent + 1);
      out += juce::JSON::toString(juce::var(properties[i].name), true);
      out += ": ";
      appendCanonicalJson(properties[i].value, out, indent + 1);
      if (i + 1 < properties.size()) out += ",";
      out += "\n";
    }
    out += indentString(indent);
    out += "}";
    return;
  }

  if (auto* array = value.getArray()) {
    out += "[";
    if (!array->isEmpty()) {
      out += "\n";
      for (int i = 0; i < array->size(); ++i) {
        out += indentString(indent + 1);
        appendCanonicalJson(array->getReference(i), out, indent + 1);
        if (i + 1 < array->size()) out += ",";
        out += "\n";
      }
      out += indentString(indent);
    }
    out += "]";
    return;
  }

  out += juce::JSON::toString(value, true);
}

juce::var rectToVar(const juce::Rectangle<int>& rect) {
  auto* obj = new juce::DynamicObject();
  obj->setProperty("x", rect.getX());
  obj->setProperty("y", rect.getY());
  obj->setProperty("w", rect.getWidth());
  obj->setProperty("h", rect.getHeight());
  return juce::var(obj);
}

juce::var buildFullContract() {
  auto* root = new juce::DynamicObject();
  root->setProperty("contractVersion", 1);

  {
    auto* obj = new juce::DynamicObject();
    obj->setProperty("visibleX", targetBoundsForVisibility(true, {1, 2, 3, 4}).getX());
    obj->setProperty("visibleW", targetBoundsForVisibility(true, {1, 2, 3, 4}).getWidth());
    const auto hidden = targetBoundsForVisibility(false, {5, 6, 7, 8});
    obj->setProperty("hiddenX", hidden.getX());
    obj->setProperty("hiddenW", hidden.getWidth());
    root->setProperty("targetBounds", juce::var(obj));
  }

  {
    auto* obj = new juce::DynamicObject();
    obj->setProperty("perfOverlay", keepHostVisibleWhenHidden(HostRole::PerfOverlay));
    obj->setProperty("mainScript", keepHostVisibleWhenHidden(HostRole::MainScriptEditor));
    obj->setProperty("runtimeDebug", keepHostVisibleWhenHidden(HostRole::RuntimeNodeDebug));
    obj->setProperty("directHost", keepHostVisibleWhenHidden(HostRole::DirectHost));
    obj->setProperty("other", keepHostVisibleWhenHidden(HostRole::Other));
    root->setProperty("keepVisiblePolicy", juce::var(obj));
  }

  {
    auto* obj = new juce::DynamicObject();
    obj->setProperty("sameStateNoQueue", shouldQueueVisibilityChange(true, {0, 0, 10, 10}, true, {0, 0, 10, 10}));
    obj->setProperty("visibilityChangeQueues", shouldQueueVisibilityChange(false, {0, 0, 10, 10}, true, {0, 0, 10, 10}));
    obj->setProperty("boundsChangeQueues", shouldQueueVisibilityChange(true, {0, 0, 10, 10}, true, {5, 5, 10, 10}));
    obj->setProperty("hideQueues", shouldQueueVisibilityChange(true, {1, 2, 3, 4}, false, {9, 9, 9, 9}));
    root->setProperty("queuePolicy", juce::var(obj));
  }

  {
    auto* obj = new juce::DynamicObject();
    const auto showPerf = buildVisibilityApplyPlan(HostRole::PerfOverlay, true, {10, 20, 30, 40});
    obj->setProperty("showPerfVisible", showPerf.targetVisible);
    obj->setProperty("showPerfFront", showPerf.bringToFront);
    obj->setProperty("showPerfFocus", showPerf.grabFocus);
    obj->setProperty("showPerfBounds", rectToVar(showPerf.targetBounds));

    const auto hideScriptList = buildVisibilityApplyPlan(HostRole::ScriptList, false, {0, 0, 0, 0});
    obj->setProperty("hideScriptListVisible", hideScriptList.targetVisible);
    obj->setProperty("hideScriptListFront", hideScriptList.bringToFront);
    obj->setProperty("hideScriptListBounds", rectToVar(hideScriptList.targetBounds));

    const auto hideRuntimeDebug = buildVisibilityApplyPlan(HostRole::RuntimeNodeDebug, false, {0, 0, 0, 0});
    obj->setProperty("hideRuntimeDebugVisible", hideRuntimeDebug.targetVisible);
    obj->setProperty("hideRuntimeDebugFront", hideRuntimeDebug.bringToFront);
    obj->setProperty("hideRuntimeDebugBounds", rectToVar(hideRuntimeDebug.targetBounds));
    root->setProperty("applyPlans", juce::var(obj));
  }

  {
    auto* obj = new juce::DynamicObject();
    const auto started = planRecordingTransition(false, true);
    obj->setProperty("startedClear", started.clearAccumulator);
    obj->setProperty("startedFlush", started.flushAccumulator);
    const auto stopped = planRecordingTransition(true, false);
    obj->setProperty("stoppedClear", stopped.clearAccumulator);
    obj->setProperty("stoppedFlush", stopped.flushAccumulator);
    const auto steady = planRecordingTransition(true, true);
    obj->setProperty("steadyClear", steady.clearAccumulator);
    obj->setProperty("steadyFlush", steady.flushAccumulator);
    root->setProperty("recordingTransitions", juce::var(obj));
  }

  {
    auto* obj = new juce::DynamicObject();
    obj->setProperty("exportIdle", nextTimerHz(true, false));
    obj->setProperty("normalIdle", nextTimerHz(false, false));
    obj->setProperty("recordingExport", nextTimerHz(true, true));
    obj->setProperty("recordingNormal", nextTimerHz(false, true));
    root->setProperty("timerPolicy", juce::var(obj));
  }

  {
    auto* obj = new juce::DynamicObject();
    const auto idleTick = advanceUiIdleSnapshot(false, true, 3);
    obj->setProperty("tickCountdown", idleTick.nextCountdown);
    obj->setProperty("tickCapture", idleTick.captureNow);
    obj->setProperty("tickMarked", idleTick.markCaptured);

    const auto captureTick = advanceUiIdleSnapshot(false, true, 1);
    obj->setProperty("captureCountdown", captureTick.nextCountdown);
    obj->setProperty("captureNow", captureTick.captureNow);
    obj->setProperty("captureMarked", captureTick.markCaptured);

    const auto alreadyCaptured = advanceUiIdleSnapshot(true, true, 10);
    obj->setProperty("alreadyCapturedCountdown", alreadyCaptured.nextCountdown);
    obj->setProperty("alreadyCapturedNow", alreadyCaptured.captureNow);
    obj->setProperty("alreadyCapturedMarked", alreadyCaptured.markCaptured);

    const auto notExport = advanceUiIdleSnapshot(false, false, 5);
    obj->setProperty("notExportCountdown", notExport.nextCountdown);
    obj->setProperty("notExportNow", notExport.captureNow);
    obj->setProperty("notExportMarked", notExport.markCaptured);
    root->setProperty("uiIdleSnapshot", juce::var(obj));
  }

  return juce::var(root);
}

} // namespace

int main(int argc, char* argv[]) {
  HarnessOptions opts;
  if (!parseOptions(argc, argv, opts)) return 1;

  const juce::String contractJson = [&]() {
    juce::String out;
    appendCanonicalJson(buildFullContract(), out, 0);
    out += "\n";
    return out;
  }();

  return finishJsonContract(opts, "EditorLifecycleSupport contract", contractJson.toStdString());
}
