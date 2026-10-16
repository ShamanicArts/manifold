use serde_json::{Value, json};
use std::collections::{BTreeMap, BTreeSet};
use std::io::{Read, Write};
use std::net::{SocketAddr, TcpListener, TcpStream};
use std::sync::{
    Arc, Mutex,
    atomic::{AtomicBool, AtomicUsize, Ordering},
};
use std::time::Duration;
use tungstenite::{Message, accept_with_config, protocol::WebSocketConfig};

pub struct QueryServer {
    pub address: SocketAddr,
    active: Arc<AtomicBool>,
    worker: Option<std::thread::JoinHandle<()>>,
}
impl QueryServer {
    pub fn start(
        address: SocketAddr,
        endpoints: Arc<Mutex<Value>>,
        osc_port: u16,
    ) -> Result<Self, String> {
        let listener = TcpListener::bind(address).map_err(|e| e.to_string())?;
        let address = listener.local_addr().map_err(|e| e.to_string())?;
        listener.set_nonblocking(true).map_err(|e| e.to_string())?;
        let active = Arc::new(AtomicBool::new(true));
        let alive = active.clone();
        let count = Arc::new(AtomicUsize::new(0));
        let worker = std::thread::spawn(move || {
            let mut clients = vec![];
            while alive.load(Ordering::Relaxed) {
                match listener.accept() {
                    Ok((stream, _)) if count.load(Ordering::Relaxed) < 16 => {
                        let (alive, endpoints, count) =
                            (alive.clone(), endpoints.clone(), count.clone());
                        count.fetch_add(1, Ordering::Relaxed);
                        clients.push(std::thread::spawn(move || {
                            serve(stream, endpoints, osc_port, alive);
                            count.fetch_sub(1, Ordering::Relaxed);
                        }));
                    }
                    Ok(_) => {}
                    Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                        std::thread::sleep(Duration::from_millis(5))
                    }
                    Err(_) => break,
                }
                let mut i = 0;
                while i < clients.len() {
                    if clients[i].is_finished() {
                        let _ = clients.swap_remove(i).join();
                    } else {
                        i += 1;
                    }
                }
            }
            for client in clients {
                let _ = client.join();
            }
        });
        Ok(Self {
            address,
            active,
            worker: Some(worker),
        })
    }
    pub fn publish(&self, _previous: &Value, _next: &Value) { /* Subscribers compare accepted snapshots. */
    }
}
impl Drop for QueryServer {
    fn drop(&mut self) {
        self.active.store(false, Ordering::Relaxed);
        if let Some(worker) = self.worker.take() {
            let _ = worker.join();
        }
    }
}
fn serve(
    mut stream: TcpStream,
    endpoints: Arc<Mutex<Value>>,
    osc_port: u16,
    active: Arc<AtomicBool>,
) {
    let _ = stream.set_read_timeout(Some(Duration::from_millis(200)));
    let _ = stream.set_write_timeout(Some(Duration::from_millis(200)));
    let mut header = [0; 16_384];
    let start = std::time::Instant::now();
    let (n, end) = loop {
        if start.elapsed() > Duration::from_millis(500) {
            return;
        }
        match stream.peek(&mut header) {
            Ok(n) if n > 0 => {
                if let Some(end) = header[..n].windows(4).position(|p| p == b"\r\n\r\n") {
                    break (n, end + 4);
                } else {
                    std::thread::sleep(Duration::from_millis(2));
                }
            }
            _ => return,
        }
    };
    let Ok(text) = std::str::from_utf8(&header[..n]) else {
        return;
    };
    if text.to_ascii_lowercase().contains("upgrade: websocket") {
        let config = WebSocketConfig::default()
            .max_message_size(Some(16_384))
            .max_frame_size(Some(16_384));
        let Ok(mut ws) = accept_with_config(stream, Some(config)) else {
            return;
        };
        let _ = ws.get_mut().set_nonblocking(true);
        let mut listens = BTreeSet::<String>::new();
        let mut previous = BTreeMap::<String, Value>::new();
        let paths = |snapshot: &Value| {
            snapshot
                .as_array()
                .into_iter()
                .flatten()
                .filter_map(|entry| entry["path"].as_str().map(str::to_owned))
                .collect::<BTreeSet<_>>()
        };
        let mut previous_paths = paths(&endpoints.lock().unwrap());
        while active.load(Ordering::Relaxed) {
            match ws.read() {
                Ok(Message::Text(text)) => {
                    if let Ok(command) = serde_json::from_str::<Value>(&text) {
                        if let Some(path) = command["DATA"].as_str() {
                            match command["COMMAND"].as_str() {
                                Some("LISTEN") if listens.len() < 128 => {
                                    listens.insert(path.into());
                                    previous.clear();
                                }
                                Some("IGNORE") => {
                                    listens.remove(path);
                                }
                                _ => {}
                            }
                        }
                    }
                }
                Ok(Message::Close(_)) => break,
                Ok(_) => {}
                Err(tungstenite::Error::Io(e)) if e.kind() == std::io::ErrorKind::WouldBlock => {}
                Err(_) => break,
            }
            let current = endpoints.lock().unwrap().clone();
            let mut next = BTreeMap::new();
            for entry in current.as_array().into_iter().flatten() {
                let path = entry["path"].as_str().unwrap_or("");
                if listens
                    .iter()
                    .any(|p| p == path || p == "/" || path.starts_with(&format!("{p}/")))
                {
                    next.insert(path.to_owned(), entry.clone());
                    if previous.get(path) != Some(entry) {
                        if let Ok(packet) = crate::encode_osc(path, &json!([entry["value"]])) {
                            if ws.send(Message::Binary(packet.into())).is_err() {
                                return;
                            }
                        }
                    }
                }
            }
            let current_paths = paths(&current);
            if previous_paths != current_paths {
                let _ = ws.send(Message::Text(
                    json!({"COMMAND":"PATH_CHANGED","DATA":"/"})
                        .to_string()
                        .into(),
                ));
            }
            previous_paths = current_paths;
            previous = next;
            if ws.flush().is_err_and(|e|!matches!(e,tungstenite::Error::Io(ref e) if e.kind()==std::io::ErrorKind::WouldBlock)){break;}
            std::thread::sleep(Duration::from_millis(20));
        }
        let _ = ws.close(None);
        return;
    }
    let first = text.lines().next().unwrap_or("");
    let mut words = first.split_whitespace();
    if words.next() != Some("GET") {
        return;
    }
    let url = words.next().unwrap_or("/");
    let (path, attribute) = url.split_once('?').unwrap_or((url, ""));
    let current = endpoints.lock().unwrap().clone();
    let result = if attribute == "HOST_INFO" {
        json!({"NAME":"Manifold live project","OSC_IP":"127.0.0.1","OSC_PORT":osc_port,"OSC_TRANSPORT":"UDP","EXTENSIONS":{"ACCESS":true,"VALUE":true,"RANGE":true,"LISTEN":true,"PATH_CHANGED":true}})
    } else {
        node(path, &current).unwrap_or(Value::Null)
    };
    let result = if !attribute.is_empty() && attribute != "HOST_INFO" {
        json!({attribute:result[attribute]})
    } else {
        result
    };
    let status = if result.is_null() {
        "404 Not Found"
    } else {
        "200 OK"
    };
    let body = result.to_string();
    let response = format!(
        "HTTP/1.1 {status}\r\nContent-Type: application/json\r\nCache-Control: no-store\r\nConnection: close\r\nContent-Length: {}\r\n\r\n{body}",
        body.len()
    );
    let mut consumed = vec![0; end];
    let _ = stream.read_exact(&mut consumed);
    let _ = stream.write_all(response.as_bytes());
}
fn node(path: &str, entries: &Value) -> Option<Value> {
    if !path.starts_with('/') {
        return None;
    }
    if let Some(entry) = entries.as_array()?.iter().find(|e| e["path"] == path) {
        return Some(
            json!({"FULL_PATH":path,"DESCRIPTION":entry["name"].as_str().unwrap_or(path),"TYPE":"f","ACCESS":3,"VALUE":[entry["value"]],"RANGE":[{"MIN":entry["min"],"MAX":entry["max"]}]}),
        );
    }
    let prefix = if path == "/" {
        "/".to_string()
    } else {
        format!("{path}/")
    };
    let children = entries
        .as_array()?
        .iter()
        .filter_map(|e| e["path"].as_str()?.strip_prefix(&prefix)?.split('/').next())
        .collect::<BTreeSet<_>>();
    if children.is_empty() && path != "/" {
        return None;
    }
    let mut contents = serde_json::Map::new();
    for child in children {
        let full = format!("{prefix}{child}");
        if let Some(value) = node(&full, entries) {
            contents.insert(child.into(), value);
        }
    }
    Some(json!({"FULL_PATH":path,"CONTENTS":contents}))
}
