import { NODE_TYPES, addNode, removeNode, setConnection, setInitialParameter,
  captureGraphProject, parseGraphProject } from './topology.js';

// Edits a project description outside the AudioWorklet. The next start compiles it in Rust.
export function mountGraphEditor(section, project, { isRunning, isActive, onChange, onParameter }) {
  const nodesRoot = section.querySelector('#graph-nodes');
  const status = section.querySelector('#graph-status');
  const addType = section.querySelector('#graph-add-type');
  const addButton = section.querySelector('#graph-add-node');
  const fileInput = section.querySelector('#graph-project-file');
  const exportButton = section.querySelector('#graph-project-export');
  const listeners = new AbortController();
  let busy = false;
  let destroyed = false;
  const pendingParameters = new Set();

  addType.replaceChildren(...Object.entries(NODE_TYPES).filter(([, spec]) => !spec.fixedId)
    .map(([type, spec]) => new Option(spec.label, type)));

  const canEdit = () => !destroyed && isActive() && !isRunning() && !busy;
  const canChangeParameter = () => !destroyed && isActive() && !busy;
  function refreshRunning(updateStatus = true) {
    const disabled = !canEdit();
    section.querySelectorAll('.graph-edit').forEach((control) => { control.disabled = disabled; });
    section.querySelectorAll('.graph-parameter').forEach((control) => {
      control.disabled = !canChangeParameter() || pendingParameters.has(`${control.dataset.node}:${control.dataset.parameter}`);
    });
    fileInput.disabled = disabled;
    if (updateStatus && isActive()) status.textContent = `${project.signal.nodes.length} nodes · ${project.signal.connections.length} connections · ${isRunning() ? 'parameters update live; stop audio to edit topology' : 'start audio to compile this graph in Rust'}`;
  }
  function commit(signal, message) {
    project.signal = signal;
    render();
    status.textContent = message;
    onChange?.(signal);
  }
  function fail(error) {
    status.textContent = `Graph unchanged: ${error.message ?? String(error)}`;
  }

  function render() {
    nodesRoot.replaceChildren();
    for (const node of project.signal.nodes) {
      const spec = NODE_TYPES[node.type];
      const article = document.createElement('article');
      article.className = 'graph-node';
      const heading = document.createElement('div');
      heading.className = 'graph-node-heading';
      const name = document.createElement('strong');
      name.textContent = `${node.id} · ${spec.label}`;
      const signal = document.createElement('span');
      signal.className = `graph-signal graph-signal-${spec.output ?? 'sink'}`;
      signal.textContent = spec.output ?? 'sink';
      heading.append(name, signal);
      if (!spec.fixedId) {
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'graph-edit graph-remove';
        remove.textContent = 'Remove';
        remove.setAttribute('aria-label', `Remove ${spec.label} node ${node.id}`);
        remove.addEventListener('click', () => {
          if (!canEdit()) return;
          try { commit(removeNode(project.signal, node.id), `Removed ${spec.label} ${node.id}. Start audio to compile.`); }
          catch (error) { fail(error); }
        });
        heading.append(remove);
      }
      article.appendChild(heading);
      for (let port = 0; port < spec.inputs.length; port++) {
        const kind = spec.inputs[port];
        const row = document.createElement('label');
        row.className = 'graph-field';
        const text = document.createElement('span');
        text.textContent = `${kind === 'control' ? 'CV' : 'Audio'} input ${port + 1}`;
        const select = document.createElement('select');
        select.className = 'graph-edit';
        select.dataset.to = String(node.id);
        select.dataset.port = String(port);
        select.setAttribute('aria-label', `${spec.label} ${node.id} ${kind} input ${port + 1}`);
        select.add(new Option('Unconnected', ''));
        for (const source of project.signal.nodes) {
          if (source.id !== node.id && NODE_TYPES[source.type].output === kind) {
            select.add(new Option(`${source.id} · ${NODE_TYPES[source.type].label}`, String(source.id)));
          }
        }
        const current = project.signal.connections.find((edge) => edge.to === node.id && edge.inputPort === port);
        select.value = current ? String(current.from) : '';
        select.addEventListener('change', () => {
          if (!canEdit()) return;
          try {
            const from = select.value === '' ? null : Number(select.value);
            commit(setConnection(project.signal, node.id, port, from), `Updated ${spec.label} ${node.id} input ${port + 1}. Start audio to compile.`);
          } catch (error) { select.value = current ? String(current.from) : ''; fail(error); }
        });
        row.append(text, select);
        article.appendChild(row);
      }
      for (const parameter of spec.parameters ?? []) {
        const entry = project.signal.initialParameters.find((item) => item.nodeId === node.id && item.id === parameter.id);
        const row = document.createElement('label');
        row.className = 'graph-field';
        const text = document.createElement('span');
        text.textContent = parameter.label;
        let input;
        if (parameter.choices) {
          input = document.createElement('select');
          for (const [index, choice] of parameter.choices.entries()) input.add(new Option(choice, String(index)));
        } else {
          input = document.createElement('input');
          input.type = 'number';
          input.min = String(parameter.min);
          input.max = String(parameter.max);
          input.step = 'any';
        }
        input.className = 'graph-parameter';
        input.dataset.node = String(node.id);
        input.dataset.parameter = String(parameter.id);
        input.setAttribute('aria-label', `${spec.label} ${node.id} ${parameter.label}`);
        input.value = String(entry.value);
        input.addEventListener('change', async () => {
          if (!canChangeParameter()) return;
          const key = `${node.id}:${parameter.id}`;
          try {
            if (input.value.trim() === '') throw new Error('Enter a parameter value.');
            const value = Number(input.value);
            setInitialParameter(project.signal, node.id, parameter.id, value);
            if (isRunning()) {
              pendingParameters.add(key);
              input.disabled = true;
              await onParameter(node.id, parameter.id, value);
            }
            if (!canChangeParameter()) return;
            commit(setInitialParameter(project.signal, node.id, parameter.id, value),
              `Updated ${spec.label} ${node.id} ${parameter.label}${isRunning() ? ' in Rust and project state.' : '. Start audio to compile.'}`);
          }
          catch (error) { input.value = String(project.signal.initialParameters.find((item) => item.nodeId === node.id && item.id === parameter.id)?.value ?? entry.value); fail(error); }
          finally { pendingParameters.delete(key); refreshRunning(false); }
        });
        row.append(text, input);
        article.appendChild(row);
      }
      nodesRoot.appendChild(article);
    }
    refreshRunning();
  }

  addButton.addEventListener('click', () => {
    if (!canEdit()) return;
    try { commit(addNode(project.signal, addType.value), `Added ${NODE_TYPES[addType.value].label}. Connect its ports, then start audio.`); }
    catch (error) { fail(error); }
  }, { signal: listeners.signal });
  exportButton.addEventListener('click', () => {
    if (!isActive()) return;
    try {
      const bundle = captureGraphProject(project.signal);
      const url = URL.createObjectURL(new Blob([`${JSON.stringify(bundle, null, 2)}\n`], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = 'manifold-graph-workspace-project.json';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      status.textContent = `Downloaded ${bundle.signal.nodes.length} nodes and ${bundle.signal.connections.length} connections.`;
    } catch (error) { fail(error); }
  }, { signal: listeners.signal });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    try {
      if (!canEdit()) throw new Error('Stop audio before opening a graph.');
      if (file.size > 1024 * 1024) throw new Error('Graph project must be smaller than 1 MB.');
      const contents = await file.text();
      if (!canEdit()) throw new Error('Project view changed while opening the graph.');
      commit(parseGraphProject(JSON.parse(contents)), `Opened ${file.name}. Start audio to compile the restored graph.`);
    } catch (error) { fail(error); }
    finally { fileInput.value = ''; }
  }, { signal: listeners.signal });
  render();
  return { refreshRunning, setBusy(value) { busy = value; refreshRunning(); },
    destroy() { destroyed = true; listeners.abort(); } };
}
