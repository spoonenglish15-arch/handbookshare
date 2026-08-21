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
  let projectsUnsub = null;
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

  function projectIndexRef() {
    return docRef('projectIndex');
  }

  function projectDocId(projectId) {
    return `project--${projectId}`;
  }

  function normalizeProjects(row) {
    if (!Array.isArray(row?.projects)) return [];
    return row.projects.filter(project => (
      project
      && /^[a-z0-9-]{8,80}$/.test(String(project.id || ''))
      && String(project.name || '').trim()
    )).map(project => ({
      id: String(project.id),
      name: String(project.name).trim().slice(0, 30),
      createdAtMs: Number(project.createdAtMs || 0)
    }));
  }

  function createProjectId() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID().replace(/-/g, '');
    const random = Math.random().toString(36).slice(2);
    return `${Date.now().toString(36)}${random}${Math.random().toString(36).slice(2)}`;
  }

  function init() {
    if (!isEnabled() || app) return isEnabled();
    app = firebase.initializeApp(config());
    db = firebase.firestore();
    return true;
  }

  async function saveTaskImage(blob, tabId, taskId, fileName = '') {
    if (!blob || !String(blob.type || '').startsWith('image/')) {
      throw new Error('이미지 파일만 저장할 수 있습니다.');
    }
    if (blob.size > 300 * 1024) {
      throw new Error('압축된 이미지가 300KB를 초과합니다.');
    }
    if (!app) init();
    if (!db) throw new Error('Firestore가 연결되지 않았습니다.');

    const bytes = new Uint8Array(await blob.arrayBuffer());
    const ref = db.collection('handbookImages').doc();
    await ref.set({
      image: firebase.firestore.Blob.fromUint8Array(bytes),
      contentType: blob.type || 'image/webp',
      fileName: String(fileName || '').slice(0, 200),
      role: String(tabId || ''),
      taskId: String(taskId || ''),
      size: blob.size,
      createdAtMs: Date.now()
    });
    return { id: ref.id };
  }

  async function loadTaskImage(imageId) {
    if (!imageId) return null;
    if (!app) init();
    if (!db) return null;
    const snap = await db.collection('handbookImages').doc(String(imageId)).get();
    if (!snap.exists) return null;
    const row = snap.data() || {};
    if (!row.image?.toUint8Array) return null;
    return {
      blob: new Blob([row.image.toUint8Array()], { type: row.contentType || 'image/webp' }),
      fileName: String(row.fileName || '')
    };
  }

  async function deleteTaskImage(imageId) {
    if (!imageId) return;
    if (!app) init();
    if (!db) return;
    await db.collection('handbookImages').doc(String(imageId)).delete();
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

  async function loadProjects() {
    if (!app) init();
    if (!db) return [];
    const snap = await projectIndexRef().get();
    return snap.exists ? normalizeProjects(snap.data() || {}) : [];
  }

  async function createProject(name, initialData) {
    if (!app) init();
    if (!db) throw new Error('Firestore가 연결되지 않았습니다.');
    const normalizedName = String(name || '').replace(/\s+/g, ' ').trim();
    if (normalizedName.length < 2 || normalizedName.length > 30) {
      throw new Error('프로젝트 이름은 2~30자로 입력해 주세요.');
    }

    const project = {
      id: createProjectId(),
      name: normalizedName,
      createdAtMs: Date.now()
    };
    const payload = cloneData(initialData);
    payload.role = projectDocId(project.id);
    payload.updatedAtMs = project.createdAtMs;
    payload.updatedBy = 'shared';

    await db.runTransaction(async transaction => {
      const indexRef = projectIndexRef();
      const indexSnap = await transaction.get(indexRef);
      const projects = indexSnap.exists ? normalizeProjects(indexSnap.data() || {}) : [];
      const duplicate = projects.some(item => (
        item.name.toLocaleLowerCase() === normalizedName.toLocaleLowerCase()
      ));
      if (duplicate) {
        const error = new Error('같은 이름의 프로젝트가 이미 있습니다.');
        error.code = 'project-name-duplicate';
        throw error;
      }
      transaction.set(docRef(projectDocId(project.id)), {
        payload,
        updatedAtMs: project.createdAtMs,
        updatedBy: 'shared'
      });
      transaction.set(indexRef, {
        projects: [...projects, project],
        updatedAtMs: project.createdAtMs,
        updatedBy: 'shared'
      });
    });
    return project;
  }

  function stopProjectsWatch() {
    if (projectsUnsub) {
      projectsUnsub();
      projectsUnsub = null;
    }
  }

  function subscribeProjects(onData) {
    stopProjectsWatch();
    if (!isEnabled()) return () => {};
    projectsUnsub = projectIndexRef().onSnapshot(snap => {
      const projects = snap.exists ? normalizeProjects(snap.data() || {}) : [];
      if (typeof onData === 'function') onData(projects);
    }, error => {
      console.error(error);
    });
    return stopProjectsWatch;
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
    saveTaskImage,
    loadTaskImage,
    deleteTaskImage,
    loadTab,
    saveTabNow,
    loadProjects,
    createProject,
    subscribeProjects,
    stopProjectsWatch,
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
