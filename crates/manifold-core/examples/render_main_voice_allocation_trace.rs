//! Trace old Main note-slot decisions with the Rust allocator.
use manifold_core::main_voice_allocator::{EnvelopePhase, MainVoiceAllocator};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let scenarios = std::env::args().nth(1).ok_or("scenario CSV required")?;
    let data = std::fs::read_to_string(scenarios)?;
    let mut pool = MainVoiceAllocator::default();
    for line in data.lines().skip(1) {
        let fields: Vec<_> = line.split(',').collect();
        if fields.len() != 5 {
            return Err("invalid scenario".into());
        }
        let a: u8 = fields[1].parse()?;
        let b: u8 = fields[2].parse()?;
        let c: f32 = fields[3].parse()?;
        let chosen = match fields[0] {
            "on" => pool.note_on(a, b) + 1,
            "off" => {
                pool.note_off(a);
                0
            }
            "stage" => {
                let phase = match b {
                    0 => EnvelopePhase::Idle,
                    1 => EnvelopePhase::Release,
                    2 => EnvelopePhase::Sustain,
                    _ => return Err("invalid stage".into()),
                };
                if !pool.report_envelope(a as usize - 1, phase, c) {
                    return Err("invalid slot".into());
                }
                0
            }
            "panic" => {
                pool.panic();
                0
            }
            _ => return Err("invalid action".into()),
        };
        let mut active_mask = 0u32;
        let mut release_mask = 0u32;
        let mut notes = String::new();
        for (index, slot) in pool.slots().iter().enumerate() {
            if slot.active {
                active_mask |= 1 << index;
            }
            if slot.phase == EnvelopePhase::Release {
                release_mask |= 1 << index;
            }
            notes.push_str(&format!(
                ",{}",
                if slot.active { slot.note as i16 } else { -1 }
            ));
        }
        println!(
            "{chosen},{},{active_mask},{release_mask}{notes}",
            pool.choose_voice() + 1
        );
    }
    Ok(())
}
