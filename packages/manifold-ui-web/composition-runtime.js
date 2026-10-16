import {
  isImageType,
  imageValue,
  evaluateVisualPrimitive,
} from '@manifold/author/visual-primitives';
import { createNodePreviews } from './node-previews.js';
import { compositionOrder } from '@manifold/author/composition';
import { isResourceType, projectParameterValue } from '@manifold/author/presentation-types';

const resources = new WeakMap();
export function presentationResource(type, value) {
  if (!isResourceType(type) || !value || typeof value !== 'object')
    throw new TypeError('A presentation resource needs a renderer type and object');
  const handle = Object.freeze({ type });
  resources.set(handle, value);
  return handle;
}
export const resourceValue = (handle) => resources.get(handle) ?? null;

function outputValue(type, value) {
  if (value === null) return { value: null, text: 'No value' };
  if (isImageType(type)) {
    const image = imageValue(type, value);
    return {
      value: image,
      text: type === 'image2d' ? image.asset : `${image.frames.length} image frames`,
    };
  }
  if (type === 'scalar' && Number.isFinite(value)) return { value, text: value.toFixed(4) };
  if (
    ['vector2', 'vector3'].includes(type) &&
    Array.isArray(value) &&
    value.length === Number(type.slice(-1)) &&
    value.every(Number.isFinite)
  )
    return { value: Object.freeze([...value]), text: value.map((n) => n.toFixed(3)).join(', ') };
  if (isResourceType(type) && resources.has(value) && value.type === type)
    return { value, text: type.slice('resource:'.length) };
  if (
    type === 'field2d' &&
    value &&
    Number.isInteger(value.width) &&
    Number.isInteger(value.height) &&
    value.width >= 2 &&
    value.height >= 2 &&
    Array.isArray(value.values) &&
    value.values.length === value.width * value.height
  ) {
    const values = Object.freeze([...value.values]);
    if (!values.every(Number.isFinite))
      throw new Error('Invalid field2d output: every sample must be finite');
    let min = Infinity,
      max = -Infinity;
    for (const sample of values) {
      min = Math.min(min, sample);
      max = Math.max(max, sample);
    }
    return {
      value: Object.freeze({ width: value.width, height: value.height, values }),
      text: `${value.width} × ${value.height} · ${min.toFixed(3)} … ${max.toFixed(3)}`,
    };
  }
  throw new Error(
    `Invalid ${type} output${type === 'field2d' ? ': expected a finite grid' : ''}`,
  );
}

/** Presentation-only execution. No DOM, timers, project mutation or audio ownership.
 * The host advances one dependency-ordered frame, then updates its surfaces.
 */
