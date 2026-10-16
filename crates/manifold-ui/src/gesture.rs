//! Transient UI intent over accepted parameters. It owns no project or DSP state.
use crate::Parameter;
use serde_json::{Value, json};
use std::collections::BTreeMap;

#[derive(Default)]
pub struct ParameterGesture {
    sequence: u64,
    latest: BTreeMap<String, (u64, f64, String)>,
}

pub type SentGesture = Vec<(String, u64)>;

impl ParameterGesture {
    pub fn set(&mut self, path: String, value: f64, operation: String) {
        self.sequence += 1;
        self.latest.insert(path, (self.sequence, value, operation));
    }
    pub fn overlay(&self, parameters: &mut [Parameter]) {
        for parameter in parameters {
            if let Some((_, value, _)) = self.latest.get(&parameter.path) {
                parameter.value = *value;
            }
        }
    }
    pub fn batch(&self) -> Option<(Value, SentGesture)> {
        if self.latest.is_empty() {
            return None;
        }
        // The public batch contract admits at most 16 distinct parameters.
        let operation = &self.latest.values().next()?.2;
        let limit = if operation == "control.set" { 1 } else { 16 };
        let edits: Vec<_> = self
            .latest
            .iter()
            .filter(|(_, (_, _, op))| op == operation)
            .take(limit)
            .map(|(path, (_, value, _))| json!({"path":path,"value":value}))
            .collect();
        let sent = self
            .latest
            .iter()
            .filter(|(_, (_, _, op))| op == operation)
            .take(limit)
            .map(|(path, (sequence, _, _))| (path.clone(), *sequence))
            .collect();
        Some((
            json!({"operation":if operation == "control.set" { "control.batch" } else { "parameter.batch" },"edits":edits,"origin":"egui"}),
            sent,
        ))
    }
    pub fn finish(&mut self, sent: &SentGesture) {
        for (path, sequence) in sent {
            if self
                .latest
                .get(path)
                .is_some_and(|(current, _, _)| current == sequence)
            {
                self.latest.remove(path);
            }
        }
    }
    pub fn clear(&mut self) {
        self.latest.clear();
    }
}
