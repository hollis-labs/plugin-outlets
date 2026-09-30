// The dependency boundary, checked by behaviour: load each entry point in a
// fresh Node process whose resolver refuses the modules it must not need.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const hook = `data:text/javascript,${encodeURIComponent(`
export async function resolve(specifier, context, next) {
  if (BLOCK.test(specifier)) throw new Error('blocked import: ' + specifier)
  return next(specifier, context)
}`)}`

function load(entry, block) {
  const register = `import { register } from 'node:module'; register(${JSON.stringify(hook.replace('BLOCK', block))})`
  const r = spawnSync(
    process.execPath,
    ['--import', `data:text/javascript,${encodeURIComponent(register)}`, '--input-type=module', '-e', `const m = await import(${JSON.stringify(entry)}); console.log(Object.keys(m).sort().join(','))`],
    { encoding: 'utf8' },
  )
  return r
}
const dist = (f) => fileURLToPath(new URL(`../dist/${f}`, import.meta.url))

test('core entry (".") loads with react, react-dom and plugin-registry unresolvable', () => {
  const r = load(dist('index.js'), '/^(react|react-dom|@hollis-labs\\/plugin-registry)(\\/|$)/')
  assert.equal(r.status, 0, r.stderr)
  assert.equal(r.stdout.trim(), 'outletProps,readOutletMeta,sortByOutletPriority')
})

test('react entry ("./react") loads with plugin-registry unresolvable: it is type-only', () => {
  const r = load(dist('react.js'), '/^@hollis-labs\\/plugin-registry(\\/|$)/')
  assert.equal(r.status, 0, r.stderr)
  assert.equal(r.stdout.trim(), 'PluginOutlet,PluginSlot,defineOutletKind')
})

test('the blocker is real: blocking react makes the react entry fail to load', () => {
  const r = load(dist('react.js'), '/^react(\\/|$)/')
  assert.notEqual(r.status, 0)
  assert.match(r.stderr, /blocked import: react/)
})
