//! Local agent connection to the editor's public command client. The native
//! plug-in worker remains the only controller and audio publication owner.
use serde_json::Value;
use std::collections::HashMap;
use std::sync::{Arc, Mutex, mpsc};

pub struct AgentBridge {
    pub address: String,
    pub incoming: mpsc::Receiver<(u64, Value)>,
    pub pending: Arc<Mutex<HashMap<u64, tiny_http::Request>>>,
    stop: Arc<std::sync::atomic::AtomicBool>,
    reader: Option<std::thread::JoinHandle<()>>,
}
impl AgentBridge {
    pub fn start() -> Result<Self, Box<dyn std::error::Error>> {
        let server = tiny_http::Server::http("127.0.0.1:0").map_err(|error| error.to_string())?;
        let address = format!("http://{}/__manifold/request", server.server_addr());
        let pending = Arc::new(Mutex::new(HashMap::new()));
        let waiting = pending.clone();
        let (send, incoming) = mpsc::sync_channel(32);
        let stop = Arc::new(std::sync::atomic::AtomicBool::new(false));
        let stopping = stop.clone();
        let reader = std::thread::spawn(move || {
            let mut next = 0u64;
            while !stopping.load(std::sync::atomic::Ordering::Acquire) {
                let mut request = match server.recv_timeout(std::time::Duration::from_millis(100)) {
                    Ok(Some(request)) => request,
                    Ok(None) => continue,
                    Err(_) => break,
                };
                if request.method() != &tiny_http::Method::Post
                    || request.url() != "/__manifold/request"
                    || request
                        .headers()
                        .iter()
                        .any(|header| header.field.equiv("Origin"))
                {
                    let _ = request.respond(
                        tiny_http::Response::from_string("Invalid local agent request")
                            .with_status_code(400),
                    );
                    continue;
                }
                let mut bytes = Vec::new();
                let valid = request
                    .as_reader()
                    .read_to_end(&mut bytes)
                    .is_ok();
                let command = if valid {
                    serde_json::from_slice::<Value>(&bytes).ok()
                } else {
                    None
                };
                let Some(command) = command.filter(|command| command.is_object()) else {
                    let _ = request.respond(
                        tiny_http::Response::from_string("Invalid command").with_status_code(400),
                    );
                    continue;
                };
                let Ok(mut pending) = waiting.lock() else {
                    break;
                };
                if pending.len() >= 32 {
                    let _ = request.respond(
                        tiny_http::Response::from_string("Creator busy").with_status_code(409),
                    );
                    continue;
                }
                next += 1;
                pending.insert(next, request);
                if send.try_send((next, command)).is_err() {
                    if let Some(request) = pending.remove(&next) {
                        let _ = request.respond(
                            tiny_http::Response::from_string("Creator unavailable")
                                .with_status_code(409),
                        );
                    }
                }
            }
        });
        Ok(Self {
            address,
            incoming,
            pending,
            stop,
            reader: Some(reader),
        })
    }
    pub fn reply(pending: &Mutex<HashMap<u64, tiny_http::Request>>, message: &Value) {
        let Some(id) = message["id"].as_u64() else {
            return;
        };
        let request = pending
            .lock()
            .ok()
            .and_then(|mut pending| pending.remove(&id));
        if let Some(request) = request {
            let result = message.get("result").unwrap_or(message);
            let _ = request.respond(
                tiny_http::Response::from_string(result.to_string())
                    .with_status_code(if result.get("error").is_some() {
                        409
                    } else {
                        200
                    })
                    .with_header(
                        tiny_http::Header::from_bytes("Content-Type", "application/json").unwrap(),
                    ),
            );
        }
    }
}

impl Drop for AgentBridge {
    fn drop(&mut self) {
        self.stop.store(true, std::sync::atomic::Ordering::Release);
        if let Some(reader) = self.reader.take() {
            let _ = reader.join();
        }
        if let Ok(mut pending) = self.pending.lock() {
            for (_, request) in pending.drain() {
                let _ = request.respond(
                    tiny_http::Response::from_string("Editor closed").with_status_code(410),
                );
            }
        }
    }
}
