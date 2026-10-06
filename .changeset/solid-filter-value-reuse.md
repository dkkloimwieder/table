---
'@tanstack/solid-table': minor
---

Add the native column option `enableFilterValueReuse`, which defaults to false.
It reuses deterministic accessor values during one record's filter and search match.
Accessor and predicate callbacks must preserve inputs and returned values during that match.
Values do not cross records, feature passes, or matcher calls.
Facet value extraction, sorting, groups, and cells retain independent reads.
