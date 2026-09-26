use manifold_core::graph::{Connection, GraphDescription, NodeKind, NodeSpec};
use std::{env, fs, process};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = env::args().collect();
    if args.len() != 15 {
        eprintln!(
            "usage: render_mixer INPUT OUTPUT BUSSES GAIN1 GAIN2 PAN1 PAN2 MASTER GAIN2_AFTER PAN2_AFTER MASTER_AFTER SAMPLE_RATE BLOCK_SIZE STEP_FRAME"
        );
        process::exit(2);
    }
    let bus_count: usize = args[3].parse()?;
    let gain1: f32 = args[4].parse()?;
    let gain2: f32 = args[5].parse()?;
    let pan1: f32 = args[6].parse()?;
    let pan2: f32 = args[7].parse()?;
    let master: f32 = args[8].parse()?;
    let gain2_after: f32 = args[9].parse()?;
    let pan2_after: f32 = args[10].parse()?;
    let master_after: f32 = args[11].parse()?;
    let sample_rate: f32 = args[12].parse()?;
    let block_size: usize = args[13].parse()?;
    let step_frame: usize = args[14].parse()?;
    let bytes = fs::read(&args[1])?;
    if !(2..=32).contains(&bus_count)
        || bytes.len() % 8 != 0
        || block_size == 0
        || step_frame % block_size != 0
    {
        process::exit(2);
    }
    let samples: Vec<f32> = bytes
        .chunks_exact(4)
        .map(|chunk| f32::from_le_bytes(chunk.try_into().unwrap()))
        .collect();
    let frames = samples.len() / 2;
    if step_frame > frames {
        process::exit(2);
    }
    let mut gains = vec![0.02; bus_count];
    gains[0] = gain1;
    gains[1] = gain2;
    let mut pans = vec![0.0; bus_count];
    pans[0] = pan1;
    pans[1] = pan2;
    let mut description = GraphDescription {
        nodes: vec![
            NodeSpec {
                id: 1,
                kind: NodeKind::InputRaw,
            },
            NodeSpec {
                id: 2,
                kind: NodeKind::Constant { value: 0.25 },
            },
            NodeSpec {
                id: 3,
                kind: NodeKind::Mixer {
                    inputs: bus_count,
                    gains,
                    pans,
                    master,
                },
            },
            NodeSpec {
                id: 4,
                kind: NodeKind::Output,
            },
        ],
        connections: vec![
            Connection {
                from: 1,
                to: 3,
                input_port: 0,
            },
            Connection {
                from: 2,
                to: 3,
                input_port: 1,
            },
            Connection {
                from: 3,
                to: 4,
                input_port: 0,
            },
        ],
    };
    for bus in 2..bus_count {
        let id = 100 + bus as u64;
        description.nodes.push(NodeSpec {
            id,
            kind: NodeKind::Constant {
                value: 0.1 + 0.01 * (bus + 1) as f32,
            },
        });
        description.connections.push(Connection {
            from: id,
            to: 3,
            input_port: bus,
        });
    }
    let mut plan = description.compile(sample_rate, block_size)?;
    let mut output = vec![0.0f32; samples.len()];
    for offset in (0..frames).step_by(block_size) {
        if offset == step_frame {
            plan.set_parameter(3, 2, gain2_after);
            plan.set_parameter(3, 34, pan2_after);
            plan.set_parameter(3, 0, master_after);
        }
        let count = block_size.min(frames - offset);
        let mut left = vec![0.0; count];
        let mut right = vec![0.0; count];
        let mut out_left = vec![0.0; count];
        let mut out_right = vec![0.0; count];
        for frame in 0..count {
            left[frame] = samples[(offset + frame) * 2];
            right[frame] = samples[(offset + frame) * 2 + 1];
        }
        plan.process([&left, &right], [&mut out_left, &mut out_right]);
        for frame in 0..count {
            output[(offset + frame) * 2] = out_left[frame];
            output[(offset + frame) * 2 + 1] = out_right[frame];
        }
    }
    let mut encoded = Vec::with_capacity(output.len() * 4);
    for sample in output {
        encoded.extend_from_slice(&sample.to_le_bytes());
    }
    fs::write(&args[2], encoded)?;
    Ok(())
}
