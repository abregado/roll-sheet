// Attribute types
export type AttributeType = 'string' | 'integer' | 'derived';

export interface BaseAttribute {
  id: string;
  name: string;
  type: AttributeType;
  sort: number;
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

export type Attribute = StringAttribute | IntegerAttribute | DerivedAttribute;

// Resource types
export type PipShape =
  // Basic geometric
  | 'circle' | 'square' | 'diamond' | 'triangle' | 'hexagon' | 'star'
  // Thematic
  | 'heart' | 'shield' | 'skull' | 'flame' | 'lightning'
  // Polyhedral dice
  | 'd4' | 'd6' | 'd8' | 'd10' | 'd12' | 'd20';

export type ResourceType = 'resource';

export interface BaseResource {
  id: string;
  name: string;
  type: ResourceType;
  sort: number;
}

export interface ResourceItem extends BaseResource {
  type: 'resource';
  maximum: string; // formula or number, supports @att references
  current: number;
  shape: PipShape;
  color: string; // hex color like "#6366f1"
}

export type Resource = ResourceItem;

// Roll Template types
export type RollTemplateType = 'roll';

export interface RollFormula {
  title: string;
  formula: string;
}

export interface BaseRollTemplate {
  id: string;
  name: string;
  type: RollTemplateType;
  sort: number;
}

export interface RollTemplateRoll extends BaseRollTemplate {
  type: 'roll';
  formulas: RollFormula[];
  displayFormat: string;
  superCondition?: string; // e.g., "{result} >= 20"
}

export type RollTemplate = RollTemplateRoll;

export interface Heading {
  id: string;
  name: string;
  sort: number;
}

// Text Block types
export interface TextBlock {
  id: string;
  text: string;
  collapsible: boolean;
  sort: number;
}

// Character Sheet
export interface CharacterSheet {
  id: string;
  name: string;
  initials?: string; // Optional custom 1-2 character initials for sidebar
  schemaVersion: number;
  version: number;
  attributes: Attribute[];
  rollTemplates: RollTemplate[];
  resources: Resource[];
  headings: Heading[];
  textBlocks: TextBlock[];
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
  isSuper?: boolean; // true if super condition was met
}

export interface ResultGroup {
  formula: string;
  expandedFormula: string;
  diceResults: DiceResult[];
  attributesUsed: { code: string; name: string; value: number | string }[];
  total: number;
}

export interface RollDetails {
  formula: string;
  expandedFormula: string;
  diceResults: DiceResult[];
  attributesUsed: { code: string; name: string; value: number | string }[];
  total: number;
  // Multiple result groups for [bracket] syntax
  resultGroups?: ResultGroup[];
}

export interface DiceResult {
  notation: string;
  rolls: number[];
  kept: boolean[];
  sum: number;
}

// Dice Parsing Types
export type DiceToken =
  | { type: 'number'; value: number }
  | { type: 'dice'; count: number; sides: number; modifiers: DiceModifier[] }
  | { type: 'attribute'; code: string }
  | { type: 'operator'; value: '+' | '-' | '*' | '/' }
  | { type: 'lparen' }
  | { type: 'rparen' };

export interface DiceModifier {
  type: 'kh' | 'kl' | 'dh' | 'dl';
  count: number;
}

export interface ParsedFormula {
  tokens: DiceToken[];
  attributeRefs: string[];
}

// WebSocket Messages
// Exported sheet format (for import/export)
export interface ExportedSheet {
  name: string;
  initials?: string;
  schemaVersion?: number;
  attributes: Omit<Attribute, 'id'>[];
  rollTemplates: Omit<RollTemplate, 'id'>[];
  resources?: Omit<Resource, 'id'>[];
  headings?: Omit<Heading, 'id'>[];
  textBlocks?: Omit<TextBlock, 'id'>[];
}

export type ClientMessage =
  | { type: 'getSheets' }
  | { type: 'getSheet'; sheetId: string }
  | { type: 'createSheet'; name?: string }
  | { type: 'importSheet'; sheetData: ExportedSheet }
  | { type: 'copySheet'; sheetId: string; sheetVersion: number }
  | { type: 'deleteSheet'; sheetId: string; sheetVersion: number }
  | { type: 'updateSheet'; sheetId: string; name: string; initials?: string; sheetVersion: number }
  | { type: 'createAttribute'; sheetId: string; attribute: Omit<Attribute, 'id' | 'sort'>; sheetVersion: number }
  | { type: 'updateAttribute'; sheetId: string; attribute: Attribute; sheetVersion: number }
  | { type: 'deleteAttribute'; sheetId: string; attributeId: string; sheetVersion: number }
  | { type: 'reorderAttributes'; sheetId: string; attributeIds: string[]; sheetVersion: number }
  | { type: 'createRollTemplate'; sheetId: string; template: Omit<RollTemplate, 'id' | 'sort'>; sheetVersion: number }
  | { type: 'updateRollTemplate'; sheetId: string; template: RollTemplate; sheetVersion: number }
  | { type: 'deleteRollTemplate'; sheetId: string; templateId: string; sheetVersion: number }
  | { type: 'reorderRollTemplates'; sheetId: string; templateIds: string[]; sheetVersion: number }
  | { type: 'createResource'; sheetId: string; resource: Omit<Resource, 'id' | 'sort'>; sheetVersion: number }
  | { type: 'updateResource'; sheetId: string; resource: Resource; sheetVersion: number }
  | { type: 'deleteResource'; sheetId: string; resourceId: string; sheetVersion: number }
  | { type: 'reorderResources'; sheetId: string; resourceIds: string[]; sheetVersion: number }
  | { type: 'createHeading'; sheetId: string; heading: Omit<Heading, 'id' | 'sort'>; sheetVersion: number }
  | { type: 'updateHeading'; sheetId: string; heading: Heading; sheetVersion: number }
  | { type: 'deleteHeading'; sheetId: string; headingId: string; sheetVersion: number }
  | { type: 'reorderHeadings'; sheetId: string; headingIds: string[]; sheetVersion: number }
  | { type: 'createTextBlock'; sheetId: string; textBlock: Omit<TextBlock, 'id' | 'sort'>; sheetVersion: number }
  | { type: 'updateTextBlock'; sheetId: string; textBlock: TextBlock; sheetVersion: number }
  | { type: 'deleteTextBlock'; sheetId: string; textBlockId: string; sheetVersion: number }
  | { type: 'reorderTextBlocks'; sheetId: string; textBlockIds: string[]; sheetVersion: number }
  | {
      type: 'reorderUnified';
      sheetId: string;
      items: { kind: 'attribute' | 'rollTemplate' | 'resource' | 'heading' | 'textBlock'; id: string }[];
      sheetVersion: number;
    }
  | { type: 'getHistory' }
  | { type: 'clearHistory' }
  | { type: 'roll'; sheetId: string; templateId: string; formulaIndex?: number }
  | { type: 'adhocRoll'; sheetId: string; message: string };

export type ServerMessage =
  | { type: 'sheetList'; sheets: { id: string; name: string; initials?: string }[] }
  | { type: 'sheet'; sheet: CharacterSheet }
  | { type: 'sheetCreated'; sheet: CharacterSheet }
  | { type: 'sheetAdded'; sheet: CharacterSheet }
  | { type: 'sheetDeleted'; sheetId: string }
  | { type: 'sheetUpdated'; sheet: CharacterSheet }
  | { type: 'reject'; sheetId: string; sheetVersion: number; reason: string }
  | { type: 'history'; entries: HistoryEntry[] }
  | { type: 'historyEntry'; entry: HistoryEntry }
  | { type: 'historyCleared' }
  | { type: 'error'; message: string };
