import {
  DiceToken,
  DiceModifier,
  ParsedFormula,
  DiceResult,
  RollDetails,
  ResultGroup,
  HistoryEntry,
  CharacterSheet,
  RollTemplateRoll,
  Attribute,
} from './types';

/**
 * Tokenize a dice formula into tokens
 */
export function tokenize(formula: string): DiceToken[] {
  const tokens: DiceToken[] = [];
  let i = 0;
  const str = formula.replace(/\s+/g, ''); // Remove whitespace

  while (i < str.length) {
    const char = str[i];

    // Operators
    if (char === '+' || char === '-' || char === '*' || char === '/') {
      tokens.push({ type: 'operator', value: char });
      i++;
      continue;
    }

    // Parentheses
    if (char === '(') {
      tokens.push({ type: 'lparen' });
      i++;
      continue;
    }
    if (char === ')') {
      tokens.push({ type: 'rparen' });
      i++;
      continue;
    }

    // Attribute reference (@code)
    if (char === '@') {
      i++; // skip @
      let code = '';
      while (i < str.length && /[a-z_]/i.test(str[i])) {
        code += str[i];
        i++;
      }
      if (code) {
        tokens.push({ type: 'attribute', code: code.toLowerCase() });
      }
      continue;
    }

    // Number or dice notation
    if (/\d/.test(char)) {
      // Read the full number/dice expression
      let numStr = '';
      while (i < str.length && /\d/.test(str[i])) {
        numStr += str[i];
        i++;
      }

      // Check for 'd' (dice notation)
      if (i < str.length && str[i].toLowerCase() === 'd') {
        const count = parseInt(numStr, 10) || 1;
        i++; // skip 'd'

        // Read sides
        let sidesStr = '';
        while (i < str.length && /\d/.test(str[i])) {
          sidesStr += str[i];
          i++;
        }
        const sides = parseInt(sidesStr, 10);

        if (!sides || sides <= 0) {
          throw new Error(`Invalid dice notation: ${numStr}d${sidesStr}`);
        }

        // Read modifiers (kh, kl, dh, dl)
        const modifiers: DiceModifier[] = [];
        while (i < str.length) {
          const modMatch = str.slice(i).match(/^(kh|kl|dh|dl)(\d*)/i);
          if (modMatch) {
            modifiers.push({
              type: modMatch[1].toLowerCase() as DiceModifier['type'],
              count: modMatch[2] ? parseInt(modMatch[2], 10) : 1,
            });
            i += modMatch[0].length;
          } else {
            break;
          }
        }

        tokens.push({ type: 'dice', count, sides, modifiers });
      } else {
        // Just a number
        tokens.push({ type: 'number', value: parseInt(numStr, 10) });
      }
      continue;
    }

    // Handle standalone 'd' (e.g., d20 = 1d20)
    if (char.toLowerCase() === 'd' && i + 1 < str.length && /\d/.test(str[i + 1])) {
      i++; // skip 'd'
      let sidesStr = '';
      while (i < str.length && /\d/.test(str[i])) {
        sidesStr += str[i];
        i++;
      }
      const sides = parseInt(sidesStr, 10);

      // Read modifiers
      const modifiers: DiceModifier[] = [];
      while (i < str.length) {
        const modMatch = str.slice(i).match(/^(kh|kl|dh|dl)(\d*)/i);
        if (modMatch) {
          modifiers.push({
            type: modMatch[1].toLowerCase() as DiceModifier['type'],
            count: modMatch[2] ? parseInt(modMatch[2], 10) : 1,
          });
          i += modMatch[0].length;
        } else {
          break;
        }
      }

      tokens.push({ type: 'dice', count: 1, sides, modifiers });
      continue;
    }

    // Unknown character - skip it
    i++;
  }

  return tokens;
}

/**
 * Parse a formula and extract attribute references
 */
export function parseFormula(formula: string): ParsedFormula {
  const tokens = tokenize(formula);
  const attributeRefs: string[] = [];

  for (const token of tokens) {
    if (token.type === 'attribute' && !attributeRefs.includes(token.code)) {
      attributeRefs.push(token.code);
    }
  }

  return { tokens, attributeRefs };
}

/**
 * Split a formula into result groups using square bracket syntax
 * "[1d20+@str][1d6]" -> ["1d20+@str", "1d6"]
 * "1d20+@str" -> ["1d20+@str"] (no brackets = single group)
 */
