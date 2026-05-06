#!/usr/bin/env python3
"""
function_profiler.py — Deep function-level analysis of C++ and Lua code.

Extracts function definitions with line ranges, computes:
  - Top-N longest functions per file
  - Average function size per file
  - Function count distribution
  - Estimated function body coverage

Usage:
  python3 tools/profiling/function_profiler.py                           # report on all big files
  python3 tools/profiling/function_profiler.py --file path/to/file.cpp   # single file
  python3 tools/profiling/function_profiler.py --top-funcs 20            # show top N functions
  python3 tools/profiling/function_profiler.py --json                    # JSON output
"""

import argparse
import json
import os
import re
import sys
from collections import defaultdict
from pathlib import Path
from datetime import datetime

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent


# ═══════════════════════════════════════════════════════════════════════════════
# C++ Function Extractor
# ═══════════════════════════════════════════════════════════════════════════════

def extract_cpp_functions(filepath: str) -> list[dict]:
    """
    Extract C++ function definitions using brace-matching state machine.
    Returns list of { name, signature, start_line, end_line, body_lines }
    """
    with open(filepath) as f:
        lines = f.readlines()

    funcs = []
    i = 0

    while i < len(lines):
        line = lines[i]
        stripped = line.strip()

        # Skip noise
        if not stripped or stripped.startswith("//") or stripped.startswith("/*") or stripped.startswith("*") or stripped.startswith("#"):
            i += 1
            continue

        if re.match(r'^\s*(namespace|class|struct|enum|template|typedef|using)\s', line):
            i += 1
            continue

        if "{" in line and not stripped.startswith("}") and not re.match(r'^\s*[\}\]]', stripped):
            if re.match(r'^\s*(if|for|while|switch|try|catch|else|case|default)\b', stripped):
                i += 1
                continue

            # Find the opening brace
            brace_idx = line.index("{")
            sig = line[:brace_idx].strip()

            if not sig or sig == "{" or re.match(r'^\s*\{', sig):
                i += 1
                continue

            # Match braces
            brace_depth = 1
            j = i
            remaining = line[brace_idx + 1:]
            for c in remaining:
                if c == "{":
                    brace_depth += 1
                elif c == "}":
                    brace_depth -= 1

            while brace_depth > 0:
                j += 1
                if j >= len(lines):
                    break
                for c in lines[j]:
                    if c == "{":
                        brace_depth += 1
                    elif c == "}":
                        brace_depth -= 1

            if j > i:
                body_lines = j - i + 1
                # Extract a readable function name
                name = sig.split("(")[0].strip()
                name = name.split()[-1] if name.split() else name

                funcs.append({
                    "name": name,
                    "signature": sig[:120],
                    "start_line": i + 1,
                    "end_line": j + 1,
                    "body_lines": body_lines,
                    "lang": "cpp",
                })
                i = j
        i += 1

    return funcs


# ═══════════════════════════════════════════════════════════════════════════════
# Lua Function Extractor
# ═══════════════════════════════════════════════════════════════════════════════

def extract_lua_functions(filepath: str) -> list[dict]:
    """
    Extract Lua named function definitions.
    Matches: function name(...), local function name(...), name = function(...)
    Tries to find matching 'end' for body size.
    """
    with open(filepath) as f:
        lines = f.readlines()

    funcs = []
    i = 0

    while i < len(lines):
        line = lines[i]
        stripped = line.strip()

        if not stripped or stripped.startswith("--"):
            i += 1
            continue

        func_name = None

        # Pattern: function name(...) or local function name(...)
        m = re.match(r'^(?:local\s+)?function\s+([\w.:\[\]"\']+)\s*\(', stripped)
        if m:
            func_name = m.group(1).strip().strip("\"'")
        else:
            # Pattern: name = function(...)
            m = re.match(r'^([\w.:\[\]"\']+)\s*=\s*function\s*\(', stripped)
            if m:
                func_name = m.group(1).strip().strip("\"'")

        if func_name:
            # Simple brace/deep matching for 'end'
            # Count current line's opening/closing for { }
            brace_depth = 0
            for c in line:
                if c == "{":
                    brace_depth += 1
                elif c == "}":
                    brace_depth -= 1

            # Scan for matching 'end'
            j = i
            found_end = False
            while j < len(lines):
                l = lines[j]
                for c in l:
                    if c == "{":
                        brace_depth += 1
                    elif c == "}":
                        brace_depth -= 1

                if j > i:
                    sl = l.strip()
                    # Check for end keyword (not inside a string)
                    if re.match(r'^\s*end\s*(?:$|--|//)', sl) and brace_depth <= 0:
                        body_lines = j - i + 1
                        funcs.append({
                            "name": func_name,
                            "signature": f"function {func_name}(...)",
                            "start_line": i + 1,
                            "end_line": j + 1,
                            "body_lines": body_lines,
                            "lang": "lua",
                        })
                        found_end = True
                        i = j
                        break

                # Also try to catch anonymous function ends by tracking do/end
                # This is a heuristic — Lua's grammar is tricky
                j += 1
                if j - i > 500:  # safety
                    break

        i += 1

    return funcs


# ═══════════════════════════════════════════════════════════════════════════════
# Analysis & Report
# ═══════════════════════════════════════════════════════════════════════════════

