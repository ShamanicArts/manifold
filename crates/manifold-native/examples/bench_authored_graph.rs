//! Offline native callback proxy for one portable authored graph.
//! Build with: cargo build --release -p manifold-native --example bench_authored_graph

use std::time::Instant;

use manifold_core::events::{EventKind, TimedEvent};
use manifold_native::project::NativeProject;
use manifold_native::{AudioBlock, NativeProcessor};

const RATE: f32 = 48_000.0;
const FRAMES: usize = 128;
const WARMUP: usize = 128;
const BLOCKS: usize = 2048;

fn process(
    processor: &mut NativeProcessor,
    left: &mut [f32],
    right: &mut [f32],
    main: Option<[&[f32]; 2]>,
    events: &[TimedEvent],
) {
    processor
        .process(AudioBlock {
            main,
            sidechain: None,
            output: [left, right],
            events,
        })
        .expect("authored graph process");
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let arguments: Vec<String> = std::env::args().skip(1).collect();
    let patchable = arguments.iter().any(|arg| arg == "--patchable");
    let all_sample_voices = arguments.iter().any(|arg| arg == "--all-sample-voices");
    let vocoder = arguments.iter().any(|arg| arg == "--vocoder");
    let trace = arguments.iter().any(|arg| arg == "--trace");
    let sample_voice = arguments
        .iter()
        .find_map(|arg| arg.strip_prefix("--sample-voice="))
        .map(str::parse::<u32>)
        .transpose()?;
    let path = arguments
        .iter()
        .find(|arg| !arg.starts_with("--"))
        .ok_or("expected project JSON path")?;
    let bytes = std::fs::read(path)?;
    let document = serde_json::from_slice::<serde_json::Value>(&bytes)?;
    let external = document["signal"]["inputSource"] == "external";
    let sample_voices: Vec<u32> = if all_sample_voices {
        document["signal"]["nodes"]
            .as_array()
            .ok_or("graph nodes")?
            .iter()
            .filter(|node| node["type"] == "sample-region")
            .map(|node| {
                node["id"]
                    .as_u64()
                    .ok_or("sample node ID")
                    .map(|id| id as u32)
            })
            .collect::<Result<_, _>>()?
    } else {
        sample_voice.into_iter().collect()
    };
    let started = Instant::now();
    let project = NativeProject::parse(&bytes).map_err(|error| format!("{error:?}"))?;
    let parse_ms = started.elapsed().as_secs_f64() * 1000.0;
    let started = Instant::now();
    let mut processor = if patchable {
        project.prepare_patchable(RATE, FRAMES)
    } else {
        project.prepare(RATE, FRAMES)
    }
    .map_err(|error| format!("{error:?}"))?;
    for &node in &sample_voices {
        assert!(processor.set_parameter((node + 2).into(), 0, 0.6));
        if vocoder {
            assert!(processor.set_parameter((node + 1).into(), 3, 1.0));
        }
    }
    let prepare_ms = started.elapsed().as_secs_f64() * 1000.0;
    let mut left = [0.0; FRAMES];
    let mut right = [0.0; FRAMES];
    let input_left: [f32; FRAMES] = std::array::from_fn(|frame| ((frame % 16) as f32 - 8.0) / 8.0);
    let input_right: [f32; FRAMES] =
        std::array::from_fn(|frame| (((frame * 3) % 16) as f32 - 8.0) / 8.0);
    let main = external.then_some([input_left.as_slice(), input_right.as_slice()]);
    let notes: Vec<_> = sample_voices
        .into_iter()
        .map(|node| TimedEvent {
            offset: 0,
            node: node.into(),
            kind: EventKind::NoteOn {
                channel: 0,
                note: 60,
                velocity: 100,
            },
        })
        .collect();
    for index in 0..WARMUP {
        let events = if index % 32 == 0 {
            notes.as_slice()
        } else {
            &[]
        };
        process(&mut processor, &mut left, &mut right, main, events);
    }
    let mut durations_us = Vec::with_capacity(BLOCKS);
    let mut checksum = 0.0_f64;
    let mut checkpoints = Vec::new();
    let mut block_abs_sums = Vec::new();
    for index in 0..BLOCKS {
        let started = Instant::now();
        let events = if index % 32 == 0 {
            notes.as_slice()
        } else {
            &[]
        };
        process(&mut processor, &mut left, &mut right, main, events);
        durations_us.push(started.elapsed().as_secs_f64() * 1_000_000.0);
        checksum += (left[index % FRAMES].abs() + right[index % FRAMES].abs()) as f64;
        if matches!(index, 0 | 1024 | 2047) {
            checkpoints.push([left[index % FRAMES], right[index % FRAMES]]);
        }
        if trace {
            block_abs_sums.push(
                left.iter()
                    .chain(right.iter())
                    .map(|value| value.abs() as f64)
                    .sum::<f64>(),
            );
        }
    }
    assert!(checksum > 0.01, "authored graph was silent");
    durations_us.sort_by(f64::total_cmp);
    let at = |fraction: f64| durations_us[((BLOCKS - 1) as f64 * fraction) as usize];
    println!(
        "{}",
        serde_json::json!({
            "method": if patchable { "release Rust patchable NativeProcessor::process, offline" }
                      else { "release Rust NativeProcessor::process, offline" },
            "sampleRate": RATE, "blockFrames": FRAMES,
            "warmupBlocks": WARMUP, "measuredBlocks": BLOCKS,
            "parseMs": parse_ms, "prepareMs": prepare_ms,
            "p50Us": at(0.50), "p95Us": at(0.95),
            "p99Us": at(0.99), "maxUs": durations_us[BLOCKS - 1],
            "overDeadline": durations_us.iter().filter(|&&us| us > FRAMES as f64 / RATE as f64 * 1_000_000.0).count(),
            "outputChecksum": checksum,
            "checkpoints": checkpoints,
            "blockAbsSums": if trace { Some(block_abs_sums) } else { None },
        })
    );
    Ok(())
}
