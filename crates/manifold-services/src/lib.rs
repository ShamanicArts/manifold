//! Native networking services. These APIs belong on host/control workers, never
//! on an audio callback. Each session owns and closes its sockets and Link peer.
mod link;
mod query;

use rosc::{OscMessage, OscPacket, OscType};
use serde_json::{Value, json};
use std::collections::{BTreeMap, VecDeque};
use std::io::{Read, Write};
use std::net::{SocketAddr, TcpListener, TcpStream, UdpSocket};
use std::sync::{Arc, Mutex, mpsc};
use std::time::Duration;

pub const MAX_PAYLOAD: usize = 16_384;
const MAX_RESOURCES: usize = 32;
const MAX_EVENTS: usize = 128;

enum Resource {
    Udp(UdpSocket, bool),
    Listener(TcpListener),
    Stream(TcpStream, VecDeque<u8>),
}

/// Worker-local state. Direct callers must drive `poll` off the audio/UI thread.
pub struct ServiceSession {
    resources: BTreeMap<u64, Resource>,
    next_id: u64,
    events: VecDeque<Value>,
    dropped: u64,
    pub endpoints: Arc<Mutex<Value>>,
    query: Option<query::QueryServer>,
    link: link::LinkService,
}

impl Default for ServiceSession {
    fn default() -> Self {
        Self::new()
    }
}

impl ServiceSession {
    pub fn new() -> Self {
        Self {
            resources: BTreeMap::new(),
            next_id: 0,
            events: VecDeque::new(),
            dropped: 0,
            endpoints: Arc::new(Mutex::new(json!([]))),
            query: None,
            link: link::LinkService::new(),
        }
    }

    fn insert(&mut self, resource: Resource) -> Result<u64, String> {
        if self.resources.len() >= MAX_RESOURCES {
            return Err("Socket capacity reached".into());
        }
        self.next_id += 1;
        self.resources.insert(self.next_id, resource);
        Ok(self.next_id)
    }

    fn emit(&mut self, event: Value) {
        if self.events.len() == MAX_EVENTS {
            self.dropped += 1;
            return;
        }
        self.events.push_back(event);
    }

    pub fn request(&mut self, command: &Value) -> Result<Value, String> {
        let operation = command["operation"].as_str().ok_or("Missing operation")?;
        let id = command["id"].as_u64().unwrap_or(0);
        let address = || -> Result<SocketAddr, String> {
            command["address"]
                .as_str()
                .ok_or("Use an explicit IP:port address")?
                .parse()
                .map_err(|_| "Invalid socket address".into())
        };
        match operation {
            "capabilities" => Ok(
                json!({"tcp":true,"udp":true,"osc":true,"oscQuery":true,"link":true,"maxPayload":MAX_PAYLOAD,"maxResources":MAX_RESOURCES}),
            ),
            "udp.bind" | "osc.bind" => {
                let socket = UdpSocket::bind(address()?).map_err(|e| e.to_string())?;
                socket.set_nonblocking(true).map_err(|e| e.to_string())?;
                let local = socket.local_addr().map_err(|e| e.to_string())?;
                let id = self.insert(Resource::Udp(socket, operation == "osc.bind"))?;
                Ok(json!({"id":id,"address":local.to_string()}))
            }
            "tcp.listen" => {
                let listener = TcpListener::bind(address()?).map_err(|e| e.to_string())?;
                listener.set_nonblocking(true).map_err(|e| e.to_string())?;
                let local = listener.local_addr().map_err(|e| e.to_string())?;
                let id = self.insert(Resource::Listener(listener))?;
                Ok(json!({"id":id,"address":local.to_string()}))
            }
            "tcp.connect" => {
                let stream = TcpStream::connect_timeout(&address()?, Duration::from_millis(500))
                    .map_err(|e| e.to_string())?;
                stream.set_nonblocking(true).map_err(|e| e.to_string())?;
                stream.set_nodelay(true).map_err(|e| e.to_string())?;
                let local = stream.local_addr().map_err(|e| e.to_string())?;
                let peer = stream.peer_addr().map_err(|e| e.to_string())?;
                let id = self.insert(Resource::Stream(stream, VecDeque::new()))?;
                Ok(json!({"id":id,"address":local.to_string(),"peer":peer.to_string()}))
            }
            "socket.close" => {
                if self.resources.remove(&id).is_none() {
                    return Err("Unknown socket".into());
                }
                Ok(json!({"closed":id}))
            }
            "udp.send" | "tcp.write" | "osc.send" => {
                let bytes = if operation == "osc.send" {
                    encode_osc(
                        command["path"].as_str().ok_or("Missing OSC path")?,
                        &command["args"],
                    )?
                } else {
                    payload(&command["data"])?
                };
                if bytes.len() > MAX_PAYLOAD {
                    return Err("Payload exceeds 16 KiB".into());
                }
                match self.resources.get_mut(&id).ok_or("Unknown socket")? {
                    Resource::Udp(socket, _) if operation != "tcp.write" => {
                        let n = socket
                            .send_to(&bytes, address()?)
                            .map_err(|e| e.to_string())?;
                        Ok(json!({"written":n}))
                    }
                    Resource::Stream(_, pending) if operation == "tcp.write" => {
                        if pending.len() + bytes.len() > MAX_PAYLOAD {
                            return Err("TCP write backpressure".into());
                        }
                        pending.extend(bytes);
                        Ok(json!({"queued":pending.len()}))
                    }
                    _ => Err("Wrong socket type".into()),
                }
            }
            "endpoints.publish" => {
                let entries = command["endpoints"]
                    .as_array()
                    .ok_or("Expected endpoints")?;
                if entries.len() > 256 {
                    return Err("Endpoint capacity reached".into());
                }
                for e in entries {
                    let path = e["path"].as_str().ok_or("Missing endpoint path")?;
                    if !path.starts_with('/') || path.len() > 256 || e["value"].as_f64().is_none() {
                        return Err("Invalid numeric endpoint".into());
                    }
                }
                let previous = std::mem::replace(
                    &mut *self.endpoints.lock().unwrap(),
                    Value::Array(entries.clone()),
                );
                if let Some(query) = &self.query {
                    query.publish(&previous, &Value::Array(entries.clone()));
                }
                Ok(json!({"published":entries.len()}))
            }
            "oscQuery.start" => {
                if self.query.is_some() {
                    return Err("OSCQuery already running".into());
                }
                let server = query::QueryServer::start(
                    address()?,
                    self.endpoints.clone(),
                    command["oscPort"].as_u64().unwrap_or(0) as u16,
                )?;
                let local = server.address;
                self.query = Some(server);
                Ok(json!({"address":local.to_string()}))
            }
            "oscQuery.stop" => {
                self.query = None;
                Ok(json!({"stopped":true}))
            }
            "link.configure" => self.link.configure(command),
            "link.inspect" => Ok(self.link.snapshot()),
            "events.poll" => {
                self.poll();
                Ok(
                    json!({"events":self.events.drain(..).collect::<Vec<_>>(),"dropped":self.dropped}),
                )
            }
            "session.inspect" => Ok(
                json!({"resources":self.resources.len(),"queuedEvents":self.events.len(),"dropped":self.dropped,"link":self.link.snapshot()}),
            ),
            _ => Err(format!("Unknown service operation {operation}")),
        }
    }

