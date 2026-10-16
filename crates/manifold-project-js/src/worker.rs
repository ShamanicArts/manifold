//! A dedicated control thread for an authored JS project instance.

use std::sync::mpsc::{self, Receiver, Sender};
use std::thread::{self, JoinHandle};
use std::time::Duration;

use serde_json::Value;

use crate::{HostCommand, ProjectJsRuntime, ScriptError};

enum Request {
    Call(String, Vec<Value>),
    Acknowledge(u64, bool),
    SynchronizeParameters(Vec<u8>),
    Stop,
    Snapshot,
    Presentation(Sender<Result<Value, WorkerError>>),
}

#[derive(Debug)]
pub enum WorkerResult {
    Project(Vec<u8>),
    Command(HostCommand),
}

#[derive(Debug)]
pub enum WorkerError {
    Script(ScriptError),
    Stopped,
    Timeout,
    MissingCommand,
    StateMismatch,
}

pub struct ProjectScriptWorker {
    requests: Sender<Request>,
    replies: Receiver<Result<WorkerResult, WorkerError>>,
    thread: Option<JoinHandle<()>>,
}

fn project_or_command(
    script: &ProjectJsRuntime,
    result: Result<Option<Vec<u8>>, ScriptError>,
) -> Result<WorkerResult, WorkerError> {
    match result.map_err(WorkerError::Script)? {
        Some(project) => Ok(WorkerResult::Project(project)),
        None => script
            .take_command()
            .map(WorkerResult::Command)
            .ok_or(WorkerError::MissingCommand),
    }
}

fn same_json(left: &Value, right: &Value) -> bool {
    match (left, right) {
        (Value::Number(a), Value::Number(b)) => a.as_f64() == b.as_f64(),
        (Value::Array(a), Value::Array(b)) => {
            a.len() == b.len() && a.iter().zip(b).all(|(left, right)| same_json(left, right))
        }
        (Value::Object(a), Value::Object(b)) => {
            a.len() == b.len()
                && a.iter().all(|(key, value)| {
                    b.get(key).is_some_and(|other| {
                        if key == "connections" {
                            match (value.as_array(), other.as_array()) {
                                (Some(left), Some(right)) => same_unordered_json(left, right),
                                _ => same_json(value, other),
                            }
                        } else {
                            same_json(value, other)
                        }
                    })
                })
        }
        _ => left == right,
    }
}

// Graph edge order changes when a route replaces an existing input. Restore
// preserves the same edges but emits them in canonical graph traversal order.
fn same_unordered_json(left: &[Value], right: &[Value]) -> bool {
    if left.len() != right.len() {
        return false;
    }
    let mut used = vec![false; right.len()];
    left.iter().all(|edge| {
        let Some(index) = right
            .iter()
            .enumerate()
            .find(|(index, other)| !used[*index] && same_json(edge, other))
            .map(|(index, _)| index)
        else {
            return false;
        };
        used[index] = true;
        true
    })
}

pub(crate) fn same_project(left: &[u8], right: &[u8]) -> bool {
    serde_json::from_slice::<Value>(left)
        .ok()
        .zip(serde_json::from_slice::<Value>(right).ok())
        .is_some_and(|(left, right)| same_json(&left, &right))
}

