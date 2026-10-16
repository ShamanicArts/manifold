import { mountCompactSlider } from './compact-slider.js';
import { WORKSPACE_TYPES } from '@manifold/author/workspace-types';

/** Keep real, accessible kit controls on a renderer's projected physical panel.
 * Corners are CSS pixels in clockwise order: top-left, top-right, bottom-right,
 * bottom-left. The renderer owns camera/projection; CSS owns pointer hit testing.
 */
export function placeProjectedPanel(element, corners, {width, height}) {
  if (corners.length !== 4 || corners.some(point => point.length !== 2 || point.some(value => !Number.isFinite(value)))
    || !(width > 0 && height > 0)) throw new TypeError('Expected four finite projected panel corners and positive dimensions');
  const [[x0,y0],[x1,y1],[x2,y2],[x3,y3]] = corners;
  const dx1=x1-x2,dx2=x3-x2,dx3=x0-x1+x2-x3,dy1=y1-y2,dy2=y3-y2,dy3=y0-y1+y2-y3;
  const denominator=dx1*dy2-dx2*dy1;
  if (Math.abs(denominator)<1e-7) { element.hidden=true; return false; }
  const g=(dx3*dy2-dx2*dy3)/denominator,h=(dx1*dy3-dx3*dy1)/denominator;
  const a=x1-x0+g*x1,b=x3-x0+h*x3,d=y1-y0+g*y1,e=y3-y0+h*y3;
  element.hidden=false; element.style.transformOrigin='0 0';
  element.style.transform=`matrix3d(${[a/width,d/width,0,g/width,b/height,e/height,0,h/height,0,0,1,0,x0,y0,0,1].join(',')})`;
  return true;
}

/** Place the existing Manifold kit over a project's named, accepted controls.
 * Layout is presentation data; this module owns no audio or parameter state. */
export function mountControlPanel(element, api, { accent = '#dfae77', background = '#302b26', text = '#eee2d5', height = 32, fontSize, showChoiceLabels = false, scales = {}, formatters = {}, variant = 'default' } = {}) {
  element.classList.add('manifold-face-panel');
  element.style.cssText = 'position:relative;min-height:120px';
  const bindings = [];
  for (const item of api.layout) {
    const placement = variant === 'compact' && item.compact ? item.compact : item;
    const state = api.snapshot();
    const schema = state.graph.controls?.find(c => c.path === item.path)
      ?? state.graph.endpoints.find(c => c.path === item.path);
    if (!schema) throw new Error(`Unknown presentation control: ${item.path}`);
    const component = (state.view ?? state.components ?? []).find(c => c.path === item.path);
    const palette = { accent:item.accent ?? component?.style?.accent ?? accent,
      background:component?.style?.background ?? background, text:component?.style?.text ?? text };
    const node = document.createElement('div');
    node.className = 'manifold-face-control';
    node.dataset.layoutPath = item.path;
    node.dataset.componentId = item.id ?? item.path;
    node.dataset.layoutVariant = placement === item ? 'default' : 'compact';
    node.style.cssText = `position:absolute;left:${placement.x}%;top:${placement.y}%;width:${placement.width}%;height:${height}px`;
    element.append(node);
    let control;
    const label = item.label ?? component?.label ?? schema.label ?? item.path;
    if (component?.choices?.length) {
      const select = document.createElement('select');
      select.setAttribute('aria-label', label);
      if (showChoiceLabels) {
        const caption = document.createElement('label');
        const selectId = 'manifold-choice-' + crypto.randomUUID();
        caption.htmlFor = selectId; select.id = selectId;
        caption.textContent = label; caption.style.cssText = `display:block;font:10px/11px system-ui;color:${text};margin:0 0 3px 4px`;
        node.append(caption);
      }
      select.style.cssText = `width:100%;height:${showChoiceLabels ? Math.max(20,height-14) : height}px;font:12px/normal system-ui;color:${palette.text};background:${palette.background};border:1px solid ${palette.accent};border-radius:4px;padding:2px 6px`;
      component.choices.forEach((choice, index) => {
        const option = new Option(choice, component.choiceValues?.[index] ?? index);
        option.disabled = component.disabledChoices?.includes(index) ?? false;
        select.append(option);
      });
      select.onchange = () => api.set(item.path, Number(select.value)).catch(console.error);
      node.append(select);
      control = { setValue: value => {select.value = String(value);}, paint() {} };
    } else {
      const type = state.graph.signal.nodes.find(n=>n.id===schema.nodeId)?.type;
      const discrete = schema.discrete ?? WORKSPACE_TYPES[type]?.parameters.find(p=>p.id===schema.id)?.discrete;
      control = mountCompactSlider(node, { label, min:schema.min, max:schema.max,
        value:schema.default, step:discrete || schema.max > 100 ? 1 : 0.001,
        fitLabel:true,
        fontSize,scale:scales[item.path],format:formatters[item.path],
        style:{colour:palette.accent,bg:palette.background,text:palette.text} });
      control.onChange(value => api.set(item.path, value).catch(console.error));
    }
    bindings.push({path:item.path,control});
  }
  const update = () => bindings.forEach(({path,control}) => control.setValue(api.value(path)));
  const unsubscribe = api.subscribe(update);
  const resize = new ResizeObserver(() => bindings.forEach(({control}) => control.paint()));
  resize.observe(element); update();
  return { dispose() { unsubscribe(); resize.disconnect(); element.replaceChildren(); } };
}
