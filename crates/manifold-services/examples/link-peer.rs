//! Independent SDK peer for interactive interoperability review. No Manifold API.
use rusty_link::{AblLink, SessionState};
use std::{
    thread,
    time::{Duration, Instant},
};
fn main() {
    let tempo = std::env::args()
        .nth(1)
        .and_then(|s| s.parse().ok())
        .unwrap_or(180.);
    let seconds = std::env::args()
        .nth(2)
        .and_then(|s| s.parse().ok())
        .unwrap_or(30_u64);
    let link = AblLink::new(tempo);
    let mut state = SessionState::new();
    link.enable_start_stop_sync(true);
    link.enable(true);
    let start = Instant::now();
    let mut published = false;
    while start.elapsed() < Duration::from_secs(seconds) {
        link.capture_app_session_state(&mut state);
        if link.num_peers() > 0 && !published {
            state.set_tempo(tempo, link.clock_micros());
            state.set_is_playing(true, link.clock_micros());
            link.commit_app_session_state(&state);
            published = true;
        }
        println!(
            "{}",
            serde_json::json!({"peers":link.num_peers(),"tempo":state.tempo(),"phase":state.phase_at_time(link.clock_micros(),4.),"playing":state.is_playing()})
        );
        thread::sleep(Duration::from_millis(500));
    }
    link.enable(false);
}