pub(crate) fn synchronize_parameters(
    script: &ProjectJsRuntime,
    current: &[u8],
    published: &[u8],
) -> Result<Vec<u8>, WorkerError> {
    manifold_native::project::NativeProject::parse(published)
        .map_err(|error| WorkerError::Script(ScriptError::InvalidProject(format!("{error:?}"))))?;
    let mut expected: Value =
        serde_json::from_slice(current).map_err(|_| WorkerError::StateMismatch)?;
    let host: Value = serde_json::from_slice(published).map_err(|_| WorkerError::StateMismatch)?;
    // Parameter synchronization is valid only for the same published topology.
    // A separate raw import must install its own corresponding controller.
    if !same_json(&expected["signal"]["nodes"], &host["signal"]["nodes"])
        || !same_unordered_json(
            expected["signal"]["connections"]
                .as_array()
                .ok_or(WorkerError::StateMismatch)?,
            host["signal"]["connections"]
                .as_array()
                .ok_or(WorkerError::StateMismatch)?,
        )
        || !same_json(&expected["instances"], &host["instances"])
    {
        return Err(WorkerError::StateMismatch);
    }
    let accepted = host["signal"]["initialParameters"]
        .as_array()
        .ok_or(WorkerError::StateMismatch)?;
    let parameters = expected["signal"]["initialParameters"]
        .as_array_mut()
        .ok_or(WorkerError::StateMismatch)?;
    let mut edits = Vec::new();
    for entry in accepted {
        if let Some(target) = parameters
            .iter_mut()
            .find(|target| target["nodeId"] == entry["nodeId"] && target["id"] == entry["id"])
        {
            if !same_json(&target["value"], &entry["value"]) {
                target["value"] = entry["value"].clone();
                edits.push(entry.clone());
            }
        } else {
            parameters.push(entry.clone());
            edits.push(entry.clone());
        }
    }
    if edits.is_empty() {
        return Ok(current.to_vec());
    }
    let expected = serde_json::to_vec(&expected).map_err(|_| WorkerError::StateMismatch)?;
    let result = script
        .begin_call("adoptPublishedParameters", &[Value::Array(edits)])
        .map_err(WorkerError::Script)?;
    let Some(project) = result else {
        return Err(WorkerError::StateMismatch);
    };
    if !same_project(&expected, &project) {
        return Err(WorkerError::StateMismatch);
    }
    Ok(project)
}

impl ProjectScriptWorker {
    pub fn start(bundle: String, saved: Vec<u8>) -> Result<Self, WorkerError> {
        let (requests, incoming) = mpsc::channel();
        let (outgoing, replies) = mpsc::channel();
        let thread = thread::spawn(move || {
            let script = ProjectJsRuntime::load_with_project(&bundle, Some(&saved));
            let script = match script {
                Ok(script) => script,
                Err(error) => {
                    let _ = outgoing.send(Err(WorkerError::Script(error)));
                    return;
                }
            };
            if !same_project(script.initial_project(), &saved) {
                let _ = outgoing.send(Err(WorkerError::StateMismatch));
                return;
            }
            if outgoing
                .send(Ok(WorkerResult::Project(script.initial_project().to_vec())))
                .is_err()
            {
                return;
            }
            let mut current = script.initial_project().to_vec();
            let mut faulted = false;
            let mut pending_command: Option<HostCommand> = None;
            while let Ok(request) = incoming.recv() {
                if faulted {
                    if let Request::Presentation(reply) = request {
                        let _ = reply.send(Err(WorkerError::StateMismatch));
                        continue;
                    }
                    if matches!(request, Request::Stop) {
                        break;
                    }
                    if outgoing.send(Err(WorkerError::StateMismatch)).is_err() {
                        break;
                    }
                    continue;
                }
                let result = match request {
                    Request::Presentation(reply) => {
                        let _ = reply.send(script.presentation().map_err(WorkerError::Script));
                        continue;
                    }
                    Request::Call(method, args) => {
                        let result = project_or_command(&script, script.begin_call(&method, &args));
                        if let Ok(WorkerResult::Project(ref project)) = result {
                            if !same_project(&current, project) {
                                match crate::publication::accepted_bookkeeping(&current,project) {
                                    Ok(accepted) => {current=accepted;result},
                                    Err(error) => {faulted=true;Err(error)},
                                }
                            } else {
                                result
                            }
                        } else {
                            result
                        }
                    }
                    Request::SynchronizeParameters(published) => {
                        match synchronize_parameters(&script, &current, &published) {
                            Ok(project) => {
                                current = project.clone();
                                Ok(WorkerResult::Project(project))
                            }
                            Err(error) => {
                                if matches!(error, WorkerError::StateMismatch) {
                                    faulted = true;
                                }
                                Err(error)
                            }
                        }
                    }
                    Request::Acknowledge(id, accepted) => {
                        let result = project_or_command(&script, script.acknowledge(id, accepted));
                        if accepted {
                            let snapshot = script.snapshot_project();
                            let verified =
                                snapshot.map_err(WorkerError::Script).and_then(|snapshot| {
                                    let command = pending_command
                                        .take()
                                        .filter(|command| command.id == id)
                                        .ok_or(WorkerError::MissingCommand)?;
                                    crate::publication::accepted_project(
                                        &current,
                                        &command.kind,
                                        &snapshot,
                                    )
                                });
                            match verified {
                                Ok(project) => current = project,
                                Err(error) => {
                                    faulted = true;
                                    if outgoing.send(Err(error)).is_err() {
                                        break;
                                    }
                                    continue;
                                }
                            }
                        }
                        result
                    }
                    Request::Snapshot => Ok(WorkerResult::Project(current.clone())),
                    Request::Stop => break,
                };
                if let Ok(WorkerResult::Command(command)) = &result {
                    pending_command = Some(command.clone());
                }
                if outgoing.send(result).is_err() {
                    break;
                }
            }
        });
        let worker = Self {
            requests,
            replies,
            thread: Some(thread),
        };
        match worker.receive() {
            Ok(WorkerResult::Project(_)) => Ok(worker),
            Ok(WorkerResult::Command(_)) => Err(WorkerError::MissingCommand),
            Err(error) => Err(error),
        }
    }

