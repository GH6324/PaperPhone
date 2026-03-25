/**
 * KeyStore — persists crypto keys with IndexedDB primary + sessionStorage fallback
 *
 * Some Android WebViews / private-mode browsers wipe IndexedDB on page reload.
 * sessionStorage survives within the same browser session but is cleared when
 * the tab is closed. This gives us a workable fallback for restricted environments.
 *
 * Key values are serializable objects (plain JS objects with string fields).
 */

const DB_NAME = 'paperphone_keys';
const DB_VERSION = 1;
const STORE = 'keystore';
const SS_PREFIX = 'ppk_'; // sessionStorage prefix

// ── In-memory cache (fastest, lives only for this page load) ──────────────
const _memCache = new Map();

// ── IndexedDB helpers ─────────────────────────────────────────────────────

let _dbPromise = null;
function openDb() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = e => e.target.result.createObjectStore(STORE);
      req.onsuccess = e => resolve(e.target.result);
      req.onerror = e => { _dbPromise = null; reject(e.target.error); };
    } catch (e) { _dbPromise = null; reject(e); }
  });
  return _dbPromise;
}

async function idbSet(name, value) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, name);
    tx.oncomplete = () => resolve(true);
    tx.onerror = e => reject(e.target.error);
  });
}

async function idbGet(name) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(name);
    req.onsuccess = e => resolve(e.target.result ?? null);
    req.onerror = e => reject(e.target.error);
  });
}

async function idbDelete(name) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(name);
    tx.oncomplete = () => resolve(true);
    tx.onerror = e => reject(e.target.error);
  });
}

// ── sessionStorage helpers ────────────────────────────────────────────────

function ssSet(name, value) {
  try {
    sessionStorage.setItem(SS_PREFIX + name, JSON.stringify(value));
    return true;
  } catch { return false; }
}

function ssGet(name) {
  try {
    const s = sessionStorage.getItem(SS_PREFIX + name);
    return s ? JSON.parse(s) : null;
  } catch { return null; }
}

function ssDel(name) {
  try { sessionStorage.removeItem(SS_PREFIX + name); } catch {}
}

// ── Public API ────────────────────────────────────────────────────────────

export async function setKey(name, value) {
  // Always keep in memory cache for this page load
  _memCache.set(name, value);

  // Try IndexedDB first, fall back to sessionStorage
  try {
    await idbSet(name, value);
  } catch {
    ssSet(name, value);
  }
}

export async function getKey(name) {
  // 1. Memory cache (fastest)
  if (_memCache.has(name)) return _memCache.get(name);

  // 2. IndexedDB
  try {
    const val = await idbGet(name);
    if (val !== null) {
      _memCache.set(name, val); // warm cache
      return val;
    }
  } catch { /* fall through */ }

  // 3. sessionStorage fallback
  const ssVal = ssGet(name);
  if (ssVal !== null) {
    _memCache.set(name, ssVal); // warm cache
    return ssVal;
  }

  return undefined;
}

export async function deleteKey(name) {
  _memCache.delete(name);
  try { await idbDelete(name); } catch {}
  ssDel(name);
}
