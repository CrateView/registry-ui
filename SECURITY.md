# Security policy

## Supported versions

Crateview is currently in pre-release development. Security fixes are applied to the latest `main` branch. Older commits are not maintained as separate security branches. A stable release support policy will be documented when stable releases are published.

## Report a vulnerability privately

Use [GitHub private vulnerability reporting](https://github.com/CrateView/registry-ui/security/advisories/new) to report a suspected vulnerability in Crateview. Do not publish sensitive details or proof-of-concept credentials in public issues or pull requests before a fix can be coordinated.

Please include:

- The affected commit or release and relevant deployment configuration.
- Reproduction steps and the expected impact.
- A minimal proof of concept using test data, when available.
- Whether authentication, a specific registry configuration or user interaction is required.

Remove passwords, session cookies, tokens and private image contents before attaching logs. Test only systems and data you are authorized to access. The maintainers will coordinate investigation and disclosure through the private report; no response-time commitment is made.

## Scope

Relevant Crateview concerns include authentication and session handling, authorization forwarding, request proxying, untrusted registry metadata rendering, and exploitable application dependency vulnerabilities.

Crateview is a UI and proxy for an existing registry; the registry remains responsible for access control and storage. Report issues in upstream components to their maintainers when they can be reproduced independently of Crateview. For the official Distribution registry, use its [security policy](https://github.com/distribution/distribution/security/policy).

## Deployment guidance

- Use HTTPS for remote authenticated deployments.
- Configure a cryptographically random `NUXT_SESSION_PASSWORD` of at least 32 characters, shared across frontend instances.
- Keep credentials out of `NUXT_PUBLIC_*` variables and public source files.
- Keep the registry's authentication and access controls enabled as appropriate for your environment.
- Enable manifest deletion only when intended; deleting a digest can remove every tag pointing at it.