    fn receive(&self) -> Result<WorkerResult, WorkerError> {
        self.replies
            .recv_timeout(Duration::from_secs(4))
            .map_err(|error| match error {
                mpsc::RecvTimeoutError::Timeout => WorkerError::Timeout,
                mpsc::RecvTimeoutError::Disconnected => WorkerError::Stopped,
            })?
    }

    pub fn published_project(&self) -> Result<Vec<u8>, WorkerError> {
        self.requests
            .send(Request::Snapshot)
            .map_err(|_| WorkerError::Stopped)?;
        match self.receive()? {
            WorkerResult::Project(project) => Ok(project),
            _ => Err(WorkerError::StateMismatch),
        }
    }

    /// Read the accepted creator view on its existing control worker. This
    /// never creates a second controller or submits an audio command.
    pub fn presentation(&self) -> Result<Value, WorkerError> {
        let (reply, result) = mpsc::channel();
        self.requests
            .send(Request::Presentation(reply))
            .map_err(|_| WorkerError::Stopped)?;
        result
            .recv_timeout(Duration::from_secs(4))
            .map_err(|_| WorkerError::Timeout)?
    }

    pub fn set_path(&self, path: &str, value: f64) -> Result<WorkerResult, WorkerError> {
        if !value.is_finite() {
            return Err(WorkerError::Script(ScriptError::Rejected(
                "non-finite value".into(),
            )));
        }
        self.call("set", vec![Value::from(path), Value::from(value)])
    }

    pub fn call(&self, method: &str, args: Vec<Value>) -> Result<WorkerResult, WorkerError> {
        self.requests
            .send(Request::Call(method.into(), args))
            .map_err(|_| WorkerError::Stopped)?;
        self.receive()
    }

    /// Adopt accepted DSP targets before another authored edit. Runs entirely
    /// on the control worker; retains this controller and its local state.
    pub fn synchronize_parameters(&self, published: &[u8]) -> Result<WorkerResult, WorkerError> {
        self.requests
            .send(Request::SynchronizeParameters(published.to_vec()))
            .map_err(|_| WorkerError::Stopped)?;
        self.receive()
    }

    pub fn acknowledge(&self, id: u64, accepted: bool) -> Result<WorkerResult, WorkerError> {
        self.requests
            .send(Request::Acknowledge(id, accepted))
            .map_err(|_| WorkerError::Stopped)?;
        self.receive()
    }
}

impl Drop for ProjectScriptWorker {
    fn drop(&mut self) {
        let _ = self.requests.send(Request::Stop);
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
    }
}
