#pragma once

#include <optional>
#include <string>

#include "../primitives/ui/FrameTimings.h"

namespace manifold {
namespace export_plugin_perf {

inline float bytesToMb(int64_t bytes) {
    return static_cast<float>(bytes / (1024.0 * 1024.0));
}

inline float bytesToKb(int64_t bytes) {
    return static_cast<float>(bytes / 1024.0);
}

inline std::optional<float> readPerfPath(const std::string& path,
                                         const FrameTimings* timings) {
    if (timings == nullptr) {
        return std::nullopt;
    }

    if (path == "/plugin/ui/perf/frameCurrentUs") return static_cast<float>(timings->total.currentUs.load(std::memory_order_relaxed));
    if (path == "/plugin/ui/perf/frameAvgUs") return static_cast<float>(timings->total.getAvgUs());
    if (path == "/plugin/ui/perf/framePeakUs") return static_cast<float>(timings->total.peakUs.load(std::memory_order_relaxed));
    if (path == "/plugin/ui/perf/dspCurrentUs") return static_cast<float>(timings->dsp.currentUs.load(std::memory_order_relaxed));
    if (path == "/plugin/ui/perf/dspAvgUs") return static_cast<float>(timings->dsp.getAvgUs());
    if (path == "/plugin/ui/perf/dspPeakUs") return static_cast<float>(timings->dsp.peakUs.load(std::memory_order_relaxed));
    if (path == "/plugin/ui/perf/uiUpdateUs") return static_cast<float>(timings->uiUpdate.currentUs.load(std::memory_order_relaxed));
    if (path == "/plugin/ui/perf/renderUs") return static_cast<float>(timings->imguiRenderUs.load(std::memory_order_relaxed));
    if (path == "/plugin/ui/perf/paintUs") return static_cast<float>(timings->paint.currentUs.load(std::memory_order_relaxed));
    if (path == "/plugin/ui/perf/cpuPercent") return timings->cpuPercent.load(std::memory_order_relaxed);
    if (path == "/plugin/ui/perf/pssMB") return bytesToMb(timings->processPssBytes.load(std::memory_order_relaxed));
    if (path == "/plugin/ui/perf/privateDirtyMB") return bytesToMb(timings->privateDirtyBytes.load(std::memory_order_relaxed));
    if (path == "/plugin/ui/perf/pluginDeltaPssMB") return bytesToMb(timings->pluginDeltaPssBytes.load(std::memory_order_relaxed));
    if (path == "/plugin/ui/perf/pluginDeltaPrivateDirtyMB") return bytesToMb(timings->pluginDeltaPrivateDirtyBytes.load(std::memory_order_relaxed));
    if (path == "/plugin/ui/perf/pluginDeltaHeapMB") return bytesToMb(timings->pluginDeltaHeapBytes.load(std::memory_order_relaxed));
    if (path == "/plugin/ui/perf/uiDeltaPssMB") return bytesToMb(timings->uiDeltaPssBytes.load(std::memory_order_relaxed));
    if (path == "/plugin/ui/perf/uiDeltaPrivateDirtyMB") return bytesToMb(timings->uiDeltaPrivateDirtyBytes.load(std::memory_order_relaxed));
    if (path == "/plugin/ui/perf/uiDeltaHeapMB") return bytesToMb(timings->uiDeltaHeapBytes.load(std::memory_order_relaxed));
    if (path == "/plugin/ui/perf/afterLuaInitDeltaPssMB") return bytesToMb(timings->afterLuaInitDeltaPssBytes.load(std::memory_order_relaxed));
    if (path == "/plugin/ui/perf/afterLuaInitDeltaPrivateDirtyMB") return bytesToMb(timings->afterLuaInitDeltaPrivateDirtyBytes.load(std::memory_order_relaxed));
    if (path == "/plugin/ui/perf/afterBindingsDeltaPssMB") return bytesToMb(timings->afterBindingsDeltaPssBytes.load(std::memory_order_relaxed));
    if (path == "/plugin/ui/perf/afterBindingsDeltaPrivateDirtyMB") return bytesToMb(timings->afterBindingsDeltaPrivateDirtyBytes.load(std::memory_order_relaxed));
    if (path == "/plugin/ui/perf/afterScriptLoadDeltaPssMB") return bytesToMb(timings->afterScriptLoadDeltaPssBytes.load(std::memory_order_relaxed));
    if (path == "/plugin/ui/perf/afterScriptLoadDeltaPrivateDirtyMB") return bytesToMb(timings->afterScriptLoadDeltaPrivateDirtyBytes.load(std::memory_order_relaxed));
    if (path == "/plugin/ui/perf/afterDspDeltaPssMB") return bytesToMb(timings->afterDspDeltaPssBytes.load(std::memory_order_relaxed));
    if (path == "/plugin/ui/perf/afterDspDeltaPrivateDirtyMB") return bytesToMb(timings->afterDspDeltaPrivateDirtyBytes.load(std::memory_order_relaxed));
    if (path == "/plugin/ui/perf/afterUiOpenDeltaPssMB") return bytesToMb(timings->afterUiOpenDeltaPssBytes.load(std::memory_order_relaxed));
    if (path == "/plugin/ui/perf/afterUiOpenDeltaPrivateDirtyMB") return bytesToMb(timings->afterUiOpenDeltaPrivateDirtyBytes.load(std::memory_order_relaxed));
    if (path == "/plugin/ui/perf/afterUiIdleDeltaPssMB") return bytesToMb(timings->afterUiIdleDeltaPssBytes.load(std::memory_order_relaxed));
    if (path == "/plugin/ui/perf/afterUiIdleDeltaPrivateDirtyMB") return bytesToMb(timings->afterUiIdleDeltaPrivateDirtyBytes.load(std::memory_order_relaxed));
    if (path == "/plugin/ui/perf/luaHeapMB") return bytesToMb(timings->luaHeapBytes.load(std::memory_order_relaxed));
    if (path == "/plugin/ui/perf/glibcHeapMB") return bytesToMb(timings->glibcHeapUsedBytes.load(std::memory_order_relaxed));
    if (path == "/plugin/ui/perf/glibcArenaMB") return bytesToMb(timings->glibcArenaBytes.load(std::memory_order_relaxed));
    if (path == "/plugin/ui/perf/glibcMmapMB") return bytesToMb(timings->glibcMmapBytes.load(std::memory_order_relaxed));
    if (path == "/plugin/ui/perf/glibcFreeHeldMB") return bytesToMb(timings->glibcFreeHeldBytes.load(std::memory_order_relaxed));
    if (path == "/plugin/ui/perf/glibcReleasableMB") return bytesToMb(timings->glibcReleasableBytes.load(std::memory_order_relaxed));
    if (path == "/plugin/ui/perf/glibcArenaCount") return static_cast<float>(timings->glibcArenaCount.load(std::memory_order_relaxed));
    if (path == "/plugin/ui/perf/gpuFontAtlasMB") return bytesToMb(timings->gpuFontAtlasBytes.load(std::memory_order_relaxed));
    if (path == "/plugin/ui/perf/gpuSurfaceColorMB") return bytesToMb(timings->gpuSurfaceColorBytes.load(std::memory_order_relaxed));
    if (path == "/plugin/ui/perf/gpuSurfaceDepthMB") return bytesToMb(timings->gpuSurfaceDepthBytes.load(std::memory_order_relaxed));
    if (path == "/plugin/ui/perf/gpuTotalMB") return bytesToMb(timings->gpuTotalBytes.load(std::memory_order_relaxed));
    if (path == "/plugin/ui/perf/runtimeNodeCount") return static_cast<float>(timings->runtimeNodeCount.load(std::memory_order_relaxed));
    if (path == "/plugin/ui/perf/runtimeNodeMB") return bytesToMb(timings->runtimeNodeBytes.load(std::memory_order_relaxed));
    if (path == "/plugin/ui/perf/runtimeCallbackCount") return static_cast<float>(timings->runtimeCallbackCount.load(std::memory_order_relaxed));
    if (path == "/plugin/ui/perf/runtimeUserDataEntries") return static_cast<float>(timings->runtimeUserDataEntries.load(std::memory_order_relaxed));
    if (path == "/plugin/ui/perf/runtimeUserDataMB") return bytesToMb(timings->runtimeUserDataBytes.load(std::memory_order_relaxed));
    if (path == "/plugin/ui/perf/runtimePayloadMB") return bytesToMb(timings->runtimeCustomPayloadBytes.load(std::memory_order_relaxed));
    if (path == "/plugin/ui/perf/displayListCount") return static_cast<float>(timings->displayListCount.load(std::memory_order_relaxed));
    if (path == "/plugin/ui/perf/displayListCommands") return static_cast<float>(timings->displayListCommandCount.load(std::memory_order_relaxed));
    if (path == "/plugin/ui/perf/displayListMB") return bytesToMb(timings->displayListBytes.load(std::memory_order_relaxed));
    if (path == "/plugin/ui/perf/renderSnapshotNodes") return static_cast<float>(timings->renderSnapshotNodeCount.load(std::memory_order_relaxed));
    if (path == "/plugin/ui/perf/renderSnapshotMB") return bytesToMb(timings->renderSnapshotBytes.load(std::memory_order_relaxed));
    if (path == "/plugin/ui/perf/customSurfaceStateMB") return bytesToMb(timings->customSurfaceStateBytes.load(std::memory_order_relaxed));
    if (path == "/plugin/ui/perf/scriptSourceKB") return bytesToKb(timings->scriptSourceBytes.load(std::memory_order_relaxed));
    if (path == "/plugin/ui/perf/luaGlobalCount") return static_cast<float>(timings->luaGlobalCount.load(std::memory_order_relaxed));
    if (path == "/plugin/ui/perf/luaRegistryEntryCount") return static_cast<float>(timings->luaRegistryEntryCount.load(std::memory_order_relaxed));
    if (path == "/plugin/ui/perf/luaPackageLoadedCount") return static_cast<float>(timings->luaPackageLoadedCount.load(std::memory_order_relaxed));
    if (path == "/plugin/ui/perf/luaOscPathCount") return static_cast<float>(timings->luaOscPathCount.load(std::memory_order_relaxed));
    if (path == "/plugin/ui/perf/luaOscCallbackCount") return static_cast<float>(timings->luaOscCallbackCount.load(std::memory_order_relaxed));
    if (path == "/plugin/ui/perf/luaOscQueryHandlerCount") return static_cast<float>(timings->luaOscQueryHandlerCount.load(std::memory_order_relaxed));
    if (path == "/plugin/ui/perf/luaEventListenerCount") return static_cast<float>(timings->luaEventListenerCount.load(std::memory_order_relaxed));
    if (path == "/plugin/ui/perf/luaManagedDspSlotCount") return static_cast<float>(timings->luaManagedDspSlotCount.load(std::memory_order_relaxed));
    if (path == "/plugin/ui/perf/luaOverlayCacheCount") return static_cast<float>(timings->luaOverlayCacheCount.load(std::memory_order_relaxed));
    if (path == "/plugin/ui/perf/endpointTotalCount") return static_cast<float>(timings->endpointTotalCount.load(std::memory_order_relaxed));
    if (path == "/plugin/ui/perf/endpointCustomCount") return static_cast<float>(timings->endpointCustomCount.load(std::memory_order_relaxed));
    if (path == "/plugin/ui/perf/endpointPathKB") return bytesToKb(timings->endpointPathBytes.load(std::memory_order_relaxed));
    if (path == "/plugin/ui/perf/endpointDescriptionKB") return bytesToKb(timings->endpointDescriptionBytes.load(std::memory_order_relaxed));
    if (path == "/plugin/ui/perf/dspHostCount") return static_cast<float>(timings->dspHostCount.load(std::memory_order_relaxed));
    if (path == "/plugin/ui/perf/dspScriptSourceKB") return bytesToKb(timings->dspScriptSourceBytes.load(std::memory_order_relaxed));
    if (path == "/plugin/ui/perf/imguiWindowCount") return static_cast<float>(timings->imguiWindowCount.load(std::memory_order_relaxed));
    if (path == "/plugin/ui/perf/imguiTableCount") return static_cast<float>(timings->imguiTableCount.load(std::memory_order_relaxed));
    if (path == "/plugin/ui/perf/imguiTabBarCount") return static_cast<float>(timings->imguiTabBarCount.load(std::memory_order_relaxed));
    if (path == "/plugin/ui/perf/imguiViewportCount") return static_cast<float>(timings->imguiViewportCount.load(std::memory_order_relaxed));
    if (path == "/plugin/ui/perf/imguiFontCount") return static_cast<float>(timings->imguiFontCount.load(std::memory_order_relaxed));
    if (path == "/plugin/ui/perf/imguiWindowStateMB") return bytesToMb(timings->imguiWindowStateBytes.load(std::memory_order_relaxed));
    if (path == "/plugin/ui/perf/imguiDrawBufferMB") return bytesToMb(timings->imguiDrawBufferBytes.load(std::memory_order_relaxed));
    if (path == "/plugin/ui/perf/imguiInternalStateMB") return bytesToMb(timings->imguiInternalStateBytes.load(std::memory_order_relaxed));
    if (path == "/plugin/ui/perf/shellScriptListRows") return static_cast<float>(timings->shellScriptListRowCount.load(std::memory_order_relaxed));
    if (path == "/plugin/ui/perf/shellScriptListMB") return bytesToMb(timings->shellScriptListBytes.load(std::memory_order_relaxed));
    if (path == "/plugin/ui/perf/shellHierarchyRows") return static_cast<float>(timings->shellHierarchyRowCount.load(std::memory_order_relaxed));
    if (path == "/plugin/ui/perf/shellHierarchyMB") return bytesToMb(timings->shellHierarchyBytes.load(std::memory_order_relaxed));
    if (path == "/plugin/ui/perf/shellInspectorRows") return static_cast<float>(timings->shellInspectorRowCount.load(std::memory_order_relaxed));
    if (path == "/plugin/ui/perf/shellInspectorMB") return bytesToMb(timings->shellInspectorBytes.load(std::memory_order_relaxed));
    if (path == "/plugin/ui/perf/shellScriptInspectorMB") return bytesToMb(timings->shellScriptInspectorBytes.load(std::memory_order_relaxed));
    if (path == "/plugin/ui/perf/shellMainEditorTextKB") return bytesToKb(timings->shellMainEditorTextBytes.load(std::memory_order_relaxed));

    return std::nullopt;
}

} // namespace export_plugin_perf
} // namespace manifold
