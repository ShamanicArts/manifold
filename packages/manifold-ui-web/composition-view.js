import { createImageRenderer } from './image-renderer.js';
import { isVisualSurface } from '@manifold/author/visual-primitives';
import { createPresentationClock } from './presentation-clock.js';
import { evaluateProjectModules } from '@manifold/author/project-modules';
import { projectFileDataUrl } from '@manifold/author/project-files';
import {
  createPresentationGraph,
  presentationResource,
  resourceValue,
} from './composition-runtime.js';
import { isResourceType } from '@manifold/author/presentation-types';
import { presentationControls } from './presentation-controls.js';
import { mountSceneObject } from './scene-object.js';

/** Presentation scripts and surfaces over the accepted project. No audio ownership. */
export function mountCompositionView(
  element,
  runtime,
  {
    modules = {},
    target = 'browser',
    analysis = () => null,
    request = (command) => runtime.request(command),
    onError = console.error,
    onIssues = () => {},
    onObservation = () => {},
    hostDrivenHidden = false,
  } = {},
) {
  const layer = document.createElement('div');
  layer.className = 'manifold-composition';
  layer.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:1';
  element.append(layer);
  let state = runtime.snapshot(),
    disposed = false,
    advancing = false,
    pendingState = null,
    visible = true,
    previewNodes = [];
  const entries = new Map(),
    issues = new Map();
  const controls = presentationControls(runtime, (command) =>
    request({ ...command, origin: 'presentation' }),
  );
  let executionIssues = [],
    previewSignature = '',
    lastPublished = null,
    lastObservation = -Infinity;
  const reportIssues = () => onIssues([...issues.values(), ...executionIssues]);
  const images = createImageRenderer(async (path) =>
    projectFileDataUrl(await request({ operation: 'file.read', path })),
  );
  const execution = createPresentationGraph({
    imagePreview: images.preview,
    analysis,
    onIssues(next) {
      executionIssues = next;
      reportIssues();
    },
  });
  function clearIssue(id) {
    if (issues.delete(id)) reportIssues();
  }
  function retire(entry) {
    entry.cancelled = true;
    try {
      entry.instance?.dispose();
    } catch (cause) {
      const error = cause instanceof Error ? cause : new Error(String(cause));
      onError(error);
    }
    entry.element.remove();
  }
  function place(entry, node) {
    if (entry.scripted || !node.bounds) {
      entry.element.hidden = true;
      return;
    }
    entry.element.hidden = false;
    const { x, y, width, height } = node.bounds;
    entry.element.style.cssText = `position:absolute;left:${x}%;top:${y}%;width:${width}%;height:${height}%;pointer-events:auto;overflow:hidden`;
    entry.element.style.visibility = entry.instance ? '' : 'hidden';
    entry.element.setAttribute('aria-label', node.label);
  }
  async function prepare(node, definition, previous) {
    const surface = document.createElement('div');
    surface.dataset.visualNode = String(node.id);
    const entry = {
      element: surface,
      signature: JSON.stringify(definition),
      cancelled: false,
      instance: null,
      scripted: !isVisualSurface(definition),
      previous,
      adopted: false,
    };
    entries.set(node.id, entry);
    execution.detach(node.id);
    place(entry, node);
    surface.style.visibility = 'hidden';
    layer.append(surface);
    try {
      if (definition.implementation.kind === 'visual-primitive') {
        const canvas = document.createElement('canvas');
        canvas.style.cssText = 'width:100%;height:100%;display:block';
        surface.append(canvas);
        entry.instance = {
          render() {
            if (!visible) return;
            const rect = surface.getBoundingClientRect();
            const scale = Math.min(devicePixelRatio || 1, 2);
            images.draw(
              canvas,
              execution.input(node.id, 'image'),
              Math.max(1, Math.min(2048, Math.round(rect.width * scale))),
              Math.max(1, Math.min(2048, Math.round(rect.height * scale))),
            );
          },
          dispose() {
            canvas.remove();
          },
        };
        if (previous) retire(previous);
        entry.previous = null;
        entry.adopted = true;
        execution.attach(node.id, entry.instance);
        surface.style.visibility = '';
        clearIssue(node.id);
        return;
      }
      if (!definition.implementation.targets.includes(target))
        throw new Error(`${definition.label} does not support ${target}`);
      const dependencies = {};
      for (const [name, version] of Object.entries(definition.implementation.dependencies)) {
        const capability = modules[name];
        if (!capability || capability.version !== version)
          throw new Error(`Unavailable visual dependency: ${name}@${version}`);
        dependencies[name] = await capability.load();
      }
      if (entry.cancelled || disposed) return;
      const namespace = evaluateProjectModules(
        definition.implementation.entry,
        definition.sources,
        dependencies,
      );
      const factory =
        typeof namespace.default === 'function' ? namespace.default() : namespace.default;
      if (typeof factory?.then === 'function') Promise.resolve(factory).catch(() => {});
      const scripted = definition.implementation.kind === 'presentation-script';
      const object = definition.implementation.kind === 'scene-object';
      if (
        factory?.then ||
        typeof factory?.[scripted ? 'evaluate' : object ? 'create' : 'mount'] !== 'function'
      )
        throw new Error(
          scripted
            ? 'Presentation factory must return evaluate(api, frame)'
            : object
              ? 'Scene factory must return create(api)'
              : 'Visual factory must return synchronous mount(element, api)',
        );
      const current = () => state.composition.nodes.find((item) => item.id === node.id);
      const api = Object.freeze({
        input(name) {
          return execution.input(node.id, name);
        },
        parameter: (name) => current()?.parameters[name],
        // Parameter sources make a binding visible in the graph. These control
        // methods also support authored panels and interaction scripts.
        value: controls.value,
        set: controls.set,
        setBatch: controls.setBatch,
        snapshot: () => runtime.snapshot(),
        subscribe: (listener) => runtime.subscribe(listener),
        request: (command) => request({ ...command, origin: 'presentation' }),
        resource: (name) => resourceValue(execution.input(node.id, name)),
        exportResource: presentationResource,
        assetUrl: async (path) =>
          projectFileDataUrl(await request({ operation: 'file.read', path })),
      });
      entry.instance = scripted
        ? { evaluate: (frame) => factory.evaluate(api, frame), dispose: () => factory.dispose?.() }
        : object
          ? mountSceneObject(
              factory,
              api,
              definition.inputs
                .filter((port) => isResourceType(port.type))
                .map((port) => port.name),
              definition.outputs ?? [],
              () => {
                if (entry.previous) retire(entry.previous);
                entry.previous = null;
                entry.adopted = true;
              },
            )
          : factory.mount(surface, api);
      if (typeof entry.instance?.then === 'function')
        Promise.resolve(entry.instance).catch(() => {});
      if (!entry.instance || entry.instance.then || typeof entry.instance.dispose !== 'function')
        throw new Error('Visual mount must return a synchronous disposable instance');
      if (entry.cancelled || disposed) {
        retire(entry);
        return;
      }
      if (!object) {
        if (previous) retire(previous);
        entry.previous = null;
        entry.adopted = true;
      }
      execution.attach(node.id, entry.instance);
      surface.style.visibility = '';
      clearIssue(node.id);
    } catch (error) {
      retire(entry);
      if (entries.get(node.id) === entry) {
        issues.set(node.id, { id: node.id, label: node.label, message: error.message });
        reportIssues();
        onError(error);
      }
      // Keep the last rendered instance available after a failed candidate.
      if (entries.get(node.id) === entry) {
        entries.set(
          node.id,
          previous
            ? { ...previous, signature: entry.signature }
            : { ...entry, cancelled: false, previous: null },
        );
        // Script failures have no stale outputs. A prior surface can remain
        // visible, explicitly accompanied by the preparation error above.
        if (previous?.instance && definition.implementation.kind === 'web-surface')
          execution.attach(node.id, previous.instance);
      }
    }
  }
  function update(next) {
    // Source edits and gesture publications must not retire or reconfigure
    // objects partway through their shared scene's frame.
    if (advancing) {
      pendingState = next;
      return;
    }
    pendingState = null;
    const operation = next.history?.at(-1)?.operation;
    if (
      next.revision !== state.revision &&
      (operation?.startsWith('file.') ||
        ['component.define', 'project.restore', 'project.undo'].includes(operation) ||
        !next.history?.length)
    )
      images.invalidate();
    state = { ...next, composition: next.presentationExecution ?? next.composition };
    execution.configure(state);
    const nodes = state.composition?.nodes ?? [];
    layer.hidden = nodes.length === 0;
    retainImages();
    for (const [id, entry] of entries)
      if (!nodes.some((node) => node.id === id)) {
        retire(entry);
        if (entry.previous) retire(entry.previous);
        entries.delete(id);
        clearIssue(id);
      }
    for (const node of nodes) {
      const definition = state.visualDefinitions.find((item) => item.id === node.definition);
      const entry = entries.get(node.id);
      if (
        definition.implementation.kind === 'parameter' ||
        (definition.implementation.kind === 'visual-primitive' && !isVisualSurface(definition))
      ) {
        if (entry) {
          retire(entry);
          if (entry.previous) retire(entry.previous);
          entries.delete(node.id);
          execution.detach(node.id);
          clearIssue(node.id);
        }
        continue;
      }
      if (entry && entry.signature === JSON.stringify(definition)) {
        place(entry, node);
        continue;
      }
      let previous = entry;
      if (entry && (!entry.instance || !entry.adopted)) {
        previous = entry.previous;
        retire(entry);
      }
      void prepare(node, definition, previous);
    }
  }
  const unsubscribe = runtime.subscribe(update);
  update(state);
  function inspect() {
    const nodes = execution.inspect();
    for (const issue of issues.values())
      if (nodes[issue.id]) nodes[issue.id].status = issue.message;
    for (const [id, children] of Object.entries(state.composition?.compositeMembers ?? {}))
      if (children.some((child) => issues.has(child))) nodes[id].status = 'Child error';
    return { revision: state.revision, nodes };
  }
  function tick(now, maximumDelta) {
    if (disposed) return;
    if (pendingState) update(pendingState);
    advancing = true;
    try {
      execution.step(now, maximumDelta);
    } finally {
      advancing = false;
    }
    if (now - lastObservation >= 100) {
      lastObservation = now;
      lastPublished = inspect();
      onObservation(lastPublished);
    }
  }
  function retainImages() {
    const paths = new Set();
    if (visible || previewNodes.length)
      for (const definition of state.visualDefinitions ?? [])
        for (const path of definition.implementation.frames ?? []) paths.add(path);
    images.retain(paths);
  }
  const clock = createPresentationClock(tick, { hostDrivenHidden });
  return {
    inspect,
    setPreviewNodes(ids) {
      const signature = JSON.stringify(ids);
      if (signature === previewSignature) return;
      previewSignature = signature;
      previewNodes = ids;
      retainImages();
      execution.setPreviewNodes(ids);
      clock.setObserved(ids.length > 0);
      // Changing the visible set must not publish a half-advanced document.
      // Drop hidden thumbnails from the last coherent observation immediately;
      // newly requested values arrive after the next accepted execution frame.
      if (lastPublished) {
        lastPublished = {
          ...lastPublished,
          nodes: Object.fromEntries(
            Object.entries(lastPublished.nodes).map(([id, node]) => {
              if (ids.includes(Number(id))) return [id, node];
              const { preview, ...summary } = node;
              return [id, summary];
            }),
          ),
        };
        onObservation(lastPublished);
      }
    },
    setVisible(value) {
      visible = value;
      clock.setVisible(value);
      retainImages();
    },
    advanceHidden: clock.advanceHidden,
    dispose() {
      disposed = true;
      clock.dispose();
      unsubscribe();
      controls.dispose();
      images.dispose();
      for (const entry of entries.values()) {
        retire(entry);
        if (entry.previous) retire(entry.previous);
      }
      entries.clear();
      layer.remove();
    },
  };
}
