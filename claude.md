# Roll Sheet

A web app for tracking TTRPG character attributes and rolling dice online with real-time synchronization.

## Architecture

- **Server**: Node.js with WebSockets (ws library)
- **Client**: Vanilla JavaScript with plain CSS
- **Persistence**: Server-side JSON storage for sheets and history
- **Communication**: WebSockets for real-time sync

## Core Concepts

### Character Sheets

Stored on the server, accessible by anyone. Each sheet contains:

- **Attributes**: Named values with a code for roll references
  - Types: `string`, `integer`, or `derived`
  - Example: Name="Dexterity", Code="dex", Type=integer, Value=3
  - New sheets start with one string attribute: Name (code: `name`)
  - Attributes are non-editable by default; click cog icon (visible on hover) to edit
  - Edit mode: Enter to save, Escape to cancel
  - Drag handle on left side for reordering
  - Code validation: lowercase alpha + underscore only, must be unique

- **Derived Attributes**: Computed values from formulas
  - Formula can reference other integer attributes via `@code`
  - Supported operations: `+`, `-`, `*`, `/`, `()`, `ceil()`, `floor()`
  - Cannot reference other derived attributes or string attributes
  - View mode shows computed result; edit mode shows formula
  - Example: `floor((@str + @dex) / 2)`

- **Roll Templates**: Predefined roll formulas
  - Name: Display label (e.g., "Attack Roll")
  - Formula: Dice notation with attribute references (e.g., `1d20+@str`)
  - Display Format: Custom output string (e.g., `"{name} attacks for {result} damage"`)

### Dice Notation

- Basic: `XdY` (e.g., `2d6` = roll 2 six-sided dice)
- Modifiers: `+`, `-` with numbers or `@attribute` references
- Keep/Drop highest/lowest:
  - `kh[N]` - keep highest N (default 1)
  - `kl[N]` - keep lowest N (default 1)
  - `dh[N]` - drop highest N (default 1)
  - `dl[N]` - drop lowest N (default 1)
- Modifiers can stack: `4d6dl1dh1` = roll 4d6, drop lowest 1, drop highest 1

### Attribute References

- In formulas: `@code` (e.g., `1d20+@str`)
- In display format: `{code}` (e.g., `"{name} rolled {result}"`)
- Special: `{result}` = final roll total

### History

- Server-synced roll history visible to all connected clients
- Shows custom display format with resolved attribute values
- Includes detailed breakdown: dice rolled, dropped dice (highlighted), attribute values used
- Persists until "Clear History" is clicked

## UI Layout

```
+--------+-------------------------+------------------+
| Sheet  |    Character Sheet      |     History      |
| Icons  |                         |                  |
|        | [Attributes Section]    | [Roll entries    |
| [S1]   |  - Name: "Strength"     |  with detailed   |
| [S2]   |    Code: str            |  breakdowns]     |
| [S3]   |    Value: 3             |                  |
|        |                         |                  |
| [+]    | [Roll Templates]        |                  |
|        |  - Attack Roll          |                  |
|        |    1d20+@str            |                  |
|        |    [Roll Button]        | [Clear History]  |
|        |                         |                  |
|        | [Delete Sheet]          |                  |
+--------+-------------------------+------------------+
```

- Two-column layout on desktop
- Responsive to window size changes
- Sheet selector: vertical icon sidebar left of Character Sheet
- Plus icon to add new sheet
- Delete Sheet button at bottom with confirmation

## Real-time Sync

- Sheet changes sync immediately to all viewers
- History syncs to all connected clients
- No rooms/sessions - single server instance

## Validation

- Roll Templates with missing attribute codes show warning (red/icon)
- Invalid Roll Templates cannot be rolled
- Attribute codes must be unique within a sheet

## File Structure

```
roll-sheet/
├── claude.md           # This file
├── package.json
├── tsconfig.json
├── src/
│   ├── server.ts       # Node.js WebSocket server
│   └── types.ts        # TypeScript type definitions
├── public/
│   ├── index.html      # Main HTML page
│   ├── styles.css      # CSS styling
│   └── app.js          # Client-side JavaScript
└── data/
    ├── sheets.json     # Character sheet storage
    └── history.json    # Roll history storage
