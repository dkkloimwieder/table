---
'@tanstack/solid-table': patch
---

Preserve the internal column sizing store when widths change in the Solid-only entry.
Changing one width leaves unrelated column width subscribers unchanged.
Reset removes saved width overrides and restores column defaults.
