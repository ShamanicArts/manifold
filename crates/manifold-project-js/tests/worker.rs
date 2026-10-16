use manifold_project_js::package::ProjectPackage;
use manifold_project_js::worker::{ProjectScriptWorker, WorkerError, WorkerResult};

const FX: &[u8] = include_bytes!("../../../web/public/packages/fx-slot-swap.manifold.json");

#[test]
fn sample_worker_preserves_accepted_gate_when_the_next_note_is_rejected() {
    let package = ProjectPackage::parse(include_bytes!(
        "../../../web/public/packages/rack-sample-author.manifold.json"
    ))
    .unwrap();
    let state = package.state().to_vec();
    let worker = ProjectScriptWorker::start(package.bundle, state).unwrap();
    let path = "/midi/synth/rack/sample/1/voice/1/gate";
    let WorkerResult::Command(gain) = worker.set_path(path, 0.6).unwrap() else {
        panic!("missing gain command");
    };
    let WorkerResult::Command(note) = worker.acknowledge(gain.id, true).unwrap() else {
        panic!("missing subsequent note");
    };
    let accepted: serde_json::Value =
        serde_json::from_slice(&worker.published_project().unwrap()).unwrap();
    assert_eq!(
        accepted["controls"]
            .as_array()
            .unwrap()
            .iter()
            .find(|entry| entry["path"] == path)
            .unwrap()["value"],
        0.6
    );
    assert!(matches!(
        worker.acknowledge(note.id, false),
        Err(WorkerError::Script(
            manifold_project_js::ScriptError::Rejected(_)
        ))
    ));
    let after: serde_json::Value =
        serde_json::from_slice(&worker.published_project().unwrap()).unwrap();
    assert_eq!(after, accepted);
    assert!(matches!(
        worker.set_path(path, 0.).unwrap(),
        WorkerResult::Command(_)
    ));
}

#[test]
fn worker_faults_on_unpublished_topology_after_an_accepted_note() {
    let package = ProjectPackage::parse(include_bytes!(
        "../../../web/public/packages/sample-instrument-author.manifold.json"
    ))
    .unwrap();
    let bundle = r#"globalThis.ManifoldProject = { restoreProject(host,saved) {
        let project = saved;
        return { toProject: () => project, async mutate() {
            await host.sendEvent({nodeId:2,kind:0,note:60,velocity:90});
            project = JSON.parse(JSON.stringify(project));
            project.signal.connections.pop();
            return project;
        }};
    }};"#;
    let worker = ProjectScriptWorker::start(bundle.into(), package.state().to_vec()).unwrap();
    let WorkerResult::Command(note) = worker.call("mutate", vec![]).unwrap() else {
        panic!("missing event");
    };
    assert!(matches!(
        worker.acknowledge(note.id, true),
        Err(WorkerError::StateMismatch)
    ));
    assert!(matches!(
        worker.published_project(),
        Err(WorkerError::StateMismatch)
    ));
}

#[test]
fn packaged_script_runs_on_its_own_thread_until_host_publication() {
    let package = ProjectPackage::parse(FX).unwrap();
    let worker =
        ProjectScriptWorker::start(package.bundle.clone(), package.state().to_vec()).unwrap();
    let WorkerResult::Command(command) = worker.set_path("/test/fxslot/slotA/select", 1.0).unwrap()
    else {
        panic!("FX selection must request host publication");
    };
    let manifold_project_js::HostCommandKind::ReplaceGraph { document } = command.kind else {
        panic!("FX selection must replace the graph");
    };
    let candidate: serde_json::Value = serde_json::from_slice(&document).unwrap();
    assert_eq!(candidate["signal"]["nodes"].as_array().unwrap().len(), 12);
    assert!(matches!(
        worker.set_path("/test/fxslot/slotB/select", 1.0),
        Err(WorkerError::Script(
            manifold_project_js::ScriptError::Pending
        ))
    ));
    let WorkerResult::Project(saved) = worker.acknowledge(command.id, true).unwrap() else {
        panic!("accepted FX swap must return its saved graph");
    };
    assert_eq!(
        serde_json::from_slice::<serde_json::Value>(&saved).unwrap(),
        candidate
    );
    let reopened = ProjectScriptWorker::start(package.bundle, saved).unwrap();
    let WorkerResult::Command(next) = reopened.set_path("/test/fxslot/slotB/select", 1.0).unwrap()
    else {
        panic!("reopened controller must continue authoring");
    };
    let manifold_project_js::HostCommandKind::ReplaceGraph { document } = next.kind else {
        panic!("second slot must replace the graph");
    };
    let graph: serde_json::Value = serde_json::from_slice(&document).unwrap();
    assert_eq!(graph["signal"]["nodes"].as_array().unwrap().len(), 14);
}

#[test]
fn rejected_worker_edit_can_retry_and_shutdown_with_an_outstanding_command() {
    let package = ProjectPackage::parse(FX).unwrap();
    let worker =
        ProjectScriptWorker::start(package.bundle.clone(), package.state().to_vec()).unwrap();
    let WorkerResult::Command(first) = worker.set_path("/test/fxslot/slotA/select", 1.0).unwrap()
    else {
        panic!("missing structural command");
    };
    assert!(matches!(
        worker.acknowledge(first.id, false),
        Err(WorkerError::Script(
            manifold_project_js::ScriptError::Rejected(_)
        ))
    ));
    assert!(matches!(
        worker.set_path("/test/fxslot/slotA/select", 1.0).unwrap(),
        WorkerResult::Command(_)
    ));
    drop(worker);
}

