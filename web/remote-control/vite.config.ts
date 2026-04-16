import { createSocket } from 'node:dgram';
import { networkInterfaces } from 'node:os';
import { defineConfig } from 'vite';

const REMOTE_DISCOVERY_PORT = 18081;
const REMOTE_DISCOVERY_HOST = '127.0.0.1';
const REMOTE_DISCOVERY_STALE_MS = 3000;
const REGISTER_PATH = '/manifold/remote/register';
const UNREGISTER_PATH = '/manifold/remote/unregister';

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

function normaliseHost(host, aliases) {
  return aliases.has(host) ? '127.0.0.1' : host;
}

function pruneDiscoveredTargets(targets) {
  const now = Date.now();
  for (const [key, target] of targets) {
    if (now - (target.lastSeenMs || 0) > REMOTE_DISCOVERY_STALE_MS) {
      targets.delete(key);
    }
  }
}

function decodeOscString(buffer, offset) {
  let end = offset;
  while (end < buffer.length && buffer[end] !== 0) end += 1;
  const value = buffer.toString('utf8', offset, end);
  const next = (end + 4) & ~3;
  return { value, next };
}

function decodeOscPacket(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) return null;
  const pathPart = decodeOscString(buffer, 0);
  const typePart = decodeOscString(buffer, pathPart.next);
  const path = pathPart.value;
  const tags = typePart.value.startsWith(',') ? typePart.value.slice(1) : typePart.value;
  const args = [];
  let offset = typePart.next;

  for (const tag of tags) {
    if (tag === 'i') {
      if (offset + 4 > buffer.length) return null;
      args.push(buffer.readInt32BE(offset));
      offset += 4;
    } else if (tag === 'f') {
      if (offset + 4 > buffer.length) return null;
      args.push(buffer.readFloatBE(offset));
      offset += 4;
    } else if (tag === 's') {
      const stringPart = decodeOscString(buffer, offset);
      args.push(stringPart.value);
      offset = stringPart.next;
    } else if (tag === 'T') {
      args.push(true);
    } else if (tag === 'F') {
      args.push(false);
    } else {
      return null;
    }
  }

  return { path, args };
}

const LOCAL_ALIASES = localHostAliases();
const discoveredTargets = new Map();
let discoverySocketStarted = false;

function startDiscoverySocket(logger) {
  if (discoverySocketStarted) return;
  discoverySocketStarted = true;

  const socket = createSocket('udp4');

  socket.on('message', (message, remote) => {
    try {
      const packet = decodeOscPacket(message);
      if (!packet || (packet.path !== REGISTER_PATH && packet.path !== UNREGISTER_PATH)) return;

      const queryPort = Math.round(Number(packet.args[0] ?? 0));
      const oscPort = Math.round(Number(packet.args[1] ?? 0));
      if (!Number.isFinite(queryPort) || queryPort < 1 || queryPort > 65535) return;

      const host = normaliseHost(remote.address || '127.0.0.1', LOCAL_ALIASES);
      const key = `${host}:${queryPort}`;

      if (packet.path === UNREGISTER_PATH) {
        discoveredTargets.delete(key);
        return;
      }

      discoveredTargets.set(key, {
        id: key,
        host,
        queryPort,
        oscPort: Number.isFinite(oscPort) && oscPort > 0 ? oscPort : null,
        lastSeenMs: Date.now(),
      });
    } catch (error) {
      logger?.warn?.(`[oscquery-discovery] failed to parse heartbeat: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  socket.on('error', (error) => {
    logger?.error?.(`[oscquery-discovery] udp listener error: ${error instanceof Error ? error.message : String(error)}`);
  });

  socket.bind(REMOTE_DISCOVERY_PORT, REMOTE_DISCOVERY_HOST, () => {
    logger?.info?.(`[oscquery-discovery] listening on udp://${REMOTE_DISCOVERY_HOST}:${REMOTE_DISCOVERY_PORT}`);
  });
}

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
        startDiscoverySocket(server.config.logger);

        server.middlewares.use(async (req, res, next) => {
          try {
            const url = new URL(req.url || '/', 'http://vite.local');
            if (url.pathname === '/__oscq/targets') {
              pruneDiscoveredTargets(discoveredTargets);
              const targets = Array.from(discoveredTargets.values())
                .sort((a, b) => a.queryPort - b.queryPort)
                .map((target) => ({
                  id: target.id,
                  host: target.host,
                  queryPort: target.queryPort,
                  oscPort: target.oscPort,
                  lastSeenMs: target.lastSeenMs,
                }));
              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.setHeader('Access-Control-Allow-Origin', '*');
              res.end(JSON.stringify({
                targets,
                discovery: {
                  host: REMOTE_DISCOVERY_HOST,
                  port: REMOTE_DISCOVERY_PORT,
                  staleMs: REMOTE_DISCOVERY_STALE_MS,
                },
              }));
              return;
            }

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

            const upstreamHost = normaliseHost(host, LOCAL_ALIASES);

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
