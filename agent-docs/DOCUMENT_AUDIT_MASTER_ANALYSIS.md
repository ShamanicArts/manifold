# Agent Docs Comprehensive Audit & Categorization

**Audit Date:** 28 March 2026 (280328)  
**Auditor:** Kimi AI Agent  
**Total Documents:** 52 markdown files + 2 in NotesCheckpoint200326/  
**Total Lines:** ~29,000

---

## Categorization Scheme: Hybrid (Status + Subject)

This audit uses a hybrid categorization that reflects BOTH the work status AND the subject domain:

```
agent-docs/
├── active/                      # Currently being worked on
│   ├── rack-ui/                 # Rack UI Framework (current sprint)
│   ├── analysis/                # Recent analysis docs
│   └── editor/                  # Active editor work
├── backlog/                     # Planned but not started/paused
│   ├── editor/                  # Editor specs waiting for bug fix
│   ├── dsp/                     # DSP features planned
│   └── architecture/            # Future architectural work
├── complete/                    # Done but kept for reference
│   ├── plugin-framework/        # Generic framework (P0-P6 done)
│   ├── midi-osc/                # Control systems complete
│   ├── migrations/              # Completed migrations
│   └── system/                  # Core system docs
└── archive/                     # Superseded/outdated candidates
    ├── superseded/
    └── incident-reports/
```

---

## ACTIVE/ (Current Sprint - Last 7 Days)

### active/rack-ui/ (Primary Current Focus)

| File | Date | Lines | Analysis | Justification |
|------|------|-------|----------|---------------|
| **280328_BLEND_MODES_AND_MODULATION_ANALYSIS.md** | 28 Mar | 742 | Distinguishes DSP modes vs modulation routings for additive synthesis. Analyzes signal domain architecture (Input vs Output domain). | ACTIVE: Written today. Critical for MidiSynth blend architecture decisions. Distinguishes actual signal routing changes from parameter modulation. |
| **260326_RACK_UI_FRAMEWORK_SPEC.md** | 26 Mar | 602 | Foundation spec for rack-based UI framework. Defines rack, node, performance view, patch view abstractions. | ACTIVE: Core spec being implemented. Phase 0 complete, Phase 1-3 in progress. Establishes framework boundary before DSP changes. |
| **260326_RACK_UI_FRAMEWORK_WORKPLAN.md** | 26 Mar | 700 | Detailed phased execution plan for Rack UI. Phases 0-8 defined with explicit deliverables. | ACTIVE: Being executed now. Phases 0, 5, 8 complete. Same-row reorder LIVE, cross-row drag implemented. Port strips and wire layer need refinement. |
| **260326_RACK_UI_PHASE0_INVENTORY.md** | 26 Mar | 699 | Comprehensive inventory of current MidiSynth implementation. Inventories UI composition, connectors, DSP structure, per-node contracts. | ACTIVE: Phase 0 complete. Documents current state for framework foundation. Critical gap analysis between current code and rack model. |

**Subject:** Building rack-based UI framework for MidiSynth with node placement, drag-reorder, sizing, performance/patch dual view, honest port display, and docked utility panel.

**Current Execution Status:**
- ✅ Phase 0 (Inventory): Complete
- 🔄 Phase 1 (Data Model): In Progress - `rackState`, `nodeSpec` defined
- 🔄 Phase 2 (Generic Rack Container): In Progress - shells implemented, transitional
- 🔄 Phase 3 (Layout/Reorder): In Progress - same-row reorder LIVE, cross-row drag LIVE
- ✅ Phase 5 (Port Declarations): Complete - rich input/output port specs for all 6 nodes
- 🔄 Phase 6-7 (Patch View/Wire Layer): In Progress - basic bezier curves rendering, needs refinement
- 🔄 Phase 8 (Utility Dock): Partial - state migrated, UI controls exist, keyboard mode working

**Key Blockers Documented:**
- Port strips need refinement based on feedback
- Wire layer visual quality needs work
- Resize state persistence not yet wired to `rackState.nodes[].w`
- Row membership still authored (`rackRow1/2/3`) not fully dynamic

---

### active/analysis/

