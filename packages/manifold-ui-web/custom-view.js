import { presentationControls } from './presentation-controls.js';
import { evaluateSource } from '@manifold/author/project-source';
import { validateWebView } from '@manifold/author/web-view';
import { projectFileDataUrl } from '@manifold/author/project-files';

/** Mount authored web code over the existing project; modules are host supplied. */
export async function mountCustomView(element, definition, runtime, {
  modules = {}, request = command => runtime.request(command),
  analysis = () => null, onError = error => console.error(error),
} = {}) {
  let view = validateWebView(definition);
  const resolved = {};
  for (const [name, version] of Object.entries(view.dependencies)) {
    const entry = modules[name];
    if (!entry || entry.version !== version) throw new Error(`Unavailable view dependency: ${name}@${version}`);
    resolved[name] = await entry.load();
  }
  const factory = evaluateSource(view.source, resolved, {}, (code, message) => { throw new Error(message); });
  if (typeof factory?.mount !== 'function') throw new Error('A custom view factory must return mount(element, api)');
  const controls = presentationControls(runtime, command => request({ ...command, origin: 'custom-view' }));
  const api = Object.freeze({
    snapshot: () => runtime.snapshot(), analysis,
    get layout() { return view.layout ?? []; }, subscribe: listener => runtime.subscribe(listener),
    value: controls.value, set: controls.set, setBatch: controls.setBatch,
    request: command => request({ ...command, origin: 'custom-view' }),
    assetUrl: async path => projectFileDataUrl(await request({operation:'file.read',path,origin:'custom-view'})),
  });
  let instance, unsubscribe, disposed = false;
  try {
    element.style.height = `${view.height}px`;
    instance = factory.mount(element, api);
    if (!instance || typeof instance.dispose !== 'function' || instance.then)
      throw new Error('mount must return a synchronous instance with dispose()');
    const update = state => { try { instance.update?.(state); } catch (error) { onError(error); } };
    unsubscribe = runtime.subscribe(update);
    update(runtime.snapshot());
  } catch (error) {
    controls.dispose();
    instance?.dispose?.();
    element.replaceChildren();
    throw error;
  }
  return {
    updateDefinition(definition) {
      const next = validateWebView(definition);
      if (disposed || typeof instance.updateLayout !== 'function' || next.source !== view.source
        || JSON.stringify(next.dependencies) !== JSON.stringify(view.dependencies) || next.role !== view.role) return false;
      view = next;
      element.style.height = `${view.height}px`;
      instance.updateLayout(runtime.snapshot());
      return true;
    },
    dispose() {
    if (disposed) return;
    disposed = true;
    controls.dispose();
    unsubscribe?.();
    instance.dispose();
    element.replaceChildren();
  } };
}
