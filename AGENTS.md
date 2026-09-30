# plugin-outlets

Named extension points for plugin UIs over a plugin registry's contributions:
`PluginOutlet` (many occupants, ordered) and `PluginSlot` (one occupant).
TypeScript, ESM, React 19 optional peer behind `./react`. Pre-release; see the
README's Status.

## Start Here

- `src/index.ts` owns the `meta` convention (`readOutletMeta`, `sortByOutletPriority`, `outletProps`). No React.
- `src/react.ts` owns `PluginOutlet`, `PluginSlot`, `defineOutletKind`.
- `src/types.ts` owns `OutletRegistry`, the structural view of a registry. It is deliberately not imported from `@hollis-labs/plugin-registry`.
- `test/fixtures/fake-registry.js` and `test/fixtures/scenarios.js` are the only ground truth for registry behaviour until a host populates `meta`.

## Commands

```sh
npm ci
npm run typecheck
npm test     # builds, then node --test against dist/
REGISTRY_TARBALL=/path/to/hollis-labs-plugin-registry-0.1.0.tgz npm test   # adds the real-registry test
```

Tests import `dist/`, so `npm test` builds first. Do not run `npm publish`, tag or
push from here; publishing is the scope owner's manual step, in `docs/RELEASING.md`.

## Boundaries

Each invariant below is guarded by a named test. Break one on purpose and that test
should fail; if it does not, the guard is not doing its job.

- **Order is `meta.priority` ascending, ties in declared order, missing or invalid priority last, never coerced.** Guarded by `core.test.js` ("orders ascending by priority", "ties keep declared order", "missing priority sorts after ...", "invalid priority is treated as missing") and, through the component, by `outlet.test.js` ("orders occupants by meta.priority ascending", "ties keep declared order", "missing and invalid priorities sort after ...").
- **`readOutletMeta` never throws and never coerces.** `core.test.js` "drops invalid priorities instead of coercing them", "reads props only when it is a plain object", "a __proto__ key from JSON ...".
- **Caller props win over `meta.props`.** `outlet.test.js` "caller props are spread after meta.props and win on collision" (and the `PluginSlot` twin).
- **No error boundary is added; containment is the registry's `adopt`.** `dynamic.test.js` "a throwing plugin component is not caught by the outlet", `outlet.test.js` "an adopt that wraps components contains a throwing plugin", and the `@ts-expect-error` on an `error` prop in `test/types/outlet-kind.tsx`. Do not add an `error` render prop without a real adopting host that shows `adopt` is insufficient.
- **A component that unmounts unsubscribes from the registry.** `dynamic.test.js` "unmount unsubscribes from the registry", "nothing re-renders after unmount", "swapping the registry prop unsubscribes ...".
- **The outlet follows the registry, including unload and re-register, without remounting survivors.** `dynamic.test.js` "unmount/re-register ...", "a stateful occupant keeps its state ...".
- **An empty slot can name whose bundle failed.** `outlet.test.js` "a plugin load failure is attributed ..." and `dynamic.test.js` "a plugin that fails on a later sync disappears, and the slot fallback names it".
- **Non-renderable values are skipped and do not use up `limit`.** `outlet.test.js` "occupants whose value is not renderable are skipped ...".
- **The core entry has no React and no registry import; `./react` has no runtime registry import.** `isolation.test.js`, which loads each entry in a process whose resolver refuses those modules.
- **`defineOutletKind` binds the kind and constrains props at compile time.** `test/types/outlet-kind.tsx`, checked by `npm run typecheck` (a `@ts-expect-error` that stops erroring fails the typecheck).
- **The fake registry and the real one agree.** `registry-integration.test.js` runs the shared `scenarios.js` on both. It is SKIPPED without `REGISTRY_TARBALL`, and a skip is not a pass. `fake-conformance.test.js` holds the fake to the same expectations without a tarball.
- **The tarball ships `dist`, README, CHANGELOG, LICENSE and nothing else; no source maps.** Not guarded by a test. It is `files` in `package.json`, `sourceMap`/`declarationMap` false in `tsconfig.build.json`, `rm -rf dist` in `build`, and the `npm pack --dry-run` step in CI and the release runbook.
- **`OutletMeta` stays two optional fields.** Not guarded by a test beyond `core.test.js` "unrelated fields only yields {}"; a new field is a wire-contract decision for the registry's owners, not a change to make here.
- **Do not import or copy Flux's `UISlotName`/`UISlotEntry` or read Nanite's wire shape; do not depend on `@hollis-labs/plugin-host-runtime`.** Review-only; nothing guards it.
- **No `file:`, `link:` or `workspace:` entries in `package.json` or the lockfile, and no tarballs or local paths committed.** Review-only; `.gitignore` covers `*.tgz` and `.registry-it/`.

## Conventions

- Source imports carry `.js` extensions; `tsconfig.build.json` emits with no maps.
- Tests are plain `.js` against `dist/`, using `createElement`, not JSX.
- Do not write a new check that asserts the content of a mutable file or that two sources agree; raise it instead.
