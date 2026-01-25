# Character Sheets

Stored on the server in `data/sheets.json`, accessible by anyone.

## Sheet Properties

- **id**: Unique identifier
- **name**: Displayed at top of sheet; click pencil icon to rename
- **initials**: Custom 1-2 character initials for sidebar icon
- **attributes**: Array of attribute objects
- **rollTemplates**: Array of roll template objects

## Sheet Name

- Used for `{name}` placeholder in display formats
- Editable via pencil icon in sheet header

## Read-Only Mode

Client-side preference toggled via lock icon in top-right.

When locked:
- Hides edit UI (cog icons, drag handles, add buttons)
- Hides attribute codes (@code column)
- Rolling still works

Default behavior:
- Existing sheets default to locked when switching
- New sheets default to unlocked

## Sheet Operations

- **Create**: Plus icon in sidebar, starts empty (no default attributes)
- **Copy**: Duplicates entire sheet with " Copy" suffix
- **Delete**: Requires confirmation dialog
- **Rename**: Pencil icon, includes initials field

## Real-time Sync

- All sheet changes sync immediately to all connected clients
- No rooms/sessions - single server instance
- WebSocket messages: `sheets`, `updateSheet`, `deleteSheet`, `newSheet`
