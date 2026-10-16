import MarkdownIt from 'markdown-it';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { pages, pagePath, markdownPath } from './catalog.js';
import { renderPage, exampleMarkup } from './template.js';
import { examples, examplePath } from './examples.js';
import { highlight } from './highlight.js';

const webRoot = resolve(import.meta.dirname, '..');
const repoRoot = resolve(webRoot, '..');
const docsRoot = resolve(repoRoot, 'docs/handbook');
const guidePath = resolve(repoRoot, 'docs/rearchitecture/studio-agent-quickstart.md');
const exampleFiles = Object.entries(examples).map(([id, spec]) => [
  id,
  resolve(import.meta.dirname, spec.file),
]);
export const handbookInputs = Object.fromEntries(
  pages.map((page) => [
    `learn-${page.slug || 'index'}`,
    resolve(webRoot, `.${pagePath(page)}index.html`),
  ]),
);

export async function buildHandbook() {
  const [guide, ...documents] = await Promise.all([
    readFile(guidePath, 'utf8'),
    ...pages.map((page) => readFile(resolve(docsRoot, page.file), 'utf8')),
  ]);
  const sources = Object.fromEntries(
    await Promise.all(exampleFiles.map(async ([id, path]) => [id, await readFile(path, 'utf8')])),
  );
  const edition = createHash('sha256')
    .update(
      JSON.stringify({ pages, examples }) + documents.join('\n') + guide + JSON.stringify(sources),
    )
    .digest('hex')
    .slice(0, 12);
  const rawFiles = new Map();
  const htmlFiles = new Map();
  for (const [index, page] of pages.entries()) {
    const expanded = documents[index].replace(
      '{{studio-authoring-guide}}',
      guide.replace(/^#/gm, '##'),
    );
    const headings = [];
    const usedIds = new Map();
    const md = new MarkdownIt({ html: false, highlight });
    md.renderer.rules.heading_open = (tokens, i, options, env, self) => {
      const text = tokens[i + 1].content;
      const base = text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      const occurrence = (usedIds.get(base) ?? 0) + 1;
      usedIds.set(base, occurrence);
      const id = occurrence === 1 ? base : `${base}-${occurrence}`;
      tokens[i].attrSet('id', id);
      if (tokens[i].tag === 'h2') headings.push({ text, id });
      return self.renderToken(tokens, i, options);
    };
    const fence = md.renderer.rules.fence;
    md.renderer.rules.fence = (tokens, i, ...args) => {
      if (tokens[i].info === 'manifold-example') {
        const id = tokens[i].content.trim();
        if (!examples[id]) throw new Error('Unknown handbook example: ' + id);
        return exampleMarkup(id, sources[id]);
      }
      return fence(tokens, i, ...args);
    };
    const content = md.render(expanded.replace(/^# [^\n]+\n/, ''));
    const html = renderPage(page, { content, headings, edition });
    const target = handbookInputs[`learn-${page.slug || 'index'}`];
    await mkdir(dirname(target), { recursive: true });
    // Tests and production builds can run beside the development server.
    // Unchanged generation must not reload a reader's active example.
    if ((await readFile(target, 'utf8').catch(() => null)) !== html) await writeFile(target, html);
    htmlFiles.set(pagePath(page), html);
    const raw =
      `<!-- Manifold documentation edition: ${edition}; page: ${pagePath(page)} -->\n\n` +
      expanded.replace(
        /```manifold-example\n([a-z]+)\n```/g,
        (_, id) =>
          `Interactive example: ${pagePath(page)}\nExact source: ${examplePath(id)}\n\n\`\`\`${id === 'field' ? 'json' : 'js'}\n${sources[id]}\`\`\``,
      );
    rawFiles.set(markdownPath(page), raw);
  }
  const manifest = {
    format: 'manifold.documentation',
    edition,
    status: 'preview',
    pages: pages.map((page) => ({
      title: page.title,
      summary: page.summary,
      url: pagePath(page),
      markdown: markdownPath(page),
      related: page.related.map((slug) => pagePath(pages.find((p) => p.slug === slug))),
      ...(page.example ? { sources: [examplePath(page.example)] } : {}),
    })),
  };
  rawFiles.set('/learn/manifest.json', JSON.stringify(manifest, null, 2) + '\n');
  for (const [id, source] of Object.entries(sources)) rawFiles.set(examplePath(id), source);
  rawFiles.set(
    '/llms.txt',
    `# Manifold\n\nManifold is the importable audio library. Manifold Studio is the live, agentic authoring product built on it. Plug-ins, instruments and packs are downstream products.\n\nPreview documentation edition: ${edition}. Relative links resolve against this site's origin.\n\n## Topics\n\n${pages.map((page) => `- [${page.title}](${markdownPath(page)}): ${page.summary}`).join('\n')}\n\nMachine-readable index: /learn/manifest.json\nFor a connected Studio session, also read its manifold://studio/authoring-guide resource and advertised tool schemas.\n`,
  );
  return { rawFiles, htmlFiles, manifest };
}

export function handbookSite(initial) {
  let built = initial;
  let rebuilding = Promise.resolve();
  return {
    name: 'manifold-handbook',
    configureServer(server) {
      const watched = [docsRoot, guidePath, ...exampleFiles.map(([, path]) => path)];
      server.watcher.add(watched);
      const rebuild = (path) => {
        if (!watched.some((root) => path === root || path.startsWith(root + '/'))) return;
        rebuilding = rebuilding
          .then(async () => {
            built = await buildHandbook();
            server.ws.send({ type: 'full-reload', path: '/learn/*' });
          })
          .catch((error) => server.config.logger.error(String(error)));
      };
      server.watcher.on('change', rebuild);
      server.watcher.on('add', rebuild);
      server.httpServer?.once('close', () => {
        server.watcher.off('change', rebuild);
        server.watcher.off('add', rebuild);
      });
      server.middlewares.use(async (req, res, next) => {
        const path = req.url?.split('?')[0];
        if (built.rawFiles.has(path)) {
          res.setHeader(
            'Content-Type',
            path.endsWith('.json')
              ? 'application/json; charset=utf-8'
              : path.endsWith('.mjs')
                ? 'text/javascript; charset=utf-8'
                : 'text/plain; charset=utf-8',
          );
          res.end(built.rawFiles.get(path));
          return;
        }
        if (path === '/learn' || pages.some((p) => p.slug && path === pagePath(p).slice(0, -1))) {
          res.statusCode = 308;
          res.setHeader(
            'Location',
            path + '/' + (req.url.includes('?') ? '?' + req.url.split('?').slice(1).join('?') : ''),
          );
          res.end();
          return;
        }
        const html = built.htmlFiles.get(path);
        if (html) {
          try {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.end(await server.transformIndexHtml(path, html));
          } catch (error) {
            next(error);
          }
          return;
        }
        next();
      });
    },
    generateBundle: {
      order: 'post',
      handler(_options, bundle) {
        for (const [path, source] of built.rawFiles)
          this.emitFile({ type: 'asset', fileName: path.slice(1), source });
        // Run after Vite has rendered HTML, then share that exact entry.
        // The library export has no Studio shell; the handbook still builds without it.
        const studio = bundle['index.html'];
        if (studio?.type === 'asset')
          this.emitFile({ type: 'asset', fileName: 'studio/index.html', source: studio.source });
      },
    },
  };
}
