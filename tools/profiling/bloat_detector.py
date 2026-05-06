#!/usr/bin/env python3
"""
bloat_detector.py — Structural bloat analysis for Manifold codebase.

Detects:
  - Files with too many concerns (mixed responsibilities)
  - Extremely long functions (god functions)
  - Parallel/spec tables that should be merged
  - Files that are pure getter/setter boilerplate
  - Comment-to-code ratio outliers

Usage:
  python3 tools/profiling/bloat_detector.py                          # full report
  python3 tools/profiling/bloat_detector.py --json                   # JSON output
  python3 tools/profiling/bloat_detector.py --threshold 2000         # custom thresholds
"""

import argparse
import json
import os
import re
import sys
from collections import defaultdict, Counter
from pathlib import Path
from datetime import datetime

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent

# ── Config ──────────────────────────────────────────────────────────────────

# Keywords that indicate a file has too many concerns
CONCERN_KEYWORDS = {
    "ui": ["ImGui", "draw", "render", "widget", "canvas", "mouse", "keyboard", "click", "drag", "hover", "layout", "panel"],
    "dsp": ["sample", "fft", "partial", "waveform", "audio", "buffer", "signal", "node.add", "node.new", "connect"],
    "osc": ["osc", "oscquery", "endpoint", "ws://", "websocket"],
    "serialization": ["serialize", "deserialize", "to_json", "from_json", "save_state", "load_state"],
    "file_io": ["read_file", "write_file", "fopen", "load_file", "save_file", "file(", "fread", "fwrite"],
    "graph": ["node", "edge", "connect", "graph", "runtime", "topology"],
    "profiling": ["profiler", "perf", "timing", "snapshot", "memory", "mallinfo"],
    "midi": ["midi", "note_on", "note_off", "cc ", "pitch_bend"],
    "video": ["video", "shader", "glsl", "opengl", "frame", "texture"],
    "config": ["settings", "config", "preferences", "property"],
}

# Concern density threshold — if a file has hits across >3 categories, flag it
CONCERN_SPREAD_THRESHOLD = 4
CONCERN_STRONG_HIT_THRESHOLD = 5  # lines matching a single category


def is_excluded(path: str) -> bool:
    return any(x in path for x in [
        "node_modules", "build", "build-dev", ".jj", ".git",
        "external", "agent-docs", ".cache", ".claude", ".pi", ".agents",
        "test_plugins", "dsp_simd_test", "prototypes", "prototypesandreseearch",
        "GrainFreeze_Prototype", "tests", "tools/profiling",
    ])


# ═══════════════════════════════════════════════════════════════════════════════
# Concern Detection
# ═══════════════════════════════════════════════════════════════════════════════

def detect_concerns(filepath: str) -> dict:
    """
    Scan a file for keyword density across concern categories.
    Returns { concern_name: hit_count, ... } for categories with >= STRONG_HIT_THRESHOLD.
    """
    try:
        with open(filepath) as f:
            content = f.read()
    except Exception:
        return {}

    lines = content.lower().split("\n")
    hits = defaultdict(int)

    for line in lines:
        if line.strip().startswith("//") or line.strip().startswith("--") or line.strip().startswith("/*") or line.strip().startswith("*"):
            continue
        for concern, keywords in CONCERN_KEYWORDS.items():
            for kw in keywords:
                if kw in line:
                    hits[concern] += 1
                    break  # one hit per line per concern

    return {k: v for k, v in hits.items() if v >= CONCERN_STRONG_HIT_THRESHOLD}


def mixed_concern_report(threshold: int = 1000) -> list[dict]:
    """
    Find files with too many mixed concerns.
    Returns list of { path, lines, concerns, concern_count, flag }
    """
    results = []
    scan_dirs = ["manifold", "dsp", "UserScripts", "web"]

    for scan_dir in scan_dirs:
        scan_path = PROJECT_ROOT / scan_dir
        if not scan_path.exists():
            continue
        for fpath in scan_path.rglob("*"):
            if not fpath.is_file():
                continue
            rel = str(fpath.relative_to(PROJECT_ROOT))
            if is_excluded(rel):
                continue
            ext = fpath.suffix.lower()
            if ext not in (".cpp", ".lua", ".ts", ".h"):
                continue

            try:
                lines = sum(1 for _ in fpath.open(encoding="utf-8", errors="replace"))
            except Exception:
                continue
            if lines < threshold:
                continue

            concerns = detect_concerns(str(fpath))
            if len(concerns) >= CONCERN_SPREAD_THRESHOLD:
                results.append({
                    "path": rel,
                    "lines": lines,
                    "concerns": concerns,
                    "concern_count": len(concerns),
                    "flag": "MIXED_CONCERNS",
                })

    results.sort(key=lambda r: r["lines"], reverse=True)
    return results


