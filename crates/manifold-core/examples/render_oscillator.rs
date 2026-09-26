use manifold_core::graph::{Connection, GraphDescription, NodeKind, NodeSpec};
use std::{env, fs, process};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = env::args().collect();
    if args.len() != 11 && args.len() != 12 {
        eprintln!(
            "usage: render_oscillator OUTPUT FREQ_BEFORE FREQ_AFTER AMP_BEFORE AMP_AFTER WAVEFORM SAMPLE_RATE BLOCK_SIZE STEP_FRAME FRAMES [MONO_SYNC_F32]"
        );
        process::exit(2);
    }
    let freq_before: f32 = args[2].parse()?;
    let freq_after: f32 = args[3].parse()?;
    let amp_before: f32 = args[4].parse()?;
    let amp_after: f32 = args[5].parse()?;
    let waveform: u32 = args[6].parse()?;
    let sample_rate: f32 = args[7].parse()?;
    let block_size: usize = args[8].parse()?;
    let step_frame: usize = args[9].parse()?;
    let frames: usize = args[10].parse()?;
    let sync = if args.len() == 12 {
        let bytes = fs::read(&args[11])?;
        let samples: Vec<f32> = bytes
            .chunks_exact(4)
            .map(|bytes| f32::from_le_bytes(bytes.try_into().unwrap()))
            .collect();
        if bytes.len() != frames * 4 {
            process::exit(2);
        }
        Some(samples)
    } else {
        None
    };
    if block_size == 0 || frames == 0 || step_frame > frames || step_frame % block_size != 0 {
        process::exit(2);
    }
    let mut nodes = vec![
        NodeSpec {
            id: 1,
            kind: NodeKind::Oscillator {
                frequency: freq_before,
                amplitude: amp_before,
                waveform,
            },
        },
        NodeSpec {
            id: 2,
            kind: NodeKind::Output,
        },
    ];
    let mut connections = vec![Connection {
        from: 1,
        to: 2,
        input_port: 0,
    }];
    if sync.is_some() {
        nodes.push(NodeSpec {
            id: 3,
            kind: NodeKind::InputRaw,
        });
        connections.push(Connection {
            from: 3,
            to: 1,
            input_port: 0,
        });
    }
    let description = GraphDescription { nodes, connections };
    let mut plan = description.compile(sample_rate, block_size)?;
    if sync.is_some() {
        assert!(plan.set_parameter(1, 3, 1.0));
    }
    let mut output = vec![0.0f32; frames * 2];
    for start in (0..frames).step_by(block_size) {
        if start == step_frame {
            plan.set_parameter(1, 1, freq_after);
            plan.set_parameter(1, 2, amp_after);
        }
        let count = block_size.min(frames - start);
        let silence = vec![0.0f32; count];
        let mut left = vec![0.0f32; count];
        let mut right = vec![0.0f32; count];
        let input = sync
            .as_ref()
            .map_or(&silence[..], |samples| &samples[start..start + count]);
        plan.process([input, input], [&mut left, &mut right]);
        for frame in 0..count {
            output[(start + frame) * 2] = left[frame];
            output[(start + frame) * 2 + 1] = right[frame];
        }
    }
    let mut encoded = Vec::with_capacity(output.len() * 4);
    for sample in output {
        encoded.extend_from_slice(&sample.to_le_bytes());
    }
    fs::write(&args[1], encoded)?;
    Ok(())
}
