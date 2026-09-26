//! Native reference for the first authored Manifold v2 synth patch.
use manifold_core::graph::{Connection, GraphDescription, NodeKind, NodeSpec};
use std::io::Write;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<_> = std::env::args().collect();
    if args.len() != 19 {
        return Err("usage: render_patch OUTPUT WAVEFORM FREQ_BEFORE FREQ_AFTER OSC_LEVEL NOISE_BEFORE NOISE_AFTER NOISE_COLOR ATTACK DECAY SUSTAIN RELEASE CUTOFF_BEFORE CUTOFF_AFTER RESONANCE MASTER BLOCK_SIZE FRAMES".into());
    }
    let waveform: u32 = args[2].parse()?;
    let frequency_before: f32 = args[3].parse()?;
    let frequency_after: f32 = args[4].parse()?;
    let oscillator_level: f32 = args[5].parse()?;
    let noise_before: f32 = args[6].parse()?;
    let noise_after: f32 = args[7].parse()?;
    let noise_color: f32 = args[8].parse()?;
    let attack: f32 = args[9].parse()?;
    let decay: f32 = args[10].parse()?;
    let sustain: f32 = args[11].parse()?;
    let release: f32 = args[12].parse()?;
    let cutoff_before: f32 = args[13].parse()?;
    let cutoff_after: f32 = args[14].parse()?;
    let resonance: f32 = args[15].parse()?;
    let master: f32 = args[16].parse()?;
    let block: usize = args[17].parse()?;
    let frames: usize = args[18].parse()?;
    let graph = GraphDescription {
        nodes: vec![
            NodeSpec {
                id: 1,
                kind: NodeKind::Oscillator {
                    frequency: frequency_before,
                    amplitude: oscillator_level,
                    waveform,
                },
            },
            NodeSpec {
                id: 2,
                kind: NodeKind::NoiseGenerator {
                    level: noise_before,
                    color: noise_color,
                },
            },
            NodeSpec {
                id: 3,
                kind: NodeKind::Sum2 {
                    gain_a: 1.0,
                    gain_b: 1.0,
                },
            },
            NodeSpec {
                id: 4,
                kind: NodeKind::AdsrEnvelope,
            },
            NodeSpec {
                id: 5,
                kind: NodeKind::Svf,
            },
            NodeSpec {
                id: 6,
                kind: NodeKind::Gain { gain: master },
            },
            NodeSpec {
                id: 7,
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
            Connection {
                from: 4,
                to: 5,
                input_port: 0,
            },
            Connection {
                from: 5,
                to: 6,
                input_port: 0,
            },
            Connection {
                from: 6,
                to: 7,
                input_port: 0,
            },
        ],
    };
    let mut plan = graph.compile(48_000.0, block)?;
    for (node, id, value) in [
        (4, 0, attack),
        (4, 1, decay),
        (4, 2, sustain),
        (4, 3, release),
        (5, 0, 0.0),
        (5, 1, cutoff_before),
        (5, 2, resonance),
        (4, 4, 1.0),
    ] {
        assert!(plan.set_parameter(node, id, value));
    }
    let mut result = Vec::with_capacity(frames * 2 * 4);
    for offset in (0..frames).step_by(block) {
        if offset == frames / 2 {
            assert!(plan.set_parameter(1, 1, frequency_after));
            assert!(plan.set_parameter(2, 0, noise_after));
            assert!(plan.set_parameter(5, 1, cutoff_after));
            assert!(plan.set_parameter(4, 4, 0.0));
        }
        let count = block.min(frames - offset);
        let input = vec![0.0; count];
        let mut left = vec![0.0; count];
        let mut right = vec![0.0; count];
        plan.process([&input, &input], [&mut left, &mut right]);
        for (&left, &right) in left.iter().zip(&right) {
            result.extend_from_slice(&left.to_le_bytes());
            result.extend_from_slice(&right.to_le_bytes());
        }
    }
    std::fs::File::create(&args[1])?.write_all(&result)?;
    Ok(())
}
