(function () {
  const SAVE_DELAY = 700;
  let app = null;
  let auth = null;
  let db = null;
  let authCallback = null;
  let saveTimer = null;
  let pendingTabId = '';
  let pendingData = null;
  let lastPushedAt = 0;
  let unsubscribe = null;
  let flushPromise = null;

  function config() {
    return window.FIREBASE_CONFIG || {};
  }

  function allowedEmails() {
    return (window.FIREBASE_ALLOWED_EMAILS || [])
      .map(email => String(email || '').trim().toLowerCase())
      .filter(Boolean);
  }

  function isEnabled() {
    const cfg = config();
    return Boolean(cfg.apiKey && cfg.projectId && window.firebase);
  }

  function cloneData(data) {
    return JSON.parse(JSON.stringify(data || {}));
  }

  function isAllowed(email) {
    const list = allowedEmails();
    if (!list.length) return true;
    return list.includes(String(email || '').trim().toLowerCase());
  }

  function docRef(tabId) {
    return db.collection('handbook').doc(tabId);
  }

  function init() {
    if (!isEnabled() || app) return isEnabled();
    app = firebase.initializeApp(config());
    auth = firebase.auth();
    db = firebase.firestore();
    auth.onAuthStateChanged(user => {
      if (authCallback) authCallback(user);
    });
    return true;
  }

  function onAuth(callback) {
    authCallback = callback;
    if (auth) callback(auth.currentUser);
  }

  function currentUser() {
    return auth ? auth.currentUser : null;
  }

  async function signIn() {
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    await auth.signInWithPopup(provider);
  }

  async function signOut() {
    stopWatch();
    await flushSave();
    await auth.signOut();
  }

  async function loadTab(tabId) {
    const snap = await docRef(tabId).get();
    if (!snap.exists) return null;
    const row = snap.data() || {};
    return row.payload || null;
  }

  async function saveTabNow(tabId, data) {
    if (!isEnabled() || !currentUser() || !tabId || !data) return;
    lastPushedAt = Date.now();
    const payload = cloneData(data);
    payload.updatedAtMs = lastPushedAt;
    payload.updatedBy = currentUser().email || '';
    payload.role = tabId;
    await docRef(tabId).set({
      payload,
      updatedAtMs: lastPushedAt,
      updatedBy: payload.updatedBy
    });
  }

  function scheduleSave(tabId, data) {
    if (!isEnabled() || !currentUser() || !tabId || !data) return;
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
    if (!isEnabled() || !currentUser() || !tabId) return () => {};
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
