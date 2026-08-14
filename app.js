const LEGACY_STORAGE_KEY = 'spoon-operation-manual-data-v1';
const LEGACY_OPEN_KEY = 'spoon-operation-manual-open-blocks-v1';
const ACTIVE_TAB_KEY = 'spoon-handbook-active-tab-v1';
const TAB_ORDER_KEY = 'spoon-handbook-tab-order-v1';
const DEFAULT_TAB_ORDER = ['codi', 'coach', '2f', 'b1'];
const TABS = {
  codi: {
    id: 'codi',
    label: '코디',
    storageKey: 'spoon-handbook-codi-data-v1',
    openKey: 'spoon-handbook-codi-open-v1'
  },
  coach: {
    id: 'coach',
    label: '코치',
    storageKey: 'spoon-handbook-coach-data-v1',
    openKey: 'spoon-handbook-coach-open-v1'
  },
  '2f': {
    id: '2f',
    label: '2F',
    storageKey: 'spoon-handbook-2f-data-v1',
    openKey: 'spoon-handbook-2f-open-v1'
  },
  b1: {
    id: 'b1',
    label: 'B1',
    storageKey: 'spoon-handbook-b1-data-v1',
    openKey: 'spoon-handbook-b1-open-v1'
  }
};

function loadTabOrder() {
  try {
    const parsed = JSON.parse(localStorage.getItem(TAB_ORDER_KEY) || 'null');
    if (Array.isArray(parsed)) {
      const valid = parsed.filter(id => TABS[id]);
      DEFAULT_TAB_ORDER.forEach(id => {
        if (!valid.includes(id)) valid.push(id);
      });
      return [...new Set(valid)];
    }
  } catch {
    /* ignore */
  }
  return [...DEFAULT_TAB_ORDER];
}

let tabOrder = loadTabOrder();
let activeTab = TABS[tabOrder[0]] ? tabOrder[0] : 'codi';
localStorage.setItem(ACTIVE_TAB_KEY, activeTab);
let manualData = null;
let editMode = false;
let openBlocks = new Set();
let dragSourceId = '';
let dragSourceKind = '';
let suppressRoleTabClick = false;

const root = document.getElementById('manualRoot');
const searchInput = document.getElementById('searchInput');
const announceInput = document.getElementById('announceInput');
const announceBox = document.getElementById('announceBox');
const ANNOUNCE_KEY = 'spoon-handbook-announce-v1';
const memoInput = document.getElementById('memoInput');
const memoSaveHint = document.getElementById('memoSaveHint');
const memoFontDown = document.getElementById('memoFontDown');
const memoFontUp = document.getElementById('memoFontUp');
const memoFontSizeLabel = document.getElementById('memoFontSizeLabel');
const MEMO_FONT_KEY = 'spoon-handbook-memo-font-size-v1';
const MEMO_FONT_SIZES = [12, 14, 16, 18, 20, 22, 24];
const DEFAULT_MEMO_FONT_SIZE = 14;
const quickCopyList = document.getElementById('quickCopyList');
const quickCopyTitleInput = document.getElementById('quickCopyTitleInput');
const quickCopyInput = document.getElementById('quickCopyInput');
const quickCopyAddBtn = document.getElementById('quickCopyAddBtn');
const imageDriveInput = document.getElementById('imageDriveInput');
const imageDriveOpenBtn = document.getElementById('imageDriveOpenBtn');
const editToggle = document.getElementById('editToggle');
const addWorkBtn = document.getElementById('addWorkBtn');
const exportBtn = document.getElementById('exportBtn');
const importInput = document.getElementById('importInput');
const resetBtn = document.getElementById('resetBtn');
const toast = document.getElementById('toast');
const SECTOR_COLORS = ['#c9b089', '#b89f78', '#a89068', '#9a825c', '#8c7450', '#7e6846'];

const taskDialog = document.getElementById('taskDialog');
const taskForm = document.getElementById('taskForm');
const cancelTaskBtn = document.getElementById('cancelTaskBtn');
const timeDialog = document.getElementById('timeDialog');
const timeForm = document.getElementById('timeForm');
const cancelTimeBtn = document.getElementById('cancelTimeBtn');
const cloudUserBar = document.getElementById('cloudUserBar');
const cloudUserEmail = document.getElementById('cloudUserEmail');
const authGate = document.getElementById('authGate');
const authError = document.getElementById('authError');
const googleSignInBtn = document.getElementById('googleSignInBtn');
let applyingRemote = false;
let appStarted = false;
function emptyManualData() {
  return {
    version: '1.0.0',
    updatedAt: new Date().toISOString().slice(0, 10),
    title: 'SPOON TEAM HANDBOOK',
    description: '',
    role: activeTab,
    memo: '',
    quickCopies: [],
    imageDriveUrl: '',
    workCategories: [],
    updatedAtMs: 0,
    updatedBy: ''
  };
}

function normalizeBlockList(list) {
  if (!Array.isArray(list)) return [];
  list.forEach(block => {
    if (!Array.isArray(block.tasks)) block.tasks = [];
  });
  return list;
}

function normalizeWorkCategories(data) {
  const fromCategories = Array.isArray(data.workCategories)
    ? data.workCategories
      .filter(item => item && typeof item === 'object')
      .map(item => ({
        id: item.id || uid('work'),
        name: String(item.name || '').trim() || '새 업무',
        items: normalizeBlockList(item.items || [])
      }))
    : [];
  if (fromCategories.length) return fromCategories;

  const categories = [];
  const timeBlocks = normalizeBlockList(data.timeBlocks);
  const ongoingBlocks = normalizeBlockList(data.ongoingBlocks);
  if (timeBlocks.length) {
    categories.push({ id: uid('work'), name: '시간순 업무', items: timeBlocks });
  }
  if (ongoingBlocks.length) {
    categories.push({ id: uid('work'), name: '상시 업무', items: ongoingBlocks });
  }
  return categories;
}

function normalizeManualData(data) {
  const next = data && typeof data === 'object' ? data : emptyManualData();
  next.workCategories = normalizeWorkCategories(next);
  next.timeBlocks = [];
  next.ongoingBlocks = [];
  if (typeof next.memo !== 'string') next.memo = '';
  if (!Array.isArray(next.quickCopies)) next.quickCopies = [];
  next.quickCopies = next.quickCopies
    .map(item => {
      if (typeof item === 'string') {
        return { id: uid('copy'), title: item.slice(0, 20), text: item };
      }
      if (!item || typeof item !== 'object') return null;
      const text = String(item.text || '').trim();
      const title = String(item.title || '').trim() || text.slice(0, 20) || '문구';
      return {
        id: item.id || uid('copy'),
        title,
        text
      };
    })
    .filter(item => item && item.text);
  delete next.contentWorks;
  if (typeof next.imageDriveUrl !== 'string') next.imageDriveUrl = '';
  if (!next.title || String(next.title).includes('인수인계')) {
    next.title = 'SPOON TEAM HANDBOOK';
  }
  next.role = activeTab;
  return next;
}

function loadMemoFontSize() {
  const raw = Number(localStorage.getItem(MEMO_FONT_KEY));
  return MEMO_FONT_SIZES.includes(raw) ? raw : DEFAULT_MEMO_FONT_SIZE;
}

function applyMemoFontSize(size) {
  const next = MEMO_FONT_SIZES.includes(size) ? size : DEFAULT_MEMO_FONT_SIZE;
  localStorage.setItem(MEMO_FONT_KEY, String(next));
  if (memoInput) memoInput.style.setProperty('--memo-font-size', `${next}px`);
  if (memoFontSizeLabel) memoFontSizeLabel.textContent = String(next);
  if (memoFontDown) memoFontDown.disabled = next <= MEMO_FONT_SIZES[0];
  if (memoFontUp) memoFontUp.disabled = next >= MEMO_FONT_SIZES[MEMO_FONT_SIZES.length - 1];
  fitTextarea(memoInput);
}

function changeMemoFontSize(step) {
  const current = loadMemoFontSize();
  const index = MEMO_FONT_SIZES.indexOf(current);
  const next = MEMO_FONT_SIZES[Math.max(0, Math.min(MEMO_FONT_SIZES.length - 1, index + step))];
  applyMemoFontSize(next);
}

function fitTextarea(el) {
  if (!el) return;
  el.style.height = 'auto';
  const min = Number.parseFloat(getComputedStyle(el).minHeight) || 0;
  el.style.height = `${Math.max(el.scrollHeight, min)}px`;
}

function fitVisibleTextareas() {
  requestAnimationFrame(() => {
    fitTextarea(memoInput);
    document.querySelectorAll('.time-block.open .inline-field textarea').forEach(fitTextarea);
  });
}

function syncMemoUI() {
  if (!memoInput) return;
  memoInput.value = manualData?.memo || '';
  if (memoSaveHint) memoSaveHint.textContent = '자동 저장';
  applyMemoFontSize(loadMemoFontSize());
}

function syncImageDriveUI() {
  if (!imageDriveInput) return;
  imageDriveInput.value = manualData?.imageDriveUrl || '';
}

