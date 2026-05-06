#pragma once

#include "../primitives/sync/LinkSync.h"

namespace manifold {
namespace link_support {

// ============================================================================
// Ableton Link query helpers
// ============================================================================

inline bool isLinkEnabled(const LinkSync& linkSync) {
    return linkSync.isEnabled();
}

inline void setLinkEnabled(LinkSync& linkSync, bool enabled) {
    linkSync.setEnabled(enabled);
}

inline bool isLinkTempoSyncEnabled(const LinkSync& linkSync) {
    return linkSync.getState().isTempoSyncEnabled.load(std::memory_order_relaxed);
}

inline void setLinkTempoSyncEnabled(LinkSync& linkSync, bool enabled) {
    linkSync.setTempoSyncEnabled(enabled);
}

inline bool isLinkStartStopSyncEnabled(const LinkSync& linkSync) {
    return linkSync.getState().isStartStopSyncEnabled.load(std::memory_order_relaxed);
}

inline void setLinkStartStopSyncEnabled(LinkSync& linkSync, bool enabled) {
    linkSync.setStartStopSyncEnabled(enabled);
}

inline int getLinkNumPeers(const LinkSync& linkSync) {
    return linkSync.getNumPeers();
}

inline bool isLinkPlaying(const LinkSync& linkSync) {
    return linkSync.getIsPlaying();
}

inline double getLinkBeat(const LinkSync& linkSync) {
    return linkSync.getBeat();
}

inline double getLinkPhase(const LinkSync& linkSync) {
    return linkSync.getPhase();
}

// ============================================================================
// Ableton Link request helpers
// ============================================================================

inline void requestLinkTempo(LinkSync& linkSync, double bpm) {
    linkSync.requestTempo(bpm);
}

inline void requestLinkStart(LinkSync& linkSync) {
    linkSync.requestPlay();
}

inline void requestLinkStop(LinkSync& linkSync) {
    linkSync.requestStop();
}

inline void processLinkPendingRequests(LinkSync& linkSync) {
    linkSync.processPendingRequests();
}

} // namespace link_support
} // namespace manifold
