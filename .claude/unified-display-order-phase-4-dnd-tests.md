# Phase 4: Drag/Drop + Sync + Tests

## Drag and Drop
- Allow dragging any item type to any position in the unified list.
- On drop:
  - Build the new unified order list.
  - Recompute `sort` for all items based on the new order.
  - Update items in their respective lists with new `sort` values.

## Sync Behavior
- Send the reorder action with the client's current `sheetVersion`.
- Server applies reorder, increments version, and broadcasts updated sheet.
- Client updates local state from the broadcast response.

## Testing Coverage
- Migration:
  - Legacy headings are dropped.
  - Order is attributes -> roll templates -> resources.
  - `sort` is assigned sequentially.
- Versioning:
  - Actions with stale `sheetVersion` are rejected.
  - Client resyncs on rejection.
- Ordering:
  - Mixed-type order renders correctly.
  - Heading indentation/collapse applies across all item types.
