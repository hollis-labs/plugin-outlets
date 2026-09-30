// Pure logic: no React, no DOM. Guards the `meta` convention.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readOutletMeta, sortByOutletPriority, outletProps } from '../dist/index.js'

const item = (id, meta) => ({ id, meta })
const ids = (xs) => xs.map((x) => x.id)

describe('readOutletMeta', () => {
  for (const [name, meta] of [
    ['undefined', undefined],
    ['null', null],
    ['a string', 'priority'],
    ['a number', 5],
    ['a boolean', true],
    ['an array', [{ priority: 1 }]],
    ['an empty object', {}],
    ['unrelated fields only', { label: 'x', slot: 'y' }],
  ]) {
    test(`meta that is ${name} yields {}`, () => assert.deepEqual(readOutletMeta(meta), {}))
  }

  test('reads a finite priority, including 0, negatives and floats', () => {
    for (const p of [0, -0, -3, 1.5, 1e9]) assert.equal(readOutletMeta({ priority: p }).priority, p)
  })

  test('drops invalid priorities instead of coercing them', () => {
    for (const p of ['1', '', NaN, Infinity, -Infinity, true, null, {}, [1], () => 1, 10n]) {
      assert.equal('priority' in readOutletMeta({ priority: p }), false, `priority ${String(p)}`)
    }
  })

  test('reads props only when it is a plain object', () => {
    assert.deepEqual(readOutletMeta({ props: { a: 1 } }).props, { a: 1 })
    for (const p of ['x', 1, null, [1, 2], true]) assert.equal('props' in readOutletMeta({ props: p }), false)
  })

  test('returns a copy of props, not the host object', () => {
    const props = { a: 1 }
    const out = readOutletMeta({ props }).props
    out.a = 2
    assert.equal(props.a, 1)
  })

  test('does not modify its input', () => {
    const meta = Object.freeze({ priority: 1, props: Object.freeze({ a: 1 }) })
    assert.doesNotThrow(() => readOutletMeta(meta))
  })

  test('a __proto__ key from JSON stays a plain own key and cannot poison the prototype', () => {
    const meta = JSON.parse('{"props":{"__proto__":{"polluted":true},"a":1}}')
    const props = readOutletMeta(meta).props
    assert.equal(Object.getPrototypeOf(props), Object.prototype)
    assert.equal(props.polluted, undefined)
    assert.equal({}.polluted, undefined)
    assert.deepEqual(Object.keys(props).sort(), ['__proto__', 'a'])
  })
})

describe('sortByOutletPriority', () => {
  test('orders ascending by priority', () => {
    const out = sortByOutletPriority([item('c', { priority: 30 }), item('a', { priority: 10 }), item('b', { priority: 20 })])
    assert.deepEqual(ids(out), ['a', 'b', 'c'])
  })

  test('ties keep declared order', () => {
    const out = sortByOutletPriority([item('a', { priority: 1 }), item('b', { priority: 1 }), item('c', { priority: 0 }), item('d', { priority: 1 })])
    assert.deepEqual(ids(out), ['c', 'a', 'b', 'd'])
  })

  test('ties stay in declared order across many items (stability is explicit, not incidental)', () => {
    const input = Array.from({ length: 200 }, (_, i) => item(`i${i}`, { priority: i % 3 }))
    const out = sortByOutletPriority(input)
    for (const p of [0, 1, 2]) {
      const group = out.filter((x) => x.meta.priority === p).map((x) => Number(x.id.slice(1)))
      assert.deepEqual(group, [...group].sort((a, b) => a - b))
    }
  })

  test('missing priority sorts after every prioritized item, in declared order', () => {
    const out = sortByOutletPriority([item('n1'), item('p9', { priority: 9 }), item('n2', {}), item('p1', { priority: 1 }), item('n3', { label: 'x' })])
    assert.deepEqual(ids(out), ['p1', 'p9', 'n1', 'n2', 'n3'])
  })

  test('invalid priority is treated as missing', () => {
    const out = sortByOutletPriority([item('nan', { priority: NaN }), item('str', { priority: '1' }), item('inf', { priority: Infinity }), item('ok', { priority: 100 })])
    assert.deepEqual(ids(out), ['ok', 'nan', 'str', 'inf'])
  })

  test('negative, zero and fractional priorities order numerically, not lexically', () => {
    const out = sortByOutletPriority([item('ten', { priority: 10 }), item('two', { priority: 2 }), item('neg', { priority: -5 }), item('half', { priority: 0.5 }), item('zero', { priority: 0 })])
    assert.deepEqual(ids(out), ['neg', 'zero', 'half', 'two', 'ten'])
  })

  test('does not modify the input array and returns a new one', () => {
    const input = [item('b', { priority: 2 }), item('a', { priority: 1 })]
    const out = sortByOutletPriority(input)
    assert.deepEqual(ids(input), ['b', 'a'])
    assert.notEqual(out, input)
    assert.equal(out[0], input[1], 'same item objects, not copies')
  })

  test('empty and single-item inputs', () => {
    assert.deepEqual(sortByOutletPriority([]), [])
    const only = item('a')
    assert.deepEqual(sortByOutletPriority([only]), [only])
  })

  test('reads meta only; other fields do not affect order', () => {
    const out = sortByOutletPriority([{ id: 'a', priority: 1, meta: { priority: 2 } }, { id: 'b', priority: 9, meta: { priority: 1 } }])
    assert.deepEqual(ids(out), ['b', 'a'])
  })
})

describe('outletProps', () => {
  test('returns meta.props', () => assert.deepEqual(outletProps({ meta: { props: { tone: 'quiet' } } }), { tone: 'quiet' }))
  test('returns {} when meta or props is absent or invalid', () => {
    for (const c of [{}, { meta: null }, { meta: { props: 3 } }, { meta: { priority: 1 } }]) assert.deepEqual(outletProps(c), {})
  })
  test('returns a fresh object each call', () => {
    const c = { meta: { props: { a: 1 } } }
    assert.notEqual(outletProps(c), outletProps(c))
  })
})
