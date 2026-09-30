// Wiring tests against the hand-written fake registry, rendered with
// react-dom/server (synchronous, no DOM). Each acceptance criterion in the
// brief has a test named for it.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { renderToReadableStream } from 'react-dom/server'
import { PluginOutlet, PluginSlot, defineOutletKind } from '../dist/react.js'
import { registryFrom, Label, Tag, html, h, lazyOf, wire } from './fixtures/render.js'
import { createFakeRegistry } from './fixtures/fake-registry.js'

const bs = (markup) => [...markup.matchAll(/<b>([^<]*)<\/b>/g)].map((m) => m[1])
const outlet = (registry, extra = {}) => html(h(PluginOutlet, { registry, kind: 'toolbar', ...extra }))

describe('PluginOutlet ordering', () => {
  test('orders occupants by meta.priority ascending, not declared order', async () => {
    const r = await registryFrom({
      toolbar: [
        ['z', 'p1', Label('Z'), { priority: 30 }],
        ['y', 'p2', Label('Y'), { priority: 10 }],
        ['x', 'p3', Label('X'), { priority: 20 }],
      ],
    })
    assert.deepEqual(bs(outlet(r)), ['Y', 'X', 'Z'])
  })

  test('with no priorities anywhere, declared order is kept', async () => {
    const r = await registryFrom({ toolbar: [['b', 'p1', Label('B')], ['a', 'p2', Label('A')], ['c', 'p3', Label('C')]] })
    assert.deepEqual(bs(outlet(r)), ['B', 'A', 'C'])
  })

  test('ties keep declared order', async () => {
    const r = await registryFrom({
      toolbar: [
        ['t1', 'p1', Label('T1'), { priority: 5 }],
        ['low', 'p2', Label('Low'), { priority: 1 }],
        ['t2', 'p3', Label('T2'), { priority: 5 }],
        ['t3', 'p4', Label('T3'), { priority: 5 }],
      ],
    })
    assert.deepEqual(bs(outlet(r)), ['Low', 'T1', 'T2', 'T3'])
  })

  test('duplicate priority across different plugins does not drop or merge occupants', async () => {
    const r = await registryFrom({ toolbar: [['a', 'p1', Label('A'), { priority: 1 }], ['b', 'p2', Label('B'), { priority: 1 }]] })
    assert.deepEqual(bs(outlet(r)), ['A', 'B'])
  })

  test('missing and invalid priorities sort after prioritized occupants, in declared order', async () => {
    const r = await registryFrom({
      toolbar: [
        ['none', 'p1', Label('None')],
        ['str', 'p2', Label('Str'), { priority: '1' }],
        ['ok', 'p3', Label('Ok'), { priority: 50 }],
        ['nan', 'p4', Label('NaN'), { priority: NaN }],
        ['neg', 'p5', Label('Neg'), { priority: -1 }],
      ],
    })
    assert.deepEqual(bs(outlet(r)), ['Neg', 'Ok', 'None', 'Str', 'NaN'])
  })

  test('outlets of different kinds on one registry are independent', async () => {
    const r = await registryFrom({
      toolbar: [['t', 'p1', Label('T'), { priority: 2 }], ['t0', 'p2', Label('T0'), { priority: 1 }]],
      rail: [['r', 'p3', Label('R')]],
    })
    assert.deepEqual(bs(outlet(r)), ['T0', 'T'])
    assert.deepEqual(bs(html(h(PluginOutlet, { registry: r, kind: 'rail' }))), ['R'])
  })
})

