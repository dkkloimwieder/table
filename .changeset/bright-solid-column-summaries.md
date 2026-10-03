---
'@tanstack/solid-table': patch
---

Add median, range, span, filled, empty, distinct, first, and last aggregation helpers to the Solid-only entry.
First and last follow the current table sort within filtered groups.
Group cells can summarize grouping columns while group handles retain their bucket values.
Columns can supply an equality function to preserve equivalent structured summaries.
