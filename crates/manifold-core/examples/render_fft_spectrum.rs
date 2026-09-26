//! Native capture of the FFT graph's stereo output and 33 meter values per block.
use manifold_core::graph::{Connection, GraphDescription, NodeKind, NodeSpec};
use std::io::Write;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<_> = std::env::args().collect();
    if args.len() != 12 {
        return Err("usage: render_fft_spectrum INPUT OUTPUT METERS RATE BLOCK FRAMES STEP SMOOTH_BEFORE FLOOR_BEFORE SMOOTH_AFTER FLOOR_AFTER".into());
    }
    let rate: f32 = args[4].parse()?;
    let block: usize = args[5].parse()?;
    let frames: usize = args[6].parse()?;
    let step: usize = args[7].parse()?;
    let before: [f32; 2] = [args[8].parse()?, args[9].parse()?];
    let after: [f32; 2] = [args[10].parse()?, args[11].parse()?];
    let raw = std::fs::read(&args[1])?;
    if raw.len() != frames * 8 || block == 0 {
        return Err("invalid input size or block".into());
    }
    let input: Vec<f32> = raw
        .chunks_exact(4)
        .map(|bytes| f32::from_le_bytes(bytes.try_into().unwrap()))
        .collect();
    let graph = GraphDescription {
        nodes: vec![
            NodeSpec {
                id: 1,
                kind: NodeKind::InputRaw,
            },
            NodeSpec {
                id: 2,
                kind: NodeKind::FftSpectrum {
                    smoothing: before[0],
                    floor_db: before[1],
                },
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
    let mut plan = graph.compile(rate, block)?;
    let mut output = std::fs::File::create(&args[2])?;
    let mut meters = std::fs::File::create(&args[3])?;
    for offset in (0..frames).step_by(block) {
        if offset == step {
            assert!(plan.set_parameter(2, 0, after[0]));
            assert!(plan.set_parameter(2, 1, after[1]));
        }
        let count = block.min(frames - offset);
        let left: Vec<_> = (0..count)
            .map(|frame| input[(offset + frame) * 2])
            .collect();
        let right: Vec<_> = (0..count)
            .map(|frame| input[(offset + frame) * 2 + 1])
            .collect();
        let mut out_left = vec![0.0; count];
        let mut out_right = vec![0.0; count];
        plan.process([&left, &right], [&mut out_left, &mut out_right]);
        for (&left, &right) in out_left.iter().zip(&out_right) {
            output.write_all(&left.to_le_bytes())?;
            output.write_all(&right.to_le_bytes())?;
        }
        for band in 0..33 {
            meters.write_all(&plan.node_meter(2, band).unwrap().to_le_bytes())?;
        }
    }
    Ok(())
}
