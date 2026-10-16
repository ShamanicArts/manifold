import { parse } from 'acorn';
import { replacePresentationLayout } from './web-view.js';

// Supported creator declarations are literal data, never evaluated editor code.
function literal(node) {
  if (node.type === 'Literal') return node.value;
  if (node.type === 'UnaryExpression' && node.operator === '-') return -literal(node.argument);
  if (node.type === 'ArrayExpression') return node.elements.map(literal);
  if (node.type === 'ObjectExpression') return Object.fromEntries(node.properties.map(property => {
    if (property.type !== 'Property' || property.computed || property.method || property.kind !== 'init')
      throw new Error('Visual editing requires literal declarations');
    return [property.key.name ?? property.key.value, literal(property.value)];
  }));
  throw new Error('Visual editing requires literal declarations; edit this expression in source');
}
export function readStudioParameters(source) {
  const tree = parse(source, { ecmaVersion: 2022, sourceType: 'module' });
  const definition = tree.body.flatMap(node => node.declarations ?? []).find(node => node.id.name === 'studioParameters');
  if (!definition?.init) throw new Error('This project needs a studioParameters declaration for visual exposure');
  return { definition, values: literal(definition.init) };
}
export function exposeStudioParameter(source, definition) {
  const { definition: declaration, values } = readStudioParameters(source);
  if (values.some(value => value.path === definition.path)) throw new Error('This parameter path already exists');
  const {instance,parameter,path,label,min,max,default:initial,choices,choiceValues} = definition;
  const named = {instance,parameter,path,label,min,max,default:initial,...(choices?.length ? {choices,...(choiceValues ? {choiceValues} : {})} : {})};
  return source.slice(0, declaration.init.start) + JSON.stringify([...values, named], null, 2)
    + source.slice(declaration.init.end);
}
export function editStudioLayout(source, layout, command) {
  let next;
  if (command.operation === 'presentation.insert') {
    if (layout.some(item => item.path === command.path)) throw new Error('This parameter is already placed in the face');
    next = [...layout, { id: command.id ?? command.path, path: command.path,
      x: command.x ?? 3, y: command.y ?? 35, width: command.width ?? 30,
      label: command.label ?? '', accent: command.accent ?? '#dfae77' }];
  } else {
    if (!layout.some(item => (item.id ?? item.path) === command.id)) throw new Error('Unknown presentation component');
    const allowed = ['x', 'y', 'width', 'label', 'accent', 'compact'];
    if (Object.keys(command.changes ?? {}).some(key => !allowed.includes(key))) throw new Error('Unsupported presentation property');
    next = layout.map(item => (item.id ?? item.path) === command.id ? { ...item, ...command.changes } : item);
  }
  return replacePresentationLayout(source, next);
}
