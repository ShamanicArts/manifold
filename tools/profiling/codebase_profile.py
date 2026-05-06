#!/usr/bin/env python3
"""
codebase_profile.py — Complete Manifold codebase profiling & bloat analysis

Generates:
  - Directory-level LOC breakdowns
  - File-type cross-tables
  - Top-N largest files
  - Change detection vs previous audit snapshots
  - Markdown report

Usage:
  python3 tools/profiling/codebase_profile.py                          # full analysis
  python3 tools/profiling/codebase_profile.py --report                 # write report file
  python3 tools/profiling/codebase_profile.py --snapshot               # save baseline snapshot
  python3 tools/profiling/codebase_profile.py --diff <old_snapshot>    # diff vs snapshot
"""

import argparse
import json
import os
import sys
from collections import defaultdict
from datetime import datetime
from pathlib import Path

# ── Config ──────────────────────────────────────────────────────────────────
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent

# Directories to scan for runtime code
SCAN_DIRS = ["manifold", "dsp", "UserScripts", "web"]

# File extensions considered runtime code
CODE_EXTS = {".cpp", ".h", ".lua", ".ts", ".tsx", ".css", ".json"}

# Exclude patterns (paths containing any of these)
EXCLUDE_SUBSTR = [
    "node_modules",
    "tests",
    "test_plugins",
    "dsp_simd_test",
    "prototypes",
    "prototypesandreseearch",
    "GrainFreeze_Prototype",
    "build",
    "build-dev",
    ".jj",
    ".git",
    "external",
    "agent-docs",
    ".cache",
    ".claude",
    ".pi",
    ".agents",
    "tools/profiling",
]

# ═══════════════════════════════════════════════════════════════════════════════
# Core: File discovery
# ═══════════════════════════════════════════════════════════════════════════════

def is_excluded(path: str) -> bool:
    """Return True if the path should be excluded."""
    for pat in EXCLUDE_SUBSTR:
        if pat in path:
            return True
    return False


def discover_files(root: Path, scan_dirs: list[str] = None) -> list[dict]:
    """
    Walk SCAN_DIRS under root and return a list of file dicts:
      { "path": str, "ext": str, "lines": int, "dir": str, "subdir": str }
    """
    files = []
    scan_dirs = scan_dirs or SCAN_DIRS

    for scan_dir in scan_dirs:
        scan_path = root / scan_dir
        if not scan_path.exists():
            continue
        for fpath in scan_path.rglob("*"):
            if not fpath.is_file():
                continue
            rel = str(fpath.relative_to(root))
            if is_excluded(rel):
                continue
            ext = fpath.suffix.lower()
            if ext not in CODE_EXTS:
                continue
            try:
                lines = sum(1 for _ in fpath.open(encoding="utf-8", errors="replace"))
            except Exception:
                lines = 0
            # Figure out the top-level and second-level dir
            parts = rel.split("/")
            top_dir = parts[0] if len(parts) > 0 else "?"
            sub_dir = parts[1] if len(parts) > 1 else "."
            files.append(
                {
                    "path": rel,
                    "ext": ext,
                    "lines": lines,
                    "dir": top_dir,
                    "subdir": sub_dir,
                }
            )

    files.sort(key=lambda f: f["path"])
    return files


# ═══════════════════════════════════════════════════════════════════════════════
# Analysis functions
# ═══════════════════════════════════════════════════════════════════════════════

def by_directory(files: list[dict]) -> dict:
    """Return { top_dir: { sub_dir: lines, ... }, ... }"""
    tree = defaultdict(lambda: defaultdict(int))
    for f in files:
        tree[f["dir"]][f["subdir"]] += f["lines"]
    return dict(tree)


def by_filetype(files: list[dict]) -> dict:
    """Return { ext: {"files": n, "lines": n}, ... }"""
    stats = defaultdict(lambda: {"files": 0, "lines": 0})
    for f in files:
        stats[f["ext"]]["files"] += 1
        stats[f["ext"]]["lines"] += f["lines"]
    return dict(stats)


def top_largest(files: list[dict], n: int = 50) -> list[dict]:
    """Return the N largest files."""
    return sorted(files, key=lambda f: f["lines"], reverse=True)[:n]


