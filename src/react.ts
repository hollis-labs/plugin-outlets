/**
 * The React adapter. React is an optional peer behind this subpath; the core
 * entry point never loads it.
 *
 * Plugin render errors are contained by the registry's `adopt`, as
 * plugin-registry's README draws that boundary. Nothing here adds an error
 * boundary; the only boundary added is `<Suspense>`, for a lazy `adopt`.
 */
import { createElement, Fragment, Suspense, useCallback, useSyncExternalStore } from 'react'
import type { ComponentType, ReactElement, ReactNode } from 'react'
import { outletProps, sortByOutletPriority } from './index.js'
import type { OutletContribution, OutletRegistry } from './types.js'

export type { OutletContribution, OutletRegistry } from './types.js'

export interface PluginOutletProps {
  registry: OutletRegistry
  /** The contribution kind this outlet renders. */
  kind: string
  /** Rendered when nothing in this kind is renderable. */
  fallback?: ReactNode
  /** Suspense fallback around each occupant (for a lazy `adopt`). */
  loading?: ReactNode
  /** Props for every occupant. They win over the contribution's `meta.props`. */
  props?: Record<string, unknown>
  /** Render at most this many occupants, counted after ordering. */
  limit?: number
}

export interface PluginSlotProps {
  registry: OutletRegistry
  kind: string
  /** The contribution key: this slot has exactly one occupant. */
  id: string
  /** Rendered when the occupant is absent. A function is told which plugin owns the missing id. */
  fallback?: ReactNode | ((owner: string | undefined) => ReactNode)
  loading?: ReactNode
  /** Props for the occupant. They win over the contribution's `meta.props`. */
  props?: Record<string, unknown>
}

/**
 * Re-render when the registry changes. Kept local rather than importing
 * plugin-registry's hook so this package has no runtime import of it.
 */
function useRegistryVersion(registry: OutletRegistry): number {
  const subscribe = useCallback((listener: () => void) => registry.subscribe(listener), [registry])
  const version = useCallback(() => registry.version(), [registry])
  return useSyncExternalStore(subscribe, version, version)
}

/**
 * Whether a registry value can be rendered as an element type. With the
 * default (identity) `adopt` a value may be anything a bundle exported.
 */
function isRenderable(value: unknown): value is ComponentType<Record<string, unknown>> {
  if (typeof value === 'function') return true
  return typeof value === 'object' && value !== null && typeof (value as { $$typeof?: unknown }).$$typeof === 'symbol'
}

function occupant(
  c: OutletContribution,
  callerProps: Record<string, unknown> | undefined,
  loading: ReactNode,
): ReactElement {
  const Component = c.value as ComponentType<Record<string, unknown>>
  return createElement(
    Suspense,
    { key: c.key, fallback: loading ?? null },
    createElement(Component, { ...outletProps(c), ...callerProps }),
  )
}

function clampLimit(limit: number | undefined): number {
  if (limit === undefined || Number.isNaN(limit)) return Infinity
  return Math.max(0, Math.floor(limit))
}

/**
 * A named, MULTI-occupant extension point: every renderable contribution of
 * `kind`, ordered by `meta.priority` ascending (ties in declared order).
 * Deliberately not called `Outlet`: that is React Router's name.
 */
export function PluginOutlet(p: PluginOutletProps): ReactElement {
  useRegistryVersion(p.registry)
  const shown = sortByOutletPriority(p.registry.list(p.kind).filter((c) => isRenderable(c.value))).slice(
    0,
    clampLimit(p.limit),
  )
  if (shown.length === 0) return createElement(Fragment, null, p.fallback ?? null)
  return createElement(
    Fragment,
    null,
    shown.map((c) => occupant(c, p.props, p.loading)),
  )
}

/**
 * A named, SINGLE-occupant extension point: the contribution at (`kind`, `id`).
 * When it is absent, `fallback` is rendered, and a function fallback is told
 * which plugin declared the id, so an empty surface can say whose bundle failed.
 */
export function PluginSlot(p: PluginSlotProps): ReactElement {
  useRegistryVersion(p.registry)
  const c = p.registry.get(p.kind, p.id)
  if (c && isRenderable(c.value)) return occupant(c, p.props, p.loading)
  const fb = typeof p.fallback === 'function' ? p.fallback(p.registry.ownerOf(p.kind, p.id)) : p.fallback
  return createElement(Fragment, null, fb ?? null)
}

/**
 * Bind a kind, and optionally the props type its occupants receive, once.
 * The props type is a compile-time promise from the host; nothing checks the
 * plugin's component against it at runtime.
 */
export function defineOutletKind<Props extends Record<string, unknown> = Record<string, never>>(
  kind: string,
): {
  kind: string
  Outlet: (p: Omit<PluginOutletProps, 'kind' | 'props'> & { props?: Props }) => ReactElement
  Slot: (p: Omit<PluginSlotProps, 'kind' | 'props'> & { props?: Props }) => ReactElement
} {
  return {
    kind,
    Outlet: (p) => createElement(PluginOutlet, { ...p, kind }),
    Slot: (p) => createElement(PluginSlot, { ...p, kind }),
  }
}
