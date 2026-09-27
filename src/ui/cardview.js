// Card rendering: frame, procedural art, rules text with live numbers.

import { CARDS, cardVals, cardFlag, baseCost, cardName } from '../data/cards.js';
import { h, esc, hash } from './dom.js';

export const TYPE_COLOR = {
  attack: '#ff6a3d', skill: '#36c9f0', power: '#b98cff', status: '#7d8799', curse: '#c0457a',
};

export const KEYWORDS = {
  Shield: 'Blocks incoming damage. Expires at the start of your next turn.',
  Amp: 'Attacks deal 1 additional damage per stack.',
  Plating: 'Cards grant additional Shield per stack.',
  Exposed: 'Takes 50% more damage from attacks.',
  Jammed: 'Deals 25% less attack damage.',
  Fragile: 'Gains 25% less Shield from cards.',
  Burn: 'At the start of its turn, loses HP equal to Burn. Then Burn decreases by 1.',
  Charge: 'Stored rift energy. Discharge effects consume it.',
  Spikes: 'Whenever attacked, deals damage back to the attacker.',
  Phased: 'All damage taken is reduced to 1.',
  Fade: 'After it is played, the card is removed for the rest of combat.',
  Volatile: 'If it is still in your hand at the end of your turn, it Fades.',
  Hold: 'Stays in your hand at the end of your turn.',
  Opening: 'Starts each combat in your hand.',
  Unplayable: 'Cannot be played.',
  Energy: 'Spent to play cards. Refills at the start of your turn.',
};

const KW_RE = new RegExp(`\\b(${Object.keys(KEYWORDS).join('|')})\\b`, 'g');

const FLAG_ORDER = [['unplayable', 'Unplayable'], ['opening', 'Opening'], ['hold', 'Hold'], ['volatile', 'Volatile'], ['fade', 'Fade']];

export function cardFlags(id, up) {
  return FLAG_ORDER.filter(([f]) => cardFlag(id, up, f)).map(([, label]) => label);
}

/**
 * Rules text as HTML. In combat (g given) numbers include Amp/Jammed/etc.
 * and are colored green/red; out of combat upgraded numbers are green.
 */
export function cardTextHtml(id, up, { g = null, target = null, inst = null } = {}) {
  const def = CARDS[id];
  let v = cardVals(id, up);
  const baseV = cardVals(id, false);
  if (g && inst && def.dyn) v = def.dyn(g, { ...v, x: g.energy }, inst);
  let text = g && inst && def.combatText ? def.combatText : def.text;
  text = esc(text).replace(/\{([DS]):(\w+)\}|\{(\w+)\}/g, (m, kind, key, plain) => {
    if (plain) {
      if (def.words?.[plain]) return def.words[plain](v);
      const val = v[plain];
      const cls = up && !g && baseV[plain] !== undefined && baseV[plain] !== val ? 'upg' : '';
      return `<b class="num ${cls}">${val}</b>`;
    }
    const base = v[key];
    let shown = base;
    if (g) shown = kind === 'D' ? g.previewAttack(base, target) : g.previewShield(base);
    let cls = '';
    if (g) cls = shown > base ? 'up' : shown < base ? 'down' : '';
    else if (up && baseV[key] !== undefined && baseV[key] !== base) cls = 'upg';
    return `<b class="num ${cls}">${shown}</b>`;
  });
  text = text.replace(KW_RE, '<b class="kw">$1</b>');
  const flags = cardFlags(id, up);
  if (flags.length) text += `<span class="flags">${flags.map((f) => `<b class="kw">${f}</b>`).join(' · ')}</span>`;
  return text;
}

/** Keywords mentioned by a card (for tooltips). */
export function cardKeywords(id, up) {
  const def = CARDS[id];
  const found = new Set();
  for (const m of (def.text + ' ' + (def.combatText || '')).matchAll(KW_RE)) found.add(m[1]);
  for (const f of cardFlags(id, up)) found.add(f);
  if (def.cost === 'X') found.add('X');
  return [...found];
}

export function keywordTipHtml(words) {
  return words.map((w) => {
    const d = w === 'X' ? 'X is all the Energy you have when you play the card.' : KEYWORDS[w];
    return `<div class="tip-row"><b>${w}</b><span>${d}</span></div>`;
  }).join('');
}

// ---------------------------------------------------------------- art ----

const artCache = new Map();

