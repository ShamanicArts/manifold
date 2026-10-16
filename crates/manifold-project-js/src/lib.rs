//! Native control-thread execution of bundled `@manifold/author` projects.
//! JavaScript state advances only after the audio host acknowledges a command.

pub mod native_host;
pub mod package;
pub mod publication;
pub mod worker;

use std::cell::{Cell, RefCell};
use std::collections::VecDeque;
use std::rc::Rc;
use std::time::{Duration, Instant};

use manifold_core::events::{EventKind, TimedEvent};
use manifold_native::project::NativeProject;
use rquickjs::{Context, Ctx, Runtime, prelude::Func};
use serde_json::{Value, json};

#[derive(Debug, Clone, PartialEq)]
pub enum HostCommandKind {
    ParameterBatch {
        edits: Vec<(u32, u32, f64)>,
    },
    Event {
        event: TimedEvent,
    },
    Parameter {
        node: u32,
        id: u32,
        value: f64,
    },
    Route {
        to: u32,
        input_port: u32,
        from: u32,
        output_port: u32,
    },
    ReplaceGraph {
        document: Vec<u8>,
    },
    Metadata {
        document: Vec<u8>,
    },
}

#[derive(Debug, Clone, PartialEq)]
pub struct HostCommand {
    pub id: u64,
    pub kind: HostCommandKind,
}

#[derive(Debug)]
pub enum ScriptError {
    JavaScript(String),
    InvalidProject(String),
    Rejected(String),
    Pending,
    Poisoned,
    JobLimit,
    WrongAcknowledgement,
    Timeout,
}

fn js_error(ctx: &Ctx<'_>, error: rquickjs::Error) -> ScriptError {
    if error.is_exception() {
        let exception = ctx.catch();
        let message = exception
            .as_object()
            .and_then(|object| object.get::<_, String>("stack").ok())
            .or_else(|| {
                exception
                    .as_string()
                    .and_then(|value| value.to_string().ok())
            })
            .unwrap_or_else(|| format!("{exception:?}"));
        ScriptError::JavaScript(message)
    } else {
        ScriptError::JavaScript(error.to_string())
    }
}

fn parse_command(source: &str) -> Option<HostCommand> {
    let value: Value = serde_json::from_str(source).ok()?;
    let id = value["id"].as_u64().filter(|id| *id > 0)?;
    let kind = match value["kind"].as_str()? {
        "parameterBatch" => {
            let entries = value["edits"].as_array()?;
            if entries.is_empty() {
                return None;
            }
            let edits = entries
                .iter()
                .map(|edit| {
                    Some((
                        u32::try_from(edit["nodeId"].as_u64()?).ok()?,
                        u32::try_from(edit["id"].as_u64()?).ok()?,
                        edit["value"].as_f64().filter(|v| v.is_finite())?,
                    ))
                })
                .collect::<Option<Vec<_>>>()?;
            HostCommandKind::ParameterBatch { edits }
        }
        "event" => {
            let integer = |key: &str, default: u64, limit: u64| {
                let number = if value[key].is_null() {
                    default
                } else {
                    value[key].as_u64()?
                };
                (number <= limit).then_some(number)
            };
            let node = integer("nodeId", 0, u32::MAX as u64).filter(|v| *v > 0)?;
            let offset = integer("offset", 0, 4096)? as usize;
            let channel = integer("channel", 0, 15)? as u8;
            let note = integer("note", 0, 127)? as u8;
            let velocity = integer("velocity", 0, 127)? as u8;
            let kind = match value["eventKind"].as_u64()? {
                0 => EventKind::NoteOn {
                    channel,
                    note,
                    velocity,
                },
                1 => EventKind::NoteOff { channel, note },
                2 => EventKind::AllNotesOff,
                3 => EventKind::PitchBend {
                    channel,
                    value: note as u16 | ((velocity as u16) << 7),
                },
                _ => return None,
            };
            HostCommandKind::Event {
                event: TimedEvent { node, offset, kind },
            }
        }
        "parameter" => HostCommandKind::Parameter {
            node: u32::try_from(value["nodeId"].as_u64()?).ok()?,
            id: u32::try_from(value["parameterId"].as_u64()?).ok()?,
            value: value["value"].as_f64().filter(|value| value.is_finite())?,
        },
        "route" => HostCommandKind::Route {
            to: u32::try_from(value["to"].as_u64()?).ok()?,
            input_port: u32::try_from(value["inputPort"].as_u64()?).ok()?,
            from: u32::try_from(value["from"].as_u64()?).ok()?,
            output_port: u32::try_from(value["outputPort"].as_u64()?).ok()?,
        },
        "replaceGraph" => {
            let document = serde_json::to_vec(&value["project"]).ok()?;
            NativeProject::parse(&document).ok()?;
            HostCommandKind::ReplaceGraph { document }
        }
        "metadata" => {
            let document = serde_json::to_vec(&value["project"]).ok()?;
            NativeProject::parse(&document).ok()?;
            HostCommandKind::Metadata { document }
        }
        _ => return None,
    };
    Some(HostCommand { id, kind })
}