export function createPresentationGraph({
  analysis = () => null,
  onIssues = () => {},
  imagePreview = () => null,
} = {}) {
  let state,
    order = [],
    definitions = new Map(),
    previousTime = null,
    frameAnalysis = null,
    advancing = false,
    pendingState = null;
  const previews = createNodePreviews({ imagePreview });
  const instances = new Map(),
    outputs = new Map(),
    summaries = new Map(),
    waiting = new Map(),
    issues = new Map();
  let issueSignature = '';
  const report = () => {
    const next = JSON.stringify([...issues.values()]);
    if (next !== issueSignature) {
      issueSignature = next;
      onIssues([...issues.values()]);
    }
  };
  function clearOutput(id) {
    previews.remove(id);
    outputs.delete(id);
    summaries.delete(id);
  }
  function fail(id, error) {
    const node = state.composition.nodes.find((node) => node.id === id);
    clearOutput(id);
    issues.set(id, {
      id,
      label: node?.label ?? String(id),
      message: String(error?.message ?? error),
    });
    report();
  }
  function input(id, name) {
    const edge = state?.composition.connections.find(
      (edge) => edge.to === id && edge.input === name,
    );
    if (!edge) return null;
    return state.composition.nodes.some((node) => node.id === edge.from)
      ? (outputs.get(edge.from)?.[edge.output] ?? null)
      : frameAnalysis;
  }
  function pendingResource(id, definition) {
    if (definition.implementation.kind !== 'scene-object') return null;
    let pending = null;
    for (const port of definition.inputs ?? []) {
      if (!isResourceType(port.type)) continue;
      const edge = state.composition.connections.find(
        (edge) => edge.to === id && edge.input === port.name,
      );
      // Any explicit disconnection retires the object, even if another input
      // is simultaneously waiting on a failed/preparing producer.
      if (!edge || (outputs.has(edge.from) && input(id, port.name) === null)) return null;
      if (!outputs.has(edge.from)) pending ??= edge;
    }
    return pending;
  }
  function configure(next) {
    // A gesture can synchronously publish a project snapshot from update().
    // Finish the current frame against one document before accepting that state.
    if (advancing) {
      pendingState = next;
      return;
    }
    pendingState = null;
    state = {
      ...next,
      composition: next.presentationExecution ??
        next.composition ?? { version: 1, nodes: [], connections: [] },
    };
    definitions = new Map(
      (next.visualDefinitions ?? []).map((definition) => [definition.id, definition]),
    );
    order = compositionOrder(state.composition);
    previews.configure(state, definitions);
    // A changed document/connection must never expose old downstream values.
    outputs.clear();
    summaries.clear();
    waiting.clear();
    for (const id of instances.keys()) if (!order.includes(id)) instances.delete(id);
    for (const id of issues.keys()) if (!order.includes(id)) issues.delete(id);
    report();
  }
  return {
    configure,
    setPreviewNodes: (ids) => previews.setNodes(ids),
    attach(id, instance) {
      instances.set(id, instance);
      waiting.delete(id);
      issues.delete(id);
      report();
    },
    detach(id) {
      instances.delete(id);
      waiting.delete(id);
      clearOutput(id);
    },
    input,
    parameter(id, name) {
      return state?.composition.nodes.find((node) => node.id === id)?.parameters[name];
    },
    step(now, maximumDelta = 0.05) {
      if (pendingState) configure(pendingState);
      advancing = true;
      try {
        const delta =
          previousTime === null
            ? 0
            : Math.max(0, Math.min(maximumDelta, (now - previousTime) / 1000));
        previousTime = now;
        const value = analysis();
        frameAnalysis = value
          ? Object.freeze({
              rms: Number.isFinite(value.rms) ? value.rms : 0,
              peak: Number.isFinite(value.peak) ? value.peak : 0,
              peakHz: Number.isFinite(value.peakHz) ? value.peakHz : 0,
              sampleRate: Number.isFinite(value.sampleRate) ? value.sampleRate : 0,
              observedAt: now,
              bands: Object.freeze(
                Array.from(value.bands ?? [])
                  .slice(0, 32)
                  .map((value) => (Number.isFinite(value) ? value : 0)),
              ),
            })
          : null;
        const frame = Object.freeze({ time: now / 1000, delta });
        for (const id of order) {
          const node = state.composition.nodes.find((node) => node.id === id),
            definition = definitions.get(node.definition);
          const instance = instances.get(id);
          const primitive = definition.implementation.kind === 'visual-primitive';
          if (!instance && !primitive && definition.implementation.kind !== 'parameter') continue;
          // A connected producer may be preparing or failed. Preserve the
          // dependent object's lifetime until it publishes again. A removed
          // wire or a successfully published null still means disconnect.
          const unavailable = pendingResource(id, definition);
          if (unavailable) {
            const source = state.composition.nodes.find((node) => node.id === unavailable.from);
            waiting.set(id, `Waiting for ${source?.label ?? unavailable.from}`);
            clearOutput(id);
            continue;
          }
          waiting.delete(id);
          try {
            const scripted = definition.implementation.kind === 'presentation-script';
            if (!scripted && instance) instance.update?.(frame);
            if (scripted || primitive || definition.outputs?.length) {
              const result = primitive
                ? evaluateVisualPrimitive(
                    definition,
                    (name) => input(id, name),
                    (name) => node.parameters[name],
                  )
                : definition.implementation.kind === 'parameter'
                  ? {
                      value:
                        projectParameterValue(state.graph, definition.implementation.path) ?? null,
                    }
                  : scripted
                    ? instance.evaluate(frame)
                    : instance.outputs();
              if (typeof result?.then === 'function') Promise.resolve(result).catch(() => {});
              if (
                !result ||
                typeof result !== 'object' ||
                result.then ||
                Array.isArray(result) ||
                Object.keys(result).some(
                  (name) => !definition.outputs.some((port) => port.name === name),
                )
              )
                throw new Error('Return the declared named presentation outputs synchronously');
              const values = {},
                text = {};
              for (const port of definition.outputs) {
                const output = outputValue(port.type, result[port.name]);
                values[port.name] = output.value;
                text[port.name] = output.text;
              }
              outputs.set(id, Object.freeze(values));
              summaries.set(id, text);
            }
            if (issues.delete(id)) report();
          } catch (error) {
            fail(id, error);
          }
        }
        // Draw only after all objects and their behaviours have advanced. A shared
        // scene has one render boundary, regardless of how many objects it holds.
        for (const id of order) {
          if (issues.has(id) || waiting.has(id)) continue;
          try {
            instances.get(id)?.render?.(frame);
          } catch (error) {
            fail(id, error);
          }
        }
        previews.sample(now, outputs);
        return frame;
      } finally {
        advancing = false;
      }
    },
    inspect() {
      const result = Object.fromEntries(
        (state?.composition.nodes ?? []).map((node) => [
          node.id,
          {
            status: waiting.has(node.id)
              ? waiting.get(node.id)
              : issues.has(node.id)
                ? issues.get(node.id).message
                : instances.has(node.id) ||
                    ['parameter', 'visual-primitive'].includes(
                      definitions.get(node.definition)?.implementation.kind,
                    )
                  ? 'Live'
                  : 'Preparing',
            outputs: { ...summaries.get(node.id) },
            ...(previews.get(node.id) ? { preview: previews.get(node.id) } : {}),
          },
        ]),
      );
      for (const [id, ports] of Object.entries(state?.composition.compositeOutputs ?? {})) {
        const descendants = state.composition.compositeMembers[id] ?? [];
        result[id] = {
          ...(previews.get(Number(id)) ? { preview: previews.get(Number(id)) } : {}),
          status: descendants.some((id) => issues.has(id))
            ? 'Child error'
            : descendants.some((id) => waiting.has(id))
              ? 'Waiting for resources'
              : descendants.some(
                    (id) =>
                      !instances.has(id) &&
                      definitions.get(
                        state.composition.nodes.find((node) => node.id === id)?.definition,
                      )?.implementation.kind !== 'parameter' &&
                      definitions.get(
                        state.composition.nodes.find((node) => node.id === id)?.definition,
                      )?.implementation.kind !== 'visual-primitive',
                  )
                ? 'Preparing'
                : 'Live',
          outputs: Object.fromEntries(
            Object.entries(ports).map(([name, endpoint]) => [
              name,
              endpoint
                ? (summaries.get(endpoint.from)?.[endpoint.output] ?? 'No value')
                : 'No value',
            ]),
          ),
        };
      }
      return result;
    },
  };
}
