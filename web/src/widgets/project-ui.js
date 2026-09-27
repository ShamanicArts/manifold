// A small browser renderer for the authored Manifold widget vocabulary.
// Project descriptors carry widget identity, geometry, and colors; behaviors
// bind to returned elements. No Lua runs in the browser.
import { mountCompactSlider } from "./compact-slider.js";
import { mountDropdown } from "./dropdown.js";

function makeWidget(spec, widgets, root) {
  const element = document.createElement(
    spec.type === "Label"
      ? "span"
      : spec.type === "Canvas"
      ? "div"
      : spec.type === "PaginationDots"
      ? "div"
      : "div",
  );
  element.className = `project-widget project-${spec.type.toLowerCase()}`;
  element.dataset.widget = spec.id;
  element.id = `widget-${spec.id}`;
  if (spec.style?.bg) element.style.setProperty("--widget-bg", spec.style.bg);
  if (spec.style?.border) {
    element.style.setProperty("--widget-border", spec.style.border);
  }
  if (spec.style?.colour) {
    element.style.setProperty("--widget-color", spec.style.colour);
  }
  if (spec.style?.fontSize) element.style.fontSize = `${spec.style.fontSize}px`;
  if (spec.type === "Label") element.textContent = spec.text ?? "";
  if (spec.type === "Canvas") {
    element.tabIndex = 0;
    element.setAttribute("role", "group");
    element.setAttribute(
      "aria-label",
      spec.id === "xy_pad" ? "Effect XY pad" : "Filter response graph",
    );
    const canvas = document.createElement("canvas");
    element.append(canvas);
  }
  if (spec.type === "PaginationDots") {
    for (const [index, name] of ["graph", "xy"].entries()) {
      const dot = document.createElement("button");
      dot.type = "button";
      dot.className = "project-dot";
      dot.dataset.mode = name;
      dot.setAttribute("aria-label", `${name} visual`);
      dot.textContent = "•";
      element.append(dot);
    }
  }
  const control = spec.type === "Slider"
    ? mountCompactSlider(element, spec)
    : spec.type === "Dropdown"
      ? mountDropdown(element, spec, root)
      : undefined;
  widgets.set(spec.id, { spec, element, control });
  for (const child of spec.children ?? []) {
    element.append(makeWidget(child, widgets, root));
  }
  return element;
}

export function mountProjectUi(container, descriptor) {
  const widgets = new Map();
  container.replaceChildren();
  container.append(makeWidget(descriptor.module, widgets, container));
  function layout(mode) {
    for (const { spec, element, control } of widgets.values()) {
      const bounds = spec.bounds?.[mode];
      element.hidden = !bounds;
      if (!bounds) continue;
      const [x, y, width, height] = bounds;
      Object.assign(element.style, {
        left: `${x}px`,
        top: `${y}px`,
        width: `${width}px`,
        height: `${height}px`,
      });
      control?.paint();
    }
  }
  layout("split");
  return {
    widgets,
    layout,
    element: (id) => widgets.get(id)?.element,
    spec: (id) => widgets.get(id)?.spec,
    control: (id) => widgets.get(id)?.control,
  };
}
