// Roll Sheet Client

(function() {
  'use strict';

  // State
  let ws = null;
  let sheets = [];
  let currentSheetId = null;
  let currentSheet = null;
  let editingAttributeId = null;
  let editingHeadingId = null;
  let editingTemplateId = null;
  let editingResourceId = null;
  let dragState = null;
  let collapsedHeadings = new Set(); // Track collapsed headings locally
  let activeItem = null;
  let pendingInsert = null;
  let readOnlySheets = new Set(); // Track which sheets are in read-only mode (client-side only)
  let isRenaming = false;

  // DOM Elements
  const elements = {
    sheetIcons: document.getElementById('sheet-icons'),
    addSheetBtn: document.getElementById('add-sheet-btn'),
    characterSheet: document.querySelector('.character-sheet'),
    sheetTitleRow: document.querySelector('.sheet-title-row'),
    sheetName: document.getElementById('sheet-name'),
    renameBtn: document.getElementById('rename-btn'),
    renameForm: document.getElementById('sheet-rename-form'),
    renameNameInput: document.getElementById('rename-name-input'),
    renameInitialsInput: document.getElementById('rename-initials-input'),
    renameSaveBtn: document.getElementById('rename-save-btn'),
    renameCancelBtn: document.getElementById('rename-cancel-btn'),
    readOnlyToggle: document.getElementById('read-only-toggle'),
    attributesList: document.getElementById('attributes-list'),
    addHeadingBtn: document.getElementById('add-heading-btn'),
    addStringAttrBtn: document.getElementById('add-string-attr-btn'),
    addIntegerAttrBtn: document.getElementById('add-integer-attr-btn'),
    addDerivedAttrBtn: document.getElementById('add-derived-attr-btn'),
    templatesList: document.getElementById('templates-list'),
    addTemplateBtn: document.getElementById('add-template-btn'),
    addTemplateHeadingBtn: document.getElementById('add-template-heading-btn'),
    resourcesList: document.getElementById('resources-list'),
    addResourceBtn: document.getElementById('add-resource-btn'),
    addResourceHeadingBtn: document.getElementById('add-resource-heading-btn'),
    exportSheetBtn: document.getElementById('export-sheet-btn'),
    copySheetBtn: document.getElementById('copy-sheet-btn'),
    deleteSheetBtn: document.getElementById('delete-sheet-btn'),
    historyList: document.getElementById('history-list'),
    clearHistoryBtn: document.getElementById('clear-history-btn'),
    deleteModal: document.getElementById('delete-modal'),
    deleteCancelBtn: document.getElementById('delete-cancel-btn'),
    deleteConfirmBtn: document.getElementById('delete-confirm-btn'),
    resizer: document.getElementById('resizer'),
    appContainer: document.querySelector('.app-container'),
  };

  // Templates
  const templates = {
    attributeView: document.getElementById('attribute-view-template'),
    attributeEdit: document.getElementById('attribute-edit-template'),
    headingView: document.getElementById('heading-view-template'),
    headingEdit: document.getElementById('heading-edit-template'),
    templateView: document.getElementById('template-view-template'),
    templateEdit: document.getElementById('template-edit-template'),
    templateHeadingView: document.getElementById('template-heading-view-template'),
    templateHeadingEdit: document.getElementById('template-heading-edit-template'),
    formulaRow: document.getElementById('formula-row-template'),
    resourceView: document.getElementById('resource-view-template'),
    resourceEdit: document.getElementById('resource-edit-template'),
    resourceHeadingView: document.getElementById('resource-heading-view-template'),
    resourceHeadingEdit: document.getElementById('resource-heading-edit-template'),
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

  function sendSheetAction(message) {
    if (!currentSheet || typeof currentSheet.version !== 'number') {
      console.warn('Sheet version not available; action ignored:', message.type);
      return;
    }
    send({ ...message, sheetVersion: currentSheet.version });
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
        handlePendingInsert();
        renderSheet();
        break;

      case 'sheetCreated':
        sheets.push({ id: message.sheet.id, name: message.sheet.name });
        renderSheetIcons();
        // New sheets should be unlocked for editing
        readOnlySheets.delete(message.sheet.id);
        selectSheet(message.sheet.id);
        // Ensure it stays unlocked after selectSheet
        readOnlySheets.delete(message.sheet.id);
        applyReadOnlyMode();
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
          const wasEditingAttr = editingAttributeId;
          const wasEditingHeading = editingHeadingId;
          const wasEditingTemplate = editingTemplateId;
          const wasEditingResource = editingResourceId;
          currentSheet = message.sheet;
          handlePendingInsert();
          renderSheet();
          if (wasEditingAttr) {
            const attr = currentSheet.attributes.find(a => a.id === wasEditingAttr);
            if (attr) {
              enterEditMode(wasEditingAttr);
            }
          }
          if (wasEditingHeading) {
            const heading = (currentSheet.headings || []).find(h => h.id === wasEditingHeading);
            if (heading) {
              enterHeadingEditMode(wasEditingHeading);
            }
          }
          if (wasEditingTemplate) {
            const tmpl = currentSheet.rollTemplates.find(t => t.id === wasEditingTemplate);
            if (tmpl) {
              enterTemplateEditMode(wasEditingTemplate);
            }
          }
          if (wasEditingResource) {
            const res = (currentSheet.resources || []).find(r => r.id === wasEditingResource);
            if (res) {
              enterResourceEditMode(wasEditingResource);
            }
          }
        }
        const sheetInList = sheets.find(s => s.id === message.sheet.id);
        if (sheetInList) {
          sheetInList.name = message.sheet.name;
          sheetInList.initials = message.sheet.initials;
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

      case 'reject':
        if (message.sheetId === currentSheetId) {
          alert(message.reason);
          send({ type: 'getSheet', sheetId: currentSheetId });
        }
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
      // Use custom initials if set, otherwise compute from name
      btn.textContent = sheet.initials || getInitials(sheet.name);
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
    editingHeadingId = null;
    editingTemplateId = null;
    editingResourceId = null;
    activeItem = null;
    pendingInsert = null;
    isRenaming = false;
    // Default to read-only when selecting a sheet
    if (!readOnlySheets.has(sheetId)) {
      readOnlySheets.add(sheetId);
    }
    send({ type: 'getSheet', sheetId });
    renderSheetIcons();
    applyReadOnlyMode();
  }

  function applyReadOnlyMode() {
    const isReadOnly = currentSheetId && readOnlySheets.has(currentSheetId);
    elements.characterSheet.classList.toggle('read-only', isReadOnly);
    // Lock icons are toggled via CSS based on .read-only class
    // Update resizer appearance
    updateResizerReadOnly();
  }

  function toggleReadOnly() {
    if (!currentSheetId) return;

    if (readOnlySheets.has(currentSheetId)) {
      readOnlySheets.delete(currentSheetId);
    } else {
      readOnlySheets.add(currentSheetId);
      // Exit any edit mode when going read-only
      if (editingAttributeId) exitEditMode();
      if (editingHeadingId) exitHeadingEditMode();
      if (editingTemplateId) exitTemplateEditMode();
      if (editingResourceId) exitResourceEditMode();
      if (isRenaming) cancelRename();
    }
    applyReadOnlyMode();
  }

  // ============================================================
  // Resizer (between sheet and history)
  // ============================================================

  const RESIZER_STORAGE_KEY = 'rollsheet-resizer-ratios';
  const MIN_SECTION_SIZE = 100; // pixels

  function getOrientation() {
    return window.innerWidth > window.innerHeight ? 'landscape' : 'portrait';
  }

  function loadResizerRatios() {
    try {
      const stored = localStorage.getItem(RESIZER_STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {
      console.error('Error loading resizer ratios:', e);
    }
    return { landscape: 0.5, portrait: 0.5 };
  }

  function saveResizerRatios(ratios) {
    try {
      localStorage.setItem(RESIZER_STORAGE_KEY, JSON.stringify(ratios));
    } catch (e) {
      console.error('Error saving resizer ratios:', e);
    }
  }

  function applyResizerRatio() {
    const ratios = loadResizerRatios();
    const orientation = getOrientation();
    const ratio = ratios[orientation] || 0.5;

    // Apply flex-basis to sheet and history based on ratio
    // ratio is the proportion allocated to the sheet (0-1)
    const sheetPercent = ratio * 100;
    const historyPercent = (1 - ratio) * 100;

    elements.characterSheet.style.flex = `1 1 ${sheetPercent}%`;
    document.querySelector('.history-panel').style.flex = `1 1 ${historyPercent}%`;
  }

  function updateResizerReadOnly() {
    const isReadOnly = currentSheetId && readOnlySheets.has(currentSheetId);
    elements.resizer.classList.toggle('read-only', isReadOnly);
  }

  function setupResizer() {
    let isDragging = false;
    let startPos = 0;
    let startSheetSize = 0;
    let startHistorySize = 0;

    const onMouseDown = (e) => {
      // Only allow dragging in edit mode
      const isReadOnly = currentSheetId && readOnlySheets.has(currentSheetId);
      if (isReadOnly) return;

      e.preventDefault();
      isDragging = true;
      elements.resizer.classList.add('dragging');
      document.body.style.cursor = getOrientation() === 'landscape' ? 'col-resize' : 'row-resize';
      document.body.style.userSelect = 'none';

      const orientation = getOrientation();
      if (orientation === 'landscape') {
        startPos = e.clientX;
        startSheetSize = elements.characterSheet.offsetWidth;
        startHistorySize = document.querySelector('.history-panel').offsetWidth;
      } else {
        startPos = e.clientY;
        startSheetSize = elements.characterSheet.offsetHeight;
        startHistorySize = document.querySelector('.history-panel').offsetHeight;
      }

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    };

    const onMouseMove = (e) => {
      if (!isDragging) return;

      const orientation = getOrientation();
      const historyPanel = document.querySelector('.history-panel');
      let delta, newSheetSize, newHistorySize, totalSize;

      if (orientation === 'landscape') {
        delta = e.clientX - startPos;
        newSheetSize = startSheetSize + delta;
        newHistorySize = startHistorySize - delta;
        totalSize = startSheetSize + startHistorySize;
      } else {
        delta = e.clientY - startPos;
        newSheetSize = startSheetSize + delta;
        newHistorySize = startHistorySize - delta;
        totalSize = startSheetSize + startHistorySize;
      }

      // Enforce minimum sizes
      if (newSheetSize < MIN_SECTION_SIZE) {
        newSheetSize = MIN_SECTION_SIZE;
        newHistorySize = totalSize - MIN_SECTION_SIZE;
      }
      if (newHistorySize < MIN_SECTION_SIZE) {
        newHistorySize = MIN_SECTION_SIZE;
        newSheetSize = totalSize - MIN_SECTION_SIZE;
      }

      // Calculate ratio and apply
      const ratio = newSheetSize / totalSize;
      elements.characterSheet.style.flex = `1 1 ${ratio * 100}%`;
      historyPanel.style.flex = `1 1 ${(1 - ratio) * 100}%`;
    };

    const onMouseUp = () => {
      if (!isDragging) return;

      isDragging = false;
      elements.resizer.classList.remove('dragging');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';

      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);

      // Save the current ratio
      const orientation = getOrientation();
      const historyPanel = document.querySelector('.history-panel');
      let totalSize, sheetSize;

      if (orientation === 'landscape') {
        sheetSize = elements.characterSheet.offsetWidth;
        totalSize = sheetSize + historyPanel.offsetWidth;
      } else {
        sheetSize = elements.characterSheet.offsetHeight;
        totalSize = sheetSize + historyPanel.offsetHeight;
      }

      const ratio = sheetSize / totalSize;
      const ratios = loadResizerRatios();
      ratios[orientation] = ratio;
      saveResizerRatios(ratios);
    };

    // Touch support
    const onTouchStart = (e) => {
      const touch = e.touches[0];
      onMouseDown({ clientX: touch.clientX, clientY: touch.clientY, preventDefault: () => e.preventDefault() });
    };

    const onTouchMove = (e) => {
      if (!isDragging) return;
      const touch = e.touches[0];
      onMouseMove({ clientX: touch.clientX, clientY: touch.clientY });
    };

    const onTouchEnd = () => {
      onMouseUp();
    };

    elements.resizer.addEventListener('mousedown', onMouseDown);
    elements.resizer.addEventListener('touchstart', onTouchStart, { passive: false });
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', onTouchEnd);

    // Re-apply ratio on orientation change
    window.addEventListener('resize', () => {
      applyResizerRatio();
    });

    // Initial application
    applyResizerRatio();
    updateResizerReadOnly();
  }

  // ============================================================
  // Sheet Rename
  // ============================================================

  function startRename() {
    if (!currentSheet || readOnlySheets.has(currentSheetId)) return;

    isRenaming = true;
    elements.renameNameInput.value = currentSheet.name;
    // Find sheet in list to get initials
    const sheetInfo = sheets.find(s => s.id === currentSheetId);
    elements.renameInitialsInput.value = sheetInfo?.initials || '';

    elements.sheetTitleRow.hidden = true;
    elements.renameForm.hidden = false;
    elements.renameNameInput.focus();
    elements.renameNameInput.select();
  }

  function saveRename() {
    const name = elements.renameNameInput.value.trim();
    if (!name) {
      alert('Name is required');
      return;
    }

    // Limit initials to 2 characters
    let initials = elements.renameInitialsInput.value.trim().toUpperCase();
    if (initials.length > 2) {
      initials = initials.substring(0, 2);
    }

    sendSheetAction({
      type: 'updateSheet',
      sheetId: currentSheetId,
      name: name,
      initials: initials || undefined
    });

    cancelRename();
  }

  function cancelRename() {
    isRenaming = false;
    elements.sheetTitleRow.hidden = false;
    elements.renameForm.hidden = true;
  }

  function createSheet() {
    send({ type: 'createSheet' });
  }

  function copySheet() {
    if (currentSheetId) {
      sendSheetAction({ type: 'copySheet', sheetId: currentSheetId });
    }
  }

  function exportSheet() {
    if (!currentSheet) return;

    // Create export data (without internal IDs and order - those will be regenerated on import)
    const exportData = {
      name: currentSheet.name,
      initials: currentSheet.initials,
      attributes: currentSheet.attributes.map(attr => {
        // Remove id, keeping sort and the rest
        const { id, ...rest } = attr;
        return rest;
      }),
      rollTemplates: currentSheet.rollTemplates.map(tmpl => {
        const { id, ...rest } = tmpl;
        return rest;
      }),
      resources: (currentSheet.resources || []).map(res => {
        const { id, ...rest } = res;
        return rest;
      }),
      headings: (currentSheet.headings || []).map(heading => {
        const { id, ...rest } = heading;
        return rest;
      }),
    };

    // Create and download the JSON file
    const json = JSON.stringify(exportData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentSheet.name.replace(/[^a-z0-9]/gi, '_')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function importSheet(file) {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const sheetData = JSON.parse(e.target.result);

        // Basic validation
        if (!sheetData.name || typeof sheetData.name !== 'string') {
          alert('Invalid sheet file: missing or invalid name');
          return;
        }

        // Ensure arrays exist
        if (!Array.isArray(sheetData.attributes)) {
          sheetData.attributes = [];
        }
        if (!Array.isArray(sheetData.rollTemplates)) {
          sheetData.rollTemplates = [];
        }
        if (!Array.isArray(sheetData.resources)) {
          sheetData.resources = [];
        }
        if (!Array.isArray(sheetData.headings)) {
          sheetData.headings = [];
        }

        send({ type: 'importSheet', sheetData });
      } catch (err) {
        alert('Failed to parse sheet file. Please ensure it is a valid JSON file.');
        console.error('Import error:', err);
      }
    };

    reader.onerror = () => {
      alert('Failed to read file.');
    };

    reader.readAsText(file);
  }

  function deleteSheet() {
    elements.deleteModal.hidden = false;
  }

  function confirmDeleteSheet() {
    if (currentSheetId) {
      sendSheetAction({ type: 'deleteSheet', sheetId: currentSheetId });
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
      elements.templatesList.innerHTML = '';
      elements.resourcesList.innerHTML = '';
      elements.sheetName.textContent = 'Character Sheet';
      return;
    }

    // Update sheet name display
    elements.sheetName.textContent = currentSheet.name;

    renderUnifiedList();
    elements.templatesList.innerHTML = '';
    elements.resourcesList.innerHTML = '';
  }

  // ============================================================
  // Unified Rendering
  // ============================================================

  function getUnifiedList() {
    if (!currentSheet || !window.renderList) {
      return [];
    }
    return window.renderList.buildUnifiedList(currentSheet);
  }

  function renderUnifiedList() {
    elements.attributesList.innerHTML = '';

    const unified = getUnifiedList();
    if (unified.length === 0) {
      elements.attributesList.innerHTML = '<div class="empty-state">No items</div>';
      return;
    }

    let currentHeadingId = null;

    unified.forEach(entry => {
      let el = null;

      if (entry.kind === 'heading') {
        currentHeadingId = entry.item.id;
        el = createHeadingElement(entry.item);
      } else if (entry.kind === 'attribute') {
        el = createAttributeElement(entry.item, currentHeadingId);
      } else if (entry.kind === 'rollTemplate') {
        el = createTemplateElement(entry.item, currentHeadingId);
      } else if (entry.kind === 'resource') {
        el = createResourceElement(entry.item, currentHeadingId);
      }

      if (el) {
        elements.attributesList.appendChild(el);
      }
    });
  }

  function setActiveItem(kind, id) {
    activeItem = { kind, id };
  }

  function getKindItems(kind) {
    if (!currentSheet) return [];
    if (kind === 'attribute') return currentSheet.attributes || [];
    if (kind === 'rollTemplate') return currentSheet.rollTemplates || [];
    if (kind === 'resource') return currentSheet.resources || [];
    if (kind === 'heading') return currentSheet.headings || [];
    return [];
  }

  function getKindIds(kind) {
    return getKindItems(kind).map(item => item.id);
  }

  function getUnifiedIdsByKind(kind) {
    return getUnifiedList()
      .filter(entry => entry.kind === kind)
      .map(entry => entry.item.id);
  }

  function queueInsert(kind, targetId) {
    if (!targetId) return;
    pendingInsert = {
      kind,
      targetId,
      existingIds: new Set(getKindIds(kind)),
    };
  }

  function handlePendingInsert() {
    if (!pendingInsert || !currentSheet) return;

    const { kind, targetId, existingIds } = pendingInsert;
    const allIds = getKindIds(kind);
    const newIds = allIds.filter(id => !existingIds.has(id));

    if (newIds.length !== 1) {
      pendingInsert = null;
      return;
    }

    const newId = newIds[0];
    if (!allIds.includes(targetId)) {
      pendingInsert = null;
      return;
    }

    const orderedIds = getUnifiedIdsByKind(kind).filter(id => id !== newId);
    const targetIndex = orderedIds.indexOf(targetId);

    if (targetIndex === -1) {
      pendingInsert = null;
      return;
    }

    orderedIds.splice(targetIndex + 1, 0, newId);
    sendReorderForKind(kind, orderedIds);
    pendingInsert = null;
  }

  function sendReorderForKind(kind, orderedIds) {
    if (kind === 'attribute') {
      sendSheetAction({ type: 'reorderAttributes', sheetId: currentSheetId, attributeIds: orderedIds });
    } else if (kind === 'rollTemplate') {
      sendSheetAction({ type: 'reorderRollTemplates', sheetId: currentSheetId, templateIds: orderedIds });
    } else if (kind === 'resource') {
      sendSheetAction({ type: 'reorderResources', sheetId: currentSheetId, resourceIds: orderedIds });
    } else if (kind === 'heading') {
      sendSheetAction({ type: 'reorderHeadings', sheetId: currentSheetId, headingIds: orderedIds });
    }
  }

  function createAttributeElement(attr, headingId) {
    const isEditing = editingAttributeId === attr.id;
    const template = isEditing ? templates.attributeEdit : templates.attributeView;
    const clone = template.content.cloneNode(true);
    const el = clone.querySelector('.attribute-item');

    el.dataset.attributeId = attr.id;
    el.dataset.kind = 'attribute';
    el.dataset.itemId = attr.id;
    el.classList.add('sheet-item');

    // Add indentation if under a heading
    if (headingId) {
      el.classList.add('indented');
      el.dataset.headingId = headingId;
      if (collapsedHeadings.has(headingId)) {
        el.classList.add('collapsed');
      }
    }

    if (isEditing) {
      setupEditMode(el, attr);
    } else {
      setupViewMode(el, attr);
    }

    // Setup drag and drop (only in view mode)
    if (!isEditing) {
      setupUnifiedDragAndDrop(el, 'attribute', attr.id);
    }

    return el;
  }

  function createHeadingElement(heading) {
    const isEditing = editingHeadingId === heading.id;
    const template = isEditing ? templates.headingEdit : templates.headingView;
    const clone = template.content.cloneNode(true);
    const el = clone.querySelector('.attribute-item');

    el.dataset.headingId = heading.id;
    el.dataset.attributeId = heading.id;
    el.dataset.kind = 'heading';
    el.dataset.itemId = heading.id;
    el.classList.add('sheet-item');

    if (collapsedHeadings.has(heading.id)) {
      el.classList.add('collapsed');
    }

    if (isEditing) {
      setupHeadingEditMode(el, heading);
    } else {
      setupHeadingViewMode(el, heading);
    }

    if (!isEditing) {
      setupUnifiedDragAndDrop(el, 'heading', heading.id);
    }

    return el;
  }

  function setupViewMode(el, attr) {
    const nameEl = el.querySelector('.attribute-name');
    const codeEl = el.querySelector('.attribute-code');
    const valueEl = el.querySelector('.attribute-value-display');
    const warningEl = el.querySelector('.attribute-warning');
    const editBtn = el.querySelector('.edit-btn');

    nameEl.textContent = attr.name;
    codeEl.textContent = '@' + attr.code;

    // Display value based on type
    if (attr.type === 'derived') {
      const result = evaluateFormula(attr.formula);
      if (result.error) {
        valueEl.textContent = '—';
        valueEl.classList.add('derived');
        warningEl.hidden = false;
        warningEl.title = result.error;
        el.classList.add('has-warning');
      } else {
        valueEl.textContent = result.value;
        valueEl.classList.add('derived');
        warningEl.hidden = true;
      }
    } else {
      valueEl.textContent = attr.value;
      warningEl.hidden = true;
    }

    editBtn.addEventListener('click', () => enterEditMode(attr.id));
  }

  function setupHeadingViewMode(el, heading) {
    const nameEl = el.querySelector('.heading-name');
    const editBtn = el.querySelector('.edit-btn');
    const collapseBtn = el.querySelector('.collapse-btn');

    nameEl.textContent = heading.name;

    editBtn.addEventListener('click', () => enterHeadingEditMode(heading.id));
    collapseBtn.addEventListener('click', () => toggleHeadingCollapse(heading.id));
  }

  function setupEditMode(el, attr) {
    const nameInput = el.querySelector('.edit-name');
    const codeInput = el.querySelector('.edit-code');
    const valueInput = el.querySelector('.edit-value');
    const typeBadge = el.querySelector('.attribute-type-badge');
    const errorEl = el.querySelector('.attribute-validation-error');
    const saveBtn = el.querySelector('.save-btn');
    const cancelBtn = el.querySelector('.cancel-btn');
    const deleteBtn = el.querySelector('.delete-btn');

    nameInput.value = attr.name;
    codeInput.value = attr.code;

    if (attr.type === 'derived') {
      valueInput.value = attr.formula;
      valueInput.placeholder = 'Formula (e.g., @str + @dex)';

      // Live validation for derived formulas
      const validateDerivedFormula = () => {
        const result = evaluateFormula(valueInput.value);
        if (result.error) {
          valueInput.classList.add('invalid');
          errorEl.textContent = result.error;
          errorEl.hidden = false;
        } else {
          valueInput.classList.remove('invalid');
          errorEl.hidden = true;
        }
      };

      // Initial validation
      validateDerivedFormula();

      // Validate on input
      valueInput.addEventListener('input', validateDerivedFormula);
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
      const validation = validateCode(codeInput.value, attr.id);
      codeInput.classList.toggle('invalid', !validation.valid);
      if (!validation.valid && validation.error) {
        codeInput.title = validation.error;
      } else {
        codeInput.title = '';
      }
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

  function setupHeadingEditMode(el, heading) {
    const nameInput = el.querySelector('.edit-heading-name');
    const saveBtn = el.querySelector('.save-btn');
    const cancelBtn = el.querySelector('.cancel-btn');
    const deleteBtn = el.querySelector('.delete-btn');

    nameInput.value = heading.name;

    const handleKeyDown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        saveHeading(heading.id, nameInput.value);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        exitHeadingEditMode();
      }
    };

    nameInput.addEventListener('keydown', handleKeyDown);

    saveBtn.addEventListener('click', () => saveHeading(heading.id, nameInput.value));
    cancelBtn.addEventListener('click', () => exitHeadingEditMode());
    deleteBtn.addEventListener('click', () => deleteHeading(heading.id));

    setTimeout(() => nameInput.focus(), 0);
  }

  // ============================================================
  // Edit Mode
  // ============================================================

  function enterEditMode(attributeId) {
    editingAttributeId = attributeId;
    setActiveItem('attribute', attributeId);
    renderUnifiedList();
  }

  function exitEditMode() {
    editingAttributeId = null;
    renderUnifiedList();
  }

  function enterHeadingEditMode(headingId) {
    editingHeadingId = headingId;
    setActiveItem('heading', headingId);
    renderUnifiedList();
  }

  function exitHeadingEditMode() {
    editingHeadingId = null;
    renderUnifiedList();
  }

  function saveAttribute(id, name, code, value, type) {
    if (!name.trim()) {
      alert('Name is required');
      return;
    }

    const codeValidation = validateCode(code, id);
    if (!codeValidation.valid) {
      alert('Invalid code: ' + codeValidation.error);
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

    sendSheetAction({ type: 'updateAttribute', sheetId: currentSheetId, attribute: updatedAttr });
    exitEditMode();
  }

  function saveHeading(id, name) {
    if (!name.trim()) {
      alert('Name is required');
      return;
    }

    const heading = (currentSheet.headings || []).find(h => h.id === id);
    if (!heading) return;

    const updatedHeading = {
      ...heading,
      name: name.trim(),
    };

    sendSheetAction({ type: 'updateHeading', sheetId: currentSheetId, heading: updatedHeading });
    exitHeadingEditMode();
  }

  function deleteHeading(id) {
    if (confirm('Delete this heading?')) {
      sendSheetAction({ type: 'deleteHeading', sheetId: currentSheetId, headingId: id });
      exitHeadingEditMode();
    }
  }

  function deleteAttribute(id) {
    if (confirm('Delete this attribute?')) {
      sendSheetAction({ type: 'deleteAttribute', sheetId: currentSheetId, attributeId: id });
      exitEditMode();
    }
  }

  // ============================================================
  // Heading Collapse
  // ============================================================

  function toggleHeadingCollapse(headingId) {
    if (collapsedHeadings.has(headingId)) {
      collapsedHeadings.delete(headingId);
    } else {
      collapsedHeadings.add(headingId);
    }
    renderUnifiedList();
  }

  // ============================================================
  // Add Attribute
  // ============================================================

  // Generate letter suffix: a, b, c, ... z, aa, ab, ... az, ba, ... zz
  function generateLetterSuffix(index) {
    if (index < 26) {
      return String.fromCharCode(97 + index); // a-z
    }
    // For indices >= 26, use two letters (aa, ab, ... zz)
    const first = Math.floor((index - 26) / 26);
    const second = (index - 26) % 26;
    if (first >= 26) {
      // Fallback for very large indices
      return 'z' + (index - 26 * 27 + 1);
    }
    return String.fromCharCode(97 + first) + String.fromCharCode(97 + second);
  }

  // Generate a unique name for duplicating by adding _a, _b, _c suffixes
  function generateUniqueName(baseName, existingNames) {
    // Strip any existing _X suffix from the base name
    const baseWithoutSuffix = baseName.replace(/_[a-z]+$/, '');

    let suffixIndex = 0;
    let newName;
    do {
      const suffix = generateLetterSuffix(suffixIndex);
      newName = baseWithoutSuffix + '_' + suffix;
      suffixIndex++;
    } while (existingNames.includes(newName));

    return newName;
  }

  function addAttribute(type) {
    const baseName = type === 'string' ? 'Text' : type === 'integer' ? 'Number' : 'Computed';
    const baseCode = type === 'string' ? 'text' : type === 'integer' ? 'num' : 'calc';

    let name = baseName;
    let code = baseCode;

    // If base code exists, try suffixes: _a, _b, ... _z, _aa, _ab, ...
    if (currentSheet.attributes.some(a => a.code === code)) {
      let suffixIndex = 0;
      do {
        const suffix = generateLetterSuffix(suffixIndex);
        code = baseCode + '_' + suffix;
        name = baseName + ' ' + suffix.toUpperCase();
        suffixIndex++;
      } while (currentSheet.attributes.some(a => a.code === code));
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

    if (activeItem && activeItem.kind === 'attribute') {
      queueInsert('attribute', activeItem.id);
    }
    sendSheetAction({ type: 'createAttribute', sheetId: currentSheetId, attribute });
  }

  function addHeading() {
    let name = 'New Section';
    let counter = 1;

    while ((currentSheet.headings || []).some(h => h.name === name)) {
      counter++;
      name = 'New Section ' + counter;
    }

    const heading = {
      name,
    };

    if (activeItem && activeItem.kind === 'heading') {
      queueInsert('heading', activeItem.id);
    }
    sendSheetAction({ type: 'createHeading', sheetId: currentSheetId, heading });
  }

  // ============================================================
  // Drag and Drop
  // ============================================================

  function setupUnifiedDragAndDrop(el, kind, itemId) {
    const handle = el.querySelector('.drag-handle');
    if (!handle || handle.classList.contains('disabled')) return;

    handle.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      startUnifiedDrag(el, kind, itemId, e);
    });
  }

  function getSheetItems(includeCollapsed) {
    const selector = includeCollapsed ? '.sheet-item' : '.sheet-item:not(.collapsed)';
    return Array.from(elements.attributesList.querySelectorAll(selector));
  }

  function getListGap() {
    const listStyle = window.getComputedStyle(elements.attributesList);
    const gapValue = listStyle.rowGap || listStyle.gap || '0';
    const gap = parseFloat(gapValue);
    return Number.isFinite(gap) ? gap : 0;
  }

  function getTargetIndex(items, clientY) {
    if (items.length === 0) return 0;
    for (let i = 0; i < items.length; i += 1) {
      const rect = items[i].getBoundingClientRect();
      const mid = rect.top + rect.height / 2;
      if (clientY < mid) {
        return i;
      }
    }
    return items.length;
  }

  function clearDragPreview(items) {
    items.forEach((item) => {
      item.classList.remove('drag-over', 'drag-shift');
      item.style.removeProperty('--drag-shift');
    });
  }

  function applyDragPreview(items, targetIndex, shiftY) {
    clearDragPreview(items);
    if (targetIndex < items.length) {
      items[targetIndex].classList.add('drag-over');
    }
    for (let i = targetIndex; i < items.length; i += 1) {
      items[i].classList.add('drag-shift');
      items[i].style.setProperty('--drag-shift', `${shiftY}px`);
    }
  }

  function buildUnifiedOrderFromDom(items) {
    return items
      .map((item) => ({ kind: item.dataset.kind, id: item.dataset.itemId }))
      .filter((entry) => entry.kind && entry.id);
  }

  function startUnifiedDrag(draggedEl, kind, itemId, startEvent) {
    const isReadOnly = currentSheetId && readOnlySheets.has(currentSheetId);
    if (isReadOnly) return;

    dragState = {
      draggedEl,
      kind,
      itemId,
      targetIndex: null,
      targetEl: null,
      shiftY: draggedEl.getBoundingClientRect().height + getListGap(),
    };

    draggedEl.classList.add('dragging');

    const onMouseMove = (e) => {
      if (!dragState) return;
      const visibleItems = getSheetItems(false).filter((item) => item !== dragState.draggedEl);
      const targetIndex = getTargetIndex(visibleItems, e.clientY);

      if (targetIndex !== dragState.targetIndex) {
        dragState.targetIndex = targetIndex;
        dragState.targetEl = targetIndex < visibleItems.length ? visibleItems[targetIndex] : null;
        applyDragPreview(visibleItems, targetIndex, dragState.shiftY);
      }
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);

      if (!dragState) return;

      const allItems = getSheetItems(true);
      const originalOrder = buildUnifiedOrderFromDom(allItems);
      const reordered = allItems.filter((item) => item !== dragState.draggedEl);
      const insertIndex = dragState.targetEl ? reordered.indexOf(dragState.targetEl) : reordered.length;

      if (dragState.targetIndex !== null) {
        reordered.splice(insertIndex, 0, dragState.draggedEl);
      }

      const updatedOrder = buildUnifiedOrderFromDom(reordered);

      draggedEl.classList.remove('dragging');
      clearDragPreview(getSheetItems(true));

      if (
        dragState.targetIndex !== null &&
        updatedOrder.length === originalOrder.length &&
        updatedOrder.some((entry, idx) => entry.kind !== originalOrder[idx]?.kind || entry.id !== originalOrder[idx]?.id)
      ) {
        sendSheetAction({ type: 'reorderUnified', sheetId: currentSheetId, items: updatedOrder });
      }

      dragState = null;
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }

  // ============================================================
  // Derived Attribute Formula Evaluation
  // ============================================================

  function evaluateFormula(formula) {
    if (!formula || !currentSheet) {
      return { value: 0 };
    }

    let expression = formula;
    const usedAttributes = [];

    const codeRegex = /@([a-z_]+)/g;
    let match;

    while ((match = codeRegex.exec(formula)) !== null) {
      const code = match[1];
      const attr = currentSheet.attributes.find(a => a.code === code);

      if (!attr) {
        return { error: `Unknown: @${code}` };
      }

      if (attr.type === 'derived') {
        return { error: `Cannot ref derived` };
      }

      if (attr.type === 'string') {
        return { error: `Cannot use string` };
      }

      if (attr.type === 'heading') {
        return { error: `Invalid ref` };
      }

      usedAttributes.push({ code, value: attr.value });
      expression = expression.replace(new RegExp('@' + code, 'g'), attr.value);
    }

    expression = expression.replace(/ceil\s*\(/g, 'Math.ceil(');
    expression = expression.replace(/floor\s*\(/g, 'Math.floor(');

    if (!/^[\d\s+\-*/().Math,ceil floor]+$/.test(expression)) {
      return { error: 'Invalid formula' };
    }

    try {
      const result = Function('"use strict"; return (' + expression + ')')();
      if (typeof result !== 'number' || !isFinite(result)) {
        return { error: 'Invalid result' };
      }
      return { value: Math.floor(result), usedAttributes };
    } catch (e) {
      return { error: 'Eval error' };
    }
  }

  // ============================================================
  // Validation
  // ============================================================

  // Reserved codes that cannot be used for attributes
  const RESERVED_CODES = ['result', 'maximum', 'minimum', 'name'];

  function isReservedCode(code) {
    return RESERVED_CODES.includes(code.toLowerCase());
  }

  function validateCode(code, excludeId = null) {
    const normalized = normalizeCode(code);

    if (!/^[a-z_]+$/.test(normalized)) {
      return { valid: false, error: 'Use lowercase letters and underscores only' };
    }

    if (isReservedCode(normalized)) {
      return { valid: false, error: `"${normalized}" is a reserved code` };
    }

    const isDuplicate = currentSheet.attributes.some(
      a => a.id !== excludeId && a.code === normalized
    );

    if (isDuplicate) {
      return { valid: false, error: 'Code must be unique' };
    }

    return { valid: true };
  }

  function normalizeCode(code) {
    return code.toLowerCase().replace(/[^a-z_]/g, '');
  }

  // ============================================================
  // Roll Templates Rendering
  // ============================================================

  function renderTemplates() {
    elements.templatesList.innerHTML = '';

    if (!currentSheet.rollTemplates || currentSheet.rollTemplates.length === 0) {
      elements.templatesList.innerHTML = '<div class="empty-state">No roll templates</div>';
      return;
    }

    // Sort by sort
    const sortedTemplates = [...currentSheet.rollTemplates].sort((a, b) => a.sort - b.sort);

    // Track current heading for indentation
    let currentHeadingId = null;

    sortedTemplates.forEach(template => {
      if (template.type === 'heading') {
        currentHeadingId = template.id;
        const el = createTemplateHeadingElement(template);
        elements.templatesList.appendChild(el);
      } else {
        const el = createTemplateElement(template, currentHeadingId);
        elements.templatesList.appendChild(el);
      }
    });
  }

  function createTemplateElement(template, headingId) {
    const isEditing = editingTemplateId === template.id;
    const htmlTemplate = isEditing ? templates.templateEdit : templates.templateView;
    const clone = htmlTemplate.content.cloneNode(true);
    const el = clone.querySelector('.template-item');

    el.dataset.templateId = template.id;
    el.dataset.kind = 'rollTemplate';
    el.dataset.itemId = template.id;
    el.classList.add('sheet-item');

    // Add indentation if under a heading
    if (headingId) {
      el.classList.add('indented');
      el.dataset.headingId = headingId;
      if (collapsedHeadings.has(headingId)) {
        el.classList.add('collapsed');
      }
    }

    // Validate all formulas
    const validation = validateRollTemplate(template);

    if (isEditing) {
      setupTemplateEditMode(el, template, validation);
    } else {
      setupTemplateViewMode(el, template, validation);
    }

    // Setup drag and drop (only in view mode)
    if (!isEditing) {
      setupUnifiedDragAndDrop(el, 'rollTemplate', template.id);
    }

    return el;
  }

  function createTemplateHeadingElement(template) {
    const isEditing = editingTemplateId === template.id;
    const htmlTemplate = isEditing ? templates.templateHeadingEdit : templates.templateHeadingView;
    const clone = htmlTemplate.content.cloneNode(true);
    const el = clone.querySelector('.template-item');

    el.dataset.templateId = template.id;

    if (collapsedHeadings.has(template.id)) {
      el.classList.add('collapsed');
    }

    if (isEditing) {
      setupTemplateHeadingEditMode(el, template);
    } else {
      setupTemplateHeadingViewMode(el, template);
    }

    return el;
  }

  function setupTemplateHeadingViewMode(el, template) {
    const nameEl = el.querySelector('.template-heading-name');
    const editBtn = el.querySelector('.edit-btn');
    const collapseBtn = el.querySelector('.collapse-btn');

    nameEl.textContent = template.name;

    editBtn.addEventListener('click', () => enterTemplateEditMode(template.id));
    collapseBtn.addEventListener('click', () => toggleTemplateHeadingCollapse(template.id));
  }

  function setupTemplateHeadingEditMode(el, template) {
    const nameInput = el.querySelector('.edit-template-heading-name');
    const saveBtn = el.querySelector('.save-btn');
    const cancelBtn = el.querySelector('.cancel-btn');
    const deleteBtn = el.querySelector('.delete-btn');

    nameInput.value = template.name;

    const handleKeyDown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        saveTemplateHeading(template.id, nameInput.value);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        exitTemplateEditMode();
      }
    };

    nameInput.addEventListener('keydown', handleKeyDown);

    saveBtn.addEventListener('click', () => saveTemplateHeading(template.id, nameInput.value));
    cancelBtn.addEventListener('click', () => exitTemplateEditMode());
    deleteBtn.addEventListener('click', () => deleteTemplate(template.id));

    setTimeout(() => nameInput.focus(), 0);
  }

  function saveTemplateHeading(id, name) {
    if (!name.trim()) {
      alert('Name is required');
      return;
    }

    const template = currentSheet.rollTemplates.find(t => t.id === id);
    if (!template) return;

    const updatedTemplate = {
      ...template,
      name: name.trim(),
    };

    sendSheetAction({ type: 'updateRollTemplate', sheetId: currentSheetId, template: updatedTemplate });
    exitTemplateEditMode();
  }

  function toggleTemplateHeadingCollapse(headingId) {
    if (collapsedHeadings.has(headingId)) {
      collapsedHeadings.delete(headingId);
    } else {
      collapsedHeadings.add(headingId);
    }
    renderUnifiedList();
  }

  function setupTemplateViewMode(el, template, validation) {
    const nameEl = el.querySelector('.template-name');
    const warningEl = el.querySelector('.template-warning');
    const editBtn = el.querySelector('.edit-btn');
    const rollBtnGroup = el.querySelector('.roll-btn-group');
    const rollBtn = el.querySelector('.roll-btn');
    const dropdownBtn = el.querySelector('.roll-dropdown-btn');
    const dropdown = el.querySelector('.roll-dropdown');

    nameEl.textContent = template.name;

    const hasMultipleFormulas = template.formulas && template.formulas.length > 1;

    if (!validation.valid) {
      el.classList.add('template-invalid');
      warningEl.hidden = false;
      warningEl.title = validation.errors.join(', ');
      rollBtn.disabled = true;
      if (dropdownBtn) dropdownBtn.disabled = true;
    } else {
      warningEl.hidden = true;
      rollBtn.disabled = false;
    }

    // Setup split button if multiple formulas
    if (hasMultipleFormulas) {
      dropdownBtn.hidden = false;

      // Populate dropdown with other formulas (skip first one)
      template.formulas.slice(1).forEach((formula, idx) => {
        const item = document.createElement('button');
        item.className = 'roll-dropdown-item';
        item.textContent = formula.title || `Option ${idx + 2}`;
        item.disabled = !validation.valid;
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          dropdown.hidden = true;
          executeRoll(template.id, idx + 1);
        });
        dropdown.appendChild(item);
      });

      // Toggle dropdown on click
      dropdownBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown.hidden = !dropdown.hidden;
      });

      // Close dropdown when clicking elsewhere
      document.addEventListener('click', () => {
        dropdown.hidden = true;
      });
    } else {
      rollBtnGroup.classList.add('single');
    }

    editBtn.addEventListener('click', () => enterTemplateEditMode(template.id));
    rollBtn.addEventListener('click', () => executeRoll(template.id, 0));
  }

  function setupTemplateEditMode(el, template, validation) {
    const nameInput = el.querySelector('.edit-template-name');
    const formulasList = el.querySelector('.template-formulas-list');
    const addFormulaBtn = el.querySelector('.add-formula-btn');
    const formatInput = el.querySelector('.edit-template-format');
    const superInput = el.querySelector('.edit-template-super');
    const errorEl = el.querySelector('.template-validation-error');
    const saveBtn = el.querySelector('.save-btn');
    const cancelBtn = el.querySelector('.cancel-btn');
    const copyBtn = el.querySelector('.copy-btn');
    const deleteBtn = el.querySelector('.delete-btn');

    nameInput.value = template.name;
    formatInput.value = template.displayFormat || '';
    superInput.value = template.superCondition || '';

    // Track formulas in edit state
    let editFormulas = template.formulas ? [...template.formulas] : [{ title: '', formula: '1d20' }];

    function renderFormulaRows() {
      formulasList.innerHTML = '';
      editFormulas.forEach((formula, index) => {
        const row = createFormulaRow(formula, index, editFormulas.length > 1);
        formulasList.appendChild(row);
      });
      updateValidation();
    }

    function createFormulaRow(formula, index, canRemove) {
      const clone = templates.formulaRow.content.cloneNode(true);
      const row = clone.querySelector('.formula-row');
      const titleInput = row.querySelector('.edit-formula-title');
      const formulaInput = row.querySelector('.edit-formula-formula');
      const removeBtn = row.querySelector('.remove-formula-btn');

      row.dataset.formulaIndex = index;
      titleInput.value = formula.title || '';
      formulaInput.value = formula.formula || '';

      // Update edit state on input
      titleInput.addEventListener('input', () => {
        editFormulas[index].title = titleInput.value;
      });
      formulaInput.addEventListener('input', () => {
        editFormulas[index].formula = formulaInput.value;
        updateValidation();
      });

      // Handle Enter/Escape
      const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          saveTemplateWithFormulas(template.id, nameInput.value, editFormulas, formatInput.value, superInput.value);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          exitTemplateEditMode();
        }
      };
      titleInput.addEventListener('keydown', handleKeyDown);
      formulaInput.addEventListener('keydown', handleKeyDown);

      // Remove button
      if (canRemove) {
        removeBtn.addEventListener('click', () => {
          editFormulas.splice(index, 1);
          renderFormulaRows();
        });
      } else {
        removeBtn.hidden = true;
      }

      return row;
    }

    function updateValidation() {
      const allValidation = validateAllFormulas(editFormulas);
      if (!allValidation.valid) {
        errorEl.textContent = allValidation.errors.join('; ');
        errorEl.hidden = false;
      } else {
        errorEl.hidden = true;
      }

      // Mark invalid formula inputs
      const rows = formulasList.querySelectorAll('.formula-row');
      rows.forEach((row, idx) => {
        const formulaInput = row.querySelector('.edit-formula-formula');
        const singleValidation = validateSingleFormula(editFormulas[idx]?.formula);
        formulaInput.classList.toggle('invalid', !singleValidation.valid);
      });
    }

    // Add formula button
    addFormulaBtn.addEventListener('click', () => {
      editFormulas.push({ title: '', formula: '1d20' });
      renderFormulaRows();
    });

    // Handle Enter/Escape on name and format inputs
    const handleMainKeyDown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        saveTemplateWithFormulas(template.id, nameInput.value, editFormulas, formatInput.value, superInput.value);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        exitTemplateEditMode();
      }
    };
    nameInput.addEventListener('keydown', handleMainKeyDown);
    formatInput.addEventListener('keydown', handleMainKeyDown);
    superInput.addEventListener('keydown', handleMainKeyDown);

    saveBtn.addEventListener('click', () => {
      saveTemplateWithFormulas(template.id, nameInput.value, editFormulas, formatInput.value, superInput.value);
    });

    cancelBtn.addEventListener('click', () => exitTemplateEditMode());
    copyBtn.addEventListener('click', () => duplicateTemplate(template.id));
    deleteBtn.addEventListener('click', () => deleteTemplate(template.id));

    // Initial render
    renderFormulaRows();

    // Focus the name input
    setTimeout(() => nameInput.focus(), 0);
  }

  // ============================================================
  // Roll Template Edit Mode
  // ============================================================

  function enterTemplateEditMode(templateId) {
    editingTemplateId = templateId;
    setActiveItem('rollTemplate', templateId);
    renderUnifiedList();
  }

  function exitTemplateEditMode() {
    editingTemplateId = null;
    renderUnifiedList();
  }

  function saveTemplateWithFormulas(id, name, formulas, displayFormat, superCondition) {
    if (!name.trim()) {
      alert('Name is required');
      return;
    }

    // Validate all formulas have content
    const cleanedFormulas = formulas.map(f => ({
      title: (f.title || '').trim(),
      formula: (f.formula || '').trim(),
    })).filter(f => f.formula); // Remove empty formulas

    if (cleanedFormulas.length === 0) {
      alert('At least one formula is required');
      return;
    }

    const template = currentSheet.rollTemplates.find(t => t.id === id);
    if (!template) return;

    const updatedTemplate = {
      ...template,
      name: name.trim(),
      formulas: cleanedFormulas,
      displayFormat: (displayFormat || '').trim(),
      superCondition: (superCondition || '').trim(),
    };

    sendSheetAction({ type: 'updateRollTemplate', sheetId: currentSheetId, template: updatedTemplate });
    exitTemplateEditMode();
  }

  function deleteTemplate(id) {
    if (confirm('Delete this roll template?')) {
      sendSheetAction({ type: 'deleteRollTemplate', sheetId: currentSheetId, templateId: id });
      exitTemplateEditMode();
    }
  }

  function duplicateTemplate(id) {
    const template = currentSheet.rollTemplates.find(t => t.id === id);
    if (!template || template.type !== 'roll') return;

    // Generate unique name
    const existingNames = currentSheet.rollTemplates.map(t => t.name);
    const newName = generateUniqueName(template.name, existingNames);

    // Create duplicate template data (without id and order - server will assign)
    const duplicateData = {
      type: 'roll',
      name: newName,
      formulas: JSON.parse(JSON.stringify(template.formulas)),
      displayFormat: template.displayFormat,
      superCondition: template.superCondition,
    };

    // Exit edit mode first
    exitTemplateEditMode();

    // Send create request - server will place it at the end, we'll reorder after
    queueInsert('rollTemplate', id);
    sendSheetAction({ type: 'createRollTemplate', sheetId: currentSheetId, template: duplicateData });
  }

  function addRollTemplate() {
    let name = 'New Roll';
    let counter = 1;

    while (currentSheet.rollTemplates.some(t => t.name === name)) {
      counter++;
      name = 'New Roll ' + counter;
    }

    const template = {
      type: 'roll',
      name,
      formulas: [
        { title: '', formula: '1d20' }
      ],
      displayFormat: '{name} rolled {result}',
    };

    if (activeItem && activeItem.kind === 'rollTemplate') {
      queueInsert('rollTemplate', activeItem.id);
    }
    sendSheetAction({ type: 'createRollTemplate', sheetId: currentSheetId, template });
  }

  function addTemplateHeading() {
    addHeading();
  }

  // ============================================================
  // Roll Template Validation
  // ============================================================

  function validateSingleFormula(formula) {
    if (!formula || !formula.trim()) {
      return { valid: false, error: 'Formula is required' };
    }

    // Find all @code references
    const codeRegex = /@([a-z_]+)/g;
    let match;
    const missingCodes = [];

    while ((match = codeRegex.exec(formula)) !== null) {
      const code = match[1];
      const attr = currentSheet.attributes.find(a => a.code === code);

      if (!attr) {
        missingCodes.push(code);
      } else if (attr.type === 'heading') {
        return { valid: false, error: `Cannot reference heading: @${code}` };
      } else if (attr.type === 'string') {
        return { valid: false, error: `Cannot use string in formula: @${code}` };
      }
    }

    if (missingCodes.length > 0) {
      return { valid: false, error: `Unknown attribute(s): @${missingCodes.join(', @')}` };
    }

    return { valid: true };
  }

  function validateAllFormulas(formulas) {
    if (!formulas || formulas.length === 0) {
      return { valid: false, errors: ['At least one formula is required'] };
    }

    const errors = [];
    formulas.forEach((f, idx) => {
      const validation = validateSingleFormula(f.formula);
      if (!validation.valid) {
        const label = f.title || `Formula ${idx + 1}`;
        errors.push(`${label}: ${validation.error}`);
      }
    });

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  function validateRollTemplate(template) {
    if (!template.formulas) {
      // Headings don't have formulas
      return { valid: true, errors: [] };
    }
    return validateAllFormulas(template.formulas);
  }

  // ============================================================
  // Resources Rendering
  // ============================================================

  // Available pip shapes
  const PIP_SHAPES = [
    'circle', 'square', 'diamond', 'triangle', 'hexagon', 'star',
    'heart', 'shield', 'skull', 'flame', 'lightning',
    'd4', 'd6', 'd8', 'd10', 'd12', 'd20'
  ];

  // Get SVG for a pip shape
  function getPipSVG(shape, filled = true) {
    const strokeWidth = filled ? 0 : 2;
    const fill = filled ? 'currentColor' : 'none';
    const stroke = 'currentColor';

    const svgStart = `<svg viewBox="0 0 24 24" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}">`;
    const svgEnd = '</svg>';

    const shapes = {
      circle: '<circle cx="12" cy="12" r="10"/>',
      square: '<rect x="2" y="2" width="20" height="20" rx="2"/>',
      diamond: '<path d="M12 2 L22 12 L12 22 L2 12 Z"/>',
      triangle: '<path d="M12 3 L22 21 L2 21 Z"/>',
      hexagon: '<path d="M12 2 L21.5 7 L21.5 17 L12 22 L2.5 17 L2.5 7 Z"/>',
      star: '<path d="M12 2 L14.9 8.6 L22 9.3 L17 14.1 L18.2 21.2 L12 17.8 L5.8 21.2 L7 14.1 L2 9.3 L9.1 8.6 Z"/>',
      heart: '<path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>',
      shield: '<path d="M12 2 L3 5 L3 11 C3 16.5 6.8 21.7 12 23 C17.2 21.7 21 16.5 21 11 L21 5 Z"/>',
      skull: '<path d="M12 2C7 2 3 6 3 10.5C3 13.5 4.5 16 7 17.5V21C7 21.5 7.5 22 8 22H16C16.5 22 17 21.5 17 21V17.5C19.5 16 21 13.5 21 10.5C21 6 17 2 12 2ZM8.5 12C7.7 12 7 11.3 7 10.5C7 9.7 7.7 9 8.5 9C9.3 9 10 9.7 10 10.5C10 11.3 9.3 12 8.5 12ZM15.5 12C14.7 12 14 11.3 14 10.5C14 9.7 14.7 9 15.5 9C16.3 9 17 9.7 17 10.5C17 11.3 16.3 12 15.5 12Z"/>',
      flame: '<path d="M12 2C8.5 6 6 10 6 14C6 17.3 8.7 20 12 20C15.3 20 18 17.3 18 14C18 10 15.5 6 12 2ZM12 18C10.3 18 9 16.7 9 15C9 13.3 10.3 12 12 12C13.7 12 15 13.3 15 15C15 16.7 13.7 18 12 18Z"/>',
      lightning: '<path d="M13 2L4 14H11L10 22L20 10H13L15 2H13Z"/>',
      d4: '<path d="M12 3 L22 21 L2 21 Z"/>',
      d6: '<rect x="3" y="3" width="18" height="18" rx="2"/>',
      d8: '<path d="M12 2 L22 12 L12 22 L2 12 Z"/>',
      d10: '<path d="M12 2 L20 8 L20 16 L12 22 L4 16 L4 8 Z"/>',
      d12: '<path d="M12 2 L19 5 L22 12 L19 19 L12 22 L5 19 L2 12 L5 5 Z"/>',
      d20: '<path d="M12 2 L21 8 L21 16 L12 22 L3 16 L3 8 Z"/>',
    };

    return svgStart + (shapes[shape] || shapes.circle) + svgEnd;
  }

  function renderResources() {
    if (!elements.resourcesList) return;

    const resources = currentSheet.resources || [];
    elements.resourcesList.innerHTML = '';

    if (resources.length === 0) {
      elements.resourcesList.innerHTML = '<div class="empty-state">No resources</div>';
      return;
    }

    // Sort by sort
    const sortedResources = [...resources].sort((a, b) => a.sort - b.sort);

    // Track current heading for indentation
    let currentHeadingId = null;

    sortedResources.forEach(resource => {
      if (resource.type === 'heading') {
        currentHeadingId = resource.id;
        const el = createResourceHeadingElement(resource);
        elements.resourcesList.appendChild(el);
      } else {
        const el = createResourceElement(resource, currentHeadingId);
        elements.resourcesList.appendChild(el);
      }
    });
  }

  function createResourceElement(resource, headingId) {
    const isEditing = editingResourceId === resource.id;
    const template = isEditing ? templates.resourceEdit : templates.resourceView;
    const clone = template.content.cloneNode(true);
    const el = clone.querySelector('.resource-item');

    el.dataset.resourceId = resource.id;
    el.dataset.kind = 'resource';
    el.dataset.itemId = resource.id;
    el.classList.add('sheet-item');

    // Add indentation if under a heading
    if (headingId) {
      el.classList.add('indented');
      el.dataset.headingId = headingId;
      if (collapsedHeadings.has(headingId)) {
        el.classList.add('collapsed');
      }
    }

    if (isEditing) {
      setupResourceEditMode(el, resource);
    } else {
      setupResourceViewMode(el, resource);
    }

    // Setup drag and drop (only in view mode)
    if (!isEditing) {
      setupUnifiedDragAndDrop(el, 'resource', resource.id);
    }

    return el;
  }

  function createResourceHeadingElement(resource) {
    const isEditing = editingResourceId === resource.id;
    const template = isEditing ? templates.resourceHeadingEdit : templates.resourceHeadingView;
    const clone = template.content.cloneNode(true);
    const el = clone.querySelector('.resource-item');

    el.dataset.resourceId = resource.id;

    if (collapsedHeadings.has(resource.id)) {
      el.classList.add('collapsed');
    }

    if (isEditing) {
      setupResourceHeadingEditMode(el, resource);
    } else {
      setupResourceHeadingViewMode(el, resource);
    }

    return el;
  }

  function setupResourceViewMode(el, resource) {
    const nameEl = el.querySelector('.resource-name');
    const pipsContainer = el.querySelector('.pips-container');
    const editBtn = el.querySelector('.edit-btn');

    nameEl.textContent = resource.name;

    // Render pips
    pipsContainer.innerHTML = '';
    for (let i = 0; i < resource.maximum; i++) {
      const filled = i < resource.current;
      const pip = document.createElement('button');
      pip.className = `pip ${filled ? 'filled' : 'empty'}`;
      pip.style.setProperty('--pip-color', resource.color);
      pip.dataset.index = i;
      pip.innerHTML = getPipSVG(resource.shape, filled);
      pip.addEventListener('click', () => handlePipClick(resource, i));
      pipsContainer.appendChild(pip);
    }

    editBtn.addEventListener('click', () => enterResourceEditMode(resource.id));
  }

  function setupResourceHeadingViewMode(el, resource) {
    const nameEl = el.querySelector('.resource-heading-name');
    const editBtn = el.querySelector('.edit-btn');
    const collapseBtn = el.querySelector('.collapse-btn');

    nameEl.textContent = resource.name;

    editBtn.addEventListener('click', () => enterResourceEditMode(resource.id));
    collapseBtn.addEventListener('click', () => toggleResourceHeadingCollapse(resource.id));
  }

  function setupResourceEditMode(el, resource) {
    const nameInput = el.querySelector('.edit-resource-name');
    const maxInput = el.querySelector('.edit-resource-max');
    const shapeSelector = el.querySelector('.shape-selector');
    const colorInput = el.querySelector('.edit-resource-color');
    const saveBtn = el.querySelector('.save-btn');
    const cancelBtn = el.querySelector('.cancel-btn');
    const copyBtn = el.querySelector('.copy-btn');
    const deleteBtn = el.querySelector('.delete-btn');

    nameInput.value = resource.name;
    maxInput.value = resource.maximum;
    colorInput.value = resource.color;

    // Render shape selector
    shapeSelector.innerHTML = '';
    PIP_SHAPES.forEach(shape => {
      const option = document.createElement('button');
      option.type = 'button';
      option.className = `shape-option${shape === resource.shape ? ' selected' : ''}`;
      option.dataset.shape = shape;
      option.innerHTML = getPipSVG(shape, true);
      option.title = shape;
      option.addEventListener('click', () => {
        shapeSelector.querySelectorAll('.shape-option').forEach(o => o.classList.remove('selected'));
        option.classList.add('selected');
      });
      shapeSelector.appendChild(option);
    });

    // Handle keyboard shortcuts
    const handleKeyDown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const selectedShape = shapeSelector.querySelector('.shape-option.selected')?.dataset.shape || resource.shape;
        saveResource(resource.id, nameInput.value, parseInt(maxInput.value, 10), resource.current, selectedShape, colorInput.value);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        exitResourceEditMode();
      }
    };

    nameInput.addEventListener('keydown', handleKeyDown);
    maxInput.addEventListener('keydown', handleKeyDown);

    saveBtn.addEventListener('click', () => {
      const selectedShape = shapeSelector.querySelector('.shape-option.selected')?.dataset.shape || resource.shape;
      saveResource(resource.id, nameInput.value, parseInt(maxInput.value, 10), resource.current, selectedShape, colorInput.value);
    });

    cancelBtn.addEventListener('click', () => exitResourceEditMode());
    copyBtn.addEventListener('click', () => duplicateResource(resource.id));
    deleteBtn.addEventListener('click', () => deleteResource(resource.id));

    // Focus name input
    setTimeout(() => nameInput.focus(), 0);
  }

  function setupResourceHeadingEditMode(el, resource) {
    const nameInput = el.querySelector('.edit-resource-heading-name');
    const saveBtn = el.querySelector('.save-btn');
    const cancelBtn = el.querySelector('.cancel-btn');
    const deleteBtn = el.querySelector('.delete-btn');

    nameInput.value = resource.name;

    const handleKeyDown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        saveResourceHeading(resource.id, nameInput.value);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        exitResourceEditMode();
      }
    };

    nameInput.addEventListener('keydown', handleKeyDown);

    saveBtn.addEventListener('click', () => saveResourceHeading(resource.id, nameInput.value));
    cancelBtn.addEventListener('click', () => exitResourceEditMode());
    deleteBtn.addEventListener('click', () => deleteResource(resource.id));

    setTimeout(() => nameInput.focus(), 0);
  }

  // ============================================================
  // Resource Edit Mode
  // ============================================================

  function enterResourceEditMode(resourceId) {
    editingResourceId = resourceId;
    setActiveItem('resource', resourceId);
    renderUnifiedList();
  }

  function exitResourceEditMode() {
    editingResourceId = null;
    renderUnifiedList();
  }

  function saveResource(id, name, maximum, current, shape, color) {
    if (!name.trim()) {
      alert('Name is required');
      return;
    }

    if (!maximum || maximum < 1) {
      alert('Maximum must be at least 1');
      return;
    }

    const resource = (currentSheet.resources || []).find(r => r.id === id);
    if (!resource) return;

    // Clamp current to new maximum
    const newCurrent = Math.min(current, maximum);

    const updatedResource = {
      ...resource,
      name: name.trim(),
      maximum: maximum,
      current: newCurrent,
      shape: shape,
      color: color,
    };

    sendSheetAction({ type: 'updateResource', sheetId: currentSheetId, resource: updatedResource });
    exitResourceEditMode();
  }

  function saveResourceHeading(id, name) {
    if (!name.trim()) {
      alert('Name is required');
      return;
    }

    const resource = (currentSheet.resources || []).find(r => r.id === id);
    if (!resource) return;

    const updatedResource = {
      ...resource,
      name: name.trim(),
    };

    sendSheetAction({ type: 'updateResource', sheetId: currentSheetId, resource: updatedResource });
    exitResourceEditMode();
  }

  function deleteResource(id) {
    if (confirm('Delete this resource?')) {
      sendSheetAction({ type: 'deleteResource', sheetId: currentSheetId, resourceId: id });
      exitResourceEditMode();
    }
  }

  function duplicateResource(id) {
    const resources = currentSheet.resources || [];
    const resource = resources.find(r => r.id === id);
    if (!resource || resource.type !== 'resource') return;

    // Generate unique name
    const existingNames = resources.map(r => r.name);
    const newName = generateUniqueName(resource.name, existingNames);

    // Create duplicate resource data (without id and order - server will assign)
    const duplicateData = {
      type: 'resource',
      name: newName,
      maximum: resource.maximum,
      current: resource.current,
      shape: resource.shape,
      color: resource.color,
    };

    // Exit edit mode first
    exitResourceEditMode();

    // Send create request
    queueInsert('resource', id);
    sendSheetAction({ type: 'createResource', sheetId: currentSheetId, resource: duplicateData });
  }

  function addResource() {
    let name = 'New Resource';
    let counter = 1;

    const resources = currentSheet.resources || [];
    while (resources.some(r => r.name === name)) {
      counter++;
      name = 'New Resource ' + counter;
    }

    const resource = {
      type: 'resource',
      name,
      maximum: 5,
      current: 5,
      shape: 'circle',
      color: '#6366f1',
    };

    if (activeItem && activeItem.kind === 'resource') {
      queueInsert('resource', activeItem.id);
    }
    sendSheetAction({ type: 'createResource', sheetId: currentSheetId, resource });
  }

  function addResourceHeading() {
    addHeading();
  }

  function toggleResourceHeadingCollapse(headingId) {
    if (collapsedHeadings.has(headingId)) {
      collapsedHeadings.delete(headingId);
    } else {
      collapsedHeadings.add(headingId);
    }
    renderUnifiedList();
  }

  // ============================================================
  // Pip Click Logic
  // ============================================================

  function handlePipClick(resource, clickedIndex) {
    // clickedIndex is 0-based (0 to maximum-1)
    const clickedPipFilled = clickedIndex < resource.current;

    let newCurrent;
    if (clickedPipFilled) {
      // Clicking a filled pip: empty it and all after it
      newCurrent = clickedIndex;
    } else {
      // Clicking an empty pip: fill it and all before it
      newCurrent = clickedIndex + 1;
    }

    // Send update to server
    const updated = { ...resource, current: newCurrent };
    sendSheetAction({ type: 'updateResource', sheetId: currentSheetId, resource: updated });
  }

  // ============================================================
  // Roll Execution (placeholder - to be implemented in Phase 2)
  // ============================================================

  function executeRoll(templateId, formulaIndex = 0) {
    send({ type: 'roll', sheetId: currentSheetId, templateId, formulaIndex });
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
    entries.slice().reverse().forEach(entry => {
      const el = createHistoryElement(entry);
      elements.historyList.appendChild(el);
    });
  }

  function addHistoryEntry(entry) {
    const emptyState = elements.historyList.querySelector('.empty-state');
    if (emptyState) {
      emptyState.remove();
    }

    const el = createHistoryElement(entry, true);

    // All entries start with normal slide-in animation
    el.classList.add('history-animate-normal');

    elements.historyList.insertBefore(el, elements.historyList.firstChild);

    // Remove normal animation class after it completes
    setTimeout(() => {
      el.classList.remove('history-animate-normal');
    }, 400);

    // For super entries, upgrade after the normal animation
    if (entry.isSuper) {
      setTimeout(() => {
        upgradeToSuper(el);
      }, 350); // Slight overlap for smooth transition
    }
  }

  function upgradeToSuper(el) {
    // Find the placeholder and replace with actual star
    const placeholder = el.querySelector('.super-star-placeholder');
    if (placeholder) {
      const star = document.createElement('span');
      star.className = 'super-star-container';
      star.innerHTML = `
        <svg class="super-star" width="24" height="24" viewBox="0 0 24 24" fill="#fbbf24">
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
        </svg>
      `;
      placeholder.replaceWith(star);

      // Add the star pop animation
      star.classList.add('super-star-animate');
    }

    // Add upgrade animation class
    el.classList.add('history-upgrade-super');

    // Add super styling
    el.classList.add('history-super');

    // Trigger canvas effects centered on the star
    requestAnimationFrame(() => {
      const star = el.querySelector('.super-star');
      if (star) {
        triggerSuperEffect(el, star);
      } else {
        triggerSuperEffect(el);
      }
    });

    // Remove upgrade animation class after it completes
    setTimeout(() => {
      el.classList.remove('history-upgrade-super');
    }, 800);
  }

  // ============================================================
  // Super Effect Canvas System
  // ============================================================

  let superCanvas = null;
  let superCtx = null;

  function ensureSuperCanvas() {
    if (superCanvas) return;

    superCanvas = document.createElement('canvas');
    superCanvas.id = 'super-effect-canvas';
    superCanvas.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      pointer-events: none;
      z-index: 10000;
    `;
    document.body.appendChild(superCanvas);

    const resize = () => {
      superCanvas.width = window.innerWidth;
      superCanvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    superCtx = superCanvas.getContext('2d');
  }

  function triggerSuperEffect(targetEl, starEl = null) {
    ensureSuperCanvas();

    // Center on the star if provided, otherwise center on the element
    let centerX, centerY;
    if (starEl) {
      const starRect = starEl.getBoundingClientRect();
      centerX = starRect.left + starRect.width / 2;
      centerY = starRect.top + starRect.height / 2;
    } else {
      const rect = targetEl.getBoundingClientRect();
      centerX = rect.left + rect.width / 2;
      centerY = rect.top + rect.height / 2;
    }

    // Create screen flash
    createScreenFlash();

    // Create particle burst
    const particles = [];
    const particleCount = 40;

    for (let i = 0; i < particleCount; i++) {
      const angle = (Math.PI * 2 * i) / particleCount + (Math.random() - 0.5) * 0.3;
      const speed = 8 + Math.random() * 12;
      const size = 4 + Math.random() * 8;
      const colors = ['#fbbf24', '#f59e0b', '#fcd34d', '#fde68a', '#ffffff'];

      particles.push({
        x: centerX,
        y: centerY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: size,
        color: colors[Math.floor(Math.random() * colors.length)],
        life: 1,
        decay: 0.015 + Math.random() * 0.01,
        gravity: 0.15,
      });
    }

    // Create starburst rays
    const rays = [];
    const rayCount = 12;

    for (let i = 0; i < rayCount; i++) {
      const angle = (Math.PI * 2 * i) / rayCount;
      rays.push({
        angle: angle,
        length: 0,
        maxLength: 150 + Math.random() * 100,
        width: 3 + Math.random() * 4,
        speed: 15 + Math.random() * 10,
        life: 1,
        decay: 0.025,
      });
    }

    // Create sparkle trail particles
    const sparkles = [];
    for (let i = 0; i < 30; i++) {
      const angle = Math.random() * Math.PI * 2;
      const distance = Math.random() * 60;
      sparkles.push({
        x: centerX + Math.cos(angle) * distance,
        y: centerY + Math.sin(angle) * distance,
        size: 2 + Math.random() * 4,
        life: 0.5 + Math.random() * 0.5,
        decay: 0.02 + Math.random() * 0.02,
        twinkle: Math.random() * Math.PI * 2,
      });
    }

    let animationId;
    const animate = () => {
      superCtx.clearRect(0, 0, superCanvas.width, superCanvas.height);

      let hasActiveElements = false;

      // Draw rays
      rays.forEach(ray => {
        if (ray.life <= 0) return;
        hasActiveElements = true;

        ray.length = Math.min(ray.length + ray.speed, ray.maxLength);
        ray.life -= ray.decay;

        const endX = centerX + Math.cos(ray.angle) * ray.length;
        const endY = centerY + Math.sin(ray.angle) * ray.length;

        const gradient = superCtx.createLinearGradient(centerX, centerY, endX, endY);
        gradient.addColorStop(0, `rgba(251, 191, 36, ${ray.life * 0.8})`);
        gradient.addColorStop(0.5, `rgba(253, 230, 138, ${ray.life * 0.6})`);
        gradient.addColorStop(1, `rgba(255, 255, 255, 0)`);

        superCtx.beginPath();
        superCtx.moveTo(centerX, centerY);
        superCtx.lineTo(endX, endY);
        superCtx.strokeStyle = gradient;
        superCtx.lineWidth = ray.width * ray.life;
        superCtx.lineCap = 'round';
        superCtx.stroke();
      });

      // Draw particles
      particles.forEach(p => {
        if (p.life <= 0) return;
        hasActiveElements = true;

        p.x += p.vx;
        p.y += p.vy;
        p.vy += p.gravity;
        p.vx *= 0.98;
        p.life -= p.decay;

        superCtx.beginPath();
        superCtx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
        superCtx.fillStyle = p.color;
        superCtx.globalAlpha = p.life;
        superCtx.fill();
        superCtx.globalAlpha = 1;
      });

      // Draw sparkles
      sparkles.forEach(s => {
        if (s.life <= 0) return;
        hasActiveElements = true;

        s.life -= s.decay;
        s.twinkle += 0.3;

        const twinkleAlpha = (Math.sin(s.twinkle) + 1) / 2;
        const alpha = s.life * twinkleAlpha;

        superCtx.beginPath();
        superCtx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
        superCtx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
        superCtx.fill();

        // Draw 4-point star shape
        superCtx.beginPath();
        const starSize = s.size * 2;
        superCtx.moveTo(s.x - starSize, s.y);
        superCtx.lineTo(s.x + starSize, s.y);
        superCtx.moveTo(s.x, s.y - starSize);
        superCtx.lineTo(s.x, s.y + starSize);
        superCtx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.5})`;
        superCtx.lineWidth = 1;
        superCtx.stroke();
      });

      if (hasActiveElements) {
        animationId = requestAnimationFrame(animate);
      } else {
        superCtx.clearRect(0, 0, superCanvas.width, superCanvas.height);
      }
    };

    animate();
  }

  function createScreenFlash() {
    const flash = document.createElement('div');
    flash.className = 'super-screen-flash';
    document.body.appendChild(flash);

    setTimeout(() => flash.remove(), 500);
  }

  function createHistoryElement(entry, isNew = false) {
    const el = document.createElement('div');
    el.className = 'history-item';

    // For new super entries, we'll upgrade them after they appear
    // For existing super entries (from history load), show them as super immediately
    const showAsSuperImmediately = entry.isSuper && !isNew;

    if (showAsSuperImmediately) {
      el.classList.add('history-super');
    }

    // Store super status for later upgrade
    if (entry.isSuper) {
      el.dataset.isSuper = 'true';
    }

    const hasDetails = entry.details.diceResults.length > 0 || entry.details.attributesUsed.length > 0;

    // Star icon SVG - only show immediately for existing entries
    const starIcon = showAsSuperImmediately ? `
      <svg class="super-star" width="24" height="24" viewBox="0 0 24 24" fill="#fbbf24">
        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
      </svg>
    ` : '';

    // Placeholder for star that will be added during upgrade
    const starPlaceholder = (entry.isSuper && isNew) ? '<span class="super-star-placeholder"></span>' : '';

    el.innerHTML = `
      <div class="history-header">
        <div class="history-display">${escapeHtml(entry.displayText)}</div>
        ${starIcon}
        ${starPlaceholder}
        ${hasDetails ? `
          <button class="history-toggle" aria-expanded="false" aria-label="Show details">
            <svg class="toggle-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </button>
        ` : ''}
      </div>
      ${hasDetails ? `
        <div class="history-details" hidden>
          <div class="roll-formula">Formula: <code>${escapeHtml(entry.details.formula)}</code></div>
          <div class="roll-breakdown">${formatRollBreakdown(entry.details)}</div>
          ${entry.details.attributesUsed.length > 0 ? `
            <div class="attributes-used">
              ${entry.details.attributesUsed.map(a => `<span class="attr-name">${escapeHtml(a.name || a.code)}</span>: ${a.value}`).join(', ')}
            </div>
          ` : ''}
        </div>
      ` : ''}
    `;

    // Add toggle functionality
    const toggleBtn = el.querySelector('.history-toggle');
    const details = el.querySelector('.history-details');
    if (toggleBtn && details) {
      toggleBtn.addEventListener('click', () => {
        const expanded = toggleBtn.getAttribute('aria-expanded') === 'true';
        toggleBtn.setAttribute('aria-expanded', !expanded);
        details.hidden = expanded;
        el.classList.toggle('expanded', !expanded);
      });
    }

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
    elements.exportSheetBtn.addEventListener('click', exportSheet);
    elements.copySheetBtn.addEventListener('click', copySheet);
    elements.deleteSheetBtn.addEventListener('click', deleteSheet);

    // Import sheet via drag and drop on the + button
    elements.addSheetBtn.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      elements.addSheetBtn.classList.add('drag-over');
    });

    elements.addSheetBtn.addEventListener('dragleave', (e) => {
      e.preventDefault();
      e.stopPropagation();
      elements.addSheetBtn.classList.remove('drag-over');
    });

    elements.addSheetBtn.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      elements.addSheetBtn.classList.remove('drag-over');

      const files = e.dataTransfer.files;
      if (files.length > 0) {
        const file = files[0];
        // Accept JSON or plain text files
        if (file.type === 'application/json' || file.type === 'text/plain' || file.name.endsWith('.json')) {
          importSheet(file);
        } else {
          alert('Please drop a JSON file to import a character sheet.');
        }
      }
    });
    elements.deleteCancelBtn.addEventListener('click', cancelDeleteSheet);
    elements.deleteConfirmBtn.addEventListener('click', confirmDeleteSheet);
    elements.clearHistoryBtn.addEventListener('click', clearHistory);

    // Rename sheet
    elements.renameBtn.addEventListener('click', startRename);
    elements.renameSaveBtn.addEventListener('click', saveRename);
    elements.renameCancelBtn.addEventListener('click', cancelRename);
    elements.renameNameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        saveRename();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancelRename();
      }
    });
    elements.renameInitialsInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        saveRename();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancelRename();
      }
    });

    // Read-only toggle
    elements.readOnlyToggle.addEventListener('click', toggleReadOnly);

    elements.addHeadingBtn.addEventListener('click', addHeading);
    elements.addStringAttrBtn.addEventListener('click', () => addAttribute('string'));
    elements.addIntegerAttrBtn.addEventListener('click', () => addAttribute('integer'));
    elements.addDerivedAttrBtn.addEventListener('click', () => addAttribute('derived'));
    elements.addTemplateBtn.addEventListener('click', addRollTemplate);
    elements.addTemplateHeadingBtn.addEventListener('click', addHeading);
    elements.addResourceBtn.addEventListener('click', addResource);
    elements.addResourceHeadingBtn.addEventListener('click', addHeading);

    elements.deleteModal.addEventListener('click', (e) => {
      if (e.target === elements.deleteModal) {
        cancelDeleteSheet();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !elements.deleteModal.hidden) {
        cancelDeleteSheet();
      }
      // Also handle escape for rename
      if (e.key === 'Escape' && isRenaming) {
        cancelRename();
      }
    });
  }

  // ============================================================
  // Initialize
  // ============================================================

  function init() {
    console.log('Roll Sheet initialized');
    setupEventListeners();
    setupResizer();
    connect();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
