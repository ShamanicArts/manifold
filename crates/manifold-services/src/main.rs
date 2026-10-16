//! Local host bridge. Preview servers proxy this route for browser projects.
use manifold_services::ServiceHost;
use serde_json::{Value, json};
use std::{
    collections::BTreeMap,
    io::Read,
    time::{Duration, Instant},
};
fn main() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let address = std::env::args().nth(1).unwrap_or("127.0.0.1:4180".into());
    let server = tiny_http::Server::http(&address)?;
    println!(
        "Manifold service bridge http://{}/__manifold/services",
        server.server_addr()
    );
    let mut sessions = BTreeMap::<String, (ServiceHost, Instant)>::new();
    loop {
        // Expired browser sessions release sockets, query servers and Link peers.
        sessions.retain(|_, (_, seen)| seen.elapsed() < Duration::from_secs(15));
        let Some(mut request) = server.recv_timeout(Duration::from_millis(100))? else {
            continue;
        };
        if request.method() != &tiny_http::Method::Post || request.url() != "/__manifold/services" {
            let _ = request.respond(
                tiny_http::Response::from_string("POST a service command").with_status_code(404),
            );
            continue;
        }
        let mut bytes = String::new();
        let read = request.as_reader().take(256_001).read_to_string(&mut bytes);
        let result = (|| -> Result<Value, String> {
            read.map_err(|e| e.to_string())?;
            if bytes.len() > 256_000 {
                return Err("Request exceeds 256 KB".into());
            }
            let body: Value = serde_json::from_str(&bytes).map_err(|e| e.to_string())?;
            let session = body["session"]
                .as_str()
                .filter(|s| !s.is_empty() && s.len() <= 128)
                .ok_or("Missing session ID")?;
            if body["command"]["operation"] == "session.close" {
                sessions.remove(session);
                return Ok(json!({"closed":true}));
            }
            if !sessions.contains_key(session) && sessions.len() >= 16 {
                return Err("Session capacity reached".into());
            }
            let (host, seen) = sessions
                .entry(session.into())
                .or_insert_with(|| (ServiceHost::new(), Instant::now()));
            *seen = Instant::now();
            host.request(body["command"].clone())
        })();
        let (code, body) = match result {
            Ok(v) => (200, json!({"result":v})),
            Err(e) => (400, json!({"error":e})),
        };
        let response = tiny_http::Response::from_string(body.to_string())
            .with_status_code(code)
            .with_header(
                tiny_http::Header::from_bytes("Content-Type", "application/json").unwrap(),
            );
        let _ = request.respond(response);
    }
}
