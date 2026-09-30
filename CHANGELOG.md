# Changelog

## 0.1.0 — 2026-09-30

Initial extraction; not published, not tagged.

- `.`: `readOutletMeta`, `sortByOutletPriority` (ascending `meta.priority`, ties in declared order, missing or invalid last), `outletProps`.
- `./react`: `PluginOutlet` (multi-occupant, ordered, `limit`, `fallback`, `loading`), `PluginSlot` (single-occupant, fallback told the owning plugin), `defineOutletKind`.
- Built against a structural `OutletRegistry`, not `@hollis-labs/plugin-registry`'s types, because that package is not on npm. A tarball-gated test checks the real `PluginRegistry` is assignable and agrees with the fake registry; it reports SKIPPED without `REGISTRY_TARBALL`.
- No error boundary by design; containment stays in the registry's `adopt`.
- Flux/Nanite's slot system was read for the pattern only; no equivalence is claimed.
- Source maps and declaration maps are not emitted: they would point at `../src`, which the tarball does not ship.
