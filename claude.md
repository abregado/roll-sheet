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
  - [x] Compact single-line display (Name | Value | @code)
  - [x] Edit mode with cog icon (visible on hover)
  - [x] Save (Enter/checkmark), Cancel (Escape/X), Delete (trash)
  - [x] Drag-and-drop reordering
  - [x] Code validation (lowercase alpha + underscore, unique)
  - [x] Indentation for attributes under headings
  - [x] Warning icon for invalid derived formulas (view mode)
  - [x] Live formula validation in edit mode
  - [x] Letter-based auto-naming (text_a, text_b, ... text_z, text_aa, etc.)
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

## Small future ideas to consider
- renaming of Sheets, including manually choosing the two letter initial for the sidebar
- adding images to represent each roll template
- Using images in the roll history to create more drama. Drag an image onto a Roll Template the upload it and add it to the roll template.
- For roll templates, a conditional for triggering a super entry in the history (like a critical hit, {result} >= 20)
- support for multiple {results} using square brackets in dice formula ("[1d20][1d20]" gives {result} and {result2})
- css customization per sheet via a paint icon at the bottom of the sheet. Has several premade css styles to choose from (Light, Dark, Retro, Paper)
- support for dragging the divider between sheet and history to change the width of the columns
- animated transition when a new entry is added to the history, to give notificaton that something happened.
- super transitions when a super result was rolled
- columns for attributes, so the user can have more of them side by side
- a css style and new layout for mobile users. I mean, right now it works, but it isn't pretty or usable.
- include carbon copy of formula used in the expanded history entry of a roll
- a toggle at the top of the sheet to set a sheet as read only, hiding all the UI for edit mode and adding new entries. Rolling still works as normal.

## Big new features to add
### Resource sheet section
New section for sheets to track resources like HP, Ability charges, Spell tokens. Should be generic just like everything else but have nice UX.
Selectable shapes for the resource pips (circle, star, triangle, ect) color and icon also customizable. Click pips to fill or empty them.

---

## Core Concepts

### Character Sheets

Stored on the server, accessible by anyone. Each sheet contains:

- **Attributes**: Named values with a code for roll references
  - Types: `string`, `integer`, `derived`, or `heading`
  - Example: Name="Dexterity", Code="dex", Type=integer, Value=3
  - New sheets start with one string attribute: Name (code: `name`)
  - Compact single-line display: Name | Value | @code
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
- Special: `{result}` = final roll total

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
+--------+-------------------------+------------------+
| Sheet  |    Character Sheet      |     History      |
| Icons  |                         |                  |
|        | [Attributes Section]    | [Roll entries    |
| [S1]   |   STATS (heading)       |  with detailed   |
| [S2]   |     Strength    5 @str  |  breakdowns]     |
| [S3]   |     Dexterity   3 @dex  |                  |
|        |                         |                  |
| [+]    | [Roll Templates]        |                  |
|        |   Attack Roll    [Roll] |                  |
|        |   Damage Roll    [Roll] | [Clear History]  |
|        |                         |                  |
|        | [Copy] [Delete Sheet]   |                  |
+--------+-------------------------+------------------+
```

- Two-column layout on desktop (sheet + history)
- Responsive to window size changes
- Sheet selector: vertical icon sidebar left of Character Sheet
- Plus icon to add new sheet
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
