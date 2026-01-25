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
- `{result}` → final roll total
- `{name}` → sheet name
- `{code}` → attribute value

## UI Patterns

### Collapsed View (default)
- Shows resolved display format string

### Expanded View (click chevron)
- Dice breakdown with individual rolls
- Dropped dice shown with strikethrough
- Attributes used listed with names (in purple) and values

## WebSocket Messages

- `history` - Full history on connect
- `roll` - New roll result broadcast
- `clearHistory` - Clear all history
