/**
 * KeyStore — persists crypto keys with four-tier fallback
 *
 * Storage order (best to most universal):
 *   1. In-memory cache  — instant, lives for this page load only
 *   2. IndexedDB        — persistent across sessions, most browsers
 *   3. sessionStorage   — survives page reload within same tab, cleared on close
 *   4. localStorage     — persistent, survives everything, maximum compatibility
 *
 * Tier 4 (localStorage) stores values as a JSON string. Since PaperPhone is
 * self-hosted and the keys are only as secure as the JS execution context
 * (same-origin), this is an acceptable tradeoff for maximum compatibility
 * with restricted WebView environments (e.g., Via browser on Android).
 */

const DB_NAME = 'paperphone_keys';
const DB_VERSION = 1;
const STORE = 'keystore';
const SS_PREFIX = 'ppk_';   // sessionStorage prefix
const LS_PREFIX = 'ppkl_';  // localStorage prefix

// ── In-memory cache ────────────────────────────────────────────────────────
const _memCache = new Map();

// ── IndexedDB ──────────────────────────────────────────────────────────────
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

// ── sessionStorage ─────────────────────────────────────────────────────────
function ssSet(name, value) {
  try { sessionStorage.setItem(SS_PREFIX + name, JSON.stringify(value)); return true; }
  catch { return false; }
}
function ssGet(name) {
  try { const s = sessionStorage.getItem(SS_PREFIX + name); return s ? JSON.parse(s) : null; }
  catch { return null; }
}
function ssDel(name) {
  try { sessionStorage.removeItem(SS_PREFIX + name); } catch {}
}

// ── localStorage (tier 4, maximum compatibility) ────────────────────────────
function lsSet(name, value) {
  try { localStorage.setItem(LS_PREFIX + name, JSON.stringify(value)); return true; }
  catch { return false; }
}
function lsGet(name) {
  try { const s = localStorage.getItem(LS_PREFIX + name); return s ? JSON.parse(s) : null; }
  catch { return null; }
}
function lsDel(name) {
  try { localStorage.removeItem(LS_PREFIX + name); } catch {}
}

// ── Public API ─────────────────────────────────────────────────────────────

export async function setKey(name, value) {
  // Tier 1: Always update memory cache
  _memCache.set(name, value);

  // Tiers 2-4: persist wherever possible (fire and forget for speed)
  Promise.resolve().then(async () => {
    let persisted = false;
    try { await idbSet(name, value); persisted = true; } catch {}
    if (!persisted) { persisted = ssSet(name, value); }
    if (!persisted) { lsSet(name, value); }
    // Always also write to localStorage as belt-and-suspenders for WebViews
    lsSet(name, value);
  });
}

export async function getKey(name) {
  // Tier 1: memory
  if (_memCache.has(name)) return _memCache.get(name);

  // Tier 2: IndexedDB
  try {
    const val = await idbGet(name);
    if (val !== null && val !== undefined) {
      _memCache.set(name, val);
      return val;
    }
  } catch {}

  // Tier 3: sessionStorage
  const ssVal = ssGet(name);
  if (ssVal !== null) {
    _memCache.set(name, ssVal);
    return ssVal;
  }

  // Tier 4: localStorage
  const lsVal = lsGet(name);
  if (lsVal !== null) {
    _memCache.set(name, lsVal);
    return lsVal;
  }

  return undefined;
}

export async function deleteKey(name) {
  _memCache.delete(name);
  try { await idbDelete(name); } catch {}
  ssDel(name);
  lsDel(name);
}
