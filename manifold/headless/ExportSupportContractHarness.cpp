// ============================================================================
// Export Support Contract Harness
//
// Covers pure functions from 5 export support headers:
//   - EditorRendererSupport.h   (enum/string conversion)
//   - EditorPerfSupport.h       (process memory, glibc allocator snapshots)
//   - EditorRecordingSupport.h  (RamFrameAccumulator, writeTga)
//   - ExportPluginConfigSupport.h  (path resolution, port search, config parser)
//   - ExportPluginPerfSupport.h    (readPerfPath, bytesToMb/Kb)
// ============================================================================

#include "../core/EditorRendererSupport.h"
#include "../core/EditorPerfSupport.h"
#include "../core/EditorRecordingSupport.h"
#include "../core/ExportPluginConfigSupport.h"
#include "../core/ExportPluginPerfSupport.h"
#include "../primitives/ui/FrameTimings.h"

#include "ContractHarnessUtils.h"

#include <juce_core/juce_core.h>

#include <cstdio>
#include <string>
#include <vector>

namespace {

using namespace contract_harness_utils;

juce::var buildFullContract() {
  auto* root = new juce::DynamicObject();
  root->setProperty("contractVersion", 1);

  // ==========================================================================
  // Domain 1: EditorRendererSupport — enum/string conversion
  // ==========================================================================
  {
    auto* dom = new juce::DynamicObject();

    // All 4 modes round-trip
    dom->setProperty("canvas",
      editor_renderer::runtimeRendererModeToString(editor_renderer::RuntimeRendererMode::Canvas));
    dom->setProperty("imguiOverlay",
      editor_renderer::runtimeRendererModeToString(editor_renderer::RuntimeRendererMode::ImGuiOverlay));
    dom->setProperty("imguiReplace",
      editor_renderer::runtimeRendererModeToString(editor_renderer::RuntimeRendererMode::ImGuiReplace));
    dom->setProperty("imguiDirect",
      editor_renderer::runtimeRendererModeToString(editor_renderer::RuntimeRendererMode::ImGuiDirect));

    // Parse from valid strings
    dom->setProperty("parseCanvas",
      static_cast<int>(editor_renderer::runtimeRendererModeFromString("canvas",
        editor_renderer::RuntimeRendererMode::Canvas)));
    dom->setProperty("parseImguiOverlay",
      static_cast<int>(editor_renderer::runtimeRendererModeFromString("imgui-overlay",
        editor_renderer::RuntimeRendererMode::Canvas)));
    dom->setProperty("parseImguiReplace",
      static_cast<int>(editor_renderer::runtimeRendererModeFromString("imgui-replace",
        editor_renderer::RuntimeRendererMode::Canvas)));
    dom->setProperty("parseImguiDirect",
      static_cast<int>(editor_renderer::runtimeRendererModeFromString("imgui-direct",
        editor_renderer::RuntimeRendererMode::Canvas)));

    // Parse from shorthand aliases
    dom->setProperty("parse0",
      static_cast<int>(editor_renderer::runtimeRendererModeFromString("0",
        editor_renderer::RuntimeRendererMode::ImGuiDirect)));
    dom->setProperty("parse1",
      static_cast<int>(editor_renderer::runtimeRendererModeFromString("1",
        editor_renderer::RuntimeRendererMode::Canvas)));
    dom->setProperty("parseOff",
      static_cast<int>(editor_renderer::runtimeRendererModeFromString("off",
        editor_renderer::RuntimeRendererMode::ImGuiDirect)));
    dom->setProperty("parseOn",
      static_cast<int>(editor_renderer::runtimeRendererModeFromString("on",
        editor_renderer::RuntimeRendererMode::Canvas)));
    dom->setProperty("parseTrue",
      static_cast<int>(editor_renderer::runtimeRendererModeFromString("true",
        editor_renderer::RuntimeRendererMode::Canvas)));
    dom->setProperty("parseFalse",
      static_cast<int>(editor_renderer::runtimeRendererModeFromString("false",
        editor_renderer::RuntimeRendererMode::ImGuiDirect)));

    // Case-insensitive
    dom->setProperty("parseUppercase",
      static_cast<int>(editor_renderer::runtimeRendererModeFromString("IMGUI-OVERLAY",
        editor_renderer::RuntimeRendererMode::Canvas)));

    // Fallback on unknown string
    dom->setProperty("parseUnknown",
      static_cast<int>(editor_renderer::runtimeRendererModeFromString("bogus",
        editor_renderer::RuntimeRendererMode::ImGuiReplace)));

    root->setProperty("editorRenderer", juce::var(dom));
  }

  // ==========================================================================
  // Domain 2: EditorPerfSupport — memory/allocator snapshots
  // ==========================================================================
  {
    auto* dom = new juce::DynamicObject();

    auto mem = editor_perf::readProcessMemorySnapshot();
    dom->setProperty("pssNonNegative", mem.pssBytes >= 0);
    dom->setProperty("privNonNegative", mem.privateDirtyBytes >= 0);
    dom->setProperty("pssPositive", mem.pssBytes > 0);
    dom->setProperty("privPositive", mem.privateDirtyBytes > 0);

    auto alloc = editor_perf::readGlibcAllocatorSnapshot();
    dom->setProperty("heapNonNegative", static_cast<juce::int64>(alloc.heapUsedBytes) >= 0);
    dom->setProperty("arenaNonNegative", static_cast<juce::int64>(alloc.arenaBytes) >= 0);
    dom->setProperty("mmapNonNegative", static_cast<juce::int64>(alloc.mmapBytes) >= 0);
    dom->setProperty("freeHeldNonNegative", static_cast<juce::int64>(alloc.freeHeldBytes) >= 0);
    dom->setProperty("arenaCountNonNegative", static_cast<juce::int64>(alloc.arenaCount) >= 0);
    dom->setProperty("arenaAtLeastHeapUsed",
      static_cast<juce::int64>(alloc.arenaBytes) >= static_cast<juce::int64>(alloc.heapUsedBytes));

    root->setProperty("editorPerf", juce::var(dom));
  }

  // ==========================================================================
  // Domain 3: EditorRecordingSupport — writeTga + RamFrameAccumulator
  // ==========================================================================
  {
    auto* dom = new juce::DynamicObject();

    // RamFrameAccumulator
    editor_recording::RamFrameAccumulator acc;
    dom->setProperty("initialBytes", static_cast<double>(acc.ramFramesBytes));
    dom->setProperty("initialWarned", acc.ramFramesLimitWarned);

    // Create a small test image
    juce::Image testImg(juce::Image::ARGB, 4, 4, true);
    testImg.clear(juce::Rectangle<int>(0, 0, 4, 4), juce::Colour(0xFF112233));

    bool added = acc.tryAddFrame(testImg, 1024u * 1024u);
    dom->setProperty("added", added);
    dom->setProperty("afterAddBytes", static_cast<double>(acc.ramFramesBytes));
    dom->setProperty("afterAddCount", static_cast<int>(acc.ramFrames.size()));
    dom->setProperty("afterAddWarned", acc.ramFramesLimitWarned);

    // Try adding oversized frame that exceeds byte limit
    juce::Image bigImg(juce::Image::ARGB, 512, 512, true);
    bool addedBig = acc.tryAddFrame(bigImg, 1024u);
    dom->setProperty("addedBig", addedBig);
    dom->setProperty("afterBigWarned", acc.ramFramesLimitWarned);

    // Take all frames
    auto taken = acc.takeAll();
    dom->setProperty("takenCount", static_cast<int>(taken.size()));
    dom->setProperty("afterTakeBytes", static_cast<double>(acc.ramFramesBytes));
    dom->setProperty("afterTakeCount", static_cast<int>(acc.ramFrames.size()));

    // Clear
    acc.clear();
    dom->setProperty("afterClearBytes", static_cast<double>(acc.ramFramesBytes));

    // writeTga
    const auto tgaPath = juce::File::getSpecialLocation(juce::File::tempDirectory)
        .getChildFile("manifold_test_export.tga");
    bool tgaWritten = editor_recording::writeTga(testImg, tgaPath.getFullPathName().toStdString());
    dom->setProperty("tgaWritten", tgaWritten);
    dom->setProperty("tgaExists", tgaPath.existsAsFile());
    if (tgaPath.existsAsFile()) {
      dom->setProperty("tgaSize", static_cast<double>(tgaPath.getSize()));
      // TGA header: bytes 2-3 = width, 12-13 = width, 14-15 = height
      auto stream = tgaPath.createInputStream();
      if (stream != nullptr) {
        std::uint8_t header[18];
        stream->read(header, 18);
        dom->setProperty("tgaType", static_cast<int>(header[2]));
        dom->setProperty("tgaWidth", static_cast<int>(header[12]) | (static_cast<int>(header[13]) << 8));
        dom->setProperty("tgaHeight", static_cast<int>(header[14]) | (static_cast<int>(header[15]) << 8));
        dom->setProperty("tgaBpp", static_cast<int>(header[16]));
      }
      tgaPath.deleteFile();
    }

    root->setProperty("editorRecording", juce::var(dom));
  }

  // ==========================================================================
  // Domain 4: ExportPluginConfigSupport — selected pure functions
  // ==========================================================================
  {
    auto* dom = new juce::DynamicObject();

    // isProjectManifestFile
    auto tmpDir = juce::File::getSpecialLocation(juce::File::tempDirectory)
        .getChildFile("manifold_export_test");
    tmpDir.createDirectory();
    auto manifestFile = tmpDir.getChildFile("manifold.project.json5");
    manifestFile.replaceWithText("{}");

    dom->setProperty("manifestDetected",
      manifold::export_plugin::isProjectManifestFile(manifestFile));
    dom->setProperty("nonManifestDetected",
      manifold::export_plugin::isProjectManifestFile(tmpDir.getChildFile("other.json")));

    // resolveExportInternalPath
    {
      manifold::export_plugin::ExportPluginConfig cfg;
      manifold::export_plugin::ExportParamAlias alias;
      alias.path = "/test/param";
      alias.internalPath = "/looper/tempo";
      cfg.paramAliases.push_back(alias);

      dom->setProperty("resolveFound",
        manifold::export_plugin::resolveExportInternalPath(cfg, "/test/param"));
      dom->setProperty("resolveNotFound",
        manifold::export_plugin::resolveExportInternalPath(cfg, "/nonexistent"));
    }

    // findExportAliasByPublicPath / findExportAliasByHostParamId
    {
      manifold::export_plugin::ExportPluginConfig cfg;
      manifold::export_plugin::ExportParamAlias alias;
      alias.path = "/public/vol";
      alias.internalPath = "/looper/volume";
      alias.hostParamId = "param_vol";
      alias.hostParamName = "Volume";
      alias.hostParamKind = "float";
      alias.type = "f";
      alias.rangeMin = 0.0f;
      alias.rangeMax = 1.0f;
      alias.defaultValue = 0.5f;
      cfg.paramAliases.push_back(alias);

      auto* found1 = manifold::export_plugin::findExportAliasByPublicPath(cfg, "/public/vol");
      auto* found2 = manifold::export_plugin::findExportAliasByHostParamId(cfg, "param_vol");

      dom->setProperty("findByPublicPath", found1 != nullptr);
      if (found1) {
        dom->setProperty("foundPublicPath", found1->path);
        dom->setProperty("foundInternalPath", found1->internalPath);
        dom->setProperty("foundHostParamId", found1->hostParamId);
        dom->setProperty("foundMin", found1->rangeMin);
        dom->setProperty("foundMax", found1->rangeMax);
        dom->setProperty("foundDefault", found1->defaultValue);
      }

      dom->setProperty("findByHostParamId", found2 != nullptr);
      dom->setProperty("findByNonexistent",
        manifold::export_plugin::findExportAliasByPublicPath(cfg, "/nope") == nullptr);
    }

    // computeExportOscRuntimeSettings
    {
      manifold::export_plugin::ExportPluginConfig cfg;
      cfg.oscBasePort = 9010;

      auto result = manifold::export_plugin::computeExportOscRuntimeSettings(cfg, true, true, 9010, 9011);
      dom->setProperty("oscRuntimeEnabled", result.oscEnabled);
      dom->setProperty("oscRuntimeQueryEnabled", result.oscQueryEnabled);
      dom->setProperty("oscRuntimePort", result.oscPort);
      dom->setProperty("oscRuntimeQueryPort", result.queryPort);
    }

    // applyBasicExportUiPath
    {
      int viewMode = 1;
      bool settingsVisible = false;
      bool devVisible = false;
      bool oscEnabled = false;
      bool oscQueryEnabled = false;
      int xyX = 1, xyY = 2;

      auto r1 = manifold::export_plugin::applyBasicExportUiPath(
        "/plugin/ui/viewMode", 0.5f, viewMode, settingsVisible, devVisible,
        oscEnabled, oscQueryEnabled, xyX, xyY);
      dom->setProperty("applyViewModeHandled", r1.handled);
      dom->setProperty("applyViewModeOscRefresh", r1.needsOscRefresh);
      dom->setProperty("applyViewModeResult", viewMode);

      auto r2 = manifold::export_plugin::applyBasicExportUiPath(
        "/plugin/ui/oscEnabled", 0.6f, viewMode, settingsVisible, devVisible,
        oscEnabled, oscQueryEnabled, xyX, xyY);
      dom->setProperty("applyOscEnabledHandled", r2.handled);
      dom->setProperty("applyOscEnabledResult", oscEnabled);

      // oscQueryEnabled when oscEnabled is false
      bool oscQuery = false;
      auto r3 = manifold::export_plugin::applyBasicExportUiPath(
        "/plugin/ui/oscQueryEnabled", 0.6f, viewMode, settingsVisible, devVisible,
        oscEnabled, oscQuery, xyX, xyY);
      dom->setProperty("applyOscQueryWithoutOscHandled", r3.handled);
      dom->setProperty("applyOscQueryWithoutOscResult", oscQuery);

      auto r4 = manifold::export_plugin::applyBasicExportUiPath(
        "/nonexistent", 0.0f, viewMode, settingsVisible, devVisible,
        oscEnabled, oscQueryEnabled, xyX, xyY);
      dom->setProperty("applyNonexistentHandled", r4.handled);
    }

    // readBasicExportUiPath
    {
      auto v1 = manifold::export_plugin::readBasicExportUiPath(
        "/plugin/ui/viewMode", 1, false, false, true, true, 9010, 9011, 1, 2);
      dom->setProperty("readViewMode", v1.has_value());
      if (v1) dom->setProperty("readViewModeVal", *v1);

      auto v2 = manifold::export_plugin::readBasicExportUiPath(
        "/plugin/ui/oscInputPort", 1, false, false, true, true, 9010, 9011, 1, 2);
      dom->setProperty("readOscPort", v2.has_value());
      if (v2) dom->setProperty("readOscPortVal", *v2);

      auto v3 = manifold::export_plugin::readBasicExportUiPath(
        "/plugin/ui/xyYParam", 1, false, false, true, true, 9010, 9011, 1, 3);
      dom->setProperty("readXYParam", v3.has_value());
      if (v3) dom->setProperty("readXYParamVal", *v3);

      auto v4 = manifold::export_plugin::readBasicExportUiPath(
        "/bogus", 1, false, false, true, true, 9010, 9011, 1, 3);
      dom->setProperty("readBogus", !v4.has_value());
    }

    // makeExportUiInitialState
    {
      manifold::export_plugin::ExportPluginConfig cfg;
      cfg.defaultViewMode = 1;
      cfg.splitWidth = 800;
      cfg.splitHeight = 600;
      cfg.compactWidth = 400;
      cfg.compactHeight = 300;

      auto init = manifold::export_plugin::makeExportUiInitialState(cfg);
      dom->setProperty("initViewMode", init.viewMode);
      dom->setProperty("initEditorWidth", init.editorWidth);
      dom->setProperty("initEditorHeight", init.editorHeight);
      dom->setProperty("initOscInputPort", init.oscInputPort);
      dom->setProperty("initOscQueryPort", init.oscQueryPort);
      dom->setProperty("initXyXParam", init.xyXParam);
      dom->setProperty("initXyYParam", init.xyYParam);
    }

    // getExportUiEndpointSpecs — verify endpoints exist
    {
      const auto& specs = manifold::export_plugin::getExportUiEndpointSpecs();
      dom->setProperty("endpointCount", static_cast<int>(specs.size()));
      if (!specs.empty()) {
        dom->setProperty("firstEndpoint", specs[0].path);
        dom->setProperty("lastEndpoint", specs[specs.size() - 1].path);
      }
    }

    // readIntProperty / readBoolProperty
    {
      auto* obj = new juce::DynamicObject();
      obj->setProperty("intVal", 42);
      obj->setProperty("boolVal", true);

      dom->setProperty("readIntFound",
        manifold::export_plugin::readIntProperty(obj, "intVal", 0));
      dom->setProperty("readIntFallback",
        manifold::export_plugin::readIntProperty(obj, "missing", 99));
      dom->setProperty("readIntNull",
        manifold::export_plugin::readIntProperty(nullptr, "anything", 77));

      dom->setProperty("readBoolFound",
        manifold::export_plugin::readBoolProperty(obj, "boolVal", false));
      dom->setProperty("readBoolFallback",
        manifold::export_plugin::readBoolProperty(obj, "missing", true));
      dom->setProperty("readBoolNull",
        manifold::export_plugin::readBoolProperty(nullptr, "anything", true));
    }

    // resolveExportPluginConfig — parse a manifest file
    {
      auto manifestFilePath = tmpDir.getChildFile("test_manifest.manifold.project.json5");
      manifestFilePath.replaceWithText(R"({
  name: "TestPlugin",
  plugin: {
    headerTitle: "Test Header",
    view: {
      defaultMode: "compact",
      compact: { w: 320, h: 240 },
      split: { w: 640, h: 480 }
    },
    osc: {
      enabled: true,
      queryEnabled: true,
      basePort: 9020
    },
    params: [
      {
        path: "/public/gain",
        internalPath: "/looper/volume",
        type: "f",
        min: 0,
        max: 2,
        default: 1,
        skew: 0.5,
        description: "Gain control",
        hostParamId: "host_gain",
        hostParamName: "Gain"
      }
    ]
  }
})");

      auto cfg = manifold::export_plugin::resolveExportPluginConfig(manifestFilePath);
      dom->setProperty("resolvedEnabled", cfg.enabled);
      dom->setProperty("resolvedTitle", cfg.headerTitle);
      dom->setProperty("resolvedViewMode", cfg.defaultViewMode);
      dom->setProperty("resolvedCompactW", cfg.compactWidth);
      dom->setProperty("resolvedCompactH", cfg.compactHeight);
      dom->setProperty("resolvedSplitW", cfg.splitWidth);
      dom->setProperty("resolvedSplitH", cfg.splitHeight);
      dom->setProperty("resolvedOscEnabled", cfg.oscDefaultEnabled);
      dom->setProperty("resolvedOscQueryEnabled", cfg.oscQueryDefaultEnabled);
      dom->setProperty("resolvedOscBasePort", cfg.oscBasePort);
      dom->setProperty("resolvedParamCount", static_cast<int>(cfg.paramAliases.size()));
      if (!cfg.paramAliases.empty()) {
        dom->setProperty("resolvedParamPath", cfg.paramAliases[0].path);
        dom->setProperty("resolvedParamInternalPath", cfg.paramAliases[0].internalPath);
        dom->setProperty("resolvedParamMin", cfg.paramAliases[0].rangeMin);
        dom->setProperty("resolvedParamMax", cfg.paramAliases[0].rangeMax);
        dom->setProperty("resolvedParamDefault", cfg.paramAliases[0].defaultValue);
        dom->setProperty("resolvedParamSkew", cfg.paramAliases[0].skew);
      }
    }

    // makeExportPluginContract
    {
      manifold::export_plugin::ExportPluginConfig cfg;
      cfg.enabled = true;
      cfg.headerTitle = "Test";
      cfg.compactWidth = 400;
      cfg.compactHeight = 300;
      cfg.splitWidth = 800;
      cfg.splitHeight = 600;
      cfg.defaultViewMode = 1;
      cfg.oscBasePort = 9010;

      auto contract = manifold::export_plugin::makeExportPluginContract(
        cfg, 1, 800, 600, false, true, true, true, 9010, 9011, 1, 2);

      if (auto* obj = contract.getDynamicObject()) {
        dom->setProperty("contractEnabled", obj->getProperty("enabled"));
        dom->setProperty("contractCompactWidth", obj->getProperty("compactWidth"));
        dom->setProperty("contractSplitWidth", obj->getProperty("splitWidth"));
        dom->setProperty("contractViewMode", obj->getProperty("viewMode"));
        dom->setProperty("contractOscEnabled", obj->getProperty("oscEnabled"));
        dom->setProperty("contractOscInputPort", obj->getProperty("oscInputPort"));
        dom->setProperty("contractDevVisible", obj->getProperty("devVisible"));
      }
    }

    // Cleanup
    tmpDir.deleteRecursively();

    root->setProperty("exportPluginConfig", juce::var(dom));
  }