export function splitFormulaGroups(formula: string): string[] {
  const bracketRegex = /\[([^\]]+)\]/g;
  const groups: string[] = [];
  let match;

  while ((match = bracketRegex.exec(formula)) !== null) {
    groups.push(match[1]);
  }

  // If no brackets found, treat entire formula as single group
  if (groups.length === 0) {
    return [formula];
  }

  return groups;
}

/**
 * Roll dice and return array of results
 */
export function rollDice(count: number, sides: number): number[] {
  const rolls: number[] = [];
  for (let i = 0; i < count; i++) {
    rolls.push(Math.floor(Math.random() * sides) + 1);
  }
  return rolls;
}

/**
 * Apply keep/drop modifiers to rolls
 * Returns which rolls are kept (true = kept, false = dropped)
 */
export function applyModifiers(rolls: number[], modifiers: DiceModifier[]): boolean[] {
  const kept = rolls.map(() => true);

  for (const mod of modifiers) {
    // Get indices of currently kept dice
    const keptIndices: number[] = [];
    for (let i = 0; i < rolls.length; i++) {
      if (kept[i]) {
        keptIndices.push(i);
      }
    }

    if (keptIndices.length === 0) continue;

    // Sort kept dice by value
    const sortedKept = keptIndices
      .map((idx) => ({ idx, value: rolls[idx] }))
      .sort((a, b) => a.value - b.value);

    const count = Math.min(mod.count, sortedKept.length);

    switch (mod.type) {
      case 'dl': // drop lowest
        for (let i = 0; i < count; i++) {
          kept[sortedKept[i].idx] = false;
        }
        break;

      case 'dh': // drop highest
        for (let i = 0; i < count; i++) {
          kept[sortedKept[sortedKept.length - 1 - i].idx] = false;
        }
        break;

      case 'kl': // keep lowest - drop all but lowest N
        for (let i = count; i < sortedKept.length; i++) {
          kept[sortedKept[i].idx] = false;
        }
        break;

      case 'kh': // keep highest - drop all but highest N
        for (let i = 0; i < sortedKept.length - count; i++) {
          kept[sortedKept[i].idx] = false;
        }
        break;
    }
  }

  return kept;
}

/**
 * Roll a dice group and return the result
 */
export function rollDiceGroup(
  count: number,
  sides: number,
  modifiers: DiceModifier[]
): DiceResult {
  const rolls = rollDice(count, sides);
  const kept = applyModifiers(rolls, modifiers);
  const sum = rolls.reduce((total, roll, i) => (kept[i] ? total + roll : total), 0);

  // Build notation string
  let notation = `${count}d${sides}`;
  for (const mod of modifiers) {
    notation += mod.type + (mod.count > 1 ? mod.count : '');
  }

  return { notation, rolls, kept, sum };
}

/**
 * Build attribute map for formula evaluation
 * Handles both integer and derived attributes
 */
export function buildAttributeMap(
  attributes: Attribute[]
): Map<string, number> {
  const values = new Map<string, number>();

  // First pass: collect integer attribute values
  for (const attr of attributes) {
    if (attr.type === 'integer') {
      values.set(attr.code, attr.value);
    }
  }

  // Second pass: evaluate derived attributes
  for (const attr of attributes) {
    if (attr.type === 'derived') {
      try {
        const result = evaluateDerivedFormula(attr.formula, values);
        values.set(attr.code, result);
      } catch {
        // If derived formula fails, skip it
      }
    }
  }

  return values;
}

/**
 * Evaluate a derived attribute formula (supports +, -, *, /, ceil, floor)
 */
