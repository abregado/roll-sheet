import http from 'http';
import fs from 'fs';
import path from 'path';
import { WebSocketServer, WebSocket } from 'ws';
import {
  CharacterSheet,
  Attribute,
  RollTemplate,
  RollTemplateRoll,
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

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// In-memory data store
let sheets: CharacterSheet[] = loadSheets();
let history: HistoryEntry[] = loadHistory();

// Load sheets from file
function loadSheets(): CharacterSheet[] {
  try {
    if (fs.existsSync(SHEETS_FILE)) {
      const data = fs.readFileSync(SHEETS_FILE, 'utf-8');
      return JSON.parse(data);
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

// Generate unique ID
function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

// Create a default sheet with just the Name attribute
function createDefaultSheet(name?: string): CharacterSheet {
  return {
    id: generateId(),
    name: name || 'New Character',
    attributes: [],
    rollTemplates: [],
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
      broadcast({ type: 'sheetCreated', sheet: newSheet });
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
      const importedSheet: CharacterSheet = {
        id: generateId(),
        name: sheetData.name,
        initials: sheetData.initials,
        attributes: (sheetData.attributes || []).map((attr, index) => ({
          ...attr,
          id: generateId(),
          order: index,
        } as Attribute)),
        rollTemplates: (sheetData.rollTemplates || []).map((tmpl, index) => ({
          ...tmpl,
          id: generateId(),
          order: index,
        } as RollTemplate)),
      };

      sheets.push(importedSheet);
      saveSheets();
      broadcast({ type: 'sheetCreated', sheet: importedSheet });
      break;
    }

    case 'copySheet': {
      const sourceSheet = sheets.find((s) => s.id === message.sheetId);
      if (sourceSheet) {
        const copiedSheet: CharacterSheet = {
          ...JSON.parse(JSON.stringify(sourceSheet)),
          id: generateId(),
          name: sourceSheet.name + ' (Copy)',
        };
        // Generate new IDs for attributes and templates
        copiedSheet.attributes = copiedSheet.attributes.map((attr) => ({
          ...attr,
          id: generateId(),
        }));
        copiedSheet.rollTemplates = copiedSheet.rollTemplates.map((tmpl) => ({
          ...tmpl,
          id: generateId(),
        }));
        sheets.push(copiedSheet);
        saveSheets();
        broadcast({ type: 'sheetCreated', sheet: copiedSheet });
      } else {
        send(ws, { type: 'error', message: 'Sheet not found' });
      }
      break;
    }

    case 'deleteSheet': {
      const index = sheets.findIndex((s) => s.id === message.sheetId);
      if (index !== -1) {
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
        sheet.name = message.name;
        sheet.initials = message.initials || undefined;
        // Also update the 'name' string attribute if it exists
        const nameAttr = sheet.attributes.find(
          (a) => a.type === 'string' && 'code' in a && a.code === 'name'
        );
        if (nameAttr && nameAttr.type === 'string') {
          nameAttr.value = message.name;
        }
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
        // Check for reserved codes
        const attrCode = 'code' in message.attribute ? String(message.attribute.code) : null;
        if (attrCode && isReservedCode(attrCode)) {
          send(ws, { type: 'error', message: `"${attrCode}" is a reserved code and cannot be used` });
          break;
        }
        const maxOrder = sheet.attributes.reduce((max, attr) => Math.max(max, attr.order), -1);
        const newAttribute: Attribute = {
          ...message.attribute,
          id: generateId(),
          order: maxOrder + 1,
        } as Attribute;
        sheet.attributes.push(newAttribute);
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
        // Check for reserved codes
        const attrCode = 'code' in message.attribute ? String(message.attribute.code) : null;
        if (attrCode && isReservedCode(attrCode)) {
          send(ws, { type: 'error', message: `"${attrCode}" is a reserved code and cannot be used` });
          break;
        }
        const attrIndex = sheet.attributes.findIndex((a) => a.id === message.attribute.id);
        if (attrIndex !== -1) {
          sheet.attributes[attrIndex] = message.attribute;
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
        const attrIndex = sheet.attributes.findIndex((a) => a.id === message.attributeId);
        if (attrIndex !== -1) {
          sheet.attributes.splice(attrIndex, 1);
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
        // Update order based on the provided array of IDs
        message.attributeIds.forEach((id, index) => {
          const attr = sheet.attributes.find((a) => a.id === id);
          if (attr) {
            attr.order = index;
          }
        });
        // Sort by order
        sheet.attributes.sort((a, b) => a.order - b.order);
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
        const maxOrder = sheet.rollTemplates.reduce((max, t) => Math.max(max, t.order), -1);
        const newTemplate = {
          ...message.template,
          id: generateId(),
          order: maxOrder + 1,
        } as RollTemplate;
        sheet.rollTemplates.push(newTemplate);
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
        const templateIndex = sheet.rollTemplates.findIndex((t) => t.id === message.template.id);
        if (templateIndex !== -1) {
          sheet.rollTemplates[templateIndex] = message.template;
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
        const templateIndex = sheet.rollTemplates.findIndex((t) => t.id === message.templateId);
        if (templateIndex !== -1) {
          sheet.rollTemplates.splice(templateIndex, 1);
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
        message.templateIds.forEach((id, index) => {
          const template = sheet.rollTemplates.find((t) => t.id === id);
          if (template) {
            template.order = index;
          }
        });
        sheet.rollTemplates.sort((a, b) => a.order - b.order);
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