def user_scripts_breakdown(files: list[dict]) -> dict:
    """Break down UserScripts/projects/<project>/ by project name."""
    projects = defaultdict(int)
    for f in files:
        if f["dir"] == "UserScripts" and f["subdir"] == "projects":
            # path: UserScripts/projects/<ProjectName>/...
            parts = f["path"].split("/")
            if len(parts) >= 3:
                project = parts[2]
                projects[project] += f["lines"]
        elif f["dir"] == "UserScripts":
            # SystemScripts or libs outside projects/
            projects["_SystemScripts"] = projects.get("_SystemScripts", 0) + f["lines"]
    return dict(sorted(projects.items(), key=lambda kv: kv[1], reverse=True))


def manifold_breakdown(files: list[dict]) -> dict:
    """Break down manifold/<subsystem>/ by subsystem."""
    subsystems = defaultdict(int)
    for f in files:
        if f["dir"] == "manifold" and f["subdir"] != ".":
            subsystems[f["subdir"]] += f["lines"]
    return dict(sorted(subsystems.items(), key=lambda kv: kv[1], reverse=True))


def dsp_breakdown(files: list[dict]) -> dict:
    """Break down dsp/<area>/ by area."""
    areas = defaultdict(int)
    for f in files:
        if f["dir"] == "dsp" and f["subdir"] != ".":
            areas[f["subdir"]] += f["lines"]
    return dict(sorted(areas.items(), key=lambda kv: kv[1], reverse=True))


def highway_vs_nonhighway(files: list[dict]) -> list[dict]:
    """Compare Highway vs non-Highway DSP node implementations."""
    nodes = defaultdict(lambda: {"highway": 0, "nonhighway_cpp": 0, "nonhighway_h": 0})
    for f in files:
        if not f["path"].startswith("dsp/core/nodes/"):
            continue
        name = Path(f["path"]).stem
        if "_Highway" in name:
            base = name.replace("_Highway", "")
            nodes[base]["highway"] = f["lines"]
        else:
            base = name
            if f["ext"] == ".cpp":
                nodes[base]["nonhighway_cpp"] = f["lines"]
            elif f["ext"] == ".h":
                nodes[base]["nonhighway_h"] = f["lines"]

    results = []
    for base, stats in sorted(nodes.items()):
        hw = stats["highway"]
        nh_total = stats["nonhighway_cpp"] + stats["nonhighway_h"]
        if hw > 0 or nh_total > 0:
            results.append(
                {
                    "node": base,
                    "highway": hw,
                    "nonhighway_cpp": stats["nonhighway_cpp"],
                    "nonhighway_h": stats["nonhighway_h"],
                    "nonhighway_total": nh_total,
                    "ratio": round(max(hw, 1) / max(nh_total, 1), 2) if nh_total > 0 else float("inf"),
                }
            )
    return sorted(results, key=lambda r: r["nonhighway_total"], reverse=True)


# ═══════════════════════════════════════════════════════════════════════════════
# Report generation
# ═══════════════════════════════════════════════════════════════════════════════