/** Procedural emblem per card: deterministic from its id, colored by type. */
export function cardArt(id) {
  if (artCache.has(id)) return artCache.get(id);
  const def = CARDS[id];
  const c = TYPE_COLOR[def.type];
  let s = hash(id);
  const rnd = () => ((s = Math.imul(s ^ (s >>> 15), 2246822507) ^ Math.imul(s ^ (s >>> 13), 3266489909)) >>> 0) / 4294967296;
  const cx = 50;
  const cy = 30;
  let body = '';
  // Background rays / grid
  const rays = 5 + Math.floor(rnd() * 7);
  const rot0 = rnd() * 360;
  for (let i = 0; i < rays; i++) {
    const a = ((rot0 + (i * 360) / rays) * Math.PI) / 180;
    const r1 = 8 + rnd() * 6;
    const r2 = 34 + rnd() * 30;
    body += `<line x1="${cx + Math.cos(a) * r1}" y1="${cy + Math.sin(a) * r1}" x2="${cx + Math.cos(a) * r2}" y2="${cy + Math.sin(a) * r2}" stroke="${c}" stroke-opacity="${0.12 + rnd() * 0.22}" stroke-width="${0.4 + rnd() * 0.8}"/>`;
  }
  // Concentric polygons
  const rings = 2 + Math.floor(rnd() * 3);
  for (let k = 0; k < rings; k++) {
    const sides = 3 + Math.floor(rnd() * 6);
    const r = 9 + k * (6 + rnd() * 5);
    const rot = rnd() * Math.PI;
    const pts = [];
    for (let i = 0; i < sides; i++) {
      const a = rot + (i * Math.PI * 2) / sides;
      pts.push(`${(cx + Math.cos(a) * r).toFixed(1)},${(cy + Math.sin(a) * r * 0.9).toFixed(1)}`);
    }
    body += `<polygon points="${pts.join(' ')}" fill="none" stroke="${c}" stroke-opacity="${0.35 + rnd() * 0.4}" stroke-width="${k === 0 ? 1.4 : 0.8}" ${rnd() > 0.6 ? 'stroke-dasharray="2 2"' : ''}/>`;
  }
  // Floating bits
  const bits = 4 + Math.floor(rnd() * 6);
  for (let i = 0; i < bits; i++) {
    const x = 8 + rnd() * 84;
    const y = 6 + rnd() * 48;
    body += rnd() > 0.5
      ? `<circle cx="${x}" cy="${y}" r="${0.6 + rnd() * 1.4}" fill="${c}" fill-opacity="${0.4 + rnd() * 0.5}"/>`
      : `<rect x="${x}" y="${y}" width="${1 + rnd() * 3}" height="${0.8 + rnd() * 1.2}" fill="${c}" fill-opacity="${0.3 + rnd() * 0.5}" transform="rotate(${rnd() * 90} ${x} ${y})"/>`;
  }
  // Type emblem
  const emb = {
    attack: `<path d="M${cx - 12} ${cy + 10} L${cx + 10} ${cy - 12} L${cx + 13} ${cy - 13} L${cx + 12} ${cy - 10} L${cx - 10} ${cy + 12}Z" fill="${c}"/><path d="M${cx - 15} ${cy + 5} L${cx - 5} ${cy + 15}" stroke="#fff" stroke-opacity=".8" stroke-width="1.6"/>`,
    skill: `<path d="M${cx} ${cy - 13} L${cx + 11} ${cy - 6.5} L${cx + 11} ${cy + 6.5} L${cx} ${cy + 13} L${cx - 11} ${cy + 6.5} L${cx - 11} ${cy - 6.5}Z" fill="${c}" fill-opacity=".25" stroke="${c}" stroke-width="1.6"/><circle cx="${cx}" cy="${cy}" r="3.5" fill="#fff" fill-opacity=".85"/>`,
    power: `<circle cx="${cx}" cy="${cy}" r="12" fill="none" stroke="${c}" stroke-width="1.6"/><circle cx="${cx}" cy="${cy}" r="6.5" fill="${c}" fill-opacity=".35" stroke="${c}"/><circle cx="${cx}" cy="${cy}" r="2.4" fill="#fff"/>`,
    status: `<rect x="${cx - 12}" y="${cy - 5}" width="24" height="4" fill="${c}"/><rect x="${cx - 6}" y="${cy + 2}" width="18" height="3" fill="${c}" fill-opacity=".6"/><rect x="${cx - 14}" y="${cy - 11}" width="10" height="3" fill="${c}" fill-opacity=".5"/>`,
    curse: `<path d="M${cx} ${cy - 13} L${cx + 3} ${cy - 2} L${cx - 3} ${cy + 3} L${cx} ${cy + 13}" stroke="${c}" stroke-width="2.4" fill="none"/>`,
  }[def.type];
  body += emb;
  const svg = `<svg viewBox="0 0 100 60" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><defs><radialGradient id="g${hash(id) % 99999}" cx="50%" cy="50%" r="70%"><stop offset="0" stop-color="${c}" stop-opacity=".32"/><stop offset="1" stop-color="#05060c" stop-opacity="0"/></radialGradient></defs><rect width="100" height="60" fill="url(#g${hash(id) % 99999})"/>${body}</svg>`;
  artCache.set(id, svg);
  return svg;
}

// --------------------------------------------------------------- frame ----

/**
 * Build a card element.
 * opts: { g, inst, target, cost (override), cls }
 */
export function cardEl(id, up, opts = {}) {
  const def = CARDS[id];
  const color = TYPE_COLOR[def.type];
  const el = h(`div.card.t-${def.type}.r-${def.rarity}`, { style: { '--tc': color } });
  if (up) el.classList.add('upgraded');
  if (opts.cls) el.className += ` ${opts.cls}`;
  el.dataset.id = id;
  const frame = h('div.c-frame');
  const inner = h('div.c-inner');
  frame.appendChild(inner);
  el.appendChild(frame);
  fillCard(el, id, up, opts);
  return el;
}

/** (Re)fill card contents, e.g. when numbers change during combat. */
export function fillCard(el, id, up, { g = null, inst = null, target = null, cost } = {}) {
  const def = CARDS[id];
  const inner = el.querySelector('.c-inner');
  let c = cost !== undefined ? cost : baseCost(id, up);
  if (def.cost === 'X') c = 'X';
  const costHtml = c === null || c === undefined ? '' : `<div class="c-cost${cost !== undefined && cost !== baseCost(id, up) && def.cost !== 'X' ? ' mod' : ''}"><span>${c}</span></div>`;
  inner.innerHTML = `${costHtml}
    <div class="c-name${cardName(id, up).length > 14 ? ' long' : ''}">${esc(cardName(id, up))}</div>
    <div class="c-art">${cardArt(id)}</div>
    <div class="c-type"><i class="gem"></i>${def.type}</div>
    <div class="c-text"><div>${cardTextHtml(id, up, { g, target, inst })}</div></div>`;
}
