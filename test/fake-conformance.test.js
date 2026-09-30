// The fake registry must satisfy the contract facts the outlet tests lean on.
// test/registry-integration.test.js checks the SAME scenarios against the real
// registry when a tarball is supplied; together they keep the fake honest.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createFakeRegistry } from './fixtures/fake-registry.js'
import { scenarios } from './fixtures/scenarios.js'

for (const s of scenarios) {
  test(`fake registry: ${s.name}`, async () => {
    const r = createFakeRegistry()
    await r.sync(s.response, s.modules)
    for (const [kind, keys] of Object.entries(s.expect.list)) assert.deepEqual(r.list(kind).map((c) => c.key), keys, `list(${kind})`)
    for (const [ref, owner] of Object.entries(s.expect.owners)) {
      const [kind, key] = ref.split('/')
      assert.equal(r.ownerOf(kind, key), owner, `ownerOf(${ref})`)
    }
    assert.deepEqual(r.errors().map((e) => e.pluginId).sort(), [...s.expect.failed].sort())
  })
}

test('fake registry: subscribe is stable, notifies, and unsubscribes; version advances per change', async () => {
  const r = createFakeRegistry()
  assert.equal(r.subscribe, r.subscribe)
  assert.equal(r.version, r.version)
  let n = 0
  const off = r.subscribe(() => n++)
  const v0 = r.version()
  await r.sync({ protocol: 1, plugins: {}, contributions: {} }, {})
  assert.equal(n, 1)
  assert.ok(r.version() > v0)
  off()
  r.clear()
  assert.equal(n, 1)
  assert.equal(r.listenerCount(), 0)
})
