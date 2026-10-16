use manifold_services::{ServiceHost, encode_osc};
use serde_json::{Value, json};
use std::{
    io::{Read, Write},
    net::{TcpStream, UdpSocket},
    thread,
    time::{Duration, Instant},
};
fn call(host: &ServiceHost, operation: &str, options: Value) -> Value {
    let mut c = options;
    c["operation"] = operation.into();
    host.request(c).unwrap()
}
fn until(host: &ServiceHost, kind: &str) -> Value {
    let start = Instant::now();
    while start.elapsed() < Duration::from_secs(3) {
        let batch = call(host, "events.poll", json!({}));
        if let Some(e) = batch["events"]
            .as_array()
            .unwrap()
            .iter()
            .find(|e| e["type"] == kind)
        {
            return e.clone();
        }
        thread::sleep(Duration::from_millis(5));
    }
    panic!("No {kind} event");
}
#[test]
fn tcp_accept_chunks_response_and_close() {
    let host = ServiceHost::new();
    let server = call(&host, "tcp.listen", json!({"address":"127.0.0.1:0"}));
    let mut peer = TcpStream::connect(server["address"].as_str().unwrap()).unwrap();
    peer.set_read_timeout(Some(Duration::from_secs(2))).unwrap();
    let accepted = until(&host, "accepted");
    peer.write_all(b"part").unwrap();
    let e = until(&host, "tcp");
    assert_eq!(e["data"], json!([112, 97, 114, 116]));
    call(
        &host,
        "tcp.write",
        json!({"id":accepted["id"],"data":[111,107]}),
    );
    let mut response = [0; 2];
    peer.read_exact(&mut response).unwrap();
    assert_eq!(&response, b"ok");
    drop(peer);
    assert_eq!(until(&host, "closed")["id"], accepted["id"]);
    call(&host, "socket.close", json!({"id":server["id"]}));
    assert!(TcpStream::connect(server["address"].as_str().unwrap()).is_err());
}
#[test]
fn tcp_connect_writes_to_external_listener() {
    let external = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let host = ServiceHost::new();
    let socket = call(
        &host,
        "tcp.connect",
        json!({"address":external.local_addr().unwrap().to_string()}),
    );
    let (mut peer, _) = external.accept().unwrap();
    peer.set_read_timeout(Some(Duration::from_secs(2))).unwrap();
    call(&host, "tcp.write", json!({"id":socket["id"],"data":[42]}));
    let mut b = [0];
    peer.read_exact(&mut b).unwrap();
    assert_eq!(b, [42]);
}
#[test]
fn udp_boundaries_sender_and_response() {
    let host = ServiceHost::new();
    let server = call(&host, "udp.bind", json!({"address":"127.0.0.1:0"}));
    let peer = UdpSocket::bind("127.0.0.1:0").unwrap();
    peer.set_read_timeout(Some(Duration::from_secs(2))).unwrap();
    peer.send_to(&[1, 2, 3], server["address"].as_str().unwrap())
        .unwrap();
    let event = until(&host, "udp");
    assert_eq!(event["data"], json!([1, 2, 3]));
    assert_eq!(event["peer"], peer.local_addr().unwrap().to_string());
    call(
        &host,
        "udp.send",
        json!({"id":server["id"],"address":event["peer"],"data":[9,8]}),
    );
    let mut b = [0; 8];
    let (n, _) = peer.recv_from(&mut b).unwrap();
    assert_eq!(&b[..n], &[9, 8]);
    assert!(host.request(json!({"operation":"udp.send","id":server["id"],"address":event["peer"],"data":vec![0;16_385]})).is_err());
}
#[test]
fn real_osc_and_query_http_websocket_use_accepted_snapshot() {
    let host = ServiceHost::new();
    let server = call(&host, "osc.bind", json!({"address":"127.0.0.1:0"}));
    let peer = UdpSocket::bind("127.0.0.1:0").unwrap();
    peer.send_to(
        &encode_osc("/tone", &json!([440])).unwrap(),
        server["address"].as_str().unwrap(),
    )
    .unwrap();
    let event = until(&host, "osc");
    assert_eq!(event["path"], "/tone");
    assert_eq!(event["args"], json!([440.0]));
    let endpoint = json!({"path":"/tone","min":40,"max":2000,"value":220});
    call(&host, "endpoints.publish", json!({"endpoints":[endpoint]}));
    let query = call(
        &host,
        "oscQuery.start",
        json!({"address":"127.0.0.1:0","oscPort":8000}),
    );
    let address = query["address"].as_str().unwrap();
    let mut http = TcpStream::connect(address).unwrap();
    http.set_read_timeout(Some(Duration::from_secs(2))).unwrap();
    http.write_all(b"GET /tone HTTP/1.1\r\nHost: localhost\r\n\r\n")
        .unwrap();
    let mut response = String::new();
    http.read_to_string(&mut response).unwrap();
    assert!(response.contains("\"VALUE\":[220]"));
    let (mut ws, _) = tungstenite::connect(format!("ws://{address}/")).unwrap();
    if let tungstenite::stream::MaybeTlsStream::Plain(stream) = ws.get_mut() {
        stream
            .set_read_timeout(Some(Duration::from_secs(2)))
            .unwrap();
    }
    ws.send(tungstenite::Message::Text(
        json!({"COMMAND":"LISTEN","DATA":"/tone"})
            .to_string()
            .into(),
    ))
    .unwrap();
    assert!(matches!(
        ws.read().unwrap(),
        tungstenite::Message::Binary(_)
    ));
    call(
        &host,
        "endpoints.publish",
        json!({"endpoints":[{"path":"/tone","min":40,"max":2000,"value":880}]}),
    );
    let packet = ws.read().unwrap();
    let tungstenite::Message::Binary(bytes) = packet else {
        panic!("Expected OSC binary notification")
    };
    let (_, packet) = rosc::decoder::decode_udp(&bytes).unwrap();
    let rosc::OscPacket::Message(m) = packet else {
        panic!()
    };
    assert_eq!(m.args[0], rosc::OscType::Float(880.));
    ws.close(None).unwrap();
    call(&host, "oscQuery.stop", json!({}));
    assert!(TcpStream::connect(address).is_err());
}
#[test]
fn link_finds_real_sdk_peer_and_imports_remote_tempo_and_play_state() {
    let host = ServiceHost::new();
    let peer = rusty_link::AblLink::new(120.);
    let mut state = rusty_link::SessionState::new();
    peer.enable(true);
    peer.enable_start_stop_sync(true);
    call(
        &host,
        "link.configure",
        json!({"enabled":true,"startStopSync":true}),
    );
    let start = Instant::now();
    while peer.num_peers() == 0 && start.elapsed() < Duration::from_secs(8) {
        thread::sleep(Duration::from_millis(50));
    }
    assert!(
        peer.num_peers() > 0,
        "Link SDK peers did not discover one another"
    );
    peer.capture_app_session_state(&mut state);
    state.set_tempo(173., peer.clock_micros());
    state.set_is_playing(true, peer.clock_micros());
    peer.commit_app_session_state(&state);
    let start = Instant::now();
    let mut received = Value::Null;
    while start.elapsed() < Duration::from_secs(5) {
        received = call(&host, "link.inspect", json!({}));
        if (received["tempo"].as_f64().unwrap() - 173.).abs() < 0.01 && received["playing"] == true
        {
            break;
        }
        thread::sleep(Duration::from_millis(50));
    }
    assert!((received["tempo"].as_f64().unwrap() - 173.).abs() < 0.01);
    assert_eq!(received["playing"], true);
    assert!(received["peers"].as_u64().unwrap() > 0);
    call(&host, "link.configure", json!({"enabled":false}));
    peer.enable(false);
}
