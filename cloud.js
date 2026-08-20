(function () {
  const SAVE_DELAY = 700;
  let app = null;
  let db = null;
  let storage = null;
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
    if (typeof firebase.storage === 'function') storage = firebase.storage();
    return true;
  }

  function isStorageEnabled() {
    return Boolean(isEnabled() && typeof firebase.storage === 'function' && config().storageBucket);
  }

  function safeFileName(name) {
    const cleaned = String(name || 'image')
      .normalize('NFKD')
      .replace(/[^\w.-]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return cleaned || 'image';
  }

  async function uploadTaskImage(file, tabId, taskId, onProgress) {
    if (!file || !String(file.type || '').startsWith('image/')) {
      throw new Error('이미지 파일만 업로드할 수 있습니다.');
    }
    if (file.size > 10 * 1024 * 1024) {
      throw new Error('이미지는 10MB 이하만 업로드할 수 있습니다.');
    }
    if (!app) init();
    if (!isStorageEnabled() || !storage) {
      throw new Error('Firebase Storage가 연결되지 않았습니다.');
    }

    const role = String(tabId || 'shared').replace(/[^\w-]/g, '');
    const task = String(taskId || 'task').replace(/[^\w-]/g, '');
    const path = `handbook-images/${role}/${task}/${Date.now()}-${safeFileName(file.name)}`;
    const ref = storage.ref().child(path);
    const upload = ref.put(file, {
      contentType: file.type,
      customMetadata: { role, taskId: task }
    });

    if (typeof onProgress === 'function') {
      upload.on('state_changed', snapshot => {
        const percent = snapshot.totalBytes
          ? Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100)
          : 0;
        onProgress(percent);
      });
    }

    const snapshot = await upload;
    return {
      url: await snapshot.ref.getDownloadURL(),
      path
    };
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
    isStorageEnabled,
    init,
    uploadTaskImage,
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
