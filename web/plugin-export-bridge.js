import http from 'node:http';

// Private deployment adapter. Keep native build machinery outside the audio
// runtime and serve the same job API in development and the review website.
export function pluginExportBridge() {
  const middleware = (request, response, next) => {
    if (!/^\/__manifold\/exports(?:\/|$)/.test(request.url ?? '')) return next();
    if (!['GET', 'POST'].includes(request.method)) {
      response.writeHead(405, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: 'Use GET or POST for exports' }));
      return;
    }
    if (request.method === 'POST') {
      let sameOrigin = !request.headers.origin;
      try { sameOrigin ||= new URL(request.headers.origin).host === request.headers.host; } catch {}
      if (!sameOrigin || request.headers['sec-fetch-site'] === 'cross-site') {
        response.writeHead(403, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ error: 'Export requests must come from this application' }));
        return;
      }
    }
    const upstream = http.request({ hostname: '127.0.0.1', port: 4181,
      path: request.url, method: request.method, timeout: 30_000,
      headers: { 'Content-Type': 'application/json',
        ...(request.headers['content-length'] ? { 'Content-Length': request.headers['content-length'] } : {}) },
    }, result => {
      response.writeHead(result.statusCode, result.headers);
      result.pipe(response);
    });
    upstream.on('timeout', () => upstream.destroy(new Error('Export service timed out')));
    upstream.on('error', () => {
      if (response.headersSent) return response.destroy();
      response.writeHead(503, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: 'The native build service is currently offline. Your project remains saved.' }));
    });
    response.on('close', () => upstream.destroy());
    request.pipe(upstream);
  };
  return { name: 'manifold-plugin-export',
    configureServer(server) { server.middlewares.use(middleware); },
    configurePreviewServer(server) { server.middlewares.use(middleware); } };
}