#[test]
fn worker_rejects_a_script_that_mutates_project_without_a_host_command() {
    let package = ProjectPackage::parse(FX).unwrap();
    let bundle = r#"globalThis.ManifoldProject = {
      restoreProject(_host, saved) {
        let project = saved;
        return {
          toProject: () => project,
          mutate() {
            project = structuredClone(project);
            project.signal.initialParameters[0].value = 0.25;
            return project;
          }
        };
      }
    };"#;
    let worker = ProjectScriptWorker::start(bundle.into(), package.state().to_vec()).unwrap();
    assert!(matches!(
        worker.call("mutate", vec![]),
        Err(WorkerError::StateMismatch)
    ));
    assert!(matches!(
        worker.call("toProject", vec![]),
        Err(WorkerError::StateMismatch)
    ));
}

#[test]
fn accepted_host_parameters_survive_script_composition_without_recreating_controller() {
    let package = ProjectPackage::parse(FX).unwrap();
    let worker =
        ProjectScriptWorker::start(package.bundle.clone(), package.state().to_vec()).unwrap();
    let mut host: serde_json::Value = serde_json::from_slice(package.state()).unwrap();
    let trim = host["signal"]["initialParameters"]
        .as_array_mut()
        .unwrap()
        .iter_mut()
        .find(|entry| entry["nodeId"] == 4 && entry["id"] == 0)
        .unwrap();
    trim["value"] = 0.375.into();
    // Native saves can retain earlier author metadata; synchronization must
    // preserve the controller's own authored controls.
    host["controls"][0]["value"] = 0.0.into();
    let WorkerResult::Project(adopted) = worker
        .synchronize_parameters(&serde_json::to_vec(&host).unwrap())
        .unwrap()
    else {
        panic!("adoption must not submit a command");
    };
    let adopted: serde_json::Value = serde_json::from_slice(&adopted).unwrap();
    assert_eq!(
        adopted["controls"],
        serde_json::from_slice::<serde_json::Value>(package.state()).unwrap()["controls"]
    );
    let WorkerResult::Command(command) = worker.set_path("/test/fxslot/slotA/select", 1.0).unwrap()
    else {
        panic!("missing swap");
    };
    let manifold_project_js::HostCommandKind::ReplaceGraph { document } = command.kind else {
        panic!("missing graph");
    };
    let candidate: serde_json::Value = serde_json::from_slice(&document).unwrap();
    assert_eq!(
        candidate["signal"]["initialParameters"]
            .as_array()
            .unwrap()
            .iter()
            .find(|entry| entry["nodeId"] == 4 && entry["id"] == 0)
            .unwrap()["value"],
        0.375
    );
    worker.acknowledge(command.id, true).unwrap();
    worker.synchronize_parameters(&document).unwrap();
    assert!(matches!(
        worker.call("toProject", vec![]).unwrap(),
        WorkerResult::Project(_)
    ));
}

#[test]
fn parameter_adoption_preserves_script_local_state_and_rejects_unpublished_commands() {
    let package = ProjectPackage::parse(FX).unwrap();
    let bundle = r#"globalThis.ManifoldProject = {
      restoreProject(host, saved) {
        let project = saved;
        let edits = 0;
        return {
          toProject: () => project,
          adoptPublishedParameters(parameters) {
            if (++edits !== 1) throw Error('controller was recreated or adopted twice');
            project.signal.initialParameters = parameters;
            return project;
          },
          check() { if (edits !== 1) throw Error('local state lost'); return project; }
        };
      }
    };"#;
    let worker = ProjectScriptWorker::start(bundle.into(), package.state().to_vec()).unwrap();
    let mut host: serde_json::Value = serde_json::from_slice(package.state()).unwrap();
    // Supply all entries here because this deliberately small controller replaces
    // its entire parameter array; all values differ and must be checked.
    for parameter in host["signal"]["initialParameters"].as_array_mut().unwrap() {
        parameter["value"] = if parameter["value"] == 0 {
            0.2.into()
        } else {
            0.0.into()
        };
    }
    let host = serde_json::to_vec(&host).unwrap();
    worker.synchronize_parameters(&host).unwrap();
    worker.synchronize_parameters(&host).unwrap(); // no-op must skip controller method
    assert!(matches!(
        worker.call("check", vec![]).unwrap(),
        WorkerResult::Project(_)
    ));
    let malicious = r#"globalThis.ManifoldProject = { restoreProject(host, project) {
      return { toProject: () => project, adoptPublishedParameters: () => host.replaceGraph(project) };
    }};"#;
    let worker = ProjectScriptWorker::start(malicious.into(), package.state().to_vec()).unwrap();
    assert!(matches!(
        worker.synchronize_parameters(&host),
        Err(WorkerError::StateMismatch)
    ));
    assert!(matches!(
        worker.call("toProject", vec![]),
        Err(WorkerError::StateMismatch)
    ));
}
