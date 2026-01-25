# Attributes

Named values on a character sheet, referenceable in roll formulas via `@code`.

## Attribute Types

### String
- Stores text value
- Cannot be referenced in roll formulas
- Display: Name | @code | Value

### Integer
- Stores numeric value
- Can be referenced in roll formulas as `@code`
- Display: Name | @code | Value (right-justified)

### Derived
- Computed from a formula referencing integer attributes
- Formula syntax: `@code` references, `+`, `-`, `*`, `/`, `()`, `ceil()`, `floor()`
- Cannot reference other derived attributes or string attributes
- View mode shows computed result; edit mode shows formula
- Example: `floor((@str + @dex) / 2)`

### Heading
- Section divider for organizing attributes
- Only has a name field (no code or value)
- Cannot be referenced in formulas
- Collapsible: click chevron to hide/show attributes below
- Attributes under a heading are indented until next heading
- Headings are not nestable

## Code Validation

- Lowercase letters and underscores only: `/^[a-z_]+$/`
- Must be unique within the sheet
- Reserved codes (cannot be used): `result`, `maximum`, `minimum`, `name`

## UI Patterns

- Compact single-line display: Name | @code | Value
- Non-editable by default; cog icon appears on hover
- Edit mode: Enter/checkmark to save, Escape/X to cancel, trash to delete
- Drag handle on left for reordering
- Invalid derived formulas show warning icon in view mode
- Live formula validation in edit mode

## Auto-naming

New attributes get letter-based suffixes: `text_a`, `text_b`, ... `text_z`, `text_aa`, etc.
