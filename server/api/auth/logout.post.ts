import { registrySession, sameOrigin } from '../../utils/registry';

export default defineEventHandler(async (event) => {
  sameOrigin(event);
  await (await registrySession(event)).clear();
  return { ok: true };
});
