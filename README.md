# @hollis-labs/plugin-outlets

Named extension points for plugin UIs. `PluginOutlet` renders every plugin that
contributed to a named kind, ordered; `PluginSlot` renders the one plugin at a
named id. Both read a plugin registry (the shape of
[`@hollis-labs/plugin-registry`](https://github.com/hollis-labs/plugin-sdk)) and
render each contribution's value as a React component.

The registry deliberately stops at "contributions are flat, and the order lives
in `meta`". This package is the small piece on top of that: a convention for
`meta.priority` and `meta.props`, and two components that use it.

## Status

**Pre-release.** This project is unreleased, not deployed, and has no outside consumers. It's being built in the open: the code, the docs, and this README describe what exists today, not a pitch for what's planned. Interfaces and behavior change without notice, and there are no compatibility guarantees yet.

See [CHANGELOG.md](./CHANGELOG.md) for what has changed.

## Install

```sh
npm install @hollis-labs/plugin-outlets
```

Not on npm yet, so that line does not work today. React 19 is an optional peer
of `./react`; `@hollis-labs/plugin-registry` is an optional peer that is used for
nothing at runtime (see Compatibility).

## Use

```tsx
import { createRoot } from 'react-dom/client'
import { createReactPluginRegistry } from '@hollis-labs/plugin-registry/react'
import { PluginOutlet, PluginSlot, defineOutletKind } from '@hollis-labs/plugin-outlets/react'

const registry = createReactPluginRegistry()

// The host serves this document; `meta` is the host's own, opaque to the registry.
await registry.sync({
  protocol: 1,
  plugins: {
    clock: { bundle_url: '/plugins/clock.js' },
    weather: { bundle_url: '/plugins/weather.js' },
  },
  contributions: {
    toolbar: {
      weather: { plugin_id: 'weather', export: 'Weather', meta: { priority: 20, props: { units: 'c' } } },
      clock: { plugin_id: 'clock', export: 'Clock', meta: { priority: 10 } },
    },
    'header.logo': { logo: { plugin_id: 'clock', export: 'Logo' } },
  },
})

// Bind a kind once, and (optionally) the props its occupants receive.
const Toolbar = defineOutletKind<{ theme: 'light' | 'dark' }>('toolbar')

createRoot(document.getElementById('root')!).render(
  <>
    {/* Clock (priority 10), then Weather (20). Each gets { theme } after its own meta.props. */}
    <Toolbar.Outlet registry={registry} props={{ theme: 'dark' }} fallback={<em>no tools</em>} loading={<i>...</i>} />

    {/* One occupant. If its bundle failed to load, the fallback learns whose it was. */}
    <PluginSlot
      registry={registry}
      kind="header.logo"
      id="logo"
      fallback={(owner) => <span>{owner ? `${owner} failed to load` : 'no logo'}</span>}
    />
  </>,
)
```

`PluginOutlet` is not called `Outlet` because that is React Router's name.

### Entry points

| Entry | Exports |
|---|---|
| `.` (no React, no DOM) | `readOutletMeta`, `sortByOutletPriority`, `outletProps`, types `OutletMeta`, `OutletRegistry`, `OutletContribution` |
| `./react` | `PluginOutlet`, `PluginSlot`, `defineOutletKind`, types `PluginOutletProps`, `PluginSlotProps`, `OutletRegistry`, `OutletContribution` |

### The `meta` convention

Opt-in, and this package's own. A registry never reads `meta`; a host that sets
neither field gets the registry's declared order and no extra props.

| Field | Meaning | Anything else |
|---|---|---|
| `meta.priority` | A finite number. **Ascending**: lower renders first. Ties keep declared order. | Missing or invalid (`NaN`, `Infinity`, a string, ...) sorts after every prioritized occupant, in declared order. Never coerced. |
| `meta.props` | A plain object, spread onto the occupant. | Ignored when it is not a plain object. |

Props precedence: `meta.props`, then the `props` you pass to the component. Yours win.

`limit` counts renderable occupants after ordering, so `limit={1}` is the lowest
priority number. A value that is not a component (with the registry's default
identity `adopt`, a bundle can export anything) is skipped and does not use up the limit.

### Errors

This package adds no error boundary. Containing a plugin that throws while
rendering is the registry's `adopt` hook, as `@hollis-labs/plugin-registry`'s
README draws that line. The only boundary added is `<Suspense>` (around each
occupant, with your `loading`), for `reactAdopt`'s `React.lazy` values. An
uncaught plugin error propagates to your own error boundary, or unmounts the
tree if you have none.

## Compatibility

`@hollis-labs/plugin-registry` is not imported at runtime, and its types are not
imported at all: the components accept a structural `OutletRegistry`
(`get`, `list`, `ownerOf`, `subscribe`, `version`), which the registry's
`PluginRegistry` satisfies. That is why the package builds, tests and publishes
without the registry on npm. The claim that the real type is assignable is
checked only by the tarball-gated test below, against registry 0.1.0 as packed from
`plugin-sdk` commit `c9ab8fb`; any other registry version is untested. React
`^19` (tested with 19.3.0), ESM only, Node 24 in CI (26 locally).

## What was read, and what was run

- **Read, not run:** Flux's UI slot system (`usePluginSlots`, `plugin-slot-lookup`,
  `UISlotName`/`UISlotEntry` in `apps/flux/src`), Tangent's `plugin-loader.ts` and
  `plugin_registry.go`, Tachyon's `PluginLoader` and `BuildRegistry`. They were read
  as evidence for the pattern; none was built or run, and none of their code or
  types is used here. **No behavioral equivalence with Flux's slot code is claimed.**
  The hook's doc comment says entries come back sorted by priority descending; where
  that sort happens was not read. This package is ascending, by decision. Flux speaks a
  different wire format.
- **Read and run:** the plugin-registry 0.1.0 `loader.ts`, `react.ts` and `types.ts`
  (packed from `c9ab8fb` and exercised by the tarball-gated test).
- **Run, by this repo's tests:** the `meta` reading and ordering, both components
  against a hand-written fake registry (server render and jsdom), the fake's
  agreement with the real registry on shared scenarios, and the type fixture.
- **Not run anywhere:** a real browser, any real host (no host populates `meta`
  today), and Firefox/Safari.

## Known limitations

- The fake registry (`test/fixtures/fake-registry.js`) is the ground truth for
  behaviour no real host has produced yet. It is re-diffed against the real registry
  only when a tarball is supplied.
- Ordering among unprioritized occupants is whatever `registry.list(kind)` returns,
  which follows JSON object key order. JavaScript puts integer-like keys ("1", "2")
  first, ascending, whatever order the host wrote them in.
- `limit` is not validated beyond clamping: `NaN` means no limit, negatives mean 0,
  fractions round down.
- A lazy (`reactAdopt`) occupant shows `loading` on a synchronous render; with
  `renderToStaticMarkup` that is all you get. The tests use `renderToReadableStream`
  and wait for `allReady` to see resolved lazy content.
- `props` is typed by `defineOutletKind`, but nothing checks a plugin's component
  against that type at runtime.
- The README example was run once by hand against the packed registry (with `importModule` stubbed, since its bundle URLs are illustrative); CI does not run it.

## Out of scope

- Any UI kit or component set for plugins.
- An error-boundary render prop (see Errors). Revisit if a real adopting host shows `adopt` is not enough.
- Version or runtime-compatibility checks (`plugin-host-runtime`'s `checkRuntime`).
- Fetching, loading or trusting bundles; that is the registry and the host.
- Anything that changes the registry wire contract; `OutletMeta` is two optional fields and stays that way.
- Migrating Flux or Nanite's slot system onto this, and Tachyon serving plugin bundles.
- Publishing.

## Development

```sh
npm ci
npm run typecheck   # src plus the typecheck-only fixture in test/types
npm test            # builds, then node --test against dist/
```

The real-registry test needs a `@hollis-labs/plugin-registry` tarball. Without one it
reports `SKIPPED` by name, and the skip is not a pass:

```sh
REGISTRY_TARBALL=/path/to/hollis-labs-plugin-registry-0.1.0.tgz npm test
```

The tarball is unpacked under `.registry-it/` (git-ignored); nothing local is
written to `package.json` or the lockfile. Release steps: [docs/RELEASING.md](./docs/RELEASING.md).

## License

MIT. See [LICENSE](./LICENSE).
