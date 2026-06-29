/**
 * Local API dev server. Runs the Vercel serverless handlers in api/ as a plain
 * Node HTTP server so the whole app works locally under `npm run dev:local`
 * WITHOUT `vercel dev` — whose file watcher EMFILEs on this repo's ~50k sprite
 * PNGs no matter how high the fd limit is raised.
 *
 * Vite serves the frontend and proxies /api/* here (see `server.proxy` in
 * vite.config.ts). Run via tsx, which transpiles the handlers and their
 * `../src/game/*.js` imports on the fly — exactly like the test scripts do.
 *
 * It mirrors this project's Vercel routing: flat files (api/start-run.ts) and
 * the two dynamic dispatchers (api/auth/[action].ts, api/me/[action].ts), and
 * shims the VercelRequest/VercelResponse bits the handlers use (query, body,
 * cookies, res.status().json()).
 */
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

// Tell the handlers we're in local dev so the session cookie drops `Secure`
// (browsers won't reliably store a Secure cookie over plain-http localhost).
process.env.VERCEL_ENV ??= 'development';

/** Load KEY=VALUE pairs from an env file into process.env (without overriding). */
function loadEnvFile(name: string): void {
  const path = join(root, name);
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq < 0) continue;
    const key = t.slice(0, eq).trim();
    if (process.env[key]) continue;
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
}
loadEnvFile('.env.local');
loadEnvFile('.env');

const PORT = Number(process.env.DEV_API_PORT) || 3001;

/** Map an /api/... path to a handler file + dynamic route params. */
function resolveRoute(
  pathname: string,
): { file: string; params: Record<string, string> } | null {
  const rest = pathname.replace(/^\/api\/?/, '').replace(/\/+$/, '');
  if (!rest) return null;
  const parts = rest.split('/');
  // Guard against traversal / private helper files.
  if (parts.some((p) => !p || p === '..' || p === '.' || p.startsWith('_'))) {
    return null;
  }
  if (parts.length === 2 && (parts[0] === 'auth' || parts[0] === 'me')) {
    return { file: `api/${parts[0]}/[action].ts`, params: { action: parts[1] } };
  }
  if (parts.length === 1) {
    return { file: `api/${parts[0]}.ts`, params: {} };
  }
  return null;
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => resolve(data));
    req.on('error', () => resolve(''));
  });
}

function parseCookies(header?: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    out[part.slice(0, eq).trim()] = decodeURIComponent(part.slice(eq + 1).trim());
  }
  return out;
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  const route = resolveRoute(url.pathname);
  if (!route || !existsSync(join(root, route.file))) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: false, error: 'not found' }));
    return;
  }

  // query = dynamic route params + URL search params (last wins → array).
  const query: Record<string, string | string[]> = { ...route.params };
  for (const [k, v] of url.searchParams) {
    const existing = query[k];
    if (existing === undefined) query[k] = v;
    else if (Array.isArray(existing)) existing.push(v);
    else query[k] = [existing as string, v];
  }

  let body: unknown;
  if (req.method && req.method !== 'GET' && req.method !== 'HEAD') {
    const raw = await readBody(req);
    if (raw) {
      try {
        body = JSON.parse(raw);
      } catch {
        body = raw;
      }
    }
  }

  const vreq = req as IncomingMessage & Record<string, unknown>;
  vreq.query = query;
  vreq.body = body;
  vreq.cookies = parseCookies(req.headers.cookie);

  // VercelResponse-ish helpers layered onto the Node ServerResponse.
  const vres = res as ServerResponse & Record<string, unknown>;
  vres.status = (code: number) => {
    res.statusCode = code;
    return vres;
  };
  vres.json = (obj: unknown) => {
    if (!res.headersSent)
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(obj));
    return vres;
  };
  vres.send = (data: unknown) => {
    if (data && typeof data === 'object') {
      if (!res.headersSent)
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify(data));
    } else {
      res.end(data == null ? '' : String(data));
    }
    return vres;
  };

  try {
    const mod = await import(pathToFileURL(join(root, route.file)).href);
    const fn = mod.default;
    if (typeof fn !== 'function') {
      res.statusCode = 500;
      res.end('handler has no default export');
      return;
    }
    await fn(vreq, vres);
    if (!res.writableEnded) res.end();
  } catch (err) {
    console.error(`[dev-api] ${req.method} ${url.pathname} failed:`, err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
    }
    if (!res.writableEnded)
      res.end(JSON.stringify({ ok: false, error: 'dev-api error' }));
  }
}

createServer((req, res) => void handle(req, res)).listen(PORT, () => {
  console.log(
    `[dev-api] api/ handlers at http://localhost:${PORT}  (Vite proxies /api → here)`,
  );
});
