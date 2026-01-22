import {
  DiceToken,
  DiceModifier,
  ParsedFormula,
  DiceResult,
  RollDetails,
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
        expandedParts.push(value.toString());
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
export function resolveDisplayFormat(
  format: string,
  attributes: Attribute[],
  total: number
): string {
  let result = format;

  // Replace {result} with the total
  result = result.replace(/\{result\}/gi, total.toString());

  // Replace {code} with attribute values
  result = result.replace(/\{([a-z_]+)\}/gi, (_, code) => {
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

  const { tokens, attributeRefs } = parseFormula(formulaVariant.formula);
  const attributeMap = buildAttributeMap(sheet.attributes);

  // Check all attribute references exist
  for (const ref of attributeRefs) {
    if (!attributeMap.has(ref)) {
      throw new Error(`Unknown attribute: @${ref}`);
    }
  }

  const { diceResults, total, expandedFormula } = evaluateFormula(tokens, attributeMap);

  // Build attributes used list
  const attributesUsed: { code: string; name: string; value: number | string }[] = [];
  for (const ref of attributeRefs) {
    const attr = sheet.attributes.find((a) => 'code' in a && a.code === ref);
    if (attr && 'value' in attr) {
      attributesUsed.push({ code: ref, name: attr.name, value: attr.value });
    } else if (attr && 'formula' in attr) {
      attributesUsed.push({ code: ref, name: attr.name, value: attributeMap.get(ref) ?? 0 });
    }
  }

  // Resolve display format
  const displayFormat = template.displayFormat || `${template.name}: {result}`;
  const displayText = resolveDisplayFormat(displayFormat, sheet.attributes, total);

  // Get character name
  const nameAttr = sheet.attributes.find(
    (a) => a.type === 'string' && 'code' in a && a.code === 'name'
  );
  const characterName = nameAttr && 'value' in nameAttr ? String(nameAttr.value) : sheet.name;

  const details: RollDetails = {
    formula: formulaVariant.formula,
    expandedFormula,
    diceResults,
    attributesUsed,
    total,
  };

  return {
    id: generateId(),
    timestamp: Date.now(),
    sheetId: sheet.id,
    characterName,
    templateName: template.name + (template.formulas.length > 1 ? ` (${formulaVariant.title})` : ''),
    displayText,
    details,
  };
}
