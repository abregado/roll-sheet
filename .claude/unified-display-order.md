# Unified Display Order Refactor (Overview)

- Use this doc to choose a phase doc; keep this file short to minimize context.
- Phase docs (read only the one you are working on):
  - `.claude/unified-display-order-phase-1-model.md`
  - `.claude/unified-display-order-phase-2-server.md`
  - `.claude/unified-display-order-phase-3-client.md`
  - `.claude/unified-display-order-phase-4-dnd-tests.md`

## Goals
- One shared heading type that can group mixed item types.
- Separate lists per item type in data (attributes, roll templates, resources, headings).
- Each item has a numeric `sort` field; display order comes from sorting by `sort`.
- Import old data by keeping current section order: attributes, then roll templates, then resources.
- Drop old headings on import (users can recreate them).
- Add per-sheet versioning for conflict handling.
