
// IndexedDB store for individual notes by ID
const DB_NAME = 'zen-notes';
const STORE_NAME = 'notes_by_id';
const DB_VERSION = 1;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'noteId' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function set(note) {
  try {
    if (!note || typeof note.noteId !== 'number') return;
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      const store = tx.objectStore(STORE_NAME);
      store.put(note);
    });
    db.close();
  } catch (e) {
    console.warn('[NotesCache] set failed:', e);
  }
}

async function get(noteId) {
  try {
    const db = await openDB();
    const record = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      tx.onerror = () => reject(tx.error);
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(noteId);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return record || null;
  } catch (e) {
    console.warn('[NotesCache] get failed:', e);
    return null;
  }
}

export default { set, get };
