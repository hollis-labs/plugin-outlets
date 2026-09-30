/**
 * The pure half: reading this package's `meta` convention. No React, no DOM.
 *
 * The convention is opt-in. `meta` belongs to the host, and a registry never
 * reads it; a host that never sets `priority` or `props` gets declared order
 * and no extra props.
 */
export type { OutletContribution, OutletRegistry } from './types.js'

/** What this package reads from a contribution's opaque `meta`. */
export interface OutletMeta {
  /** Ascending: lower renders first. Only a finite number counts. */
  priority?: number
  /** Props handed to the occupant. Only a plain object counts. */
  props?: Record<string, unknown>
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/**
 * Read `priority` and `props` out of an unknown `meta`. Never throws: anything
 * that is not the expected shape is left out rather than coerced, so a host's
 * typo cannot turn into a surprising order or a surprising prop.
 */
export function readOutletMeta(meta: unknown): OutletMeta {
  const out: OutletMeta = {}
  if (!isRecord(meta)) return out
  const { priority, props } = meta
  if (typeof priority === 'number' && Number.isFinite(priority)) out.priority = priority
  // Spread, not Object.assign: it defines own properties, so a `__proto__` key
  // from JSON.parse stays a plain key instead of replacing the prototype.
  if (isRecord(props)) out.props = { ...props }
  return out
}

/**
 * A new array ordered by `meta.priority` ascending. Ties keep their input
 * order. Items with a missing or invalid priority go after every prioritized
 * item, keeping their input order. The input is not modified.
 */
export function sortByOutletPriority<T extends { meta?: unknown }>(items: readonly T[]): T[] {
  return items
    .map((item, index) => ({ item, index, priority: readOutletMeta(item.meta).priority }))
    .sort((a, b) => {
      if (a.priority === undefined && b.priority === undefined) return a.index - b.index
      if (a.priority === undefined) return 1
      if (b.priority === undefined) return -1
      return a.priority - b.priority || a.index - b.index
    })
    .map((d) => d.item)
}

/** The props a contribution's `meta` asks to be rendered with; `{}` if none. */
export function outletProps(contribution: { meta?: unknown }): Record<string, unknown> {
  return readOutletMeta(contribution.meta).props ?? {}
}
