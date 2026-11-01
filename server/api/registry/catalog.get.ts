import { paginatedList } from '../../utils/registry'
export default defineEventHandler(async (event) => ({
  repositories: await paginatedList(event, '/v2/_catalog', 'repositories'),
}))
