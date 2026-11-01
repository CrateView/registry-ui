<p align="center"><img src="public/branding/crateview-mark-256.png" width="112" height="112" alt="Crateview logo"></p>

# Crateview

[Website](https://crateview.de) · [Security](SECURITY.md) · [Buy Me a Coffee](https://buymeacoffee.com/tobiaswaelde)

Crateview is a modern, themeable dashboard for Docker and OCI container registries, built with Nuxt 4 and Nuxt UI 4. It uses the standard Registry HTTP API V2, OCI manifests and image configs.

## Local development

Requires Node.js 24 and a running Distribution registry.

```sh
npm ci
cp .env.example .env
npm run dev
```

UI: http://localhost:3000. Default registry: http://127.0.0.1:5000. Hot module replacement is enabled.

The frontend is a SPA. Nitro reads runtime ENV and talks to the registry server-side, avoiding browser CORS requirements. `/v2/**` is a streaming proxy for Docker/Podman/ORAS clients; `/api/registry/**` derives UI metadata from catalog, tags, manifests and config blobs. Raw manifest and config JSON can be inspected and copied from image details.

## Run the complete stack

```sh
docker compose pull
docker compose up -d
```

Compose pulls the public `ghcr.io/crateview/registry-ui:v0.1.0` image (Linux amd64) and starts `registry:3.1.2` and the frontend, exposes only http://localhost:3000 and persists registry storage in the `registry-data` volume. CLI example:

```sh
docker tag alpine:latest localhost:3000/alpine:latest
docker push localhost:3000/alpine:latest
docker pull localhost:3000/alpine:latest
```

For a standalone frontend, set `NUXT_REGISTRY_UPSTREAM` to your existing registry origin. Production starts with `HOST=0.0.0.0 PORT=3000 node .output/server/index.mjs`. `.env` is read automatically in development/build; the production Node process uses actual environment variables. Never put registry credentials into `NUXT_PUBLIC_*` or the upstream URL.

## Registry-native capabilities

- Paginated catalog/tag discovery, repository-name search and tag suggestions, alphabetical sorting.
- Repository and tag details, OCI/Docker multi-platform manifests, config-derived OS/architecture and image creation time, compressed layer sizes and history.
- OCI annotations/labels for description, vendor, source, docs and license. Registry push time and download counts are not available from this API and are not invented from image creation times.
- Raw manifest/config documents, OCI referrers and artifact annotations, with the standard digest-tag index fallback for registries without a referrers endpoint. The UI reads fallback indexes maintained by OCI clients; it does not invent an index by scanning all manifests.
- Docker, Podman, Skopeo and ORAS commands and clipboard support.
- Anonymous access and native `htpasswd` Basic Auth. External token/Bearer services show an explicit unsupported-auth notice; there is no built-in OIDC server or user/API-key management.
- Favorites, CVE scanning, a dependency index, download statistics and signature trust verification are outside the standard registry API and are not implemented. Referrer artifacts may contain signatures, but listing them does not claim cryptographic validation.

Metadata is loaded on demand, with bounded parallelism per request. Name search loads the full paginated catalog; platform metadata is derived for visible repositories rather than pretending there is a server-side metadata search index. Large tag lists can require many requests to obtain sortable creation dates.

## Authentication and deletion

Basic credentials are validated against `/v2/`. The server stores them only in an encrypted, HttpOnly, SameSite=Strict session cookie, never localStorage. Session lifetime is eight hours. HTTPS enables the Secure cookie flag. Set a cryptographically random `NUXT_SESSION_PASSWORD` (at least 32 characters) for stable production sessions:

```sh
openssl rand -base64 32
```

Without a configured secret, a random process-local secret is generated; restarting the process invalidates sessions. All instances behind a load balancer must share the same secret. The registry remains responsible for access control. Logout clears the UI session; it does not administer registry users.

Manifest deletion is off by default in the UI. Enable `NUXT_REGISTRY_DELETE_ENABLED=true` and enable `storage.delete.enabled` in Distribution to expose it. Standard deletion uses a **digest**, not a tag: all tags pointing at that manifest are affected. The confirmation lists these tags. A concurrent registry writer can change references after the preview; there is no registry transaction API to lock aliases. Deletion does not run garbage collection or promise immediate disk reclamation.

## Branding and theme

See [.env.example](.env.example). Runtime `NUXT_PUBLIC_BRAND_*` variables control name, description, separate light/dark logos, favicon, page title template and optional links. Runtime `NUXT_PUBLIC_THEME_*` variables override the defaults in `app/app.config.ts`: primary `red`, neutral `zinc`, radius and font family. Other Nuxt UI component/icon overrides use standard `ui` app config; CSS tokens live in `app/assets/css/main.css`.

Defaults use the system color scheme. Users can select System/Light/Dark and English/German; preferences persist independently of sign-out. Custom logos/fonts can be bundled under `public/` or served via configured HTTP(S) URLs. No theme-color editor is shown to end users.

## Checks

```sh
npm run typecheck
npm run lint
npm test
npm run format:check
npm run build
npx playwright install chromium
```

The browser suite reads the local registry on port 5000 containing `alpine:latest`. Its Basic Auth, deletion, multi-platform and referrer tests use a **separate official Distribution container** on port 5001 and a branded frontend on port 3001. Test data uses tmpfs; production/local registry data is not deleted.

```sh
# Separate terminal; requires Docker and an existing production frontend build.
node tests/registry-fixture.mjs
# Seed only the isolated test registry from local Alpine, then run browser tests.
node tests/seed-registry.mjs
npm run test:e2e
```

Test-only credentials: `developer` / `test-password`. Stop the fixture with Ctrl+C. Re-seed before repeating the suite because it intentionally deletes only the isolated `deletable` repository's manifest and aliases. `PLAYWRIGHT_CHROMIUM_EXECUTABLE` can select an installed Chromium.

## Support and maintenance

Support development through [Buy Me a Coffee](https://buymeacoffee.com/tobiaswaelde). GitHub funding links are configured in `.github/FUNDING.yml`.

Dependabot checks npm dependencies, Dockerfile and Compose images, and GitHub Actions weekly. The CI workflow validates types, linting, formatting, unit tests and the production build. Report vulnerabilities through the private channel described in [SECURITY.md](SECURITY.md).

## Brand assets

The Crateview mark combines a container crate and a C-shaped viewing aperture. The transparent master and a UI-sized version live in `public/branding/`. The same mark is used for `public/favicon.ico` (16/32/48 px) and the Apple touch icon. Branding remains replaceable through the existing environment variables.

## Docker updates and source builds

Set `CRATEVIEW_VERSION` in `.env` to a released `v`-prefixed tag (initially `v0.1.0`). Review release notes before updating:

```sh
docker compose pull frontend
docker compose up -d --no-deps frontend
```

To roll back, restore the previous `CRATEVIEW_VERSION` and repeat these commands. Keep the runtime environment and existing data volumes. For a local source build instead:

```sh
docker compose -f compose.yaml -f compose.build.yaml up --build -d
```

## Versioning and releases

Both applications release independently. Run `npm run changeset` for a user-visible change and commit the generated file. Choose a patch, minor or major bump. The workflow maintains a version PR, using `npm run version` to update the package version, lockfile and changelog. Merge that PR to publish the release; do not use `npm version`.

Releases on `main` run the CI checks before publishing to GHCR with `v<version>`, `latest` and `sha-...` tags. Only after verifying the image does the workflow create the Git tag and GitHub release. The initial `0.1.0` release is bootstrapped without a changeset. Rerun the Release workflow after a transient failure; existing tags and releases are preserved. Packages remain private to npm and are never uploaded there. The `release` script exposes the Changesets CLI publishing command; the Docker workflow manages application releases itself.

Release PRs use the repository-scoped, short-lived `GITHUB_TOKEN`. No personal token or `CHANGESETS_PR_TOKEN` secret is required. Enable **Allow GitHub Actions to create and approve pull requests** in the organization and repository Actions settings. Default workflow permissions stay read-only; the release job requests the contents, pull requests, packages and Actions write permissions it needs.

After creating or updating a version PR, the release workflow explicitly dispatches `ci.yml` on its head branch. This runs the usual checks automatically even when bot-created PR events require approval. It does not merge or approve the version PR. After review and successful CI, merge the PR to publish its Docker release. See [GitHub's workflow-triggering rules](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow#triggering-a-workflow-from-a-workflow).

The `registry-ui` GHCR package is **public** and supports anonymous Docker pulls. The organization allows public packages; new packages still need an explicit visibility choice. Keep the separate website package private.
