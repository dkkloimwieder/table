---
'@tanstack/solid-table': patch
---

Restore reactive option getters before the first table read. This keeps initial row-model readers subscribed to data changes, including concurrent Query examples on Solid 2.
