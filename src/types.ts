// Attribute types
export type AttributeType = 'string' | 'integer' | 'derived';

export interface BaseAttribute {
  id: string;
  name: string;
  code: string;
  type: AttributeType;
  order: number;
}

export interface StringAttribute extends BaseAttribute {
  type: 'string';
  value: string;
}

export interface IntegerAttribute extends BaseAttribute {
  type: 'integer';
  value: number;
}

export interface DerivedAttribute extends BaseAttribute {
  type: 'derived';
  formula: string;
}

export type Attribute = StringAttribute | IntegerAttribute | DerivedAttribute;

// Roll Template
export interface RollTemplate {
  id: string;
  name: string;
  formula: string;
  displayFormat: string;
  order: number;
}

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
  | { type: 'getHistory' }
  | { type: 'clearHistory' }
  | { type: 'roll'; sheetId: string; templateId: string };

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