    pub fn poll(&mut self) {
        let mut events = vec![];
        let mut accepted = vec![];
        let mut closed = vec![];
        let mut buffer = [0_u8; MAX_PAYLOAD + 1];
        for (&id, resource) in &mut self.resources {
            match resource {
                Resource::Udp(socket, osc) => {
                    for _ in 0..8 {
                        match socket.recv_from(&mut buffer) {
                            Ok((n, peer)) if n <= MAX_PAYLOAD => {
                                if *osc {
                                    match rosc::decoder::decode_udp(&buffer[..n]) {
                                    Ok((rest,packet)) if rest.is_empty()=>osc_events(id,&peer.to_string(),packet,&mut events,0),
                                    _=>events.push(json!({"type":"error","id":id,"error":"Malformed OSC packet"})),
                                }
                                } else {
                                    events.push(json!({"type":"udp","id":id,"peer":peer.to_string(),"data":buffer[..n]}));
                                }
                            }
                            Ok(_) => events.push(
                                json!({"type":"error","id":id,"error":"Datagram exceeds 16 KiB"}),
                            ),
                            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => break,
                            Err(e) => {
                                events.push(json!({"type":"error","id":id,"error":e.to_string()}));
                                break;
                            }
                        }
                    }
                }
                Resource::Listener(listener) => {
                    for _ in 0..4 {
                        match listener.accept() {
                            Ok((stream, peer)) => {
                                if let Err(e) = stream.set_nonblocking(true) {
                                    events.push(
                                        json!({"type":"error","id":id,"error":e.to_string()}),
                                    );
                                } else {
                                    accepted.push((id, stream, peer));
                                }
                            }
                            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => break,
                            Err(e) => {
                                events.push(json!({"type":"error","id":id,"error":e.to_string()}));
                                break;
                            }
                        }
                    }
                }
                Resource::Stream(stream, pending) => {
                    if !pending.is_empty() {
                        let (a, _) = pending.as_slices();
                        match stream.write(a) {
                            Ok(0) => closed.push(id),
                            Ok(n) => {
                                pending.drain(..n);
                            }
                            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {}
                            Err(e) => {
                                closed.push(id);
                                events.push(json!({"type":"error","id":id,"error":e.to_string()}));
                            }
                        }
                    }
                    for _ in 0..4 {
                        match stream.read(&mut buffer[..MAX_PAYLOAD]) {
                            Ok(0) => {
                                closed.push(id);
                                break;
                            }
                            Ok(n) => events.push(json!({"type":"tcp","id":id,"data":buffer[..n]})),
                            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => break,
                            Err(e) => {
                                closed.push(id);
                                events.push(json!({"type":"error","id":id,"error":e.to_string()}));
                                break;
                            }
                        }
                    }
                }
            }
        }
        for (listener, stream, peer) in accepted {
            match self.insert(Resource::Stream(stream, VecDeque::new())) {
                Ok(id) => events.push(
                    json!({"type":"accepted","id":id,"listener":listener,"peer":peer.to_string()}),
                ),
                Err(e) => events.push(json!({"type":"error","id":listener,"error":e})),
            }
        }
        closed.sort_unstable();
        closed.dedup();
        for id in closed {
            self.resources.remove(&id);
            events.push(json!({"type":"closed","id":id}));
        }
        if let Some(event) = self.link.poll() {
            events.push(event);
        }
        for event in events {
            self.emit(event);
        }
    }
}

