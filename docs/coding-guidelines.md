# Coding guidelines

These conventions adapt CRM tenant-web's Prettier configuration, Vue attribute ordering,
web spacing rules, and component patterns to registry-ui. The local configuration is
self-contained; CRM packages and tooling are not required.

## Formatting

- Use two-space indentation, semicolons, single quotes, trailing commas, and a 120-character print width.
- Order Vue single-file component blocks as `<template>`, `<script setup lang="ts">`, then `<style>` when present.
- Separate component blocks and the last import from subsequent statements with a blank line.
- Keep Vue script and style contents unindented. Use multiline content for elements other than inline spans.
- Order Vue attributes as directives, unique attributes, two-way bindings, other directives,
  static values, dynamic values, event listeners, and content bindings. ESLint defines the exact categories.
- Let Prettier organize imports and sort Tailwind classes using `app/assets/css/main.css`.
  Review import changes, including removal of unused imports, for required side effects.
- Do not format vendor code, dependency lockfiles, generated license data, or build/test output.

## Components and behavior

- Use `<script setup lang="ts">` and typed `defineProps()` / `defineEmits()` declarations.
- Use `defineModel()` for component-owned two-way binding contracts. Keep explicit event adapters
  when updates perform validation, persistence, or value transformations.
- Reuse Nuxt UI controls and existing local components and composables. Retain semantic elements,
  accessible names, keyboard behavior, and focus handling.
- Avoid `any`; use existing domain types and validate external inputs at their established boundaries.
- Preserve permissions, pending and disabled states, drafts, error handling, and confirmation dialogs.
- Use complete keys from the existing flat translation dictionaries. Do not introduce CRM namespaces.
  Add new messages to every supported locale and preserve interpolation placeholders.
- Keep registry protocols, server responses, and authentication contracts unchanged during style cleanup.

## Verification

Run from the registry-ui root with the Node version in `.nvmrc`:

```sh
npm run format
npm run lint -- --fix
npm run format:check
npm run lint
npm run typecheck
npm test
npm run test:auth
npm run build
```

Formatting and lint fixes must converge: repeating both commands must leave the files unchanged.
CI already checks formatting, lint, types, tests, and the production build.
For component behavior changes, also run the relevant existing Playwright tests against their
required running registry/application fixtures (`npm run test:e2e -- <test-file>`).
