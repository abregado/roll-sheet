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

## WebSocket Messages

- `history` - Full history on connect
- `roll` - New roll result broadcast
- `clearHistory` - Clear all history
