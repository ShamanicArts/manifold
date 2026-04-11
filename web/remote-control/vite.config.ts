import { networkInterfaces } from 'node:os';
import { defineConfig } from 'vite';

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function isSafeHost(host) {
  return /^[a-zA-Z0-9.:[\]-]+$/.test(host);
}

function localHostAliases() {
  const aliases = new Set(['127.0.0.1', 'localhost', '::1']);
  const interfaces = networkInterfaces();
  for (const infos of Object.values(interfaces)) {
    for (const info of infos || []) {
      if (info?.address) aliases.add(info.address);
    }
  }
  return aliases;
}

const LOCAL_ALIASES = localHostAliases();

export default defineConfig({
  server: {
    host: '0.0.0.0',
    port: 8081,
    strictPort: true,
    allowedHosts: true,
    cors: true,
    forwardConsole: {
      unhandledErrors: true,
      logLevels: ['log', 'warn', 'error'],
    },
  },
  plugins: [
    {
      name: 'oscquery-proxy',
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          try {
            const url = new URL(req.url || '/', 'http://vite.local');
            if (url.pathname !== '/__oscq/http' && url.pathname !== '/__oscq/command') {
              next();
              return;
            }

            const host = (url.searchParams.get('host') || '').trim();
            const port = Number(url.searchParams.get('port'));
            if (!host || !isSafeHost(host) || !Number.isFinite(port) || port < 1 || port > 65535) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.end(JSON.stringify({ error: 'invalid host or port' }));
              return;
            }

            const upstreamHost = LOCAL_ALIASES.has(host) ? '127.0.0.1' : host;

            let targetPath = '/';
            let method = req.method || 'GET';
            let headers = {};
            let body;

            if (url.pathname === '/__oscq/http') {
              targetPath = url.searchParams.get('path') || '/';
            } else {
              targetPath = '/api/command';
              method = 'POST';
              headers = {
                'content-type': req.headers['content-type'] || 'text/plain',
              };
              body = await readRequestBody(req);
            }

            const targetUrl = `http://${upstreamHost}:${port}${targetPath}`;
            const response = await fetch(targetUrl, {
              method,
              headers,
              body: body && body.length ? body : undefined,
            });

            const buffer = Buffer.from(await response.arrayBuffer());
            res.statusCode = response.status;
            response.headers.forEach((value, key) => {
              if (key.toLowerCase() === 'transfer-encoding') return;
              res.setHeader(key, value);
            });
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.end(buffer);
          } catch (error) {
            res.statusCode = 502;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({
              error: error instanceof Error ? error.message : String(error),
            }));
          }
        });
      },
    },
  ],
});
