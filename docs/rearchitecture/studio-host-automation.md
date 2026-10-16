# Studio automation and exported parameter contracts

Studio running as a plug-in publishes **2,048 continuous automation slots**, each
with a stable host ID and a normalized range of 0–1. The bank is part of Studio's
DAW interface. A project may have more internal controls, processors, visuals or
connections than there are automation slots.

Studio translates a slot's normalized value into its assigned control's physical
range. A filter selector can occupy a slot without changing the slot's host type:
the graph converts the continuous input to its discrete choice. Hosts that refresh
parameter titles receive the authored control name and formatted units; hosts
that retain their original titles can keep displaying “Automation 1”, etc. Slot
IDs, range, continuous type and default remain stable during these assignments.

This lets Studio add, delete, wrap and replace graph contents during playback
without restarting the plug-in to change its parameter list. The current adapters
reserve the same bank in CLAP and VST3. Audio I/O layout changes retain their
separate host negotiation requirements.

## Saved assignments

`hostBindings` is the explicit active export/automation contract. An empty array
means no exposed controls. Older documents with neither binding nor assignment
metadata retain their inferred-binding interpretation.

`hostAssignments` records slot ownership across deletion, undo and reopening:

```json
{
  "hostAssignments": [
    { "slot": 0, "path": "/tone/brightness" },
    { "slot": 1 }
  ],
  "hostBindings": []
}
```

Slots in the document are zero-based. A named control can reclaim its own slot
when restored. The slot-only entry preserves an unnamed low-level binding after
removal; it is not available to the automatic allocator. New controls skip all
reservations. Explicit user reassignment swaps reservations along with active
bindings. Import rejects a named reservation that points at a different control.

Device controls automatically receive named slots. An explicitly omitted binding
for a still-present control remains omitted across source reconciliation. Grouping
into a reusable Device carries the existing control identities and assignments.
Controls whose slots lie beyond Studio's bank remain usable inside the project;
they do not gain DAW automation in Studio. An exported product can expose them.

## Exported products

An exported CLAP or VST3 product exposes exactly its declared `hostBindings`;
there are no filler Studio slots. The control declaration supplies its name,
range, default, units and discrete behavior. Current values are saved separately
from declared defaults. CLAP exposes physical ranges; VST3 retains its normalized
transport with physical conversions and stepped metadata.

Rebuilding a product with a changed public parameter contract may require the DAW
to reload it. CLAP retains the old active surface until host deactivation and then
rescans the full contract. VST3 requests component reload when IDs, ranges, defaults
or discrete behavior change. Host acceptance of a reload remains host-dependent.
Names and value text can refresh without a Studio surface restart.

Plug-in-format ID validation happens at the adapter boundary. VST3's host-reserved
ID range and CLAP's invalid-ID sentinel are not graph node limits. DSP parameter
addresses retain all node bits independently of host slot IDs.

## Verification

- `web/tests/host-assignments.test.js`: deletion, repeated source edits, undo,
  reopening, explicit empty exposure, conflicting assignments, unnamed removal
  and raw node-ID reuse.
- `crates/manifold-native/tests/host_surface.rs`: 2,050 internal controls beside
  Studio's 2,048 host slots, exact and empty exported contracts, saved reservations,
  names and value formatting.
- CLAP and VST3 `host_surface_edits_automate_and_reopen`: real SDK callbacks,
  600→620→580 control edits, host notifications, automation, save/reopen, and
  continuous-to-discrete reassignment. The same tests run with Studio and exported
  build configuration. Callback heap instrumentation checks exercised audio paths.

These are adapter and runtime checks. They do not establish every DAW's title
refresh behavior or acceptable automation-list UI performance.

Actual Linux REAPER 7.79 also discovers **2,048 Studio slots** in both formats
(and its own Bypass, Wet and Delta controls). A bound control set to 0.375 remains
0.375 after saving and reopening the DAW project. The probe verifies the loaded
library paths and records their hashes, uses a private null sink and isolated
X display, and opens no project editor. See the [REAPER report](../../web/public/studio/2026-10-13-automation-bank/reaper-report.json).
This verifies discovery and recall, not the ergonomics of browsing 2,048 slots
or live title refresh in every DAW.
