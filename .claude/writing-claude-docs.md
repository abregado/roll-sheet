# Writing Claude Documentation

Guidelines for writing documentation in `.claude/` for Claude's context.

## Purpose

These docs are loaded into Claude's context when implementing features. Optimize for:
- Fast comprehension (Claude processes tokens sequentially)
- Minimal token count
- Precise technical accuracy

## Location

- All Claude docs go in `.claude/`
- Update routing table in `CLAUDE.md` when adding new docs

## Structure

- Lead with the most important information
- Use flat hierarchy (fewer nested levels)
- Group related facts together
- No introductory fluff

## Formatting

- Bullet points over prose
- Short phrases over complete sentences
- Code examples only when syntax is non-obvious
- Tables for mappings and lookups

## Content

Include:
- Data structures and their fields
- Validation rules and constraints
- UI patterns and behaviors
- File locations
- WebSocket message names

Exclude:
- Rationale and history
- Alternative approaches considered
- Verbose explanations
- Redundant information

## Examples

Good:
```
## Code Validation
- Lowercase letters and underscores only: `/^[a-z_]+$/`
- Must be unique within the sheet
- Reserved codes: `result`, `maximum`, `minimum`, `name`
```

Avoid:
```
## Code Validation
When a user creates an attribute, they need to provide a code. This code
is used to reference the attribute in formulas. We decided to restrict
codes to lowercase letters and underscores to keep things simple and
avoid conflicts with operators. The regex pattern we use is `/^[a-z_]+$/`.
Additionally, codes must be unique within a sheet to prevent ambiguity.
Some codes are reserved for special purposes...
```

## Maintenance

- Update docs when features change
- Keep each doc focused on one feature area
- Split docs if they exceed ~200 lines
