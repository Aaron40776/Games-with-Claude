// Seeded random numbers. Every random decision in a run goes through one of
// these streams, so the same seed always produces the same run.

/** FNV-1a hash of a string -> unsigned 32-bit int. */
export function hashString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export class RNG {
  constructor(seed) {
    this.s = seed >>> 0;
  }

  /** Stream derived from a run seed plus a name, e.g. RNG.from('K3XQ', 'map-1'). */
  static from(seedStr, stream) {
    return new RNG(hashString(`${seedStr}|${stream}`));
  }

  /** mulberry32: float in [0, 1). */
  next() {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Integer in [min, max] (inclusive). */
  int(min, max) {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  chance(p) {
    return this.next() < p;
  }

  pick(arr) {
    return arr.length ? arr[Math.floor(this.next() * arr.length)] : undefined;
  }

  /** Fisher-Yates in place; returns the array. */
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  /** entries: [[value, weight], ...]; zero/negative weights are skipped. */
  weighted(entries) {
    const valid = entries.filter(([, w]) => w > 0);
    const total = valid.reduce((s, [, w]) => s + w, 0);
    if (!total) return undefined;
    let roll = this.next() * total;
    for (const [v, w] of valid) {
      roll -= w;
      if (roll < 0) return v;
    }
    return valid[valid.length - 1][0];
  }
}

const SEED_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Human-friendly 8 character seed (no 0/O/1/I confusion). */
export function randomSeed() {
  let out = '';
  for (let i = 0; i < 8; i++) out += SEED_CHARS[Math.floor(Math.random() * SEED_CHARS.length)];
  return out;
}

/** Normalizes user input into a valid seed string (or null if empty). */
export function cleanSeed(input) {
  const s = String(input || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
  return s.length ? s : null;
}
