# Manifold Filter Export Memory Audit

Date: 2026-04-07
Scope: `Manifold Filter` exported VST3 running inside Bitwig plugin host (`BitwigPluginHost-X64-AVX2`)
Status: Active investigation / baseline established

## Executive Summary

The exported `Manifold Filter` plugin is **not** actually costing ~270 MB of unique plugin memory.
That earlier number was raw **process RSS** for the entire Bitwig plugin host process, which is the wrong metric to label as plugin RAM.

The more honest current picture is:

- **PSS**: ~80–90 MB
- **Private Dirty**: ~50 MB
- **Lua Heap**: ~1.2 MB
- **glibc Heap Used**: ~24.9 MB
- **glibc Arena Bytes**: ~31.6 MB
- **glibc Mmap Bytes**: ~20 MB
- **glibc Free Held**: ~7.7 MB
- **glibc Releasable**: ~0.1 MB
- **glibc Arena Count**: ~46

That means:

1. **Lua is not the memory pig**.
2. The real private footprint is still too high for a simple filter.
3. The strongest current lead is **native allocator / arena / anon allocation behavior**, not packaged Lua scripts.

## Why the original RAM metric was wrong

The original overlay reported something equivalent to **process RSS**.

RSS answers:

> How much resident memory does the entire plugin-host process currently have mapped?

It does **not** answer:

> How much memory does this plugin instance uniquely cost?

That distinction matters because the Bitwig plugin host process includes:

- host executable and runtime
- shared libraries
- graphics stack
- plugin code
- shared mapped pages
- memory that may be counted in other processes too

Because of that, RSS is real, but it is **not the correct plugin-memory metric**.

## Metrics that actually matter

### PSS (Proportional Set Size)

Best single number for:

> How much memory is this process fairly responsible for?

Observed:

- ~80–90 MB

This is the current best overall "real cost" number.

### Private Dirty

Best single number for:

> How much memory is definitely private to this process and likely scales more like per-instance cost?

Observed:

- ~50 MB

This is the current best "unique / scaling" number.

### Lua Heap

Observed:

- ~1.2 MB

Conclusion:

- Lua is basically irrelevant to the memory problem.
- Scripts, widget count, and Lua VM state are not the main cause of plugin memory bloat.

## Live host-process breakdown

From `/proc/<pid>/smaps` category aggregation of the Bitwig plugin host process:

- **anon**: ~28.5 MB RSS/PSS/private dirty
- **[heap]**: ~18.4 MB private dirty
- **plugin `.so` mappings**: ~13.6 MB RSS/PSS
- **graphics libs**: ~35.5 MB RSS, but only ~3.6 MB PSS (mostly shared)
- **LLVM**: ~105 MB RSS, but only ~7.3 MB PSS (mostly shared)

### Important implication

The huge-looking RSS from LLVM / graphics libraries is visually alarming but **not** the main unique cost.
The real unique pressure is mostly:

- native heap
- anonymous private mappings
- allocator-managed native memory

## Top private mappings observed

Representative largest private mappings:

- `[heap]`: ~18.4 MB private dirty
- anon mapping: ~12.0 MB private dirty
- anon mapping: ~8.2 MB private dirty
- anon mapping: ~4.1 MB private dirty
- plugin code mapping: ~10.9 MB private mapped code/data

These line up with the ~50 MB private dirty number.

## glibc allocator interpretation

### What glibc is

`glibc` is the GNU C standard library on Linux.
For this investigation, the important part is that it provides the process allocator used for many native allocations (`malloc`, `free`, `new`, containers, buffers, runtime allocations, etc.).

### What arenas are

glibc can create multiple internal allocation pools called **arenas**.
This helps reduce allocator lock contention in multithreaded processes.

But more arenas can also mean:

- more fragmentation
- more retained free memory
- more heap overhead
- less memory being returned cleanly to the OS

### Observed allocator telemetry

Current approximate values from the export plugin:

- **Heap Used**: ~24.9 MB
- **Arena Bytes**: ~31.6 MB
- **Mmap Bytes**: ~20 MB
- **Free Held**: ~7.7 MB
- **Releasable**: ~0.1 MB
- **Arena Count**: ~46

