# Phase 1: Data Model + Migration

## Data Model
- Store each item type in its own list on the sheet:
  - `attributes[]`
  - `rollTemplates[]`
  - `resources[]`
  - `headings[]`
- Add `sort: number` to every item in all four lists.
- Headings are a shared type for all sections:
  - Fields: `id`, `name`, `sort`
  - No nesting; apply to all items after the heading until the next heading.
- Keep existing IDs for items where present; otherwise add `id` on creation.

## Display Ordering
- Build a unified render list by merging all four lists and sorting by `sort`.
- If `sort` ties occur, apply a stable tie-breaker (e.g., type name + `id`).
- Indentation rule: items are indented from the last heading until the next heading.

## Migration Rules
- On import of old data:
  - Remove all legacy headings from attributes/templates/resources.
  - Preserve current section order: attributes, then roll templates, then resources.
  - Assign `sort` sequentially across the combined list in that order.
- Do not attempt to migrate heading collapse state.
- Schema versioning:
  - Add a new schema version marker in the sheet data.
  - When loading older versions, apply the migration above.

## Sorting Number Strategy
- Use integers for `sort` and recompute on reorder.
- Suggested assignment during migration and recalc:
  - `sort = index * 1000` for each item in the unified order.
  - This keeps values simple and avoids float drift.
