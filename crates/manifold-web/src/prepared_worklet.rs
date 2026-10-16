//! Experimental ownership transfer. Each handle belongs to one Wasm memory;
//! the preparer must stop accessing it before the audio agent starts. No ABI
//! operation here uses the instance's thread-local ENGINE or builds a graph.

use super::{ENGINE, WorkletEngine, decode_graph_event, process_engine, push_graph_event};
use manifold_core::graph::NodeId;
use std::ffi::c_void;

struct PreparedEngine {
    engine: WorkletEngine,
    identity: Vec<(NodeId, NodeId)>,
    mapped_identity: bool,
    inheritance: Vec<(NodeId, u32, NodeId)>,
    loops: Vec<(NodeId, NodeId, [f32; 7], u32)>,
    resources: Vec<(NodeId, NodeId)>,
}

#[unsafe(no_mangle)]
pub extern "C" fn manifold_prepared_version() -> u32 {
    4
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn manifold_prepared_accepts_events(handle: *mut c_void, node: u32) -> u32 {
    unsafe { handle.cast::<PreparedEngine>().as_ref() }.map_or(0, |prepared| {
        u32::from(prepared.engine.plan.accepts_events(node.into()))
    })
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn manifold_prepared_midi_trace_count(handle: *mut c_void) -> u32 {
    unsafe { handle.cast::<PreparedEngine>().as_ref() }
        .map_or(0, |prepared| prepared.engine.plan.midi_trace_count() as u32)
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn manifold_prepared_midi_trace_field(
    handle: *mut c_void,
    index: u32,
    field: u32,
) -> u32 {
    unsafe { handle.cast::<PreparedEngine>().as_ref() }
        .and_then(|prepared| prepared.engine.plan.midi_trace_entry(index as usize))
        .map_or(u32::MAX, |entry| super::midi_trace_field(entry, field))
}

/// The audio owner alone queues bounded events into this engine, using the
/// actual upcoming block length. The existing Rust processor consumes them.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn manifold_prepared_event_push(
    handle: *mut c_void,
    node: u32,
    offset: u32,
    kind: u32,
    channel: u32,
    note: u32,
    velocity: u32,
    frames: u32,
) -> u32 {
    let Some(kind) = decode_graph_event(kind, channel, note, velocity) else {
        return 0;
    };
    unsafe { handle.cast::<PreparedEngine>().as_mut() }.map_or(0, |prepared| {
        push_graph_event(&mut prepared.engine, node, offset, kind, frames)
    })
}

/// Off-callback storage for each Wasm instance's distinct TLS and stack. The
/// caller retains the entire arena until all instances have relinquished it.
#[unsafe(no_mangle)]
pub extern "C" fn manifold_prepared_allocate(bytes: u32, align: u32) -> *mut u8 {
    let Ok(layout) = std::alloc::Layout::from_size_align(bytes as usize, align as usize) else {
        return std::ptr::null_mut();
    };
    if bytes == 0 {
        return std::ptr::null_mut();
    }
    unsafe { std::alloc::alloc_zeroed(layout) }
}

/// Negative control for the experimental allocator instrumentation only.
#[unsafe(no_mangle)]
pub extern "C" fn manifold_prepared_probe_allocation() {
    drop(std::hint::black_box(Box::new(7_u32)));
}

#[unsafe(no_mangle)]
pub extern "C" fn manifold_prepared_take() -> *mut c_void {
    ENGINE.with(|slot| {
        slot.borrow_mut()
            .take()
            .map_or(std::ptr::null_mut(), |engine| {
                Box::into_raw(Box::new(PreparedEngine {
                    engine,
                    identity: Vec::new(),
                    mapped_identity: false,
                    inheritance: Vec::new(),
                    loops: Vec::new(),
                    resources: Vec::new(),
                }))
                .cast()
            })
    })
}

/// # Safety
/// `handle` must be a live handle from prepared_take in this linear memory,
/// exclusively owned by this caller. The same requirement applies to all
/// handle operations below. Releasing it belongs outside the audio callback.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn manifold_prepared_release(handle: *mut c_void) {
    if !handle.is_null() {
        drop(unsafe { Box::from_raw(handle.cast::<PreparedEngine>()) });
    }
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn manifold_prepared_input_ptr(handle: *mut c_void) -> *mut f32 {
    unsafe { handle.cast::<PreparedEngine>().as_mut() }.map_or(std::ptr::null_mut(), |prepared| {
        prepared.engine.input.as_mut_ptr()
    })
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn manifold_prepared_output_ptr(handle: *mut c_void) -> *const f32 {
    unsafe { handle.cast::<PreparedEngine>().as_ref() }
        .map_or(std::ptr::null(), |prepared| prepared.engine.output.as_ptr())
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn manifold_prepared_process(handle: *mut c_void, frames: u32) -> u32 {
    unsafe { handle.cast::<PreparedEngine>().as_mut() }
        .map_or(0, |prepared| process_engine(&mut prepared.engine, frames))
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn manifold_prepared_parameter(
    handle: *mut c_void,
    node_id: u32,
    id: u32,
    value: f32,
) -> u32 {
    unsafe { handle.cast::<PreparedEngine>().as_mut() }.map_or(0, |engine| {
        u32::from(engine.engine.plan.set_parameter(node_id.into(), id, value))
    })
}

/// Transfer the core's eligible bounded processing history at an audio boundary.
/// Handles must be distinct and exclusively owned; this is not full resource
/// continuity or a named-identity mapping for arbitrary projects.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn manifold_prepared_transfer(
    next: *mut c_void,
    previous: *mut c_void,
) -> u32 {
    if next.is_null() || previous.is_null() || next == previous {
        return 0;
    }
    let next = unsafe { &mut *next.cast::<PreparedEngine>() };
    let previous = unsafe { &mut *previous.cast::<PreparedEngine>() };
    // Loop control intent is kept in prepared storage: applying play to an
    // empty candidate before transferring its take would incorrectly stop it.
    for (new_node, old_node, parameters, inherited) in &mut next.loops {
        for id in 0..7 {
            if *inherited & (1 << id) != 0 {
                if let Some(value) = previous.engine.plan.parameter_target(*old_node, id) {
                    parameters[id as usize] = value;
                }
            }
        }
        let _ = new_node;
    }
    let mut loop_count = 0;
    // One-row slices avoid building another transfer vector at publication.
    for &(node, old, parameters, _) in &next.loops {
        loop_count += next
            .engine
            .plan
            .transfer_owned_loop_history(&mut previous.engine.plan, &[(node, old, parameters)]);
    }
    if !next.mapped_identity {
        next.engine
            .plan
            .transfer_live_state_from(&previous.engine.plan) as u32
            + loop_count as u32
    } else {
        for &(new_node, id, old_node) in &next.inheritance {
            if next.loops.iter().any(|entry| entry.0 == new_node) {
                continue;
            }
            if let Some(value) = previous.engine.plan.parameter_target(old_node, id) {
                // Preparation already installed unchanged targets. In
                // particular, oscillator recipe setters must not rebuild the
                // same coefficients repeatedly at each audio publication.
                if next.engine.plan.parameter_target(new_node, id) != Some(value) {
                    next.engine.plan.set_parameter(new_node, id, value);
                }
            }
        }
        let resources = next
            .engine
            .plan
            .transfer_owned_resource_history_by_resolver(
                &mut previous.engine.plan,
                &next.resources,
                |id| {
                    next.identity
                        .iter()
                        .find(|pair| pair.0 == id)
                        .map(|pair| pair.1)
                },
            );
        next.engine
            .plan
            .transfer_live_state_by_ids(&previous.engine.plan, &next.identity) as u32
            + loop_count as u32
            + resources as u32
    }
}

/// Prepare compatible immutable Sample/FFT resource identity off callback.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn manifold_prepared_resource_identity(
    handle: *mut c_void,
    node: u32,
    old: u32,
) -> u32 {
    let Some(prepared) = (unsafe { handle.cast::<PreparedEngine>().as_mut() }) else {
        return 0;
    };
    if prepared
            .resources
            .iter()
            .any(|entry| entry.0 == NodeId::from(node) || entry.1 == NodeId::from(old))
    {
        return 0;
    }
    prepared.resources.push((node.into(), old.into()));
    1
}

/// Prepare a loop's storage identity and seven control values off callback.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn manifold_prepared_loop_identity(
    handle: *mut c_void,
    node: u32,
    old: u32,
) -> u32 {
    let Some(prepared) = (unsafe { handle.cast::<PreparedEngine>().as_mut() }) else {
        return 0;
    };
    if prepared
            .loops
            .iter()
            .any(|entry| entry.0 == NodeId::from(node) || entry.1 == NodeId::from(old))
    {
        return 0;
    }
    prepared
        .loops
        .push((node.into(), old.into(), [0., 0., 0., 1., 0., 1., 0.5], 0));
    1
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn manifold_prepared_loop_parameter(
    handle: *mut c_void,
    node: u32,
    id: u32,
    value: f32,
    inherit: u32,
) -> u32 {
    let Some(prepared) = (unsafe { handle.cast::<PreparedEngine>().as_mut() }) else {
        return 0;
    };
    let Some(entry) = prepared
        .loops
        .iter_mut()
        .find(|entry| entry.0 == NodeId::from(node))
    else {
        return 0;
    };
    if id > 6 || !value.is_finite() || inherit > 1 {
        return 0;
    }
    entry.2[id as usize] = value;
    if inherit != 0 {
        entry.3 |= 1 << id;
    }
    1
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn manifold_prepared_loop_length(handle: *mut c_void, node: u32) -> u32 {
    unsafe { handle.cast::<PreparedEngine>().as_ref() }
        .and_then(|prepared| prepared.engine.plan.stable_capture_length(node.into()))
        .map_or(u32::MAX, |length| length as u32)
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn manifold_prepared_loop_revision(handle: *mut c_void, node: u32) -> u32 {
    unsafe { handle.cast::<PreparedEngine>().as_ref() }
        .and_then(|prepared| prepared.engine.plan.capture_revision(node.into()))
        .map_or(u32::MAX, |revision| revision as u32)
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn manifold_prepared_capture_cursor(
    handle: *mut c_void,
    node: u32,
    field: u32,
) -> u32 {
    unsafe { handle.cast::<PreparedEngine>().as_ref() }
        .and_then(|prepared| prepared.engine.plan.retrospective_cursor(node.into()))
        .map_or(u32::MAX, |(cursor, capacity)| match field {
            0 => cursor as u32,
            1 => capacity as u32,
            _ => u32::MAX,
        })
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn manifold_prepared_loop_copy(
    handle: *mut c_void,
    node: u32,
    start: u32,
    frames: u32,
) -> u32 {
    let Some(prepared) = (unsafe { handle.cast::<PreparedEngine>().as_mut() }) else {
        return 0;
    };
    if frames == 0 || frames > prepared.engine.capacity as u32 {
        return 0;
    }
    prepared.engine.plan.copy_capture_interleaved(
        node.into(),
        start as usize,
        &mut prepared.engine.output[..frames as usize * 2],
    ) as u32
}

/// Begin only against storage reserved by the compiler Worker.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn manifold_prepared_capture_begin(handle: *mut c_void, node: u32, frames: u32) -> u32 {
    unsafe { handle.cast::<PreparedEngine>().as_mut() }.map_or(0, |prepared|
        u32::from(prepared.engine.plan.begin_prepared_capture_staging(node.into(), frames as usize)))
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn manifold_prepared_capture_step(handle: *mut c_void, node: u32) -> u32 {
    unsafe { handle.cast::<PreparedEngine>().as_mut() }
        .and_then(|prepared| prepared.engine.plan.advance_capture_staging(node.into()))
        .map_or(u32::MAX, u32::from)
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn manifold_prepared_capture_length(handle: *mut c_void, node: u32) -> u32 {
    unsafe { handle.cast::<PreparedEngine>().as_ref() }
        .and_then(|prepared| prepared.engine.plan.capture_staged_length(node.into()))
        .map_or(u32::MAX, |frames| frames as u32)
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn manifold_prepared_capture_copy(handle: *mut c_void, node: u32, start: u32, frames: u32) -> u32 {
    let Some(prepared) = (unsafe { handle.cast::<PreparedEngine>().as_mut() }) else { return 0; };
    if frames == 0 || frames > prepared.engine.capacity as u32 { return 0; }
    prepared.engine.plan.copy_capture_staged_interleaved(node.into(), start as usize,
        &mut prepared.engine.output[..frames as usize * 2]) as u32
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn manifold_prepared_capture_cancel(handle: *mut c_void, node: u32) -> u32 {
    unsafe { handle.cast::<PreparedEngine>().as_mut() }.map_or(0, |prepared|
        u32::from(prepared.engine.plan.cancel_capture_staging(node.into())))
}

// Count the actual Rust allocator calls in the experiment. Reading these
// counters allocates nothing. They do not measure JavaScript allocations.
#[cfg(target_arch = "wasm32")]
mod allocation_probe {
    use std::alloc::{GlobalAlloc, Layout, System};
    use std::sync::atomic::{AtomicU32, Ordering};
    static ALLOCATIONS: AtomicU32 = AtomicU32::new(0);
    static DEALLOCATIONS: AtomicU32 = AtomicU32::new(0);
    struct CountingAllocator;
    #[link(wasm_import_module = "env")]
    unsafe extern "C" {
        fn manifold_allocation_probe(kind: u32);
    }
    #[global_allocator]
    static ALLOCATOR: CountingAllocator = CountingAllocator;
    unsafe impl GlobalAlloc for CountingAllocator {
        unsafe fn alloc(&self, layout: Layout) -> *mut u8 {
            unsafe {
                manifold_allocation_probe(1);
            }
            ALLOCATIONS.fetch_add(1, Ordering::Relaxed);
            unsafe { System.alloc(layout) }
        }
        unsafe fn alloc_zeroed(&self, layout: Layout) -> *mut u8 {
            unsafe {
                manifold_allocation_probe(1);
            }
            ALLOCATIONS.fetch_add(1, Ordering::Relaxed);
            unsafe { System.alloc_zeroed(layout) }
        }
        unsafe fn realloc(&self, pointer: *mut u8, layout: Layout, size: usize) -> *mut u8 {
            unsafe {
                manifold_allocation_probe(1);
            }
            ALLOCATIONS.fetch_add(1, Ordering::Relaxed);
            unsafe { System.realloc(pointer, layout, size) }
        }
        unsafe fn dealloc(&self, pointer: *mut u8, layout: Layout) {
            unsafe {
                manifold_allocation_probe(2);
            }
            DEALLOCATIONS.fetch_add(1, Ordering::Relaxed);
            unsafe { System.dealloc(pointer, layout) }
        }
    }
    #[unsafe(no_mangle)]
    pub extern "C" fn manifold_prepared_allocations() -> u32 {
        ALLOCATIONS.load(Ordering::Relaxed)
    }
    #[unsafe(no_mangle)]
    pub extern "C" fn manifold_prepared_deallocations() -> u32 {
        DEALLOCATIONS.load(Ordering::Relaxed)
    }
}

/// Metadata construction belongs to the preparation owner, before handoff.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn manifold_prepared_identity(
    handle: *mut c_void,
    next: u32,
    previous: u32,
) -> u32 {
    let Some(prepared) = (unsafe { handle.cast::<PreparedEngine>().as_mut() }) else {
        return 0;
    };
    if prepared
            .identity
            .iter()
            .any(|(id, _)| *id == NodeId::from(next))
    {
        return 0;
    }
    prepared.identity.push((next.into(), previous.into()));
    1
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn manifold_prepared_inherit(
    handle: *mut c_void,
    next: u32,
    id: u32,
    previous: u32,
) -> u32 {
    let Some(prepared) = (unsafe { handle.cast::<PreparedEngine>().as_mut() }) else {
        return 0;
    };
    prepared
        .inheritance
        .push((next.into(), id, previous.into()));
    1
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn manifold_prepared_parameter_target(
    handle: *mut c_void,
    node: u32,
    id: u32,
) -> f32 {
    unsafe { handle.cast::<PreparedEngine>().as_ref() }
        .and_then(|prepared| prepared.engine.plan.parameter_target(node.into(), id))
        .unwrap_or(f32::NAN)
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn manifold_prepared_identity_begin(handle: *mut c_void) -> u32 {
    let Some(prepared) = (unsafe { handle.cast::<PreparedEngine>().as_mut() }) else {
        return 0;
    };
    prepared.mapped_identity = true;
    1
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn manifold_prepared_route(
    handle: *mut c_void,
    target: u32,
    input: u32,
    source: u32,
    output: u32,
) -> u32 {
    let Some(prepared) = (unsafe { handle.cast::<PreparedEngine>().as_mut() }) else {
        return 0;
    };
    u32::from(
        prepared
            .engine
            .plan
            .set_route_from(
                target.into(),
                input as usize,
                (source != 0).then_some((source.into(), output as usize)),
            )
            .is_ok(),
    )
}