| File | Date | Lines | Analysis | Justification |
|------|------|-------|----------|---------------|
| **250325_DUDA_REVIEW.md** | 25 Mar | 433 | External code audit by Steve Duda persona. Comprehensive review of ~15K lines C++ across DSP, scripting, UI systems. | ACTIVE: Recent external audit. P0 issues (raw pointer, Lua VM crashes) need immediate attention. P1-P2 recommendations guide next refactoring phases. |
| **270327_ADDITIVE_RESYNTHESIS_SPEC.md** | 27 Mar | 1494 | Spec for sample-driven additive synthesis with partial analysis and resynthesis. FFT-based analysis, partial tracking, resynthesis engine. | ACTIVE: Recent spec awaiting implementation decision. Defines analysis→synthesis pipeline. May relate to current MidiSynth oscillator work. |
| **260326_PITCH_DETECTION_ANALYSIS.md** | 26 Mar | 166 | Analysis of pitch detection algorithms for sampler (YIN vs autocorrelation). | ACTIVE: Recent analysis. Supports sampler and synth features. Links to MidiSynth sample playback features. |
| **280327_PROJECT_OWNERSHIP_AND_RELOAD_VISION.md** | 27 Mar | 289 | Reframe MidiSynth from tab → package/domain. Defines ownership layers (Core runtime → System libs → Domain packages → Project composition). | ACTIVE: Current architectural thinking. Critical for hot-reload architecture and code promotion paths. Defines how project-local code graduates to framework. |

**Duda Review Key Issues (P0 - Ship Blockers):**
1. Raw pointer in `requestGraphRuntimeSwap()` - use `std::atomic<std::shared_ptr>>`
2. Lua VM destruction crashes - use `weak_ptr` from Lua or explicit nulling
3. Silent graph validation failures - add error handling, don't clear buffer silently

---

### active/editor/

| File | Date | Lines | Analysis | Justification |
|------|------|-------|----------|---------------|
| **240306_EDITOR_WORKING_STATUS.md** | 6 Mar | 245 | Ground-truth snapshot of editor implementation. Documents what's built, what's broken, what's next. | ACTIVE: 3 weeks old but still current. Structured project runtime ✅ SHIPPING in 4 projects. Visual move/resize 🐛 BUG blocks editor usefulness. |

**Editor Bug Status:**
- Structured project runtime: ✅ 1520 lines in `project_loader.lua`, fully working
- Visual move/resize: 🐛 BLOCKING - shell edit handlers need to bridge to structured runtime model
- Inspector panel: 🔄 Placeholder in `editor_core.lua`
- Hierarchy tree: 🔄 Placeholder exists

**Note:** Editor in maintenance mode while Rack UI takes priority, but bug fix is high priority.

---

## BACKLOG/ (Planned/Paused Work)

### backlog/editor/

| File | Date | Lines | Analysis | Justification |
|------|------|-------|----------|---------------|
| **240224_EDITOR_FIRST_PASS_WORK_PLAN.md** | 24 Feb | 912 | Detailed 7-phase work plan for editor implementation. Phases 1-7: Freeze target, skeleton, contracts, manual recreate, runtime, editor support, validation. | BACKLOG: Superseded by `EDITOR_WORKING_STATUS.md`. Historical reference for original vision. Gap between spec and reality documented in working status. |
| **240224_EDITOR_UI_WORKING_DOC.md** | 24 Feb | 897 | Chataigne-style visual authoring environment vision. Shell mode switching, canvas preview, inspector editing. | BACKLOG: Partially implemented. Current reality documented in working status. Still relevant for long-term vision but execution has diverged. |
| **240224_EDITOR_PROJECT_FORMAT_AND_AUTHORING_SPEC.md** | 24 Feb | 1918 | Comprehensive spec for project format and authoring system. Structured project runtime, component system, behavior lifecycle. | BACKLOG: Spec vs reality gap. Most of Phase 1/3 done, Phase 6 (editor support) partial. Reference for remaining editor work. |
| **240224_EDITOR_AUTHORING_AND_SOURCE_OF_TRUTH_DISCUSSION.md** | 24 Feb | 1378 | Discussion on source-of-truth for authored content (code vs visual). | BACKLOG: Design decision document. Stable reference. |
| **240224_EDITOR_FIRST_PASS_IMPLEMENTATION_CHARTER.md** | 24 Feb | 736 | Charter for first editor implementation pass. | BACKLOG: Charter complete. Historical reference. |
| **240224_EDITOR_SYSTEM_OVERVIEW.md** | 24 Feb | 565 | Mental model and TL;DR for editor system. | BACKLOG: Reference stable. |
| **240220_EDITOR_PARENT_UI_DEVELOPMENT_PLAN.md** | 20 Feb | 221 | Plan for parent UI shell and editor integration. | BACKLOG: Done. Shell exists and works. |

