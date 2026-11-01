# Changesets

Run `npm run changeset` for a user-visible change and commit the generated Markdown file. Select this application and the appropriate patch, minor or major bump.

The release workflow maintains a version PR on `main`. Merging it updates the package version, lockfile and changelog, then publishes a Docker image and GitHub release. These private npm packages are never published to npm. See the repository README for release credentials and Docker usage.
