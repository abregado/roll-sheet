# Roll Sheet

A web app for tracking TTRPG character attributes and rolling dice online with real-time synchronization.

## Instructions for Claude

- **Always ask questions before implementing** - Clarify requirements, confirm approach, and understand the user's intent before writing code.
- **Never start/stop/restart the server** - The user manages the dev server themselves. Do not run `npm run dev`, kill node processes, or similar commands.

## Architecture

- **Server**: Node.js with WebSockets (ws library)
- **Client**: Vanilla JavaScript with plain CSS
- **Persistence**: Server-side JSON storage for sheets and history
- **Communication**: WebSockets for real-time sync
- **Unified list**: Attributes, roll templates, resources, and headings render in one list sorted by `sort`
- **Ordering**: Reorder actions send the full unified order and require per-sheet version sync

## File Structure

```
roll-sheet/
├── CLAUDE.md           # This file
├── .claude/            # Claude-specific documentation
├── src/
│   ├── server.ts       # Node.js WebSocket server
│   ├── dice.ts         # Dice parsing, rolling, and evaluation
│   └── types.ts        # TypeScript type definitions
├── public/
│   ├── index.html      # Main HTML page with templates
│   ├── styles.css      # CSS styling
│   └── app.js          # Client-side JavaScript
├── docs/               # User-facing documentation (GitHub Pages)
└── data/
    ├── sheets.json     # Character sheet storage (auto-created)
    └── history.json    # Roll history storage (auto-created)
```

## Documentation Routing

Read the relevant docs based on what you're implementing:

| Task | Read |
|------|------|
| Sheet create/copy/delete/rename, read-only mode | `.claude/sheets.md` |
| Unified list, headings, and item ordering | `.claude/attributes.md` |
| Roll templates, formula variants | `.claude/roll-templates.md` |
| Dice notation, parsing, keep/drop modifiers | `.claude/dice.md` |
| Roll history, display format | `.claude/history.md` |
| Super conditions (critical effects) | `.claude/super-conditions.md` |
| Layout, responsive design, UI structure | `.claude/ui-layout.md` |
| Writing user documentation in `docs/` | `.claude/writing-human-docs.md` |
| Writing Claude documentation in `.claude/` | `.claude/writing-claude-docs.md` |

For cross-cutting features, read multiple docs as needed.