def generate_report(files: list[dict]) -> str:
    """Produce a complete markdown report."""
    lines = []
    total_lines = sum(f["lines"] for f in files)
    total_files = len(files)
    now = datetime.now().strftime("%Y-%m-%d %H:%M")

    lines.append(f"# Manifold Codebase Profile — {now}\n")
    lines.append(f"**Total runtime code:** {total_lines:,} lines across {total_files:,} files\n")

    # ── Section: By top-level directory ──
    lines.append("## 1. By Top-Level Directory\n")
    lines.append("| Directory | Files | Lines | % of Total |")
    lines.append("|-----------|------:|------:|----------:|")
    dirs = defaultdict(lambda: {"files": 0, "lines": 0})
    for f in files:
        dirs[f["dir"]]["files"] += 1
        dirs[f["dir"]]["lines"] += f["lines"]
    for d in sorted(dirs, key=lambda d: dirs[d]["lines"], reverse=True):
        s = dirs[d]
        pct = s["lines"] / total_lines * 100
        lines.append(f"| {d} | {s['files']:,} | {s['lines']:,} | {pct:.1f}% |")
    lines.append(f"| **Total** | **{total_files:,}** | **{total_lines:,}** | **100%** |\n")

    # ── Section: By file extension ──
    lines.append("## 2. By File Extension\n")
    lines.append("| Extension | Files | Lines | % of Total |")
    lines.append("|-----------|------:|------:|----------:|")
    for ext, stats in sorted(by_filetype(files).items(), key=lambda kv: kv[1]["lines"], reverse=True):
        pct = stats["lines"] / total_lines * 100
        lines.append(f"| {ext} | {stats['files']:,} | {stats['lines']:,} | {pct:.1f}% |")
    lines.append("")

    # ── Section: Directory breakdowns ──
    lines.append("## 3. Manifold/ Breakdown\n")
    lines.append("| Subsystem | Lines |")
    lines.append("|-----------|------:|")
    for sub, loc in manifold_breakdown(files).items():
        lines.append(f"| {sub} | {loc:,} |")
    lines.append("")

    lines.append("## 4. UserScripts/ Projects\n")
    lines.append("| Project | Lines |")
    lines.append("|---------|------:|")
    for proj, loc in user_scripts_breakdown(files).items():
        lines.append(f"| {proj} | {loc:,} |")
    lines.append("")

    lines.append("## 5. DSP/ Breakdown\n")
    lines.append("| Area | Lines |")
    lines.append("|------|------:|")
    for area, loc in dsp_breakdown(files).items():
        lines.append(f"| {area} | {loc:,} |")
    lines.append("")

    # ── Section: Top-50 Largest Files ──
    lines.append("## 6. Top 50 Largest Files\n")
    lines.append("| # | Lines | File |")
    lines.append("|---|------:|------|")
    for i, f in enumerate(top_largest(files, 50), 1):
        lines.append(f"| {i} | {f['lines']:,} | `{f['path']}` |")
    lines.append("")

    # ── Section: Highway / Non-Highway Duplication ──
    hw = highway_vs_nonhighway(files)
    if hw:
        lines.append("## 7. Highway vs Non-Highway DSP Nodes\n")
        lines.append("| Node | Highway | Non-Highway (cpp+h) | Ratio (HW/NH) |")
        lines.append("|------|--------:|--------------------:|--------------:|")
        for r in hw:
            ratio_str = f"{r['ratio']:.1f}x" if r["ratio"] != float("inf") else "∞"
            lines.append(f"| {r['node']} | {r['highway']:,} | {r['nonhighway_total']:,} | {ratio_str} |")
        hw_total_hw = sum(r["highway"] for r in hw)
        hw_total_nh = sum(r["nonhighway_total"] for r in hw)
        lines.append(f"| **Total** | **{hw_total_hw:,}** | **{hw_total_nh:,}** | |")
        lines.append("")

    # ── Section: Files over 1K lines ──
    fat = [f for f in files if f["lines"] >= 1000]
    lines.append("## 8. Files ≥ 1,000 Lines\n")
    lines.append(f"**Count:** {len(fat)} files, **Total:** {sum(f['lines'] for f in fat):,} lines ({sum(f['lines'] for f in fat)/total_lines*100:.0f}% of codebase)\n")
    lines.append("| Lines | File |")
    lines.append("|------:|------|")
    for f in sorted(fat, key=lambda x: x["lines"], reverse=True):
        lines.append(f"| {f['lines']:,} | `{f['path']}` |")
    lines.append("")

    # ── Section: Bloat Commentary ──
    lines.append("## 9. Bloat Flags & Commentary\n")

    # Flag: files over 2K lines
    very_fat = [f for f in fat if f["lines"] >= 2000]
    lines.append(f"**Files > 2,000 lines ({len(very_fat)}):** High-risk candidates for splitting.\n")

    # Flag: Highway duplication total
    if hw:
        duplicated = sum(r["nonhighway_total"] for r in hw)
        lines.append(f"**Highway/Non-Highway duplication:** ~{duplicated:,} lines of parallel DSP node implementations.\n")

    # Flag: UserScripts/ project count
    projs = user_scripts_breakdown(files)
    standalone = {k: v for k, v in projs.items() if k != "_SystemScripts" and k != "Main"}
    standalone_loc = sum(standalone.values())
    lines.append(f"**Standalone plugin projects:** {len(standalone)} projects, ~{standalone_loc:,} lines (runtime loaded, not dead code).\n")

    # Flag: Luabloat
    lua_files = [f for f in files if f["ext"] == ".lua"]
    lua_total = sum(f["lines"] for f in lua_files)
    lua_avg = lua_total / len(lua_files) if lua_files else 0
    lines.append(f"**Lua stats:** {len(lua_files)} files, {lua_total:,} lines total, avg {lua_avg:.0f} lines/file.\n")

    return "\n".join(lines)


