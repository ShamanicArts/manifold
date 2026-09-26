use manifold_core::graph::{Connection, GraphDescription, NodeKind, NodeSpec};
use std::io::Write;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<_> = std::env::args().collect();
    if args.len() != 11 {
        return Err("usage: render_adsr OUTPUT ATTACK DECAY SUSTAIN RELEASE GATE_OFF SAMPLE_RATE BLOCK_SIZE FRAMES INPUT_LEVEL".into());
    }
    let attack: f32 = args[2].parse()?;
    let decay: f32 = args[3].parse()?;
    let sustain: f32 = args[4].parse()?;
    let release: f32 = args[5].parse()?;
    let gate_off: usize = args[6].parse()?;
    let sample_rate: f32 = args[7].parse()?;
    let block: usize = args[8].parse()?;
    let frames: usize = args[9].parse()?;
    let input_level: f32 = args[10].parse()?;
    let graph = GraphDescription {
        nodes: vec![
            NodeSpec {
                id: 1,
                kind: NodeKind::InputRaw,
            },
            NodeSpec {
                id: 2,
                kind: NodeKind::AdsrEnvelope,
            },
            NodeSpec {
                id: 3,
                kind: NodeKind::Output,
            },
        ],
        connections: vec![
            Connection {
                from: 1,
                to: 2,
                input_port: 0,
            },
            Connection {
                from: 2,
                to: 3,
                input_port: 0,
            },
        ],
    };
    let mut plan = graph.compile(sample_rate, block)?;
    for (id, value) in [attack, decay, sustain, release, 1.0]
        .into_iter()
        .enumerate()
    {
        assert!(plan.set_parameter(2, id as u32, value));
    }
    let mut result = Vec::with_capacity(frames * 2 * 4);
    for offset in (0..frames).step_by(block) {
        if offset == gate_off {
            assert!(plan.set_parameter(2, 4, 0.0));
        }
        let count = block.min(frames - offset);
        let left = vec![input_level; count];
        let right = vec![-input_level * 0.5; count];
        let mut out_left = vec![0.0; count];
        let mut out_right = vec![0.0; count];
        plan.process([&left, &right], [&mut out_left, &mut out_right]);
        for (&left, &right) in out_left.iter().zip(&out_right) {
            result.extend_from_slice(&left.to_le_bytes());
            result.extend_from_slice(&right.to_le_bytes());
        }
    }
    std::fs::File::create(&args[1])?.write_all(&result)?;
    Ok(())
}
