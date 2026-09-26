//! Thin, single-instance AudioWorklet ABI. Buffers are allocated only at prepare.

use manifold_core::Filter;
use std::cell::RefCell;

struct WorkletEngine {
    filter: Filter,
    capacity: usize,
    input: Vec<f32>,
    output: Vec<f32>,
}

thread_local! {
    static ENGINE: RefCell<Option<WorkletEngine>> = const { RefCell::new(None) };
}

#[unsafe(no_mangle)]
pub extern "C" fn manifold_version() -> u32 {
    1
}

#[unsafe(no_mangle)]
pub extern "C" fn manifold_prepare(sample_rate: f32, max_frames: u32) -> u32 {
    if !sample_rate.is_finite()
        || !(8_000.0..=384_000.0).contains(&sample_rate)
        || !(1..=8192).contains(&max_frames)
    {
        return 0;
    }
    let capacity = max_frames as usize;
    ENGINE.with(|slot| {
        *slot.borrow_mut() = Some(WorkletEngine {
            filter: Filter::new(sample_rate),
            capacity,
            input: vec![0.0; capacity * 2],
            output: vec![0.0; capacity * 2],
        });
    });
    1
}

#[unsafe(no_mangle)]
pub extern "C" fn manifold_input_ptr() -> *mut f32 {
    ENGINE.with(|slot| {
        slot.borrow_mut()
            .as_mut()
            .map_or(std::ptr::null_mut(), |engine| engine.input.as_mut_ptr())
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn manifold_output_ptr() -> *const f32 {
    ENGINE.with(|slot| {
        slot.borrow()
            .as_ref()
            .map_or(std::ptr::null(), |engine| engine.output.as_ptr())
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn manifold_set_parameter(id: u32, value: f32) -> u32 {
    ENGINE.with(|slot| {
        slot.borrow_mut().as_mut().map_or(0, |engine| {
            u32::from(engine.filter.set_parameter(id, value))
        })
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn manifold_process(frames: u32) -> u32 {
    ENGINE.with(|slot| {
        let mut slot = slot.borrow_mut();
        let Some(engine) = slot.as_mut() else {
            return 0;
        };
        let frames = frames as usize;
        if frames > engine.capacity {
            return 0;
        }
        let (left_in, right_in) = engine.input.split_at(engine.capacity);
        let (left_out, right_out) = engine.output.split_at_mut(engine.capacity);
        engine.filter.process_planar(
            [&left_in[..frames], &right_in[..frames]],
            [&mut left_out[..frames], &mut right_out[..frames]],
        );
        1
    })
}
