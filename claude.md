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

## Implementation Status

### Completed

- [x] Basic project setup (TypeScript, Node.js, WebSocket server)
- [x] Two-column responsive layout with sheet sidebar
- [x] Character sheet management (create, copy, delete with confirmation)
- [x] Sheet selector sidebar with icons
- [x] Real-time sync of sheet changes across clients
- [x] **Attributes System**
  - [x] String attributes
  - [x] Integer attributes
  - [x] Derived attributes with formula evaluation (`+`, `-`, `*`, `/`, `()`, `ceil()`, `floor()`)
  - [x] Heading dividers with collapse/expand
  - [x] Compact single-line display (Name | @code | Value)
  - [x] Edit mode with cog icon (visible on hover)
  - [x] Save (Enter/checkmark), Cancel (Escape/X), Delete (trash)
  - [x] Drag-and-drop reordering
  - [x] Code validation (lowercase alpha + underscore, unique)
  - [x] Indentation for attributes under headings
  - [x] Warning icon for invalid derived formulas (view mode)
  - [x] Live formula validation in edit mode
  - [x] Letter-based auto-naming (text_a, text_b, ... text_z, text_aa, etc.)
- [x] **Sheet Management**
  - [x] Sheet renaming with custom 1-2 character initials for sidebar
  - [x] Read-only mode toggle (lock icon, client-side preference)
  - [x] New sheets start empty (no default attributes)
  - [x] Sheets default to read-only when switching; new sheets default to unlocked
- [x] **Roll Templates UI**
  - [x] Create/edit/delete roll templates
  - [x] Compact single-line view mode (Name | Roll button)
  - [x] Edit mode with name and multiple formula variants
  - [x] Same edit pattern as attributes (cog icon on hover, Enter/Escape)
  - [x] Drag-and-drop reordering
  - [x] Formula validation (checks @code references exist)
  - [x] Warning icon and disabled Roll button when invalid
  - [x] Heading dividers with collapse/expand (same as attributes)
  - [x] Multiple formula variants per template (split button dropdown)
- [x] **Dice Rolling Engine**
  - [x] Parse dice notation (`XdY`)
  - [x] Keep/drop modifiers (`kh`, `kl`, `dh`, `dl` with optional count)
  - [x] Stacking modifiers (e.g., `4d6dl1dh1`)
  - [x] Attribute substitution in formulas
  - [x] Parentheses support for grouping
- [x] **History System**
  - [x] Execute rolls and record to history
  - [x] Display format string resolution (`{code}`, `{result}`)
  - [x] Collapsible detailed breakdown (click chevron to expand)
  - [x] Individual dice shown, dropped dice with strikethrough
  - [x] Attributes used shown with names (not codes) in purple
  - [x] Server persistence
  - [x] Real-time sync of new rolls to all clients
  - [x] Clear history button

### Not Yet Implemented

- [ ] **Polish & Edge Cases**
  - [ ] Loading states
  - [ ] Error handling for network issues
  - [ ] Reconnection feedback

---

## Core Concepts

### Character Sheets

Stored on the server, accessible by anyone. Each sheet contains:

- **Sheet Name**: Displayed at the top; click pencil icon to rename
  - Custom 1-2 character initials can be set for the sidebar icon
  - The sheet name is used for `{name}` in display formats

- **Read-Only Mode**: Lock icon in top-right toggles read-only mode (client-side only)
  - When locked: hides edit UI, drag handles, add buttons, and attribute codes
  - Rolling still works in read-only mode
  - Sheets default to locked when switching; new sheets default to unlocked

- **Attributes**: Named values with a code for roll references
  - Types: `string`, `integer`, `derived`, or `heading`
  - Example: Name="Dexterity", Code="dex", Type=integer, Value=3
  - New sheets start empty (no default attributes)
  - Compact single-line display: Name | @code | Value (value right-justified)
  - Attributes are non-editable by default; click cog icon (visible on hover) to edit
  - Edit mode: Enter to save, Escape to cancel
  - Drag handle on left side for reordering
  - Code validation: lowercase alpha + underscore only, must be unique

- **Heading Dividers**: Section headers for organizing attributes
  - Only have a name field (no code or value)
  - Cannot be referenced in formulas or roll templates
  - Attributes below a heading are indented until the next heading
  - Collapsible: click chevron to hide/show attributes under the heading
  - Headings themselves are never indented (not nestable)

- **Derived Attributes**: Computed values from formulas
  - Formula can reference other integer attributes via `@code`
  - Supported operations: `+`, `-`, `*`, `/`, `()`, `ceil()`, `floor()`
  - Cannot reference other derived attributes or string attributes
  - View mode shows computed result; edit mode shows formula
  - Example: `floor((@str + @dex) / 2)`

