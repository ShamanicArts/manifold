# Agent Docs Directory Structure

**Last Updated:** 28 March 2026

This directory contains agent-focused documentation for the Manifold project, organized by status and subject.

## Directory Structure

```
agent-docs/
├── active/          # Currently being worked on (last 7-30 days)
│   ├── rack-ui/     # Rack UI Framework (current sprint)
│   ├── analysis/    # Recent analysis and audits
│   └── editor/      # Active editor work
├── backlog/         # Planned but not started or paused
│   ├── editor/      # Editor specs waiting for bug fix
│   ├── dsp/         # DSP features planned
│   └── architecture/# Future architectural work
├── complete/        # Done but kept for reference
│   ├── plugin-framework/  # Generic framework (P0-P6 done)
│   ├── midi-osc/          # Control systems complete
│   ├── migrations/        # Completed migrations
│   ├── system/            # Core system docs
│   ├── testing/           # Testing specs
│   ├── looper/            # Looper-specific docs
│   └── cleanup/           # Small completed specs
├── archive/         # Superseded/outdated (kept for history)
└── DOCUMENT_AUDIT_MASTER_ANALYSIS.md  # Full audit report
```

## Naming Convention

All documents use the format: `DDMMYY_document_title.md`

- `DD` = Day (01-31)
- `MM` = Month (01-12)
- `YY` = Year (last two digits)
- Document title in snake_case

## Quick Reference

### Most Recent (ACTIVE)
- `280328_blend_modes_and_modulation_analysis.md` - Today's analysis
- `280327_project_ownership_and_reload_vision.md` - Architecture vision

### Current Sprint Focus
- `active/rack-ui/` - Rack UI Framework (6 docs)
- `active/analysis/250325_duda_review.md` - P0 issues to fix

### Critical Bug Docs
- `active/editor/240306_editor_working_status.md` - Move/resize bug details

### Archive Candidates (Historical)
- `archive/240226_implementation_backlog.md` - All tickets complete
- `archive/240224_imgui_migration_workplan.md` - Migration done

## Status Legend

- **ACTIVE** - Being worked on now or in last 30 days
- **BACKLOG** - Planned/paused, will return to
- **COMPLETE** - Done, kept for reference
- **ARCHIVE** - Superseded, kept for history only