**Editor Gap Analysis:**
- Spec describes full visual editing vision
- Reality: structured runtime works, visual editing blocked on move/resize bug
- Fix requires bridging shell edit affordances → structured runtime model
- Inspector and hierarchy need wiring to structured records

---

### backlog/dsp/

| File | Date | Lines | Analysis | Justification |
|------|------|-------|----------|---------------|
| **240224_EFFECTS_ROADMAP.md** | 24 Feb | 752 | Comprehensive 5-phase effects roadmap. Phases 1-5: Foundation, Creative Core, Advanced, Utilities, Master. 30+ effect nodes specified. | BACKLOG: Reference for DSP expansion. Phase 1.1-1.3 (SVF, Stereo Delay, Compressor) ✅ Complete per doc footer. Phase 1.4+ not started. |
| **240227_DSP_SCRIPTING_PLAN.md** | 27 Feb | 497 | DSP scripting implementation plan. Core constraints, codebase reality, lock-free requirements. | BACKLOG: Mostly implemented. Graph compilation ✅, node library ✅, user scripts ✅. Historical reference for architecture decisions. |
| **NotesCheckpoint200326/MultitrackAudioArchitecture.md** | 20 Mar | ~400 | Proposal for multi-slot graph merging with port declarations. Cross-slot routing, send/return buses, sidechain. | BACKLOG: Design document for implementation. Enables proper multitrack DAW-style routing. Estimates 1 week implementation. |

**Effects Roadmap Status (from doc footer):**
- ✅ 1.1 SVF Filter - Complete (2025-03-04)
- ✅ 1.2 Stereo Delay - Complete (2025-03-04)  
- ✅ 1.3 Compressor - Complete (2025-03-04)
- 🔲 1.4 Wave Shaper - Not started
- 🔲 1.5 Chorus - Not started
- 🔲 2.1 Granulator - Not started (flagship feature)
- 🔲 2.2 Stutter - Not started
- [etc... Phases 2-5 largely not started]

---

### backlog/architecture/

| File | Date | Lines | Analysis | Justification |
|------|------|-------|----------|---------------|
| **240224_ARCHITECTURAL_AUDIT.md** | 24 Feb | 291 | Week 1 audit. LuaEngine monolith, mixed concerns, hardcoded looper schema. | BACKLOG: Categories A-B addressed, C-I partially done. Reference for remaining work. |
| **240224_ARCHITECTURAL_AUDIT_WEEK2.md** | 24 Feb | 539 | Week 2 audit. Audio thread safety violations, GraphRuntime swap mutex, state projection. | BACKLOG: Threading issues (Category C) deferred to Phase 8. Reference for future refactoring. |
| **240224_LOGGING_ARCHITECTURE.md** | 24 Feb | 313 | Design for thread-safe ring buffer logging, structured output, crash dumps. | BACKLOG: Design complete. Implementation deferred until after thread model refactor (Phase 8). Ready when needed. |
| **240224_PHASED_EXECUTION_ROADMAP.md** | 24 Feb | 178 | Execution order: Shell → Regression Validation → Looper Decomposition → Editor. | BACKLOG: Historical roadmap. Execution has diverged (decomposition happened differently). Reference for process. |
| **240224_PHASE4_GRAPH_RUNTIME_CONTRACT.md** | 24 Feb | 170 | Hard RT constraints for graph runtime. Lock-free, pre-allocated, no exceptions. | BACKLOG: Contract spec. Implemented and working. Reference. |
| **NotesCheckpoint200326/SystemScripts_Proposal.md** | 20 Mar | ~100 | Proposal for SystemScripts/ parallel to UserScripts/. Settings, Welcome, Template as system projects. | BACKLOG: Design proposal. Clean separation between system and user content. Awaiting implementation decision. |