### Interpretation

This is the strongest current story:

- About **24.9 MB** is live heap allocation known to glibc.
- About **31.6 MB** total is held in arena-backed heap regions.
- About **7.7 MB** is free but still retained by the allocator.
- About **20 MB** is allocator-managed mmap-backed allocation.
- **46 arenas** is a lot and strongly suggests multithreaded allocator overhead / fragmentation effects.

### Practical reading of those numbers

The heap value is almost certainly **24.9 MB**, not 249 MB.
That conclusion is supported by:

- Arena: 31.6 MB
- Free held: 7.7 MB
- Therefore live arena usage ≈ 31.6 - 7.7 = 23.9 MB

That lines up closely with the ~24.9 MB heap-used reading.

## Current conclusions

### Confirmed

- **Lua is not the problem**.
- The memory problem is **native**, not script-driven.
- The plugin is still too fat at roughly:
  - **~80–90 MB PSS**
  - **~50 MB private dirty**
- Shared graphics / LLVM mappings are not the main unique memory cost.
- A large part of the problem is now pointing at:
  - allocator-managed heap
  - anonymous native mappings
  - many glibc arenas

### Most likely optimization targets

1. **Reduce live native allocations**
2. **Reduce large allocator mmap-backed blocks**
3. **Reduce arena proliferation / fragmentation effects**
4. **Reduce export-mode native baggage still being instantiated**

## Export-plugin optimizations already applied during this investigation

The following were already reduced in export mode:

- export plugin now starts in **normal view**, not settings
- generic editor hosts are skipped in export mode where possible
- unnecessary host sync work in export mode was cut down
- timer rate for export mode was reduced compared to the generic editor path
- overlay memory metrics were corrected away from fake raw RSS labeling

These helped clarify measurement and reduce some idle waste, but they did **not** remove the main native allocator footprint.

## What we are optimizing for

Target range desired by user:

- **25–50 MB**: probably acceptable
- **less than that**: excellent
- **~80–90 MB PSS / ~50 MB private dirty**: still too fat for a simple filter

So the real optimization goals are:

- lower **Private Dirty**
- lower **PSS**
- understand whether the current cost is:
  - real live memory
  - allocator fragmentation / retained free memory
  - or unnecessary export/runtime allocations

## Recommended next steps

### 1. Arena-limit experiment

Test glibc arena limiting, e.g. via:

- `mallopt(M_ARENA_MAX, N)`
- or equivalent allocator/environment configuration for controlled experiments

Goal:

- determine how much memory drops when arena proliferation is constrained

This is currently the strongest single experiment to run next.

### 2. Trim experiment

Run a controlled `malloc_trim(0)` experiment and measure before/after:

- PSS
- Private Dirty
- Heap Used
- Arena Bytes
- Free Held

Goal:

- determine whether allocator-retained memory is a big part of the footprint

### 3. Lifecycle-delta memory profiling

Measure memory at key lifecycle points:

- before UI load
- after UI load
- after DSP init
- after idle stabilization
- after opening settings/perf overlay
- after closing/reopening UI surfaces

Goal:

- identify which stage actually grows heap/anon footprint

### 4. Mmap allocation attribution

Investigate what is responsible for the ~20 MB allocator mmap usage:

Potential candidates:

- large native buffers
- image/font resources
- runtime caches
- export-mode native subsystems still being brought up unnecessarily

### 5. Improve overlay formatting / readability

The current overlay was too cramped to distinguish values like `24.9 MB` vs `249 MB`.
This should be improved if memory telemetry remains in the export overlay.

## Bottom line

The current memory picture is no longer mysterious:

- **Not Lua**
- **Not raw RSS**
- **Not mainly shared graphics/LLVM libs**
- **Mostly native allocator / heap / anon memory**
- **glibc arena behavior is a very strong lead**

The export filter still uses too much memory, but the problem is now framed correctly enough to pursue real optimizations that should help exported Manifold plugins more broadly.
