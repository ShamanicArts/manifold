//! Native callback timing for selected-only and persistent FX slot fan-out.
//! Run with: cargo run --release -p manifold-core --example bench_fx_slot
use manifold_core::effect_slot::EffectSlot;
use std::hint::black_box;
use std::time::Instant;

const RATE: f32 = 48_000.0;
const BLOCK: usize = 128;
const CALLBACKS: usize = 512;
const WARMUP: usize = 128;

fn run(label: &str, persistent: bool, visited: usize) {
    let mut slot = if persistent {
        EffectSlot::new_legacy(RATE, BLOCK, 8, 1.0, [0.0, 0.6, 0.5, 0.5, 0.5])
    } else {
        EffectSlot::new(RATE, BLOCK, 8, 1.0, [0.0, 0.6, 0.5, 0.5, 0.5])
    };
    if visited == 2 {
        assert!(slot.set_parameter(0, 0.0));
    } else if visited == 21 {
        for effect_type in 0..21 {
            assert!(slot.set_parameter(0, effect_type as f32));
        }
    }
    assert!(slot.set_parameter(0, 8.0));
    let input_l: [f32; BLOCK] = std::array::from_fn(|frame| {
        (frame as f32 * std::f32::consts::TAU * 220.0 / RATE).sin() * 0.2
    });
    let input_r: [f32; BLOCK] = std::array::from_fn(|frame| {
        (frame as f32 * std::f32::consts::TAU * 330.0 / RATE).sin() * 0.17
    });
    let mut output_l = [0.0; BLOCK];
    let mut output_r = [0.0; BLOCK];
    for _ in 0..WARMUP {
        slot.process_planar([&input_l, &input_r], [&mut output_l, &mut output_r]);
    }
    let mut durations = Vec::with_capacity(CALLBACKS);
    for _ in 0..CALLBACKS {
        let start = Instant::now();
        slot.process_planar([&input_l, &input_r], [&mut output_l, &mut output_r]);
        durations.push(start.elapsed().as_nanos() as u64);
        black_box(output_l[0]);
    }
    durations.sort_unstable();
    let average = durations.iter().sum::<u64>() as f64 / CALLBACKS as f64 / 1000.0;
    let median = durations[CALLBACKS / 2] as f64 / 1000.0;
    let p95 = durations[CALLBACKS * 95 / 100] as f64 / 1000.0;
    let maximum = durations[CALLBACKS - 1] as f64 / 1000.0;
    println!("{label},{visited},{average:.3},{median:.3},{p95:.3},{maximum:.3}");
}

fn main() {
    println!("mode,visited,mean_us,median_us,p95_us,max_us");
    for _ in 0..3 {
        run("selected-only", false, 1);
        run("persistent", true, 1);
        run("persistent", true, 2);
        run("persistent", true, 21);
    }
}
