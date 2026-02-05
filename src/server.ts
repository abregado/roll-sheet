import http from 'http';
import fs from 'fs';
import path from 'path';
import { WebSocketServer, WebSocket } from 'ws';
import {
  CharacterSheet,
  Attribute,
  RollTemplate,
  RollTemplateRoll,
  Resource,
  Heading,
  TextBlock,
  HistoryEntry,
  ClientMessage,
  ServerMessage,
  ExportedSheet,
} from './types';
import { executeRoll, isReservedCode } from './dice';

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, '../data');
const SHEETS_FILE = path.join(DATA_DIR, 'sheets.json');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');
const CURRENT_SCHEMA_VERSION = 2;
const SORT_STEP = 1000;

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// In-memory data store
let sheets: CharacterSheet[] = loadSheets();
let history: HistoryEntry[] = loadHistory();
resetSheetVersions();

// Load sheets from file
function loadSheets(): CharacterSheet[] {
  try {
    if (fs.existsSync(SHEETS_FILE)) {
      const data = fs.readFileSync(SHEETS_FILE, 'utf-8');
      const parsed = JSON.parse(data);
      const rawSheets = Array.isArray(parsed) ? parsed : [];
      let changed = false;
      const normalized = rawSheets.map((raw) => {
        const result = normalizeSheet(raw as Partial<CharacterSheet>);
        if (result.changed) {
          changed = true;
        }
        return result.sheet;
      });
      if (changed) {
        fs.writeFileSync(SHEETS_FILE, JSON.stringify(normalized, null, 2));
      }
      return normalized;
    }
  } catch (err) {
    console.error('Error loading sheets:', err);
  }
  // Return default sheet if no data exists
  return [createDefaultSheet()];
}