function openImageDrive() {
  const url = (manualData?.imageDriveUrl || imageDriveInput?.value || '').trim();
  if (!url) {
    alert('구글 드라이브 링크를 먼저 입력해 주세요.');
    imageDriveInput?.focus();
    return;
  }
  try {
    const parsed = new URL(url);
    if (!/^https?:$/.test(parsed.protocol)) throw new Error('invalid');
  } catch {
    alert('올바른 링크 형식이 아닙니다.');
    imageDriveInput?.focus();
    return;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

function renderQuickCopies() {
  if (!quickCopyList || !manualData) return;
  const items = manualData.quickCopies || [];
  if (!items.length) {
    quickCopyList.innerHTML = '<p class="empty-inline quick-copy-empty">등록된 문구가 없습니다.</p>';
    return;
  }
  quickCopyList.innerHTML = items.map(item => `
    <article class="quick-copy-item is-collapsed" data-copy-id="${escapeAttr(item.id)}">
      <div class="quick-copy-top">
        <span class="drag-handle" title="드래그해서 순서 변경" aria-hidden="true">⋮⋮</span>
        <button type="button" class="quick-copy-toggle" data-action="toggle-quick" aria-expanded="false">
          <span class="quick-copy-chevron" aria-hidden="true"></span>
          <h3 class="quick-copy-title">${escapeHtml(item.title || '문구')}</h3>
        </button>
        <button type="button" class="quick-copy-btn" data-action="copy-quick">복사하기</button>
      </div>
      <div class="quick-copy-body">
        <p class="quick-copy-text">${escapeHtml(item.text)}</p>
        <div class="quick-copy-actions">
          <button type="button" data-action="delete-quick" class="danger-lite">삭제</button>
        </div>
      </div>
    </article>
  `).join('');

  quickCopyList.querySelectorAll('.quick-copy-item').forEach(row => {
    const id = row.dataset.copyId;
    bindQuickCopyDrag(row, id);
    row.querySelector('[data-action="toggle-quick"]')?.addEventListener('click', () => {
      const collapsed = row.classList.toggle('is-collapsed');
      const toggleBtn = row.querySelector('[data-action="toggle-quick"]');
      if (toggleBtn) toggleBtn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    });
    row.querySelector('[data-action="copy-quick"]')?.addEventListener('click', async () => {
      const item = manualData.quickCopies.find(entry => entry.id === id);
      if (!item) return;
      try {
        await navigator.clipboard.writeText(item.text);
        showToast('내용을 복사했습니다.');
      } catch {
        showToast('복사 실패: 직접 선택해서 복사하세요.');
      }
    });
    row.querySelector('[data-action="delete-quick"]')?.addEventListener('click', () => {
      manualData.quickCopies = manualData.quickCopies.filter(entry => entry.id !== id);
      saveLocal();
      renderQuickCopies();
      showToast('문구를 삭제했습니다.');
    });
  });
}

function moveQuickCopy(fromId, toId, placeAfter) {
  if (!fromId || !toId || fromId === toId) return false;
  const items = manualData.quickCopies || [];
  const fromIndex = items.findIndex(item => item.id === fromId);
  if (fromIndex < 0) return false;
  const [moved] = items.splice(fromIndex, 1);
  let toIndex = items.findIndex(item => item.id === toId);
  if (toIndex < 0) {
    items.push(moved);
  } else {
    if (placeAfter) toIndex += 1;
    items.splice(toIndex, 0, moved);
  }
  manualData.quickCopies = items;
  saveLocal();
  renderQuickCopies();
  return true;
}

function getQuickCopyDropGuide() {
  if (!quickCopyList) return null;
  let guide = quickCopyList.querySelector('.quick-copy-drop-guide');
  if (!guide) {
    guide = document.createElement('div');
    guide.className = 'quick-copy-drop-guide';
    guide.setAttribute('aria-hidden', 'true');
    quickCopyList.appendChild(guide);
  }
  return guide;
}

function showQuickCopyDropGuide(card, placeAfter) {
  const guide = getQuickCopyDropGuide();
  if (!guide || !quickCopyList) return;
  const listRect = quickCopyList.getBoundingClientRect();
  const cardRect = card.getBoundingClientRect();
  const gap = 8;
  const top = cardRect.top - listRect.top + quickCopyList.scrollTop;
  const left = placeAfter
    ? cardRect.right - listRect.left + quickCopyList.scrollLeft + gap / 2
    : cardRect.left - listRect.left + quickCopyList.scrollLeft - gap / 2;
  guide.style.top = `${top}px`;
  guide.style.left = `${left}px`;
  guide.style.height = `${cardRect.height}px`;
  guide.classList.add('is-visible');
}

function hideQuickCopyDropGuide() {
  const guide = quickCopyList?.querySelector('.quick-copy-drop-guide');
  if (!guide) return;
  guide.classList.remove('is-visible');
}

function bindQuickCopyDrag(card, copyId) {
  const handle = card.querySelector('.drag-handle');
  if (!handle) return;
  const kind = 'quick-copy';

  handle.draggable = true;
  handle.addEventListener('dragstart', event => {
    dragSourceId = copyId;
    dragSourceKind = kind;
    card.classList.add('is-dragging');
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', copyId);
    event.dataTransfer.setData('application/x-copy-id', copyId);
    try {
      event.dataTransfer.setDragImage(card, 24, 20);
    } catch {
      /* ignore unsupported browsers */
    }
  });

  handle.addEventListener('dragend', () => {
    dragSourceId = '';
    dragSourceKind = '';
    clearDragIndicators();
  });

  const placeAfterPoint = event => {
    const rect = card.getBoundingClientRect();
    return event.clientX > rect.left + rect.width / 2;
  };

  card.addEventListener('dragover', event => {
    if (!dragSourceId || dragSourceKind !== kind || dragSourceId === copyId) {
      if (dragSourceId === copyId) hideQuickCopyDropGuide();
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'move';
    showQuickCopyDropGuide(card, placeAfterPoint(event));
  });

  card.addEventListener('drop', event => {
    event.preventDefault();
    event.stopPropagation();
    if (dragSourceKind && dragSourceKind !== kind) {
      clearDragIndicators();
      dragSourceId = '';
      dragSourceKind = '';
      return;
    }
    const fromId = dragSourceId
      || event.dataTransfer.getData('application/x-copy-id')
      || event.dataTransfer.getData('text/plain');
    const placeAfter = placeAfterPoint(event);
    clearDragIndicators();
    const moved = moveQuickCopy(fromId, copyId, placeAfter);
    dragSourceId = '';
    dragSourceKind = '';
    if (moved) showToast('순서를 변경했습니다.');
  });

  card.addEventListener('dragleave', event => {
    if (card.contains(event.relatedTarget)) return;
    hideQuickCopyDropGuide();
  });
}

function addQuickCopy() {
  const title = quickCopyTitleInput?.value.trim();
  const text = quickCopyInput?.value.trim();
  if (!title) {
    alert('타이틀을 입력해 주세요.');
    quickCopyTitleInput?.focus();
    return;
  }
  if (!text) {
    alert('내용을 입력해 주세요.');
    quickCopyInput?.focus();
    return;
  }
  if (!Array.isArray(manualData.quickCopies)) manualData.quickCopies = [];
  manualData.quickCopies.push({ id: uid('copy'), title, text });
  if (quickCopyTitleInput) quickCopyTitleInput.value = '';
  if (quickCopyInput) quickCopyInput.value = '';
  saveLocal();
  renderQuickCopies();
  showToast('문구를 추가했습니다.');
  quickCopyTitleInput?.focus();
}

function getCategories() {
  if (!Array.isArray(manualData.workCategories)) manualData.workCategories = [];
  return manualData.workCategories;
}

function getCategory(categoryId) {
  return getCategories().find(item => item.id === categoryId) || null;
}

function getBlocks(categoryId) {
  const category = getCategory(categoryId);
  if (!category) return [];
  if (!Array.isArray(category.items)) category.items = [];
  return category.items;
}

function findBlock(blockId) {
  for (const category of getCategories()) {
    const block = (category.items || []).find(item => item.id === blockId);
    if (block) return { block, category, categoryId: category.id };
  }
  return null;
}

function hasTimeLabel(block) {
  return /(\d{1,2}:\d{2})\s*[-~–—]\s*(\d{1,2}:\d{2})/.test(String(block?.label || ''));
}

function currentTab() {
  return TABS[activeTab] || TABS.codi;
}

function loadOpenBlocks() {
  try {
    const tab = currentTab();
    let raw = localStorage.getItem(tab.openKey);
    if (!raw && tab.id === 'codi') raw = localStorage.getItem(LEGACY_OPEN_KEY);
    openBlocks = new Set(JSON.parse(raw || '[]'));
  } catch {
    openBlocks = new Set();
  }
}

async function loadTabDataLocal(tabId, { useDefaultJson = false } = {}) {
  const tab = TABS[tabId];
  const saved = localStorage.getItem(tab.storageKey);
  if (saved) {
    manualData = normalizeManualData(JSON.parse(saved));
  } else if (tabId === 'codi' && useDefaultJson) {
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacy) {
      manualData = normalizeManualData(JSON.parse(legacy));
      localStorage.setItem(tab.storageKey, JSON.stringify(manualData));
    } else {
      try {
        const response = await fetch('data.json');
        if (!response.ok) throw new Error('data.json load failed');
        manualData = normalizeManualData(await response.json());
        localStorage.setItem(tab.storageKey, JSON.stringify(manualData));
      } catch (error) {
        console.error(error);
        manualData = emptyManualData();
      }
    }
  } else {
    manualData = emptyManualData();
    localStorage.setItem(tab.storageKey, JSON.stringify(manualData));
  }
}

async function loadTabData(tabId, { useDefaultJson = false } = {}) {
  window.HandbookCloud?.stopWatch?.();
  activeTab = tabId;
  const tab = TABS[tabId];

  if (isCloudReady()) {
    try {
      const remote = await HandbookCloud.loadTab(tabId);
      if (remote) {
        manualData = normalizeManualData(remote);
        localStorage.setItem(tab.storageKey, JSON.stringify(manualData));
      } else {
        await loadTabDataLocal(tabId, { useDefaultJson });
        if (manualData) await HandbookCloud.saveTabNow(tabId, manualData);
      }
    } catch (error) {
      console.error(error);
      await loadTabDataLocal(tabId, { useDefaultJson });
      showToast('클라우드 불러오기 실패 · 로컬 데이터를 엽니다.');
    }
    loadOpenBlocks();
    watchCurrentTab();
    return;
  }

  await loadTabDataLocal(tabId, { useDefaultJson });
  loadOpenBlocks();
}

function saveTabOrder(order) {
  tabOrder = order.filter(id => TABS[id]);
  DEFAULT_TAB_ORDER.forEach(id => {
    if (!tabOrder.includes(id)) tabOrder.push(id);
  });
  localStorage.setItem(TAB_ORDER_KEY, JSON.stringify(tabOrder));
  localStorage.setItem(ACTIVE_TAB_KEY, tabOrder[0]);
}

function applyTabOrder() {
  const nav = document.querySelector('.role-tabs');
  if (!nav) return;
  tabOrder.forEach(id => {
    const button = nav.querySelector(`.role-tab[data-tab="${id}"]`);
    if (button) nav.appendChild(button);
  });
}

function clearRoleTabDragIndicators() {
  document.querySelectorAll('.role-tab').forEach(el => {
    el.classList.remove('is-dragging', 'drag-over-before', 'drag-over-after');
  });
  hideRoleTabDropGuide();
}

function getRoleTabDropGuide() {
  const nav = document.querySelector('.role-tabs');
  if (!nav) return null;
  let guide = nav.querySelector('.role-tab-drop-guide');
  if (!guide) {
    guide = document.createElement('div');
    guide.className = 'role-tab-drop-guide';
    guide.setAttribute('aria-hidden', 'true');
    nav.appendChild(guide);
  }
  return guide;
}

function showRoleTabDropGuide(button, placeAfter) {
  const nav = document.querySelector('.role-tabs');
  const guide = getRoleTabDropGuide();
  if (!nav || !guide) return;
  const navRect = nav.getBoundingClientRect();
  const buttonRect = button.getBoundingClientRect();
  const gap = 8;
  const top = buttonRect.top - navRect.top + nav.scrollTop;
  const left = placeAfter
    ? buttonRect.right - navRect.left + nav.scrollLeft + gap / 2
    : buttonRect.left - navRect.left + nav.scrollLeft - gap / 2;
  guide.style.top = `${top}px`;
  guide.style.left = `${left}px`;
  guide.style.height = `${buttonRect.height}px`;
  guide.classList.add('is-visible');
}

function hideRoleTabDropGuide() {
  const guide = document.querySelector('.role-tab-drop-guide');
  if (!guide) return;
  guide.classList.remove('is-visible');
}

function bindRoleTabDrag() {
  const nav = document.querySelector('.role-tabs');
  if (!nav) return;

  nav.querySelectorAll('.role-tab').forEach(button => {
    button.draggable = true;

    button.addEventListener('dragstart', event => {
      dragSourceId = button.dataset.tab;
      dragSourceKind = 'role-tab';
      suppressRoleTabClick = true;
      button.classList.add('is-dragging');
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', dragSourceId);
      try {
        event.dataTransfer.setDragImage(button, 24, 20);
      } catch {
        /* ignore */
      }
    });

    button.addEventListener('dragend', () => {
      dragSourceId = '';
      dragSourceKind = '';
      clearRoleTabDragIndicators();
      setTimeout(() => {
        suppressRoleTabClick = false;
      }, 0);
    });

    button.addEventListener('dragover', event => {
      if (dragSourceKind !== 'role-tab' || !dragSourceId || dragSourceId === button.dataset.tab) {
        if (dragSourceId === button.dataset.tab) hideRoleTabDropGuide();
        return;
      }
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      const rect = button.getBoundingClientRect();
      const placeAfter = event.clientX > rect.left + rect.width / 2;
      showRoleTabDropGuide(button, placeAfter);
    });

    button.addEventListener('dragleave', event => {
      if (button.contains(event.relatedTarget)) return;
      hideRoleTabDropGuide();
    });

    button.addEventListener('drop', event => {
      event.preventDefault();
      if (dragSourceKind !== 'role-tab') return;
      const fromId = dragSourceId || event.dataTransfer.getData('text/plain');
      const toId = button.dataset.tab;
      if (!fromId || !toId || fromId === toId || !TABS[fromId] || !TABS[toId]) {
        clearRoleTabDragIndicators();
        return;
      }
      const rect = button.getBoundingClientRect();
      const placeAfter = event.clientX > rect.left + rect.width / 2;
      const next = [...tabOrder];
      const fromIndex = next.indexOf(fromId);
      if (fromIndex < 0) return;
      next.splice(fromIndex, 1);
      let toIndex = next.indexOf(toId);
      if (toIndex < 0) toIndex = next.length;
      else if (placeAfter) toIndex += 1;
      next.splice(toIndex, 0, fromId);
      saveTabOrder(next);
      applyTabOrder();
      clearRoleTabDragIndicators();
      updateTabUI();
      showToast(`탭 순서 변경 · 시작 탭: ${TABS[tabOrder[0]].label}`);
    });

    button.addEventListener('click', () => {
      if (suppressRoleTabClick) return;
      switchTab(button.dataset.tab);
    });
  });
}

function updateTabUI() {
  document.querySelectorAll('.role-tab').forEach(button => {
    button.classList.toggle('is-active', button.dataset.tab === activeTab);
  });
  document.body.dataset.role = activeTab;
}

async function switchTab(tabId) {
  if (!TABS[tabId] || tabId === activeTab) return;
  saveLocal();
  saveOpenState();
  if (window.HandbookCloud?.flushSave) await HandbookCloud.flushSave();
  searchInput.value = '';
  localStorage.setItem(ACTIVE_TAB_KEY, tabId);
  await loadTabData(tabId);
  updateTabUI();
  syncMemoUI();
  syncImageDriveUI();
  renderQuickCopies();
  render();
  showToast(`${TABS[tabId].label} 탭으로 이동했습니다.`);
}

function isCloudReady() {
  return Boolean(window.HandbookCloud?.isEnabled() && HandbookCloud.currentUser());
}

function showAuthGate(visible, message = '') {
  if (!authGate) return;
  authGate.hidden = !visible;
  if (authError) {
    authError.hidden = !message;
    authError.textContent = message || '';
  }
}

function updateCloudUserBar(user) {
  if (!cloudUserBar) return;
  cloudUserBar.hidden = !user;
  if (cloudUserEmail) cloudUserEmail.textContent = user?.email || '';
}

function applyRemoteTabData(data) {
  if (!data) return;
  const next = normalizeManualData(data);
  try {
    if (JSON.stringify(next) === JSON.stringify(manualData)) return;
  } catch {
    /* ignore */
  }
  applyingRemote = true;
  manualData = next;
  localStorage.setItem(currentTab().storageKey, JSON.stringify(manualData));
  syncMemoUI();
  syncImageDriveUI();
  renderQuickCopies();
  render();
  applyingRemote = false;
}

function watchCurrentTab() {
  if (!isCloudReady()) return;
  HandbookCloud.subscribeTab(activeTab, data => {
    applyRemoteTabData(data);
  });
}

function updateAnnounceUI(text, { flash = false } = {}) {
  const next = String(text || '');
  const typing = document.activeElement === announceInput;
  if (announceInput && !typing) announceInput.value = next;
  const visible = Boolean((typing ? announceInput.value : next).trim());
  announceBox?.classList.toggle('has-text', visible);
  if (flash && visible && !typing && announceBox) {
    announceBox.classList.remove('is-fresh');
    void announceBox.offsetWidth;
    announceBox.classList.add('is-fresh');
    setTimeout(() => announceBox.classList.remove('is-fresh'), 4000);
  }
}

async function loadAnnounce() {
  let text = '';
  try {
    text = localStorage.getItem(ANNOUNCE_KEY) || '';
  } catch {
    text = '';
  }
  if (isCloudReady()) {
    try {
      const remote = await HandbookCloud.loadAnnounce();
      if (typeof remote === 'string') text = remote;
    } catch (error) {
      console.error(error);
    }
  }
  if (announceInput) announceInput.value = text;
  updateAnnounceUI(text);
}

function saveAnnounce(text) {
  const next = String(text || '');
  try {
    localStorage.setItem(ANNOUNCE_KEY, next);
  } catch {
    /* ignore */
  }
  updateAnnounceUI(next);
  if (isCloudReady()) HandbookCloud.scheduleAnnounceSave(next);
}

function watchAnnounce() {
  if (!isCloudReady()) return;
  HandbookCloud.subscribeAnnounce(text => {
    try {
      localStorage.setItem(ANNOUNCE_KEY, text);
    } catch {
      /* ignore */
    }
    updateAnnounceUI(text, { flash: true });
  });
}

async function startApp() {
  await loadTabData(activeTab, { useDefaultJson: true });
  await loadAnnounce();
  watchAnnounce();
  updateTabUI();
  syncMemoUI();
  syncImageDriveUI();
  renderQuickCopies();
  render();
}

async function boot() {
  applyTabOrder();
  bindRoleTabDrag();
  googleSignInBtn?.addEventListener('click', async () => {
    try {
      showAuthGate(true, '');
      await HandbookCloud.signIn();
    } catch (error) {
      const message = error?.code === 'auth/popup-closed-by-user'
        ? '로그인이 취소되었습니다.'
        : (error?.message || '로그인에 실패했습니다.');
      showAuthGate(true, message);
    }
  });

  if (window.HandbookCloud?.isEnabled()) {
    HandbookCloud.init();
    showAuthGate(true);
    HandbookCloud.onAuth(async user => {
      if (!user) {
        appStarted = false;
        updateCloudUserBar(null);
        showAuthGate(true);
        return;
      }
      if (!HandbookCloud.isAllowed(user.email)) {
        showAuthGate(true, '허용된 팀 계정이 아닙니다.');
        await HandbookCloud.signOut();
        return;
      }
      showAuthGate(false);
      updateCloudUserBar(user);
      if (appStarted) return;
      appStarted = true;
      await startApp();
    });
    return;
  }

  if (cloudUserBar) cloudUserBar.hidden = true;
  await startApp();
}

function uid(prefix = 'id') {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function saveLocal() {
  if (!manualData) return;
  manualData.updatedAt = new Date().toISOString().slice(0, 10);
  manualData.updatedAtMs = Date.now();
  manualData.role = activeTab;
  localStorage.setItem(currentTab().storageKey, JSON.stringify(manualData));
  if (applyingRemote) return;
  if (isCloudReady()) HandbookCloud.scheduleSave(activeTab, manualData);
}

function saveOpenState() {
  localStorage.setItem(currentTab().openKey, JSON.stringify([...openBlocks]));
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 1600);
}

function matchesSearch(task, block, keyword) {
  if (!keyword) return true;
  const bundle = [
    block.label,
    block.summary,
    task.title,
    task.owner,
    task.description,
    task.notes,
    ...(task.checklist || []).map(item => item.text),
    ...(task.phrases || []),
    ...(task.links || []).map(link => `${link.label} ${link.url}`)
  ].join(' ').toLowerCase();
  return bundle.includes(keyword.toLowerCase());
}

function minutesToClockAngle(minutes) {
  return (minutes % (12 * 60)) * 0.5;
}

function polarPoint(cx, cy, radius, angleDeg) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(rad),
    y: cy + radius * Math.sin(rad)
  };
}

