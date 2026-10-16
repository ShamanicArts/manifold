import { parse } from 'acorn';
import { projectFilePath } from './project-files.js';

// A file is prepared once while its record and content stay unchanged. This
// avoids reparsing every renderer for validation and then again for the graph
// presentation. Weak ownership lets discarded projects release their entries.
const preparedFiles = new WeakMap();
function prepareFile(file) {
  const previous = preparedFiles.get(file);
  if (previous?.content === file.content) return previous;
  const ast = tree(file.content);
  const imports = [];
  for (const node of ast.body) {
    if (node.type.startsWith('Export') && node.source)
      throw new Error('Re-exports are not yet supported in project visual modules');
    if (node.type === 'ImportDeclaration') imports.push(node.source.value);
  }
  // Validate lowered syntax without invoking authored code. Cache only this
  // file's syntax; dependency availability and cycles are checked on each walk.
  compile(file.content, ast);
  const prepared = {
    content: file.content,
    imports,
    hasDefault: ast.body.some((node) => node.type === 'ExportDefaultDeclaration'),
  };
  preparedFiles.set(file, prepared);
  return prepared;
}

function tree(source) {
  const ast = parse(source, { ecmaVersion: 2022, sourceType: 'module' });
  function visit(node) {
    if (['ImportExpression', 'MetaProperty'].includes(node.type))
      throw new Error(
        'Project visual modules use static imports; dynamic imports and import.meta are not supported',
      );
    for (const value of Object.values(node)) {
      if (Array.isArray(value))
        value.forEach((child) => {
          if (child?.type) visit(child);
        });
      else if (value?.type) visit(value);
    }
  }
  visit(ast);
  return ast;
}

function resolve(from, name) {
  if (!name.startsWith('.')) return name.startsWith('/') ? projectFilePath(name) : name;
  const parts = from.split('/');
  parts.pop();
  for (const part of name.split('/')) {
    if (part === '.') continue;
    if (part === '..') {
      if (parts.length <= 1) throw new Error('Module import escapes the project');
      parts.pop();
    } else parts.push(part);
  }
  return projectFilePath(parts.join('/'));
}

/** Collect and validate a bounded static module closure without executing visuals. */
export function prepareProjectModules(entry, files, dependencies = {}) {
  const sources = {},
    active = new Set();
  let entryHasDefault = false;
  function collect(path) {
    if (active.has(path)) throw new Error(`Recursive visual module import: ${path}`);
    if (Object.hasOwn(sources, path)) return;
    const file = files.find((file) => file.path === path);
    if (!file || file.mediaType !== 'text/javascript' || file.encoding !== 'utf8')
      throw new Error(`Missing JavaScript module: ${path}`);
    active.add(path);
    const prepared = prepareFile(file);
    if (path === entry) entryHasDefault = prepared.hasDefault;
    for (const name of prepared.imports) {
      const target = resolve(path, name);
      if (target.startsWith('/')) collect(target);
      else if (!Object.hasOwn(dependencies, target))
        throw new Error(`Declare visual dependency ${target}`);
    }
    sources[path] = file.content;
    active.delete(path);
  }
  collect(projectFilePath(entry));
  if (!entryHasDefault) throw new Error('A visual entry must export a default view factory');
  return sources;
}

function compile(source, ast = tree(source)) {
  const replacements = [],
    exports = [];
  let resolver = '__manifoldImport';
  while (source.includes(resolver)) resolver += '_';
  let defaultName = '__manifoldDefault';
  while (source.includes(defaultName)) defaultName += '_';
  for (const node of ast.body) {
    if (node.type === 'ImportDeclaration') {
      const expression = `${resolver}(${JSON.stringify(node.source.value)})`;
      const bindings = node.specifiers.map((specifier) => {
        if (specifier.type === 'ImportNamespaceSpecifier')
          return `const ${specifier.local.name} = ${expression};`;
        const name =
          specifier.type === 'ImportDefaultSpecifier'
            ? 'default'
            : (specifier.imported.name ?? specifier.imported.value);
        return `const ${specifier.local.name} = ${resolver}(${JSON.stringify(node.source.value)},${JSON.stringify(name)});`;
      });
      replacements.push({
        start: node.start,
        end: node.end,
        text: bindings.length ? bindings.join('\n') : `${expression};`,
      });
    } else if (node.type === 'ExportDefaultDeclaration') {
      // Named default declarations also create a local module binding.
      // Preserve it for helpers that refer to the factory by name.
      const named = ['FunctionDeclaration', 'ClassDeclaration'].includes(node.declaration.type)
        ? node.declaration.id?.name
        : null;
      replacements.push({
        start: node.start,
        end: node.declaration.start,
        text: named ? '' : `const ${defaultName} = `,
      });
      replacements.push({ start: node.end, end: node.end, text: ';' });
      exports.push(`default:${named ?? defaultName}`);
    } else if (node.type === 'ExportNamedDeclaration') {
      if (node.source) throw new Error('Project visual modules do not support re-exports');
      if (node.declaration) {
        const declaration = node.declaration;
        const names =
          declaration.type === 'VariableDeclaration'
            ? declaration.declarations.map((item) =>
                item.id.type === 'Identifier' ? item.id.name : null,
              )
            : [declaration.id?.name];
        if (names.some((name) => !name))
          throw new Error('Export named visual declarations without destructuring');
        exports.push(...names.map((name) => `${JSON.stringify(name)}:${name}`));
        replacements.push({ start: node.start, end: declaration.start, text: '' });
      } else {
        exports.push(
          ...node.specifiers.map(
            (item) =>
              `${JSON.stringify(item.exported.name ?? item.exported.value)}:${item.local.name}`,
          ),
        );
        replacements.push({ start: node.start, end: node.end, text: '' });
      }
    } else if (node.type.startsWith('Export')) throw new Error('Unsupported visual module export');
  }
  for (const edit of replacements.sort((a, b) => b.start - a.start))
    source = source.slice(0, edit.start) + edit.text + source.slice(edit.end);
  return new Function(
    resolver,
    `"use strict";\n${source}\nreturn Object.freeze({${exports.join(',')}});`,
  );
}

/** Presentation-host execution only. This is module resolution, not a sandbox. */
export function evaluateProjectModules(entry, sources, dependencies = {}) {
  const cache = new Map(),
    active = new Set();
  function load(path) {
    if (!path.startsWith('/')) {
      if (!Object.hasOwn(dependencies, path))
        throw new Error(`Unavailable visual dependency: ${path}`);
      return dependencies[path];
    }
    if (active.has(path)) throw new Error(`Recursive visual module import: ${path}`);
    if (cache.has(path)) return cache.get(path);
    if (!Object.hasOwn(sources, path)) throw new Error(`Missing prepared module: ${path}`);
    active.add(path);
    const result = compile(sources[path])((name, imported) => {
      const namespace = load(resolve(path, name));
      if (imported === undefined) return namespace;
      if (!Object.hasOwn(namespace, imported))
        throw new Error(`${name} does not export ${imported}`);
      return namespace[imported];
    });
    active.delete(path);
    cache.set(path, result);
    return result;
  }
  return load(entry);
}
