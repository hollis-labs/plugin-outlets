// A hand-written stand-in for @hollis-labs/plugin-registry's PluginRegistry.
//
// It is built from the same wire document a host serves plus a map of
// "modules" (plugin id -> exports), and reproduces the parts of the real
// loader's behaviour this package depends on:
//   - a plugin absent from `modules` is a load failure: its contributions are
//     declared (ownerOf answers) but not resolved (get/list omit them);
//   - list(kind) is in declared (object key) order, resolved only;
//   - a contribution whose export is missing from a loaded module is omitted;
//   - the response wins: sync() replaces the table; unload(id) drops a
//     plugin's resolved contributions but keeps them declared;
//   - subscribe/version are stable references and version advances per change.
// `adopt` defaults to identity, like the real default.
//
// It is NOT the real thing. test/registry-integration.test.js runs the same
// scenarios (test/fixtures/scenarios.js) against the real registry when a
// tarball is supplied, and fails if the two disagree.

export function createFakeRegistry({ adopt = (r) => r.export } = {}) {
  let declared = [] // [{kind,key,pluginId,exportName,meta}]
  let modules = {}
  let loadedPlugins = new Set()
  let failed = []
  let unloaded = new Set()
  let resolved = new Map() // `${kind}\u001f${key}` -> contribution
  let version = 0
  const listeners = new Set()
  const k = (kind, key) => `${kind}\u001f${key}`

  const notify = () => {
    version++
    for (const l of [...listeners]) l()
  }
  const rebuild = () => {
    resolved = new Map()
    for (const d of declared) {
      if (unloaded.has(d.pluginId) || !loadedPlugins.has(d.pluginId)) continue
      const mod = modules[d.pluginId]
      if (!mod || !(d.exportName in mod)) continue
      const value = adopt({ ...d, export: mod[d.exportName] })
      resolved.set(k(d.kind, d.key), { ...d, value })
    }
  }

  const registry = {
    async sync(response, mods = {}) {
      modules = mods
      unloaded = new Set()
      declared = []
      for (const [kind, byKey] of Object.entries(response.contributions ?? {})) {
        for (const [key, c] of Object.entries(byKey)) {
          declared.push({ kind, key, pluginId: c.plugin_id, exportName: c.export, meta: c.meta })
        }
      }
      loadedPlugins = new Set()
      failed = []
      for (const id of Object.keys(response.plugins ?? {})) {
        if (id in mods) loadedPlugins.add(id)
        else failed.push(id)
      }
      rebuild()
      notify()
    },
    get: (kind, key) => resolved.get(k(kind, key)),
    list: (kind) => [...resolved.values()].filter((c) => c.kind === kind),
    ownerOf: (kind, key) => declared.find((d) => d.kind === kind && d.key === key)?.pluginId,
    errors: () => failed.map((pluginId) => ({ pluginId })),
    unload(pluginId) {
      unloaded.add(pluginId)
      rebuild()
      notify()
    },
    clear() {
      declared = []
      loadedPlugins = new Set()
      failed = []
      unloaded = new Set()
      rebuild()
      notify()
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    version: () => version,
    // Test-only.
    listenerCount: () => listeners.size,
  }
  // Stable references, as the real registry documents.
  registry.subscribe = registry.subscribe.bind(registry)
  registry.version = registry.version.bind(registry)
  return registry
}
