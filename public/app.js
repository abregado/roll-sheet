// Roll Sheet Client

(function() {
  'use strict';

  // State
  let ws = null;
  let sheets = [];
  let currentSheetId = null;
  let currentSheet = null;
  let editingAttributeId = null;
  let draggedAttributeId = null;

  // DOM Elements
  const elements = {
    sheetIcons: document.getElementById('sheet-icons'),
    addSheetBtn: document.getElementById('add-sheet-btn'),
    attributesList: document.getElementById('attributes-list'),
    addStringAttrBtn: document.getElementById('add-string-attr-btn'),
    addIntegerAttrBtn: document.getElementById('add-integer-attr-btn'),
    addDerivedAttrBtn: document.getElementById('add-derived-attr-btn'),
    templatesList: document.getElementById('templates-list'),
    addTemplateBtn: document.getElementById('add-template-btn'),
    copySheetBtn: document.getElementById('copy-sheet-btn'),
    deleteSheetBtn: document.getElementById('delete-sheet-btn'),
    historyList: document.getElementById('history-list'),
    clearHistoryBtn: document.getElementById('clear-history-btn'),
    deleteModal: document.getElementById('delete-modal'),
    deleteCancelBtn: document.getElementById('delete-cancel-btn'),
    deleteConfirmBtn: document.getElementById('delete-confirm-btn'),
  };

  // Templates
  const templates = {
    attributeView: document.getElementById('attribute-view-template'),
    attributeEdit: document.getElementById('attribute-edit-template'),
  };

  // ============================================================
  // WebSocket Connection
  // ============================================================

  function connect() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;

    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('Connected to server');
      send({ type: 'getSheets' });
      send({ type: 'getHistory' });
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        handleServerMessage(message);
      } catch (err) {
        console.error('Error parsing server message:', err);
      }
    };

    ws.onclose = () => {
      console.log('Disconnected from server');
      setTimeout(connect, 2000);
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  }

  function send(message) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  function handleServerMessage(message) {
    switch (message.type) {
      case 'sheetList':
        sheets = message.sheets;
        renderSheetIcons();
        if (!currentSheetId && sheets.length > 0) {
          selectSheet(sheets[0].id);
        }
        break;

      case 'sheet':
        currentSheet = message.sheet;
        currentSheetId = message.sheet.id;
        renderSheet();
        break;

      case 'sheetCreated':
        sheets.push({ id: message.sheet.id, name: message.sheet.name });
        renderSheetIcons();
        selectSheet(message.sheet.id);
        break;

      case 'sheetDeleted':
        sheets = sheets.filter(s => s.id !== message.sheetId);
        if (currentSheetId === message.sheetId) {
          currentSheetId = null;
          currentSheet = null;
          if (sheets.length > 0) {
            selectSheet(sheets[0].id);
          }
        }
        renderSheetIcons();
        break;

      case 'sheetUpdated':
        if (message.sheet.id === currentSheetId) {
          // Preserve editing state if we're editing
          const wasEditing = editingAttributeId;
          currentSheet = message.sheet;
          renderSheet();
          if (wasEditing) {
            // Re-enter edit mode if we were editing
            const attr = currentSheet.attributes.find(a => a.id === wasEditing);
            if (attr) {
              enterEditMode(wasEditing);
            }
          }
        }
        // Update sheet name in list
        const sheetInList = sheets.find(s => s.id === message.sheet.id);
        if (sheetInList) {
          sheetInList.name = message.sheet.name;
          renderSheetIcons();
        }
        break;

      case 'history':
        renderHistory(message.entries);
        break;

      case 'historyEntry':
        addHistoryEntry(message.entry);
        break;

      case 'historyCleared':
        elements.historyList.innerHTML = '<div class="empty-state">No rolls yet</div>';
        break;

      case 'error':
        console.error('Server error:', message.message);
        break;
    }
  }

  // ============================================================
  // Sheet Management
  // ============================================================

  function renderSheetIcons() {
    elements.sheetIcons.innerHTML = '';
    sheets.forEach(sheet => {
      const btn = document.createElement('button');
      btn.className = 'sheet-icon' + (sheet.id === currentSheetId ? ' active' : '');
      btn.dataset.sheetId = sheet.id;
      btn.title = sheet.name;
      btn.textContent = getInitials(sheet.name);
      btn.addEventListener('click', () => selectSheet(sheet.id));
      elements.sheetIcons.appendChild(btn);
    });
  }

  function getInitials(name) {
    const words = name.trim().split(/\s+/);
    if (words.length >= 2) {
      return (words[0][0] + words[1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  }

  function selectSheet(sheetId) {
    currentSheetId = sheetId;
    editingAttributeId = null;
    send({ type: 'getSheet', sheetId });
    renderSheetIcons();
  }

  function createSheet() {
    send({ type: 'createSheet' });
  }

  function copySheet() {
    if (currentSheetId) {
      send({ type: 'copySheet', sheetId: currentSheetId });
    }
  }

  function deleteSheet() {
    elements.deleteModal.hidden = false;
  }

  function confirmDeleteSheet() {
    if (currentSheetId) {
      send({ type: 'deleteSheet', sheetId: currentSheetId });
    }
    elements.deleteModal.hidden = true;
  }

  function cancelDeleteSheet() {
    elements.deleteModal.hidden = true;
  }

  // ============================================================
  // Sheet Rendering
  // ============================================================

  function renderSheet() {
    if (!currentSheet) {
      elements.attributesList.innerHTML = '<div class="empty-state">No sheet selected</div>';
      return;
    }

    renderAttributes();
    renderTemplates();
  }

  // ============================================================
  // Attribute Rendering
  // ============================================================

  function renderAttributes() {
    elements.attributesList.innerHTML = '';

    if (currentSheet.attributes.length === 0) {
      elements.attributesList.innerHTML = '<div class="empty-state">No attributes</div>';
      return;
    }

    // Sort by order
    const sortedAttributes = [...currentSheet.attributes].sort((a, b) => a.order - b.order);

    sortedAttributes.forEach(attr => {
      const el = createAttributeElement(attr);
      elements.attributesList.appendChild(el);
    });
  }

  function createAttributeElement(attr) {
    const isEditing = editingAttributeId === attr.id;
    const template = isEditing ? templates.attributeEdit : templates.attributeView;
    const clone = template.content.cloneNode(true);
    const el = clone.querySelector('.attribute-item');

    el.dataset.attributeId = attr.id;

    if (isEditing) {
      setupEditMode(el, attr);
    } else {
      setupViewMode(el, attr);
    }

    // Setup drag and drop (only in view mode)
    if (!isEditing) {
      setupDragAndDrop(el, attr.id);
    }

    return el;
  }

  function setupViewMode(el, attr) {
    const nameEl = el.querySelector('.attribute-name');
    const codeEl = el.querySelector('.attribute-code');
    const valueEl = el.querySelector('.attribute-value-display');
    const editBtn = el.querySelector('.edit-btn');

    nameEl.textContent = attr.name;
    codeEl.textContent = '@' + attr.code;

    // Display value based on type
    if (attr.type === 'derived') {
      const result = evaluateFormula(attr.formula);
      if (result.error) {
        valueEl.textContent = result.error;
        valueEl.classList.add('error');
        el.classList.add('has-warning');
      } else {
        valueEl.textContent = result.value;
        valueEl.classList.add('derived');
      }
    } else {
      valueEl.textContent = attr.value;
    }

    editBtn.addEventListener('click', () => enterEditMode(attr.id));
  }

  function setupEditMode(el, attr) {
    const nameInput = el.querySelector('.edit-name');
    const codeInput = el.querySelector('.edit-code');
    const valueInput = el.querySelector('.edit-value');
    const typeBadge = el.querySelector('.attribute-type-badge');
    const saveBtn = el.querySelector('.save-btn');
    const cancelBtn = el.querySelector('.cancel-btn');
    const deleteBtn = el.querySelector('.delete-btn');

    nameInput.value = attr.name;
    codeInput.value = attr.code;

    if (attr.type === 'derived') {
      valueInput.value = attr.formula;
      valueInput.placeholder = 'Formula (e.g., @str + @dex)';
    } else {
      valueInput.value = attr.value;
      valueInput.placeholder = attr.type === 'integer' ? 'Number' : 'Text';
      if (attr.type === 'integer') {
        valueInput.type = 'number';
      }
    }

    typeBadge.textContent = attr.type;

    // Code validation on input
    codeInput.addEventListener('input', () => {
      const isValid = validateCode(codeInput.value, attr.id);
      codeInput.classList.toggle('invalid', !isValid);
    });

    // Save on Enter
    const handleKeyDown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        saveAttribute(attr.id, nameInput.value, codeInput.value, valueInput.value, attr.type);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        exitEditMode();
      }
    };

    nameInput.addEventListener('keydown', handleKeyDown);
    codeInput.addEventListener('keydown', handleKeyDown);
    valueInput.addEventListener('keydown', handleKeyDown);

    saveBtn.addEventListener('click', () => {
      saveAttribute(attr.id, nameInput.value, codeInput.value, valueInput.value, attr.type);
    });

    cancelBtn.addEventListener('click', () => exitEditMode());
    deleteBtn.addEventListener('click', () => deleteAttribute(attr.id));

    // Focus the name input
    setTimeout(() => nameInput.focus(), 0);
  }

  // ============================================================
  // Edit Mode
  // ============================================================

  function enterEditMode(attributeId) {
    editingAttributeId = attributeId;
    renderAttributes();
  }

  function exitEditMode() {
    editingAttributeId = null;
    renderAttributes();
  }

  function saveAttribute(id, name, code, value, type) {
    // Validate
    if (!name.trim()) {
      alert('Name is required');
      return;
    }

    if (!validateCode(code, id)) {
      alert('Invalid code. Use lowercase letters and underscores only. Code must be unique.');
      return;
    }

    const attr = currentSheet.attributes.find(a => a.id === id);
    if (!attr) return;

    let updatedAttr;
    if (type === 'derived') {
      updatedAttr = {
        ...attr,
        name: name.trim(),
        code: normalizeCode(code),
        formula: value,
      };
    } else if (type === 'integer') {
      updatedAttr = {
        ...attr,
        name: name.trim(),
        code: normalizeCode(code),
        value: parseInt(value, 10) || 0,
      };
    } else {
      updatedAttr = {
        ...attr,
        name: name.trim(),
        code: normalizeCode(code),
        value: value,
      };
    }

    send({ type: 'updateAttribute', sheetId: currentSheetId, attribute: updatedAttr });
    exitEditMode();
  }

  function deleteAttribute(id) {
    if (confirm('Delete this attribute?')) {
      send({ type: 'deleteAttribute', sheetId: currentSheetId, attributeId: id });
      exitEditMode();
    }
  }

  // ============================================================
  // Add Attribute
  // ============================================================

  function addAttribute(type) {
    const baseName = type === 'string' ? 'Text' : type === 'integer' ? 'Number' : 'Computed';
    const baseCode = type === 'string' ? 'text' : type === 'integer' ? 'num' : 'calc';

    // Generate unique name and code
    let name = baseName;
    let code = baseCode;
    let counter = 1;

    while (currentSheet.attributes.some(a => a.code === code)) {
      counter++;
      code = baseCode + '_' + counter;
      name = baseName + ' ' + counter;
    }

    const attribute = {
      name,
      code,
      type,
    };

    if (type === 'derived') {
      attribute.formula = '0';
    } else if (type === 'integer') {
      attribute.value = 0;
    } else {
      attribute.value = '';
    }

    send({ type: 'createAttribute', sheetId: currentSheetId, attribute });
  }

  // ============================================================
  // Drag and Drop
  // ============================================================

  function setupDragAndDrop(el, attributeId) {
    const handle = el.querySelector('.drag-handle');

    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      startDrag(attributeId, e);
    });

    el.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (draggedAttributeId && draggedAttributeId !== attributeId) {
        el.classList.add('drag-over');
      }
    });

    el.addEventListener('dragleave', () => {
      el.classList.remove('drag-over');
    });

    el.addEventListener('drop', (e) => {
      e.preventDefault();
      el.classList.remove('drag-over');
      if (draggedAttributeId && draggedAttributeId !== attributeId) {
        reorderAttributes(draggedAttributeId, attributeId);
      }
    });
  }

  function startDrag(attributeId, startEvent) {
    draggedAttributeId = attributeId;
    const draggedEl = elements.attributesList.querySelector(`[data-attribute-id="${attributeId}"]`);
    if (!draggedEl) return;

    draggedEl.classList.add('dragging');

    const items = Array.from(elements.attributesList.querySelectorAll('.attribute-item'));
    const draggedIndex = items.indexOf(draggedEl);
    const itemHeight = draggedEl.offsetHeight + 8; // Including gap

    let currentIndex = draggedIndex;
    const startY = startEvent.clientY;

    const onMouseMove = (e) => {
      const deltaY = e.clientY - startY;
      const indexDelta = Math.round(deltaY / itemHeight);
      const newIndex = Math.max(0, Math.min(items.length - 1, draggedIndex + indexDelta));

      if (newIndex !== currentIndex) {
        // Remove drag-over from all
        items.forEach(item => item.classList.remove('drag-over'));

        // Add drag-over to target position
        if (newIndex !== draggedIndex) {
          if (newIndex > currentIndex) {
            items[newIndex]?.classList.add('drag-over');
          } else {
            items[newIndex]?.classList.add('drag-over');
          }
        }
        currentIndex = newIndex;
      }
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);

      draggedEl.classList.remove('dragging');
      items.forEach(item => item.classList.remove('drag-over'));

      if (currentIndex !== draggedIndex) {
        // Build new order
        const orderedIds = items.map(item => item.dataset.attributeId);
        const [removed] = orderedIds.splice(draggedIndex, 1);
        orderedIds.splice(currentIndex, 0, removed);

        send({ type: 'reorderAttributes', sheetId: currentSheetId, attributeIds: orderedIds });
      }

      draggedAttributeId = null;
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }

  function reorderAttributes(draggedId, targetId) {
    const items = Array.from(elements.attributesList.querySelectorAll('.attribute-item'));
    const orderedIds = items.map(item => item.dataset.attributeId);

    const draggedIndex = orderedIds.indexOf(draggedId);
    const targetIndex = orderedIds.indexOf(targetId);

    if (draggedIndex === -1 || targetIndex === -1) return;

    orderedIds.splice(draggedIndex, 1);
    orderedIds.splice(targetIndex, 0, draggedId);

    send({ type: 'reorderAttributes', sheetId: currentSheetId, attributeIds: orderedIds });
  }

  // ============================================================
  // Derived Attribute Formula Evaluation
  // ============================================================

  function evaluateFormula(formula) {
    if (!formula || !currentSheet) {
      return { value: 0 };
    }

    // Replace @codes with values
    let expression = formula;
    const usedAttributes = [];

    // Find all @code references
    const codeRegex = /@([a-z_]+)/g;
    let match;

    while ((match = codeRegex.exec(formula)) !== null) {
      const code = match[1];
      const attr = currentSheet.attributes.find(a => a.code === code);

      if (!attr) {
        return { error: `Unknown: @${code}` };
      }

      if (attr.type === 'derived') {
        return { error: `Cannot reference derived: @${code}` };
      }

      if (attr.type === 'string') {
        return { error: `Cannot use string in formula: @${code}` };
      }

      usedAttributes.push({ code, value: attr.value });
      expression = expression.replace(new RegExp('@' + code, 'g'), attr.value);
    }

    // Replace ceil and floor functions
    expression = expression.replace(/ceil\s*\(/g, 'Math.ceil(');
    expression = expression.replace(/floor\s*\(/g, 'Math.floor(');

    // Validate expression (only allow safe characters)
    if (!/^[\d\s+\-*/().Math,ceil floor]+$/.test(expression)) {
      return { error: 'Invalid formula' };
    }

    try {
      // Evaluate safely
      const result = Function('"use strict"; return (' + expression + ')')();
      if (typeof result !== 'number' || !isFinite(result)) {
        return { error: 'Invalid result' };
      }
      return { value: Math.floor(result), usedAttributes };
    } catch (e) {
      return { error: 'Evaluation error' };
    }
  }

  // ============================================================
  // Validation
  // ============================================================

  function validateCode(code, excludeId = null) {
    const normalized = normalizeCode(code);

    // Must match pattern: lowercase letters and underscores only
    if (!/^[a-z_]+$/.test(normalized)) {
      return false;
    }

    // Must be unique
    const isDuplicate = currentSheet.attributes.some(
      a => a.id !== excludeId && a.code === normalized
    );

    return !isDuplicate;
  }

  function normalizeCode(code) {
    return code.toLowerCase().replace(/[^a-z_]/g, '');
  }

  // ============================================================
  // Templates Rendering (placeholder)
  // ============================================================

  function renderTemplates() {
    if (!currentSheet.rollTemplates || currentSheet.rollTemplates.length === 0) {
      elements.templatesList.innerHTML = '<div class="empty-state">No roll templates</div>';
      return;
    }

    // TODO: Implement roll templates rendering
    elements.templatesList.innerHTML = '<div class="empty-state">Roll templates coming soon</div>';
  }

  // ============================================================
  // History
  // ============================================================

  function renderHistory(entries) {
    if (!entries || entries.length === 0) {
      elements.historyList.innerHTML = '<div class="empty-state">No rolls yet</div>';
      return;
    }

    elements.historyList.innerHTML = '';
    // Show most recent first
    entries.slice().reverse().forEach(entry => {
      const el = createHistoryElement(entry);
      elements.historyList.appendChild(el);
    });
  }

  function addHistoryEntry(entry) {
    // Remove empty state if present
    const emptyState = elements.historyList.querySelector('.empty-state');
    if (emptyState) {
      emptyState.remove();
    }

    const el = createHistoryElement(entry);
    elements.historyList.insertBefore(el, elements.historyList.firstChild);
  }

  function createHistoryElement(entry) {
    const el = document.createElement('div');
    el.className = 'history-item';

    el.innerHTML = `
      <div class="history-display">${escapeHtml(entry.displayText)}</div>
      <div class="history-details">
        <div class="roll-breakdown">${formatRollBreakdown(entry.details)}</div>
        ${entry.details.attributesUsed.length > 0 ? `
          <div class="attributes-used">
            ${entry.details.attributesUsed.map(a => `${a.code}: ${a.value}`).join(', ')}
          </div>
        ` : ''}
      </div>
    `;

    return el;
  }

  function formatRollBreakdown(details) {
    if (!details || !details.diceResults) return '';

    return details.diceResults.map(dice => {
      const rolls = dice.rolls.map((r, i) => {
        const kept = dice.kept[i];
        return kept
          ? `<span class="die-result">${r}</span>`
          : `<span class="die-dropped">${r}</span>`;
      }).join(', ');

      return `${dice.notation}: [${rolls}] = ${dice.sum}`;
    }).join(' ') + ` = ${details.total}`;
  }

  function clearHistory() {
    if (confirm('Clear all roll history?')) {
      send({ type: 'clearHistory' });
    }
  }

  // ============================================================
  // Utilities
  // ============================================================

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ============================================================
  // Event Listeners
  // ============================================================

  function setupEventListeners() {
    elements.addSheetBtn.addEventListener('click', createSheet);
    elements.copySheetBtn.addEventListener('click', copySheet);
    elements.deleteSheetBtn.addEventListener('click', deleteSheet);
    elements.deleteCancelBtn.addEventListener('click', cancelDeleteSheet);
    elements.deleteConfirmBtn.addEventListener('click', confirmDeleteSheet);
    elements.clearHistoryBtn.addEventListener('click', clearHistory);

    elements.addStringAttrBtn.addEventListener('click', () => addAttribute('string'));
    elements.addIntegerAttrBtn.addEventListener('click', () => addAttribute('integer'));
    elements.addDerivedAttrBtn.addEventListener('click', () => addAttribute('derived'));

    // Close modal on overlay click
    elements.deleteModal.addEventListener('click', (e) => {
      if (e.target === elements.deleteModal) {
        cancelDeleteSheet();
      }
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !elements.deleteModal.hidden) {
        cancelDeleteSheet();
      }
    });
  }

  // ============================================================
  // Initialize
  // ============================================================

  function init() {
    console.log('Roll Sheet initialized');
    setupEventListeners();
    connect();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
