//! Ableton Link host service over `ablink`, an independent MIT implementation
//! of the protocol. Interoperability with the official SDK is proven by the
//! `link_finds_real_sdk_peer…` integration test, which runs an official peer.
use ablink::{Beats, Link};
use serde_json::{Value, json};
use std::time::{Duration, Instant};

pub struct LinkService {
    link: Link,
    quantum: f64,
    tempo_sync: bool,
    /// `ablink` always exchanges transport state with peers. The official SDK
    /// makes that opt-in, and the service contract exposes that switch, so
    /// local transport is held here while synchronisation is off.
    start_stop_sync: bool,
    local_playing: bool,
    last: Instant,
}
impl LinkService {
    pub fn new() -> Self {
        Self {
            link: Link::new(120.),
            quantum: 4.,
            tempo_sync: true,
            start_stop_sync: false,
            local_playing: false,
            last: Instant::now(),
        }
    }
    pub fn configure(&mut self, command: &Value) -> Result<Value, String> {
        // Validate every field before changing the session.
        for (key, min, max) in [("tempo", 20., 300.), ("quantum", 0.25, 64.)] {
            if !command[key].is_null()
                && !command[key]
                    .as_f64()
                    .is_some_and(|v| v.is_finite() && v >= min && v <= max)
            {
                return Err(format!("Invalid {key}"));
            }
        }
        for key in ["enabled", "tempoSync", "startStopSync", "playing"] {
            if !command[key].is_null() && !command[key].is_boolean() {
                return Err(format!("Invalid {key}"));
            }
        }
        if let Some(q) = command["quantum"].as_f64() {
            self.quantum = q;
        }
        if let Some(v) = command["tempoSync"].as_bool() {
            self.tempo_sync = v;
        }
        if let Some(v) = command["startStopSync"].as_bool() {
            if v && !self.start_stop_sync {
                // Joining transport sync adopts the session's transport.
                self.local_playing = self.link.is_playing();
            }
            self.start_stop_sync = v;
        }
        if let Some(v) = command["enabled"].as_bool() {
            self.link.set_enabled(v);
        }
        let now = self.link.now();
        let mut state = self.link.capture_session_state();
        if let Some(v) = command["tempo"].as_f64() {
            state.set_tempo(v, now);
        }
        if let Some(v) = command["playing"].as_bool() {
            self.local_playing = v;
            if self.start_stop_sync {
                state.set_is_playing(v, now);
            }
        }
        self.link.commit_session_state(state);
        Ok(self.snapshot())
    }
    pub fn snapshot(&mut self) -> Value {
        let now = self.link.now();
        let state = self.link.capture_session_state();
        let quantum = Beats::from_f64(self.quantum);
        let playing = if self.start_stop_sync { state.is_playing() } else { self.local_playing };
        json!({
            "enabled": self.link.is_enabled(),
            "peers": self.link.num_peers(),
            "tempo": state.tempo(),
            "beat": state.beat_at_time(now, quantum).to_f64(),
            "phase": state.phase_at_time(now, quantum).to_f64(),
            "quantum": self.quantum,
            "playing": playing,
            "tempoSync": self.tempo_sync,
            "startStopSync": self.start_stop_sync,
            "clockMicros": now.micros(),
        })
    }
    pub fn poll(&mut self) -> Option<Value> {
        if self.last.elapsed() < Duration::from_millis(50) || !self.link.is_enabled() {
            return None;
        }
        self.last = Instant::now();
        Some(json!({"type":"link","state":self.snapshot()}))
    }
}