# ═══════════════════════════════════════════════════════════════════════════════
# God Function Detection
# ═══════════════════════════════════════════════════════════════════════════════

def scan_god_functions() -> list[dict]:
    """
    Find functions with body size > 100 lines across all C++/Lua files.
    """
    results = []

    # Use the imports from function_profiler
    sys.path.insert(0, str(PROJECT_ROOT / "tools" / "profiling"))
    try:
        from function_profiler import extract_cpp_functions, extract_lua_functions
    except ImportError:
        print("Warning: function_profiler.py not found — running inline")
        # Minimal fallback — just report the files, not the functions
        return []

    scan_dirs = ["manifold", "dsp", "UserScripts", "web"]
    for scan_dir in scan_dirs:
        scan_path = PROJECT_ROOT / scan_dir
        if not scan_path.exists():
            continue
        for fpath in scan_path.rglob("*"):
            if not fpath.is_file():
                continue
            rel = str(fpath.relative_to(PROJECT_ROOT))
            if is_excluded(rel):
                continue
            ext = fpath.suffix.lower()
            if ext not in (".cpp", ".lua", ".h"):
                continue
            try:
                if ext in (".cpp", ".h"):
                    funcs = extract_cpp_functions(str(fpath))
                else:
                    funcs = extract_lua_functions(str(fpath))
            except Exception:
                continue

            for f in funcs:
                if f["body_lines"] >= 80:  # god function threshold
                    results.append({
                        "file": rel,
                        "function": f["name"],
                        "signature": f["signature"][:100],
                        "start_line": f["start_line"],
                        "body_lines": f["body_lines"],
                    })

    results.sort(key=lambda r: r["body_lines"], reverse=True)
    return results


# ═══════════════════════════════════════════════════════════════════════════════
# Table/Pair Redundancy Detection
# ═══════════════════════════════════════════════════════════════════════════════

def find_parallel_tables() -> list[dict]:
    """
    Heuristic: find Lua files where multiple large tables are defined
    sequentially — a sign of parallel spec tables.
    """
    results = []
    scan_dirs = ["UserScripts", "manifold"]

    for scan_dir in scan_dirs:
        scan_path = PROJECT_ROOT / scan_dir
        if not scan_path.exists():
            continue
        for fpath in scan_path.rglob("*.lua"):
            if not fpath.is_file():
                continue
            rel = str(fpath.relative_to(PROJECT_ROOT))
            if is_excluded(rel):
                continue
            try:
                with open(fpath) as f:
                    content = f.read()
            except Exception:
                continue

            # Count table assignments (name = { ... })
            tables = re.findall(r'^(\w+)\s*=\s*\{', content, re.MULTILINE)
            caps = re.findall(r'^([A-Z_]{3,})\s*=\s*\{', content, re.MULTILINE)

            total_tables = len(tables) + len(caps)

            # Flag: more than 3 large table definitions
            total_lines = content.count("\n") + 1
            if total_lines >= 500 and total_tables >= 4:
                results.append({
                    "path": rel,
                    "lines": total_lines,
                    "named_tables": len(tables),
                    "constant_tables": len(caps),
                    "flag": "PARALLEL_TABLES",
                })

    return sorted(results, key=lambda r: r["lines"], reverse=True)


# ═══════════════════════════════════════════════════════════════════════════════
# Getter/Setter Boilerplate Detection
# ═══════════════════════════════════════════════════════════════════════════════

def count_getter_setter_lines(filepath: str) -> int:
    """Estimate lines of trivial getter/setter boilerplate."""
    with open(filepath) as f:
        content = f.read()
    # C++ pattern: return memberVariable; in a 3-line function
    getters = len(re.findall(r'^\s+\w+\s+\w+::get\w+\(.*\)\s*const\s*\{', content, re.MULTILINE))
    setters = len(re.findall(r'^\s+void\s+\w+::set\w+\(', content, re.MULTILINE))
    return (getters + setters) * 3  # approximate lines


# ═══════════════════════════════════════════════════════════════════════════════
# Comment-to-Code Ratio
# ═══════════════════════════════════════════════════════════════════════════════

def comment_ratio(filepath: str) -> dict:
    """Estimate comment vs code lines."""
    try:
        with open(filepath) as f:
            lines = f.readlines()
    except Exception:
        return {"comments": 0, "code": 0, "ratio": 0}

    ext = Path(filepath).suffix.lower()
    comment_count = 0
    code_count = 0
    in_block_comment = False

    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue

        if ext in (".cpp", ".h", ".ts", ".js"):
            if stripped.startswith("/*"):
                in_block_comment = True
            if in_block_comment:
                comment_count += 1
                if "*/" in stripped:
                    in_block_comment = False
                continue
            if stripped.startswith("//") or stripped.startswith("*"):
                comment_count += 1
                continue
            if stripped.startswith("#"):
                continue
            code_count += 1

        elif ext == ".lua":
            if stripped.startswith("--[[") or stripped.startswith("--[=["):
                in_block_comment = True
            if in_block_comment:
                comment_count += 1
                if "]]" in stripped or "]=]" in stripped:
                    in_block_comment = False
                continue
            if stripped.startswith("--"):
                comment_count += 1
                continue
            code_count += 1

    total = comment_count + code_count
    return {
        "comments": comment_count,
        "code": code_count,
        "ratio": round(comment_count / code_count, 2) if code_count > 0 else 0,
    }