**Architectural Audit Status:**
| Category | Status |
|----------|--------|
| A1-A2 (Mixed concerns) | ✅ Fixed - Core/UI/Control separated |
| A3 (Hardcoded state) | ✅ Fixed - IStateSerializer interface |
| B1-B4 (Magic numbers) | ✅ Fixed - ScriptingConfig.h |
| C1-C5 (Threading) | 📋 Phase 8 - Dedicated Lua thread pending |
| D1-D6 (Error handling) | 📝 Designed - Logging architecture ready |
| E1-E5 (Memory/lifecycle) | 📋 With Phase 8 |
| F1-F6 (API design) | ✅ Fixed - Interface-based architecture |
| G1-G5 (Configuration) | ✅ Partial - ScriptingConfig.h |
| H1-H4 (Testing) | 📋 Post-Phase 8 |
| I1-I3 (Documentation) | 📝 In progress |

---

## COMPLETE/ (Done - Reference Material)

### complete/plugin-framework/ (Phases P0-P6 DONE)

| File | Date | Lines | Analysis | Justification |
|------|------|-------|----------|---------------|
| **240224_GENERIC_PLUGIN_FRAMEWORK_SPEC.md** | 24 Feb | 710 | Comprehensive spec for decoupling Lua/control from concrete looper type. 6 phases defined. | COMPLETE: All phases P0-P6 done. Living spec evolved during implementation. Stable reference for architecture. |
| **240224_GENERIC_PLUGIN_FRAMEWORK_VISION.md** | 24 Feb | 394 | Vision document for generic audio plugin framework. Operator authority, execution safety. | COMPLETE: Vision achieved. Reference for framework philosophy. |
| **240226_IMPLEMENTATION_BACKLOG.md** | 26 Feb | 585 | Living tracker with ticket IDs P0.1-P6.2. Detailed subtasks, dependencies, acceptance criteria. | COMPLETE: All tickets done. Historical record of execution. Contains incident report (2026-02-25). Archive candidate. |

**Implementation Status (ALL DONE):**
- P0 (Baseline): ✅ P0.1-P0.4 done - harness coverage, mock seam
- P1 (Interface Seam): ✅ P1.1-P1.3 done - ScriptableProcessor interface
- P2 (Resolver Command Path): ✅ P2.1-P2.4 done - EndpointResolver, canonical SET/GET/TRIGGER
- P3 (State Projection): ✅ P3.1-P3.3 done - projected params/voices model
- P4 (Registry-driven OSC): ✅ P4.1-P4.2 done - resolver-backed dispatch
- P5 (Coercion Hardening): ✅ P5.1-P5.2 done - explicit coercion categories
- P6 (Legacy Shim Sunset): ✅ P6.1-P6.2 done - telemetry, deprecation errors

---

### complete/midi-osc/ (Control Systems DONE)

| File | Date | Lines | Analysis | Justification |
|------|------|-------|----------|---------------|
| **240224_MIDI_IMPLEMENTATION.md** | 24 Feb | 373 | Summary of MIDI event system, input selection, voice management, JUCE integration. | COMPLETE: MIDI system fully implemented and working. Reference for MIDI architecture. |
| **240224_MIDI_IMPLEMENTATION_PLAN.md** | 24 Feb | 58 | Phase 1 & 2 implementation plan for MIDI. | COMPLETE: Plan executed. Archive candidate. |
| **240224_OSC_OSCQUERY_LUA_IMPLEMENTATION.md** | 24 Feb | 905 | Deep technical overview of OSC, OSCQuery, Lua OSC implementation. Endpoint registry, state projection, diagnostics. | COMPLETE: OSC system fully implemented. Comprehensive reference for control protocol. |
| **240224_OSC_OSCQUERY_PLAN.md** | 24 Feb | 763 | Implementation plan for OSC/OSCQuery. Registry-driven dispatch, metadata. | COMPLETE: Plan executed. Archive candidate. |
| **240224_INTROSPECTION_AND_CONTROL_SYSTEMS.md** | 24 Feb | 323 | IPC, OSC, OSCQuery, EVAL, discovery systems. | COMPLETE: All control systems working. Reference. |
| **240224_IPC_EVAL_AND_TESTING_ADDITIONS_SPEC.md** | 24 Feb | 219 | EVAL command spec for remote code execution. | COMPLETE: EVAL implemented. Reference. |

---

### complete/migrations/ (Migrations DONE)

