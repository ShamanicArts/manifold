import { mountKeyboard } from './keyboard.js';
import { mountCompactSlider } from './compact-slider.js';
import { mountFilterResponse } from './filter.js';

/** Retained kit projection of the same component/endpoint model used by egui. */
export function mountProjectView(
  element,
  runtime,
  {
    request = (command) => runtime.request(command),
    onError = (error) => console.error(error),
  } = {},
) {
  let signature = '',
    bindings = [],
    items = new Map(),
    groupElements = new Map();
  element.classList.add('manifold-project-view');
  const responses = document.createElement('div'),
    controls = document.createElement('div');
  responses.className = 'manifold-responses';
  controls.className = 'manifold-controls';
  element.replaceChildren(responses, controls);
  // Keep unchanged controls mounted, including pointer capture and keyboard focus.
  const place = (parent, children) => {
    children.forEach((child, index) => {
      if (parent.children[index] !== child)
        parent.insertBefore(child, parent.children[index] ?? null);
    });
    while (parent.children.length > children.length) parent.lastElementChild.remove();
  };
  const schema = ({ activeNotes, points, color, style, label, ...component }) =>
    JSON.stringify(component);
  const send = (path, value, operation = 'parameter.set') =>
    Promise.resolve(request({ operation, path, value, origin: 'retained' })).catch((error) => {
      onError(error);
      display(runtime.snapshot());
    });
  const value = (state, path) => {
    const control = state.graph.controls?.find((e) => e.path === path);
    if (control) return control.value;
    const endpoint = (state.graph.endpoints ?? []).find((e) => e.path === path);
    return state.graph.signal.initialParameters.find(
      (p) => p.nodeId === endpoint?.nodeId && p.id === endpoint?.id,
    )?.value;
  };
  function display(state) {
    const components = runtime.presentation?.().components ?? state.view;
    state = { ...state, view: components };
    const next = JSON.stringify([
      state.view.map(schema),
      state.graph.endpoints,
      (state.graph.controls ?? []).map(({ value, ...schema }) => schema),
    ]);
    if (next !== signature) {
      const previous = items,
        nextItems = new Map(),
        responseChildren = [],
        controlChildren = [],
        desired = new Map();
      const parameterSchemaChanged =
        !signature ||
        JSON.stringify(JSON.parse(signature).slice(1)) !==
          JSON.stringify(JSON.parse(next).slice(1));
      bindings = [];
      signature = next;
      element.classList.toggle(
        'has-response',
        state.view.some((c) => c.type === 'filter-response'),
      );
      const groups = new Map();
      controls.classList.toggle(
        'has-groups',
        state.view.some((c) => c.group),
      );
      for (const component of state.view) {
        let container = controls;
        if (component.group) {
          if (!groups.has(component.group)) {
            let entry = groupElements.get(component.group);
            if (!entry) {
              const group = document.createElement('section'),
                heading = document.createElement('h3');
              heading.textContent = component.group;
              entry = { group, heading };
              groupElements.set(component.group, entry);
            }
            const { group, heading } = entry;
            group.classList.toggle(
              'curves-only',
              state.view
                .filter((c) => c.group === component.group)
                .every((c) => c.type === 'curve'),
            );
            groups.set(component.group, group);
            controlChildren.push(group);
            desired.set(group, [heading]);
            bindings.push({
              sync: (state) => {
                heading.style.color =
                  state.view.find((c) => c.group === component.group)?.style?.accent ?? '';
              },
            });
          }
          container = groups.get(component.group);
        }
        const prior = previous.get(component.id),
          key = schema(component);
        const children =
          component.type === 'filter-response'
            ? responseChildren
            : component.group
              ? desired.get(container)
              : controlChildren;
        if (
          prior &&
          prior.schema === key &&
          !(parameterSchemaChanged && ['parameter', 'control'].includes(component.type))
        ) {
          nextItems.set(component.id, prior);
          bindings.push(...prior.bindings);
          children.push(prior.element);
          continue;
        }
        prior?.bindings.forEach((binding) => binding.destroy?.());
        const firstBinding = bindings.length;
        let node;
        if (component.type === 'filter-response') {
          const canvas = document.createElement('canvas');
          canvas.className = 'manifold-filter-response';
          node = canvas;
          const base = component.base ?? '/plugin/params';
          const response = mountFilterResponse(canvas, (values) => {
            send(`${base}/cutoff`, values.cutoff);
            send(`${base}/resonance`, values.resonance);
          });
          bindings.push({
            paint: response.paint,
            destroy: response.destroy,
            sync: (state) =>
              response.sync({
                mode: value(state, `${base}/type`),
                cutoff: value(state, `${base}/cutoff`),
                resonance: value(state, `${base}/resonance`),
              }),
          });
        } else if (['parameter', 'control'].includes(component.type)) {
          const endpoint = (
            component.type === 'control' ? state.graph.controls : state.graph.endpoints
          ).find((e) => e.path === component.path);
          const operation = component.type === 'control' ? 'control.set' : 'parameter.set';
          if (component.choices?.length) {
            const select = document.createElement('select');
            select.dataset.parameterPath = component.path;
            select.setAttribute('aria-label', component.label ?? component.path);
            component.choices.forEach((choice, index) => {
              const option = document.createElement('option');
              option.value = String(index);
              option.textContent = choice;
              option.disabled = component.disabledChoices?.includes(index) ?? false;
              select.append(option);
            });
            select.onchange = () => send(component.path, Number(select.value), operation);
            node = select;
            bindings.push({
              sync: (state) => {
                const current = state.view.find((c) => c.id === component.id);
                select.value = String(value(state, component.path));
                [...select.options].forEach((option,index)=>{option.disabled=current.disabledChoices?.includes(index) ?? false;});
                select.setAttribute('aria-label', current.label ?? current.path);
                select.style.color = current.style?.text ?? '';
                select.style.backgroundColor = current.style?.background ?? '';
                select.style.borderColor = current.style?.accent ?? '';
              },
            });
          } else {
            const row = document.createElement('div');
            row.className = 'manifold-slider';
            row.dataset.parameterPath = component.path;
            node = row;
            const slider = mountCompactSlider(row, {
              label: component.label ?? component.path,
              min: endpoint.min,
              max: endpoint.max,
              value: endpoint.default,
              step: endpoint.discrete || endpoint.max > 100 ? 1 : 0.01,
              style: { colour: '#a78bfa', bg: '#1e1b33' },
            });
            slider.onChange((next) => send(component.path, next, operation));
            bindings.push({
              paint: slider.paint,
              sync: (state) => {
                const current = state.view.find((c) => c.id === component.id);
                slider.setLabel(current.label ?? current.path);
                slider.setStyle({
                  colour: current.style?.accent ?? '#a78bfa',
                  bg: current.style?.background ?? '#1e1b33',
                  text: current.style?.text,
                });
                slider.setValue(value(state, component.path));
              },
            });
          }
        } else if (component.type === 'curve') {
          const canvas = document.createElement('canvas');
          canvas.dataset.componentId = component.id;
          canvas.className = 'manifold-curve';
          canvas.setAttribute('role', 'img');
          node = canvas;
          let current = component;
          const paint = () => {
            const ratio = window.devicePixelRatio || 1,
              w = canvas.clientWidth,
              h = current.height ?? 132;
            canvas.style.height = h + 'px';
            canvas.width = Math.max(1, w * ratio);
            canvas.height = h * ratio;
            const pen = canvas.getContext('2d');
            pen.scale(ratio, ratio);
            pen.fillStyle = current.style?.background ?? '#0d1420';
            pen.fillRect(0, 0, w, h);
            pen.strokeStyle = '#1a1a3a';
            pen.lineWidth = 1;
            for (let i = 1; i <= 3; i++) {
              pen.beginPath();
              pen.moveTo(0, (h * i) / 4);
              pen.lineTo(w, (h * i) / 4);
              pen.stroke();
            }
            pen.strokeStyle = current.color ?? current.style?.accent ?? '#a78bfa';
            pen.beginPath();
            current.points.forEach(([x, y], i) => {
              i ? pen.lineTo(x * w, y * h) : pen.moveTo(x * w, y * h);
            });
            pen.stroke();
            pen.fillStyle = current.style?.text ?? pen.strokeStyle;
            pen.font = '11px system-ui';
            pen.fillText(current.label ?? '', 4, 14);
          };
          bindings.push({
            paint,
            sync: (state) => {
              current = state.view.find((c) => c.id === component.id);
              canvas.setAttribute('aria-label', current.label);
            },
          });
        } else if (component.type === 'keyboard') {
          const keyboard = document.createElement('div');
          // The keyboard owns sibling panic/help controls. Give it a parent
          // before mounting, and keep that content inside this component.
          node = document.createElement('div');
          node.append(keyboard);
          const binding = mountKeyboard(keyboard, component, request, onError);
          bindings.push({
            destroy: binding.destroy,
            sync: (state) =>
              binding.sync(state.view.find((c) => c.id === component.id)?.activeNotes ?? []),
          });
        } else if (component.type === 'label') {
          const label = document.createElement('span');
          label.dataset.componentId = component.id;
          node = label;
          bindings.push({
            sync: (state) => {
              const current = state.view.find((c) => c.id === component.id);
              label.textContent = current.label ?? '';
              label.style.color = current.style?.text ?? current.style?.accent ?? '';
              label.style.backgroundColor = current.style?.background ?? '';
              label.style.fontSize = current.fontSize ? current.fontSize + 'px' : '';
            },
          });
        }
        children.push(node);
        nextItems.set(component.id, {
          schema: key,
          element: node,
          bindings: bindings.slice(firstBinding),
        });
      }
      for (const [id, item] of previous)
        if (!nextItems.has(id)) item.bindings.forEach((binding) => binding.destroy?.());
      for (const [group, children] of desired) place(group, children);
      place(responses, responseChildren);
      place(controls, controlChildren);
      for (const name of groupElements.keys()) if (!groups.has(name)) groupElements.delete(name);
      items = nextItems;
    }
    for (const binding of bindings) {
      binding.sync(state);
      binding.paint?.();
    }
  }
  const unsubscribe = runtime.subscribe(display);
  const observer = new ResizeObserver(() => {
    for (const binding of bindings) binding.paint?.();
  });
  observer.observe(element);
  display(runtime.snapshot());
  return {
    paint: () => display(runtime.snapshot()),
    destroy() {
      unsubscribe();
      observer.disconnect();
      for (const binding of bindings) binding.destroy?.();
      element.replaceChildren();
    },
  };
}
