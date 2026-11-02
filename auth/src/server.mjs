import { timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { createAccountService } from './accounts.mjs';
import { Failure } from './store.mjs';

async function body(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 1024 * 1024) throw new Failure(413, 'Request too large');
    chunks.push(chunk);
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value;
  } catch {
    throw new Failure(400, 'Invalid JSON body');
  }
}
export async function authServer(config) {
  if (!['htpasswd', 'token'].includes(config.mode)) throw new Error('AUTH_MODE must be htpasswd or token');
  if (!config.managementSecret || config.managementSecret.length < 32)
    throw new Error('AUTH_MANAGEMENT_SECRET requires at least 32 characters');
  const accounts = await createAccountService(config);
  const server = createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Content-Type', 'application/json');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    const address = request.socket.remoteAddress;
    try {
      const url = new URL(request.url, 'http://auth.internal');
      const internal = url.pathname.startsWith('/internal/');
      if (url.pathname === '/health' && request.method === 'GET') {
        response.end('{"ok":true}');
        return;
      }
      const output = await accounts.limit(address, async () => {
        if (!internal && !(url.pathname === '/token' && request.method === 'GET' && config.mode === 'token'))
          throw new Failure(404, 'Not found');
        if (internal) {
          if (request.method !== 'POST') throw new Failure(405, 'Method not allowed');
          const given = Buffer.from(request.headers.authorization || '');
          const expected = Buffer.from(`Bearer ${config.managementSecret}`);
          if (given.length !== expected.length || !timingSafeEqual(given, expected))
            throw new Failure(401, 'Invalid service credentials');
        }
        const input = internal
          ? await body(request)
          : {
              authorization: request.headers.authorization,
              service: url.searchParams.get('service'),
              scopes: url.searchParams.getAll('scope'),
            };
        return accounts.request(url.pathname, input);
      });
      response.end(JSON.stringify(output));
    } catch (error) {
      const status = error instanceof Failure ? error.status : 503;
      if (status === 401) {
        response.setHeader('WWW-Authenticate', 'Basic realm="Crateview"');
      }
      response.statusCode = status;
      response.end(
        JSON.stringify({
          error: error instanceof Failure ? error.message : 'Account service unavailable',
        }),
      );
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  return server;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = await authServer({
    mode: process.env.AUTH_MODE || 'htpasswd',
    directory: process.env.AUTH_DATA_DIR || '/data',
    managementSecret: process.env.AUTH_MANAGEMENT_SECRET,
    issuer: process.env.AUTH_ISSUER,
    service: process.env.AUTH_SERVICE,
    keyPath: process.env.AUTH_KEY_PATH,
    certificatePath: process.env.AUTH_CERTIFICATE_PATH,
  });
  server.listen(Number(process.env.PORT || 8080), process.env.HOST || '127.0.0.1');
  for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => server.close());
}
