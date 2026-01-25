# Super Conditions

Optional condition on roll templates that triggers dramatic visual effects when met.

## Condition Syntax

A boolean expression using placeholders and operators.

### Placeholders
- `{result}` - The roll's final total
- `{maximum}` - Maximum possible roll value
- `{minimum}` - Minimum possible roll value

### Operators
- `>=`, `<=`, `>`, `<`, `==`

### Arithmetic
Arithmetic expressions supported: `{result} >= {maximum}-1`

## Examples

```
{result} >= 20          # Natural 20 on d20
{result} >= {maximum}   # Max roll on any dice
{result} == {minimum}   # Min roll (critical fail)
{result} >= {maximum}-1 # Near-max roll
```

## Implementation

- Condition is evaluated after roll completes
- If true, triggers dramatic animation/effect on history entry
- Stored as string on roll template object
