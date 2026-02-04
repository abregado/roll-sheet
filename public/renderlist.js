(function() {
  'use strict';

  const TYPE_ORDER = ['heading', 'attribute', 'rollTemplate', 'resource'];
  const TYPE_RANK = TYPE_ORDER.reduce((acc, type, index) => {
    acc[type] = index;
    return acc;
  }, {});

  function buildUnifiedList(sheet) {
    const unified = [];

    (sheet.headings || []).forEach((item) => unified.push({ kind: 'heading', item }));
    (sheet.attributes || []).forEach((item) => unified.push({ kind: 'attribute', item }));
    (sheet.rollTemplates || []).forEach((item) => unified.push({ kind: 'rollTemplate', item }));
    (sheet.resources || []).forEach((item) => unified.push({ kind: 'resource', item }));

    unified.sort((a, b) => {
      if (a.item.sort !== b.item.sort) {
        return a.item.sort - b.item.sort;
      }
      return (TYPE_RANK[a.kind] ?? 0) - (TYPE_RANK[b.kind] ?? 0);
    });

    return unified;
  }

  window.renderList = {
    buildUnifiedList,
    typeOrder: TYPE_ORDER.slice(),
  };
})();
