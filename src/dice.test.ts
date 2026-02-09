import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  tokenize,
  parseFormula,
  splitFormulaGroups,
  rollDice,
  applyModifiers,
  rollDiceGroup,
  buildAttributeMap,
  evaluateFormula,
  calculateFormulaRange,
  evaluateSuperCondition,
  resolveDisplayFormat,
  isReservedCode,
  executeRoll,
  executeAdhocRoll,
} from './dice';
import type {
  DiceToken,
  DiceModifier,
  Attribute,
  CharacterSheet,
  RollTemplateRoll,
} from './types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a deterministic Math.random sequence from an array of 0-based floats */
function mockRandom(values: number[]) {
  let i = 0;
  return vi.spyOn(Math, 'random').mockImplementation(() => {
    const v = values[i % values.length];
    i++;
    return v;
  });
}

function makeSheet(overrides: Partial<CharacterSheet> = {}): CharacterSheet {
  return {
    id: 'sheet-1',
    name: 'Test Hero',
    schemaVersion: 1,
    version: 1,
    attributes: [],
    rollTemplates: [],
    resources: [],
    headings: [],
    textBlocks: [],
    ...overrides,
  };
}

function makeIntAttr(code: string, value: number, name?: string): Attribute {
  return {
    id: `attr-${code}`,
    name: name ?? code,
    type: 'integer',
    code,
    value,
    sort: 0,
  };
}

function makeDerivedAttr(code: string, formula: string, name?: string): Attribute {
  return {
    id: `attr-${code}`,
    name: name ?? code,
    type: 'derived',
    code,
    formula,
    sort: 0,
  };
}