function evaluateDerivedFormula(formula: string, values: Map<string, number>): number {
  // Empty formula evaluates to 0
  if (!formula || !formula.trim()) {
    return 0;
  }

  // Replace @code references with their values
  let expr = formula.replace(/@([a-z_]+)/gi, (_, code) => {
    const value = values.get(code.toLowerCase());
    if (value === undefined) {
      throw new Error(`Unknown attribute: ${code}`);
    }
    return value.toString();
  });

  // Replace ceil() and floor() with Math functions
  expr = expr.replace(/ceil\s*\(/gi, 'Math.ceil(');
  expr = expr.replace(/floor\s*\(/gi, 'Math.floor(');

  // Validate the expression contains only safe characters
  if (!/^[\d\s+\-*/().Math(ceil|floor)]+$/i.test(expr.replace(/Math\.(ceil|floor)/g, ''))) {
    throw new Error('Invalid characters in formula');
  }

  // Evaluate
  return Function(`"use strict"; return (${expr})`)();
}

/**
 * Evaluate a dice formula with attribute substitution
 */
export function evaluateFormula(
  tokens: DiceToken[],
  attributeValues: Map<string, number>
): { diceResults: DiceResult[]; total: number; expandedFormula: string } {
  const diceResults: DiceResult[] = [];
  const expandedParts: string[] = [];
  const evalValues: (number | string)[] = [];

  for (const token of tokens) {
    switch (token.type) {
      case 'number':
        expandedParts.push(token.value.toString());
        evalValues.push(token.value);
        break;

      case 'dice': {
        const result = rollDiceGroup(token.count, token.sides, token.modifiers);
        diceResults.push(result);
        expandedParts.push(`[${result.rolls.map((r, i) => (result.kept[i] ? r : `~${r}~`)).join(',')}]`);
        evalValues.push(result.sum);
        break;
      }

      case 'attribute': {
        const value = attributeValues.get(token.code);
        if (value === undefined) {
          throw new Error(`Unknown attribute: @${token.code}`);
        }
        expandedParts.push(`${value} (@${token.code})`);
        evalValues.push(value);
        break;
      }

      case 'operator':
        expandedParts.push(` ${token.value} `);
        evalValues.push(token.value);
        break;

      case 'lparen':
        expandedParts.push('(');
        evalValues.push('(');
        break;

      case 'rparen':
        expandedParts.push(')');
        evalValues.push(')');
        break;
    }
  }

  // Calculate total by evaluating the expression
  const exprStr = evalValues.join('');
  let total: number;
  try {
    total = Function(`"use strict"; return (${exprStr})`)();
  } catch {
    total = 0;
  }

  // Round to handle floating point
  total = Math.round(total * 1000) / 1000;

  return {
    diceResults,
    total,
    expandedFormula: expandedParts.join(''),
  };
}

/**
 * Resolve display format string
 */
/**
 * Reserved codes that cannot be used for attributes
 */
export const RESERVED_CODES = ['result', 'maximum', 'minimum', 'name'];

/**
 * Check if a code is reserved
 */
export function isReservedCode(code: string): boolean {
  return RESERVED_CODES.includes(code.toLowerCase());
}

/**
 * Calculate theoretical minimum and maximum for a formula
 */
export function calculateFormulaRange(
  tokens: DiceToken[],
  attributeValues: Map<string, number>
): { minimum: number; maximum: number } {
  const minParts: (number | string)[] = [];
  const maxParts: (number | string)[] = [];

  for (const token of tokens) {
    switch (token.type) {
      case 'number':
        minParts.push(token.value);
        maxParts.push(token.value);
        break;

      case 'dice': {
        // Calculate how many dice are kept after modifiers
        let keptCount = token.count;
        for (const mod of token.modifiers) {
          if (mod.type === 'dl' || mod.type === 'dh') {
            keptCount = Math.max(0, keptCount - mod.count);
          } else if (mod.type === 'kl' || mod.type === 'kh') {
            keptCount = Math.min(keptCount, mod.count);
          }
        }
        // Minimum: all kept dice roll 1
        minParts.push(keptCount * 1);
        // Maximum: all kept dice roll max
        maxParts.push(keptCount * token.sides);
        break;
      }

      case 'attribute': {
        const value = attributeValues.get(token.code);
        if (value !== undefined) {
          minParts.push(value);
          maxParts.push(value);
        } else {
          minParts.push(0);
          maxParts.push(0);
        }
        break;
      }

      case 'operator':
        minParts.push(token.value);
        maxParts.push(token.value);
        break;

      case 'lparen':
        minParts.push('(');
        maxParts.push('(');
        break;

      case 'rparen':
        minParts.push(')');
        maxParts.push(')');
        break;
    }
  }

  // Evaluate the expressions
  let minimum = 0;
  let maximum = 0;

  try {
    const minExpr = minParts.join('');
    minimum = Function(`"use strict"; return (${minExpr})`)();
  } catch {
    minimum = 0;
  }

  try {
    const maxExpr = maxParts.join('');
    maximum = Function(`"use strict"; return (${maxExpr})`)();
  } catch {
    maximum = 0;
  }

  return { minimum, maximum };
}

/**
 * Evaluate a super condition (e.g., "{result} >= {maximum}")
 * Supports comparison operators: >=, <=, >, <, ==
 * Supports placeholders: {result}, {maximum}, {minimum}
 */
export function evaluateSuperCondition(
  condition: string,
  total: number,
  minimum: number,
  maximum: number
): boolean {
  if (!condition || !condition.trim()) {
    return false;
  }

  // Replace placeholders with values
  let expr = condition
    .replace(/\{result\}/gi, total.toString())
    .replace(/\{maximum\}/gi, maximum.toString())
    .replace(/\{minimum\}/gi, minimum.toString());

  // Evaluate simple arithmetic on each side first, then compare
  // Split by comparison operator
  const compMatch = expr.match(/^(.+?)(>=|<=|>|<|==)(.+)$/);
  if (!compMatch) {
    return false;
  }

  const leftExpr = compMatch[1].trim();
  const operator = compMatch[2];
  const rightExpr = compMatch[3].trim();

  // Evaluate left and right sides (allow simple math like {maximum}-1)
  let left: number;
  let right: number;

  try {
    // Only allow safe characters: digits, operators, parentheses, spaces, decimal points
    if (!/^[\d\s+\-*/().]+$/.test(leftExpr) || !/^[\d\s+\-*/().]+$/.test(rightExpr)) {
      return false;
    }
    left = Function(`"use strict"; return (${leftExpr})`)();
    right = Function(`"use strict"; return (${rightExpr})`)();
  } catch {
    return false;
  }

  switch (operator) {
    case '>=':
      return left >= right;
    case '<=':
      return left <= right;
    case '>':
      return left > right;
    case '<':
      return left < right;
    case '==':
      return left === right;
    default:
      return false;
  }
}

export function resolveDisplayFormat(
  format: string,
  attributes: Attribute[],
  totals: number[],
  sheetName: string,
  variantTitle?: string
): string {
  let result = format;

  // Replace {result} with the first total, {result2} with second, etc.
  result = result.replace(/\{result(\d*)\}/gi, (_, num) => {
    const index = num ? parseInt(num, 10) - 1 : 0; // {result} = index 0, {result2} = index 1
    if (index >= 0 && index < totals.length) {
      return totals[index].toString();
    }
    return '0';
  });

  // Replace {name} with the sheet name (reserved code)
  result = result.replace(/\{name\}/gi, sheetName);

  // Replace {variant} with the variant title (or empty string if not set)
  result = result.replace(/\{variant\}/gi, variantTitle || '');

  // Replace {code} with attribute values
  result = result.replace(/\{([a-z_]+)\}/gi, (_, code) => {
    // Skip if it was already handled (like {name})
    if (code.toLowerCase() === 'name') {
      return sheetName;
    }
    const attr = attributes.find(
      (a) => 'code' in a && a.code.toLowerCase() === code.toLowerCase()
    );
    if (attr && 'value' in attr) {
      return String(attr.value);
    }
    if (attr && 'formula' in attr) {
      // For derived attributes, evaluate the formula
      const values = buildAttributeMap(attributes);
      return String(values.get(code.toLowerCase()) ?? code);
    }
    return `{${code}}`;
  });

  return result;
}

/**
 * Execute a roll and return a history entry
 */
export function executeRoll(
  sheet: CharacterSheet,
  template: RollTemplateRoll,
  formulaIndex: number,
  generateId: () => string
): HistoryEntry {
  const formulaVariant = template.formulas[formulaIndex];
  if (!formulaVariant) {
    throw new Error('Invalid formula index');
  }

  const attributeMap = buildAttributeMap(sheet.attributes);

  // Split formula into result groups using [bracket] syntax
  const formulaGroups = splitFormulaGroups(formulaVariant.formula);
  const resultGroups: ResultGroup[] = [];
  const totals: number[] = [];

  // Process each formula group
  for (const groupFormula of formulaGroups) {
    const { tokens, attributeRefs } = parseFormula(groupFormula);

    // Check all attribute references exist
    for (const ref of attributeRefs) {
      if (!attributeMap.has(ref)) {
        throw new Error(`Unknown attribute: @${ref}`);
      }
    }

    const { diceResults, total, expandedFormula } = evaluateFormula(tokens, attributeMap);

    // Build attributes used list for this group
    const attributesUsed: { code: string; name: string; value: number | string }[] = [];
    for (const ref of attributeRefs) {
      const attr = sheet.attributes.find((a) => 'code' in a && a.code === ref);
      if (attr && 'value' in attr) {
        attributesUsed.push({ code: ref, name: attr.name, value: attr.value });
      } else if (attr && 'formula' in attr) {
        attributesUsed.push({ code: ref, name: attr.name, value: attributeMap.get(ref) ?? 0 });
      }
    }

    resultGroups.push({
      formula: groupFormula,
      expandedFormula,
      diceResults,
      attributesUsed,
      total,
    });
    totals.push(total);
  }

  // For backward compatibility, use first group as primary details
  const primaryGroup = resultGroups[0];

  // Resolve display format with all totals
  const displayFormat = template.displayFormat || `${template.name}: {result}`;
  const displayText = resolveDisplayFormat(displayFormat, sheet.attributes, totals, sheet.name, formulaVariant.title);

  // Character name is now always the sheet name
  const characterName = sheet.name;

  const details: RollDetails = {
    formula: formulaVariant.formula,
    expandedFormula: primaryGroup.expandedFormula,
    diceResults: primaryGroup.diceResults,
    attributesUsed: primaryGroup.attributesUsed,
    total: primaryGroup.total,
    resultGroups: resultGroups.length > 1 ? resultGroups : undefined,
  };

  // Calculate theoretical min/max for super condition evaluation (uses first group)
  const { tokens: primaryTokens } = parseFormula(primaryGroup.formula);
  const { minimum, maximum } = calculateFormulaRange(primaryTokens, attributeMap);

  // Check super condition (uses first result)
  const isSuper = template.superCondition
    ? evaluateSuperCondition(template.superCondition, primaryGroup.total, minimum, maximum)
    : false;

  return {
    id: generateId(),
    timestamp: Date.now(),
    sheetId: sheet.id,
    characterName,
    templateName: template.name + (template.formulas.length > 1 ? ` (${formulaVariant.title})` : ''),
    displayText,
    details,
    isSuper,
  };
}

/**
 * Execute an ad hoc roll from a message with [formula] patterns
 * Returns a history entry
 */
export function executeAdhocRoll(
  sheet: CharacterSheet,
  message: string,
  generateId: () => string
): HistoryEntry {
  const attributeMap = buildAttributeMap(sheet.attributes);

  // Find all [formula] patterns in the message
  const formulaRegex = /\[([^\]]+)\]/g;
  const resultGroups: ResultGroup[] = [];
  const totals: number[] = [];

  let match;
  while ((match = formulaRegex.exec(message)) !== null) {
    const groupFormula = match[1];

    try {
      const { tokens, attributeRefs } = parseFormula(groupFormula);

      // Check all attribute references exist
      for (const ref of attributeRefs) {
        if (!attributeMap.has(ref)) {
          throw new Error(`Unknown attribute: @${ref}`);
        }
      }

      const { diceResults, total, expandedFormula } = evaluateFormula(tokens, attributeMap);

      // Build attributes used list for this group
      const attributesUsed: { code: string; name: string; value: number | string }[] = [];
      for (const ref of attributeRefs) {
        const attr = sheet.attributes.find((a) => 'code' in a && a.code === ref);
        if (attr && 'value' in attr) {
          attributesUsed.push({ code: ref, name: attr.name, value: attr.value });
        } else if (attr && 'formula' in attr) {
          attributesUsed.push({ code: ref, name: attr.name, value: attributeMap.get(ref) ?? 0 });
        }
      }

      resultGroups.push({
        formula: groupFormula,
        expandedFormula,
        diceResults,
        attributesUsed,
        total,
      });
      totals.push(total);
    } catch (err) {
      // If a formula fails, push an error result
      resultGroups.push({
        formula: groupFormula,
        expandedFormula: 'Error',
        diceResults: [],
        attributesUsed: [],
        total: 0,
      });
      totals.push(0);
    }
  }

  // Replace [formula] patterns with results in display text
  let resultIndex = 0;
  const displayText = message.replace(formulaRegex, () => {
    const total = totals[resultIndex++];
    return String(total);
  });

  // Use first result group as primary details, or create empty details if no rolls
  const primaryGroup = resultGroups[0] || {
    formula: '',
    expandedFormula: '',
    diceResults: [],
    attributesUsed: [],
    total: 0,
  };

  const details: RollDetails = {
    formula: resultGroups.map((g) => g.formula).join(' | '),
    expandedFormula: primaryGroup.expandedFormula,
    diceResults: primaryGroup.diceResults,
    attributesUsed: primaryGroup.attributesUsed,
    total: primaryGroup.total,
    resultGroups: resultGroups.length > 1 ? resultGroups : undefined,
  };

  return {
    id: generateId(),
    timestamp: Date.now(),
    sheetId: sheet.id,
    characterName: sheet.name,
    templateName: 'Ad Hoc',
    displayText,
    details,
    isSuper: false,
  };
}
