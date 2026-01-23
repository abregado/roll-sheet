---
layout: default
title: User Guide
---

[← Back to Documentation](index) | [Hosting Guide →](hosting-guide)

# User Guide

This guide covers everything you need to know to use Roll Sheet effectively.

---

## Table of Contents

- [Getting Started](#getting-started)
- [Character Sheets](#character-sheets)
- [Attributes](#attributes)
- [Roll Templates](#roll-templates)
- [Dice Notation](#dice-notation)
- [Roll History](#roll-history)

---

## Getting Started

When you first open Roll Sheet, you'll see a three-column layout:

1. **Sheet Sidebar** (left) - Icons for each character sheet
2. **Character Sheet** (center) - Attributes and roll templates
3. **History** (right) - Roll results

Click the **+** button in the sidebar to create your first character sheet.

---

## Character Sheets

### Creating a Sheet

Click the **+** icon at the bottom of the sheet sidebar. A new sheet will be created with a default "Name" attribute.

### Switching Sheets

Click any sheet icon in the sidebar to switch to that character.

### Copying a Sheet

Click **Copy Sheet** at the bottom of the character sheet to duplicate it. Useful for creating similar characters or NPCs.

### Deleting a Sheet

Click **Delete Sheet** and confirm the deletion. This cannot be undone.

---

## Attributes

Attributes store your character's stats and information. There are four types:

### String Attributes

For text values like character name, class, or notes.

### Integer Attributes

For numeric values like ability scores, level, or hit points. These can be referenced in roll formulas using `@code`.

### Derived Attributes

Computed values based on other attributes. For example, a modifier might be:

```
floor((@strength - 10) / 2)
```

**Supported operations:** `+`, `-`, `*`, `/`, `()`, `ceil()`, `floor()`

Derived attributes can only reference integer attributes, not other derived attributes.

### Headings

Section dividers to organize your attributes. Click the chevron to collapse/expand sections.

### Working with Attributes

- **View mode**: Shows Name | Value | @code
- **Edit mode**: Click the cog icon (appears on hover) to edit
- **Save**: Press Enter or click the checkmark
- **Cancel**: Press Escape or click the X
- **Delete**: Click the trash icon in edit mode
- **Reorder**: Drag using the handle on the left

### Attribute Codes

Each attribute has a unique code used for references:

- Must be lowercase letters and underscores only
- Must be unique within the sheet
- Reserved codes: `result`, `maximum`, `minimum`

---

## Roll Templates

Roll templates let you save and reuse dice formulas.

### Creating a Template

1. Click **+ Roll** at the bottom of the Roll Templates section
2. Enter a name (e.g., "Attack Roll")
3. Add formula variants with titles (e.g., "Normal", "With Advantage")
4. Set the display format
5. Press Enter or click the checkmark to save

### Formula Variants

Each template can have multiple formula variants. For example, an attack roll might have:

- **Normal**: `1d20+@attack_bonus`
- **Advantage**: `2d20kh1+@attack_bonus`
- **Disadvantage**: `2d20kl1+@attack_bonus`

When rolling, click the main button for the first variant, or use the dropdown for others.

### Display Format

Customize how roll results appear in history:

```
{name} attacks for {result} damage!
```

- `{code}` - Replaced with attribute value
- `{result}` - The final roll total

### Super Conditions

Trigger dramatic effects for special rolls (like critical hits):

```
{result} >= 20
```

Available placeholders:
- `{result}` - The roll total
- `{maximum}` - Maximum possible roll
- `{minimum}` - Minimum possible roll

---

## Dice Notation

Roll Sheet supports comprehensive dice notation:

### Basic Rolls

- `1d20` - Roll one 20-sided die
- `2d6` - Roll two 6-sided dice
- `3d8+5` - Roll 3d8 and add 5

### Attribute References

- `1d20+@dex` - Add the dex attribute to the roll
- `@damage_dice+@str` - Use an attribute for the dice count

### Keep/Drop Modifiers

- `4d6kh3` - Roll 4d6, keep highest 3 (ability scores)
- `2d20kh1` - Roll 2d20, keep highest 1 (advantage)
- `2d20kl1` - Roll 2d20, keep lowest 1 (disadvantage)
- `4d6dl1` - Roll 4d6, drop lowest 1

Modifiers can stack: `4d6dl1dh1` drops both lowest and highest.

### Arithmetic

- `(1d6+@str)*2` - Parentheses for grouping
- `1d20+@proficiency+@str` - Multiple modifiers

---

## Roll History

All rolls are saved to the history panel and synced to all connected clients.

### Viewing Results

Each entry shows the display format with resolved values. Click the chevron to expand details:

- **Dice breakdown**: Individual rolls (dropped dice shown in strikethrough)
- **Attributes used**: Names and values of referenced attributes

### Clearing History

Click **Clear History** at the bottom to remove all entries. This affects all connected clients.

---

[← Back to Documentation](index) | [Hosting Guide →](hosting-guide)