# ═══════════════════════════════════════════════════════════════════════════════
# Snapshot system (for diff/change detection)
# ═══════════════════════════════════════════════════════════════════════════════

def save_snapshot(files: list[dict], path: str = None):
    """Save a JSON snapshot of the current file state."""
    if path is None:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        path = PROJECT_ROOT / "tools" / "profiling" / f"snapshot_{timestamp}.json"
    data = {
        "timestamp": datetime.now().isoformat(),
        "files": sorted([{"path": f["path"], "lines": f["lines"], "ext": f["ext"]} for f in files],
                        key=lambda x: x["path"]),
    }
    with open(path, "w") as f:
        json.dump(data, f, indent=2)
    print(f"Snapshot saved to {path}")
    return path


def diff_snapshot(files: list[dict], snapshot_path: str) -> str:
    """Compare current state against a saved snapshot."""
    with open(snapshot_path) as f:
        old_data = json.load(f)

    old_map = {e["path"]: e["lines"] for e in old_data["files"]}
    new_map = {f["path"]: f["lines"] for f in files}

    report_lines = [
        f"# Change Report vs {snapshot_path}",
        f"**Snapshot timestamp:** {old_data['timestamp']}",
        f"**Current timestamp:** {datetime.now().isoformat()}\n",
    ]

    added = []
    removed = []
    changed = []
    unchanged = 0

    for path, lines in new_map.items():
        if path not in old_map:
            added.append((path, lines))
        elif old_map[path] != lines:
            changed.append((path, old_map[path], lines))
        else:
            unchanged += 1

    for path in old_map:
        if path not in new_map:
            removed.append((path, old_map[path]))

    total_old = sum(old_map.values())
    total_new = sum(new_map.values())

    report_lines.append(f"**Previously:** {len(old_map):,} files, {total_old:,} lines")
    report_lines.append(f"**Now:** {len(new_map):,} files, {total_new:,} lines")
    report_lines.append(f"**Delta:** +{len(new_map)-len(old_map):,} files, +{total_new-total_old:,} lines\n")

    if added:
        report_lines.append(f"### Added Files ({len(added)})\n")
        report_lines.append("| Lines | File |")
        report_lines.append("|------:|------|")
        for path, lines in sorted(added, key=lambda x: x[1], reverse=True):
            report_lines.append(f"| {lines:,} | `{path}` |")
        report_lines.append("")

    if removed:
        report_lines.append(f"### Removed Files ({len(removed)})\n")
        report_lines.append("| Lines | File |")
        report_lines.append("|------:|------|")
        for path, lines in sorted(removed, key=lambda x: x[1], reverse=True):
            report_lines.append(f"| {lines:,} | `{path}` |")
        report_lines.append("")

    if changed:
        report_lines.append(f"### Changed Files ({len(changed)})\n")
        report_lines.append("| Lines (was→now) | Δ | File |")
        report_lines.append("|-----------------|------:|------|")
        for path, old_lines, new_lines in sorted(changed, key=lambda x: abs(x[2] - x[1]), reverse=True):
            delta = new_lines - old_lines
            sign = "+" if delta > 0 else ""
            report_lines.append(f"| {old_lines:,} → {new_lines:,} | {sign}{delta} | `{path}` |")
        report_lines.append("")

    return "\n".join(report_lines)


# ═══════════════════════════════════════════════════════════════════════════════
# CLI
# ═══════════════════════════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(description="Manifold codebase profiling tool")
    parser.add_argument("--report", action="store_true", help="Write markdown report to file")
    parser.add_argument("--snapshot", action="store_true", help="Save current state as snapshot JSON")
    parser.add_argument("--diff", type=str, help="Diff against a snapshot JSON file")
    parser.add_argument("--output", type=str, default=None, help="Report output path")
    args = parser.parse_args()

    files = discover_files(PROJECT_ROOT)

    if args.snapshot:
        save_snapshot(files, args.output)
        return

    if args.diff:
        diff = diff_snapshot(files, args.diff)
        print(diff)
        return

    report = generate_report(files)
    print(report)

    if args.report:
        out_path = args.output or (PROJECT_ROOT / "agent-docs" / "active" / "analysis" / f"codebase_profile_{datetime.now().strftime('%d%m%y')}.md")
        out_path = Path(out_path)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(report)
        print(f"\nReport written to {out_path}")


if __name__ == "__main__":
    main()