function sectorPath(cx, cy, radius, startMin, endMin) {
  let startAngle = minutesToClockAngle(startMin);
  let endAngle = minutesToClockAngle(endMin);
  let sweep = endAngle - startAngle;
  if (sweep <= 0) sweep += 360;
  const start = polarPoint(cx, cy, radius, startAngle);
  const end = polarPoint(cx, cy, radius, endAngle);
  const largeArc = sweep > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y} Z`;
}

function sectorColor(index) {
  return SECTOR_COLORS[index % SECTOR_COLORS.length];
}

function clockFaceMarks(cx, cy, radius) {
  const ticks = [];
  for (let hour = 0; hour < 12; hour += 1) {
    const angle = hour * 30;
    const outer = polarPoint(cx, cy, radius - 2, angle);
    const inner = polarPoint(cx, cy, radius - (hour % 3 === 0 ? 10 : 6), angle);
    ticks.push(`<line x1="${inner.x}" y1="${inner.y}" x2="${outer.x}" y2="${outer.y}" />`);
  }
  const labels = [12, 3, 6, 9].map((hour, index) => {
    const point = polarPoint(cx, cy, radius - 18, index * 90);
    return `<text x="${point.x}" y="${point.y}" text-anchor="middle" dominant-baseline="middle">${hour}</text>`;
  });
  return `${ticks.join('')}${labels.join('')}`;
}

function renderAnalogClock({ size = 160, sectors = [], showLabels = true, className = '' } = {}) {
  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.42;
  const sectorSvg = sectors.map((sector, index) => {
    if (!(sector.endMin > sector.startMin)) return '';
    const color = sector.color || sectorColor(index);
    return `<path class="clock-sector" d="${sectorPath(cx, cy, radius, sector.startMin, sector.endMin)}" fill="${color}" opacity="1"><title>${escapeHtml(sector.label || '')}</title></path>`;
  }).join('');

  return `
    <svg class="analog-clock ${className}" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="아날로그 시간대">
      <circle class="clock-disk" cx="${cx}" cy="${cy}" r="${radius}" />
      <g class="clock-sectors">${sectorSvg}</g>
      <g class="clock-marks ${showLabels ? '' : 'is-compact'}">${clockFaceMarks(cx, cy, radius)}</g>
      <circle class="clock-hub" cx="${cx}" cy="${cy}" r="${Math.max(3, size * 0.03)}" />
    </svg>
  `;
}

function blockSector(block, index) {
  const { start, end } = parseTimeLabel(block.label);
  return {
    startMin: timeToMinutes(start),
    endMin: timeToMinutes(end),
    label: block.label,
    color: sectorColor(index),
    id: block.id
  };
}

function updateTimePreviewClock() {
  const preview = document.getElementById('timePreviewClock');
  if (!preview) return;
  const start = document.getElementById('timeStart').value || '10:00';
  const end = document.getElementById('timeEnd').value || '13:00';
  const startMin = timeToMinutes(start);
  const endMin = timeToMinutes(end);
  const valid = endMin > startMin;
  preview.innerHTML = `
    ${renderAnalogClock({
      size: 70,
      sectors: valid ? [{ startMin, endMin, label: `${start} - ${end}`, color: '#b89f78' }] : [],
      className: 'preview-clock-svg'
    })}
    <p class="preview-clock-label">${valid ? `${start} - ${end}` : '종료 시간을 더 늦게 선택하세요'}</p>
  `;
}

function ongoingIconSvg() {
  return `
    <svg class="ongoing-icon" viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M4 12a8 8 0 0 1 13.7-5.7" />
      <path d="M18 4v4h-4" />
      <path d="M20 12a8 8 0 0 1-13.7 5.7" />
      <path d="M6 20v-4h4" />
    </svg>
  `;
}

function formatDateValue(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function daysUntilDeadline(dateStr) {
  if (!dateStr) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

function formatDaysLeft(dateStr) {
  const days = daysUntilDeadline(dateStr);
  if (days === null) return '';
  if (days < 0) return `${Math.abs(days)} DAYS OVERDUE`;
  return `${days} DAYS LEFT`;
}

function renderDeadlineBadge(block) {
  const label = formatDaysLeft(block.deadline);
  if (!label) return '';
  const overdue = daysUntilDeadline(block.deadline) < 0;
  return `<span class="deadline-left ${overdue ? 'is-overdue' : ''}">${escapeHtml(label)}</span>`;
}

function calendarIconSvg() {
  return `
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
      <path d="M8 3.5v3M16 3.5v3M3.5 10h17" />
    </svg>
  `;
}

function closeDeadlinePopovers(exceptWrap = null) {
  document.querySelectorAll('.deadline-wrap.is-open').forEach(wrap => {
    if (wrap !== exceptWrap) wrap.classList.remove('is-open');
  });
}

function createDeadlineCalendar(block, onPicked) {
  const wrap = document.createElement('div');
  wrap.className = 'deadline-panel';
  const start = block.deadline ? new Date(`${block.deadline}T00:00:00`) : new Date();
  let viewYear = start.getFullYear();
  let viewMonth = start.getMonth();
  const weekdays = ['일', '월', '화', '수', '목', '금', '토'];

  const paint = () => {
    const first = new Date(viewYear, viewMonth, 1);
    const startWeekday = first.getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const today = formatDateValue(new Date());
    const cells = [];
    for (let i = 0; i < startWeekday; i += 1) cells.push('<span class="deadline-day is-empty"></span>');
    for (let day = 1; day <= daysInMonth; day += 1) {
      const value = formatDateValue(new Date(viewYear, viewMonth, day));
      const selected = value === block.deadline ? ' is-selected' : '';
      const isToday = value === today ? ' is-today' : '';
      cells.push(`<button type="button" class="deadline-day${selected}${isToday}" data-date="${value}">${day}</button>`);
    }
    wrap.innerHTML = `
      <div class="deadline-head">
        <span class="deadline-label">마감 일정</span>
        ${block.deadline ? `<button type="button" class="deadline-clear">지우기</button>` : ''}
      </div>
      <div class="deadline-nav">
        <button type="button" class="deadline-nav-btn" data-dir="-1" aria-label="이전 달">‹</button>
        <strong>${viewYear}. ${viewMonth + 1}</strong>
        <button type="button" class="deadline-nav-btn" data-dir="1" aria-label="다음 달">›</button>
      </div>
      <div class="deadline-week">${weekdays.map(name => `<span>${name}</span>`).join('')}</div>
      <div class="deadline-grid">${cells.join('')}</div>
    `;
    wrap.querySelectorAll('.deadline-nav-btn').forEach(button => {
      button.addEventListener('click', event => {
        event.stopPropagation();
        viewMonth += Number(button.dataset.dir);
        if (viewMonth < 0) {
          viewMonth = 11;
          viewYear -= 1;
        } else if (viewMonth > 11) {
          viewMonth = 0;
          viewYear += 1;
        }
        paint();
      });
    });
    wrap.querySelector('.deadline-clear')?.addEventListener('click', event => {
      event.stopPropagation();
      block.deadline = '';
      saveLocal();
      if (typeof onPicked === 'function') onPicked();
    });
    wrap.querySelectorAll('.deadline-day[data-date]').forEach(button => {
      button.addEventListener('click', event => {
        event.stopPropagation();
        block.deadline = button.dataset.date;
        saveLocal();
        if (typeof onPicked === 'function') onPicked();
      });
    });
  };
  paint();
  wrap.addEventListener('click', event => event.stopPropagation());
  return wrap;
}

function createWorkBlockElement(block, categoryId, blockIndex, keyword) {
  const visibleTasks = (block.tasks || []).filter(task => matchesSearch(task, block, keyword));
  if (keyword && visibleTasks.length === 0 && !(block.summary || '').toLowerCase().includes(keyword.toLowerCase()) && !(block.label || '').toLowerCase().includes(keyword.toLowerCase())) {
    return null;
  }

  const section = document.createElement('section');
  const isOpen = openBlocks.has(block.id) || Boolean(keyword);
  const isTime = hasTimeLabel(block);
  section.className = `time-block ${isTime ? '' : 'ongoing-block'} ${isOpen ? 'open' : ''}`;
  section.dataset.timeId = block.id;
  section.dataset.categoryId = categoryId;

  const sector = isTime ? blockSector(block, blockIndex) : null;
  const collapsedLinks = collectBlockLinks(block);
  const header = document.createElement('div');
  header.className = 'time-header';
  header.innerHTML = `
    <div class="time-header-main">
      <span class="drag-handle" title="드래그해서 순서 변경" aria-hidden="true">⋮⋮</span>
      <span class="mini-clock-wrap" aria-hidden="true">
        ${isTime
    ? renderAnalogClock({ size: 36, sectors: [sector], showLabels: false, className: 'mini-clock-svg' })
    : ongoingIconSvg()}
      </span>
      <span class="time-title ${block.done ? 'is-done' : ''}">
        ${isTime ? `<strong class="time-label">${escapeHtml(block.label)}</strong>` : ''}
        <span class="title-check-group">
          <span class="inline-summary" contenteditable="true" role="textbox" aria-label="타이틀" data-placeholder="타이틀 입력">${escapeHtml(block.summary || '')}</span>
          <label class="time-done-check" title="완료">
            <input type="checkbox" class="time-done-input" ${block.done ? 'checked' : ''} />
          </label>
          ${renderDeadlineBadge(block)}
          ${block.hasLeaveCheck ? `
          <label class="time-leave-check">
            <span class="time-leave-label">퇴근전 한번더</span>
            <input type="checkbox" class="time-leave-input" ${block.leaveRecheck ? 'checked' : ''} aria-label="퇴근전 한번더" />
          </label>
          <button type="button" class="time-leave-remove" title="퇴근전 한번더 체크 제거">-</button>
          ` : `
          <button type="button" class="time-leave-add" title="퇴근전 한번더 체크 추가">+</button>
          `}
        </span>
      </span>
    </div>
    ${renderCollapsedLinkIcons(collapsedLinks)}
    <div class="deadline-wrap">
      <button type="button" class="deadline-icon-btn ${block.deadline ? 'has-date' : ''}" aria-label="마감 일정">${calendarIconSvg()}</button>
    </div>
    <button class="time-toggle" type="button">${isOpen ? '접기' : '펴기'}</button>
  `;

  const summaryInput = header.querySelector('.inline-summary');
  const saveSummary = () => {
    const next = summaryInput.textContent.replace(/\u00a0/g, ' ').trim();
    block.summary = next;
    summaryInput.classList.toggle('is-empty', !next);
    saveLocal();
  };
  summaryInput.classList.toggle('is-empty', !block.summary);
  summaryInput.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      summaryInput.blur();
    }
  });
  summaryInput.addEventListener('blur', saveSummary);
  summaryInput.addEventListener('input', () => {
    summaryInput.classList.toggle('is-empty', !summaryInput.textContent.trim());
  });
  header.querySelector('.time-done-input').addEventListener('change', event => {
    block.done = event.target.checked;
    header.querySelector('.time-title').classList.toggle('is-done', block.done);
    saveLocal();
  });
  header.querySelector('.time-leave-input')?.addEventListener('change', event => {
    block.leaveRecheck = event.target.checked;
    saveLocal();
  });
  header.querySelector('.time-leave-add')?.addEventListener('click', event => {
    event.stopPropagation();
    block.hasLeaveCheck = true;
    block.leaveRecheck = false;
    saveLocal();
    render();
  });
  header.querySelector('.time-leave-remove')?.addEventListener('click', event => {
    event.stopPropagation();
    block.hasLeaveCheck = false;
    block.leaveRecheck = false;
    saveLocal();
    render();
  });
  header.querySelectorAll('.collapsed-link-icon').forEach(link => {
    link.addEventListener('click', event => event.stopPropagation());
  });
  const deadlineWrap = header.querySelector('.deadline-wrap');
  const deadlineBtn = header.querySelector('.deadline-icon-btn');
  deadlineBtn?.addEventListener('click', event => {
    event.stopPropagation();
    const opening = !deadlineWrap.classList.contains('is-open');
    closeDeadlinePopovers();
    if (!opening) return;
    deadlineWrap.querySelector('.deadline-panel')?.remove();
    deadlineWrap.appendChild(createDeadlineCalendar(block, () => {
      closeDeadlinePopovers();
      render();
    }));
    deadlineWrap.classList.add('is-open');
  });
  header.querySelector('.time-toggle').addEventListener('click', () => {
    if (openBlocks.has(block.id)) openBlocks.delete(block.id);
    else openBlocks.add(block.id);
    saveOpenState();
    render();
  });

  const content = document.createElement('div');
  content.className = 'time-content';

  const editActions = document.createElement('div');
  editActions.className = 'time-edit-actions';
  editActions.innerHTML = `
    <button type="button" data-action="edit-time">수정</button>
    <button type="button" data-action="delete-time" class="danger-lite">삭제</button>
  `;
  editActions.querySelector('[data-action="edit-time"]').addEventListener('click', () => openWorkDialog('edit', categoryId, block.id));
  editActions.querySelector('[data-action="delete-time"]').addEventListener('click', () => deleteWorkBlock(block.id, categoryId));
  content.appendChild(editActions);

  if (visibleTasks.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = '등록된 상세 내용이 없습니다.';
    content.appendChild(empty);
  } else {
    visibleTasks.forEach(task => content.appendChild(renderTask(block.id, task)));
  }

  section.append(header, content);
  bindBlockDrag(section, block.id, categoryId);
  return { section, visibleCount: 1 };
}

function bindEditableText(element, getValue, setValue, placeholder = '') {
  const current = getValue() || '';
  element.classList.toggle('is-empty', !current);
  element.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      element.blur();
    }
  });
  element.addEventListener('input', () => {
    element.classList.toggle('is-empty', !element.textContent.trim());
  });
  element.addEventListener('blur', () => {
    const next = element.textContent.replace(/\u00a0/g, ' ').trim();
    setValue(next);
    const stored = getValue() || next;
    element.textContent = stored;
    element.classList.toggle('is-empty', !stored);
    if (placeholder) element.dataset.placeholder = placeholder;
    saveLocal();
  });
}

function addWorkCategory() {
  if (!manualData) return;
  const id = uid('work');
  getCategories().push({
    id,
    name: '새 업무',
    items: []
  });
  saveLocal();
  render();
  requestAnimationFrame(() => {
    const title = root.querySelector(`[data-category-id="${CSS.escape(id)}"] .work-group-title`);
    if (!title) return;
    title.focus();
    const range = document.createRange();
    range.selectNodeContents(title);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  });
  showToast('업무를 생성했습니다.');
}

function addWorkItem(categoryId) {
  const category = getCategory(categoryId);
  if (!category) return;
  if (!Array.isArray(category.items)) category.items = [];
  const id = uid('item');
  category.items.push({
    id,
    label: '',
    summary: '',
    done: false,
    hasLeaveCheck: false,
    leaveRecheck: false,
    deadline: '',
    tasks: [createEmptyTask('')]
  });
  openBlocks.add(id);
  saveOpenState();
  saveLocal();
  render();
  requestAnimationFrame(() => {
    const summary = root.querySelector(`[data-time-id="${CSS.escape(id)}"] .inline-summary`);
    summary?.focus();
  });
  showToast('카테고리를 추가했습니다.');
}

function deleteWorkCategory(categoryId) {
  const category = getCategory(categoryId);
  if (!category) return;
  if (!confirm(`‘${category.name || '업무'}’와 안의 내용을 모두 삭제할까요?`)) return;
  (category.items || []).forEach(item => openBlocks.delete(item.id));
  manualData.workCategories = getCategories().filter(item => item.id !== categoryId);
  saveOpenState();
  saveLocal();
  render();
  showToast('업무를 삭제했습니다.');
}

function renderWorkCategory(category, keyword) {
  const group = document.createElement('section');
  group.className = 'work-group';
  group.dataset.categoryId = category.id;
  group.innerHTML = `
    <div class="work-group-header">
      <h2 class="work-group-title" contenteditable="true" role="textbox" aria-label="업무 이름" data-placeholder="업무 이름">${escapeHtml(category.name || '')}</h2>
      <div class="work-group-actions">
        <button type="button" class="work-group-add" data-action="add-item">+ 추가</button>
        <button type="button" class="danger-lite work-group-delete" data-action="delete-category">삭제</button>
      </div>
    </div>
    <div class="work-group-list"></div>
  `;
  const title = group.querySelector('.work-group-title');
  bindEditableText(title, () => category.name, value => {
    category.name = value || '새 업무';
  }, '업무 이름');
  group.querySelector('[data-action="add-item"]').addEventListener('click', () => addWorkItem(category.id));
  group.querySelector('[data-action="delete-category"]').addEventListener('click', () => deleteWorkCategory(category.id));

  const list = group.querySelector('.work-group-list');
  let visibleCount = 0;
  getBlocks(category.id).forEach((block, index) => {
    const result = createWorkBlockElement(block, category.id, index, keyword);
    if (!result) return;
    visibleCount += result.visibleCount || 1;
    list.appendChild(result.section);
  });
  if (!list.children.length) {
    const empty = document.createElement('p');
    empty.className = 'empty-state group-empty';
    empty.textContent = keyword ? '검색 결과가 없습니다.' : '할일을 추가하시오';
    list.appendChild(empty);
  }

  const nameMatch = keyword && (category.name || '').toLowerCase().includes(keyword.toLowerCase());
  if (keyword && visibleCount === 0 && !nameMatch) return null;
  return { group, visibleCount: visibleCount || (nameMatch ? 1 : 0) };
}

function render() {
  document.body.classList.add('editing');
  editToggle.hidden = true;
  document.getElementById('appTitle').textContent = manualData.title || 'SPOON TEAM HANDBOOK';
  const keyword = searchInput.value.trim();

  root.innerHTML = '';
  const categories = getCategories();
  if (!categories.length && !keyword) {
    root.innerHTML = '<p class="empty-state">업무를 생성해 주세요.</p>';
    fitVisibleTextareas();
    return;
  }

  let totalVisible = 0;
  categories.forEach(category => {
    const result = renderWorkCategory(category, keyword);
    if (!result) return;
    totalVisible += result.visibleCount;
    root.append(result.group);
  });

  if (keyword && totalVisible === 0) {
    root.innerHTML = '<p class="empty-state">검색 결과가 없습니다.</p>';
  }
  fitVisibleTextareas();
}

function bindTaskField(element, task, field) {
  const save = () => {
    task[field] = element.value.trim();
    saveLocal();
  };
  element.addEventListener('input', () => {
    if (element.tagName === 'TEXTAREA') fitTextarea(element);
  });
  element.addEventListener('change', save);
  element.addEventListener('blur', save);
}

function renderTask(timeId, task) {
  const card = document.createElement('article');
  card.className = 'task-card';
  card.dataset.taskId = task.id;

  card.innerHTML = `
    <label class="inline-field">업무 설명
      <textarea data-field="description" rows="2" placeholder="업무 설명을 입력하세요">${escapeHtml(task.description || '')}</textarea>
    </label>
    <div class="inline-field links-field">
      <span class="field-label">관련 링크</span>
      <div class="link-box">${renderLinkChips(task.links) || '<p class="empty-inline">등록된 링크가 없습니다.</p>'}</div>
      <div class="link-add-row">
        <input class="link-add-input" type="text" placeholder="URL 붙여넣기 (또는 라벨 | URL)" />
        <button type="button" class="link-add-btn" data-action="add-link">추가</button>
      </div>
    </div>
  `;

  const refreshLinkBox = () => {
    const box = card.querySelector('.link-box');
    if (!box) return;
    box.innerHTML = renderLinkChips(task.links) || '<p class="empty-inline">등록된 링크가 없습니다.</p>';
    bindLinkChipActions(box, task, refreshLinkBox);
  };

  const addLinkFromInput = () => {
    const input = card.querySelector('.link-add-input');
    const raw = input.value.trim();
    if (!raw) return;
    const parsed = parseLinks(raw);
    if (!parsed.length) return;
    task.links = normalizeLinkList([...(task.links || []), ...parsed]);
    input.value = '';
    saveLocal();
    refreshLinkBox();
    showToast('링크를 추가했습니다.');
  };

  refreshLinkBox();
  card.querySelector('[data-action="add-link"]')?.addEventListener('click', addLinkFromInput);
  card.querySelector('.link-add-input')?.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      addLinkFromInput();
    }
  });

  card.querySelectorAll('[data-field]').forEach(element => {
    const field = element.dataset.field;
    if (field === 'phrases') {
      const save = () => {
        task.phrases = parseLines(element.value);
        saveLocal();
      };
      element.addEventListener('change', save);
      element.addEventListener('blur', save);
      return;
    }
    bindTaskField(element, task, field);
  });

  card.querySelectorAll('[data-copy]').forEach(button => {
    button.addEventListener('click', async () => {
      const text = button.dataset.copy;
      try {
        await navigator.clipboard.writeText(text);
        showToast('문구를 복사했습니다.');
      } catch {
        showToast('복사 실패: 직접 선택해서 복사하세요.');
      }
    });
  });

  return card;
}

function openTaskDialog(mode, timeId, taskId = '') {
  const found = findBlock(timeId);
  const block = found?.block;
  if (!block) return;
  const task = taskId ? block.tasks.find(item => item.id === taskId) : null;
  document.getElementById('dialogTitle').textContent = mode === 'add' ? '업무 추가' : '업무 수정';
  document.getElementById('dialogMode').value = mode;
  document.getElementById('dialogTimeId').value = timeId;
  document.getElementById('dialogTaskId').value = taskId;
  document.getElementById('taskTitle').value = task?.title || '';
  document.getElementById('taskOwner').value = task?.owner || '';
  document.getElementById('taskDescription').value = task?.description || '';
  document.getElementById('taskNotes').value = task?.notes || '';
  document.getElementById('taskPhrases').value = (task?.phrases || []).join('\n');
  document.getElementById('taskLinks').value = normalizeLinkList(task?.links || [])
    .map(link => `${link.label} | ${link.url}`)
    .join('\n');
  taskDialog.showModal();
}

function buildTimeOptions() {
  const options = [];
  for (let hour = 0; hour < 24; hour += 1) {
    for (const minute of [0, 30]) {
      options.push(`${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`);
    }
  }
  options.push('24:00');
  return options;
}

function fillTimeSelect(select, selected) {
  const options = buildTimeOptions();
  const value = options.includes(selected) ? selected : options[0];
  select.innerHTML = options.map(time => (
    `<option value="${time}" ${time === value ? 'selected' : ''}>${time}</option>`
  )).join('');
  select.value = value;
}

function parseTimeLabel(label = '') {
  const match = String(label).match(/(\d{1,2}:\d{2})\s*[-~–—]\s*(\d{1,2}:\d{2})/);
  if (!match) return { start: '10:00', end: '13:00' };
  const normalize = value => {
    const [h, m] = value.split(':').map(Number);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  };
  return { start: normalize(match[1]), end: normalize(match[2]) };
}

function timeToMinutes(value) {
  const [h, m] = value.split(':').map(Number);
  return h * 60 + m;
}

function clearDragIndicators() {
  document.querySelectorAll('.drag-over-before, .drag-over-after, .is-dragging').forEach(el => {
    el.classList.remove('drag-over-before', 'drag-over-after', 'is-dragging');
  });
  hideQuickCopyDropGuide();
  hideBlockDropGuide();
}

function moveWorkBlock(categoryId, fromId, toId, placeAfter) {
  if (!fromId || !toId || fromId === toId) return false;
  const blocks = getBlocks(categoryId);
  const fromIndex = blocks.findIndex(item => item.id === fromId);
  if (fromIndex < 0) return false;
  const [moved] = blocks.splice(fromIndex, 1);
  let toIndex = blocks.findIndex(item => item.id === toId);
  if (toIndex < 0) {
    blocks.push(moved);
  } else {
    if (placeAfter) toIndex += 1;
    blocks.splice(toIndex, 0, moved);
  }
  saveLocal();
  render();
  return true;
}

function getBlockDropGuide(list) {
  let guide = list.querySelector('.block-drop-guide');
  if (!guide) {
    guide = document.createElement('div');
    guide.className = 'block-drop-guide';
    guide.setAttribute('aria-hidden', 'true');
    list.appendChild(guide);
  }
  return guide;
}

function showBlockDropGuide(section, placeAfter) {
  const list = section.closest('.work-group-list');
  if (!list) return;
  document.querySelectorAll('.block-drop-guide.is-visible').forEach(el => {
    if (!list.contains(el)) el.classList.remove('is-visible');
  });
  const guide = getBlockDropGuide(list);
  const listRect = list.getBoundingClientRect();
  const sectionRect = section.getBoundingClientRect();
  const gap = 8;
  const top = placeAfter
    ? sectionRect.bottom - listRect.top + list.scrollTop + gap / 2
    : sectionRect.top - listRect.top + list.scrollTop - gap / 2;
  const left = sectionRect.left - listRect.left + list.scrollLeft;
  guide.style.top = `${top}px`;
  guide.style.left = `${left}px`;
  guide.style.width = `${sectionRect.width}px`;
  guide.classList.add('is-visible');
}

function hideBlockDropGuide() {
  document.querySelectorAll('.block-drop-guide').forEach(el => {
    el.classList.remove('is-visible');
  });
}

function bindBlockDrag(section, blockId, categoryId) {
  const handle = section.querySelector('.drag-handle');
  if (!handle) return;

  handle.draggable = true;
  handle.addEventListener('dragstart', event => {
    dragSourceId = blockId;
    dragSourceKind = categoryId;
    section.classList.add('is-dragging');
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', blockId);
    event.dataTransfer.setData('application/x-time-id', blockId);
    try {
      event.dataTransfer.setDragImage(section, 24, 20);
    } catch {
      /* ignore unsupported browsers */
    }
  });

  handle.addEventListener('dragend', () => {
    dragSourceId = '';
    dragSourceKind = '';
    clearDragIndicators();
  });

  const placeAfterPoint = event => {
    const rect = section.getBoundingClientRect();
    return event.clientY > rect.top + rect.height / 2;
  };

  const onDragOver = event => {
    if (!dragSourceId || dragSourceKind !== categoryId || dragSourceId === blockId) {
      if (dragSourceId === blockId) hideBlockDropGuide();
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'move';
    showBlockDropGuide(section, placeAfterPoint(event));
  };

  const onDrop = event => {
    event.preventDefault();
    event.stopPropagation();
    if (dragSourceKind && dragSourceKind !== categoryId) {
      clearDragIndicators();
      dragSourceId = '';
      dragSourceKind = '';
      return;
    }
    const fromId = dragSourceId
      || event.dataTransfer.getData('application/x-time-id')
      || event.dataTransfer.getData('text/plain');
    const placeAfter = placeAfterPoint(event);
    clearDragIndicators();
    const moved = moveWorkBlock(categoryId, fromId, blockId, placeAfter);
    dragSourceId = '';
    dragSourceKind = '';
    if (moved) showToast('순서를 변경했습니다.');
  };

  section.addEventListener('dragover', onDragOver, true);
  section.addEventListener('drop', onDrop, true);
  section.addEventListener('dragleave', event => {
    if (section.contains(event.relatedTarget)) return;
    hideBlockDropGuide();
  });
}

function createEmptyTask(title = '') {
  return {
    id: uid('task'),
    title,
    owner: '',
    description: '',
    notes: '',
    checklist: [],
    phrases: [],
    links: []
  };
}

function openWorkDialog(mode, categoryId = '', blockId = '') {
  const blocks = getBlocks(categoryId);
  const block = blockId ? blocks.find(item => item.id === blockId) : null;
  const isTime = hasTimeLabel(block);
  const { start, end } = parseTimeLabel(block?.label || '10:00 - 13:00');
  const rangeWrap = document.getElementById('timeRangeWrap');
  const preview = document.getElementById('timePreviewClock');
  const startSelect = document.getElementById('timeStart');
  const endSelect = document.getElementById('timeEnd');
  const taskTitleWrap = document.getElementById('timeTaskTitleWrap');
  const taskTitleInput = document.getElementById('timeTaskTitle');

  document.getElementById('timeDialogTitle').textContent = mode === 'add' ? '카테고리 추가' : '카테고리 수정';
  document.getElementById('timeMode').value = mode;
  document.getElementById('timeId').value = blockId;
  document.getElementById('timeCategoryId').value = categoryId;
  document.getElementById('timeSummary').value = block?.summary || '';

  rangeWrap.hidden = !isTime;
  preview.hidden = !isTime;
  startSelect.required = isTime;
  endSelect.required = isTime;
  startSelect.disabled = !isTime;
  endSelect.disabled = !isTime;
  if (isTime) {
    fillTimeSelect(startSelect, start);
    fillTimeSelect(endSelect, end);
    updateTimePreviewClock();
  } else {
    preview.innerHTML = '';
  }

  const isAdd = mode === 'add';
  taskTitleWrap.hidden = !isAdd;
  taskTitleInput.disabled = !isAdd;
  taskTitleInput.required = isAdd;
  taskTitleInput.value = '';
  timeDialog.showModal();
  document.getElementById('timeSummary').focus();
}

function openTimeDialog(mode, timeId = '') {
  const found = findBlock(timeId);
  openWorkDialog(mode, found?.categoryId || '', timeId);
}

function openOngoingDialog(mode, ongoingId = '') {
  const found = findBlock(ongoingId);
  openWorkDialog(mode, found?.categoryId || '', ongoingId);
}

function focusTimeBlock(timeId) {
  searchInput.value = '';
  openBlocks.add(timeId);
  saveOpenState();
  render();
  requestAnimationFrame(() => {
    const section = root.querySelector(`[data-time-id="${CSS.escape(timeId)}"]`);
    section?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
}

function deleteTask(timeId, taskId) {
  if (!confirm('이 업무를 삭제할까요?')) return;
  const found = findBlock(timeId);
  if (!found) return;
  found.block.tasks = found.block.tasks.filter(task => task.id !== taskId);
  saveLocal();
  render();
  showToast('업무를 삭제했습니다.');
}

function deleteWorkBlock(blockId, categoryId) {
  if (!confirm('이 카테고리와 안의 내용을 모두 삭제할까요?')) return;
  const category = getCategory(categoryId);
  if (!category) return;
  category.items = (category.items || []).filter(block => block.id !== blockId);
  openBlocks.delete(blockId);
  saveOpenState();
  saveLocal();
  render();
  showToast('카테고리를 삭제했습니다.');
}

function shortLinkLabel(url, index = 0) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, '');
    const path = parsed.pathname;
    if (host.includes('docs.google.com') && path.includes('/presentation/')) return `슬라이드 ${index + 1}`;
    if (host.includes('docs.google.com') && path.includes('/document/')) return `문서 ${index + 1}`;
    if (host.includes('docs.google.com') && path.includes('/spreadsheets/')) return `시트 ${index + 1}`;
    if (host.includes('drive.google.com')) return `드라이브 ${index + 1}`;
    if (host.includes('notion.so') || host.includes('notion.site')) return `노션 ${index + 1}`;
    if (host.includes('figma.com')) return `피그마 ${index + 1}`;
    if (host.includes('youtube.com') || host.includes('youtu.be')) return `유튜브 ${index + 1}`;
    return host;
  } catch {
    return `링크 ${index + 1}`;
  }
}

function formatLinkLabel(link, index = 0) {
  const label = String(link.label || '').trim();
  const url = String(link.url || '').trim();
  if (label && label !== url && !/^https?:\/\//i.test(label)) return label;
  return shortLinkLabel(url || label, index);
}

function normalizeLinkList(links = []) {
  return links.map((link, index) => {
    const url = String(link.url || link.label || '').trim();
    const label = formatLinkLabel({ label: link.label, url }, index);
    return { label, url };
  }).filter(link => link.url);
}

function collectBlockLinks(block) {
  return (block.tasks || []).flatMap(task => normalizeLinkList(task.links || []));
}

function renderCollapsedLinkIcons(links = []) {
  const items = normalizeLinkList(links);
  if (!items.length) return '';
  return `
    <div class="collapsed-link-icons" aria-label="관련 링크">
      ${items.map((link, index) => {
        const name = formatLinkLabel(link, index);
        return `
        <a class="collapsed-link-icon" href="${escapeAttr(link.url)}" target="_blank" rel="noopener noreferrer" title="${escapeAttr(name)}" aria-label="${escapeAttr(name)}">
          <span class="collapsed-link-icon-mark" aria-hidden="true">↗</span>
          <span class="collapsed-link-icon-label">${escapeHtml(name)}</span>
        </a>`;
      }).join('')}
    </div>
  `;
}

function renderLinkChips(links = []) {
  return normalizeLinkList(links).map((link, index) => `
    <span class="link-chip-item">
      <a class="link-chip" href="${escapeAttr(link.url)}" target="_blank" rel="noopener noreferrer" title="${escapeAttr(link.url)}">
        <span class="link-chip-icon" aria-hidden="true">↗</span>
        <span class="link-chip-label">${escapeHtml(formatLinkLabel(link, index))}</span>
      </a>
      <button type="button" class="link-chip-rename" data-link-index="${index}" title="이름 변경">이름</button>
    </span>
  `).join('');
}

function bindLinkChipActions(box, task, refreshLinkBox) {
  box.querySelectorAll('.link-chip-rename').forEach(button => {
    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      const index = Number(button.dataset.linkIndex);
      const link = task.links?.[index];
      if (!link) return;

      const item = button.closest('.link-chip-item');
      const labelEl = item?.querySelector('.link-chip-label');
      if (!item || !labelEl || item.querySelector('.link-chip-rename-input')) return;

      const input = document.createElement('input');
      input.className = 'link-chip-rename-input';
      input.type = 'text';
      input.value = formatLinkLabel(link, index);
      input.setAttribute('aria-label', '링크 이름');

      const finish = save => {
        if (save) {
          const next = input.value.trim();
          if (next) {
            link.label = next;
            task.links = normalizeLinkList(task.links);
            saveLocal();
            refreshLinkBox();
            showToast('링크 이름을 변경했습니다.');
            return;
          }
        }
        refreshLinkBox();
      };

      input.addEventListener('keydown', keyEvent => {
        if (keyEvent.key === 'Enter') {
          keyEvent.preventDefault();
          finish(true);
        }
        if (keyEvent.key === 'Escape') {
          keyEvent.preventDefault();
          finish(false);
        }
      });
      input.addEventListener('blur', () => finish(true));

      labelEl.replaceWith(input);
      button.hidden = true;
      input.focus();
      input.select();
    });
  });
}

function parseLines(value) {
  return value.split('\n').map(line => line.trim()).filter(Boolean);
}

function parseLinks(value) {
  return parseLines(value).map((line, index) => {
    const pipeIndex = line.indexOf('|');
    if (pipeIndex >= 0) {
      const label = line.slice(0, pipeIndex).trim();
      const url = line.slice(pipeIndex + 1).trim();
      return {
        label: label && !/^https?:\/\//i.test(label) ? label : shortLinkLabel(url || label, index),
        url: url || label
      };
    }
    return { label: shortLinkLabel(line, index), url: line };
  }).filter(link => link.url);
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));
}
function escapeAttr(value = '') { return escapeHtml(value).replace(/'/g, '&#039;'); }

editToggle.addEventListener('click', () => {
  editMode = !editMode;
  render();
});

searchInput.addEventListener('input', render);
document.addEventListener('click', () => closeDeadlinePopovers());
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') closeDeadlinePopovers();
});
let announceSaveTimer = null;
announceInput?.addEventListener('input', () => {
  const text = announceInput.value;
  announceBox?.classList.toggle('has-text', Boolean(text.trim()));
  clearTimeout(announceSaveTimer);
  announceSaveTimer = setTimeout(() => saveAnnounce(text), 250);
});
let memoSaveTimer = null;
let fitTextareaTimer = null;
memoInput?.addEventListener('input', () => {
  if (!manualData) return;
  manualData.memo = memoInput.value;
  fitTextarea(memoInput);
  if (memoSaveHint) memoSaveHint.textContent = '저장 중...';
  clearTimeout(memoSaveTimer);
  memoSaveTimer = setTimeout(() => {
    saveLocal();
    if (memoSaveHint) memoSaveHint.textContent = '저장됨';
  }, 250);
});
window.addEventListener('resize', () => {
  clearTimeout(fitTextareaTimer);
  fitTextareaTimer = setTimeout(fitVisibleTextareas, 100);
});
memoFontDown?.addEventListener('click', () => changeMemoFontSize(-1));
memoFontUp?.addEventListener('click', () => changeMemoFontSize(1));
quickCopyAddBtn?.addEventListener('click', addQuickCopy);
quickCopyTitleInput?.addEventListener('keydown', event => {
  if (event.key === 'Enter') {
    event.preventDefault();
    addQuickCopy();
  }
});
quickCopyInput?.addEventListener('keydown', event => {
  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    addQuickCopy();
  }
});
let imageDriveSaveTimer = null;
imageDriveInput?.addEventListener('input', () => {
  if (!manualData) return;
  manualData.imageDriveUrl = imageDriveInput.value.trim();
  clearTimeout(imageDriveSaveTimer);
  imageDriveSaveTimer = setTimeout(() => saveLocal(), 250);
});
imageDriveInput?.addEventListener('keydown', event => {
  if (event.key === 'Enter') {
    event.preventDefault();
    openImageDrive();
  }
});
imageDriveOpenBtn?.addEventListener('click', openImageDrive);
addWorkBtn?.addEventListener('click', addWorkCategory);
cancelTaskBtn.addEventListener('click', () => taskDialog.close());
cancelTimeBtn.addEventListener('click', () => timeDialog.close());
document.getElementById('timeStart').addEventListener('change', updateTimePreviewClock);
document.getElementById('timeEnd').addEventListener('change', updateTimePreviewClock);

taskForm.addEventListener('submit', event => {
  event.preventDefault();
  event.stopPropagation();

  const mode = document.getElementById('dialogMode').value;
  const timeId = document.getElementById('dialogTimeId').value;
  const taskId = document.getElementById('dialogTaskId').value;
  const title = document.getElementById('taskTitle').value.trim();
  const found = findBlock(timeId);
  const block = found?.block;

  if (!title) {
    alert('업무명을 입력해 주세요.');
    return;
  }
  if (!block) {
    alert('업무를 찾을 수 없습니다. 다시 시도해 주세요.');
    return;
  }
  if (!Array.isArray(block.tasks)) block.tasks = [];

  const existing = mode === 'edit' ? block.tasks.find(task => task.id === taskId) : null;

  const nextTask = {
    id: mode === 'add' ? uid('task') : taskId,
    title,
    owner: document.getElementById('taskOwner').value.trim(),
    description: document.getElementById('taskDescription').value.trim(),
    notes: document.getElementById('taskNotes').value.trim(),
    checklist: existing?.checklist || [],
    phrases: parseLines(document.getElementById('taskPhrases').value),
    links: normalizeLinkList(parseLinks(document.getElementById('taskLinks').value))
  };

  if (mode === 'add') block.tasks.push(nextTask);
  else block.tasks = block.tasks.map(task => task.id === taskId ? nextTask : task);

  saveLocal();
  taskDialog.close();
  focusTimeBlock(timeId);
  showToast(mode === 'add' ? '업무를 추가했습니다.' : '업무를 수정했습니다.');
});

timeForm.addEventListener('submit', event => {
  event.preventDefault();
  event.stopPropagation();

  const mode = document.getElementById('timeMode').value;
  const categoryId = document.getElementById('timeCategoryId').value;
  const blockId = document.getElementById('timeId').value;
  const start = document.getElementById('timeStart').value;
  const end = document.getElementById('timeEnd').value;
  const summary = document.getElementById('timeSummary').value.trim();
  const taskTitleInput = document.getElementById('timeTaskTitle');
  const taskTitle = taskTitleInput.disabled ? '' : taskTitleInput.value.trim();
  const blocks = getBlocks(categoryId);
  const existing = blocks.find(item => item.id === blockId);
  const isTime = hasTimeLabel(existing) || (mode === 'add' && start && end);

  if (!summary) {
    alert('타이틀을 입력해 주세요.');
    return;
  }
  if (isTime) {
    if (!start || !end) {
      alert('시작/종료 시간을 선택해 주세요.');
      return;
    }
    if (timeToMinutes(end) <= timeToMinutes(start)) {
      alert('종료 시간은 시작 시간보다 늦어야 합니다.');
      return;
    }
  }
  if (mode === 'add' && !taskTitle) {
    alert('상세 업무명을 입력해 주세요.');
    document.getElementById('timeTaskTitle').focus();
    return;
  }

  const label = isTime ? `${start} - ${end}` : '';
  let focusId = blockId;

  if (mode === 'add') {
    focusId = uid('item');
    blocks.push({
      id: focusId,
      label,
      summary,
      done: false,
      hasLeaveCheck: false,
      leaveRecheck: false,
      tasks: [createEmptyTask(taskTitle)]
    });
  } else {
    const block = existing;
    if (!block) {
      alert('카테고리를 찾을 수 없습니다. 다시 시도해 주세요.');
      return;
    }
    if (isTime) block.label = label;
    block.summary = summary;
  }

  saveLocal();
  timeDialog.close();
  focusTimeBlock(focusId);
  showToast(mode === 'add' ? '카테고리를 추가했습니다.' : '카테고리를 수정했습니다.');
});

function readStoredTabData(tabId) {
  const tab = TABS[tabId];
  try {
    const raw = localStorage.getItem(tab.storageKey);
    if (raw) return normalizeManualData(JSON.parse(raw));
  } catch {
    /* ignore */
  }
  return emptyManualData();
}

function readStoredOpenBlocks(tabId) {
  const tab = TABS[tabId];
  try {
    let raw = localStorage.getItem(tab.openKey);
    if (!raw && tabId === 'codi') raw = localStorage.getItem(LEGACY_OPEN_KEY);
    return JSON.parse(raw || '[]');
  } catch {
    return [];
  }
}

function tabIds() {
  return Object.keys(TABS);
}

function buildHandbookBundle() {
  saveLocal();
  saveOpenState();
  const tabs = {};
  const open = {};
  tabIds().forEach(id => {
    tabs[id] = readStoredTabData(id);
    open[id] = readStoredOpenBlocks(id);
  });
  return {
    version: 2,
    type: 'spoon-handbook-bundle',
    exportedAt: new Date().toISOString(),
    activeTab,
    tabs,
    open
  };
}

async function applyHandbookBundle(bundle) {
  for (const id of tabIds()) {
    const data = normalizeManualData(bundle.tabs?.[id] || emptyManualData());
    localStorage.setItem(TABS[id].storageKey, JSON.stringify(data));
    localStorage.setItem(TABS[id].openKey, JSON.stringify(bundle.open?.[id] || []));
    if (isCloudReady()) await HandbookCloud.saveTabNow(id, data);
  }

  const nextTab = TABS[bundle.activeTab] ? bundle.activeTab : activeTab;
  localStorage.setItem(ACTIVE_TAB_KEY, nextTab);
  await loadTabData(nextTab);
  updateTabUI();
  syncMemoUI();
  syncImageDriveUI();
  renderQuickCopies();
  render();
}

exportBtn.addEventListener('click', () => {
  const bundle = buildHandbookBundle();
  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `spoon-handbook-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('전체 탭 데이터를 저장했습니다.');
});