fn payload(value: &Value) -> Result<Vec<u8>, String> {
    let values = value.as_array().ok_or("Expected a byte array")?;
    if values.len() > MAX_PAYLOAD {
        return Err("Payload exceeds 16 KiB".into());
    }
    values
        .iter()
        .map(|v| {
            v.as_u64()
                .filter(|v| *v <= 255)
                .map(|v| v as u8)
                .ok_or("Invalid byte".into())
        })
        .collect()
}
pub fn encode_osc(path: &str, args: &Value) -> Result<Vec<u8>, String> {
    if !path.starts_with('/') || path.len() > 256 {
        return Err("Invalid OSC path".into());
    }
    let args = args.as_array().ok_or("Expected OSC args")?;
    if args.len() > 64 {
        return Err("Too many OSC args".into());
    }
    let args = args
        .iter()
        .map(|v| {
            if let Some(v) = v.as_bool() {
                Ok(OscType::Bool(v))
            } else if let Some(v) = v.as_f64() {
                if v.is_finite() {
                    Ok(OscType::Float(v as f32))
                } else {
                    Err("Nonfinite OSC value".into())
                }
            } else if let Some(v) = v.as_str() {
                Ok(OscType::String(v.into()))
            } else {
                Err("Unsupported OSC argument".into())
            }
        })
        .collect::<Result<Vec<_>, String>>()?;
    rosc::encoder::encode(&OscPacket::Message(OscMessage {
        addr: path.into(),
        args,
    }))
    .map_err(|e| e.to_string())
}
fn osc_events(id: u64, peer: &str, packet: OscPacket, events: &mut Vec<Value>, depth: usize) {
    if depth > 8 || events.len() >= 64 {
        return;
    }
    match packet {
        OscPacket::Message(message) => {
            let args = message
                .args
                .into_iter()
                .map(|a| match a {
                    OscType::Float(v) => json!(v),
                    OscType::Double(v) => json!(v),
                    OscType::Int(v) => json!(v),
                    OscType::Long(v) => json!(v),
                    OscType::Bool(v) => json!(v),
                    OscType::String(v) => json!(v),
                    _ => Value::Null,
                })
                .collect::<Vec<_>>();
            events.push(json!({"type":"osc","id":id,"peer":peer,"path":message.addr,"args":args}));
        }
        // Future timetags need a graph scheduler; reject instead of executing early.
        OscPacket::Bundle(bundle) => {
            if bundle.timetag.seconds != 0 || bundle.timetag.fractional != 1 {
                events.push(json!({"type":"error","id":id,"error":"Scheduled OSC bundles require transport scheduling"}));
                return;
            }
            for packet in bundle.content {
                osc_events(id, peer, packet, events, depth + 1);
            }
        }
    }
}

struct Job {
    command: Value,
    reply: mpsc::Sender<Result<Value, String>>,
}
/// Cloneable control/bridge handle. Dropping the last handle shuts down its worker.
#[derive(Clone)]
pub struct ServiceHost {
    sender: mpsc::SyncSender<Job>,
}
impl Default for ServiceHost {
    fn default() -> Self {
        Self::new()
    }
}
impl ServiceHost {
    pub fn new() -> Self {
        let (sender, receiver) = mpsc::sync_channel::<Job>(32);
        std::thread::spawn(move || {
            let mut session = ServiceSession::new();
            loop {
                match receiver.recv_timeout(Duration::from_millis(2)) {
                    Ok(job) => {
                        let _ = job.reply.send(session.request(&job.command));
                    }
                    Err(mpsc::RecvTimeoutError::Disconnected) => break,
                    Err(mpsc::RecvTimeoutError::Timeout) => {}
                }
                session.poll();
            }
        });
        Self { sender }
    }
    /// Nonblocking submission for native control threads.
    pub fn submit(&self, command: Value) -> Result<mpsc::Receiver<Result<Value, String>>, String> {
        let (reply, response) = mpsc::channel();
        self.sender
            .try_send(Job { command, reply })
            .map_err(|_| "Service queue full or closed".to_string())?;
        Ok(response)
    }
    /// HTTP adapters and CLI callers only; never call from UI or audio.
    pub fn request(&self, command: Value) -> Result<Value, String> {
        self.submit(command)?
            .recv_timeout(Duration::from_secs(2))
            .map_err(|_| "Service response timeout".to_string())?
    }
}
