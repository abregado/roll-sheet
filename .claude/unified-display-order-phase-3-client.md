# Phase 3: Client Rendering + Ordering

## Unified Render List
- Merge `attributes`, `rollTemplates`, `resources`, `headings` into one array.
- Sort by `sort` ascending.
- Apply a stable tie-breaker (e.g., `type` + `id`) if needed.

## Heading Behavior
- One heading component shared across all item types.
- Heading affects indentation for all following items until the next heading.
- Collapsing a heading hides all following items until the next heading.

## Create/Insert Behavior
- New items get `sort = maxSort + 1000` by default.
- If adding adjacent to a selection, insert by recomputing all `sort` values.

## Rendering Rules
- Use existing item editors per type (attribute/template/resource).
- Keep all existing validation rules per type.
- Resources use the same indentation and collapse rules as other items.
