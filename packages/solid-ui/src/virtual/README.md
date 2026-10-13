# Virtual presentation

This directory will contain `createTableVirtualizer`, `VirtualRows`, and `VirtualWindow`.
Beads `table-qp8.3.2` moves the existing implementation here.
The binding uses the single owned engine in `vendor/virtual-core`.
Applications supply records and range callbacks.
Paging and memory policy remain application code.
