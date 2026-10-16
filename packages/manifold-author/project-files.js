// Portable project file table. Root source and presentation are virtual
// files owned by the live runtime; entries here never duplicate those sources.
const TYPES = {
  mjs: 'text/javascript', js: 'text/javascript', ts: 'text/typescript',
  json: 'application/json', css: 'text/css', txt: 'text/plain',
  svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg',
  jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif',
};
const BINARY = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif']);
// QuickJS in native plug-ins has no TextEncoder. This small byte counter keeps
// file sizes available in browser and native authoring hosts.
function utf8Bytes(value) {
  let bytes = 0;
  for (const character of value) {
    const code = character.codePointAt(0);
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
  }
  return bytes;
}
export function projectFileType(path) {
  const extension = projectFilePath(path).split('.').pop().toLowerCase();
  if (!TYPES[extension]) throw new Error(`Unsupported project file type: ${path}`);
  return {mediaType:TYPES[extension],encoding:BINARY.has(extension)?'base64':'utf8'};
}

export function projectFilePath(path) {
  if (typeof path !== 'string' || !/^\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_.-]+$/.test(path)
      || path.includes('/./') || path.includes('/../')
      || path.split('/').slice(1).some(segment => segment.startsWith('.') || segment.endsWith('.')))
    throw new Error('Use an absolute project path without traversal');
  return path;
}

export function validateProjectFiles(entries = []) {
  if (!Array.isArray(entries)) throw new Error('Expected project files');
  const seen = new Set();
  return entries.map(entry => {
    const path = projectFilePath(entry?.path);
    if (path === '/project.mjs' || path === '/presentation.mjs' || path === '/composition.json' || seen.has(path))
      throw new Error(`Reserved or duplicate project file: ${path}`);
    seen.add(path);
    const extension = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
    const mediaType = TYPES[extension];
    if (!mediaType || entry.mediaType !== mediaType) throw new Error(`Unsupported project file type: ${path}`);
    const encoding = BINARY.has(extension) ? 'base64' : 'utf8';
    if (entry.encoding !== encoding || typeof entry.content !== 'string') throw new Error(`Invalid file encoding: ${path}`);
    if (encoding === 'base64' && (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(entry.content)))
      throw new Error(`Invalid base64 asset: ${path}`);
    return {path, mediaType, encoding, content:entry.content};
  });
}

export function projectFileManifest(files, source, presentation) {
  const size = utf8Bytes;
  return [
    {path:'/project.mjs', mediaType:'text/javascript', bytes:size(source), virtual:true},
    ...(presentation ? [{path:'/presentation.mjs',mediaType:'text/javascript',bytes:size(presentation),virtual:true}] : []),
    ...files.map(({path,mediaType,encoding,content}) => ({path,mediaType,bytes:encoding === 'base64' ? content.length * 3 / 4 - (content.endsWith('==') ? 2 : content.endsWith('=') ? 1 : 0) : size(content)})),
  ];
}

export function projectFileDataUrl(entry) {
  if (!entry || !entry.mediaType.startsWith('image/')) throw new Error('This project file is not an image');
  if (entry.encoding === 'base64') return `data:${entry.mediaType};base64,${entry.content}`;
  return `data:${entry.mediaType};charset=utf-8,${encodeURIComponent(entry.content)}`;
}
