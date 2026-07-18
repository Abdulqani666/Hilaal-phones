/**
 * db.js
 * Thin wrapper around IndexedDB so the app works fully offline.
 * Every record has: id, ...fields, synced (bool), updatedAt (timestamp)
 * "synced" lets us know later which records still need to be pushed to Supabase.
 */

const DB_NAME = "shopManagerDB";
const DB_VERSION = 1;

const STORES = {
  products: "id",
  sales: "id",
  customers: "id",
};

let dbInstance = null;

function openDB() {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      Object.entries(STORES).forEach(([storeName, keyPath]) => {
        if (!db.objectStoreNames.contains(storeName)) {
          const store = db.createObjectStore(storeName, { keyPath });
          store.createIndex("synced", "synced", { unique: false });
        }
      });
    };

    request.onsuccess = (event) => {
      dbInstance = event.target.result;
      resolve(dbInstance);
    };

    request.onerror = (event) => reject(event.target.error);
  });
}

function uid() {
  return "id_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
}

async function addRecord(storeName, data) {
  const db = await openDB();
  const record = {
    id: data.id || uid(),
    ...data,
    synced: false,
    updatedAt: Date.now(),
  };
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).put(record);
    tx.oncomplete = () => resolve(record);
    tx.onerror = (e) => reject(e.target.error);
  });
}

async function updateRecord(storeName, id, changes) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const existing = getReq.result;
      if (!existing) return reject(new Error("Record not found: " + id));
      const updated = { ...existing, ...changes, synced: false, updatedAt: Date.now() };
      store.put(updated);
      resolve(updated);
    };
    getReq.onerror = (e) => reject(e.target.error);
  });
}

async function deleteRecord(storeName, id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).delete(id);
    tx.oncomplete = () => resolve(true);
    tx.onerror = (e) => reject(e.target.error);
  });
}

async function getAll(storeName) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const request = tx.objectStore(storeName).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = (e) => reject(e.target.error);
  });
}

async function getUnsynced(storeName) {
  const all = await getAll(storeName);
  return all.filter((r) => r.synced === false);
}

async function markSynced(storeName, id) {
  return updateRecord(storeName, id, { synced: true });
}

window.ShopDB = {
  addRecord,
  updateRecord,
  deleteRecord,
  getAll,
  getUnsynced,
  markSynced,
};
