# @crateview/registry-ui

## 0.5.0

### Minor Changes

- b36e597: Add an independent file-backed account service, native htpasswd account management, Distribution token authorization with repository grants, and ENV-controlled user creation in the UI.

  Group Settings and Users under Administration, add the protected user list and creation page, and share Zod validation between UI forms and account APIs.

  Add a branded full-page sign-in, compact administration navigation, dashboard breadcrumbs, and CRM-style language/theme menus with shared animated theme changes and reduced-motion fallbacks.

- ca5b4e9: Add thirteen interface languages with native language selection and RTL support for Arabic and Urdu. Localize request errors and preserve technical text direction.

### Patch Changes

- bef4409: Require Node.js 26.13.0 LTS for development and production, update Docker images and Node.js types, and align installation documentation. Upgrade TypeScript to 6.0.3 and Shiki to 4.6.0.

## 0.4.0

### Minor Changes

- 702c379: Add an About section to Settings with searchable dependency licenses, original license texts and notices. Generate the inventory automatically from the lockfile and installed packages before development and production builds.
- 28ada87: Replace the duplicate Overview repository list with an optional Distribution monitoring dashboard. Collect persistent storage metrics and manifest notifications in SQLite, with authenticated access, 24-hour and 7-day charts, and explicit collection gaps. Keep Explore as the catalog and redirect there when monitoring is disabled.
- 702c379: Move theme and language preferences to a dedicated settings page. Align sidebar navigation with the Nuxt dashboard template, add icon links for documentation and GitHub, and group connection status and changelog in a compact footer card.
- f2e5d64: Add a searchable command palette with visible platform shortcuts and collapsible repository folders. Support single and bulk manifest deletion from repository tag tables with shared confirmation, fresh affected-tag details, digest deduplication, and partial failure reporting. Remove duplicate external-link icons and redundant sidebar branding.

### Patch Changes

- 0aecfdd: Use One Dark Pro for dark-mode syntax highlighting to distinguish JSON keys, strings, numbers, and booleans more clearly.
- 5b5a7f0: Show the signed-in username and dropdown indicator in the navbar account button, truncating long names on small screens.

## 0.3.0

### Minor Changes

- 9312ac6: Add theme-aware syntax highlighting with safe plain-text fallback for code blocks.

## 0.2.1

### Patch Changes

- fd8511f: Align the registry interface with the CRM dashboard layout: add a resizable, collapsible sidebar with locally persisted settings, move search into the sidebar, and use native dashboard navigation on mobile while preserving existing surface colors.

## 0.2.0

### Minor Changes

- cbd9f5a: Show repositories in a table by default, group slash-separated names into nested namespaces, and allow switching to the grid view on overview and explore pages.

## 0.1.2

### Patch Changes

- 5cf6264: Require Node 24.22.2, update vulnerable transitive dependencies and patch deepmerge prototype poisoning pending an upstream fix.
- 9d90749: Show installed version, update notifications and GitHub release changelog in the sidebar.

## 0.1.1

### Patch Changes

- 48d5b87: Start native version pull request checks automatically using the repository-scoped GitHub Actions token.

## 0.1.0

### Minor Changes

- Initial versioned Docker release with Changesets-managed releases.
