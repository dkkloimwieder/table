---
'@tanstack/solid-table': patch
---

Preserve the column visibility store when columns are hidden or shown in the Solid-only entry.
Changing one column leaves subscribers to other visibility values unchanged.
