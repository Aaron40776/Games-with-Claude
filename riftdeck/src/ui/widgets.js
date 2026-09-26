// Small reusable UI pieces: relic badges, cell slots, shard counters.

import { h, esc } from './dom.js';
import { icon, RELIC_ICON, RARITY_COLOR, CELL_COLOR } from './icons.js';
import { RELICS } from '../data/relics.js';
import { CELLS } from '../data/cells.js';

const RARITY_LABEL = { starter: 'Starter', common: 'Common', uncommon: 'Uncommon', rare: 'Rare', shop: 'Shop', boss: 'Boss' };

export function relicTip(id, counter) {
  const r = RELICS[id];
  const extra = counter !== undefined && id === 'tally_counter' ? `<p class="dim">Counter: ${counter}/10</p>` : '';
  const used = id === 'phoenix_sigil' && counter === 0 ? '<p class="dim">Already used.</p>' : '';
  return `<b>${esc(r.name)}</b><span class="tip-rarity" style="color:${RARITY_COLOR[r.rarity]}">${RARITY_LABEL[r.rarity]} relic</span><p>${esc(r.desc)}</p>${extra}${used}`;
}

export function relicEl(id, { counter, big = false } = {}) {
  const r = RELICS[id];
  const el = h(`span.relic${big ? '.big' : ''}`, {
    style: { color: RARITY_COLOR[r.rarity] },
    html: icon(RELIC_ICON[id] || 'hex'),
    dataset: { relic: id },
    'aria-label': r.name,
  });
  if (id === 'tally_counter' && counter !== undefined) el.appendChild(h('small.relic-count', String(counter)));
  if (id === 'phoenix_sigil' && counter === 0) el.classList.add('spent');
  el._tip = () => relicTip(id, counter);
  return el;
}

export function cellTip(id) {
  const c = CELLS[id];
  return `<b>${esc(c.name)}</b><p>${esc(c.desc)}</p><p class="dim">Single use. Tap during your turn to use it.</p>`;
}

export function cellEl(id) {
  if (!id) return h('span.cell.empty', { html: icon('cell'), 'aria-label': 'Empty cell slot', tip: '<b>Empty slot</b><p>Cells are single-use items found after combat and in shops.</p>' });
  return h('span.cell', { style: { color: CELL_COLOR[id] }, html: icon('cell'), 'aria-label': CELLS[id].name, tip: () => cellTip(id) });
}

export function shardsHtml(n) {
  return `<span class="shards">${icon('shard')}<b>${n}</b></span>`;
}

/** A tappable row describing a relic (for rewards, shop, boss choices). */
export function relicRow(id, extra = null) {
  const r = RELICS[id];
  return h('div.relic-row',
    relicEl(id, { big: true }),
    h('div.relic-info', h('b', r.name), h('span.dim', r.desc)),
    extra);
}