describe('PluginOutlet fallback, unknown outlets and load failure', () => {
  test('an unknown outlet renders the fallback', async () => {
    const r = await registryFrom({ toolbar: [['a', 'p1', Label('A')]] })
    assert.equal(html(h(PluginOutlet, { registry: r, kind: 'nope', fallback: h('em', null, 'empty') })), '<em>empty</em>')
  })

  test('with no fallback an empty outlet renders nothing', async () => {
    const r = await registryFrom({ toolbar: [['a', 'p1', Label('A')]] })
    assert.equal(html(h(PluginOutlet, { registry: r, kind: 'nope' })), '')
  })

  test('a registry that has never synced renders the fallback', () => {
    const r = createFakeRegistry()
    assert.equal(html(h(PluginOutlet, { registry: r, kind: 'toolbar', fallback: 'none yet' })), 'none yet')
  })

  test('the fallback is not rendered alongside occupants', async () => {
    const r = await registryFrom({ toolbar: [['a', 'p1', Label('A')]] })
    assert.equal(outlet(r, { fallback: h('em', null, 'empty') }), '<b>A</b>')
  })

  test('a plugin that failed to load is absent; the rest of the outlet still renders in order', async () => {
    const r = await registryFrom(
      { toolbar: [['a', 'p1', Label('A'), { priority: 1 }], ['broken', 'bad', Label('Broken'), { priority: 2 }], ['c', 'p3', Label('C'), { priority: 3 }]] },
      { failed: ['bad'] },
    )
    assert.deepEqual(bs(outlet(r)), ['A', 'C'])
  })

  test('if every plugin failed, the outlet falls back', async () => {
    const r = await registryFrom({ toolbar: [['a', 'bad', Label('A')]] }, { failed: ['bad'] })
    assert.equal(outlet(r, { fallback: 'all failed' }), 'all failed')
  })

  test('occupants whose value is not renderable are skipped, and do not use up the limit', async () => {
    const r = await registryFrom(
      { toolbar: [['s', 'p1', 'a string', { priority: 1 }], ['n', 'p2', null, { priority: 2 }], ['o', 'p3', { plain: true }, { priority: 3 }], ['a', 'p4', Label('A'), { priority: 4 }], ['b', 'p5', Label('B'), { priority: 5 }]] },
    )
    assert.deepEqual(bs(outlet(r, { limit: 1 })), ['A'])
  })
})

describe('PluginOutlet limit', () => {
  const spec = { toolbar: [['c', 'p1', Label('C'), { priority: 3 }], ['a', 'p2', Label('A'), { priority: 1 }], ['b', 'p3', Label('B'), { priority: 2 }]] }
  test('limit applies after ordering: the lowest priorities win', async () => {
    const r = await registryFrom(spec)
    assert.deepEqual(bs(outlet(r, { limit: 2 })), ['A', 'B'])
  })
  test('limit larger than the occupant count shows all', async () => {
    assert.deepEqual(bs(outlet(await registryFrom(spec), { limit: 99 })), ['A', 'B', 'C'])
  })
  test('limit 0 renders the fallback', async () => {
    assert.equal(outlet(await registryFrom(spec), { limit: 0, fallback: 'none' }), 'none')
  })
  test('a negative limit behaves as 0; a fractional limit rounds down', async () => {
    const r = await registryFrom(spec)
    assert.equal(outlet(r, { limit: -3, fallback: 'none' }), 'none')
    assert.deepEqual(bs(outlet(r, { limit: 1.9 })), ['A'])
  })
  test('NaN limit is ignored (no limit); Infinity is no limit', async () => {
    const r = await registryFrom(spec)
    assert.deepEqual(bs(outlet(r, { limit: NaN })), ['A', 'B', 'C'])
    assert.deepEqual(bs(outlet(r, { limit: Infinity })), ['A', 'B', 'C'])
  })
})