// Load history from file
function loadHistory(): HistoryEntry[] {
  try {
    if (fs.existsSync(HISTORY_FILE)) {
      const data = fs.readFileSync(HISTORY_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('Error loading history:', err);
  }
  return [];
}

// Save sheets to file
function saveSheets(): void {
  try {
    fs.writeFileSync(SHEETS_FILE, JSON.stringify(sheets, null, 2));
  } catch (err) {
    console.error('Error saving sheets:', err);
  }
}

// Save history to file
function saveHistory(): void {
  try {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
  } catch (err) {
    console.error('Error saving history:', err);
  }
}

function resetSheetVersions(): void {
  sheets.forEach((sheet) => {
    sheet.version = 0;
  });
}

type UnifiedItem =
  | { kind: 'attribute'; item: Attribute }
  | { kind: 'rollTemplate'; item: RollTemplate }
  | { kind: 'resource'; item: Resource }
  | { kind: 'heading'; item: Heading }
  | { kind: 'textBlock'; item: TextBlock };

function buildUnifiedList(sheet: CharacterSheet): UnifiedItem[] {
  return [
    ...sheet.attributes.map((item) => ({ kind: 'attribute' as const, item })),
    ...sheet.rollTemplates.map((item) => ({ kind: 'rollTemplate' as const, item })),
    ...sheet.resources.map((item) => ({ kind: 'resource' as const, item })),
    ...sheet.headings.map((item) => ({ kind: 'heading' as const, item })),
    ...(sheet.textBlocks || []).map((item) => ({ kind: 'textBlock' as const, item })),
  ].sort((a, b) => {
    if (a.item.sort !== b.item.sort) {
      return a.item.sort - b.item.sort;
    }
    const kindCompare = a.kind.localeCompare(b.kind);
    if (kindCompare !== 0) {
      return kindCompare;
    }
    return a.item.id.localeCompare(b.item.id);
  });
}

function assignSortFromUnifiedList(unified: UnifiedItem[]): void {
  unified.forEach((entry, index) => {
    entry.item.sort = index * SORT_STEP;
  });
}

function sortSheetLists(sheet: CharacterSheet): void {
  sheet.attributes.sort((a, b) => a.sort - b.sort);
  sheet.rollTemplates.sort((a, b) => a.sort - b.sort);
  sheet.resources.sort((a, b) => a.sort - b.sort);
  sheet.headings.sort((a, b) => a.sort - b.sort);
  if (sheet.textBlocks) {
    sheet.textBlocks.sort((a, b) => a.sort - b.sort);
  }
}

function touchSheet(sheet: CharacterSheet): void {
  sheet.version = (sheet.version ?? 0) + 1;
}

function rejectSheetAction(ws: WebSocket, sheet: CharacterSheet, reason: string): void {
  send(ws, { type: 'reject', sheetId: sheet.id, sheetVersion: sheet.version ?? 0, reason });
}

function ensureSheetVersion(
  ws: WebSocket,
  sheet: CharacterSheet,
  message: { sheetVersion?: number },
  action: string
): boolean {
  if (typeof message.sheetVersion !== 'number') {
    rejectSheetAction(ws, sheet, `${action} rejected: missing sheetVersion`);
    return false;
  }
  if (message.sheetVersion !== sheet.version) {
    rejectSheetAction(ws, sheet, `${action} rejected: sheet out of date`);
    return false;
  }
  return true;
}

function insertAfterLastKind(
  sheet: CharacterSheet,
  kind: UnifiedItem['kind'],
  newItem: UnifiedItem['item']
): void {
  const unified = buildUnifiedList(sheet);
  const lastIndex = unified.reduce(
    (last, entry, index) => (entry.kind === kind ? index : last),
    -1
  );
  const insertIndex = lastIndex === -1 ? unified.length : lastIndex + 1;
  unified.splice(insertIndex, 0, { kind, item: newItem } as UnifiedItem);
  assignSortFromUnifiedList(unified);

  if (kind === 'attribute') {
    sheet.attributes.push(newItem as Attribute);
  } else if (kind === 'rollTemplate') {
    sheet.rollTemplates.push(newItem as RollTemplate);
  } else if (kind === 'resource') {
    sheet.resources.push(newItem as Resource);
  } else if (kind === 'heading') {
    sheet.headings.push(newItem as Heading);
  } else if (kind === 'textBlock') {
    if (!sheet.textBlocks) {
      sheet.textBlocks = [];
    }
    sheet.textBlocks.push(newItem as TextBlock);
  }
  sortSheetLists(sheet);
}

function reorderKind(
  sheet: CharacterSheet,
  kind: UnifiedItem['kind'],
  orderedIds: string[]
): void {
  const unified = buildUnifiedList(sheet);
  const currentItems =
    kind === 'attribute'
      ? sheet.attributes
      : kind === 'rollTemplate'
        ? sheet.rollTemplates
        : kind === 'resource'
          ? sheet.resources
          : kind === 'heading'
            ? sheet.headings
            : sheet.textBlocks || [];

  const itemById = new Map(currentItems.map((item) => [item.id, item]));
  const orderedItems: UnifiedItem['item'][] = [];
  const seen = new Set<string>();

  orderedIds.forEach((id) => {
    const item = itemById.get(id);
    if (item) {
      orderedItems.push(item);
      seen.add(id);
    }
  });

  currentItems.forEach((item) => {
    if (!seen.has(item.id)) {
      orderedItems.push(item);
    }
  });

  let index = 0;
  unified.forEach((entry) => {
    if (entry.kind === kind) {
      entry.item = orderedItems[index++] as typeof entry.item;
    }
  });

  assignSortFromUnifiedList(unified);
  sortSheetLists(sheet);
}

function reorderUnified(
  sheet: CharacterSheet,
  orderedItems: { kind: UnifiedItem['kind']; id: string }[]
): void {
  const unified = buildUnifiedList(sheet);
  const keyForOrder = (entry: { kind: UnifiedItem['kind']; id: string }) => `${entry.kind}:${entry.id}`;
  const keyForUnified = (entry: UnifiedItem) => `${entry.kind}:${entry.item.id}`;
  const entryByKey = new Map(unified.map((entry) => [keyForUnified(entry), entry]));
  const orderedUnified: UnifiedItem[] = [];

  orderedItems.forEach((entry) => {
    const match = entryByKey.get(keyForOrder(entry));
    if (match) {
      orderedUnified.push(match);
      entryByKey.delete(keyForOrder(entry));
    }
  });

  unified.forEach((entry) => {
    if (entryByKey.has(keyForUnified(entry))) {
      orderedUnified.push(entry);
    }
  });

  assignSortFromUnifiedList(orderedUnified);
  sortSheetLists(sheet);
}

function hasLegacyHeading(items: unknown[]): boolean {
  return items.some((item) => typeof item === 'object' && item !== null && 'type' in item && (item as { type?: string }).type === 'heading');
}

function sortLegacyByOrder<T>(items: T[]): T[] {
  const hasOrder = items.every((item) => {
    if (typeof item !== 'object' || item === null) {
      return false;
    }
    return typeof (item as { order?: unknown }).order === 'number';
  });
  if (hasOrder) {
    return [...items].sort((a, b) => {
      const aOrder = (a as { order?: number }).order ?? 0;
      const bOrder = (b as { order?: number }).order ?? 0;
      return aOrder - bOrder;
    });
  }
  return items;
}

function migrateLegacySheet(raw: Partial<CharacterSheet>): CharacterSheet {
  const legacyAttributes = sortLegacyByOrder(
    (raw.attributes ?? []).filter((item: any) => item?.type !== 'heading')
  );
  const legacyTemplates = sortLegacyByOrder(
    (raw.rollTemplates ?? []).filter((item: any) => item?.type !== 'heading')
  );
  const legacyResources = sortLegacyByOrder(
    (raw.resources ?? []).filter((item: any) => item?.type !== 'heading')
  );

  let sortIndex = 0;
  const attributes: Attribute[] = legacyAttributes.map((item: any) => {
    const { order, ...rest } = item;
    return {
      ...rest,
      id: item.id || generateId(),
      sort: sortIndex++ * SORT_STEP,
    } as Attribute;
  });

  const rollTemplates: RollTemplate[] = legacyTemplates.map((item: any) => {
    const { order, ...rest } = item;
    return {
      ...rest,
      id: item.id || generateId(),
      sort: sortIndex++ * SORT_STEP,
    } as RollTemplate;
  });

  const resources: Resource[] = legacyResources.map((item: any) => {
    const { order, ...rest } = item;
    return {
      ...rest,
      id: item.id || generateId(),
      sort: sortIndex++ * SORT_STEP,
    } as Resource;
  });

  return {
    id: raw.id || generateId(),
    name: raw.name || 'New Character',
    initials: raw.initials,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    version: typeof raw.version === 'number' ? raw.version : 0,
    attributes,
    rollTemplates,
    resources,
    headings: [],
    textBlocks: [],
  };
}

function normalizeSheet(raw: Partial<CharacterSheet>): { sheet: CharacterSheet; changed: boolean } {
  const schemaVersion = typeof raw.schemaVersion === 'number' ? raw.schemaVersion : 1;
  if (schemaVersion < CURRENT_SCHEMA_VERSION) {
    return { sheet: migrateLegacySheet(raw), changed: true };
  }

  const sheet: CharacterSheet = {
    id: raw.id || generateId(),
    name: raw.name || 'New Character',
    initials: raw.initials,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    version: typeof raw.version === 'number' ? raw.version : 0,
    attributes: Array.isArray(raw.attributes) ? raw.attributes : [],
    rollTemplates: Array.isArray(raw.rollTemplates) ? raw.rollTemplates : [],
    resources: Array.isArray(raw.resources) ? raw.resources : [],
    headings: Array.isArray(raw.headings) ? raw.headings : [],
    textBlocks: Array.isArray(raw.textBlocks) ? raw.textBlocks : [],
  };

  const unified = buildUnifiedList(sheet);
  const needsSort = unified.some((entry) => typeof entry.item.sort !== 'number' || Number.isNaN(entry.item.sort));
  if (needsSort) {
    assignSortFromUnifiedList(unified);
  }
  sortSheetLists(sheet);

  return { sheet, changed: needsSort || schemaVersion !== CURRENT_SCHEMA_VERSION };
}

function buildImportedSheet(sheetData: ExportedSheet): CharacterSheet {
  const attributes = Array.isArray(sheetData.attributes) ? sheetData.attributes : [];
  const rollTemplates = Array.isArray(sheetData.rollTemplates) ? sheetData.rollTemplates : [];
  const resources = Array.isArray(sheetData.resources) ? sheetData.resources : [];
  const headings = Array.isArray(sheetData.headings) ? sheetData.headings : [];
  const textBlocks = Array.isArray(sheetData.textBlocks) ? sheetData.textBlocks : [];

  const legacyImport =
    hasLegacyHeading(attributes as unknown[]) ||
    hasLegacyHeading(rollTemplates as unknown[]) ||
    hasLegacyHeading(resources as unknown[]);

  if (legacyImport) {
    let sortIndex = 0;
    const migratedAttributes = sortLegacyByOrder(
      (attributes as any[]).filter((item) => item?.type !== 'heading')
    ).map((item) => {
      const { order, ...rest } = item;
      return { ...rest, id: generateId(), sort: sortIndex++ * SORT_STEP } as Attribute;
    });

    const migratedTemplates = sortLegacyByOrder(
      (rollTemplates as any[]).filter((item) => item?.type !== 'heading')
    ).map((item) => {
      const { order, ...rest } = item;
      return { ...rest, id: generateId(), sort: sortIndex++ * SORT_STEP } as RollTemplate;
    });

    const migratedResources = sortLegacyByOrder(
      (resources as any[]).filter((item) => item?.type !== 'heading')
    ).map((item) => {
      const { order, ...rest } = item;
      return { ...rest, id: generateId(), sort: sortIndex++ * SORT_STEP } as Resource;
    });

    return {
      id: generateId(),
      name: sheetData.name,
      initials: sheetData.initials,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      version: 0,
      attributes: migratedAttributes,
      rollTemplates: migratedTemplates,
      resources: migratedResources,
      headings: [],
      textBlocks: [],
    };
  }

  const importedSheet: CharacterSheet = {
    id: generateId(),
    name: sheetData.name,
    initials: sheetData.initials,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    version: 0,
    attributes: attributes.map((attr) => ({ ...attr, id: generateId() })) as Attribute[],
    rollTemplates: rollTemplates.map((tmpl) => ({ ...tmpl, id: generateId() })) as RollTemplate[],
    resources: resources.map((res) => ({ ...res, id: generateId() })) as Resource[],
    headings: headings.map((heading) => ({ ...heading, id: generateId() })) as Heading[],
    textBlocks: textBlocks.map((tb) => ({ ...tb, id: generateId() })) as TextBlock[],
  };

  const unified = buildUnifiedList(importedSheet);
  const needsSort = unified.some((entry) => typeof entry.item.sort !== 'number' || Number.isNaN(entry.item.sort));
  if (needsSort) {
    assignSortFromUnifiedList(unified);
  }
  sortSheetLists(importedSheet);

  return importedSheet;
}

// Generate unique ID
function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

// Create a default sheet with just the Name attribute
function createDefaultSheet(name?: string): CharacterSheet {
  return {
    id: generateId(),
    name: name || 'New Character',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    version: 0,
    attributes: [],
    rollTemplates: [],
    resources: [],
    headings: [],
    textBlocks: [],
  };
}

// MIME types for static file serving
const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

// Create HTTP server for static files
const server = http.createServer((req, res) => {
  let filePath = path.join(__dirname, '../public', req.url === '/' ? 'index.html' : req.url || '');

  const ext = path.extname(filePath);
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404);
        res.end('Not Found');
      } else {
        res.writeHead(500);
        res.end('Server Error');
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    }
  });
});

