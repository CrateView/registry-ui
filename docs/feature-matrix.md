# Distribution UI feature coverage

| Capability                               | Data source                                                  | Proof                                                        |
| ---------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------ |
| Repositories, nested namespaces and tags | `/v2/_catalog`, `/v2/<name>/tags/list`, Link pagination      | Real Distribution browser tests                              |
| Search/suggestions and sorting           | Registry catalog/tag names; local filtering                  | Search and empty-state browser checks                        |
| Manifest, image config and layer history | Standard manifests and blobs APIs                            | Real Alpine detail test; raw JSON views                      |
| Multi-platform selection                 | OCI index / Docker manifest list descriptors                 | Real isolated OCI index fixture with amd64 and arm64 configs |
| Referrers and artifacts                  | OCI referrers endpoint or standard digest-tag index fallback | Real isolated SBOM referrer fixture                          |
| Basic login and logout                   | Registry Basic Auth, encrypted HttpOnly UI cookie            | Real official-registry htpasswd test                         |
| Digest deletion and aliases              | Manifest HEAD digests followed by DELETE by digest           | Real isolated manifest deletion with two affected tags       |
| Theme, language and mobile layout        | Nuxt UI, Nuxt Color Mode, Nuxt i18n                          | Browser reload, system emulation and mobile navigation       |
| Path validation and concurrency limits   | Server API boundary                                          | Unit tests                                                   |
| Branding and runtime theme overrides     | Runtime config / app config                                  | Branded test process and unit tests                          |

Zot-specific features are removed rather than presented as working features: GraphQL search, CVEs, stars/bookmarks, dependency index, download counts and API-key/OIDC administration. The official registry does not provide these services. Native image config creation time is labelled as image creation time, never registry push time. Repository previews use `latest` when present, otherwise the first tag alphabetically; they do not claim to identify the most recently pushed tag.
