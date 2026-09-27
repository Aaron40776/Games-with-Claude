// Non-combat screens. Each renders into app.screenEl from the run state and
// calls run.js actions, then app.commit() saves and re-routes.

import { h, esc } from './dom.js';
import { icon, NODE_COLOR, NODE_LABEL, CELL_COLOR } from './icons.js';
import { cardEl } from './cardview.js';
import { relicEl, relicRow, shardsHtml } from './widgets.js';
import * as R from '../core/run.js';
import { MAP_ROWS, MAP_COLS } from '../core/map.js';
import { EVENTS } from '../data/events.js';
import { CELLS } from '../data/cells.js';
import { RELICS } from '../data/relics.js';
import { CARDS, cardName } from '../data/cards.js';
import { ENCOUNTERS, ENEMIES, ACT_NAMES } from '../data/enemies.js';
import { randomSeed, cleanSeed } from '../core/rng.js';
import { canInstall, install, watchInstall } from './shell.js';

function panel(cls, ...children) {
  return h(`section.panel.${cls}`, ...children);
}

// ================================================================ title ===

export function renderTitle(app) {
  const saved = app.savedRun;
  const seedInput = h('input#seed-input.seed-input', { type: 'text', placeholder: 'Random', maxlength: '12', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Seed' });
  const seedRow = h('div.seed-row', { hidden: true }, h('label', { for: 'seed-input' }, 'Seed'), seedInput);
  const newRun = () => {
    const seed = cleanSeed(seedInput.value) || randomSeed();
    if (saved) {
      app.confirm('Start a new run?', 'Your current run will be abandoned.', 'Abandon and start', () => app.startRun(seed));
    } else app.startRun(seed);
  };
  const m = app.meta;
  // Only on the published site (it ships a manifest), not yet installed, and only where installing works.
  const installLink = h('button.link', { type: 'button', hidden: !canInstall(), onclick: () => install(() => app.showInstallHelp()) }, 'Install app');
  watchInstall(() => { installLink.hidden = !canInstall(); });
  const el = h('div.title-screen',
    h('div.title-block',
      h('p.eyebrow', 'A Riftline deckbuilder'),
      h('h1.logo', h('span', 'RIFT'), h('span.logo-b', 'DECK')),
      h('p.tagline', 'Descend through three layers of the rift. Build a deck from salvaged tech, read what the enemy plans, and break the Heart before it breaks you.')),
    h('div.title-actions',
      saved && h('button.btn.primary.big', { type: 'button', onclick: () => app.continueRun() },
        h('span', 'Continue'), h('small', `Act ${saved.act} · Floor ${saved.floor} · ${saved.hp}/${saved.maxHp} HP`)),
      h(`button.btn.big${saved ? '' : '.primary'}`, { type: 'button', onclick: newRun }, h('span', 'New run'), h('small', 'Seed is random unless you set one')),
      seedRow,
      h('div.title-links',
        h('button.link', { type: 'button', onclick: () => { seedRow.hidden = !seedRow.hidden; if (!seedRow.hidden) seedInput.focus(); } }, 'Custom seed'),
        h('button.link', { type: 'button', onclick: () => app.showHelp() }, 'How to play'),
        h('button.link', { type: 'button', onclick: () => app.showSettings() }, 'Settings'),
        installLink)),
    h('div.title-stats',
      stat('Runs', m.runs), stat('Wins', m.wins), stat('Best floor', m.bestFloor), stat('Best score', m.bestScore)));
  return el;
}

function stat(label, value) {
  return h('div.stat', h('b', String(value)), h('span', label));
}

// ================================================================== map ===

export function renderMap(app) {
  const run = app.run;
  const map = run.map;
  const reach = new Set(R.reachableNodes(run));
  const visited = new Set(run.path);
  const narrow = window.innerWidth < 560;
  const W = Math.min(520, window.innerWidth - 32);
  const rowH = narrow ? 62 : 70;
  const padX = narrow ? 24 : 34;
  const padTop = 110;
  const padBottom = 50;
  const Hm = padTop + (MAP_ROWS - 1) * rowH + padBottom;
  const pos = (n) => {
    if (n.id === 'boss') return { x: W / 2, y: 52 };
    const jit = narrow ? 0.45 : 1;
    const x = padX + ((n.col + n.jx * jit) / (MAP_COLS - 1)) * (W - padX * 2);
    const y = Hm - padBottom - n.row * rowH + n.jy * rowH * 0.5 * jit;
    return { x, y };
  };

  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${Hm}`);
  svg.setAttribute('width', W);
  svg.setAttribute('height', Hm);
  svg.classList.add('map-lines');
  let lines = '';
  const onPath = (a, b) => {
    const i = run.path.indexOf(a);
    return i >= 0 && run.path[i + 1] === b;
  };
  for (const n of Object.values(map.nodes)) {
    for (const nid of n.next) {
      const m = map.nodes[nid];
      const a = pos(n);
      const b = pos(m);
      let cls = 'edge';
      if (onPath(n.id, nid)) cls += ' taken';
      else if (n.id === run.pos && reach.has(nid)) cls += ' open';
      lines += `<line class="${cls}" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/>`;
    }
  }
  svg.innerHTML = lines;

  const nodes = h('div.map-nodes', { style: { width: `${W}px`, height: `${Hm}px` } });
  nodes.appendChild(svg);
  for (const n of Object.values(map.nodes)) {
    const p = pos(n);
    const isReach = reach.has(n.id);
    const isCur = run.pos === n.id;
    const bossId = ENCOUNTERS[run.act].boss[0][0];
    const label = n.type === 'boss' ? ENEMIES[bossId].name : NODE_LABEL[n.type];
    const btn = h(`button.node.n-${n.type}`, {
      type: 'button',
      style: { left: `${p.x}px`, top: `${p.y}px`, color: NODE_COLOR[n.type] },
      html: icon(n.type),
      'aria-label': `${label}${isReach ? ' (available)' : ''}`,
      dataset: { node: n.id },
      onclick: () => {
        app.sfx.play(isReach ? 'map' : 'click');
        showInfo(n);
      },
    });
    if (isReach) btn.classList.add('reach');
    if (visited.has(n.id)) btn.classList.add('visited');
    if (isCur) btn.classList.add('current');
    if (n.type === 'boss') btn.appendChild(h('span.boss-name', label));
    nodes.appendChild(btn);
  }

  const legend = h('div.legend', ...['combat', 'elite', 'event', 'rest', 'shop', 'treasure'].map((t) =>
    h('span.lg', { style: { color: NODE_COLOR[t] }, html: `${icon(t)}<em>${NODE_LABEL[t]}</em>` })));

  // Info panel: tapping a room explains it; only the Enter button travels.
  const info = h('div.map-info', h('p.dim.map-info-empty', 'Tap a room to see what waits there.'));
  function showInfo(n) {
    for (const b of nodes.querySelectorAll('.node')) b.classList.toggle('picked', b.dataset.node === n.id);
    const d = roomInfo(run, n, reach.has(n.id), visited.has(n.id) || run.pos === n.id);
    const enter = d.canEnter && h('button.btn.primary.map-enter', {
      type: 'button',
      onclick: () => { app.sfx.play('map'); if (R.travel(run, n.id)) app.commit(); },
    }, 'Enter');
    info.replaceChildren(
      h('span.map-info-icon', { style: { color: NODE_COLOR[n.type] }, html: icon(n.type) }),
      h('div.map-info-text',
        h('p.map-info-floor', d.floorLabel),
        h('h3.map-info-title', d.title),
        h('p', d.text),
        d.details.length ? h('ul.map-info-details', ...d.details.map((x) => h('li', x))) : null,
        d.status && h('p.map-info-status', d.status)),
      enter || null);
    requestAnimationFrame(() => {
      // The panel grows when filled; keep the tapped room visible above it.
      nodes.querySelector(`[data-node="${n.id}"]`)?.scrollIntoView({ block: 'nearest' });
      enter?.focus({ preventScroll: true });
    });
  }

  const scroller = h('div.map-scroll', nodes);
  const el = h('div.map-screen',
    h('div.map-head',
      h('p.eyebrow', `Act ${run.act} of 3`),
      h('h2', ACT_NAMES[run.act]),
      h('p.dim', run.pos ? 'Choose your next room.' : 'Choose where to enter the layer.')),
    scroller,
    info,
    legend);
  // Scroll so the current row sits in the lower third.
  requestAnimationFrame(() => {
    const cur = run.pos ? map.nodes[run.pos] : null;
    const y = cur ? pos(cur).y : Hm;
    scroller.scrollTop = Math.max(0, y - scroller.clientHeight * 0.7);
  });
  return el;
}

const BOSS_INFO = {
  gatekeeper: 'A living seal that guards the first layer. It shields itself, strikes hard and charges a huge Rift Slam every few turns. Save Shield for that turn.',
  leviathan: 'A current given form. It floods your draw pile with Static and grows stronger once it drops below half HP.',
  heart: 'The source of the rift. It cannot lose more than 120 HP per turn, so this is a long fight. Its multi-hit barrage punishes low Shield.',
};

/** Everything the map info panel shows about a room. */
export function roomInfo(run, n, reachable, visited) {
  const floor = (run.act - 1) * (MAP_ROWS + 1) + n.row + 1;
  const d = { title: NODE_LABEL[n.type], text: '', details: [], floorLabel: n.type === 'boss' ? `Floor ${floor} · End of act ${run.act}` : `Floor ${floor}`, status: '', canEnter: reachable };
  const hp = `Your HP: ${run.hp}/${run.maxHp}`;
  switch (n.type) {
    case 'combat':
      d.text = 'A fight against one to three creatures of this layer.';
      d.details = ['Reward: Shards and a choice of 3 cards, sometimes a Cell'];
      if (run.easyLeft > 0) d.details.push('The first fights of each act use weaker enemies');
      d.details.push(hp);
      break;
    case 'elite':
      d.text = 'A powerful guardian. Much harder than a normal fight, but worth it.';
      d.details = ['Reward: a relic, more Shards and better card odds', hp];
      if (run.hp / run.maxHp < 0.5) d.details.push('Careful: you are below half HP');
      break;
    case 'rest': {
      const heal = Math.min(R.restHealAmount(run), run.maxHp - run.hp);
      d.text = 'A calm pocket in the rift. You can do one thing here.';
      d.details = [R.canRecover(run) ? `Recover: heal ${heal} HP` : 'Recover: blocked by Rift Engine', 'Tune: upgrade one card', hp];
      break;
    }
    case 'shop':
      d.text = 'The Drift Market. Buy cards, relics and Cells, or pay to remove a weak card.';
      d.details = [`Your Shards: ${run.shards}`, `Card removal: ${R.removalPrice(run)} Shards`];
      break;
    case 'event':
      d.text = 'Something unexpected: a find, a trade or a trap. You choose how to react.';
      d.details = ['Choices can cost HP or Shards, and some can start a fight'];
      break;
    case 'treasure':
      d.text = 'A sealed supply cache. No fight.';
      d.details = ['Contains a relic and some Shards'];
      break;
    case 'boss': {
      const id = ENCOUNTERS[run.act].boss[0][0];
      d.title = ENEMIES[id].name;
      d.text = BOSS_INFO[id] || 'The guardian of this layer.';
      d.details = [run.act < R.FINAL_ACT ? 'Reward: a rare card, a boss relic, then you descend and heal' : 'Defeat it to finish the run', hp];
      break;
    }
    default:
  }
  if (visited) d.status = run.pos === n.id ? 'You are here.' : 'Already visited.';
  else if (!reachable) d.status = 'Not reachable from where you are.';
  return d;
}

// ============================================================== rewards ===

export function rewardList(app, rw, { onDone, doneLabel = 'Continue' }) {
  const run = app.run;
  const list = h('div.rewards');
  if (rw.shards) {
    list.appendChild(h('button.reward', {
      type: 'button',
      onclick: () => { R.claimShards(run); app.sfx.play('coin'); app.commit(); },
      html: `${icon('shard', 'c-shards')}<span>${rw.shards} Shards</span>`,
    }));
  }
  if (rw.cell) {
    const full = !run.cells.includes(null);
    list.appendChild(h('button.reward', {
      type: 'button',
      disabled: full,
      onclick: () => { if (R.claimCell(run)) { app.sfx.play('cell'); app.commit(); } },
      html: `<span class="ico" style="color:${CELL_COLOR[rw.cell]}">${icon('cell')}</span><span>${esc(CELLS[rw.cell].name)}<small>${full ? 'Cell slots full' : esc(CELLS[rw.cell].desc)}</small></span>`,
    }));
  }
  rw.relics.forEach((id, i) => {
    if (!id) return;
    const btn = h('button.reward', { type: 'button', onclick: () => { R.claimRelic(run, i); app.sfx.play('relic'); app.commit(); } });
    btn.append(relicEl(id), h('span', RELICS[id].name, h('small', RELICS[id].desc)));
    list.appendChild(btn);
  });
  if (rw.cards) {
    list.appendChild(h('button.reward', {
      type: 'button',
      onclick: () => app.chooseRewardCard(),
      html: `${icon('deck', 'c-card')}<span>Add a card to your deck</span>`,
    }));
  }
  if (rw.bossRelics) {
    list.appendChild(h('button.reward.boss', {
      type: 'button',
      onclick: () => app.chooseBossRelic(),
      html: `${icon('boss', 'c-boss')}<span>Claim a boss relic</span>`,
    }));
  }
  const pending = !!(rw.shards || rw.cards || rw.bossRelics || rw.relics.some(Boolean) || (rw.cell && run.cells.includes(null)));
  const done = h(`button.btn${pending ? '' : '.primary'}`, {
    type: 'button',
    onclick: () => {
      if (pending && (rw.cards || rw.bossRelics || rw.relics.some(Boolean))) {
        app.confirm('Leave rewards behind?', 'Unclaimed rewards will be lost.', 'Leave them', onDone);
      } else onDone();
    },
  }, doneLabel);
  return h('div.reward-wrap', list, h('div.actions', done));
}

export function renderReward(app) {
  const run = app.run;
  const room = run.room;
  const title = room.type === 'boss' ? 'Boss defeated' : room.type === 'elite' ? 'Elite defeated' : 'Victory';
  const doneLabel = room.type === 'boss' ? (run.act >= R.FINAL_ACT ? 'Finish the run' : 'Descend deeper') : 'Continue';
  return panel('reward-panel',
    h('p.eyebrow', `Floor ${run.floor}`),
    h('h2', title),
    rewardList(app, room.rewards, { doneLabel, onDone: () => app.leaveRoom() }));
}

// =============================================================== event ====

export function renderEvent(app) {
  const run = app.run;
  const room = run.room;
  const ev = EVENTS[room.eventId];
  const body = h('div.event-body');
  if (room.stage === 'choose') {
    body.appendChild(h('p.event-text', ev.text));
    const opts = h('div.options');
    R.eventOptions(run).forEach((o, i) => {
      opts.appendChild(h('button.option', {
        type: 'button',
        disabled: o.disabled,
        onclick: () => { app.sfx.play('click'); if (R.chooseEventOption(run, i)) app.commit(); },
      }, h('b', o.label), h('span', o.disabled && o.reqText ? o.reqText : o.detail)));
    });
    body.appendChild(opts);
  } else {
    if (room.chosen) body.appendChild(h('p.event-choice', `You chose: ${room.chosen}`));
    body.appendChild(h('p.event-text', room.result));
    if (room.gained?.length) {
      const g = h('div.gained');
      for (const it of room.gained) {
        if (it.kind === 'relic') g.appendChild(relicRow(it.id));
        else if (it.kind === 'card') g.appendChild(h('div.gain-line', h('span', `Added ${cardName(it.id, it.up)} to your deck`)));
        else if (it.kind === 'upgrade') g.appendChild(h('div.gain-line', h('span', `Upgraded ${CARDS[it.id].name}`)));
        else if (it.kind === 'cell') g.appendChild(h('div.gain-line', { html: `<span class="ico" style="color:${CELL_COLOR[it.id]}">${icon('cell')}</span><span>Gained ${esc(CELLS[it.id].name)}</span>` }));
        else if (it.kind === 'note') g.appendChild(h('div.gain-line', h('span', it.text)));
      }
      body.appendChild(g);
    }
    if (room.lastChoice) {
      const verb = { remove: 'Removed', upgrade: 'Upgraded', duplicate: 'Duplicated' }[room.lastChoice.op];
      body.appendChild(h('div.gain-line', h('span', `${verb} ${room.lastChoice.cards.map((c) => CARDS[c.id].name).join(', ')}`)));
    }
    if (room.rewards) body.appendChild(rewardList(app, room.rewards, { onDone: () => app.leaveRoom() }));
    else body.appendChild(h('div.actions', h('button.btn.primary', { type: 'button', onclick: () => app.leaveRoom() }, 'Continue')));
  }
  return panel('event-panel',
    h('div.event-art', { html: eventArt(room.eventId) }),
    h('p.eyebrow', ev.opening ? 'The descent begins' : 'Unknown room'),
    h('h2', ev.name),
    body);
}

function eventArt(id) {
  let s = 0;
  for (const ch of id) s = (s * 31 + ch.charCodeAt(0)) >>> 0;
  const rnd = () => ((s = (s * 1103515245 + 12345) >>> 0) / 4294967296);
  let body = '';
  for (let i = 0; i < 9; i++) {
    const r = 12 + i * 11 + rnd() * 6;
    const sides = 3 + Math.floor(rnd() * 5);
    const rot = rnd() * Math.PI;
    const pts = [];
    for (let k = 0; k < sides; k++) {
      const a = rot + (k / sides) * Math.PI * 2;
      pts.push(`${(160 + Math.cos(a) * r).toFixed(1)},${(60 + Math.sin(a) * r * 0.55).toFixed(1)}`);
    }
    body += `<polygon points="${pts.join(' ')}" fill="none" stroke="currentColor" stroke-opacity="${0.5 - i * 0.045}" stroke-width="${i === 0 ? 1.6 : 0.8}"/>`;
  }
  body += '<path d="M160 8 L156 40 L164 62 L157 90 L161 112" stroke="#fff" stroke-width="1.4" fill="none" opacity=".85"/>';
  return `<svg viewBox="0 0 320 120" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${body}</svg>`;
}

// ================================================================ shop ====

export function renderShop(app) {
  const run = app.run;
  const room = run.room;
  const stock = room.stock;
  const buy = (i) => {
    const item = stock[i];
    if (item.sold) return;
    if (run.shards < item.price) { app.sfx.play('error'); app.toast('Not enough Shards.'); return; }
    if (item.kind === 'cell' && !run.cells.includes(null)) { app.sfx.play('error'); app.toast('Your Cell slots are full.'); return; }
    let preview;
    let name;
    if (item.kind === 'card') { preview = cardEl(item.id, item.up, { cls: 'preview' }); name = cardName(item.id, item.up); }
    if (item.kind === 'relic') { preview = relicRow(item.id); name = RELICS[item.id].name; }
    if (item.kind === 'cell') { preview = h('div.relic-row', h('span.relic.big', { style: { color: CELL_COLOR[item.id] }, html: icon('cell') }), h('div.relic-info', h('b', CELLS[item.id].name), h('span.dim', CELLS[item.id].desc))); name = CELLS[item.id].name; }
    app.confirm(`Buy ${name}?`, preview, `Buy for ${item.price}`, () => {
      if (R.buyItem(run, i)) { app.sfx.play('coin'); app.commit(); }
    });
  };
  const priceTag = (item) => h(`span.price${run.shards < item.price ? '.poor' : ''}${item.sale ? '.sale' : ''}`, { html: item.sold ? 'Sold' : shardsHtml(item.price) });

  const cards = h('div.shop-cards');
  const relics = h('div.shop-row');
  const cells = h('div.shop-row');
  stock.forEach((item, i) => {
    if (item.kind === 'card') {
      const wrap = h(`button.shop-card${item.sold ? '.sold' : ''}`, { type: 'button', onclick: () => buy(i), disabled: item.sold, 'aria-label': `${CARDS[item.id].name}, ${item.price} Shards` },
        cardEl(item.id, item.up, { cls: 'static' }), priceTag(item));
      if (item.sale) wrap.appendChild(h('span.sale-tag', 'Sale'));
      cards.appendChild(wrap);
    } else if (item.kind === 'relic') {
      const b = h(`button.shop-item${item.sold ? '.sold' : ''}`, { type: 'button', onclick: () => buy(i), disabled: item.sold },
        relicEl(item.id, { big: true }), h('span.shop-name', RELICS[item.id].name), priceTag(item));
      relics.appendChild(b);
    } else {
      const b = h(`button.shop-item${item.sold ? '.sold' : ''}`, { type: 'button', onclick: () => buy(i), disabled: item.sold, tip: `<b>${CELLS[item.id].name}</b><p>${CELLS[item.id].desc}</p>` },
        h('span.relic.big', { style: { color: CELL_COLOR[item.id] }, html: icon('cell') }), h('span.shop-name', CELLS[item.id].name), priceTag(item));
      cells.appendChild(b);
    }
  });
  const removePrice = R.removalPrice(run);
  const removeBtn = h(`button.shop-item.service${room.removed ? '.sold' : ''}`, {
    type: 'button',
    disabled: room.removed,
    onclick: () => {
      if (run.shards < removePrice) { app.sfx.play('error'); app.toast('Not enough Shards.'); return; }
      if (R.beginShopRemoval(run)) app.commit();
    },
  }, h('span.relic.big', { html: icon('close') }), h('span.shop-name', 'Remove a card'),
  h(`span.price${run.shards < removePrice ? '.poor' : ''}`, { html: room.removed ? 'Used' : shardsHtml(removePrice) }));
  cells.appendChild(removeBtn);

  return panel('shop-panel',
    h('p.eyebrow', 'Shop'),
    h('h2', 'Drift Market'),
    h('p.dim', 'A trader in a patched exosuit lays out salvage on a crate. Everything has a price.'),
    h('h3', 'Cards'), cards,
    h('h3', 'Relics'), relics,
    h('h3', 'Cells and services'), cells,
    h('div.actions', h('button.btn.primary', { type: 'button', onclick: () => app.leaveRoom() }, 'Leave')));
}

// ================================================================= rest ===

export function renderRest(app) {
  const run = app.run;
  const room = run.room;
  const amount = Math.min(R.restHealAmount(run), run.maxHp - run.hp);
  const canHeal = R.canRecover(run);
  if (room.done) {
    const text = room.done === 'recover'
      ? 'You patch your suit and let the hum of the rift fade for a while.'
      : `You recalibrate your gear. ${room.lastChoice ? `${CARDS[room.lastChoice.cards[0].id].name} is upgraded.` : ''}`;
    return panel('rest-panel',
      h('p.eyebrow', 'Rest site'), h('h2', 'Quiet pocket'), h('p.event-text', text),
      h('div.actions', h('button.btn.primary', { type: 'button', onclick: () => app.leaveRoom() }, 'Continue')));
  }
  return panel('rest-panel',
    h('p.eyebrow', 'Rest site'),
    h('h2', 'Quiet pocket'),
    h('p.dim', 'The rift is calm here. You have time for one thing.'),
    h('div.rest-options',
      h('button.rest-opt', {
        type: 'button', disabled: !canHeal,
        onclick: () => { if (R.restRecover(run)) { app.sfx.play('heal'); app.commit(); } },
        html: `${icon('rest', 'c-rest')}<b>Recover</b><span>${canHeal ? `Heal ${amount} HP` : 'Blocked by Rift Engine'}</span>`,
      }),
      h('button.rest-opt', {
        type: 'button',
        onclick: () => { if (R.beginRestUpgrade(run)) app.commit(); else app.toast('No cards left to upgrade.'); },
        html: `${icon('amp', 'c-upg')}<b>Tune</b><span>Upgrade a card</span>`,
      })),
    h('div.actions', h('button.link', { type: 'button', onclick: () => app.confirm('Skip the rest site?', 'You will leave without resting.', 'Skip', () => app.leaveRoom()) }, 'Skip')));
}

// ============================================================ treasure ===

export function renderTreasure(app) {
  const run = app.run;
  const room = run.room;
  if (!room.opened) {
    return panel('treasure-panel',
      h('p.eyebrow', 'Treasure'),
      h('h2', 'Supply cache'),
      h('p.dim', 'A sealed runner cache, still intact.'),
      h('button.chest', { type: 'button', onclick: () => { R.openTreasure(run); app.sfx.play('relic'); app.commit(); }, html: `${icon('treasure')}<span>Open</span>` }));
  }
  return panel('treasure-panel',
    h('p.eyebrow', 'Treasure'),
    h('h2', 'Supply cache'),
    room.relic ? relicRow(room.relic) : null,
    h('div.gain-line', { html: `${shardsHtml(room.shards)}<span>Shards collected</span>` }),
    h('div.actions', h('button.btn.primary', { type: 'button', onclick: () => app.leaveRoom() }, 'Continue')));
}

// ================================================================== end ===

export function renderEnd(app) {
  const run = app.run;
  const won = run.over === 'win';
  const s = run.stats;
  const score = R.computeScore(run);
  const mins = Math.max(1, Math.round((Date.now() - s.startedAt) / 60000));
  return panel(`end-panel.${won ? 'won' : 'lost'}`,
    h('p.eyebrow', won ? 'Run complete' : `Fell on floor ${run.floor}`),
    h('h2', won ? 'The Heart is broken' : 'The rift took you'),
    h('p.dim', won
      ? 'The rift seals behind you. For now, the layers are quiet.'
      : `Act ${run.act}, ${ACT_NAMES[run.act]}. Your gear drifts back to the surface without you.`),
    h('div.end-stats',
      stat('Score', score), stat('Floor', run.floor), stat('Enemies', s.kills), stat('Elites', s.elites),
      stat('Bosses', s.bosses), stat('Cards played', s.played), stat('Damage taken', s.taken), stat('Minutes', mins)),
    h('div.end-deck', h('h3', `Deck (${run.deck.length})`),
      h('p.dim', run.deck.map((c) => cardName(c.id, c.up)).sort().join(', '))),
    h('div.end-relics', ...run.relics.map((r) => relicEl(r.id, { counter: r.counter }))),
    h('p.dim.seed-line', `Seed ${run.seed}`),
    h('div.actions',
      h('button.btn.primary', { type: 'button', onclick: () => app.startRun(randomSeed()) }, 'New run'),
      h('button.btn', { type: 'button', onclick: () => app.startRun(run.seed) }, 'Same seed'),
      h('button.btn', { type: 'button', onclick: () => app.toTitle() }, 'Title')));
}
