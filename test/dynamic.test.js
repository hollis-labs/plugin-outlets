// Client behaviour under jsdom: re-render on registry change, unload and
// re-register, unmount cleanup, state preservation, and error propagation.
import { JSDOM } from 'jsdom'
import { test, describe, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

const dom = new JSDOM('<!doctype html><div id="root"></div>')
for (const k of ['window', 'document', 'navigator']) Object.defineProperty(globalThis, k, { value: dom.window[k], configurable: true, writable: true })
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const { createElement: h, act, useState } = await import('react')
const { createRoot } = await import('react-dom/client')
const { PluginOutlet, PluginSlot } = await import('../dist/react.js')
const { registryFrom, wire, Label } = await import('./fixtures/render.js')

let container, root
const mount = async (el) => { await act(async () => { root.render(el) }) }
const text = () => container.textContent
const bs = () => [...container.querySelectorAll('b')].map((n) => n.textContent)

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})
after(() => dom.window.close())

const spec = {
  toolbar: [
    ['a', 'pa', Label('A'), { priority: 1 }],
    ['b', 'pb', Label('B'), { priority: 2 }],
    ['c', 'pc', Label('C'), { priority: 3 }],
  ],
}

describe('outlet follows the registry', () => {
  test('re-renders when the registry syncs new contributions, in priority order', async () => {
    const r = await registryFrom({ toolbar: [['b', 'pb', Label('B'), { priority: 2 }]] })
    await mount(h(PluginOutlet, { registry: r, kind: 'toolbar' }))
    assert.deepEqual(bs(), ['B'])
    const [resp, mods] = wire(spec)
    await act(async () => { await r.sync(resp, mods) })
    assert.deepEqual(bs(), ['A', 'B', 'C'])
  })

  test('unmount/re-register: unloading a plugin removes its occupant; re-registering restores it in order', async () => {
    const r = await registryFrom(spec)
    await mount(h(PluginOutlet, { registry: r, kind: 'toolbar' }))
    assert.deepEqual(bs(), ['A', 'B', 'C'])
    await act(async () => { r.unload('pb') })
    assert.deepEqual(bs(), ['A', 'C'])
    const [resp, mods] = wire(spec)
    await act(async () => { await r.sync(resp, mods) })
    assert.deepEqual(bs(), ['A', 'B', 'C'])
  })

  test('a plugin that fails on a later sync disappears, and the slot fallback names it', async () => {
    const r = await registryFrom(spec)
    await mount(h('div', null, h(PluginOutlet, { registry: r, kind: 'toolbar' }), h(PluginSlot, { registry: r, kind: 'toolbar', id: 'b', fallback: (o) => `lost:${o}` })))
    assert.ok(!text().includes('lost'))
    const [resp, mods] = wire(spec, ['pb'])
    await act(async () => { await r.sync(resp, mods) })
    assert.deepEqual(bs(), ['A', 'C'])
    assert.ok(text().includes('lost:pb'))
  })

  test('clear() empties the outlet and shows the fallback', async () => {
    const r = await registryFrom(spec)
    await mount(h(PluginOutlet, { registry: r, kind: 'toolbar', fallback: 'empty' }))
    await act(async () => { r.clear() })
    assert.equal(text(), 'empty')
  })

  test('a stateful occupant keeps its state when a sibling is added ahead of it (stable keys)', async () => {
    const Counter = () => { const [n, set] = useState(0); return h('button', { id: 'btn', onClick: () => set(n + 1) }, `n${n}`) }
    const r = await registryFrom({ toolbar: [['ctr', 'p1', Counter, { priority: 5 }]] })
    await mount(h(PluginOutlet, { registry: r, kind: 'toolbar' }))
    await act(async () => { container.querySelector('#btn').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })) })
    assert.equal(container.querySelector('#btn').textContent, 'n1')
    const [resp, mods] = wire({ toolbar: [['ctr', 'p1', Counter, { priority: 5 }], ['early', 'p2', Label('E'), { priority: 1 }]] })
    await act(async () => { await r.sync(resp, mods) })
    assert.deepEqual(bs(), ['E'])
    assert.equal(container.querySelector('#btn').textContent, 'n1', 'state survived a reorder')
  })
})

describe('subscription cleanup', () => {
  test('unmount unsubscribes from the registry', async () => {
    const r = await registryFrom(spec)
    assert.equal(r.listenerCount(), 0)
    await mount(h('div', null, h(PluginOutlet, { registry: r, kind: 'toolbar' }), h(PluginSlot, { registry: r, kind: 'toolbar', id: 'a' })))
    assert.equal(r.listenerCount(), 2)
    await act(async () => { root.unmount() })
    assert.equal(r.listenerCount(), 0)
  })

  test('nothing re-renders after unmount', async () => {
    let renders = 0
    const Probe = () => { renders++; return null }
    const r = await registryFrom({ toolbar: [['p', 'p1', Probe]] })
    await mount(h(PluginOutlet, { registry: r, kind: 'toolbar' }))
    await act(async () => { root.unmount() })
    const before = renders
    await act(async () => { r.unload('p1'); r.clear() })
    assert.equal(renders, before)
  })

  test('swapping the registry prop unsubscribes from the old one and follows the new one', async () => {
    const r1 = await registryFrom({ toolbar: [['a', 'p1', Label('A1')]] })
    const r2 = await registryFrom({ toolbar: [['a', 'p1', Label('A2')]] })
    await mount(h(PluginOutlet, { registry: r1, kind: 'toolbar' }))
    await mount(h(PluginOutlet, { registry: r2, kind: 'toolbar' }))
    assert.deepEqual(bs(), ['A2'])
    assert.equal(r1.listenerCount(), 0)
    assert.equal(r2.listenerCount(), 1)
  })
})

describe('containment: no error boundary is added', () => {
  test('a throwing plugin component is not caught by the outlet; React reports it uncaught', async () => {
    const Boom = () => { throw new Error('plugin exploded') }
    const r = await registryFrom({ toolbar: [['boom', 'p1', Boom]] })
    // With no boundary anywhere above it, React reports the error as uncaught
    // (act re-throws it). An outlet that contained it would not.
    await assert.rejects(mount(h(PluginOutlet, { registry: r, kind: 'toolbar', fallback: 'fb' })), /plugin exploded/)
    assert.equal(text(), '', 'the whole tree unmounted; nothing was contained by the outlet')
  })
})