// Create WebSocket server
const wss = new WebSocketServer({ server });

// Track connected clients
const clients = new Set<WebSocket>();

// Send message to a single client
function send(ws: WebSocket, message: ServerMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

// Broadcast message to all clients
function broadcast(message: ServerMessage, exclude?: WebSocket): void {
  const data = JSON.stringify(message);
  clients.forEach((client) => {
    if (client !== exclude && client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
}

// Handle client messages
function handleMessage(ws: WebSocket, message: ClientMessage): void {
  switch (message.type) {
    case 'getSheets': {
      const sheetList = sheets.map((s) => ({ id: s.id, name: s.name, initials: s.initials }));
      send(ws, { type: 'sheetList', sheets: sheetList });
      break;
    }

    case 'getSheet': {
      const sheet = sheets.find((s) => s.id === message.sheetId);
      if (sheet) {
        send(ws, { type: 'sheet', sheet });
      } else {
        send(ws, { type: 'error', message: 'Sheet not found' });
      }
      break;
    }

    case 'createSheet': {
      const newSheet = createDefaultSheet(message.name);
      sheets.push(newSheet);
      saveSheets();
      // Send sheetCreated to requesting client (they switch to it)
      send(ws, { type: 'sheetCreated', sheet: newSheet });
      // Send sheetAdded to other clients (they just update their list)
      broadcast({ type: 'sheetAdded', sheet: newSheet }, ws);
      break;
    }

    case 'importSheet': {
      const sheetData = message.sheetData;

      // Validate basic structure
      if (!sheetData || typeof sheetData.name !== 'string') {
        send(ws, { type: 'error', message: 'Invalid sheet data: name is required' });
        break;
      }

      // Create new sheet with imported data
      const importedSheet = buildImportedSheet(sheetData);

      sheets.push(importedSheet);
      saveSheets();
      // Send sheetCreated to requesting client (they switch to it)
      send(ws, { type: 'sheetCreated', sheet: importedSheet });
      // Send sheetAdded to other clients (they just update their list)
      broadcast({ type: 'sheetAdded', sheet: importedSheet }, ws);
      break;
    }

    case 'copySheet': {
      const sourceSheet = sheets.find((s) => s.id === message.sheetId);
      if (sourceSheet) {
        if (!ensureSheetVersion(ws, sourceSheet, message, 'Copy sheet')) {
          break;
        }
        const copiedSheet: CharacterSheet = {
          ...JSON.parse(JSON.stringify(sourceSheet)),
          id: generateId(),
          name: sourceSheet.name + ' (Copy)',
          schemaVersion: CURRENT_SCHEMA_VERSION,
          version: 0,
        };
        // Generate new IDs for attributes, templates, and resources
        copiedSheet.attributes = copiedSheet.attributes.map((attr) => ({
          ...attr,
          id: generateId(),
        }));
        copiedSheet.rollTemplates = copiedSheet.rollTemplates.map((tmpl) => ({
          ...tmpl,
          id: generateId(),
        }));
        copiedSheet.resources = (copiedSheet.resources || []).map((res) => ({
          ...res,
          id: generateId(),
        }));
        copiedSheet.headings = (copiedSheet.headings || []).map((heading) => ({
          ...heading,
          id: generateId(),
        }));
        copiedSheet.textBlocks = (copiedSheet.textBlocks || []).map((tb) => ({
          ...tb,
          id: generateId(),
        }));
        sheets.push(copiedSheet);
        saveSheets();
        // Send sheetCreated to requesting client (they switch to it)
        send(ws, { type: 'sheetCreated', sheet: copiedSheet });
        // Send sheetAdded to other clients (they just update their list)
        broadcast({ type: 'sheetAdded', sheet: copiedSheet }, ws);
      } else {
        send(ws, { type: 'error', message: 'Sheet not found' });
      }
      break;
    }

    case 'deleteSheet': {
      const index = sheets.findIndex((s) => s.id === message.sheetId);
      if (index !== -1) {
        if (!ensureSheetVersion(ws, sheets[index], message, 'Delete sheet')) {
          break;
        }
        sheets.splice(index, 1);
        // Ensure at least one sheet exists
        if (sheets.length === 0) {
          sheets.push(createDefaultSheet());
        }
        saveSheets();
        broadcast({ type: 'sheetDeleted', sheetId: message.sheetId });
        // Also send updated sheet list
        const sheetList = sheets.map((s) => ({ id: s.id, name: s.name, initials: s.initials }));
        broadcast({ type: 'sheetList', sheets: sheetList });
      }
      break;
    }

    case 'updateSheet': {
      const sheet = sheets.find((s) => s.id === message.sheetId);
      if (sheet) {
        if (!ensureSheetVersion(ws, sheet, message, 'Update sheet')) {
          break;
        }
        sheet.name = message.name;
        sheet.initials = message.initials || undefined;
        // Also update the 'name' string attribute if it exists
        const nameAttr = sheet.attributes.find(
          (a) => a.type === 'string' && 'code' in a && a.code === 'name'
        );
        if (nameAttr && nameAttr.type === 'string') {
          nameAttr.value = message.name;
        }
        touchSheet(sheet);
        saveSheets();
        broadcast({ type: 'sheetUpdated', sheet });
        // Also update sheet list
        const sheetList = sheets.map((s) => ({ id: s.id, name: s.name, initials: s.initials }));
        broadcast({ type: 'sheetList', sheets: sheetList });
      } else {
        send(ws, { type: 'error', message: 'Sheet not found' });
      }
      break;
    }

    case 'createAttribute': {
      const sheet = sheets.find((s) => s.id === message.sheetId);
      if (sheet) {
        if (!ensureSheetVersion(ws, sheet, message, 'Create attribute')) {
          break;
        }
        // Check for reserved codes
        const attrCode = 'code' in message.attribute ? String(message.attribute.code) : null;
        if (attrCode && isReservedCode(attrCode)) {
          send(ws, { type: 'error', message: `"${attrCode}" is a reserved code and cannot be used` });
          break;
        }
        const newAttribute: Attribute = {
          ...message.attribute,
          id: generateId(),
          sort: 0,
        } as Attribute;
        insertAfterLastKind(sheet, 'attribute', newAttribute);
        touchSheet(sheet);
        saveSheets();
        broadcast({ type: 'sheetUpdated', sheet });
      } else {
        send(ws, { type: 'error', message: 'Sheet not found' });
      }
      break;
    }

    case 'updateAttribute': {
      const sheet = sheets.find((s) => s.id === message.sheetId);
      if (sheet) {
        if (!ensureSheetVersion(ws, sheet, message, 'Update attribute')) {
          break;
        }
        // Check for reserved codes
        const attrCode = 'code' in message.attribute ? String(message.attribute.code) : null;
        if (attrCode && isReservedCode(attrCode)) {
          send(ws, { type: 'error', message: `"${attrCode}" is a reserved code and cannot be used` });
          break;
        }
        const attrIndex = sheet.attributes.findIndex((a) => a.id === message.attribute.id);
        if (attrIndex !== -1) {
          sheet.attributes[attrIndex] = message.attribute;
          sortSheetLists(sheet);
          touchSheet(sheet);
          // Update sheet name if the 'name' attribute was changed
          if (message.attribute.type === 'string' && message.attribute.code === 'name') {
            sheet.name = message.attribute.value;
          }
          saveSheets();
          broadcast({ type: 'sheetUpdated', sheet });
          // Also update sheet list if name changed
          const sheetList = sheets.map((s) => ({ id: s.id, name: s.name, initials: s.initials }));
          broadcast({ type: 'sheetList', sheets: sheetList });
        } else {
          send(ws, { type: 'error', message: 'Attribute not found' });
        }
      } else {
        send(ws, { type: 'error', message: 'Sheet not found' });
      }
      break;
    }

    case 'deleteAttribute': {
      const sheet = sheets.find((s) => s.id === message.sheetId);
      if (sheet) {
        if (!ensureSheetVersion(ws, sheet, message, 'Delete attribute')) {
          break;
        }
        const attrIndex = sheet.attributes.findIndex((a) => a.id === message.attributeId);
        if (attrIndex !== -1) {
          sheet.attributes.splice(attrIndex, 1);
          assignSortFromUnifiedList(buildUnifiedList(sheet));
          sortSheetLists(sheet);
          touchSheet(sheet);
          saveSheets();
          broadcast({ type: 'sheetUpdated', sheet });
        } else {
          send(ws, { type: 'error', message: 'Attribute not found' });
        }
      } else {
        send(ws, { type: 'error', message: 'Sheet not found' });
      }
      break;
    }

    case 'reorderAttributes': {
      const sheet = sheets.find((s) => s.id === message.sheetId);
      if (sheet) {
        if (!ensureSheetVersion(ws, sheet, message, 'Reorder attributes')) {
          break;
        }
        reorderKind(sheet, 'attribute', message.attributeIds);
        touchSheet(sheet);
        saveSheets();
        broadcast({ type: 'sheetUpdated', sheet });
      } else {
        send(ws, { type: 'error', message: 'Sheet not found' });
      }
      break;
    }

    case 'createRollTemplate': {
      const sheet = sheets.find((s) => s.id === message.sheetId);
      if (sheet) {
        if (!ensureSheetVersion(ws, sheet, message, 'Create roll template')) {
          break;
        }
        const newTemplate = {
          ...message.template,
          id: generateId(),
          sort: 0,
        } as RollTemplate;
        insertAfterLastKind(sheet, 'rollTemplate', newTemplate);
        touchSheet(sheet);
        saveSheets();
        broadcast({ type: 'sheetUpdated', sheet });
      } else {
        send(ws, { type: 'error', message: 'Sheet not found' });
      }
      break;
    }

    case 'updateRollTemplate': {
      const sheet = sheets.find((s) => s.id === message.sheetId);
      if (sheet) {
        if (!ensureSheetVersion(ws, sheet, message, 'Update roll template')) {
          break;
        }
        const templateIndex = sheet.rollTemplates.findIndex((t) => t.id === message.template.id);
        if (templateIndex !== -1) {
          sheet.rollTemplates[templateIndex] = message.template;
          sortSheetLists(sheet);
          touchSheet(sheet);
          saveSheets();
          broadcast({ type: 'sheetUpdated', sheet });
        } else {
          send(ws, { type: 'error', message: 'Roll template not found' });
        }
      } else {
        send(ws, { type: 'error', message: 'Sheet not found' });
      }
      break;
    }

    case 'deleteRollTemplate': {
      const sheet = sheets.find((s) => s.id === message.sheetId);
      if (sheet) {
        if (!ensureSheetVersion(ws, sheet, message, 'Delete roll template')) {
          break;
        }
        const templateIndex = sheet.rollTemplates.findIndex((t) => t.id === message.templateId);
        if (templateIndex !== -1) {
          sheet.rollTemplates.splice(templateIndex, 1);
          assignSortFromUnifiedList(buildUnifiedList(sheet));
          sortSheetLists(sheet);
          touchSheet(sheet);
          saveSheets();
          broadcast({ type: 'sheetUpdated', sheet });
        } else {
          send(ws, { type: 'error', message: 'Roll template not found' });
        }
      } else {
        send(ws, { type: 'error', message: 'Sheet not found' });
      }
      break;
    }

    case 'reorderRollTemplates': {
      const sheet = sheets.find((s) => s.id === message.sheetId);
      if (sheet) {
        if (!ensureSheetVersion(ws, sheet, message, 'Reorder roll templates')) {
          break;
        }
        reorderKind(sheet, 'rollTemplate', message.templateIds);
        touchSheet(sheet);
        saveSheets();
        broadcast({ type: 'sheetUpdated', sheet });
      } else {
        send(ws, { type: 'error', message: 'Sheet not found' });
      }
      break;
    }

    case 'createResource': {
      const sheet = sheets.find((s) => s.id === message.sheetId);
      if (sheet) {
        if (!ensureSheetVersion(ws, sheet, message, 'Create resource')) {
          break;
        }
        const newResource = {
          ...message.resource,
          id: generateId(),
          sort: 0,
        } as Resource;
        insertAfterLastKind(sheet, 'resource', newResource);
        touchSheet(sheet);
        saveSheets();
        broadcast({ type: 'sheetUpdated', sheet });
      } else {
        send(ws, { type: 'error', message: 'Sheet not found' });
      }
      break;
    }

    case 'updateResource': {
      const sheet = sheets.find((s) => s.id === message.sheetId);
      if (sheet) {
        if (!ensureSheetVersion(ws, sheet, message, 'Update resource')) {
          break;
        }
        const resIndex = sheet.resources.findIndex((r) => r.id === message.resource.id);
        if (resIndex !== -1) {
          sheet.resources[resIndex] = message.resource;
          sortSheetLists(sheet);
          touchSheet(sheet);
          saveSheets();
          broadcast({ type: 'sheetUpdated', sheet });
        } else {
          send(ws, { type: 'error', message: 'Resource not found' });
        }
      } else {
        send(ws, { type: 'error', message: 'Sheet not found' });
      }
      break;
    }

    case 'deleteResource': {
      const sheet = sheets.find((s) => s.id === message.sheetId);
      if (sheet) {
        if (!ensureSheetVersion(ws, sheet, message, 'Delete resource')) {
          break;
        }
        const resIndex = sheet.resources.findIndex((r) => r.id === message.resourceId);
        if (resIndex !== -1) {
          sheet.resources.splice(resIndex, 1);
          assignSortFromUnifiedList(buildUnifiedList(sheet));
          sortSheetLists(sheet);
          touchSheet(sheet);
          saveSheets();
          broadcast({ type: 'sheetUpdated', sheet });
        } else {
          send(ws, { type: 'error', message: 'Resource not found' });
        }
      } else {
        send(ws, { type: 'error', message: 'Sheet not found' });
      }
      break;
    }

    case 'reorderResources': {
      const sheet = sheets.find((s) => s.id === message.sheetId);
      if (sheet) {
        if (!ensureSheetVersion(ws, sheet, message, 'Reorder resources')) {
          break;
        }
        reorderKind(sheet, 'resource', message.resourceIds);
        touchSheet(sheet);
        saveSheets();
        broadcast({ type: 'sheetUpdated', sheet });
      } else {
        send(ws, { type: 'error', message: 'Sheet not found' });
      }
      break;
    }

    case 'createHeading': {
      const sheet = sheets.find((s) => s.id === message.sheetId);
      if (sheet) {
        if (!ensureSheetVersion(ws, sheet, message, 'Create heading')) {
          break;
        }
        const newHeading: Heading = {
          ...message.heading,
          id: generateId(),
          sort: 0,
        };
        insertAfterLastKind(sheet, 'heading', newHeading);
        touchSheet(sheet);
        saveSheets();
        broadcast({ type: 'sheetUpdated', sheet });
      } else {
        send(ws, { type: 'error', message: 'Sheet not found' });
      }
      break;
    }

    case 'updateHeading': {
      const sheet = sheets.find((s) => s.id === message.sheetId);
      if (sheet) {
        if (!ensureSheetVersion(ws, sheet, message, 'Update heading')) {
          break;
        }
        const headingIndex = sheet.headings.findIndex((h) => h.id === message.heading.id);
        if (headingIndex !== -1) {
          sheet.headings[headingIndex] = message.heading;
          sortSheetLists(sheet);
          touchSheet(sheet);
          saveSheets();
          broadcast({ type: 'sheetUpdated', sheet });
        } else {
          send(ws, { type: 'error', message: 'Heading not found' });
        }
      } else {
        send(ws, { type: 'error', message: 'Sheet not found' });
      }
      break;
    }

    case 'deleteHeading': {
      const sheet = sheets.find((s) => s.id === message.sheetId);
      if (sheet) {
        if (!ensureSheetVersion(ws, sheet, message, 'Delete heading')) {
          break;
        }
        const headingIndex = sheet.headings.findIndex((h) => h.id === message.headingId);
        if (headingIndex !== -1) {
          sheet.headings.splice(headingIndex, 1);
          assignSortFromUnifiedList(buildUnifiedList(sheet));
          sortSheetLists(sheet);
          touchSheet(sheet);
          saveSheets();
          broadcast({ type: 'sheetUpdated', sheet });
        } else {
          send(ws, { type: 'error', message: 'Heading not found' });
        }
      } else {
        send(ws, { type: 'error', message: 'Sheet not found' });
      }
      break;
    }

    case 'reorderHeadings': {
      const sheet = sheets.find((s) => s.id === message.sheetId);
      if (sheet) {
        if (!ensureSheetVersion(ws, sheet, message, 'Reorder headings')) {
          break;
        }
        reorderKind(sheet, 'heading', message.headingIds);
        touchSheet(sheet);
        saveSheets();
        broadcast({ type: 'sheetUpdated', sheet });
      } else {
        send(ws, { type: 'error', message: 'Sheet not found' });
      }
      break;
    }

    case 'createTextBlock': {
      const sheet = sheets.find((s) => s.id === message.sheetId);
      if (sheet) {
        if (!ensureSheetVersion(ws, sheet, message, 'Create text block')) {
          break;
        }
        const newTextBlock: TextBlock = {
          ...message.textBlock,
          id: generateId(),
          sort: 0,
        };
        insertAfterLastKind(sheet, 'textBlock', newTextBlock);
        touchSheet(sheet);
        saveSheets();
        broadcast({ type: 'sheetUpdated', sheet });
      } else {
        send(ws, { type: 'error', message: 'Sheet not found' });
      }
      break;
    }

    case 'updateTextBlock': {
      const sheet = sheets.find((s) => s.id === message.sheetId);
      if (sheet) {
        if (!ensureSheetVersion(ws, sheet, message, 'Update text block')) {
          break;
        }
        if (!sheet.textBlocks) {
          sheet.textBlocks = [];
        }
        const textBlockIndex = sheet.textBlocks.findIndex((tb) => tb.id === message.textBlock.id);
        if (textBlockIndex !== -1) {
          sheet.textBlocks[textBlockIndex] = message.textBlock;
          sortSheetLists(sheet);
          touchSheet(sheet);
          saveSheets();
          broadcast({ type: 'sheetUpdated', sheet });
        } else {
          send(ws, { type: 'error', message: 'Text block not found' });
        }
      } else {
        send(ws, { type: 'error', message: 'Sheet not found' });
      }
      break;
    }

    case 'deleteTextBlock': {
      const sheet = sheets.find((s) => s.id === message.sheetId);
      if (sheet) {
        if (!ensureSheetVersion(ws, sheet, message, 'Delete text block')) {
          break;
        }
        if (!sheet.textBlocks) {
          sheet.textBlocks = [];
        }
        const textBlockIndex = sheet.textBlocks.findIndex((tb) => tb.id === message.textBlockId);
        if (textBlockIndex !== -1) {
          sheet.textBlocks.splice(textBlockIndex, 1);
          assignSortFromUnifiedList(buildUnifiedList(sheet));
          sortSheetLists(sheet);
          touchSheet(sheet);
          saveSheets();
          broadcast({ type: 'sheetUpdated', sheet });
        } else {
          send(ws, { type: 'error', message: 'Text block not found' });
        }
      } else {
        send(ws, { type: 'error', message: 'Sheet not found' });
      }
      break;
    }

    case 'reorderTextBlocks': {
      const sheet = sheets.find((s) => s.id === message.sheetId);
      if (sheet) {
        if (!ensureSheetVersion(ws, sheet, message, 'Reorder text blocks')) {
          break;
        }
        reorderKind(sheet, 'textBlock', message.textBlockIds);
        touchSheet(sheet);
        saveSheets();
        broadcast({ type: 'sheetUpdated', sheet });
      } else {
        send(ws, { type: 'error', message: 'Sheet not found' });
      }
      break;
    }

    case 'reorderUnified': {
      const sheet = sheets.find((s) => s.id === message.sheetId);
      if (sheet) {
        if (!ensureSheetVersion(ws, sheet, message, 'Reorder items')) {
          break;
        }
        reorderUnified(sheet, message.items);
        touchSheet(sheet);
        saveSheets();
        broadcast({ type: 'sheetUpdated', sheet });
      } else {
        send(ws, { type: 'error', message: 'Sheet not found' });
      }
      break;
    }

    case 'getHistory': {
      send(ws, { type: 'history', entries: history });
      break;
    }

    case 'clearHistory': {
      history = [];
      saveHistory();
      broadcast({ type: 'historyCleared' });
      break;
    }

    case 'roll': {
      const sheet = sheets.find((s) => s.id === message.sheetId);
      if (!sheet) {
        send(ws, { type: 'error', message: 'Sheet not found' });
        break;
      }

      const template = sheet.rollTemplates.find((t) => t.id === message.templateId);
      if (!template) {
        send(ws, { type: 'error', message: 'Roll template not found' });
        break;
      }

      if (template.type !== 'roll') {
        send(ws, { type: 'error', message: 'Cannot roll a heading' });
        break;
      }

      const formulaIndex = message.formulaIndex ?? 0;
      if (formulaIndex < 0 || formulaIndex >= (template as RollTemplateRoll).formulas.length) {
        send(ws, { type: 'error', message: 'Invalid formula index' });
        break;
      }

      try {
        const entry = executeRoll(sheet, template as RollTemplateRoll, formulaIndex, generateId);
        history.unshift(entry); // Add to beginning of history
        saveHistory();
        broadcast({ type: 'historyEntry', entry });
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Roll failed';
        send(ws, { type: 'error', message: errorMessage });
      }
      break;
    }

    default:
      send(ws, { type: 'error', message: 'Unknown message type' });
  }
}

wss.on('connection', (ws) => {
  console.log('Client connected');
  clients.add(ws);

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString()) as ClientMessage;
      handleMessage(ws, message);
    } catch (err) {
      console.error('Error parsing message:', err);
      send(ws, { type: 'error', message: 'Invalid message format' });
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected');
    clients.delete(ws);
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
    clients.delete(ws);
  });
});

// Start server
server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log('Press Ctrl+C to stop');
});
