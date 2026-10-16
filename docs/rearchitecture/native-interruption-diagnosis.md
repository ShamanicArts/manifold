# Native interruption crash and audition settings

12 October 2026. Follow-up to the [Device authoring delivery](device-authoring-completion.md).

## Confirmed cause

At 05:18:02 BST, the debug `live_main_wave` test process (PID 2258877)
segfaulted while constructing the JavaScript controller, before audio rendering.
The original core contains the uncatchable JavaScript exception `interrupted`.
QuickJS was using 4,203,608 bytes of its 33,554,432-byte allocation allowance.
The failing stack runs through `snapshot`, graph presentation construction,
`JS_CallInternal`, property cleanup and `list_del`.

The embedded QuickJS-NG 0.16.2 implementation of `js_array_find` frees its
`val` and `index_val` locals after an unsuccessful predicate. It does not clear
those locals. If the interrupt poll at the beginning of the following iteration
fires, the exception handler frees the stale values again. For an object item,
this can destroy an object still referenced by the array. Later array cleanup
then uses freed memory. The same implementation serves `find`, `findIndex`,
`findLast` and `findLastIndex`.

A standalone C harness using the same bundled engine and Main Wave controller
reproduced SIGSEGV at interrupt polls 615, 624, 630, 638 and 645 within a sweep
of 598–648. A debugger breakpoint at poll 615 identifies `js_array_find` as the
interruption site. AddressSanitizer identifies its exception cleanup as the
premature free and later property cleanup as the use-after-free. This matches
the original core's cleanup failure and pending interruption exception.

This establishes the mechanism. It does not establish the first project revision
that exposed it. Earlier bundles also timed out in the unoptimized interpreter;
that alone was never evidence that the segmentation fault predated the Device work.

## Repair and regression

The repository pins the existing `rquickjs-sys` 0.14.0 distribution under
`vendor/rquickjs-sys`, verified against its crates.io checksum. Its only code
change clears both locals to `JS_UNDEFINED` immediately after freeing them.
See [patch provenance](../../vendor/rquickjs-sys/MANIFOLD-PATCH.md). The dependency
is patched through Cargo, without modifying the shared Cargo registry cache or
replacing JavaScript builtins with application-specific approximations.

The [regression test](../../crates/manifold-project-js/tests/interrupted_array_search.rs)
interrupts all four search methods at eight poll budgets and two VM poll phases.
It then reads every retained object's index and destroys the context/runtime.
The original dependency segfaults on this test; the patched dependency passes.
All five crashing Main Wave interruption points also pass AddressSanitizer with
leak detection after the patch, returning `InternalError: interrupted` normally.

The embedded C interpreter is now optimized in Cargo's development profile while
Manifold Rust code retains development settings. The full Main Wave debug test,
including edits, held notes and recall, passes with this configuration. Runtime
time, stack and memory limits were not increased or disabled. The existing
runaway-script test still verifies a timeout before publication.

## Studio audio correction

The initial UI relocation put the legacy host audition controls in Settings.
Lucas rejected that scope: sources and routing belong to authored project graphs;
Settings only owns audio hardware. That relocation is superseded by
[graph-owned audio sources](studio-audio-sources.md). The QuickJS fix above remains.
The original evidence below records the earlier checkpoint, not the current UI.
Device wrapping state continuity remains separate work.

## Evidence

- Default `cargo test --workspace`: **570 passing tests**, including the new
  64-case interruption regression and the existing runaway-script timeout test.
- Web checks: **190 passing tests**; native release, UI Wasm, DSP Wasm and
  production website builds pass. Existing Vite chunk-size warnings remain.
- Actual pointer clicks in browser Settings switch Saw → Noise → Silent → Saw.
  Measured RMS is 0.3262 → 0.2638 → 0 → 0.3262, with zero processing failures.
  Start/stop and closing Settings while audio runs also work. The browser uses
  a verified silent Web Audio sink.
- Actual pointer clicks in standalone Settings switch Noise → Silent → Saw →
  Noise → Saw. Silent measures exactly zero; each sounding source returns above
  0.33 RMS, with the same audio process running and its failure flag false.
  The app runs in an owned Xvfb display against the private null sink.
- [Machine-readable results](evidence/2026-10-12-crash-settings.json).

Detailed logs, the standalone diagnostic harness and actual UI captures are under
`~/.cache/manifold/crash-settings-20261012/`. No extracted core dump is retained.
The original system-managed core is unchanged.