describe('props', () => {
  const echo = (markup) => JSON.parse(/data-props="([^"]*)"/.exec(markup)[1].replaceAll('&quot;', '"'))

  test('meta.props are spread onto the occupant', async () => {
    const r = await registryFrom({ toolbar: [['a', 'p1', Tag('A'), { props: { tone: 'quiet', n: 1 } }]] })
    assert.deepEqual(echo(outlet(r)), { tone: 'quiet', n: 1 })
  })

  test('caller props are spread after meta.props and win on collision', async () => {
    const r = await registryFrom({ toolbar: [['a', 'p1', Tag('A'), { props: { tone: 'quiet', keep: 'meta' } }]] })
    assert.deepEqual(echo(outlet(r, { props: { tone: 'loud', extra: true } })), { tone: 'loud', keep: 'meta', extra: true })
  })

  test('no meta and no caller props: the occupant gets an empty props object', async () => {
    const r = await registryFrom({ toolbar: [['a', 'p1', Tag('A')]] })
    assert.deepEqual(echo(outlet(r)), {})
  })

  test('the same caller props reach every occupant; each keeps its own meta.props', async () => {
    const r = await registryFrom({ toolbar: [['a', 'p1', Tag('A'), { props: { who: 'a' } }], ['b', 'p2', Tag('B'), { props: { who: 'b' } }]] })
    const all = [...outlet(r, { props: { shared: 1 } }).matchAll(/data-props="([^"]*)"/g)].map((m) => JSON.parse(m[1].replaceAll('&quot;', '"')))
    assert.deepEqual(all, [{ who: 'a', shared: 1 }, { who: 'b', shared: 1 }])
  })

  test('invalid meta.props (a string) is ignored, not spread as characters', async () => {
    const r = await registryFrom({ toolbar: [['a', 'p1', Tag('A'), { props: 'abc' }]] })
    assert.deepEqual(echo(outlet(r)), {})
  })
})

describe('containment: containment is the registry adopt hook', () => {
  // That an uncontained render error propagates (no boundary added here) is
  // asserted in dynamic.test.js: react-dom/server turns an error inside a
  // <Suspense> into a client-render fallback instead of throwing.
  test('an adopt that wraps components contains a throwing plugin; siblings still render', async () => {
    const Boom = () => { throw new Error('plugin exploded') }
    const adopt = (resolved) => (props) => { try { return resolved.export(props) } catch { return h('u', null, 'contained') } }
    const r = await registryFrom({ toolbar: [['boom', 'p2', Boom, { priority: 1 }], ['ok', 'p3', Label('Ok'), { priority: 2 }]] }, { adopt })
    assert.equal(outlet(r), '<u>contained</u><b>Ok</b>')
  })
})

describe('lazy occupants (reactAdopt-shaped values)', () => {
  test('the loading fallback is shown around a lazy occupant on first synchronous render', async () => {
    const r = await registryFrom({ toolbar: [['a', 'p1', Label('A')]] }, { adopt: (res) => lazyOf(res.export) })
    assert.equal(outlet(r, { loading: h('i', null, 'wait') }), '<i>wait</i>')
  })

  test('once the lazy component resolves, occupants render in priority order', async () => {
    const r = await registryFrom(
      { toolbar: [['b', 'p1', Label('B'), { priority: 2 }], ['a', 'p2', Label('A'), { priority: 1 }]] },
      { adopt: (res) => lazyOf(res.export) },
    )
    const stream = await renderToReadableStream(h(PluginOutlet, { registry: r, kind: 'toolbar', loading: 'wait' }))
    await stream.allReady
    assert.deepEqual(bs(await new Response(stream).text()), ['A', 'B'])
  })

  test('one slow occupant does not hide a resolved sibling behind its own loading fallback', async () => {
    const Slow = () => { throw new Promise(() => {}) }
    const r = await registryFrom({ toolbar: [['slow', 'p1', Slow, { priority: 1 }], ['fast', 'p2', Label('Fast'), { priority: 2 }]] })
    assert.equal(outlet(r, { loading: h('i', null, 'wait') }), '<i>wait</i><b>Fast</b>')
  })
})