importInput.addEventListener('change', event => {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const imported = JSON.parse(reader.result);
      if (imported?.type === 'spoon-handbook-bundle' && imported.tabs) {
        await applyHandbookBundle(imported);
        showToast('전체 탭 데이터를 불러왔습니다.');
        return;
      }
      if (!Array.isArray(imported.timeBlocks) && !Array.isArray(imported.workCategories)) throw new Error('Invalid format');
      manualData = normalizeManualData(imported);
      saveLocal();
      syncMemoUI();
      syncImageDriveUI();
      renderQuickCopies();
      render();
      showToast(`${currentTab().label} 탭 JSON을 불러왔습니다.`);
    } catch {
      alert('JSON 형식이 맞지 않습니다.');
    }
  };
  reader.readAsText(file);
  event.target.value = '';
});

resetBtn.addEventListener('click', async () => {
  if (!confirm(`${currentTab().label} 탭 저장 내용을 지울까요?`)) return;
  localStorage.removeItem(currentTab().storageKey);
  localStorage.removeItem(currentTab().openKey);
  if (activeTab === 'codi') {
    try {
      const response = await fetch('data.json');
      manualData = normalizeManualData(await response.json());
    } catch {
      manualData = emptyManualData();
    }
  } else {
    manualData = emptyManualData();
  }
  openBlocks = new Set();
  saveLocal();
  saveOpenState();
  syncMemoUI();
  syncImageDriveUI();
  renderQuickCopies();
  render();
  showToast(`${currentTab().label} 탭을 초기화했습니다.`);
});

boot();