function makeTemplate(overrides: Partial<RollTemplateRoll> = {}): RollTemplateRoll {
  return {
    id: 'tmpl-1',
    name: 'Attack',
    type: 'roll',
    sort: 0,
    formulas: [{ title: 'Normal', formula: '1d20' }],
    displayFormat: '{result}',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. tokenize()
// ---------------------------------------------------------------------------
describe('tokenize', () => {
  it('parses 1d20', () => {
    const tokens = tokenize('1d20');
    expect(tokens).toEqual([
      { type: 'dice', count: 1, sides: 20, modifiers: [] },
    ]);
  });

  it('parses 2d6', () => {
    const tokens = tokenize('2d6');
    expect(tokens).toEqual([
      { type: 'dice', count: 2, sides: 6, modifiers: [] },
    ]);
  });

  it('parses 3d8+5', () => {
    const tokens = tokenize('3d8+5');
    expect(tokens).toEqual([
      { type: 'dice', count: 3, sides: 8, modifiers: [] },
      { type: 'operator', value: '+' },
      { type: 'number', value: 5 },
    ]);
  });

  it('parses d20 (implicit count 1)', () => {
    const tokens = tokenize('d20');
    expect(tokens).toEqual([
      { type: 'dice', count: 1, sides: 20, modifiers: [] },
    ]);
  });

  it('parses 1d20+@dex', () => {
    const tokens = tokenize('1d20+@dex');
    expect(tokens).toEqual([
      { type: 'dice', count: 1, sides: 20, modifiers: [] },
      { type: 'operator', value: '+' },
      { type: 'attribute', code: 'dex' },
    ]);
  });

  it('parses 4d6kh3', () => {
    const tokens = tokenize('4d6kh3');
    expect(tokens).toEqual([
      { type: 'dice', count: 4, sides: 6, modifiers: [{ type: 'kh', count: 3 }] },
    ]);
  });

  it('parses 2d20kh1 (advantage)', () => {
    const tokens = tokenize('2d20kh1');
    expect(tokens).toEqual([
      { type: 'dice', count: 2, sides: 20, modifiers: [{ type: 'kh', count: 1 }] },
    ]);
  });

  it('parses 2d20kl1 (disadvantage)', () => {
    const tokens = tokenize('2d20kl1');
    expect(tokens).toEqual([
      { type: 'dice', count: 2, sides: 20, modifiers: [{ type: 'kl', count: 1 }] },
    ]);
  });

  it('parses 4d6dl1', () => {
    const tokens = tokenize('4d6dl1');
    expect(tokens).toEqual([
      { type: 'dice', count: 4, sides: 6, modifiers: [{ type: 'dl', count: 1 }] },
    ]);
  });

  it('parses 4d6dl1dh1 (stacked modifiers)', () => {
    const tokens = tokenize('4d6dl1dh1');
    expect(tokens).toEqual([
      {
        type: 'dice',
        count: 4,
        sides: 6,
        modifiers: [
          { type: 'dl', count: 1 },
          { type: 'dh', count: 1 },
        ],
      },
    ]);
  });

  it('parses (1d6+@str)*2 with parentheses', () => {
    const tokens = tokenize('(1d6+@str)*2');
    expect(tokens).toEqual([
      { type: 'lparen' },
      { type: 'dice', count: 1, sides: 6, modifiers: [] },
      { type: 'operator', value: '+' },
      { type: 'attribute', code: 'str' },
      { type: 'rparen' },
      { type: 'operator', value: '*' },
      { type: 'number', value: 2 },
    ]);
  });

  it('parses 1d20+@proficiency+@str (multiple attributes)', () => {
    const tokens = tokenize('1d20+@proficiency+@str');
    expect(tokens).toEqual([
      { type: 'dice', count: 1, sides: 20, modifiers: [] },
      { type: 'operator', value: '+' },
      { type: 'attribute', code: 'proficiency' },
      { type: 'operator', value: '+' },
      { type: 'attribute', code: 'str' },
    ]);
  });

  it('returns empty array for empty string', () => {
    expect(tokenize('')).toEqual([]);
  });

  it('returns empty array for whitespace-only', () => {
    expect(tokenize('   ')).toEqual([]);
  });

  it('ignores extra whitespace', () => {
    const withSpaces = tokenize('1d20 + @str');
    const without = tokenize('1d20+@str');
    expect(withSpaces).toEqual(without);
  });

  it('throws on invalid sides (1d0)', () => {
    expect(() => tokenize('1d0')).toThrow();
  });

  it('skips unknown characters', () => {
    const tokens = tokenize('1d20?!');
    // Should still parse the dice, skipping ? and !
    expect(tokens).toEqual([
      { type: 'dice', count: 1, sides: 20, modifiers: [] },
    ]);
  });

  it('defaults modifier count to 1 (2d20kh)', () => {
    const tokens = tokenize('2d20kh');
    expect(tokens).toEqual([
      { type: 'dice', count: 2, sides: 20, modifiers: [{ type: 'kh', count: 1 }] },
    ]);
  });

  it('lowercases attribute codes', () => {
    const tokens = tokenize('@STR');
    expect(tokens).toEqual([{ type: 'attribute', code: 'str' }]);
  });

  it('parses all four operators', () => {
    const tokens = tokenize('1+2-3*4/5');
    const ops = tokens.filter((t): t is DiceToken & { type: 'operator' } => t.type === 'operator');
    expect(ops.map((o) => o.value)).toEqual(['+', '-', '*', '/']);
  });
});

// ---------------------------------------------------------------------------
// 2. parseFormula()
// ---------------------------------------------------------------------------
describe('parseFormula', () => {
  it('returns tokens and unique attribute refs', () => {
    const result = parseFormula('1d20+@str+@dex');
    expect(result.attributeRefs).toEqual(['str', 'dex']);
    expect(result.tokens.length).toBe(5);
  });

  it('deduplicates attribute refs', () => {
    const result = parseFormula('1d20+@str+@str');
    expect(result.attributeRefs).toEqual(['str']);
  });

  it('returns empty attributeRefs when no attributes', () => {
    const result = parseFormula('2d6+5');
    expect(result.attributeRefs).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 3. splitFormulaGroups()
// ---------------------------------------------------------------------------
describe('splitFormulaGroups', () => {
  it('splits [1d20+@attack][1d8+@str] into two groups', () => {
    expect(splitFormulaGroups('[1d20+@attack][1d8+@str]')).toEqual([
      '1d20+@attack',
      '1d8+@str',
    ]);
  });

  it('treats no-bracket formula as single group', () => {
    expect(splitFormulaGroups('1d20+@str')).toEqual(['1d20+@str']);
  });

  it('handles single bracket group', () => {
    expect(splitFormulaGroups('[2d6]')).toEqual(['2d6']);
  });

  it('handles three or more groups', () => {
    expect(splitFormulaGroups('[1d20][1d6][1d8]')).toEqual(['1d20', '1d6', '1d8']);
  });

  it('captures empty brackets', () => {
    // The regex [^\]]+ requires at least one char, so empty brackets are NOT captured
    expect(splitFormulaGroups('[]')).toEqual(['[]']);
  });
});

// ---------------------------------------------------------------------------
// 4. rollDice()
// ---------------------------------------------------------------------------
describe('rollDice', () => {
  afterEach(() => vi.restoreAllMocks());

  it('returns correct number of results', () => {
    mockRandom([0.5, 0.5, 0.5, 0.5]);
    expect(rollDice(4, 6)).toHaveLength(4);
  });

  it('returns values within [1, sides]', () => {
    // 0.0 → 1, 0.999 → sides
    mockRandom([0.0, 0.999]);
    const rolls = rollDice(2, 20);
    expect(rolls[0]).toBe(1);
    expect(rolls[1]).toBe(20);
  });

  it('handles single die', () => {
    mockRandom([0.5]);
    const rolls = rollDice(1, 6);
    expect(rolls).toHaveLength(1);
    expect(rolls[0]).toBeGreaterThanOrEqual(1);
    expect(rolls[0]).toBeLessThanOrEqual(6);
  });
});

// ---------------------------------------------------------------------------
// 5. applyModifiers()
// ---------------------------------------------------------------------------
describe('applyModifiers', () => {
  it('kh3 on 4 dice keeps top 3', () => {
    const rolls = [3, 5, 1, 4];
    const kept = applyModifiers(rolls, [{ type: 'kh', count: 3 }]);
    // 1 is dropped (index 2)
    expect(kept).toEqual([true, true, false, true]);
  });

  it('kh1 on 2 dice keeps highest (advantage)', () => {
    const rolls = [8, 15];
    const kept = applyModifiers(rolls, [{ type: 'kh', count: 1 }]);
    expect(kept).toEqual([false, true]);
  });

  it('kl1 on 2 dice keeps lowest (disadvantage)', () => {
    const rolls = [8, 15];
    const kept = applyModifiers(rolls, [{ type: 'kl', count: 1 }]);
    expect(kept).toEqual([true, false]);
  });

  it('dl1 on 4 dice drops lowest', () => {
    const rolls = [4, 2, 6, 5];
    const kept = applyModifiers(rolls, [{ type: 'dl', count: 1 }]);
    expect(kept).toEqual([true, false, true, true]);
  });

  it('dl1 then dh1 stacked drops both extremes', () => {
    const rolls = [3, 5, 1, 4];
    const kept = applyModifiers(rolls, [
      { type: 'dl', count: 1 },
      { type: 'dh', count: 1 },
    ]);
    // Sorted values: 1(idx2), 3(idx0), 4(idx3), 5(idx1)
    // dl1 drops 1 → kept=[true,true,false,true]
    // dh1 drops 5 → kept=[true,false,false,true]
    expect(kept).toEqual([true, false, false, true]);
  });

  it('modifier count exceeding dice count keeps all (kh5 on 2 dice)', () => {
    const rolls = [3, 5];
    const kept = applyModifiers(rolls, [{ type: 'kh', count: 5 }]);
    expect(kept).toEqual([true, true]);
  });

  it('all dice dropped (dl2 on 2 dice)', () => {
    const rolls = [3, 5];
    const kept = applyModifiers(rolls, [{ type: 'dl', count: 2 }]);
    expect(kept).toEqual([false, false]);
  });

  it('empty rolls returns empty array', () => {
    const kept = applyModifiers([], [{ type: 'kh', count: 1 }]);
    expect(kept).toEqual([]);
  });

  it('empty modifiers keeps all', () => {
    const rolls = [3, 5, 1];
    const kept = applyModifiers(rolls, []);
    expect(kept).toEqual([true, true, true]);
  });
});

// ---------------------------------------------------------------------------
// 6. rollDiceGroup()
// ---------------------------------------------------------------------------
describe('rollDiceGroup', () => {
  afterEach(() => vi.restoreAllMocks());

  it('returns correct notation string', () => {
    mockRandom([0.5, 0.5]);
    const result = rollDiceGroup(2, 6, []);
    expect(result.notation).toBe('2d6');
  });

  it('sum only includes kept dice', () => {
    // rolls: [1, 6, 3, 4] with dl1 → drop the 1, sum = 6+3+4 = 13
    mockRandom([0.0, 0.999, 0.4, 0.6]);
    const result = rollDiceGroup(4, 6, [{ type: 'dl', count: 1 }]);
    expect(result.rolls).toEqual([1, 6, 3, 4]);
    expect(result.kept).toEqual([false, true, true, true]);
    expect(result.sum).toBe(13);
  });

  it('includes modifier in notation (4d6dl1)', () => {
    mockRandom([0.5, 0.5, 0.5, 0.5]);
    const result = rollDiceGroup(4, 6, [{ type: 'dl', count: 1 }]);
    expect(result.notation).toBe('4d6dl');
  });

  it('includes multi-digit modifier count in notation (4d6kh3)', () => {
    mockRandom([0.5, 0.5, 0.5, 0.5]);
    const result = rollDiceGroup(4, 6, [{ type: 'kh', count: 3 }]);
    expect(result.notation).toBe('4d6kh3');
  });
});

// ---------------------------------------------------------------------------
// 7. buildAttributeMap()
// ---------------------------------------------------------------------------
describe('buildAttributeMap', () => {
  it('maps integer attributes by code', () => {
    const attrs = [makeIntAttr('str', 18), makeIntAttr('dex', 14)];
    const map = buildAttributeMap(attrs);
    expect(map.get('str')).toBe(18);
    expect(map.get('dex')).toBe(14);
  });

  it('evaluates derived attribute (floor)', () => {
    const attrs: Attribute[] = [
      makeIntAttr('strength', 16),
      makeDerivedAttr('str', 'floor((@strength - 10) / 2)'),
    ];
    const map = buildAttributeMap(attrs);
    expect(map.get('str')).toBe(3); // floor((16-10)/2) = 3
  });

  it('evaluates derived attribute (ceil)', () => {
    const attrs: Attribute[] = [
      makeIntAttr('strength', 15),
      makeDerivedAttr('str', 'ceil((@strength - 10) / 2)'),
    ];
    const map = buildAttributeMap(attrs);
    expect(map.get('str')).toBe(3); // ceil((15-10)/2) = ceil(2.5) = 3
  });

  it('empty attributes returns empty map', () => {
    const map = buildAttributeMap([]);
    expect(map.size).toBe(0);
  });

  it('derived with empty formula evaluates to 0', () => {
    const attrs: Attribute[] = [makeDerivedAttr('foo', '')];
    const map = buildAttributeMap(attrs);
    expect(map.get('foo')).toBe(0);
  });

  it('derived referencing unknown attribute is skipped', () => {
    const attrs: Attribute[] = [makeDerivedAttr('foo', '@bar + 1')];
    const map = buildAttributeMap(attrs);
    // Should not have 'foo' because @bar doesn't exist
    expect(map.has('foo')).toBe(false);
  });

  it('handles mix of integer and derived', () => {
    const attrs: Attribute[] = [
      makeIntAttr('base', 10),
      makeDerivedAttr('bonus', '@base + 5'),
    ];
    const map = buildAttributeMap(attrs);
    expect(map.get('base')).toBe(10);
    expect(map.get('bonus')).toBe(15);
  });

  it('stores negative integer attribute', () => {
    const attrs = [makeIntAttr('str', -2)];
    const map = buildAttributeMap(attrs);
    expect(map.get('str')).toBe(-2);
  });

  it('derived attribute evaluates to negative value', () => {
    const attrs: Attribute[] = [
      makeIntAttr('strength', 8),
      makeDerivedAttr('str', 'floor((@strength - 10) / 2)'),
    ];
    const map = buildAttributeMap(attrs);
    expect(map.get('str')).toBe(-1); // floor((8-10)/2) = floor(-1) = -1
  });
});

// ---------------------------------------------------------------------------
// 8. evaluateFormula()
// ---------------------------------------------------------------------------
describe('evaluateFormula', () => {
  afterEach(() => vi.restoreAllMocks());

  it('evaluates 1d20+@dex with attribute map', () => {
    mockRandom([0.5]); // roll = floor(0.5*20)+1 = 11
    const tokens = tokenize('1d20+@dex');
    const attrs = new Map([['dex', 3]]);
    const result = evaluateFormula(tokens, attrs);
    expect(result.total).toBe(14); // 11 + 3
    expect(result.diceResults).toHaveLength(1);
  });

  it('evaluates (1d6+@str)*2 with parentheses', () => {
    mockRandom([0.5]); // roll = floor(0.5*6)+1 = 4
    const tokens = tokenize('(1d6+@str)*2');
    const attrs = new Map([['str', 3]]);
    const result = evaluateFormula(tokens, attrs);
    expect(result.total).toBe(14); // (4+3)*2
  });

  it('evaluates 3d8+5 simple arithmetic', () => {
    // rolls: floor(0.2*8)+1=2, floor(0.5*8)+1=5, floor(0.9*8)+1=8
    mockRandom([0.2, 0.5, 0.9]);
    const tokens = tokenize('3d8+5');
    const result = evaluateFormula(tokens, new Map());
    expect(result.total).toBe(20); // 2+5+8+5
  });

  it('rounds floating point to 3 places', () => {
    // 1/3 scenario: 10/3 = 3.333...
    const tokens = tokenize('10/3');
    const result = evaluateFormula(tokens, new Map());
    expect(result.total).toBe(3.333);
  });

  it('throws on unknown attribute', () => {
    const tokens = tokenize('1d20+@missing');
    expect(() => evaluateFormula(tokens, new Map())).toThrow('Unknown attribute: @missing');
  });

  it('falls back to 0 on invalid expression', () => {
    // An expression that causes an eval error (e.g. just an operator)
    const tokens: DiceToken[] = [{ type: 'operator', value: '+' }];
    const result = evaluateFormula(tokens, new Map());
    expect(result.total).toBe(0);
  });

  it('includes expanded formula string with attribute values', () => {
    mockRandom([0.0]); // roll = 1
    const tokens = tokenize('1d20+@str');
    const result = evaluateFormula(tokens, new Map([['str', 5]]));
    expect(result.expandedFormula).toContain('5 (@str)');
  });

  it('adds a negative attribute (1d20+@str where str=-1)', () => {
    mockRandom([0.5]); // roll = floor(0.5*20)+1 = 11
    const tokens = tokenize('1d20+@str');
    const attrs = new Map([['str', -1]]);
    const result = evaluateFormula(tokens, attrs);
    expect(result.total).toBe(10); // 11 + (-1)
  });

  it('subtracts a positive attribute (1d20-@str where str=3)', () => {
    mockRandom([0.5]); // roll = 11
    const tokens = tokenize('1d20-@str');
    const attrs = new Map([['str', 3]]);
    const result = evaluateFormula(tokens, attrs);
    expect(result.total).toBe(8); // 11 - 3
  });

  it('subtracts a negative attribute (1d20-@str where str=-2)', () => {
    mockRandom([0.5]); // roll = 11
    const tokens = tokenize('1d20-@str');
    const attrs = new Map([['str', -2]]);
    const result = evaluateFormula(tokens, attrs);
    expect(result.total).toBe(13); // 11 - (-2) = 13
  });

  it('negative attribute can produce negative total', () => {
    mockRandom([0.0]); // roll = 1
    const tokens = tokenize('1d20+@str');
    const attrs = new Map([['str', -5]]);
    const result = evaluateFormula(tokens, attrs);
    expect(result.total).toBe(-4); // 1 + (-5)
  });

  it('multiplies with negative attribute', () => {
    mockRandom([0.5]); // roll = floor(0.5*6)+1 = 4
    const tokens = tokenize('(1d6+@str)*2');
    const attrs = new Map([['str', -3]]);
    const result = evaluateFormula(tokens, attrs);
    expect(result.total).toBe(2); // (4+(-3))*2 = 1*2
  });
});

// ---------------------------------------------------------------------------
// 9. calculateFormulaRange()
// ---------------------------------------------------------------------------
describe('calculateFormulaRange', () => {
  it('1d20 → min=1, max=20', () => {
    const tokens = tokenize('1d20');
    const { minimum, maximum } = calculateFormulaRange(tokens, new Map());
    expect(minimum).toBe(1);
    expect(maximum).toBe(20);
  });

  it('2d6+5 → min=7, max=17', () => {
    const tokens = tokenize('2d6+5');
    const { minimum, maximum } = calculateFormulaRange(tokens, new Map());
    expect(minimum).toBe(7);
    expect(maximum).toBe(17);
  });

  it('4d6dl1 → 3 kept dice, min=3, max=18', () => {
    const tokens = tokenize('4d6dl1');
    const { minimum, maximum } = calculateFormulaRange(tokens, new Map());
    expect(minimum).toBe(3);
    expect(maximum).toBe(18);
  });

  it('2d20kh1 → 1 kept die, min=1, max=20', () => {
    const tokens = tokenize('2d20kh1');
    const { minimum, maximum } = calculateFormulaRange(tokens, new Map());
    expect(minimum).toBe(1);
    expect(maximum).toBe(20);
  });

  it('constants only 5+3 → min=8, max=8', () => {
    const tokens = tokenize('5+3');
    const { minimum, maximum } = calculateFormulaRange(tokens, new Map());
    expect(minimum).toBe(8);
    expect(maximum).toBe(8);
  });

  it('with attribute values treats them as constants', () => {
    const tokens = tokenize('1d20+@str');
    const attrs = new Map([['str', 5]]);
    const { minimum, maximum } = calculateFormulaRange(tokens, attrs);
    expect(minimum).toBe(6);  // 1+5
    expect(maximum).toBe(25); // 20+5
  });

  it('unknown attribute defaults to 0', () => {
    const tokens = tokenize('1d20+@missing');
    const { minimum, maximum } = calculateFormulaRange(tokens, new Map());
    expect(minimum).toBe(1);
    expect(maximum).toBe(20);
  });

  it('negative attribute lowers range (1d20+@str where str=-2)', () => {
    const tokens = tokenize('1d20+@str');
    const attrs = new Map([['str', -2]]);
    const { minimum, maximum } = calculateFormulaRange(tokens, attrs);
    expect(minimum).toBe(-1); // 1 + (-2)
    expect(maximum).toBe(18); // 20 + (-2)
  });

  it('subtracting positive attribute lowers range (1d20-@str where str=3)', () => {
    const tokens = tokenize('1d20-@str');
    const attrs = new Map([['str', 3]]);
    const { minimum, maximum } = calculateFormulaRange(tokens, attrs);
    expect(minimum).toBe(-2); // 1 - 3
    expect(maximum).toBe(17); // 20 - 3
  });

  it('subtracting negative attribute raises range (1d20-@str where str=-2)', () => {
    const tokens = tokenize('1d20-@str');
    const attrs = new Map([['str', -2]]);
    const { minimum, maximum } = calculateFormulaRange(tokens, attrs);
    expect(minimum).toBe(3);  // 1 - (-2)
    expect(maximum).toBe(22); // 20 - (-2)
  });
});

// ---------------------------------------------------------------------------
// 10. evaluateSuperCondition()
// ---------------------------------------------------------------------------
describe('evaluateSuperCondition', () => {
  it('{result} >= 20 with total=20 → true', () => {
    expect(evaluateSuperCondition('{result} >= 20', 20, 1, 20)).toBe(true);
  });

  it('{result} >= 20 with total=19 → false', () => {
    expect(evaluateSuperCondition('{result} >= 20', 19, 1, 20)).toBe(false);
  });

  it('>= operator', () => {
    expect(evaluateSuperCondition('{result} >= 10', 10, 1, 20)).toBe(true);
    expect(evaluateSuperCondition('{result} >= 10', 9, 1, 20)).toBe(false);
  });

  it('<= operator', () => {
    expect(evaluateSuperCondition('{result} <= 5', 5, 1, 20)).toBe(true);
    expect(evaluateSuperCondition('{result} <= 5', 6, 1, 20)).toBe(false);
  });

  it('> operator', () => {
    expect(evaluateSuperCondition('{result} > 10', 11, 1, 20)).toBe(true);
    expect(evaluateSuperCondition('{result} > 10', 10, 1, 20)).toBe(false);
  });

  it('< operator', () => {
    expect(evaluateSuperCondition('{result} < 5', 4, 1, 20)).toBe(true);
    expect(evaluateSuperCondition('{result} < 5', 5, 1, 20)).toBe(false);
  });

  it('== operator', () => {
    expect(evaluateSuperCondition('{result} == 20', 20, 1, 20)).toBe(true);
    expect(evaluateSuperCondition('{result} == 20', 19, 1, 20)).toBe(false);
  });

  it('empty condition → false', () => {
    expect(evaluateSuperCondition('', 20, 1, 20)).toBe(false);
  });

  it('whitespace-only → false', () => {
    expect(evaluateSuperCondition('   ', 20, 1, 20)).toBe(false);
  });

  it('arithmetic in expression: {maximum} - 1', () => {
    // "{result} >= {maximum} - 1" with total=19, max=20 → 19 >= 19 → true
    expect(evaluateSuperCondition('{result} >= {maximum} - 1', 19, 1, 20)).toBe(true);
  });

  it('{minimum} placeholder works', () => {
    expect(evaluateSuperCondition('{result} <= {minimum}', 1, 1, 20)).toBe(true);
    expect(evaluateSuperCondition('{result} <= {minimum}', 2, 1, 20)).toBe(false);
  });

  it('no comparison operator → false', () => {
    expect(evaluateSuperCondition('{result} + 1', 20, 1, 20)).toBe(false);
  });

  it('unsafe characters → false', () => {
    expect(evaluateSuperCondition('{result} >= alert("x")', 20, 1, 20)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 11. resolveDisplayFormat()
// ---------------------------------------------------------------------------
describe('resolveDisplayFormat', () => {
  it('resolves {name} attacks for {result} damage!', () => {
    const result = resolveDisplayFormat(
      '{name} attacks for {result} damage!',
      [],
      [15],
      'Gandalf'
    );
    expect(result).toBe('Gandalf attacks for 15 damage!');
  });

  it('resolves {result} and {result2} with multi-result', () => {
    const result = resolveDisplayFormat('{result} / {result2}', [], [10, 20], 'Hero');
    expect(result).toBe('10 / 20');
  });

  it('resolves {variant} placeholder', () => {
    const result = resolveDisplayFormat(
      'Roll ({variant}): {result}',
      [],
      [15],
      'Hero',
      'Advantage'
    );
    expect(result).toBe('Roll (Advantage): 15');
  });

  it('{result} index out of bounds returns 0', () => {
    const result = resolveDisplayFormat('{result3}', [], [10], 'Hero');
    expect(result).toBe('0');
  });

  it('{variant} with no variant returns empty string', () => {
    const result = resolveDisplayFormat('({variant})', [], [10], 'Hero');
    expect(result).toBe('()');
  });

  it('resolves attribute code {str}', () => {
    const attrs = [makeIntAttr('str', 18, 'Strength')];
    const result = resolveDisplayFormat('{str}', attrs, [10], 'Hero');
    expect(result).toBe('18');
  });

  it('resolves derived attribute code in format', () => {
    const attrs: Attribute[] = [
      makeIntAttr('strength', 16, 'Strength'),
      makeDerivedAttr('str', 'floor((@strength - 10) / 2)', 'STR Mod'),
    ];
    const result = resolveDisplayFormat('{str}', attrs, [10], 'Hero');
    expect(result).toBe('3');
  });

  it('unknown placeholder left as-is', () => {
    const result = resolveDisplayFormat('{unknown}', [], [10], 'Hero');
    expect(result).toBe('{unknown}');
  });
});

// ---------------------------------------------------------------------------
// 12. isReservedCode()
// ---------------------------------------------------------------------------
describe('isReservedCode', () => {
  it('result is reserved', () => {
    expect(isReservedCode('result')).toBe(true);
  });

  it('maximum is reserved', () => {
    expect(isReservedCode('maximum')).toBe(true);
  });

  it('minimum is reserved', () => {
    expect(isReservedCode('minimum')).toBe(true);
  });

  it('name is reserved', () => {
    expect(isReservedCode('name')).toBe(true);
  });

  it('case insensitive: RESULT → true', () => {
    expect(isReservedCode('RESULT')).toBe(true);
  });

  it('non-reserved codes → false', () => {
    expect(isReservedCode('str')).toBe(false);
    expect(isReservedCode('dex')).toBe(false);
    expect(isReservedCode('attack')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 13. executeRoll()
// ---------------------------------------------------------------------------
describe('executeRoll', () => {
  afterEach(() => vi.restoreAllMocks());

  it('produces valid HistoryEntry with all fields', () => {
    mockRandom([0.5]);
    const sheet = makeSheet({
      attributes: [makeIntAttr('str', 3, 'Strength')],
      rollTemplates: [
        makeTemplate({
          formulas: [{ title: 'Normal', formula: '1d20+@str' }],
          displayFormat: '{result}',
        }),
      ],
    });
    const entry = executeRoll(sheet, sheet.rollTemplates[0], 0, () => 'id-1');

    expect(entry.id).toBe('id-1');
    expect(entry.sheetId).toBe('sheet-1');
    expect(entry.characterName).toBe('Test Hero');
    expect(entry.templateName).toBe('Attack');
    expect(typeof entry.timestamp).toBe('number');
    expect(entry.details.total).toBe(14); // 11 + 3
    expect(entry.details.diceResults).toHaveLength(1);
    expect(entry.details.attributesUsed).toEqual([
      { code: 'str', name: 'Strength', value: 3 },
    ]);
  });

  it('multi-result formula populates resultGroups', () => {
    mockRandom([0.5, 0.5]);
    const sheet = makeSheet({
      attributes: [makeIntAttr('str', 3, 'Strength')],
      rollTemplates: [
        makeTemplate({
          formulas: [{ title: 'Normal', formula: '[1d20+@str][1d8+@str]' }],
          displayFormat: '{result} / {result2}',
        }),
      ],
    });
    const entry = executeRoll(sheet, sheet.rollTemplates[0], 0, () => 'id-2');

    expect(entry.details.resultGroups).toBeDefined();
    expect(entry.details.resultGroups!.length).toBe(2);
  });

  it('super condition applied correctly', () => {
    mockRandom([0.95]); // roll = floor(0.95*20)+1 = 20
    const sheet = makeSheet({
      rollTemplates: [
        makeTemplate({
          formulas: [{ title: 'Normal', formula: '1d20' }],
          superCondition: '{result} >= {maximum}',
        }),
      ],
    });
    const entry = executeRoll(sheet, sheet.rollTemplates[0], 0, () => 'id-3');
    expect(entry.isSuper).toBe(true);
  });

  it('invalid formula index throws', () => {
    const sheet = makeSheet({
      rollTemplates: [makeTemplate()],
    });
    expect(() => executeRoll(sheet, sheet.rollTemplates[0], 5, () => 'id')).toThrow(
      'Invalid formula index'
    );
  });

  it('unknown attribute in formula throws', () => {
    const sheet = makeSheet({
      rollTemplates: [
        makeTemplate({
          formulas: [{ title: 'Normal', formula: '1d20+@missing' }],
        }),
      ],
    });
    expect(() => executeRoll(sheet, sheet.rollTemplates[0], 0, () => 'id')).toThrow(
      'Unknown attribute: @missing'
    );
  });

  it('display format resolved with totals', () => {
    mockRandom([0.5]);
    const sheet = makeSheet({
      rollTemplates: [
        makeTemplate({
          formulas: [{ title: 'Normal', formula: '1d20' }],
          displayFormat: '{name} rolled {result}',
        }),
      ],
    });
    const entry = executeRoll(sheet, sheet.rollTemplates[0], 0, () => 'id');
    expect(entry.displayText).toBe('Test Hero rolled 11');
  });

  it('appends variant title when multiple formulas', () => {
    mockRandom([0.5]);
    const sheet = makeSheet({
      rollTemplates: [
        makeTemplate({
          formulas: [
            { title: 'Normal', formula: '1d20' },
            { title: 'Advantage', formula: '2d20kh1' },
          ],
        }),
      ],
    });
    const entry = executeRoll(sheet, sheet.rollTemplates[0], 0, () => 'id');
    expect(entry.templateName).toBe('Attack (Normal)');
  });
});

// ---------------------------------------------------------------------------
// 14. executeAdhocRoll()
// ---------------------------------------------------------------------------
describe('executeAdhocRoll', () => {
  afterEach(() => vi.restoreAllMocks());

  it('replaces [formula] with totals in display text', () => {
    mockRandom([0.5, 0.5]);
    const sheet = makeSheet({
      attributes: [makeIntAttr('str', 3, 'Strength')],
    });
    const entry = executeAdhocRoll(
      sheet,
      'I attack [1d20+@str] and deal [1d8+@str] damage',
      () => 'id-adhoc'
    );

    expect(entry.displayText).toBe('I attack 14 and deal 8 damage');
    expect(entry.templateName).toBe('Ad Hoc');
    expect(entry.details.resultGroups).toBeDefined();
    expect(entry.details.resultGroups!.length).toBe(2);
  });

  it('invalid attribute in formula produces error result (total=0)', () => {
    mockRandom([0.5]);
    const sheet = makeSheet();
    const entry = executeAdhocRoll(sheet, 'Roll [1d20+@missing]', () => 'id');

    // Should not throw, but total should be 0
    expect(entry.details.total).toBe(0);
    expect(entry.displayText).toBe('Roll 0');
  });

  it('no brackets → valid entry with empty details', () => {
    const sheet = makeSheet();
    const entry = executeAdhocRoll(sheet, 'Just chatting', () => 'id');

    expect(entry.templateName).toBe('Ad Hoc');
    expect(entry.displayText).toBe('Just chatting');
    expect(entry.details.formula).toBe('');
    expect(entry.details.diceResults).toEqual([]);
  });

  it('templateName is always Ad Hoc', () => {
    mockRandom([0.5]);
    const sheet = makeSheet();
    const entry = executeAdhocRoll(sheet, '[1d6]', () => 'id');
    expect(entry.templateName).toBe('Ad Hoc');
  });

  it('characterName comes from sheet name', () => {
    const sheet = makeSheet({ name: 'Gandalf the Grey' });
    const entry = executeAdhocRoll(sheet, 'hello', () => 'id');
    expect(entry.characterName).toBe('Gandalf the Grey');
  });
});
