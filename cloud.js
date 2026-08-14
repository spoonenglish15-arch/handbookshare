(function () {
  const SAVE_DELAY = 700;
  let app = null;
  let db = null;
  let authCallback = null;
  let saveTimer = null;
  let pendingTabId = '';
  let pendingData = null;
  let lastPushedAt = 0;
  let unsubscribe = null;
  let flushPromise = null;

  const SHARED_USER = {
    email: '',
    displayName: 'Shared'
  };

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

  function isAllowed() {
    return true;
  }

  function docRef(tabId) {
    return db.collection('handbook').doc(tabId);
  }

  function init() {
    if (!isEnabled() || app) return isEnabled();

    app = firebase.initializeApp(config());
    db = firebase.firestore();

    if (authCallback) {
      authCallback(SHARED_USER);
    }

    return true;
  }

  function onAuth(callback) {
    authCallback = callback;
    if (callback) callback(SHARED_USER);
  }

  function currentUser() {
    return SHARED_USER;
  }

  async function signIn() {
    return SHARED_USER;
  }

  async function signOut() {
    await flushSave();
    stopWatch();
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
      updatedBy: 'shared'
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

  function subscribeTab(tabId, onData) {
    stopWatch();

    if (!isEnabled() || !tabId) return () => {};

    unsubscribe = docRef(tabId).onSnapshot(
      snap => {
        if (!snap.exists) return;

        const row = snap.data() || {};

        if (row.updatedAtMs && row.updatedAtMs === lastPushedAt) return;

        if (typeof onData === 'function') {
          onData(row.payload || null);
        }
      },
      error => {
        console.error(error);
      }
    );

    return stopWatch;
  }

  window.HandbookCloud = {
    isEnabled,
    isAllowed,
    init,
    onAuth,
    currentUser,
    signIn,
    signOut,
    loadTab,
    saveTabNow,
    scheduleSave,
    flushSave,
    subscribeTab,
    stopWatch
  };
})();
