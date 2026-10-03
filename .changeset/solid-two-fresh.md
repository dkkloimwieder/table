---
'@tanstack/solid-table': major
---

Migrate the Solid adapter to Solid 2.0.0-rc.13 and @solidjs/web. Solid 1 applications must keep the earlier adapter.

Table state uses native Solid signals and automatic batching. Table option getters remain reactive. The package includes uncompiled JSX for Solid bundlers and a server build for Node.