/// One isolated QuickJS runtime and authored graph per native project instance.
/// Bundles expose `ManifoldProject.createProject(host)` and run away from audio.
pub struct ProjectJsRuntime {
    runtime: Runtime,
    context: Context,
    deadline: Rc<Cell<Option<Instant>>>,
    commands: Rc<RefCell<VecDeque<HostCommand>>>,
    pending: Cell<bool>,
    poisoned: Cell<bool>,
    awaiting: Cell<Option<u64>>,
    initial_project: Vec<u8>,
}

impl ProjectJsRuntime {
    pub fn load(bundle: &str) -> Result<Self, ScriptError> {
        Self::load_with_project(bundle, None)
    }

    /// Restore project logic from the same document that the native audio host
    /// loaded. The bundle must export `restoreProject(host, savedDocument)`.
    pub fn load_with_project(bundle: &str, saved: Option<&[u8]>) -> Result<Self, ScriptError> {
        let saved_source = if let Some(bytes) = saved {
            NativeProject::parse(bytes)
                .map_err(|error| ScriptError::InvalidProject(format!("{error:?}")))?;
            Some(
                std::str::from_utf8(bytes)
                    .map_err(|error| ScriptError::InvalidProject(error.to_string()))?,
            )
        } else {
            None
        };
        let runtime = Runtime::new().map_err(|error| ScriptError::JavaScript(error.to_string()))?;
        runtime.set_max_stack_size(1024 * 1024);
        let deadline = Rc::new(Cell::new(None::<Instant>));
        let interrupt_deadline = Rc::clone(&deadline);
        runtime.set_interrupt_handler(Some(Box::new(move || {
            interrupt_deadline
                .get()
                .is_some_and(|instant| Instant::now() >= instant)
        })));
        let context =
            Context::full(&runtime).map_err(|error| ScriptError::JavaScript(error.to_string()))?;
        let commands = Rc::new(RefCell::new(VecDeque::new()));
        let callback_commands = Rc::clone(&commands);
        deadline.set(Some(Instant::now() + Duration::from_secs(2)));
        let initial_project = context.with(|ctx| {
            ctx.globals().set("__nativeEnqueue", Func::new(move |source: String| {
                let Some(command) = parse_command(&source) else { return false; };
                let mut queue = callback_commands.borrow_mut();
                if queue.len() >= 16 { return false; }
                queue.push_back(command);
                true
            })).map_err(|error| js_error(&ctx, error))?;
            ctx.eval::<(), _>(r#"
                globalThis.structuredClone ??= function clone(value) {
                  if (value === null || typeof value !== 'object') return value;
                  if (ArrayBuffer.isView(value)) return new value.constructor(value);
                  if (value instanceof ArrayBuffer) return value.slice(0);
                  if (Array.isArray(value)) return value.map(clone);
                  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)]));
                };
            "#).map_err(|error| js_error(&ctx, error))?;
            ctx.eval::<(), _>(bundle).map_err(|error| js_error(&ctx, error))?;
            ctx.eval::<(), _>(r#"
                // QuickJS's wide-string -> UTF-8 conversion reserves a worst-case
                // buffer for the whole string. Embedded artwork makes that spike
                // exceed the bounded heap even though the live document fits.
                // ASCII JSON is lossless, including surrogate pairs, and avoids
                // that second wide-string conversion allocation at the host seam.
                function __manifoldJSON(value) {
                  return JSON.stringify(value).replace(/[\u007f-\uffff]/g,
                    character => '\\u' + character.charCodeAt(0).toString(16).padStart(4, '0'));
                }
                const __manifoldResolvers = new Map();
                let __manifoldCommandId = 0;
                function __manifoldSubmit(command) {
                  const id = ++__manifoldCommandId;
                  return new Promise((resolve, reject) => {
                    if (!__nativeEnqueue(__manifoldJSON({ id, ...command }))) {
                      reject(new Error('Native host command queue rejected the request'));
                      return;
                    }
                    __manifoldResolvers.set(id, resolve);
                  });
                }
                globalThis.__manifoldAcknowledge = (id, accepted) => {
                  const resolve = __manifoldResolvers.get(id);
                  if (!resolve) throw new Error('Unknown native host command');
                  __manifoldResolvers.delete(id);
                  resolve(accepted);
                };
                globalThis.__manifoldHost = Object.freeze({
                  setParameter: edit => __manifoldSubmit({kind: 'parameter',
                    nodeId: edit.nodeId, parameterId: edit.id, value: edit.value}),
                  setParameterBatch: edits => __manifoldSubmit({kind: 'parameterBatch', edits}),
                  sendEvent: async event => {
                    const accepted = await __manifoldSubmit({ ...event, kind: 'event', eventKind: event.kind });
                    if (!accepted) throw new Error('Native host rejected the event');
                    return true;
                  },
                  setRoute: route => __manifoldSubmit({kind: 'route', to: route.to,
                    inputPort: route.inputPort, from: route.from ?? 0,
                    outputPort: route.outputPort ?? 0}),
                  replaceGraph: project => __manifoldSubmit({kind: 'replaceGraph', project}),
                  updateMetadata: project => __manifoldSubmit({kind: 'metadata', project}),
                });
            "#).map_err(|error| js_error(&ctx, error))?;
            if let Some(source) = saved_source {
                ctx.globals().set("__manifoldSavedDocument", source)
                    .map_err(|error| js_error(&ctx, error))?;
                // The encoded document can be several MiB and may occupy a
                // two-byte JS string. Release it before the controller prepares
                // its own state; retaining a second full copy exhausts bounded
                // runtimes when projects carry embedded image assets.
                ctx.eval::<(), _>(r#"
                    (() => {
                      const saved = JSON.parse(__manifoldSavedDocument);
                      delete globalThis.__manifoldSavedDocument;
                      globalThis.__manifoldProject = ManifoldProject.restoreProject(__manifoldHost, saved);
                    })();
                "#)
                    .map_err(|error| js_error(&ctx, error))?;
            } else {
                ctx.eval::<(), _>("globalThis.__manifoldProject = ManifoldProject.createProject(__manifoldHost)")
                    .map_err(|error| js_error(&ctx, error))?;
            }
            let source: String = ctx.eval("__manifoldJSON(__manifoldProject.toProject())")
                .map_err(|error| js_error(&ctx, error))?;
            NativeProject::parse(source.as_bytes())
                .map_err(|error| ScriptError::InvalidProject(format!("{error:?}")))?;
            Ok::<_, ScriptError>(source.into_bytes())
        });
        let timed_out = deadline
            .get()
            .is_some_and(|instant| Instant::now() >= instant);
        deadline.set(None);
        if timed_out {
            return Err(ScriptError::Timeout);
        }
        let initial_project = initial_project?;
        if !commands.borrow().is_empty() {
            return Err(ScriptError::InvalidProject(
                "project controller submitted a host command during construction".into(),
            ));
        }
        Ok(Self {
            runtime,
            context,
            deadline,
            commands,
            pending: Cell::new(false),
            poisoned: Cell::new(false),
            awaiting: Cell::new(None),
            initial_project,
        })
    }

    pub fn initial_project(&self) -> &[u8] {
        &self.initial_project
    }

    /// Read the project's authored presentation on its control thread.
    pub fn presentation(&self) -> Result<Value, ScriptError> {
        self.deadline.set(Some(Instant::now() + Duration::from_secs(2)));
        let result = self.context.with(|ctx| {
            let source: String = ctx.eval("__manifoldJSON(__manifoldProject.presentation())")
                .map_err(|error| js_error(&ctx, error))?;
            serde_json::from_str(&source).map_err(|error| ScriptError::JavaScript(error.to_string()))
        });
        self.deadline.set(None);
        result
    }

    /// Snapshot accepted author state between steps of a pending control call.
    /// Only the control host uses this; it must verify the snapshot against the
    /// command just acknowledged before adopting it as published state.
    pub(crate) fn snapshot_project(&self) -> Result<Vec<u8>, ScriptError> {
        if self.poisoned.get() {
            return Err(ScriptError::Poisoned);
        }
        self.deadline
            .set(Some(Instant::now() + Duration::from_millis(250)));
        let result = self.context.with(|ctx| {
            ctx.eval::<String, _>("__manifoldJSON(__manifoldProject.toProject())")
                .map_err(|error| js_error(&ctx, error))
        });
        let timed_out = self
            .deadline
            .get()
            .is_some_and(|instant| Instant::now() >= instant);
        self.deadline.set(None);
        if timed_out {
            self.poisoned.set(true);
            return Err(ScriptError::Timeout);
        }
        let document = result?.into_bytes();
        NativeProject::parse(&document)
            .map_err(|error| ScriptError::InvalidProject(format!("{error:?}")))?;
        Ok(document)
    }

    /// Invoke an authored control method. `None` means a host command awaits
    /// publication; read it with `take_command`, then acknowledge that command.
    pub fn begin_call(
        &self,
        method: &str,
        arguments: &[Value],
    ) -> Result<Option<Vec<u8>>, ScriptError> {
        if self.poisoned.get() {
            return Err(ScriptError::Poisoned);
        }
        if self.pending.get() {
            return Err(ScriptError::Pending);
        }
        // Project compilation/restore gets the same bounded control-thread
        // budget as initial loading. Interactive parameter/note calls retain
        // the shorter budget. Audio continues on its own prepared plan.
        let authoring = method == "request" && arguments.first().is_some_and(|command| {
            let operation = command["operation"].as_str().unwrap_or("");
            operation.starts_with("graph.") || operation.starts_with("presentation.") || operation.starts_with("component.")
                || matches!(operation, "source.apply" | "project.restore" | "project.undo" | "parameter.expose" | "file.write" | "file.remove")
        });
        let call_budget = if authoring { Duration::from_secs(2) } else { Duration::from_millis(250) };
        let method = serde_json::to_string(method)
            .map_err(|error| ScriptError::JavaScript(error.to_string()))?;
        let arguments = serde_json::to_string(arguments)
            .map_err(|error| ScriptError::JavaScript(error.to_string()))?;
        self.pending.set(true);
        self.deadline
            .set(Some(Instant::now() + call_budget));
        let submitted = self.context.with(|ctx| {
            ctx.eval::<(), _>(format!(r#"
                globalThis.__manifoldReply = null;
                Promise.resolve().then(() => __manifoldProject[{method}](...{arguments})).then(
                  project => {{ globalThis.__manifoldReply = {{ ok: true, project }}; }},
                  error => {{ globalThis.__manifoldReply = {{ ok: false, message: String(error) }}; }});
            "#)).map_err(|error| js_error(&ctx, error))
        });
        let executed = if submitted.is_ok() {
            self.drain_jobs()
        } else {
            Ok(())
        };
        let timed_out = self
            .deadline
            .get()
            .is_some_and(|instant| Instant::now() >= instant);
        self.deadline.set(None);
        if timed_out {
            self.poisoned.set(true);
            self.pending.set(false);
            return Err(ScriptError::Timeout);
        }
        if let Err(error) = submitted.and(executed) {
            self.poisoned.set(true);
            self.pending.set(false);
            return Err(error);
        }
        self.read_reply().inspect_err(|error| {
            if !matches!(error, ScriptError::Rejected(_)) {
                self.poisoned.set(true);
            }
        })
    }

    pub fn begin_set_path(&self, path: &str, value: f64) -> Result<Option<Vec<u8>>, ScriptError> {
        if !value.is_finite() {
            return Err(ScriptError::Rejected("non-finite value".into()));
        }
        self.begin_call("set", &[json!(path), json!(value)])
    }

    pub fn take_command(&self) -> Option<HostCommand> {
        if self.poisoned.get() {
            return None;
        }
        if self.awaiting.get().is_some() {
            return None;
        }
        let command = self.commands.borrow_mut().pop_front()?;
        self.awaiting.set(Some(command.id));
        Some(command)
    }

    /// Call after the corresponding host block or stopped processor has accepted
    /// or rejected the command. The script's saved graph advances here.
    pub fn acknowledge(&self, id: u64, accepted: bool) -> Result<Option<Vec<u8>>, ScriptError> {
        if self.poisoned.get() {
            return Err(ScriptError::Poisoned);
        }
        if self.awaiting.get() != Some(id) {
            return Err(ScriptError::WrongAcknowledgement);
        }
        self.awaiting.set(None);
        self.deadline
            .set(Some(Instant::now() + Duration::from_millis(250)));
        let applied = self.context.with(|ctx| {
            ctx.globals()
                .get::<_, rquickjs::Function>("__manifoldAcknowledge")
                .and_then(|function| function.call::<_, ()>((id, accepted)))
                .map_err(|error| js_error(&ctx, error))
        });
        let executed = if applied.is_ok() {
            self.drain_jobs()
        } else {
            Ok(())
        };
        let timed_out = self
            .deadline
            .get()
            .is_some_and(|instant| Instant::now() >= instant);
        self.deadline.set(None);
        if timed_out {
            self.poisoned.set(true);
            self.pending.set(false);
            return Err(ScriptError::Timeout);
        }
        if let Err(error) = applied.and(executed) {
            self.poisoned.set(true);
            self.pending.set(false);
            return Err(error);
        }
        self.read_reply().inspect_err(|error| {
            if !matches!(error, ScriptError::Rejected(_)) {
                self.poisoned.set(true);
            }
        })
    }

    fn drain_jobs(&self) -> Result<(), ScriptError> {
        for _ in 0..1024 {
            match self.runtime.execute_pending_job() {
                Ok(true) => {}
                Ok(false) => return Ok(()),
                Err(error) => return Err(ScriptError::JavaScript(format!("{error:?}"))),
            }
        }
        Err(ScriptError::JobLimit)
    }

    fn read_reply(&self) -> Result<Option<Vec<u8>>, ScriptError> {
        self.context.with(|ctx| {
            let source: String = ctx
                .eval("__manifoldJSON(__manifoldReply)")
                .map_err(|error| js_error(&ctx, error))?;
            let reply: Value = serde_json::from_str(&source)
                .map_err(|error| ScriptError::JavaScript(error.to_string()))?;
            if reply.is_null() {
                return Ok(None);
            }
            self.pending.set(false);
            if reply["ok"] != true {
                return Err(ScriptError::Rejected(
                    reply["message"].as_str().unwrap_or("rejected").into(),
                ));
            }
            let project = serde_json::to_vec(&reply["project"])
                .map_err(|error| ScriptError::JavaScript(error.to_string()))?;
            NativeProject::parse(&project)
                .map_err(|error| ScriptError::InvalidProject(format!("{error:?}")))?;
            Ok(Some(project))
        })
    }
}
