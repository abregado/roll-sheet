# UI Layout

## Desktop Layout

```
+--------+------------------------------+------------------+
| Sheet  |  Sheet Name        [pencil] [lock] |  History   |
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

## Components

### Sheet Sidebar (left)
- Vertical list of sheet icons (initials)
- Plus icon at bottom to add new sheet
- Click to switch sheets

### Sheet Panel (center)
- Header: sheet name, pencil (rename), lock (read-only toggle)
- Attributes section with add button
- Roll Templates section with add button
- Footer: Copy and Delete Sheet buttons

### History Panel (right)
- Scrollable list of roll entries
- Clear History button at bottom

## Responsive Behavior

- Two-column layout on desktop (sheet + history)
- Responsive to window size changes
- Columns adjust width based on viewport
