# Dice Notation

Parsing and evaluation in `src/dice.ts`.

## Basic Syntax

- `XdY` - Roll X dice with Y sides (e.g., `2d6`)
- Arithmetic: `+`, `-`, `*`, `/`
- Parentheses: `(1d6+@str)*2`
- Attribute references: `@code` (e.g., `1d20+@str`)

## Keep/Drop Modifiers

Applied immediately after dice notation:

- `kh[N]` - Keep highest N (default 1)
- `kl[N]` - Keep lowest N (default 1)
- `dh[N]` - Drop highest N (default 1)
- `dl[N]` - Drop lowest N (default 1)

Examples:
- `2d20kh1` - Roll 2d20, keep highest (advantage)
- `2d20kl1` - Roll 2d20, keep lowest (disadvantage)
- `4d6dl1` - Roll 4d6, drop lowest (stat rolling)

## Stacking Modifiers

Modifiers can chain: `4d6dl1dh1` = roll 4d6, drop lowest 1, then drop highest 1

## Attribute Substitution

Before evaluation, `@code` tokens are replaced with integer attribute values from the sheet.

## Roll Result Structure

A roll produces:
- Individual dice results (with dropped dice marked)
- Attributes used (code → value mapping)
- Final computed total
- Maximum possible value
- Minimum possible value
