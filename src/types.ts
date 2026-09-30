/**
 * The structural view of a plugin registry that this package needs.
 *
 * `@hollis-labs/plugin-registry`'s `PluginRegistry` and `AdoptedContribution`
 * satisfy these shapes; that is checked by the registry integration test, not
 * assumed. They are declared here instead of imported because the registry
 * package is not on npm yet, and because naming only what is read keeps this
 * package from tracking every field the registry adds.
 */

/** One resolved contribution: the fields this package reads. */
export interface OutletContribution {
  kind: string
  key: string
  pluginId: string
  /** Opaque to the registry. This package reads `priority` and `props` from it. */
  meta?: unknown
  /** What the registry's `adopt` returned; rendered as a component. */
  value: unknown
}

/** The registry surface this package reads. It never writes. */
export interface OutletRegistry {
  get(kind: string, key: string): OutletContribution | undefined
  /** In the order the host declared them. */
  list(kind: string): readonly OutletContribution[]
  ownerOf(kind: string, key: string): string | undefined
  /** Stable reference, for `useSyncExternalStore`. */
  subscribe(listener: () => void): () => void
  /** Advances on every change. Stable reference. */
  version(): number
}
