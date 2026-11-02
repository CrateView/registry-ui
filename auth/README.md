# Independent account service

Docker talks directly to Distribution. The UI is an optional management client;
stopping its container does not affect Docker authentication or authorization.
Account data is stored in `htpasswd` (bcrypt hashes), with token grants in
`permissions.json`. There is no account database or SQLite dependency.

## Modes

- `htpasswd`: Distribution checks the shared file. All authenticated users have
  the same registry rights. The service only manages accounts/passwords.
- `token`: the service checks passwords and issues five-minute RS256 tokens;
  Distribution verifies signatures and enforces repository actions. New accounts
  have no repository access. Existing tokens remain valid until expiry after a
  password change, account deletion or grant revocation.

Existing anonymous/basic deployments stay unchanged unless `NUXT_AUTH_MODE` is
explicitly enabled. Arbitrary external Bearer services and OIDC are not supported.

## Basic deployment

From the repository root, copy `.env.example` to `.env`. Generate a secret with
`openssl rand -base64 32`, set `AUTH_MANAGEMENT_SECRET`, and choose permitted
administrators using `NUXT_USER_CREATION_ALLOWED_USERS=admin`. Also configure a stable
`NUXT_SESSION_PASSWORD` for the UI. Build the current UI using the build override.
Bootstrap accounts **before starting Distribution**, which otherwise creates its
own default account if `htpasswd` is absent:

```sh
docker compose -f compose.yaml -f compose.build.yaml -f compose.auth.basic.yaml build
read -rs 'ACCOUNT_PASSWORD?Initial admin password: '; echo
printf '%s' "$ACCOUNT_PASSWORD" | docker compose -f compose.yaml -f compose.auth.basic.yaml run --rm -T --no-deps auth node src/cli.mjs add admin
unset ACCOUNT_PASSWORD
docker compose -f compose.yaml -f compose.build.yaml -f compose.auth.basic.yaml up -d
```

The `read` example uses zsh (bash: `read -rs -p 'Initial admin password: ' ACCOUNT_PASSWORD`).
Passwords never belong in command arguments, committed files or shell history.
Use at least 12 characters and at most 72 UTF-8 bytes (bcrypt's input limit).
Usernames use ASCII letters, digits, `.`, `_` and `-`, starting with a letter or digit.

The auth service and Distribution mount the same **directory**, respectively
read-write and read-only. Do not bind-mount the individual htpasswd file: atomic
replacement must become visible to Distribution. The provided Distribution 3.1.2
image reloads changed files without restarting.

The overlays publish Distribution at `127.0.0.1:5000`, independently of the UI on
port 3000. For remote use, put the registry and UI behind HTTPS. Docker should
log in to the registry's address, not the optional UI proxy, when UI independence
is required. Basic mode does not require the auth service to stay running after
accounts have been written.

## Token deployment

Use `compose.auth.token.yaml` instead of the basic overlay. Set:

```dotenv
AUTH_MANAGEMENT_SECRET=<random value of at least 32 characters>
AUTH_PUBLIC_URL=https://auth.example.com
AUTH_SERVICE=registry.example.com
AUTH_KEYS_DIR=./.dev/auth-keys
NUXT_USER_CREATION_ALLOWED_USERS=admin
```

`AUTH_SERVICE` is the exact audience shared by the registry and signer. Generate
an RSA signing key/certificate (the certificate is a trust anchor, separate from
the HTTPS certificate used by your reverse proxy):

```sh
mkdir -p .dev/auth-keys
openssl req -x509 -newkey rsa:3072 -nodes -keyout .dev/auth-keys/auth.key -out .dev/auth-keys/auth.crt -days 365 -subj /CN=crateview-auth
chmod 600 .dev/auth-keys/auth.key
```

Ensure the auth container's UID 1000 can read the private key (for Linux bind
mounts, arrange matching ownership). Distribution receives **only the public
certificate**, not the private key. Renew the certificate before expiry and
restart the auth service and registry after rotating keys/trust.

Build, bootstrap and start using the token overlay, then assign grants:

```sh
docker compose -f compose.yaml -f compose.auth.token.yaml run --rm -T --no-deps auth node src/cli.mjs grant admin '*' manager
docker compose -f compose.yaml -f compose.auth.token.yaml run --rm -T --no-deps auth node src/cli.mjs grant developer 'team/*' writer
```

The second command requires an existing `developer` account. Publish only `/token`
from the auth service through your HTTPS reverse proxy to `127.0.0.1:8080`.
`AUTH_PUBLIC_URL/token` must be reachable by Docker clients and the Docker daemon.
Route the public registry hostname independently to Distribution on port 5000.
No UI container participates in the Docker token exchange.

For existing deployments, migrate `htpasswd` unchanged into the auth data directory
and provision grants before switching Distribution to token mode. Missing grants
mean no access. Back up account data and retain the previous registry config for
rollback; switching back to Basic restores equal registry access for all accounts.

