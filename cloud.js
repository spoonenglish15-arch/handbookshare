(function () {
  const SAVE_DELAY = 700;
  let app = null;
  let db = null;
  let saveTimer = null;
  let pendingTabId = '';
  let pendingData = null;
  let lastPushedAt = 0;
  let lastAnnouncePushedAt = 0;
  let unsubscribe = null;
  let announceUnsub = null;
  let flushPromise = null;
  let announceTimer = null;
  let pendingAnnounce = null;

  function config() {
    return window.FIREBASE_CONFIG || {};
  }

  function isEnabled() {
    const cfg = config();
    return Boolean(cfg.apiKey && cfg.projectId && window.firebase);
  }

  function cloneData(data) {
    return JSON.parse(JSON.stringify(data || {}));
  }

  function docRef(tabId) {
    return db.collection('handbook').doc(tabId);
  }

  function init() {
    if (!isEnabled() || app) return isEnabled();
    app = firebase.initializeApp(config());
    db = firebase.firestore();
    return true;
  }

  async function loadTab(tabId) {
    const snap = await docRef(tabId).get();
    if (!snap.exists) return null;
    const row = snap.data() || {};
    return row.payload || null;
  }

  async function saveTabNow(tabId, data) {
    if (!isEnabled() || !tabId || !data) return;
    lastPushedAt = Date.now();
    const payload = cloneData(data);
    payload.updatedAtMs = lastPushedAt;
    payload.updatedBy = 'shared';
    payload.role = tabId;
    await docRef(tabId).set({
      payload,
      updatedAtMs: lastPushedAt,
      updatedBy: payload.updatedBy
    });
  }

  function scheduleSave(tabId, data) {
    if (!isEnabled() || !tabId || !data) return;
    pendingTabId = tabId;
    pendingData = cloneData(data);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      flushSave();
    }, SAVE_DELAY);
  }

  async function flushSave() {
    clearTimeout(saveTimer);
    if (!pendingTabId || !pendingData) return;
    if (flushPromise) return flushPromise;
    const tabId = pendingTabId;
    const data = pendingData;
    pendingTabId = '';
    pendingData = null;
    flushPromise = saveTabNow(tabId, data).finally(() => {
      flushPromise = null;
    });
    return flushPromise;
  }

  function stopWatch() {
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
  }

  function stopAnnounceWatch() {
    if (announceUnsub) {
      announceUnsub();
      announceUnsub = null;
    }
  }

  async function loadAnnounce() {
    const snap = await docRef('announce').get();
    if (!snap.exists) return '';
    return String((snap.data() || {}).text || '');
  }

  async function saveAnnounceNow(text) {
    if (!isEnabled()) return;
    lastAnnouncePushedAt = Date.now();
    await docRef('announce').set({
      text: String(text || ''),
      updatedAtMs: lastAnnouncePushedAt,
      updatedBy: 'shared'
    });
  }

  function scheduleAnnounceSave(text) {
    if (!isEnabled()) return;
    pendingAnnounce = String(text || '');
    clearTimeout(announceTimer);
    announceTimer = setTimeout(() => {
      flushAnnounceSave();
    }, SAVE_DELAY);
  }

  async function flushAnnounceSave() {
    clearTimeout(announceTimer);
    if (pendingAnnounce === null) return;
    const text = pendingAnnounce;
    pendingAnnounce = null;
    await saveAnnounceNow(text);
  }

  function subscribeAnnounce(onData) {
    stopAnnounceWatch();
    if (!isEnabled()) return () => {};
    announceUnsub = docRef('announce').onSnapshot(snap => {
      if (!snap.exists) return;
      const row = snap.data() || {};
      if (row.updatedAtMs && row.updatedAtMs === lastAnnouncePushedAt) return;
      if (typeof onData === 'function') onData(String(row.text || ''));
    }, error => {
      console.error(error);
    });
    return stopAnnounceWatch;
  }

  function subscribeTab(tabId, onData) {
    stopWatch();
    if (!isEnabled() || !tabId) return () => {};
    unsubscribe = docRef(tabId).onSnapshot(snap => {
      if (!snap.exists) return;
      const row = snap.data() || {};
      if (row.updatedAtMs && row.updatedAtMs === lastPushedAt) return;
      if (typeof onData === 'function') onData(row.payload || null);
    }, error => {
      console.error(error);
    });
    return stopWatch;
  }

  window.HandbookCloud = {
    isEnabled,
    init,
    loadTab,
    saveTabNow,
    scheduleSave,
    flushSave,
    subscribeTab,
    stopWatch,
    loadAnnounce,
    saveAnnounceNow,
    scheduleAnnounceSave,
    flushAnnounceSave,
    subscribeAnnounce,
    stopAnnounceWatch
  };
})();
