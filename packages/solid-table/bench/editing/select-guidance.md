# Zaidan and Kobalte Select review

The native dropdown fixture did not use Zaidan or Kobalte as its initial reference.
This source review identifies the additional behavior that a popup editor needs.
The existing browser results cover HTML select inputs only.

## WAMN controls

The review used WAMN revision `1931d925f15e3e33ef2fc4899a8a46e96f0b4125` in `~/dev/wamn`.
Its `web/ui/README.md` records copied Zaidan components from September 22, 2026.
WAMN owns those source files and has no Zaidan runtime dependency.
Its UI manifest declares `@kobalte/core ^0.13.14` and `solid-js ^1.9.15`.

`web/ui/src/components/ui/select.tsx` wraps Kobalte Select with styling and popup placement.
Kobalte supplies the interaction behavior.
A portal renders the popup outside the control in the document.
This means that focus can leave the table row while the user still edits its dropdown.

`ChoiceField` in `web/ui/src/fields.tsx` maps a scalar value to an object with `value` and `text` fields.
The displayed label and saved value remain separate.
Nullable fields add an empty choice.

`web/ui/src/record-select.tsx` uses Kobalte Combobox for record references.
It supports delayed search, another page of records, and a selected record outside the current page.
Its memo compares selected record keys to preserve typed search when record objects change.
The caller owns search and paging. This control filters no records locally.
These behaviors need separate coverage from a fixed list of choices.

## Upstream revisions

Kobalte has a `solid2` branch at `e9d426d438b7c9ea0cc81bd1133831a20cd5fcae`, dated September 24, 2026.
Its core manifest declares `2.0.0-alpha.2`.
Its [workspace catalog](https://github.com/kobaltedev/kobalte/blob/e9d426d438b7c9ea0cc81bd1133831a20cd5fcae/pnpm-workspace.yaml) pins Solid, web, and signals to `2.0.0-rc.3`.
Table currently uses `2.0.0-rc.13`. The branch name does not establish compatibility with that runtime.

Kobalte Select contains Solid 2 effects, DOM imports from `@solidjs/web`, and explicit `ownedWrite` declarations.
Its [test source](https://github.com/kobaltedev/kobalte/blob/e9d426d438b7c9ea0cc81bd1133831a20cd5fcae/packages/core/src/select/select.test.tsx) covers controlled values, disabled choices, keyboard selection, Escape, and selection through typed letters.
This review read those tests but did not run them.
It did not build or browser-test Kobalte with Table.

Zaidan has a `refactor/solid-2` branch at `5ddc991f11bd2510c2cecc04bd0732f636f3168f`, dated September 9, 2026.
Its [migration PR](https://github.com/carere/zaidan/pull/501) remains open and draft.
The [manifest](https://github.com/carere/zaidan/blob/5ddc991f11bd2510c2cecc04bd0732f636f3168f/package.json) still declares Solid `^1.9.14` and Kobalte `^0.13.12`.
The [branch notes](https://github.com/carere/zaidan/blob/5ddc991f11bd2510c2cecc04bd0732f636f3168f/docs/research/solid2-wayfinder.md) describe planning work without Solid 2 support.
The [migration specification](https://github.com/carere/zaidan/issues/503) requires upstream releases and consumer installation evidence before release.

## Table implications

The [Kobalte trigger](https://github.com/kobaltedev/kobalte/blob/e9d426d438b7c9ea0cc81bd1133831a20cd5fcae/packages/core/src/select/select-trigger.tsx) handles Enter, Space, arrow keys, and selection through typed letters.
The table must let the dropdown handle those keys before any row shortcut.
Choosing a value changes the row draft. Save commits that draft.

The [popup content](https://github.com/kobaltedev/kobalte/blob/e9d426d438b7c9ea0cc81bd1133831a20cd5fcae/packages/core/src/select/select-content.tsx) handles Escape, outside interactions, and focus restoration through `onCloseAutoFocus`.
Moving focus into the popup must preserve the draft.
Closing the popup must preserve the draft and its selected value.
Popup focus restoration and row focus restoration need coordinated browser tests.
A late close or save must not take focus from another row.

The existing controller can retain row drafts, schema rules, pending requests, and conflicts.
The dropdown can manage its open state and highlighted choice.
This division does not require another canonical record store or a Table dependency on Kobalte.
It is a proposed integration boundary, not measured compatibility.

An isolated compatibility experiment can test the real popup against the pinned Table runtime.
Its coverage needs keyboard and pointer selection, outside clicks, focus restoration, field errors, pending saves, hidden rows, and disposal.
Allocation counts and retained memory need measurement alongside interaction tests.
The experiment must establish one compatible Solid runtime before broader integration.
WAMN Form/UI migration and component vendoring remain deferred.