# ═══════════════════════════════════════════════════════════════════════════════
# Main Report
# ═══════════════════════════════════════════════════════════════════════════════

def generate_report() -> str:
    lines = []
    now = datetime.now().strftime("%Y-%m-%d %H:%M")

    lines.append(f"# Bloat & Structural Debt Report — {now}\n")

    # ── Mixed Concerns ──
    lines.append("## 1. Mixed Concern Files (≥4 concern categories)\n")
    concerns = mixed_concern_report(threshold=800)
    if concerns:
        lines.append("| Lines | Concerns | Categories | File |")
        lines.append("|------:|---------:|------------|------|")
        for r in concerns[:20]:
            cats = ", ".join(f"{k}({v})" for k, v in sorted(r["concerns"].items(), key=lambda x: x[1], reverse=True))
            lines.append(f"| {r['lines']:,} | {r['concern_count']} | {cats} | `{r['path']}` |")
        lines.append(f"\n_Total: {len(concerns)} files flagged_\n")
    else:
        lines.append("None found.\n")

    # ── God Functions ──
    lines.append("## 2. God Functions (≥80 lines)\n")
    gods = scan_god_functions()
    if gods:
        lines.append("| Lines | Function | File |")
        lines.append("|------:|----------|------|")
        for r in gods[:30]:
            lines.append(f"| {r['body_lines']:,} | `{r['function']}` | `{r['file']}:{r['start_line']}` |")
        lines.append(f"\n_Total: {len(gods)} god functions_\n")
    else:
        lines.append("(requires function_profiler.py — run together)\n")

    # ── Parallel Tables ──
    lines.append("## 3. Parallel Table Definitions (table redundancy)\n")
    tables = find_parallel_tables()
    if tables:
        lines.append("| Lines | Named Tables | Constant Tables | File |")
        lines.append("|------:|-------------:|----------------:|------|")
        for r in tables[:15]:
            lines.append(f"| {r['lines']:,} | {r['named_tables']} | {r['constant_tables']} | `{r['path']}` |")
        lines.append("")
    else:
        lines.append("None found.\n")

    return "\n".join(lines)


# ═══════════════════════════════════════════════════════════════════════════════
# CLI
# ═══════════════════════════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(description="Manifold bloat & structural debt detector")
    parser.add_argument("--json", action="store_true", help="JSON output")
    parser.add_argument("--god-funcs", action="store_true", help="Only scan god functions")
    parser.add_argument("--concerns", action="store_true", help="Only mixed concerns report")
    parser.add_argument("--tables", action="store_true", help="Only parallel table report")
    parser.add_argument("--threshold", type=int, default=800, help="Min lines for concern analysis")
    args = parser.parse_args()

    if args.god_funcs:
        gods = scan_god_functions()
        if args.json:
            print(json.dumps(gods, indent=2))
        else:
            print(f"# God Functions ({len(gods)} found)\n")
            for r in gods[:30]:
                print(f"  {r['body_lines']:>5}L  {r['file']}:{r['start_line']}  {r['function']}")
        return

    if args.concerns:
        concerns = mixed_concern_report(threshold=args.threshold)
        if args.json:
            print(json.dumps(concerns, indent=2))
        else:
            print(f"# Mixed Concern Files ({len(concerns)} found)\n")
            for r in concerns:
                print(f"  {r['lines']:>5}L  {r['concern_count']} concerns  {r['path']}")
                for k, v in sorted(r['concerns'].items(), key=lambda x: x[1], reverse=True):
                    print(f"         {k}: {v}")
                print()
        return

    if args.tables:
        tables = find_parallel_tables()
        if args.json:
            print(json.dumps(tables, indent=2))
        else:
            print(f"# Parallel Tables ({len(tables)} found)\n")
            for r in tables:
                print(f"  {r['lines']:>5}L  {r['flag']}  {r['path']}")
        return

    # Full report
    report = generate_report()
    print(report)

    out_path = PROJECT_ROOT / "agent-docs" / "active" / "analysis" / f"bloat_debt_{datetime.now().strftime('%d%m%y')}.md"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(report)
    print(f"Report written to {out_path}")


if __name__ == "__main__":
    main()
