import { Store } from './store.mjs'

const [command, username, pattern, role] = process.argv.slice(2)
const store = new Store(process.env.AUTH_DATA_DIR || '/data')
try {
  if (command === 'add' || command === 'passwd') {
    if (process.stdin.isTTY)
      throw new Error('Supply the password on stdin (never as a command argument)')
    const chunks = []
    for await (const chunk of process.stdin) chunks.push(chunk)
    const password = Buffer.concat(chunks)
      .toString('utf8')
      .replace(/\r?\n$/, '')
    await store.setPassword(username, password, { create: command === 'add' })
  } else if (command === 'delete') await store.remove(username)
  else if (command === 'grant') await store.grant(username, pattern, role)
  else if (command === 'revoke') await store.revoke(username, pattern)
  else if (command === 'list') {
    const permissions = await store.permissions()
    console.log(
      JSON.stringify(
        [...(await store.accounts()).entries.keys()].map((username) => ({
          username,
          grants: Object.hasOwn(permissions.users, username) ? permissions.users[username] : [],
        })),
        null,
        2,
      ),
    )
  } else
    throw new Error(
      'Usage: cli.mjs add|passwd|delete USER; grant USER PATTERN reader|writer|manager; revoke USER PATTERN; list',
    )
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
