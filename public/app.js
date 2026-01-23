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
  let collapsedTemplateHeadings = new Set(); // Track collapsed template headings locally

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
    addTemplateHeadingBtn: document.getElementById('add-template-heading-btn'),
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
    templateHeadingView: document.getElementById('template-heading-view-template'),
    templateHeadingEdit: document.getElementById('template-heading-edit-template'),
    formulaRow: document.getElementById('formula-row-template'),
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

  function addAttribute(type) {
    if (type === 'heading') {
      addHeading();
      return;
    }

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

  // Reserved codes that cannot be used for attributes
  const RESERVED_CODES = ['result', 'maximum', 'minimum'];

  function isReservedCode(code) {
    return RESERVED_CODES.includes(code.toLowerCase());
  }

  function validateCode(code, excludeId = null) {
    const normalized = normalizeCode(code);

    if (!/^[a-z_]+$/.test(normalized)) {
      return { valid: false, error: 'Use lowercase letters and underscores only' };
    }

    if (isReservedCode(normalized)) {
      return { valid: false, error: `"${normalized}" is reserved for super conditions` };
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

    // Sort by order
    const sortedTemplates = [...currentSheet.rollTemplates].sort((a, b) => a.order - b.order);

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

    // Add indentation if under a heading
    if (headingId) {
      el.classList.add('indented');
      el.dataset.headingId = headingId;
      if (collapsedTemplateHeadings.has(headingId)) {
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
      setupTemplateDragAndDrop(el, template.id);
    }

    return el;
  }

  function createTemplateHeadingElement(template) {
    const isEditing = editingTemplateId === template.id;
    const htmlTemplate = isEditing ? templates.templateHeadingEdit : templates.templateHeadingView;
    const clone = htmlTemplate.content.cloneNode(true);
    const el = clone.querySelector('.template-item');

    el.dataset.templateId = template.id;

    if (collapsedTemplateHeadings.has(template.id)) {
      el.classList.add('collapsed');
    }

    if (isEditing) {
      setupTemplateHeadingEditMode(el, template);
    } else {
      setupTemplateHeadingViewMode(el, template);
    }

    // Setup drag and drop (only in view mode)
    if (!isEditing) {
      setupTemplateDragAndDrop(el, template.id);
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

    send({ type: 'updateRollTemplate', sheetId: currentSheetId, template: updatedTemplate });
    exitTemplateEditMode();
  }

  function toggleTemplateHeadingCollapse(headingId) {
    if (collapsedTemplateHeadings.has(headingId)) {
      collapsedTemplateHeadings.delete(headingId);
    } else {
      collapsedTemplateHeadings.add(headingId);
    }
    renderTemplates();
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
    renderTemplates();
  }

  function exitTemplateEditMode() {
    editingTemplateId = null;
    renderTemplates();
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
      type: 'roll',
      name,
      formulas: [
        { title: '', formula: '1d20' }
      ],
      displayFormat: '{name} rolled {result}',
    };

    send({ type: 'createRollTemplate', sheetId: currentSheetId, template });
  }

  function addTemplateHeading() {
    let name = 'New Section';
    let counter = 1;

    while (currentSheet.rollTemplates.some(t => t.type === 'heading' && t.name === name)) {
      counter++;
      name = 'New Section ' + counter;
    }

    const template = {
      type: 'heading',
      name,
      collapsed: false,
    };

    send({ type: 'createRollTemplate', sheetId: currentSheetId, template });
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

    const items = Array.from(elements.templatesList.querySelectorAll('.template-item:not(.collapsed)'));
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
    elements.addTemplateHeadingBtn.addEventListener('click', addTemplateHeading);

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
