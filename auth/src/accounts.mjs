import { internalSchemas } from './schemas.mjs';
import { Failure, Store, actionsFor, repositoryPattern } from './store.mjs';
import { scopedAccess, signer } from './token.mjs';

function basic(value) {
  if (typeof value !== 'string' || !/^Basic [A-Za-z0-9+/]+={0,2}$/i.test(value))
    throw new Failure(401, 'Invalid credentials');
  const decoded = Buffer.from(value.slice(6), 'base64').toString('utf8');
  const colon = decoded.indexOf(':');
  if (colon < 1) throw new Failure(401, 'Invalid credentials');
  return [decoded.slice(0, colon), decoded.slice(colon + 1)];
}
/** Shared account operations; callers enforce their transport and administration policy. */
export async function createAccountService(config) {
  if (!['htpasswd', 'token'].includes(config.mode)) throw new Error('Invalid account mode');
  const store = new Store(config.directory);
  // Validate existing files at startup; never silently replace malformed account data.
  await store.accounts();
  await store.permissions();
  const issue = config.mode === 'token' ? await signer(config) : undefined;
  const failures = new Map();

  return {
    /** Apply the same bounded failed-credential window to either transport. */
    async limit(address, operation) {
      const window = failures.get(address);
      if (window && window.expires > Date.now() && window.count >= 30)
        throw new Failure(429, 'Too many failed logins; retry later');
      try {
        return await operation();
      } catch (error) {
        if (error instanceof Failure && error.status === 401) {
          const now = Date.now();
          const window = failures.get(address);
          if (!window || window.expires < now) {
            if (failures.size >= 10000) failures.delete(failures.keys().next().value);
            failures.set(address, { expires: now + 60000, count: 1 });
          } else window.count++;
        }
        throw error;
      }
    },
    /** Execute a validated operation without HTTP or a second listening process. */
    async request(path, body) {
      const internal = path.startsWith('/internal/');
      if (!internal && !(path === '/token' && issue)) throw new Failure(404, 'Not found');
      const schema = internal ? internalSchemas[path] : undefined;
      if (internal && !schema) throw new Failure(404, 'Not found');
      const parsed = schema?.safeParse(body);
      if (parsed && !parsed.success) throw new Failure(400, parsed.error.issues[0]?.message || 'Invalid request');
      const input = parsed ? parsed.data : body;
      // Reject corrupted permissions before any operation can partially modify account files.
      await store.permissions();
      const [username, password] = basic(input.authorization);
      const { grants } = await store.identity(username, password, config.mode === 'token');
      let output;
      if (path === '/token') {
        if (input.service !== config.service) throw new Failure(400, 'Invalid token audience');
        // Docker login requests offline_token. Without a refresh token in the
        // response, clients retain Basic credentials and request fresh access tokens.
        output = issue(username, scopedAccess(input.scopes, grants));
      } else if (path === '/internal/login') {
        output = {
          username,
          mode: config.mode,
          globalRead: grants.some((grant) => grant.pattern === '*'),
        };
      } else if (path === '/internal/users/list') {
        const users = [...(await store.accounts()).entries.keys()].sort().map((username) => ({ username }));
        output = {
          users:
            config.mode === 'token'
              ? await Promise.all(
                  users.map(async (user) => ({
                    ...user,
                    grants: await store.grants(user.username),
                  })),
                )
              : users,
        };
      } else if (path === '/internal/password') {
        if (typeof input.currentPassword !== 'string') throw new Failure(400, 'Current password required');
        await store.setPassword(username, input.password, {
          currentPassword: input.currentPassword,
        });
        output = { ok: true };
      } else if (path === '/internal/users') {
        await store.setPassword(input.username, input.password, { create: true });
        output = { username: input.username };
      } else if (['/internal/users/password', '/internal/users/delete'].includes(path)) {
        if (input.username === username) throw new Failure(403, 'User administration not allowed');
        if (path === '/internal/users/password') await store.setPassword(input.username, input.password);
        else await store.remove(input.username);
        output = { ok: true };
      } else if (path === '/internal/filter' && issue) {
        if (
          !Array.isArray(input.repositories) ||
          input.repositories.length > 1000 ||
          input.repositories.some((name) => typeof name !== 'string' || !repositoryPattern.test(name))
        )
          throw new Failure(400, 'Invalid repositories');
        output = {
          repositories: input.repositories.filter((name) => actionsFor(grants, name).includes('pull')),
        };
      } else if (path === '/internal/access' && issue) {
        if (typeof input.repository !== 'string' || !repositoryPattern.test(input.repository))
          throw new Failure(400, 'Invalid repository');
        output = { actions: actionsFor(grants, input.repository) };
      } else if (path === '/internal/token' && issue) {
        // Catalog access is reserved for the trusted backend. Never expose this token to a browser.
        const access =
          input.catalog === true
            ? [{ type: 'registry', name: 'catalog', actions: ['*'] }]
            : scopedAccess(input.scopes || [], grants);
        output = issue(username, access);
      } else throw new Failure(404, 'Not found');
      return output;
    },
  };
}