describe('PluginSlot', () => {
  test('renders the resolved occupant at (kind, id)', async () => {
    const r = await registryFrom({ header: [['logo', 'p1', Label('Logo')], ['other', 'p2', Label('Other')]] })
    assert.equal(html(h(PluginSlot, { registry: r, kind: 'header', id: 'logo' })), '<b>Logo</b>')
  })

  test('renders exactly one occupant and ignores priority and its siblings', async () => {
    const r = await registryFrom({ header: [['a', 'p1', Label('A'), { priority: 1 }], ['b', 'p2', Label('B'), { priority: 0 }]] })
    assert.equal(html(h(PluginSlot, { registry: r, kind: 'header', id: 'a' })), '<b>A</b>')
  })

  test('an id that nobody declared renders the fallback with owner undefined', async () => {
    const r = await registryFrom({ header: [['logo', 'p1', Label('Logo')]] })
    let seen = 'unset'
    const out = html(h(PluginSlot, { registry: r, kind: 'header', id: 'nope', fallback: (owner) => { seen = owner; return 'missing' } }))
    assert.equal(out, 'missing')
    assert.equal(seen, undefined)
  })

  test('a plugin load failure is attributed: the fallback function receives the owning plugin id', async () => {
    const r = await registryFrom({ header: [['logo', 'acme.broken', Label('Logo')]] }, { failed: ['acme.broken'] })
    const out = html(h(PluginSlot, { registry: r, kind: 'header', id: 'logo', fallback: (owner) => `by ${owner}` }))
    assert.equal(out, 'by acme.broken')
  })

  test('a node fallback is rendered as-is; no fallback renders nothing', async () => {
    const r = await registryFrom({ header: [] })
    assert.equal(html(h(PluginSlot, { registry: r, kind: 'header', id: 'x', fallback: h('em', null, 'nothing') })), '<em>nothing</em>')
    assert.equal(html(h(PluginSlot, { registry: r, kind: 'header', id: 'x' })), '')
  })

  test('the fallback function is not called when the occupant renders', async () => {
    const r = await registryFrom({ header: [['logo', 'p1', Label('Logo')]] })
    let called = false
    html(h(PluginSlot, { registry: r, kind: 'header', id: 'logo', fallback: () => { called = true; return null } }))
    assert.equal(called, false)
  })

  test('a non-renderable value falls back', async () => {
    const r = await registryFrom({ header: [['logo', 'p1', 'not a component']] })
    assert.equal(html(h(PluginSlot, { registry: r, kind: 'header', id: 'logo', fallback: 'fb' })), 'fb')
  })

  test('caller props win over meta.props, as in the outlet', async () => {
    const r = await registryFrom({ header: [['logo', 'p1', Tag('L'), { props: { a: 'meta', b: 'meta' } }]] })
    const m = html(h(PluginSlot, { registry: r, kind: 'header', id: 'logo', props: { a: 'caller' } }))
    assert.match(m, /&quot;a&quot;:&quot;caller&quot;/)
    assert.match(m, /&quot;b&quot;:&quot;meta&quot;/)
  })

  test('a lazy occupant shows the loading fallback first', async () => {
    const r = await registryFrom({ header: [['logo', 'p1', Label('L')]] }, { adopt: (res) => lazyOf(res.export) })
    assert.equal(html(h(PluginSlot, { registry: r, kind: 'header', id: 'logo', loading: 'wait' })), 'wait')
  })
})

describe('defineOutletKind', () => {
  test('binds the kind for both Outlet and Slot', async () => {
    const r = await registryFrom({ toolbar: [['a', 'p1', Label('A'), { priority: 2 }], ['b', 'p2', Label('B'), { priority: 1 }]] })
    const K = defineOutletKind('toolbar')
    assert.equal(K.kind, 'toolbar')
    assert.deepEqual(bs(html(h(K.Outlet, { registry: r }))), ['B', 'A'])
    assert.equal(html(h(K.Slot, { registry: r, id: 'a' })), '<b>A</b>')
  })

  test('passes fallback, limit and props through', async () => {
    const r = await registryFrom({ toolbar: [['a', 'p1', Tag('A')], ['b', 'p2', Tag('B')]] })
    const K = defineOutletKind('toolbar')
    assert.equal((html(h(K.Outlet, { registry: r, limit: 1, props: { x: 1 } })).match(/<i /g) ?? []).length, 1)
    assert.equal(html(h(K.Outlet, { registry: createFakeRegistry(), fallback: 'empty' })), 'empty')
  })
})

test('wire helper produces the wire shape the real registry accepts', () => {
  const [response] = wire({ toolbar: [['a', 'p1', Label('A'), { priority: 1 }]] })
  assert.deepEqual(response.contributions.toolbar.a, { plugin_id: 'p1', export: 'a', meta: { priority: 1 } })
  assert.equal(response.protocol, 1)
})
