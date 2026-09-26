// localStorage wrappers. Storage can be unavailable (private mode, previews),
// so every access is guarded and the game works without it.

import { serializeRun, deserializeRun } from '../core/run.js';

const KEYS = { run: 'riftdeck.run.v1', meta: 'riftdeck.meta.v1', settings: 'riftdeck.settings.v1' };

function read(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function write(key, value) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function loadRun() {
  const s = read(KEYS.run);
  return s ? deserializeRun(s) : null;
}
export function saveRun(run) { write(KEYS.run, run ? serializeRun(run) : null); }
export function clearRun() { write(KEYS.run, null); }

const DEFAULT_SETTINGS = { sound: true, music: true, speed: 'normal', quality: 'high' };

export function loadSettings() {
  try {
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(read(KEYS.settings)) || {}) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}
export function saveSettings(s) { write(KEYS.settings, JSON.stringify(s)); }

const DEFAULT_META = { runs: 0, wins: 0, bestFloor: 0, bestScore: 0, history: [] };

export function loadMeta() {
  try {
    return { ...DEFAULT_META, ...(JSON.parse(read(KEYS.meta)) || {}) };
  } catch {
    return { ...DEFAULT_META };
  }
}
export function saveMeta(m) { write(KEYS.meta, JSON.stringify(m)); }