  // ==========================================================================
  // Domain 5: ExportPluginPerfSupport — bytesToMb, bytesToKb, readPerfPath
  // ==========================================================================
  {
    auto* dom = new juce::DynamicObject();

    // bytesToMb / bytesToKb
    dom->setProperty("bytesToMb_0", manifold::export_plugin_perf::bytesToMb(0));
    dom->setProperty("bytesToMb_1mb", manifold::export_plugin_perf::bytesToMb(1048576));
    dom->setProperty("bytesToMb_neg", manifold::export_plugin_perf::bytesToMb(-1048576));
    dom->setProperty("bytesToKb_1kb", manifold::export_plugin_perf::bytesToKb(1024));
    dom->setProperty("bytesToKb_0", manifold::export_plugin_perf::bytesToKb(0));

    // readPerfPath with null timings
    auto nullResult = manifold::export_plugin_perf::readPerfPath("/plugin/ui/perf/frameCurrentUs", nullptr);
    dom->setProperty("nullTimings", !nullResult.has_value());

    // readPerfPath with mock timings
    FrameTimings timings;
    timings.total.currentUs.store(12345, std::memory_order_relaxed);
    timings.total.peakUs.store(99999, std::memory_order_relaxed);
    timings.dsp.currentUs.store(5678, std::memory_order_relaxed);
    timings.dsp.peakUs.store(88888, std::memory_order_relaxed);
    timings.cpuPercent.store(42, std::memory_order_relaxed);
    timings.processPssBytes.store(100 * 1024 * 1024, std::memory_order_relaxed);
    timings.privateDirtyBytes.store(50 * 1024 * 1024, std::memory_order_relaxed);
    timings.runtimeNodeCount.store(128, std::memory_order_relaxed);
    timings.luaHeapBytes.store(8 * 1024 * 1024, std::memory_order_relaxed);
    timings.glibcHeapUsedBytes.store(200 * 1024 * 1024, std::memory_order_relaxed);
    timings.gpuTotalBytes.store(256 * 1024 * 1024, std::memory_order_relaxed);
    timings.imguiWindowCount.store(5, std::memory_order_relaxed);
    timings.displayListCount.store(42, std::memory_order_relaxed);

    auto r1 = manifold::export_plugin_perf::readPerfPath("/plugin/ui/perf/frameCurrentUs", &timings);
    dom->setProperty("frameCurrentUs", r1.has_value() ? *r1 : -1.0f);

    auto r2 = manifold::export_plugin_perf::readPerfPath("/plugin/ui/perf/framePeakUs", &timings);
    dom->setProperty("framePeakUs", r2.has_value() ? *r2 : -1.0f);

    auto r3 = manifold::export_plugin_perf::readPerfPath("/plugin/ui/perf/dspCurrentUs", &timings);
    dom->setProperty("dspCurrentUs", r3.has_value() ? *r3 : -1.0f);

    auto r4 = manifold::export_plugin_perf::readPerfPath("/plugin/ui/perf/dspPeakUs", &timings);
    dom->setProperty("dspPeakUs", r4.has_value() ? *r4 : -1.0f);

    auto r5 = manifold::export_plugin_perf::readPerfPath("/plugin/ui/perf/cpuPercent", &timings);
    dom->setProperty("cpuPercent", r5.has_value() ? *r5 : -1.0f);

    auto r6 = manifold::export_plugin_perf::readPerfPath("/plugin/ui/perf/pssMB", &timings);
    dom->setProperty("pssMB", r6.has_value() ? *r6 : -1.0f);

    auto r7 = manifold::export_plugin_perf::readPerfPath("/plugin/ui/perf/privateDirtyMB", &timings);
    dom->setProperty("privateDirtyMB", r7.has_value() ? *r7 : -1.0f);

    auto r8 = manifold::export_plugin_perf::readPerfPath("/plugin/ui/perf/runtimeNodeCount", &timings);
    dom->setProperty("runtimeNodeCount", r8.has_value() ? *r8 : -1.0f);

    auto r9 = manifold::export_plugin_perf::readPerfPath("/plugin/ui/perf/luaHeapMB", &timings);
    dom->setProperty("luaHeapMB", r9.has_value() ? *r9 : -1.0f);

    auto r10 = manifold::export_plugin_perf::readPerfPath("/plugin/ui/perf/glibcHeapMB", &timings);
    dom->setProperty("glibcHeapMB", r10.has_value() ? *r10 : -1.0f);

    auto r11 = manifold::export_plugin_perf::readPerfPath("/plugin/ui/perf/gpuTotalMB", &timings);
    dom->setProperty("gpuTotalMB", r11.has_value() ? *r11 : -1.0f);

    auto r12 = manifold::export_plugin_perf::readPerfPath("/plugin/ui/perf/imguiWindowCount", &timings);
    dom->setProperty("imguiWindowCount", r12.has_value() ? *r12 : -1.0f);

    auto r13 = manifold::export_plugin_perf::readPerfPath("/plugin/ui/perf/displayListCount", &timings);
    dom->setProperty("displayListCount", r13.has_value() ? *r13 : -1.0f);

    auto r14 = manifold::export_plugin_perf::readPerfPath("/bogus/path", &timings);
    dom->setProperty("bogusPath", !r14.has_value());

    root->setProperty("exportPluginPerf", juce::var(dom));
  }

  return juce::var(root);
}

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
    for (int i = 0; i < namedValues.size(); ++i)
      properties.push_back({namedValues.getName(i).toString(), namedValues.getValueAt(i)});
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

  return finishJsonContract(opts, "ExportSupport contract", contractJson.toStdString());
}
