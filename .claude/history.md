# Roll History

Server-persisted log of all rolls, synced to all clients.

## Storage

- Stored in `data/history.json`
- Syncs to all connected clients in real-time
- Persists until "Clear History" is clicked

## History Entry Structure

Each entry contains:
- Resolved display format string
- Roll breakdown data
- Attributes used (with names and values)
- Timestamp
- Sheet name

## Display Format Resolution

Placeholders in display format are resolved:
- `{result}` → first (or only) roll total
- `{result2}`, `{result3}`, etc. → additional result group totals
- `{name}` → sheet name
- `{variant}` → formula variant title
- `{code}` → attribute value

## UI Patterns

### Collapsed View (default)
- Shows resolved display format string

### Expanded View (click chevron)
- Roll breakdown showing formula, expanded dice, and total
- Attribute codes shown inline: `3 (@str)` in the expanded formula
- Dropped dice shown with strikethrough
- Multiple result groups shown separately with "Result 1:", "Result 2:" labels

## Ad Hoc Rolls

Users can type ad hoc rolls in the input field at the bottom of the history panel (desktop only).
- Use `[formula]` syntax to embed rolls in the message text
- Multiple rolls can be included in a single message
- Example: "I attack the goblin [1d20+@str] and deal [1d8+@str] damage"
- Attribute codes like `@str` are resolved from the currently selected sheet

## WebSocket Messages

- `history` - Full history on connect
- `roll` - New roll result broadcast
- `adhocRoll` - Ad hoc roll with message text containing [formula] patterns
- `clearHistory` - Clear all history