## UI and management boundary

UI server settings (the overlays supply these except the administrator policy):

| ENV                                | Meaning                                                                |
| ---------------------------------- | ---------------------------------------------------------------------- |
| `NUXT_AUTH_MODE`                   | `off` (default), `htpasswd` or `token`                                 |
| `NUXT_AUTH_SERVICE_URL`            | Internal service origin, e.g. `http://auth:8080`                       |
| `NUXT_AUTH_SERVICE_SECRET`         | Same value as `AUTH_MANAGEMENT_SECRET`; server-only                    |
| `NUXT_AUTH_TOKEN_REALM`            | Exact public `/token` URL in the registry Bearer challenge             |
| `NUXT_USER_CREATION_ALLOWED_USERS` | Empty: nobody; `alice,bob`: listed users; `*`: all authenticated users |

The sidebar groups Settings and Users under Administration. The Users page lists
accounts and lets members of `NUXT_USER_CREATION_ALLOWED_USERS` create users,
reset other users’ passwords, and delete other accounts after confirmation;
other users cannot list accounts through either the UI or Nitro API. Token grants
are displayed read-only; Basic mode has no role column. The table uses the Explore
table styling, with a right-aligned three-dot action menu for each account. The
current user’s menu links to Account for password changes and never offers deletion.

Every managed user can change their own password under Account, supplying their current one.
The UI signs out after a change; other UI sessions using the old password stop
working on their next credential check. Listing, creation, administrative password
resets and deletion are checked by Nitro on every request, regardless of visible
controls. Administrative resets do not require the target’s current password and
preserve token grants. Deletion removes both the account and its grants; self-deletion
is rejected. Grant assignment remains CLI-only. In Basic mode, administrators grant new accounts
the same broad registry access they already have. In token mode, creation alone
grants no registry access.

The internal API requires a separate service credential **and** valid user
credentials. It trusts the UI backend to enforce the ENV administrator policy. Keep
`/internal/*` off the public reverse proxy and restrict service access to the
private network. A holder of the management secret plus a valid user password
can create, reset and delete accounts directly. Never expose that secret through `NUXT_PUBLIC_*`.

Internal POST endpoints: `/internal/login`, `/internal/users`, `/internal/users/list`,
`/internal/users/password`, `/internal/users/delete`, `/internal/password`, `/internal/access`, `/internal/filter`, `/internal/token`.
They use `Authorization: Bearer <management secret>` and JSON containing the
actor's Basic authorization value. Privileged catalog tokens are backend-only;
UI catalog results are filtered by repository read rights. Registry-wide monitoring
in token mode requires a global read grant; restricted users cannot view it.

## Form and API validation

`src/schemas.mjs` is the browser-safe Zod source shared by Nuxt forms, Nitro account
endpoints, the auth service and CLI account storage. New users and password
changes require 12 characters and at most 72 UTF-8 bytes; login accepts existing
shorter passwords. Confirmation is validated in forms; it is not sent to the API.
Passwords are never trimmed. Unexpected account-body fields are rejected, and
validation errors never include submitted passwords. User listing never exposes
hashes. Registry API queries also validate names, digests, enums and scalar types.

## CLI and grants

Run `node src/cli.mjs` inside the auth container, or locally with
`AUTH_DATA_DIR=/path/to/auth-data npm --prefix auth run cli -- ...` after
`npm ci --prefix auth`:

```text
add USER                     # password on stdin; duplicate names rejected
passwd USER                  # admin reset; password on stdin
delete USER                   # remove account and grants
list                          # usernames/grants, never hashes
grant USER PATTERN ROLE       # replace that pattern's role
revoke USER PATTERN
```

Patterns: exact repository `team/image`, namespace `team/*` (all descendants,
not `team-other/*`), or global `*`. Roles: `reader` = pull; `writer` = pull/push;
`manager` = pull/push/delete. Matching grants add together; no deny rules. Registry
and UI deletion switches must also be enabled. CLI grant editing only affects
authorization in token mode.

Keep one running auth writer. CLI and API writes coordinate through a shared
`.writer.lock` directory, use fsync plus atomic file replacement, and preserve
other users. Use the CLI instead of editing files while the service is writing.
After an ungraceful crash, if `.writer.lock` remains, stop all writers and remove
that directory before restarting. Back up both account files together; protect
them and the signing key. File permissions default to 0600, directories to 0700.
Malformed files or mismatched modes fail closed.

## Verification

```sh
npm ci --prefix auth
npm run test:auth
npm run build
npm run test:auth:integration
# Optional: requires Playwright Chromium (npx playwright install chromium).
npm run test:auth:browser
# Actual Docker CLI login in an isolated docker:29-cli container:
node tests/accounts-integration.mjs --docker
```

Integration tests use temporary Distribution containers and isolated data, covering
both modes, real push/pull API operations, token denial and expiry, password changes,
ENV restrictions, catalog filtering, and direct access while UI processes are stopped.
