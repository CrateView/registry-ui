import { accountMode, accountRequest } from '../../utils/accounts';
import { paginatedList } from '../../utils/registry';

export default defineEventHandler(async (event) => {
  const tokenMode = accountMode(event) === 'token';
  const repositories = await paginatedList(event, '/v2/_catalog', 'repositories', tokenMode);
  if (!tokenMode) return { repositories };
  const allowed: string[] = [];
  for (let index = 0; index < repositories.length; index += 1000) {
    const filtered = await accountRequest<{ repositories: string[] }>(event, 'filter', {
      repositories: repositories.slice(index, index + 1000),
    });
    allowed.push(...filtered.repositories);
  }
  return { repositories: allowed };
});