- **Roll Templates**: Predefined roll formulas
  - Types: `roll` or `heading`
  - Name: Display label (e.g., "Attack Roll")
  - Display Format: Custom output string (e.g., `"{name} attacks for {result} damage"`)
  - Formulas: Array of formula variants, each with:
    - Title: Label for the variant (e.g., "Normal", "With Advantage")
    - Formula: Dice notation with attribute references (e.g., `1d20+@str`)
  - Multiple formulas enable split-button dropdown (e.g., advantage/disadvantage, finesse weapons)
  - All formula variants share the same display format
  - Heading dividers work the same as in Attributes (collapsible sections)

### Dice Notation

- Basic: `XdY` (e.g., `2d6` = roll 2 six-sided dice)
- Modifiers: `+`, `-`, `*`, `/` with numbers or `@attribute` references
- Parentheses: `(1d6+@str)*2`
- Keep/Drop highest/lowest:
  - `kh[N]` - keep highest N (default 1)
  - `kl[N]` - keep lowest N (default 1)
  - `dh[N]` - drop highest N (default 1)
  - `dl[N]` - drop lowest N (default 1)
- Modifiers can stack: `4d6dl1dh1` = roll 4d6, drop lowest 1, drop highest 1

### Attribute References

- In roll formulas: `@code` (e.g., `1d20+@str`)
- In display format: `{code}` (e.g., `"{name} rolled {result}"`)
- Special placeholders:
  - `{result}` = final roll total
  - `{name}` = sheet name (reserved, cannot be used as attribute code)

### History

- Server-synced roll history visible to all connected clients
- Shows custom display format with resolved attribute values
- Collapsed by default; click chevron to expand details
- Expanded view shows:
  - Dice breakdown with individual rolls (dropped dice in strikethrough)
  - Attributes used with their names (in purple) and values
- Persists until "Clear History" is clicked

## UI Layout

```
+--------+------------------------------+------------------+
| Sheet  |  Sheet Name        [✏️] [🔒] |     History      |
| Icons  |                              |                  |
|        | [Attributes Section]         | [Roll entries    |
| [S1]   |   STATS (heading)            |  with detailed   |
| [S2]   |     Strength  @str        5  |  breakdowns]     |
| [S3]   |     Dexterity @dex        3  |                  |
|        |                              |                  |
| [+]    | [Roll Templates]             |                  |
|        |   Attack Roll         [Roll] |                  |
|        |   Damage Roll         [Roll] | [Clear History]  |
|        |                              |                  |
|        | [Copy] [Delete Sheet]        |                  |
+--------+------------------------------+------------------+
```

- Two-column layout on desktop (sheet + history)
- Responsive to window size changes
- Sheet selector: vertical icon sidebar left of Character Sheet
- Plus icon to add new sheet
- Sheet header with name, pencil (rename), and lock (read-only toggle)
- Copy/Delete Sheet buttons at bottom (delete requires confirmation)

## Real-time Sync

- Sheet changes sync immediately to all viewers
- History syncs to all connected clients
- No rooms/sessions - single server instance

## Validation

- Derived attributes show error if formula references unknown/invalid codes
- Roll Templates with missing attribute codes show warning (red/icon)
- Invalid Roll Templates cannot be rolled
- Attribute codes must be unique within a sheet
- Reserved codes (`result`, `maximum`, `minimum`, `name`) cannot be used as attribute codes

## Super Conditions

Roll templates can have an optional super condition that triggers dramatic effects when met:
- Placeholders: `{result}`, `{maximum}`, `{minimum}`
- Operators: `>=`, `<=`, `>`, `<`, `==`
- Arithmetic supported: `{result} >= {maximum}-1`
- Example: `{result} >= 20` for natural 20s on a d20
- Example: `{result} >= {maximum}` for max rolls on any dice

## File Structure

```
roll-sheet/
├── CLAUDE.md           # This file - project documentation
├── package.json
├── tsconfig.json
├── src/
│   ├── server.ts       # Node.js WebSocket server
│   ├── dice.ts         # Dice parsing, rolling, and evaluation
│   └── types.ts        # TypeScript type definitions
├── public/
│   ├── index.html      # Main HTML page with templates
│   ├── styles.css      # CSS styling
│   └── app.js          # Client-side JavaScript
└── data/
    ├── sheets.json     # Character sheet storage (auto-created)
    └── history.json    # Roll history storage (auto-created)
```

## Running the App

```bash
npm install
npm run dev
```

Then open http://localhost:3000
