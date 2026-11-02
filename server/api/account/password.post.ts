import { accountSchemas } from '../../../shared/validation';
import { accountIdentity, accountRequest, requireManagedRegistry } from '../../utils/accounts';
import { registrySession, sameOrigin } from '../../utils/registry';
import { validated } from '../../utils/validation';

export default defineEventHandler(async (event) => {
  sameOrigin(event);
  setResponseHeader(event, 'Cache-Control', 'no-store');
  await requireManagedRegistry(event);
  await accountIdentity(event);
  const body = validated(accountSchemas.passwordChange, await readBody(event));
  await accountRequest(event, 'password', {
    currentPassword: body.currentPassword,
    password: body.password,
  });
  // Re-authentication clears credentials in this browser. Other sessions fail on their next check.
  await (await registrySession(event)).clear();
  return { ok: true };
});
