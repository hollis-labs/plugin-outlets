// Typecheck-only fixture (run by `npm run typecheck`; never executed).
// Every `@ts-expect-error` must be an error and every other line must not be:
// if defineOutletKind stops constraining props, the directive becomes unused
// and the typecheck fails; if it over-constrains, a plain line fails.
import type { ReactElement } from 'react'
import { defineOutletKind, PluginOutlet, PluginSlot } from '../../src/react.ts'
import type { OutletRegistry } from '../../src/react.ts'
import { readOutletMeta, sortByOutletPriority, outletProps } from '../../src/index.ts'
import type { OutletMeta } from '../../src/index.ts'

declare const registry: OutletRegistry

// A kind with typed props.
const Toolbar = defineOutletKind<{ tone: 'quiet' | 'loud'; count?: number }>('toolbar')
export const ok1: ReactElement = <Toolbar.Outlet registry={registry} props={{ tone: 'quiet' }} limit={3} fallback="none" loading="..." />
export const ok2: ReactElement = <Toolbar.Slot registry={registry} id="x" props={{ tone: 'loud', count: 2 }} fallback={(owner) => owner ?? 'nobody'} />
export const ok3: ReactElement = <Toolbar.Outlet registry={registry} props={{ tone: 'quiet' }} />
export const kind: string = Toolbar.kind

// @ts-expect-error tone is required
export const bad1 = <Toolbar.Outlet registry={registry} props={{ count: 1 }} />
// @ts-expect-error wrong literal
export const bad2 = <Toolbar.Outlet registry={registry} props={{ tone: 'medium' }} />
// @ts-expect-error unknown prop
export const bad3 = <Toolbar.Slot registry={registry} id="x" props={{ tone: 'quiet', nope: 1 }} />
// @ts-expect-error the kind is bound by defineOutletKind, not passed
export const bad4 = <Toolbar.Outlet registry={registry} kind="other" />
// @ts-expect-error a slot needs an id
export const bad5 = <Toolbar.Slot registry={registry} />
// @ts-expect-error registry is required
export const bad6 = <Toolbar.Outlet />

// The default props type accepts no props at all.
const Plain = defineOutletKind('plain')
export const ok4: ReactElement = <Plain.Outlet registry={registry} />
export const ok5: ReactElement = <Plain.Outlet registry={registry} props={{}} />
// @ts-expect-error default Props is Record<string, never>
export const bad7 = <Plain.Outlet registry={registry} props={{ a: 1 }} />

// The untyped components accept any props bag.
export const ok6: ReactElement = <PluginOutlet registry={registry} kind="k" props={{ anything: [1] }} />
export const ok7: ReactElement = <PluginSlot registry={registry} kind="k" id="i" fallback={<b />} />
// @ts-expect-error there is no error-boundary prop
export const bad8 = <PluginOutlet registry={registry} kind="k" error={<b />} />

// Core.
export const meta: OutletMeta = readOutletMeta({ priority: 1 })
export const sorted: { meta?: unknown; n: number }[] = sortByOutletPriority([{ meta: {}, n: 1 }])
export const props: Record<string, unknown> = outletProps({ meta: {} })