| File | Date | Lines | Analysis | Justification |
|------|------|-------|----------|---------------|
| **240224_IMGUI_MIGRATION_WORKPLAN.md** | 24 Feb | 341 | Migration from Canvas to ImGui. Status was "ARCHITECTURE RESET — previous approach was fundamentally wrong". | COMPLETE: Migration done. RuntimeNode is source of truth. Canvas removed. Archive candidate. |
| **240224_IMGUI_RENDERER_MIGRATION_PLAN.md** | 24 Feb | 532 | Renderer migration plan. | COMPLETE: Renderer migrated. Reference. |
| **240224_IMGUI_CANVAS_DEPENDENCY_AUDIT.md** | 24 Feb | 316 | Canvas API usage inventory. 469 gfx calls identified. | COMPLETE: Canvas removed. Historical reference for migration scope. |
| **240224_IMGUI_CANVAS_DEPENDENCY_AUDIT_UPDATED.md** | 24 Feb | 364 | Updated audit showing C++ infrastructure complete, UI shell conversion complete. | COMPLETE: Audit verified. Archive candidate. |
| **240224_CANVAS_REMOVAL_AUDIT.md** | 24 Feb | 451 | Comprehensive Canvas removal audit. 160 references across C++ core, Lua UI, editor. | COMPLETE: Removal done. Historical record. |
| **240224_CANVAS_REMOVAL_DENSE_AUDIT.md** | 24 Feb | 399 | Dense audit with specific file/line changes for Canvas removal. | COMPLETE: Removal done. Historical record. |
| **240224_WORKING_DOC.md** | 24 Feb | 294 | LuaEngine refactor working doc. Phases 1-7: Core extraction, bindings, integration, migration, delegation, UI bindings, control bindings. | COMPLETE: All 7 phases done. Thread Model (Phase 8) and Logging (Phase 9) remain future work. Archive candidate. |
| **240224_LEGACY_REMOVAL.md** | 24 Feb | 62 | Legacy looper removal summary. Files removed, renaming notes. | COMPLETE: Legacy removed. Renaming done. Archive candidate. |
| **240301_PRIMITIVES_BUILD_MIGRATION_PLAN.md** | 1 Mar | 234 | Build migration for primitives/ directory structure. | COMPLETE: Migration done. Archived per header. |
| **240224_LEGACY_DRAW_REPLAY_REMOVAL_PLAN.md** | 24 Feb | 447 | Plan for removing legacy draw replay system. | COMPLETE: Removal done. Reference. |

**LuaEngine Refactor Status:**
- Phase 1-7: ✅ COMPLETE (100%)
- Phase 8 (Thread Model): 📋 NOT STARTED - Dedicated Lua thread, lock-free queues
- Phase 9 (Logging): 📋 NOT STARTED - Depends on Phase 8

---

### complete/system/ (Core System DONE)

| File | Date | Lines | Analysis | Justification |
|------|------|-------|----------|---------------|
| **240224_UI_SYSTEM_DESIGN.md** | 24 Feb | 524 | Core UI system design. Goals, constraints, Lua-based UI, widget system. | COMPLETE: System implemented as designed. Stable reference. |
| **240224_LOOPER_PLAN.md** | 24 Feb | 1557 | Original looper design spec. BespokeSynth-inspired. Capture, commit, quantization. | COMPLETE: Looper implemented. Historical reference. |
| **240224_PERSISTENT_GRAPH_ARCHITECTURE.md** | 24 Feb | 184 | Current implementation of persistent graph with slot-based nodes. | COMPLETE: Architecture implemented and running. Reference for graph lifecycle. |
| **240224_SCRIPTING_REFACTOR_PRD.md** | 24 Feb | 357 | Product requirements for scripting system refactor. | COMPLETE: Refactor done. Reference. |
| **240224_VISUAL_SCRIPTING_FEASIBILITY.md** | 24 Feb | 466 | Feasibility study for bidirectional visual-textual programming. 80% infrastructure exists. | COMPLETE: Study complete. Future feature documented. 4-6 week estimate if pursued. |
| **240224_UI_SCRIPTING_PERFORMANCE_ARCHITECTURE.md** | 24 Feb | 459 | Performance architecture for UI scripting. Dirty flags, update batching, culling. | COMPLETE: Implemented. Reference. |
| **240224_INSTANCE_HANDOFF_GROK_REPORT.md** | 24 Feb | 345 | Project handoff document. Code-backed inventory of build targets, file organization. | COMPLETE: Handoff done. Reference for codebase navigation. |

