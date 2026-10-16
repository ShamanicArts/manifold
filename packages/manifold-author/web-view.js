import { parse } from 'acorn';

/** View code is data in the control runtime; only a view host executes it. */
export function validateWebView(value) {
  if (value == null) return null;
  if (value.version !== 1 || typeof value.source !== 'string')
    throw new Error('Expected a version 1 web view with source under 128 KB');
  const dependencies = value.dependencies ?? {};
  if (typeof dependencies !== 'object' || Array.isArray(dependencies) || dependencies === null)
    throw new Error('Web view dependencies must map module names to exact versions');
  for (const [name, version] of Object.entries(dependencies)) {
    if (!name || typeof version !== 'string' || !/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(version))
      throw new Error('Web view dependencies require exact versions');
  }
  const tree = parse(value.source, { ecmaVersion: 2022, sourceType: 'module' });
  if (!tree.body.some(node => node.type === 'ExportDefaultDeclaration'))
    throw new Error('Web views export a default synchronous view factory');
  for (const node of tree.body) {
    if (node.type === 'ImportDeclaration' && !Object.hasOwn(dependencies, node.source.value))
      throw new Error(`Declare the web view dependency ${node.source.value}`);
  }
  const height = value.height ?? 300;
  if (!Number.isFinite(height) || height < 160 || height > 800)
    throw new Error('Web view height must be between 160 and 800 pixels');
  const role = value.role ?? 'visual';
  if (!['visual', 'instrument'].includes(role)) throw new Error('Unknown web view role');
  const layout = value.layout ?? [];
  if (!Array.isArray(layout)) throw new Error('Expected presentation controls');
  const paths = new Set();
  const ids = new Set();
  for (const item of layout) {
    if (typeof item.path !== 'string' || !item.path.startsWith('/') || paths.has(item.path))
      throw new Error('Layout controls need unique parameter paths');
    paths.add(item.path);
    if (item.id !== undefined && (typeof item.id !== 'string' || !item.id))
      throw new Error('Presentation component IDs must be unique nonempty strings');
    const identity = item.id ?? item.path;
    if (ids.has(identity)) throw new Error('Presentation component IDs must be unique');
    ids.add(identity);
    if (item.label !== undefined && (typeof item.label !== 'string'))
      throw new Error('Presentation labels must be strings under 96 characters');
    if (item.accent !== undefined && !/^#[0-9a-f]{6}$/i.test(item.accent))
      throw new Error('Presentation accents must be six-digit hex colors');
    for (const key of ['x', 'y', 'width'])
      if (!Number.isFinite(item[key])) throw new Error('Layout coordinates must be finite');
    if (item.x < 0 || item.y < 0 || item.y > 80 || item.width < 8 || item.x + item.width > 100)
      throw new Error('Layout control is outside the presentation panel');
    if (item.compact !== undefined) {
      const c = item.compact;
      if (!c || !['x','y','width'].every(key => Number.isFinite(c[key]))
        || c.x < 0 || c.y < 0 || c.y > 80 || c.width < 8 || c.x + c.width > 100)
        throw new Error('Compact layout control is outside the presentation panel');
    }
  }
  return { version: 1, source: value.source, dependencies: { ...dependencies }, height,
    ...(value.role ? {role} : {}), ...(value.layout ? {layout: layout.map(({path,x,y,width,id,label,accent,compact}) =>
      ({path,x,y,width,...(id ? {id} : {}),...(label !== undefined ? {label} : {}),...(accent ? {accent} : {}),
        ...(compact ? {compact:{x:compact.x,y:compact.y,width:compact.width}} : {})}))} : {}) };
}

/** Editor helper for examples with a named, literal webViewSource declaration. */
export function replaceWebViewSource(projectSource, viewSource) {
  const tree = parse(projectSource, { ecmaVersion: 2022, sourceType: 'module' });
  const declaration = tree.body.flatMap(node => node.declarations ?? [])
    .find(node => node.id.name === 'webViewSource');
  if (!declaration?.init) throw new Error('This sketch has no editable webViewSource declaration');
  return projectSource.slice(0, declaration.init.start) + JSON.stringify(viewSource)
    + projectSource.slice(declaration.init.end);
}

/** Layout lives in the author's source, alongside graph and inspector declarations. */
export function replacePresentationLayout(projectSource, layout) {
  const tree = parse(projectSource, { ecmaVersion: 2022, sourceType: 'module' });
  const declaration = tree.body.flatMap(node => node.declarations ?? [])
    .find(node => node.id.name === 'presentationLayout');
  if (!declaration?.init) throw new Error('Declare presentationLayout to arrange controls visually');
  return projectSource.slice(0, declaration.init.start) + JSON.stringify(layout, null, 2)
    + projectSource.slice(declaration.init.end);
}
