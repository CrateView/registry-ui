# deepmerge security patch

Vendored from deepmerge 4.3.1 (MIT), bundled CommonJS distribution.

GHSA-gcqx-w48m-w2h4 has no upstream patched release. This copy rejects
`__proto__`, `constructor`, and `prototype` in source objects and while cloning
target objects, preventing prototype poisoning of the returned object.
Existing array merging, symbol keys, and custom merge options remain supported.

Remove this override when an upstream fix is available. Regression coverage:
`tests/deepmerge.test.ts`.
