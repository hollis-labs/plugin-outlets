# Releasing

Nothing here has been run. The package is unpublished and untagged, and the GitHub
repository does not exist yet. CI gates; it never publishes. Publishing is done by
hand by the owner of the `@hollis-labs` scope, and the tag is created only after the
publish has succeeded and been checked, so a tag never names a version that was not
published.

1. Create the repository (maintainer): `gh repo create hollis-labs/plugin-outlets --public --source . --remote origin` then `git push -u origin main`.
2. Confirm CI is green on the commit you will release: both `gate` and `registry-integration`. Until `@hollis-labs/plugin-registry` 0.1.0 is on npm the second job reports the integration as SKIPPED; that is by design, not a pass. Before releasing, run it once locally with a tarball (`REGISTRY_TARBALL=... npm test`) so a release is not the first time the real registry is exercised.
3. In `CHANGELOG.md`, change `## Unreleased` to `## 0.1.0 — <date>` (em dash) and commit it.
4. `npm ci && npm test && npm pack --dry-run`. The file list is `dist/*`, `README.md`, `CHANGELOG.md`, `LICENSE` and `package.json`, with no `.map` files and no `src`. Confirm `package.json` has no `file:`, `link:` or `workspace:` dependency.
5. Publish, logged in as the scope owner: `npm publish --access public`.
6. Verify the publish before tagging:
   - `npm view @hollis-labs/plugin-outlets version` prints `0.1.0`.
   - In an EMPTY temporary directory, `npm install @hollis-labs/plugin-outlets@0.1.0 react react-dom`, then import both entry points (`.` and `/react`) from a small script.
7. Only after step 6 passes: `git tag -a v0.1.0 <sha>`, push the tag, then `gh release create v0.1.0 --notes-file <the CHANGELOG section>`.
8. Once `@hollis-labs/plugin-registry` 0.1.0 is on npm, check that CI's registry step (which packs it from the registry) starts running the integration instead of skipping it. If the registry's `PluginRegistry` shape has changed before then, re-diff `test/fixtures/fake-registry.js` and `src/types.ts` against it.
