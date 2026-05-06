# Golden-File Drift Management

**Date:** 2026-05-06 (v1)
**Status:**  PENDING — Documenting the known problem and options. No active work.
**Original smell:** `agent-docs/260505_architectural_smells_from_test_coverage.md` §7
**Audience:** Agents planning testing infrastructure improvements

---

## The Problem

The codebase has **57 golden JSON files** in `tests/fixtures/`. The comparison in `ContractHarnessUtils.h::verifyJsonContract()` is string-exact after `juce::JSON::toString()` normalization:

```cpp
juce::JSON::toString(goldenVar).toStdString() == juce::JSON::toString(currentVar).toStdString()
```

This catches real behavioral drift immediately — but it also fails on meaningless differences:

| Class of noise | Example | Already hit? |
|---------------|---------|-------------|
| Float representation | `0.699999988079071` vs `0.7` | Yes — `dsp_host_lifecycle_contract_golden.json` |
| Allocator/memory counters | `pssBytes` varies between runs | Yes — `export_support_contract_golden.json` |
| Timing values | `lastRenderUs`, `uptimeSeconds` | Yes — `surface_providers_draw_smoke_contract_golden.json` |
| Field accretion | Legitimate new field added | Yes — `core_state_golden.json` `editContentMode` |
| `DynamicObject` key ordering | Not a problem *yet* — `JSON::toString` sorts keys | N/A |

Every false positive costs time: isolate the diff, decide if it's noise or drift, regen golden, verify manually. As the golden count grows, so does the surface area for noise.

---

## What's Already Been Done

Two contracts were patched in-line with **invariant assertions** instead of raw value capture:

- `export_support_contract_golden.json` — `pssBytes`/`privBytes` replaced with `pssPositive: true`, `privPositive: true`
- `surface_providers_draw_smoke_contract_golden.json` — `lastRenderUs` replaced with `lastRenderUsPositive: true`

This pattern works but is manual — you have to know which fields drift when writing the harness.

---

## The Options (When Someone Picks This Up)

### A. Float tolerance in `verifyJsonContract()`

Add a `floatTolerance` parameter (default `0.0` = exact). When set to e.g. `1e-4`, the comparator parses both values as doubles and checks `|a - b| < tol` instead of string equality for numeric leaf nodes.

**Cost**: ~20 lines in `ContractHarnessUtils.h`. Zero migration needed — default preserves exact behavior.
**Covers**: Float representation noise only.
**Worth doing now?**: Yes — it's a utility function change, not a pass. But the user decided to defer.

### B. `JsonComparisonOptions` struct

Evolve the comparator to accept:
- `floatTolerance` — float epsilon
- `ignoredKeys` — paths to skip entirely
- `shapeOnlyPaths` — check key presence but not values (good for deep arrays)
- `requiredKeys` — fail if missing

**Cost**: ~50 lines in `ContractHarnessUtils.h` + migration of individual contracts.
**Covers**: All noise classes, composably.
**Worth doing now?**: Not until the 57 goldens actually become a burden or a new noise class surfaces.

### C. JSON Schema validation

Replace goldens with JSON Schema files. The test validates against a schema describing types, ranges, and required fields — no golden file at all.

**Cost**: High. Schema files for all 57 contracts + a schema validator dependency.
**Covers**: Everything, but loses the instant "something changed" signal goldens give you.
**Worth doing now?**: No. Overkill for the current scale.

### D. Composite (recommended for the future)

Do B first (`JsonComparisonOptions`). Then migrate contracts one at a time when they produce false positives. Keep the golden as the source of truth for behavioral drift. Only add comparison options when a contract proves noisy.

**Why not pure schemas?** The golden is the canary. If you remove it, you lose the ability to catch subtle value drift that isn't covered by a schema range check. "tempo was 120.0, now it's 120.1" is a real behavioral change that a schema with `"minimum": 20, "maximum": 300` would miss.

---

## Inventory of Goldens by Size

57 files total:

| Size range | Count | Risk |
|-----------|-------|------|
| < 1 KB | ~20 | Low — simple contracts, easy to regen |
| 1–10 KB | ~25 | Medium |
| 10–100 KB | ~8 | Notable — each regen requires careful review |
| 100+ KB | 2 | `direct_host_contract_golden.json` (126 KB), `lua_bindings_golden.json` (426 KB) — highest friction |

The two largest are the most painful when they drift. Any comparison-tooling work should prioritize those.

---

## Provided Infrastructure

Everything lives in `manifold/headless/ContractHarnessUtils.h`:

- `verifyJsonContract(contractName, rawCurrent, goldenPath)` — exact string comparison
- `finishJsonContract(opts, contractName, rawContract)` — dispatch to print/write/verify
- `parseOptions(argc, argv, opts)` — CLI arg parsing for `--print-contract`, `--write-contract`, `--verify-contract`

Adding comparison options means modifying `verifyJsonContract()` signature or adding an overload. The pattern is straightforward.

---

## When to Kick This

When **two** of the following are true:
1. A new noise class produces a false positive (e.g., `DynamicObject` key reordering)
2. The golden count exceeds ~80 files
3. A 100+ KB golden drifts and the diff is mostly noise

Until then, the existing invariant-assertion patch pattern is sufficient.