---

### complete/testing/ (Testing Infrastructure DONE)

| File | Date | Lines | Analysis | Justification |
|------|------|-------|----------|---------------|
| **240224_E2E_TESTING_AND_PERFORMANCE_PROFILING_SPEC.md** | 24 Feb | 255 | E2E testing spec with frame timing instrumentation. | COMPLETE: Implemented. Reference. |
| **240224_EXPECTED_APP_BEHAVIOR_TESTING_WORKPLAN.md** | 24 Feb | 773 | Comprehensive behavior testing workplan. 12 behavior areas, 4 test tiers. | COMPLETE: Plan established. Some tests implemented. Reference for coverage gaps. |

---

### complete/looper/ (Looper-Specific DONE)

| File | Date | Lines | Analysis | Justification |
|------|------|-------|----------|---------------|
| **240224_LOOPER_DECOMPOSITION_AND_RENAME_PLAN.md** | 24 Feb | 301 | Plan for decomposing looper and renaming to Manifold. | COMPLETE: Renaming done. Decomposition happened via different path. Archive candidate. |
| **240224_LOOPER_PROCESSOR_HOST_BEHAVIOR_INVENTORY.md** | 24 Feb | 192 | Inventory of what belongs in host vs behavior. | COMPLETE: Inventory guided refactoring. Reference. |
| **240224_LOOPERSYNTHTABS_MIDISYNTH_SAMPLE_MODES_FINDINGS.md** | 24 Feb | 190 | Findings on LooperTabs MidiSynth sample modes integration. | COMPLETE: Integration in place. Reference. |
| **240224_LOOPER_UI_PRIMITIVE_PARITY_CHECKLIST.md** | 24 Feb | 92 | Checklist for UI read contract parity. | COMPLETE: Parity achieved. Archive candidate. |
| **240303_MANIFOLD_NAMING_CLEANUP_NOTES.md** | 3 Mar | 217 | Notes on cleanup from "Looper" to "Manifold" branding. | COMPLETE: Mostly done. Some leaks may remain. Reference. |

---

### complete/cleanup/ (Small Specs DONE)

| File | Date | Lines | Analysis | Justification |
|------|------|-------|----------|---------------|
| **240224_MOUSE_DRAG_PERF_FIX_SPEC.md** | 24 Feb | 59 | Spec for mouse drag performance fix. | COMPLETE: Fix implemented. Archive candidate. |
| **240224_RENDER_BACKEND_AGNOSTIC_UI_AUDIT.md** | 24 Feb | 475 | Audit for render-backend agnostic UI. | COMPLETE: Audit complete. Reference. |

---

## ARCHIVE/ (Superseded/Outdated Candidates)

These documents are candidates for archiving. They may contain historical value but are not current reference material.

| File | Date | Lines | Reason for Archival |
|------|------|-------|---------------------|
| **240226_IMPLEMENTATION_BACKLOG.md** | 26 Feb | 585 | All tickets P0-P6 complete. Historical record only. Contains incident report. |
| **240224_IMGUI_MIGRATION_WORKPLAN.md** | 24 Feb | 341 | Migration complete. "Previous approach was fundamentally wrong" - document captures wrong path. |
| **240224_EDITOR_FIRST_PASS_WORK_PLAN.md** | 24 Feb | 912 | Superseded by `EDITOR_WORKING_STATUS.md`. Execution diverged from plan. |
| **240224_PRIMITIVES_BUILD_MIGRATION_PLAN.md** | 1 Mar | 234 | Header says "⚠️ ARCHIVED DOCUMENT (2026-03-01)". Migration complete. |
| **240224_LEGACY_REMOVAL.md** | 24 Feb | 62 | Removal done. Summary only. |
| **240224_MOUSE_DRAG_PERF_FIX_SPEC.md** | 24 Feb | 59 | Fix done. Micro-spec. |
| **240224_LOOPER_UI_PRIMITIVE_PARITY_CHECKLIST.md** | 24 Feb | 92 | Checklist complete. |
| **240301_MANIFOLD_NAMING_CLEANUP_NOTES.md** | 3 Mar | 217 | Cleanup mostly done. Notes may be stale. |

