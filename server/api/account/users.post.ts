import { accountSchemas } from '../../../shared/validation';
import { accountRequest, requireUserAdministration } from '../../utils/accounts';
import { sameOrigin } from '../../utils/registry';
import { validated } from '../../utils/validation';

export default defineEventHandler(async (event) => {
  sameOrigin(event);
  setResponseHeader(event, 'Cache-Control', 'no-store');
  await requireUserAdministration(event);
  const body = validated(accountSchemas.createUser, await readBody(event));
  return accountRequest(event, 'users', body);
});