def analyze_file(filepath: str) -> dict:
    """Full analysis of a single file."""
    ext = Path(filepath).suffix.lower()
    if ext == ".cpp":
        funcs = extract_cpp_functions(filepath)
    elif ext == ".lua":
        funcs = extract_lua_functions(filepath)
    elif ext == ".h":
        funcs = extract_cpp_functions(filepath)
    else:
        return {"error": f"Unsupported extension: {ext}"}

    total_lines = sum(1 for _ in open(filepath))
    if not funcs:
        return {
            "file": filepath,
            "ext": ext,
            "total_lines": total_lines,
            "function_count": 0,
            "error": "No functions found (parser limitation or data-only file)",
        }

    func_body_total = sum(f["body_lines"] for f in funcs)
    funcs_sorted = sorted(funcs, key=lambda f: f["body_lines"], reverse=True)

    return {
        "file": filepath,
        "ext": ext,
        "total_lines": total_lines,
        "function_count": len(funcs),
        "func_body_lines": func_body_total,
        "coverage_pct": round(func_body_total / total_lines * 100, 1) if total_lines > 0 else 0,
        "avg_func_size": round(func_body_total / len(funcs), 1),
        "max_func_size": funcs_sorted[0]["body_lines"] if funcs_sorted else 0,
        "top_functions": funcs_sorted[:20],
        "all_functions": sorted(funcs, key=lambda f: f["body_lines"], reverse=True),
    }


def report_fat_files(threshold: int = 1500, top_n: int = 30) -> list[dict]:
    """Find all files over threshold lines and analyze their functions."""
    scan_dirs = ["manifold", "dsp", "UserScripts", "web"]

    targets = []
    for scan_dir in scan_dirs:
        scan_path = PROJECT_ROOT / scan_dir
        if not scan_path.exists():
            continue
        for fpath in scan_path.rglob("*"):
            if not fpath.is_file():
                continue
            rel = str(fpath.relative_to(PROJECT_ROOT))
            if any(x in rel for x in ["node_modules", "build", "build-dev", ".jj", ".git",
                                       "external", "agent-docs", ".cache", ".claude", ".pi", ".agents",
                                       "test_plugins", "dsp_simd_test", "prototypes", "prototypesandreseearch",
                                       "GrainFreeze_Prototype", "tests"]):
                continue
            ext = fpath.suffix.lower()
            if ext not in (".cpp", ".lua", ".h"):
                continue

            try:
                flines = sum(1 for _ in fpath.open(encoding="utf-8", errors="replace"))
            except Exception:
                continue
            if flines >= threshold:
                targets.append({
                    "path": rel,
                    "lines": flines,
                    "ext": ext,
                })

    targets.sort(key=lambda t: t["lines"], reverse=True)
    return targets[:top_n]


# ═══════════════════════════════════════════════════════════════════════════════
# CLI
# ═══════════════════════════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(description="Manifold function-level profiler")
    parser.add_argument("--file", type=str, help="Analyze a single file")
    parser.add_argument("--top-funcs", type=int, default=10, help="Show top N functions per file")
    parser.add_argument("--threshold", type=int, default=1000, help="File size threshold (lines)")
    parser.add_argument("--max-files", type=int, default=30, help="Max files to report")
    parser.add_argument("--json", action="store_true", help="Output as JSON")
    args = parser.parse_args()

    if args.file:
        # Analyze single file
        filepath = str(PROJECT_ROOT / args.file) if not os.path.isabs(args.file) else args.file
        if not os.path.exists(filepath):
            print(f"File not found: {filepath}")
            sys.exit(1)
        result = analyze_file(filepath)
        if args.json:
            print(json.dumps(result, indent=2))
        else:
            print(f"\n{'='*70}")
            print(f"  {result['file']}")
            print(f"  {result['function_count']} functions, {result['total_lines']} total lines")
            print(f"  Coverage: {result['coverage_pct']}% | Avg: {result['avg_func_size']} lines | Max: {result['max_func_size']} lines")
            print(f"{'='*70}")
            print(f"{'Line':>5} {'Size':>5}  {'Name'}")
            print(f"{'─'*70}")
            for f in result["top_functions"][:args.top_funcs]:
                print(f"{f['start_line']:>5} {f['body_lines']:>5}  {f['signature'][:90]}")
        return

    # Report fat files
    targets = report_fat_files(threshold=args.threshold, top_n=args.max_files)
    if not targets:
        print(f"No files over {args.threshold} lines found.")
        return

    results = []
    for t in targets:
        filepath = str(PROJECT_ROOT / t["path"])
        r = analyze_file(filepath)
        if "error" not in r:
            results.append(r)

    results.sort(key=lambda r: r["total_lines"], reverse=True)

    if args.json:
        # Strip all_functions to keep output manageable
        for r in results:
            r.pop("all_functions", None)
        print(json.dumps(results, indent=2))
        return

    # ── Text Report ──
    print(f"\n# Function Profile Report — {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print(f"Files over {args.threshold} lines: {len(results)}\n")

    for r in results:
        top = r["top_functions"][:args.top_funcs]
        print(f"\n{'='*70}")
        print(f"  {r['file']}")
        print(f"  {r['function_count']} functions × {r['total_lines']} lines × {r['coverage_pct']}% coverage × avg {r['avg_func_size']} lines")
        print(f"{'='*70}")
        print(f"{'Line':>5} {'Size':>5}  {'Name'}")
        print(f"{'─'*70}")
        for f in top:
            sig_short = f['signature'][:90]
            print(f"{f['start_line']:>5} {f['body_lines']:>5}  {sig_short}")

        # Summary stats at bottom
        total_func = r["function_count"]
        small = len([f for f in r["all_functions"] if f["body_lines"] <= 10])
        medium = len([f for f in r["all_functions"] if 10 < f["body_lines"] <= 50])
        large = len([f for f in r["all_functions"] if f["body_lines"] > 50])
        print(f"\n  Distribution: small(≤10)={small}  medium(11-50)={medium}  large(>50)={large}")


if __name__ == "__main__":
    main()
