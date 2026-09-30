// Tarball-gated integration against the REAL @hollis-labs/plugin-registry.
//
// That package is not on npm yet, so this needs a tarball:
//   REGISTRY_TARBALL=/path/to/hollis-labs-plugin-registry-0.1.0.tgz npm test
// Without it the test is reported as SKIPPED, by name, on purpose. A skip is
// not a pass: it means this repository's fake-registry tests are the only
// evidence for the registry-facing behaviour.
//
// Nothing is installed or written into package.json. The tarball is unpacked
// into .registry-it/node_modules (git-ignored); the bare `react` import in the
// unpacked registry resolves to this repo's own node_modules, so there is one
// React.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { renderToReadableStream } from 'react-dom/server'
import { createElement as h } from 'react'
import { PluginOutlet, PluginSlot } from '../dist/react.js'
import { createFakeRegistry } from './fixtures/fake-registry.js'
import { scenarios } from './fixtures/scenarios.js'
import { Label } from './fixtures/render.js'

const tgz = process.env.REGISTRY_TARBALL
const NAME = 'registry integration (real @hollis-labs/plugin-registry from REGISTRY_TARBALL)'

if (!tgz) {
  console.log('SKIPPED (not a pass): registry integration. Set REGISTRY_TARBALL to a plugin-registry .tgz to run it.')
  test(NAME, { skip: 'SKIPPED: REGISTRY_TARBALL is unset; plugin-registry is not on npm yet' }, () => {})
} else {
  const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const work = path.join(repo, '.registry-it')
  const pkgDir = path.join(work, 'node_modules/@hollis-labs/plugin-registry')
  fs.rmSync(work, { recursive: true, force: true })
  fs.mkdirSync(pkgDir, { recursive: true })
  execFileSync('tar', ['-xzf', path.resolve(tgz), '--strip-components=1', '-C', pkgDir])
  const reg = await import(pathToFileURL(path.join(pkgDir, 'dist/index.js')).href)
  const regReact = await import(pathToFileURL(path.join(pkgDir, 'dist/react.js')).href)

  const importer = (modules) => async (url) => {
    const id = /\/plugins\/(.+)\.js$/.exec(url)?.[1]
    if (!(id in modules)) throw new Error(`no such bundle: ${url}`)
    return modules[id]
  }
  const realFor = (modules, options = {}) => reg.createPluginRegistry({ stylesheets: false, importModule: importer(modules), ...options })
  const stream = async (el) => {
    const s = await renderToReadableStream(el)
    await s.allReady
    return new Response(s).text()
  }
  const bs = (markup) => [...markup.matchAll(/<b>([^<]*)<\/b>/g)].map((m) => m[1])

  test(`${NAME}: type check, a real PluginRegistry is assignable to OutletRegistry`, () => {
    fs.writeFileSync(
      path.join(work, 'check.tsx'),
      `import type { PluginRegistry, AdoptedContribution } from '@hollis-labs/plugin-registry'
import { PluginOutlet, PluginSlot } from '../dist/react.js'
import type { OutletContribution } from '../dist/react.js'
import { outletProps, sortByOutletPriority } from '../dist/index.js'
declare const registry: PluginRegistry
declare const adopted: AdoptedContribution
export const a = <PluginOutlet registry={registry} kind="k" />
export const b = <PluginSlot registry={registry} kind="k" id="i" />
export const c: OutletContribution = adopted
export const d = outletProps(adopted)
export const e: AdoptedContribution[] = sortByOutletPriority(registry.list('k'))
`,
    )
    fs.writeFileSync(
      path.join(work, 'tsconfig.json'),
      JSON.stringify({ extends: '../tsconfig.json', compilerOptions: { types: ['node'] }, include: ['check.tsx'] }),
    )
    execFileSync(path.join(repo, 'node_modules/.bin/tsc'), ['--noEmit', '-p', path.join(work, 'tsconfig.json')], { stdio: 'pipe' })
  })

  for (const s of scenarios) {
    test(`${NAME}: the real registry and the fake agree: ${s.name}`, async () => {
      const real = realFor(s.modules)
      await real.sync(s.response)
      const fake = createFakeRegistry()
      await fake.sync(s.response, s.modules)
      for (const [kind, keys] of Object.entries(s.expect.list)) {
        assert.deepEqual(real.list(kind).map((c) => c.key), keys, `real list(${kind})`)
        assert.deepEqual(fake.list(kind).map((c) => c.key), keys, `fake list(${kind})`)
      }
      for (const [r, owner] of Object.entries(s.expect.owners)) {
        const [kind, key] = r.split('/')
        assert.equal(real.ownerOf(kind, key), owner, `real ownerOf(${r})`)
      }
      assert.deepEqual(real.errors().map((e) => e.pluginId).sort(), [...s.expect.failed].sort())
    })
  }

  test(`${NAME}: outlet renders real contributions by meta.priority through reactAdopt (lazy)`, async () => {
    const s = {
      protocol: 1,
      plugins: { a: { bundle_url: '/plugins/a.js' }, b: { bundle_url: '/plugins/b.js' }, c: { bundle_url: '/plugins/c.js' }, bad: { bundle_url: '/plugins/bad.js' } },
      contributions: {
        toolbar: {
          third: { plugin_id: 'a', export: 'Third', meta: { priority: 30 } },
          broken: { plugin_id: 'bad', export: 'Broken', meta: { priority: 5 } },
          first: { plugin_id: 'b', export: 'First', meta: { priority: 10 } },
          second: { plugin_id: 'c', export: 'Second', meta: { priority: 20 } },
          unprioritised: { plugin_id: 'a', export: 'Last' },
        },
      },
    }
    const modules = { a: { Third: Label('Third'), Last: Label('Last') }, b: { First: Label('First') }, c: { Second: Label('Second') } }
    const registry = realFor(modules, { adopt: regReact.reactAdopt })
    await registry.sync(s)
    assert.deepEqual(bs(await stream(h(PluginOutlet, { registry, kind: 'toolbar' }))), ['First', 'Second', 'Third', 'Last'])
    assert.deepEqual(bs(await stream(h(PluginOutlet, { registry, kind: 'toolbar', limit: 2 }))), ['First', 'Second'])
    assert.equal(await stream(h(PluginSlot, { registry, kind: 'toolbar', id: 'broken', fallback: (o) => `lost:${o}` })), 'lost:bad')
    assert.equal(await stream(h(PluginSlot, { registry, kind: 'toolbar', id: 'nobody', fallback: (o) => `lost:${o}` })), 'lost:undefined')
    assert.deepEqual(bs(await stream(h(PluginSlot, { registry, kind: 'toolbar', id: 'first' }))), ['First'])
  })

  test(`${NAME}: default identity adopt, unload and re-sync change what the outlet shows`, async () => {
    const response = {
      protocol: 1,
      plugins: { a: { bundle_url: '/plugins/a.js' }, b: { bundle_url: '/plugins/b.js' } },
      contributions: { rail: { one: { plugin_id: 'a', export: 'One', meta: { priority: 2 } }, two: { plugin_id: 'b', export: 'Two', meta: { priority: 1 } } } },
    }
    const registry = realFor({ a: { One: Label('One') }, b: { Two: Label('Two') } })
    await registry.sync(response)
    const markup = () => stream(h(PluginOutlet, { registry, kind: 'rail' }))
    assert.deepEqual(bs(await markup()), ['Two', 'One'])
    registry.unload('b')
    assert.deepEqual(bs(await markup()), ['One'])
    await registry.sync(response)
    assert.deepEqual(bs(await markup()), ['Two', 'One'])
    assert.equal(typeof registry.subscribe, 'function')
  })
}
