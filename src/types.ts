// Attribute types
export type AttributeType = 'string' | 'integer' | 'derived' | 'heading';

export interface BaseAttribute {
  id: string;
  name: string;
  type: AttributeType;
  order: number;
}

export interface StringAttribute extends BaseAttribute {
  type: 'string';
  code: string;
  value: string;
}

export interface IntegerAttribute extends BaseAttribute {
  type: 'integer';
  code: string;
  value: number;
}

export interface DerivedAttribute extends BaseAttribute {
  type: 'derived';
  code: string;
  formula: string;
}

export interface HeadingAttribute extends BaseAttribute {
  type: 'heading';
  collapsed: boolean;
}

export type Attribute = StringAttribute | IntegerAttribute | DerivedAttribute | HeadingAttribute;

// Roll Template types
export type RollTemplateType = 'roll' | 'heading';

export interface RollFormula {
  title: string;
  formula: string;
}

export interface BaseRollTemplate {
  id: string;
  name: string;
  type: RollTemplateType;
  order: number;
}

export interface RollTemplateRoll extends BaseRollTemplate {
  type: 'roll';
  formulas: RollFormula[];
  displayFormat: string;
}

export interface RollTemplateHeading extends BaseRollTemplate {
  type: 'heading';
  collapsed: boolean;
}

export type RollTemplate = RollTemplateRoll | RollTemplateHeading;

// Character Sheet
export interface CharacterSheet {
  id: string;
  name: string;
  attributes: Attribute[];
  rollTemplates: RollTemplate[];
}

// History Entry
export interface HistoryEntry {
  id: string;
  timestamp: number;
  sheetId: string;
  characterName: string;
  templateName: string;
  displayText: string;
  details: RollDetails;
}

export interface RollDetails {
  formula: string;
  expandedFormula: string;
  diceResults: DiceResult[];
  attributesUsed: { code: string; value: number | string }[];
  total: number;
}

export interface DiceResult {
  notation: string;
  rolls: number[];
  kept: boolean[];
  sum: number;
}

// WebSocket Messages
export type ClientMessage =
  | { type: 'getSheets' }
  | { type: 'getSheet'; sheetId: string }
  | { type: 'createSheet'; name?: string }
  | { type: 'copySheet'; sheetId: string }
  | { type: 'deleteSheet'; sheetId: string }
  | { type: 'createAttribute'; sheetId: string; attribute: Omit<Attribute, 'id' | 'order'> }
  | { type: 'updateAttribute'; sheetId: string; attribute: Attribute }
  | { type: 'deleteAttribute'; sheetId: string; attributeId: string }
  | { type: 'reorderAttributes'; sheetId: string; attributeIds: string[] }
  | { type: 'createRollTemplate'; sheetId: string; template: Omit<RollTemplate, 'id' | 'order'> }
  | { type: 'updateRollTemplate'; sheetId: string; template: RollTemplate }
  | { type: 'deleteRollTemplate'; sheetId: string; templateId: string }
  | { type: 'reorderRollTemplates'; sheetId: string; templateIds: string[] }
  | { type: 'getHistory' }
  | { type: 'clearHistory' }
  | { type: 'roll'; sheetId: string; templateId: string; formulaIndex?: number };

export type ServerMessage =
  | { type: 'sheetList'; sheets: { id: string; name: string }[] }
  | { type: 'sheet'; sheet: CharacterSheet }
  | { type: 'sheetCreated'; sheet: CharacterSheet }
  | { type: 'sheetDeleted'; sheetId: string }
  | { type: 'sheetUpdated'; sheet: CharacterSheet }
  | { type: 'history'; entries: HistoryEntry[] }
  | { type: 'historyEntry'; entry: HistoryEntry }
  | { type: 'historyCleared' }
  | { type: 'error'; message: string };
