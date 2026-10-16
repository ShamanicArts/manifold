import { resourceValue } from './composition-runtime.js';

/** An object's lifetime follows its resource inputs. Scalar updates preserve it.
 * Candidate creation precedes retirement; failure leaves an explicit last-good
 * rendering, with no stale outputs published by the executor.
 */
export function mountSceneObject(factory, api, resourcePorts, outputs = [], onAdopt = () => {}) {
  let instance = null,
    parents = [],
    failedPreparation = null;
  const retire = () => {
    const previous = instance;
    instance = null;
    parents = [];
    failedPreparation = null;
    previous?.dispose();
  };
  return {
    update(frame) {
      const next = resourcePorts.map((name) => api.input(name));
      if (next.some((handle) => !resourceValue(handle))) {
        retire();
        failedPreparation = null;
        onAdopt();
        return;
      }
      if (!instance || next.some((handle, i) => handle !== parents[i])) {
        if (failedPreparation && next.every((handle, i) => handle === failedPreparation.parents[i]))
          throw failedPreparation.error;
        let candidate;
        // Creation is deferred until resource inputs exist. Prove the first
        // update too before retiring either a previous resource or live module.
        try {
          candidate = factory.create(api);
          if (!candidate || candidate.then || typeof candidate.dispose !== 'function') {
            if (candidate?.then)
              Promise.resolve(candidate)
                .then((value) => value?.dispose?.())
                .catch(() => {});
            throw new Error('Scene create(api) must return a synchronous disposable object');
          }
          candidate.update?.(frame);
        } catch (error) {
          // A bad constructor must not allocate another failed scene on every
          // frame. A source edit creates a fresh wrapper; reconnecting retries
          // with fresh resources. Errors from already-running updates still
          // use the executor's normal per-frame recovery.
          failedPreparation = { parents: next, error };
          if (candidate && !candidate.then) candidate.dispose?.();
          throw error;
        }
        failedPreparation = null;
        retire();
        instance = candidate;
        parents = next;
        onAdopt();
        return;
      }
      instance.update?.(frame);
    },
    outputs: () =>
      instance?.outputs?.() ?? Object.fromEntries(outputs.map((port) => [port.name, null])),
    dispose: retire,
  };
}
