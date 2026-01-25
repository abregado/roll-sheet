# UI Layout

## Architecture

Layout is split across two CSS files:
- **`layout.css`** - Main section positioning, sizing, and scrolling (flexbox)
- **`styles.css`** - Component and content styling

This separation allows modifying the overall layout without touching section content styles.

## Sections

The app has three main sections:
1. **Sheet Sidebar** (`.sheet-sidebar`) - Sheet selection toolbar
2. **Character Sheet** (`.character-sheet`) - Main content area
3. **History Panel** (`.history-panel`) - Roll history

Each section scrolls independently.

## Responsive Modes

Layout adapts based on **viewport aspect ratio** (not pixel breakpoints):

### Landscape Mode (width > height)
```
+--------+------------------------------+------------------+
| [+]    |  Sheet Name        [pencil] [lock] |  History   |
| [S1]   |                              |                  |
| [S2]   | [Attributes Section]         | [Roll entries    |
| [S3]   |   STATS (heading)            |  with detailed   |
|        |     Strength  @str        5  |  breakdowns]     |
|        |     Dexterity @dex        3  |                  |
|        |                              |                  |
|        | [Roll Templates]             |                  |
|        |   Attack Roll         [Roll] | [Clear History]  |
|        |                              |                  |
|        | [Copy] [Delete Sheet]        |                  |
+--------+------------------------------+------------------+
  sidebar         sheet (scrolls)           history (scrolls)
```

- Horizontal column layout: `sidebar | sheet | history`
- Sidebar: vertical icon list, scrolls vertically if overflow
- Sheet and History: each scrolls vertically, doesn't extend past viewport

### Portrait Mode (height > width)
```
+------------------------------------------+
| [+] [S1] [S2] [S3]                        |  <- sidebar (scrolls horizontally)
+------------------------------------------+
|  Sheet Name                    [pencil]  |
|                                          |
| [Attributes Section]                     |
|   STATS (heading)                        |  <- sheet (scrolls vertically)
|     Strength  @str                    5  |
|                                          |
+------------------------------------------+
|  History                                 |
|                                          |
| [Roll entries]                           |  <- history (scrolls vertically)
|                                          |
| [Clear History]                          |
+------------------------------------------+
```

- Vertical stacked layout: `sidebar / sheet / history`
- Sidebar: horizontal icon row at top, scrolls horizontally if overflow
- Sheet and History: each scrolls independently vertically

## Components

### Sheet Sidebar
- Add sheet button (`+`) always first in list
- Sheet icons (initials) in a scrollable list
- Click icon to switch sheets
- Direction changes with orientation (column in landscape, row in portrait)

### Sheet Panel
- Header: sheet name, pencil (rename), lock (read-only toggle)
- Attributes section with add buttons
- Roll Templates section with add buttons
- Resources section with add buttons
- Footer: Export, Copy, and Delete Sheet buttons

### History Panel
- Scrollable list of roll entries
- Clear History button at bottom

## CSS Media Queries

Use `orientation` media queries for layout changes:
```css
@media (orientation: landscape) { ... }
@media (orientation: portrait) { ... }
```

Content styling that needs responsive adjustments should also use orientation queries, not pixel breakpoints.
