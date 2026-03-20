
// Lightweight IndexedDB API cache for GET /api/** responses
const DB_NAME = 'zen-cache';
const STORE_NAME = 'api_cache';
const DB_VERSION = 1;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'url' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function set(url, data) {
  try {
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      const store = tx.objectStore(STORE_NAME);
      store.put({ url, data, ts: Date.now() });
    });
    db.close();
  } catch (e) {
    console.warn('[ApiCache] set failed:', url, e);
  }
}

async function get(url) {
  try {
    const db = await openDB();
    const record = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      tx.onerror = () => reject(tx.error);
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(url);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return record?.data;
  } catch (e) {
    console.warn('[ApiCache] get failed:', url, e);
    return null;
  }
}

export default { set, get, findNoteById };

async function findNoteById(noteId) {
  try {
    const db = await openDB();
    const all = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      tx.onerror = () => reject(tx.error);
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
    db.close();
    for (const rec of all) {
      const data = rec?.data;
      if (!data) continue;
      if (Array.isArray(data)) {
        const found = data.find(n => n && (n.noteId === noteId || n.noteId === parseInt(noteId,10)));
        if (found) return found;
      } else if (Array.isArray(data.notes)) {
        const found = data.notes.find(n => n && (n.noteId === noteId || n.noteId === parseInt(noteId,10)));
        if (found) return found;
      }
    }
    return null;
  } catch (e) {
    console.warn('[ApiCache] findNoteById failed:', e);
    return null;
  }
}

