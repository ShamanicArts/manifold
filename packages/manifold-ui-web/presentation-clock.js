/** One clock for the accepted presentation, including an unopened native face.
 * Hidden surfaces advance only while someone is observing their graph.
 */
export function createPresentationClock(
  step,
  {
    animation = (callback) => requestAnimationFrame(callback),
    cancelAnimation = (handle) => cancelAnimationFrame(handle),
    timer = (callback) => setTimeout(() => callback(performance.now()), 100),
    cancelTimer = (handle) => clearTimeout(handle),
    hostDrivenHidden = false,
  } = {},
) {
  let visible = true,
    observed = false,
    disposed = false,
    pending = null,
    lastHidden = -Infinity;
  function cancel() {
    if (pending) (pending.animation ? cancelAnimation : cancelTimer)(pending.handle);
    pending = null;
  }
  function schedule() {
    if (disposed || (!visible && (!observed || hostDrivenHidden)) || pending) return;
    const animate = visible;
    pending = {
      animation: animate,
      handle: (animate ? animation : timer)((now) => {
        pending = null;
        step(now, animate ? 0.05 : 0.25);
        schedule();
      }),
    };
  }
  function update(nextVisible, nextObserved) {
    if (visible === nextVisible && observed === nextObserved) return;
    visible = nextVisible;
    observed = nextObserved;
    cancel();
    schedule();
  }
  schedule();
  return {
    advanceHidden(now) {
      if (hostDrivenHidden && !visible && observed && !disposed && now - lastHidden >= 100) {
        lastHidden = now;
        step(now, 0.25);
      }
    },
    setVisible: (value) => update(value, observed),
    setObserved: (value) => update(visible, value),
    dispose() {
      disposed = true;
      cancel();
    },
  };
}
