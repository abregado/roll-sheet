// Roll Sheet Client

(function() {
  'use strict';

  // State
  let ws = null;
  let sheets = [];
  let currentSheetId = null;
  let currentSheet = null;
  let editingAttributeId = null;
  let editingTemplateId = null;
  let draggedAttributeId = null;
  let draggedTemplateId = null;
  let collapsedHeadings = new Set(); // Track collapsed headings locally

  // DOM Elements
  const elements = {
    sheetIcons: document.getElementById('sheet-icons'),
    addSheetBtn: document.getElementById('add-sheet-btn'),
    attributesList: document.getElementById('attributes-list'),
    addHeadingBtn: document.getElementById('add-heading-btn'),
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
    headingView: document.getElementById('heading-view-template'),
    headingEdit: document.getElementById('heading-edit-template'),
    templateView: document.getElementById('template-view-template'),
    templateEdit: document.getElementById('template-edit-template'),
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
          const wasEditingAttr = editingAttributeId;
          const wasEditingTemplate = editingTemplateId;
          currentSheet = message.sheet;
          renderSheet();
          if (wasEditingAttr) {
            const attr = currentSheet.attributes.find(a => a.id === wasEditingAttr);
            if (attr) {
              enterEditMode(wasEditingAttr);
            }
          }
          if (wasEditingTemplate) {
            const tmpl = currentSheet.rollTemplates.find(t => t.id === wasEditingTemplate);
            if (tmpl) {
              enterTemplateEditMode(wasEditingTemplate);
            }
          }
        }
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
    editingTemplateId = null;
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

    // Track current heading for indentation
    let currentHeadingId = null;

    sortedAttributes.forEach(attr => {
      if (attr.type === 'heading') {
        currentHeadingId = attr.id;
        const el = createHeadingElement(attr);
        elements.attributesList.appendChild(el);
      } else {
        const el = createAttributeElement(attr, currentHeadingId);
        elements.attributesList.appendChild(el);
      }
    });
  }

  function createAttributeElement(attr, headingId) {
    const isEditing = editingAttributeId === attr.id;
    const template = isEditing ? templates.attributeEdit : templates.attributeView;
    const clone = template.content.cloneNode(true);
    const el = clone.querySelector('.attribute-item');

    el.dataset.attributeId = attr.id;

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
      setupDragAndDrop(el, attr.id);
    }

    return el;
  }

  function createHeadingElement(attr) {
    const isEditing = editingAttributeId === attr.id;
    const template = isEditing ? templates.headingEdit : templates.headingView;
    const clone = template.content.cloneNode(true);
    const el = clone.querySelector('.attribute-item');

    el.dataset.attributeId = attr.id;

    if (collapsedHeadings.has(attr.id)) {
      el.classList.add('collapsed');
    }

    if (isEditing) {
      setupHeadingEditMode(el, attr);
    } else {
      setupHeadingViewMode(el, attr);
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

  function setupHeadingViewMode(el, attr) {
    const nameEl = el.querySelector('.heading-name');
    const editBtn = el.querySelector('.edit-btn');
    const collapseBtn = el.querySelector('.collapse-btn');

    nameEl.textContent = attr.name;

    editBtn.addEventListener('click', () => enterEditMode(attr.id));
    collapseBtn.addEventListener('click', () => toggleHeadingCollapse(attr.id));
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

  function setupHeadingEditMode(el, attr) {
    const nameInput = el.querySelector('.edit-heading-name');
    const saveBtn = el.querySelector('.save-btn');
    const cancelBtn = el.querySelector('.cancel-btn');
    const deleteBtn = el.querySelector('.delete-btn');

    nameInput.value = attr.name;

    const handleKeyDown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        saveHeading(attr.id, nameInput.value);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        exitEditMode();
      }
    };

    nameInput.addEventListener('keydown', handleKeyDown);

    saveBtn.addEventListener('click', () => saveHeading(attr.id, nameInput.value));
    cancelBtn.addEventListener('click', () => exitEditMode());
    deleteBtn.addEventListener('click', () => deleteAttribute(attr.id));

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

  function saveHeading(id, name) {
    if (!name.trim()) {
      alert('Name is required');
      return;
    }

    const attr = currentSheet.attributes.find(a => a.id === id);
    if (!attr) return;

    const updatedAttr = {
      ...attr,
      name: name.trim(),
    };

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
  // Heading Collapse
  // ============================================================

  function toggleHeadingCollapse(headingId) {
    if (collapsedHeadings.has(headingId)) {
      collapsedHeadings.delete(headingId);
    } else {
      collapsedHeadings.add(headingId);
    }
    renderAttributes();
  }

  // ============================================================
  // Add Attribute
  // ============================================================

  function addAttribute(type) {
    if (type === 'heading') {
      addHeading();
      return;
    }

    const baseName = type === 'string' ? 'Text' : type === 'integer' ? 'Number' : 'Computed';
    const baseCode = type === 'string' ? 'text' : type === 'integer' ? 'num' : 'calc';

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

  function addHeading() {
    let name = 'New Section';
    let counter = 1;

    while (currentSheet.attributes.some(a => a.type === 'heading' && a.name === name)) {
      counter++;
      name = 'New Section ' + counter;
    }

    const attribute = {
      name,
      type: 'heading',
      collapsed: false,
    };

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

    const items = Array.from(elements.attributesList.querySelectorAll('.attribute-item:not(.collapsed)'));
    const draggedIndex = items.indexOf(draggedEl);
    const itemHeight = draggedEl.offsetHeight + 4; // Including gap

    let currentIndex = draggedIndex;
    const startY = startEvent.clientY;

    const onMouseMove = (e) => {
      const deltaY = e.clientY - startY;
      const indexDelta = Math.round(deltaY / itemHeight);
      const newIndex = Math.max(0, Math.min(items.length - 1, draggedIndex + indexDelta));

      if (newIndex !== currentIndex) {
        items.forEach(item => item.classList.remove('drag-over'));
        if (newIndex !== draggedIndex) {
          items[newIndex]?.classList.add('drag-over');
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

  function validateCode(code, excludeId = null) {
    const normalized = normalizeCode(code);

    if (!/^[a-z_]+$/.test(normalized)) {
      return false;
    }

    const isDuplicate = currentSheet.attributes.some(
      a => a.id !== excludeId && a.code === normalized
    );

    return !isDuplicate;
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

    // Sort by order
    const sortedTemplates = [...currentSheet.rollTemplates].sort((a, b) => a.order - b.order);

    sortedTemplates.forEach(template => {
      const el = createTemplateElement(template);
      elements.templatesList.appendChild(el);
    });
  }

  function createTemplateElement(template) {
    const isEditing = editingTemplateId === template.id;
    const htmlTemplate = isEditing ? templates.templateEdit : templates.templateView;
    const clone = htmlTemplate.content.cloneNode(true);
    const el = clone.querySelector('.template-item');

    el.dataset.templateId = template.id;

    // Validate formula
    const validation = validateRollFormula(template.formula);

    if (isEditing) {
      setupTemplateEditMode(el, template, validation);
    } else {
      setupTemplateViewMode(el, template, validation);
    }

    // Setup drag and drop (only in view mode)
    if (!isEditing) {
      setupTemplateDragAndDrop(el, template.id);
    }

    return el;
  }

  function setupTemplateViewMode(el, template, validation) {
    const nameEl = el.querySelector('.template-name');
    const warningEl = el.querySelector('.template-warning');
    const editBtn = el.querySelector('.edit-btn');
    const rollBtn = el.querySelector('.roll-btn');

    nameEl.textContent = template.name;

    if (!validation.valid) {
      el.classList.add('template-invalid');
      warningEl.hidden = false;
      warningEl.title = validation.error;
      rollBtn.disabled = true;
    } else {
      warningEl.hidden = true;
      rollBtn.disabled = false;
    }

    editBtn.addEventListener('click', () => enterTemplateEditMode(template.id));
    rollBtn.addEventListener('click', () => executeRoll(template.id));
  }

  function setupTemplateEditMode(el, template, validation) {
    const nameInput = el.querySelector('.edit-template-name');
    const formulaInput = el.querySelector('.edit-template-formula');
    const formatInput = el.querySelector('.edit-template-format');
    const errorEl = el.querySelector('.template-validation-error');
    const saveBtn = el.querySelector('.save-btn');
    const cancelBtn = el.querySelector('.cancel-btn');
    const deleteBtn = el.querySelector('.delete-btn');

    nameInput.value = template.name;
    formulaInput.value = template.formula;
    formatInput.value = template.displayFormat;

    if (!validation.valid) {
      errorEl.textContent = validation.error;
      errorEl.hidden = false;
    }

    // Live validation on formula input
    formulaInput.addEventListener('input', () => {
      const newValidation = validateRollFormula(formulaInput.value);
      if (!newValidation.valid) {
        formulaInput.classList.add('invalid');
        errorEl.textContent = newValidation.error;
        errorEl.hidden = false;
      } else {
        formulaInput.classList.remove('invalid');
        errorEl.hidden = true;
      }
    });

    // Save on Enter
    const handleKeyDown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        saveTemplate(template.id, nameInput.value, formulaInput.value, formatInput.value);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        exitTemplateEditMode();
      }
    };

    nameInput.addEventListener('keydown', handleKeyDown);
    formulaInput.addEventListener('keydown', handleKeyDown);
    formatInput.addEventListener('keydown', handleKeyDown);

    saveBtn.addEventListener('click', () => {
      saveTemplate(template.id, nameInput.value, formulaInput.value, formatInput.value);
    });

    cancelBtn.addEventListener('click', () => exitTemplateEditMode());
    deleteBtn.addEventListener('click', () => deleteTemplate(template.id));

    // Focus the name input
    setTimeout(() => nameInput.focus(), 0);
  }

  // ============================================================
  // Roll Template Edit Mode
  // ============================================================

  function enterTemplateEditMode(templateId) {
    editingTemplateId = templateId;
    renderTemplates();
  }

  function exitTemplateEditMode() {
    editingTemplateId = null;
    renderTemplates();
  }

  function saveTemplate(id, name, formula, displayFormat) {
    if (!name.trim()) {
      alert('Name is required');
      return;
    }

    if (!formula.trim()) {
      alert('Formula is required');
      return;
    }

    const template = currentSheet.rollTemplates.find(t => t.id === id);
    if (!template) return;

    const updatedTemplate = {
      ...template,
      name: name.trim(),
      formula: formula.trim(),
      displayFormat: displayFormat.trim(),
    };

    send({ type: 'updateRollTemplate', sheetId: currentSheetId, template: updatedTemplate });
    exitTemplateEditMode();
  }

  function deleteTemplate(id) {
    if (confirm('Delete this roll template?')) {
      send({ type: 'deleteRollTemplate', sheetId: currentSheetId, templateId: id });
      exitTemplateEditMode();
    }
  }

  function addRollTemplate() {
    let name = 'New Roll';
    let counter = 1;

    while (currentSheet.rollTemplates.some(t => t.name === name)) {
      counter++;
      name = 'New Roll ' + counter;
    }

    const template = {
      name,
      formula: '1d20',
      displayFormat: '{name} rolled {result}',
    };

    send({ type: 'createRollTemplate', sheetId: currentSheetId, template });
  }

  // ============================================================
  // Roll Template Validation
  // ============================================================

  function validateRollFormula(formula) {
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

  // ============================================================
  // Roll Template Drag and Drop
  // ============================================================

  function setupTemplateDragAndDrop(el, templateId) {
    const handle = el.querySelector('.drag-handle');

    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      startTemplateDrag(templateId, e);
    });

    el.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (draggedTemplateId && draggedTemplateId !== templateId) {
        el.classList.add('drag-over');
      }
    });

    el.addEventListener('dragleave', () => {
      el.classList.remove('drag-over');
    });

    el.addEventListener('drop', (e) => {
      e.preventDefault();
      el.classList.remove('drag-over');
      if (draggedTemplateId && draggedTemplateId !== templateId) {
        reorderTemplates(draggedTemplateId, templateId);
      }
    });
  }

  function startTemplateDrag(templateId, startEvent) {
    draggedTemplateId = templateId;
    const draggedEl = elements.templatesList.querySelector(`[data-template-id="${templateId}"]`);
    if (!draggedEl) return;

    draggedEl.classList.add('dragging');

    const items = Array.from(elements.templatesList.querySelectorAll('.template-item'));
    const draggedIndex = items.indexOf(draggedEl);
    const itemHeight = draggedEl.offsetHeight + 8; // Including gap

    let currentIndex = draggedIndex;
    const startY = startEvent.clientY;

    const onMouseMove = (e) => {
      const deltaY = e.clientY - startY;
      const indexDelta = Math.round(deltaY / itemHeight);
      const newIndex = Math.max(0, Math.min(items.length - 1, draggedIndex + indexDelta));

      if (newIndex !== currentIndex) {
        items.forEach(item => item.classList.remove('drag-over'));
        if (newIndex !== draggedIndex) {
          items[newIndex]?.classList.add('drag-over');
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
        const orderedIds = items.map(item => item.dataset.templateId);
        const [removed] = orderedIds.splice(draggedIndex, 1);
        orderedIds.splice(currentIndex, 0, removed);

        send({ type: 'reorderRollTemplates', sheetId: currentSheetId, templateIds: orderedIds });
      }

      draggedTemplateId = null;
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }

  function reorderTemplates(draggedId, targetId) {
    const items = Array.from(elements.templatesList.querySelectorAll('.template-item'));
    const orderedIds = items.map(item => item.dataset.templateId);

    const draggedIndex = orderedIds.indexOf(draggedId);
    const targetIndex = orderedIds.indexOf(targetId);

    if (draggedIndex === -1 || targetIndex === -1) return;

    orderedIds.splice(draggedIndex, 1);
    orderedIds.splice(targetIndex, 0, draggedId);

    send({ type: 'reorderRollTemplates', sheetId: currentSheetId, templateIds: orderedIds });
  }

  // ============================================================
  // Roll Execution (placeholder - to be implemented in Phase 2)
  // ============================================================

  function executeRoll(templateId) {
    send({ type: 'roll', sheetId: currentSheetId, templateId });
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

    elements.addHeadingBtn.addEventListener('click', () => addAttribute('heading'));
    elements.addStringAttrBtn.addEventListener('click', () => addAttribute('string'));
    elements.addIntegerAttrBtn.addEventListener('click', () => addAttribute('integer'));
    elements.addDerivedAttrBtn.addEventListener('click', () => addAttribute('derived'));
    elements.addTemplateBtn.addEventListener('click', addRollTemplate);

    elements.deleteModal.addEventListener('click', (e) => {
      if (e.target === elements.deleteModal) {
        cancelDeleteSheet();
      }
    });

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