---

## STALENESS SUMMARY

### Fresh (0-7 days) - ACTIVE
- `280328_BLEND_MODES_AND_MODULATION_ANALYSIS.md` (28 Mar)
- `280327_PROJECT_OWNERSHIP_AND_RELOAD_VISION.md` (27 Mar)

### Recent (1-4 weeks) - ACTIVE/BACKLOG
- `270327_ADDITIVE_RESYNTHESIS_SPEC.md` (27 Mar)
- `250325_DUDA_REVIEW.md` (25 Mar)
- `260326_RACK_UI_FRAMEWORK_*.md` (26 Mar) - 3 docs
- `260326_PITCH_DETECTION_ANALYSIS.md` (26 Mar)
- `240306_EDITOR_WORKING_STATUS.md` (6 Mar)
- `NotesCheckpoint200326/*.md` (20 Mar) - 2 docs

### Stable Reference (1-2 months) - COMPLETE
- All February 24-27 docs (most are reference/stable)

### Aging (2+ months) - Archive Candidates
- None significant

---

## KEY RELATIONSHIPS BETWEEN DOCUMENTS

### Dependency Graph

```
RACK_UI_FRAMEWORK_SPEC.md
    ↓ (implemented by)
RACK_UI_FRAMEWORK_WORKPLAN.md
    ↓ (based on inventory)
RACK_UI_PHASE0_INVENTORY.md
    ↓ (informs)
EDITOR_UI_WORKING_DOC.md (partially)

GENERIC_PLUGIN_FRAMEWORK_SPEC.md
    ↓ (tracked by)
IMPLEMENTATION_BACKLOG.md (COMPLETE)
    ↓ (implemented)
All P0-P6 complete

ARCHITECTURAL_AUDIT.md + ARCHITECTURAL_AUDIT_WEEK2.md
    ↓ (addressed by)
WORKING_DOC.md (Phases 1-7)
    ↓ (remaining in)
Phase 8 (Thread Model - pending)

LOOPER_PLAN.md (original)
    ↓ (evolved to)
PERSISTENT_GRAPH_ARCHITECTURE.md (current)
    ↓ (enables)
MultitrackAudioArchitecture.md (proposal)

EDITOR_FIRST_PASS_WORK_PLAN.md
    ↓ (diverged to reality in)
EDITOR_WORKING_STATUS.md
    ↓ (next work from)
Duda Review P0 fixes + Editor bug fix
```

---

## RECOMMENDATIONS

### Immediate Actions (This Week)

1. **Fix Duda Review P0 Issues**
   - Raw pointer in `requestGraphRuntimeSwap()` → `std::atomic<std::shared_ptr>>`
   - Lua VM destruction → `weak_ptr` or explicit nulling
   - Silent graph failures → add error handling

2. **Fix Editor Visual Move/Resize Bug**
   - Bridge shell edit handlers to structured runtime model
   - Use `_structuredSource` metadata for document path + node ID
   - Write back via `setNodeValue()`

3. **Continue Rack UI Execution**
   - Refine port strips based on feedback
   - Improve wire layer visual quality
   - Wire resize state persistence

### Short Term (Next 2 Weeks)

4. **Review Additive Resynthesis Spec** for implementation decision
5. **Implement MultitrackAudioArchitecture** if prioritized (1 week est.)
6. **Wire Editor Inspector** for structured projects

### Medium Term (Next Month)

7. **Archive Completed Documents** to reduce noise
8. **Implement Duda Review P1** recommendations
9. **Phase 8 Thread Model** refactor (dedicated Lua thread)

### Archive Actions

10. Move to `archive/` subdirectory:
    - `IMPLEMENTATION_BACKLOG.md` (all done)
    - `IMGUI_MIGRATION_WORKPLAN.md` (migration complete)
    - `EDITOR_FIRST_PASS_WORK_PLAN.md` (superseded)
    - `PRIMITIVES_BUILD_MIGRATION_PLAN.md` (already marked archived)
    - `LEGACY_REMOVAL.md` (removal done)
    - `MOUSE_DRAG_PERF_FIX_SPEC.md` (fix done)

---

*End of Comprehensive Audit Report*
