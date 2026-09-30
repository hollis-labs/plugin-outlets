// Wire-level scenarios shared by the fake-registry tests and the
// tarball-gated real-registry test. A scenario is:
//   { name, response, modules, expect: { list: {kind: [keys in order]}, owners: {"kind/key": pluginId|undefined}, failed: [pluginIds] } }
// `expect` is what the REAL loader's contract says (`list` in declared order,
// resolved only; `ownerOf` for declared-but-failed too), so both registries
// must satisfy it. Ordering by priority is asserted separately, in the
// outlet tests, because the registry does not know about it.

export const PROTOCOL = 1
const C = (plugin_id, exp, meta) => ({ plugin_id, export: exp, ...(meta === undefined ? {} : { meta }) })
const P = (id) => ({ bundle_url: `/plugins/${id}.js` })
export const Comp = (name) => Object.assign(() => null, { displayName: name })

export const scenarios = [
  {
    name: 'two outlets, mixed priorities, declared order differs from priority order',
    response: {
      protocol: PROTOCOL,
      plugins: { a: P('a'), b: P('b'), c: P('c') },
      contributions: {
        toolbar: { z: C('a', 'Z', { priority: 30 }), y: C('b', 'Y', { priority: 10 }), x: C('c', 'X', { priority: 20 }) },
        rail: { r1: C('a', 'R1', { priority: 5 }), r2: C('b', 'R2') },
      },
    },
    modules: { a: { Z: Comp('Z'), R1: Comp('R1') }, b: { Y: Comp('Y'), R2: Comp('R2') }, c: { X: Comp('X') } },
    expect: { list: { toolbar: ['z', 'y', 'x'], rail: ['r1', 'r2'], nothing: [] }, owners: { 'toolbar/y': 'b', 'rail/r2': 'b', 'toolbar/nope': undefined }, failed: [] },
  },
  {
    name: 'a plugin whose bundle fails to load is absent from list but still owns its ids',
    response: {
      protocol: PROTOCOL,
      plugins: { good: P('good'), bad: P('bad') },
      contributions: { toolbar: { g: C('good', 'G', { priority: 2 }), b: C('bad', 'B', { priority: 1 }) }, slot: { only: C('bad', 'S') } },
    },
    modules: { good: { G: Comp('G') } },
    // "bad" is missing from modules: the real test's importModule throws for it.
    expect: { list: { toolbar: ['g'], slot: [] }, owners: { 'toolbar/b': 'bad', 'slot/only': 'bad', 'slot/none': undefined }, failed: ['bad'] },
  },
  {
    name: 'a declared export that the loaded module lacks is absent',
    response: { protocol: PROTOCOL, plugins: { a: P('a') }, contributions: { toolbar: { ok: C('a', 'Ok'), gone: C('a', 'Gone') } } },
    modules: { a: { Ok: Comp('Ok') } },
    expect: { list: { toolbar: ['ok'] }, owners: { 'toolbar/gone': 'a' }, failed: [] },
  },
]
