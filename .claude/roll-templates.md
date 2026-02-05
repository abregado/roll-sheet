# Roll Templates

Predefined roll formulas attached to a character sheet.

## Template Types

### Roll
- **name**: Display label (e.g., "Attack Roll")
- **displayFormat**: Output string with placeholders (e.g., `"{name} attacks for {result} damage"`)
- **formulas**: Array of formula variants
- **superCondition**: Optional condition for dramatic effects (see super-conditions.md)

### Heading
- Section divider, same behavior as attribute headings
- Collapsible with chevron
- Templates under a heading are indented

## Formula Variants

Each template can have multiple formula variants:

```
formulas: [
  { title: "Normal", formula: "1d20+@str" },
  { title: "Advantage", formula: "2d20kh1+@str" },
  { title: "Disadvantage", formula: "2d20kl1+@str" }
]
```

- Multiple formulas render as split-button with dropdown
- All variants share the same display format
- Each variant has a title and formula

## Multiple Result Groups

Use square brackets to create multiple independent results in a single roll:

```
[1d20+@str][1d6]
```

- Each bracketed section is evaluated separately
- Results are accessible as `{result}`, `{result2}`, `{result3}`, etc.
- Useful for attack + damage rolls, skill checks with modifiers, etc.
- Without brackets, the entire formula is treated as a single result
- Super conditions evaluate against the first result group only

Example display format: `"{name} attacks: {result} to hit, {result2} damage"`

## Display Format Placeholders

- `{result}` - First (or only) roll total
- `{result2}`, `{result3}`, etc. - Additional result group totals
- `{name}` - Sheet name
- `{variant}` - The rolled formula variant's title (empty string if not set)
- `{code}` - Any attribute code resolves to its value

## Validation

- Formula must parse as valid dice notation
- All `@code` references must exist as integer attributes on the sheet
- Invalid templates show warning icon
- Invalid templates cannot be rolled (button disabled)

## UI Patterns

- Compact single-line view: Name | Roll button
- Same edit pattern as attributes (cog on hover, Enter/Escape)
- Drag-and-drop reordering
- Edit mode shows name field and formula variant editor
