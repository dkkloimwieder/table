---
'@tanstack/solid-table': patch
---

Keep unchanged column filters in the Solid store when another filter changes.
Keep unchanged sort entries when adding or changing a sort column.
Preserve filter order when updating an existing column filter.
Avoid notifying row-list subscribers when filtering returns the same ordered IDs.
