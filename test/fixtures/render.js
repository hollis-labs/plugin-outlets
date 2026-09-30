import { createElement as h, lazy } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createFakeRegistry } from './fake-registry.js'
import { PROTOCOL } from './scenarios.js'

/** A component that renders <tag data-p=...>label</tag> and echoes its props as JSON. */
export const Tag = (label) => {
  const C = (props) => h('i', { 'data-props': JSON.stringify(props) }, label)
  C.displayName = label
  return C
}
export const Label = (label) => () => h('b', null, label)

/**
 * Build a populated fake registry from a compact spec:
 *   { kind: [ [key, pluginId, Component, meta?] ... ] }
 * plus `failed` plugin ids that have no module.
 */
export async function registryFrom(spec, { failed = [], adopt } = {}) {
  const reg = createFakeRegistry(adopt ? { adopt } : undefined)
  await reg.sync(...wire(spec, failed))
  return reg
}
export function wire(spec, failed = []) {
  const plugins = {}
  const contributions = {}
  const modules = {}
  for (const [kind, rows] of Object.entries(spec)) {
    contributions[kind] = {}
    for (const [key, pluginId, Comp, meta] of rows) {
      plugins[pluginId] = { bundle_url: `/${pluginId}.js` }
      contributions[kind][key] = { plugin_id: pluginId, export: key, ...(meta === undefined ? {} : { meta }) }
      if (!failed.includes(pluginId)) (modules[pluginId] ??= {})[key] = Comp
    }
  }
  return [{ protocol: PROTOCOL, plugins, contributions }, modules]
}
export const html = (el) => renderToStaticMarkup(el)
export const lazyOf = (C) => lazy(() => Promise.resolve({ default: C }))
export { h }
