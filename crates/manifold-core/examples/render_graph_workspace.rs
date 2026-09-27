//! Native output for graphs assembled by the browser topology editor.
use manifold_core::events::{EventKind, TimedEvent};
use manifold_core::graph::{Connection, GraphDescription, NodeKind, NodeSpec};
use std::io::Write;

fn tone_texture() -> GraphDescription {
    let nodes = vec![
        NodeSpec {
            id: 1,
            kind: NodeKind::InputRaw,
        },
        NodeSpec {
            id: 3,
            kind: NodeKind::Output,
        },
        NodeSpec {
            id: 4,
            kind: NodeKind::Oscillator {
                frequency: 220.0,
                amplitude: 0.4,
                waveform: 0,
            },
        },
        NodeSpec {
            id: 5,
            kind: NodeKind::NoiseGenerator {
                level: 0.08,
                color: 0.5,
            },
        },
        NodeSpec {
            id: 6,
            kind: NodeKind::Sum2 {
                gain_a: 1.0,
                gain_b: 1.0,
            },
        },
        NodeSpec {
            id: 7,
            kind: NodeKind::Svf,
        },
        NodeSpec {
            id: 8,
            kind: NodeKind::ModulatedGain {
                base: 0.5,
                depth: 0.4,
            },
        },
        NodeSpec {
            id: 9,
            kind: NodeKind::Lfo {
                waveform: 0,
                rate: 2.0,
            },
        },
    ];
    let connections = [
        (4, 6, 0),
        (5, 6, 1),
        (6, 7, 0),
        (7, 8, 0),
        (9, 8, 1),
        (8, 3, 0),
    ]
    .map(|(from, to, input_port)| Connection {
        from,
        to,
        input_port,
    })
    .to_vec();
    GraphDescription { nodes, connections }
}

fn note_voice() -> GraphDescription {
    let nodes = vec![
        NodeSpec {
            id: 1,
            kind: NodeKind::InputRaw,
        },
        NodeSpec {
            id: 3,
            kind: NodeKind::Output,
        },
        NodeSpec {
            id: 4,
            kind: NodeKind::MidiInput,
        },
        NodeSpec {
            id: 5,
            kind: NodeKind::MidiTranspose { semitones: 0.0 },
        },
        NodeSpec {
            id: 6,
            kind: NodeKind::VoiceSynth,
        },
        NodeSpec {
            id: 7,
            kind: NodeKind::Svf,
        },
    ];
    let connections = [(4, 5, 0), (5, 6, 0), (6, 7, 0), (7, 3, 0)]
        .map(|(from, to, input_port)| Connection {
            from,
            to,
            input_port,
        })
        .to_vec();
    GraphDescription { nodes, connections }
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<_> = std::env::args().collect();
    if args.len() != 3
        || !["seed", "distortion", "cv", "texture", "note-voice"].contains(&args[1].as_str())
    {
        return Err(
            "usage: render_graph_workspace seed|distortion|cv|texture|note-voice OUTPUT".into(),
        );
    }
    if args[1] == "texture" {
        return render(tone_texture(), &args[2], false);
    }
    if args[1] == "note-voice" {
        return render(note_voice(), &args[2], true);
    }
    let distorted = args[1] != "seed";
    let cv = args[1] == "cv";
    let mut nodes = vec![
        NodeSpec {
            id: 1,
            kind: NodeKind::InputRaw,
        },
        NodeSpec {
            id: 2,
            kind: NodeKind::Gain { gain: 0.7 },
        },
        NodeSpec {
            id: 3,
            kind: NodeKind::Output,
        },
    ];
    let mut connections = vec![Connection {
        from: 1,
        to: 2,
        input_port: 0,
    }];
    if distorted {
        nodes.push(NodeSpec {
            id: 4,
            kind: NodeKind::Distortion {
                drive: 9.0,
                mix: 0.7,
                output: 0.8,
            },
        });
        connections.push(Connection {
            from: 2,
            to: 4,
            input_port: 0,
        });
    }
    if cv {
        nodes.push(NodeSpec {
            id: 5,
            kind: NodeKind::Lfo {
                waveform: 0,
                rate: 2.0,
            },
        });
        nodes.push(NodeSpec {
            id: 6,
            kind: NodeKind::ModulatedGain {
                base: 0.5,
                depth: 0.4,
            },
        });
        connections.extend([
            Connection {
                from: 4,
                to: 6,
                input_port: 0,
            },
            Connection {
                from: 5,
                to: 6,
                input_port: 1,
            },
        ]);
    }
    connections.push(Connection {
        from: if cv {
            6
        } else if distorted {
            4
        } else {
            2
        },
        to: 3,
        input_port: 0,
    });
    render(GraphDescription { nodes, connections }, &args[2], false)
}

fn render(
    description: GraphDescription,
    path: &str,
    note_events: bool,
) -> Result<(), Box<dyn std::error::Error>> {
    let mut plan = description.compile(48_000.0, 128)?;
    if note_events && !plan.set_parameter(5, 0, 7.0) {
        return Err("MIDI transpose parameter unavailable".into());
    }
    let event_schedule = [
        (
            16,
            EventKind::NoteOn {
                channel: 15,
                note: 60,
                velocity: 100,
            },
        ),
        (
            2048,
            EventKind::NoteOn {
                channel: 15,
                note: 64,
                velocity: 96,
            },
        ),
        (
            4096,
            EventKind::NoteOff {
                channel: 15,
                note: 60,
            },
        ),
        (
            6144,
            EventKind::NoteOff {
                channel: 15,
                note: 64,
            },
        ),
    ];
    let mut pcm = Vec::with_capacity(8192 * 2 * 4);
    for block in 0..64 {
        let mut input_left = [0.0_f32; 128];
        let mut input_right = [0.0_f32; 128];
        for index in 0..128 {
            let frame = block * 128 + index;
            let step = (frame % 64) as i32 - 32;
            input_left[index] = step as f32 / 128.0;
            input_right[index] = -(step as f32) / 256.0;
        }
        let mut left = [0.0_f32; 128];
        let mut right = [0.0_f32; 128];
        if note_events {
            let start = block * 128;
            let timed: Vec<_> = event_schedule
                .iter()
                .filter(|(frame, _)| *frame >= start && *frame < start + 128)
                .map(|(frame, kind)| TimedEvent {
                    offset: frame - start,
                    node: 4,
                    kind: *kind,
                })
                .collect();
            plan.process_with_events([&input_left, &input_right], [&mut left, &mut right], &timed)
                .map_err(|_| "timed MIDI event rejected")?;
        } else {
            plan.process([&input_left, &input_right], [&mut left, &mut right]);
        }
        for (&l, &r) in left.iter().zip(&right) {
            pcm.extend_from_slice(&l.to_le_bytes());
            pcm.extend_from_slice(&r.to_le_bytes());
        }
    }
    std::fs::File::create(path)?.write_all(&pcm)?;
    Ok(())
}
