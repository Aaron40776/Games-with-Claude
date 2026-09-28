// Combat screen: hand of cards, unit overlays, targeting and the event
// playback that turns engine events into animations.

import { h, clear, wait, esc, clamp, prefersReducedMotion } from './dom.js';
import { cardEl, fillCard, cardKeywords, keywordTipHtml, TYPE_COLOR } from './cardview.js';
import { icon, STATUS_ICON, INTENT_COLOR, CELL_COLOR } from './icons.js';
import { STATUSES } from '../data/statuses.js';
import { CELLS } from '../data/cells.js';
import { RELICS } from '../data/relics.js';
import { bump, burst } from './juice.js';

const BEAM_CARDS = new Set(['rail_spike', 'pierce_veil', 'rift_tear', 'fusion_beam', 'singularity', 'discharge']);
const QUIET_STATUSES = new Set(['charge', 'surge', 'minion', 'countdown']);

export class CombatView {
  constructor(app, g) {
    this.app = app;
    this.g = g;
    this.scene = app.scene;
    this.busy = false;
    this.selected = null;
    this.inspected = null;
    this.ptr = null;
    this.aimTarget = null;
    this.kbTarget = null;
    this.pendingCell = null;
    this.display = new Map();
    this.cardEls = new Map();
    this.unitEls = new Map();
    this.hitRects = new Map();
    this.hideIntents = g.run.relics.some((r) => RELICS[r.id].hideIntents);
    this.build();
  }

  // --------------------------------------------------------------- build --

  build() {
    const root = h('div.combat');
    this.root = root;
    this.unitsLayer = h('div.units');
    this.popLayer = h('div.pops');
    this.fxLayer = h('div.fx-layer');
    this.banner = h('div.banner', { hidden: true });
    this.hint = h('div.hint', { hidden: true });
    this.handEl = h('div.hand');
    this.playZone = h('div.play-zone', { hidden: true }, h('span'));

    this.energyEl = h('div.energy', { tip: () => `<b>Energy</b><p>Spent to play cards. You have ${this.g.energy} of ${this.g.maxEnergy()} this turn.</p>` });
    this.drawBtn = h('button.pile.draw-pile', { type: 'button', 'aria-label': 'Draw pile', onclick: () => this.showPile('draw') });
    this.discardBtn = h('button.pile.discard-pile', { type: 'button', 'aria-label': 'Discard pile', onclick: () => this.showPile('discard') });
    this.fadedBtn = h('button.pile.faded-pile', { type: 'button', 'aria-label': 'Faded cards', onclick: () => this.showPile('faded') });
    this.endBtn = h('button.btn.end-turn', { type: 'button', onclick: () => this.endTurn() }, 'End Turn');
    const left = h('div.bar-left', this.energyEl, this.drawBtn);
    const right = h('div.bar-right', this.fadedBtn, this.discardBtn, this.endBtn);

    root.append(this.unitsLayer, this.popLayer, this.playZone, this.fxLayer, this.handEl, left, right, this.hint, this.banner);
    this.app.stage.appendChild(root);

    this.handEl.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    this.handEl.addEventListener('pointermove', (e) => this.onPointerMove(e));
    this.handEl.addEventListener('pointerup', (e) => this.onPointerUp(e));
    this.handEl.addEventListener('pointercancel', (e) => this.cancelPointer(e));
    this.handEl.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'mouse' && !this.ptr && !this.selected) this.setInspected(null);
    });
    this.onKey = (e) => this.handleKey(e);
    window.addEventListener('keydown', this.onKey);
    this.onResize = () => { this.layoutHand(); };
    window.addEventListener('resize', this.onResize);
    root.addEventListener('pointerdown', (e) => {
      if (e.target === root || e.target === this.unitsLayer) this.deselect();
    });

    const g = this.g;
    this.scene.setupCombat(g.enemies.map((e) => ({ ref: e.ref, def: e.def })));
    for (const u of [g.player, ...g.enemies]) {
      this.display.set(u.ref, { hp: u.hp, shield: u.shield });
      this.makeUnitEl(u);
    }
    this.scene.onFrame = () => { this.positionOverlays(); this.dragFrame(); };
    this.updateInsets();
  }

  updateInsets() {
    const cw = this.cardWidth();
    const top = this.app.hudHeight();
    const bottom = cw * 1.4 * 0.86 + 56 + safeBottom();
    this.scene.setInsets(top, bottom);
  }

  cardWidth() {
    return parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--cw')) || 140;
  }

  async start() {
    this.busy = true;
    this.app.sfx.setAct(this.g.run.act);
    await wait(this.d(500));
    await this.process();
    if (this.destroyed) return;
    this.busy = false;
    this.refresh();
    // A fight can already be over after setup (e.g. start-of-turn damage), so don't wait for input.
    await this.checkOutcome();
  }

  destroy() {
    this.destroyed = true;
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('resize', this.onResize);
    this.scene.onFrame = null;
    this.root.remove();
  }

  d(ms) { return ms / (this.app.settings.speed === 'fast' ? 1.8 : 1); }

  // -------------------------------------------------------- unit overlays --

  makeUnitEl(u) {
    const el = h('div.unit', { dataset: { ref: u.ref } });
    if (u.isPlayer) el.classList.add('is-player');
    const intent = h('div.intent');
    const name = h('div.u-name', u.isPlayer ? '' : u.name);
    const hpFill = h('div.hp-fill');
    // Trails behind the fill after a hit, so the lost chunk stays visible for a moment.
    const hpLag = h('div.hp-lag');
    const hpText = h('span.hp-text');
    const shield = h('span.u-shield');
    const hp = h('div.hp', hpLag, hpFill, hpText, shield);
    const statuses = h('div.statuses');
    const hit = h('div.hitbox');
    el.append(hit, intent, h('div.u-plate', name, hp, statuses));
    if (!u.isPlayer) {
      el.addEventListener('click', () => this.onEnemyTap(u.ref));
      intent._tip = () => this.intentTip(u.ref);
    }
    this.unitsLayer.appendChild(el);
    this.unitEls.set(u.ref, { el, intent, hpFill, hpLag, hpText, shield, statuses, hit, plate: el.lastChild, shown: null });
    this.renderUnit(u.ref);
  }

  renderUnit(ref) {
    const g = this.g;
    const u = g.unitByRef(ref);
    const parts = this.unitEls.get(ref);
    if (!u || !parts) return;
    const d = this.display.get(ref) || { hp: u.hp, shield: u.shield };
    const pct = clamp(d.hp / u.maxHp, 0, 1);
    parts.hpFill.style.width = `${pct * 100}%`;
    parts.hpLag.style.width = `${pct * 100}%`;
    parts.hpText.textContent = `${Math.max(0, d.hp)}/${u.maxHp}`;
    // Changes since the last render get a short bump, so the eye finds them.
    const prev = parts.shown;
    if (prev && d.shield > prev.shield) bump(parts.shield);
    parts.shield.innerHTML = d.shield > 0 ? `${icon('defend')}<b>${d.shield}</b>` : '';
    parts.el.classList.toggle('has-shield', d.shield > 0);
    // statuses
    clear(parts.statuses);
    for (const [id, n] of Object.entries(u.statuses)) {
      const def = STATUSES[id];
      if (!def) continue;
      const [ico, color] = STATUS_ICON[id] || ['unknown', '#fff'];
      const s = h('span.st', { style: { color }, html: `${icon(ico)}<b>${id === 'minion' ? '' : n}</b>` });
      s.classList.add(def.kind === 'debuff' ? 'debuff' : 'buff');
      if (prev && prev.statuses[id] === undefined) s.classList.add('st-new');
      else if (prev && prev.statuses[id] !== n) s.classList.add('st-bump');
      s._tip = () => `<b>${def.name}</b><p>${esc(def.desc(u.statuses[id] ?? n))}</p>`;
      parts.statuses.appendChild(s);
    }
    parts.shown = { shield: d.shield, statuses: { ...u.statuses } };
    // intent
    if (!u.isPlayer) this.renderIntent(u, parts.intent);
    this.scene.setState(ref, {
      shield: d.shield, burn: u.statuses.burn || 0, charge: u.isPlayer ? (u.statuses.charge || 0) : 0,
      phased: u.statuses.phased || 0, countdown: u.statuses.countdown || 0,
    });
    if (u.isPlayer) this.app.updateHud({ hp: d.hp, maxHp: u.maxHp });
  }

  renderIntent(e, el) {
    if (!e.alive || this.g.phase === 'over') { el.innerHTML = ''; el._html = ''; return; }
    if (this.hideIntents) {
      el.innerHTML = `<span class="it" style="color:${INTENT_COLOR.unknown}">${icon('unknown')}</span>`;
      return;
    }
    const it = this.g.intentOf(e);
    if (!it) { el.innerHTML = ''; el._html = ''; return; }
    const main = it.type;
    const color = INTENT_COLOR[main] || '#fff';
    let html = `<span class="it" style="color:${color}">${icon(main)}`;
    if (it.dmg !== null) html += `<b>${it.dmg}${it.hits > 1 ? `<small>×${it.hits}</small>` : ''}</b>`;
    html += '</span>';
    for (const t of it.types.slice(1)) html += `<span class="it sub" style="color:${INTENT_COLOR[t]}">${icon(t)}</span>`;
    // Only a new intent is redrawn, and it pops in so the change is noticed.
    if (el._html === html) return;
    el._html = html;
    el.innerHTML = html;
    bump(el, 'fresh');
  }

  intentTip(ref) {
    const e = this.g.enemyByRef(ref);
    if (!e || !e.alive) return '';
    if (this.hideIntents) return '<b>Hidden</b><p>The Hollow Crown hides enemy intents.</p>';
    const it = this.g.intentOf(e);
    const m = it.move;
    const lines = [];
    if (it.dmg !== null) lines.push(`Attacks for <b>${it.dmg}</b>${it.hits > 1 ? ` × ${it.hits}` : ''} damage.`);
    if (m.shield) lines.push(`Gains ${m.shield} Shield.`);
    if (m.shieldAll) lines.push(`Gives all enemies ${m.shieldAll} Shield.`);
    if (m.buff) lines.push(`Gains ${Object.entries(m.buff).map(([id, n]) => `${n} ${STATUSES[id].name}`).join(', ')}.`);
    if (m.buffAll) lines.push(`All enemies gain ${Object.entries(m.buffAll).map(([id, n]) => `${n} ${STATUSES[id].name}`).join(', ')}.`);
    if (m.debuff) lines.push(`Applies ${Object.entries(m.debuff).map(([id, n]) => `${n} ${STATUSES[id].name}`).join(', ')} to you.`);
    if (m.addCards) lines.push(`Adds ${m.addCards.map((c) => `${c.n} ${c.id === 'static' ? 'Static' : 'Scorch'}`).join(' and ')} to your ${m.addCards[0].to === 'draw' ? 'draw' : 'discard'} pile.`);
    if (m.heal) lines.push(`Heals ${m.heal} HP.`);
    if (m.summon) lines.push('Summons reinforcements.');
    if (m.intent === 'charge') lines.push('Charging a powerful attack.');
    if (m.intent === 'unknown' && !lines.length) lines.push('Its intent is unclear.');
    return `<b>${esc(it.name)}</b><p>${lines.join(' ')}</p>`;
  }

  positionOverlays() {
    for (const [ref, parts] of this.unitEls) {
      const p = this.scene.project(ref);
      if (!p) { parts.el.style.display = 'none'; continue; }
      parts.el.style.display = '';
      const plateW = Math.max(84, Math.min(160, p.halfW * 2 + 6));
      parts.el.style.transform = `translate(${p.x}px, ${p.footY}px)`;
      parts.el.style.setProperty('--pw', `${plateW}px`);
      const hgt = Math.max(30, p.footY - p.headY);
      parts.intent.style.transform = `translate(-50%, ${-hgt - 34}px)`;
      parts.hit.style.cssText = `width:${Math.max(64, p.halfW * 2)}px;height:${hgt + 10}px;transform:translate(-50%, ${-hgt - 6}px)`;
      this.hitRects.set(ref, { x0: p.x - Math.max(32, p.halfW), x1: p.x + Math.max(32, p.halfW), y0: p.headY - 30, y1: p.footY + 44 });
    }
  }

  // ------------------------------------------------------------- hand ------

  syncHandEls() {
    const hand = this.g.hand;
    for (const [uid, el] of this.cardEls) {
      if (!hand.some((c) => c.uid === uid) && !el.classList.contains('leaving')) { el.remove(); this.cardEls.delete(uid); }
    }
    for (const c of hand) if (!this.cardEls.has(c.uid)) this.createCardEl(c, 'draw');
  }

  createCardEl(c, from = 'draw') {
    const el = cardEl(c.id, c.up, { g: this.g, inst: c, cost: this.g.costOf(c) });
    el.classList.add('in-hand');
    el.dataset.uid = c.uid;
    const origin = (from === 'discard' ? this.discardBtn : this.drawBtn).getBoundingClientRect();
    el.style.transition = 'none';
    el.style.transform = `translate(${origin.left}px, ${origin.top - 40}px) scale(.25) rotate(${from === 'draw' ? -20 : 20}deg)`;
    el.style.opacity = '0';
    if (!prefersReducedMotion()) {
      // Arrives face down and flips over on its way into the hand.
      el.classList.add('drawn');
      el.appendChild(h('div.c-back'));
      setTimeout(() => { el.classList.remove('drawn'); el.querySelector('.c-back')?.remove(); }, 600);
    }
    this.handEl.appendChild(el);
    this.cardEls.set(c.uid, el);
    void el.offsetWidth;
    el.style.transition = '';
    el.style.opacity = '1';
    return el;
  }

  layoutHand() {
    // A card held by the pointer leaves its slot, so the rest of the hand closes up.
    const hand = this.g.hand.filter((c) => c.uid !== this.dragUid);
    const n = hand.length;
    const W = window.innerWidth;
    const H = window.innerHeight;
    const cw = this.cardWidth();
    const ch = cw * 1.4;
    const sb = safeBottom();
    const span = Math.min(W - 24 - cw, n * cw * 0.9);
    const step = n > 1 ? Math.min(cw * 0.92, span / (n - 1)) : 0;
    const x0 = W / 2 - (step * (n - 1)) / 2;
    // While the enemies act (as played back, not as the engine already is) the hand sinks a little.
    const resting = this.enemyPhase && !prefersReducedMotion();
    const baseY = H - sb - ch * 0.86 - 8 + (resting ? ch * 0.2 : 0);
    const coarse = matchMedia('(pointer: coarse)').matches;
    const liftScale = coarse ? 1.55 : 1.3;
    // With a mouse, the neighbours of an enlarged card slide aside so it can be read whole.
    const liftIdx = coarse || this.dragUid ? -1 : hand.findIndex((c) => c.uid === this.inspected || c.uid === this.selected);
    const push = liftIdx >= 0 ? Math.max(0, cw * (liftScale / 2 + 0.5) * 0.9 - step) : 0;
    hand.forEach((c, i) => {
      const el = this.cardEls.get(c.uid);
      if (!el || el.classList.contains('dragging') || el.classList.contains('leaving')) return;
      const off = i - (n - 1) / 2;
      let x = x0 + step * i - cw / 2;
      if (push && i !== liftIdx) x += Math.sign(i - liftIdx) * push * (Math.abs(i - liftIdx) === 1 ? 1 : 0.85);
      let y = baseY + off * off * (coarse ? 2.2 : 3);
      let rot = clamp(off * (n > 6 ? 2.5 : 4), -14, 14);
      let scale = 1;
      let z = 10 + i;
      const lifted = this.inspected === c.uid || this.selected === c.uid;
      if (lifted) {
        scale = liftScale;
        y = H - sb - ch - 12;
        x = clamp(x, (cw * (scale - 1)) / 2 + 8, W - cw - (cw * (scale - 1)) / 2 - 8);
        rot = 0;
        z = 100;
      }
      el.style.zIndex = z;
      el.style.transform = `translate(${x}px, ${y}px) rotate(${rot}deg) scale(${scale})`;
      el.classList.toggle('lifted', lifted);
      el.classList.toggle('selected', this.selected === c.uid);
    });
    this.handGeom = { x0, step, n, top: baseY - 10 };
    this.updateKeywordTip();
  }

  refresh() {
    const g = this.g;
    this.syncHandEls();
    for (const c of g.hand) {
      const el = this.cardEls.get(c.uid);
      if (!el) continue;
      const tgt = this.selected === c.uid || this.dragUid === c.uid ? (this.aimTarget ? g.enemyByRef(this.aimTarget) : null) : null;
      fillCard(el, c.id, c.up, { g, inst: c, target: tgt, cost: g.costOf(c) });
      const playable = !this.busy && g.phase === 'player' && g.canPlay(c);
      el.classList.toggle('playable', playable);
      el.classList.toggle('unaffordable', g.costOf(c) !== null && g.costOf(c) !== 'X' && g.costOf(c) > g.energy);
    }
    this.layoutHand();
    this.renderBar();
    const myTurn = g.phase === 'player' && !this.busy;
    this.endBtn.disabled = !myTurn || !!g.pending;
    this.endBtn.classList.toggle('glow', myTurn && !g.hand.some((c) => g.canPlay(c)));
    for (const u of [g.player, ...g.enemies]) if (this.unitEls.has(u.ref)) this.renderUnit(u.ref);
    this.app.renderCells(this);
  }

  setInspected(uid) {
    if (this.inspected === uid) return;
    this.inspected = uid;
    if (uid && this.app.settings.sound) this.app.sfx.play('hover');
    this.layoutHand();
  }

  select(uid) {
    this.pendingCell = null;
    this.selected = uid;
    this.inspected = uid;
    this.aimTarget = null;
    this.kbTarget = null;
    const c = this.cardByUid(uid);
    const targeted = c && this.g.needsTarget(c) && this.g.aliveEnemies().length > 1;
    if (c && this.tapMode()) this.showHint(targeted ? 'Tap an enemy to target' : 'Tap again or swipe up to play');
    else if (c) this.showHint(targeted ? 'Swipe the card onto an enemy' : 'Swipe the card up to play');
    this.refresh();
  }

  deselect() {
    this.selected = null;
    this.inspected = null;
    this.aimTarget = null;
    this.kbTarget = null;
    this.pendingCell = null;
    this.hideHint();
    this.highlightTarget(null);
    this.refresh();
  }

  updateKeywordTip() {
    const uid = this.selected || (this.inspected && !this.ptr ? this.inspected : null);
    const el = uid && this.cardEls.get(uid);
    if (!el || this.dragUid) { if (this.tipShown) { this.app.tips.hide(); this.tipShown = false; } return; }
    const c = this.cardByUid(uid);
    const words = cardKeywords(c.id, c.up);
    if (!words.length) { if (this.tipShown) { this.app.tips.hide(); this.tipShown = false; } return; }
    requestAnimationFrame(() => {
      if ((this.selected || this.inspected) !== uid) return;
      const side = window.innerWidth < 700 ? 'top' : 'right';
      this.app.tips.show(el.getBoundingClientRect(), keywordTipHtml(words), side);
      this.tipShown = true;
    });
  }

  cardByUid(uid) { return this.g.hand.find((c) => c.uid === uid) || null; }

  cardAtX(x) {
    const hg = this.handGeom;
    if (!hg || !hg.n) return null;
    const i = hg.step ? Math.round((x - hg.x0) / hg.step) : 0;
    const c = this.g.hand[clamp(i, 0, hg.n - 1)];
    return c ? c.uid : null;
  }

  // ------------------------------------------------------------ pointer ----

  canInteract() { return !this.busy && this.g.phase === 'player' && !this.g.pending && !this.g.outcome; }

  onPointerDown(e) {
    const cardNode = e.target.closest('.card.in-hand');
    // One card at a time: a second finger must not take over an active press or drag.
    if (!cardNode || !this.canInteract() || this.ptr) return;
    e.preventDefault();
    this.app.sfx.unlock();
    const uid = cardNode.dataset.uid;
    this.ptr = { id: e.pointerId, x: e.clientX, y: e.clientY, uid, mode: 'press', wasSelected: this.selected === uid, type: e.pointerType };
    this.handEl.setPointerCapture(e.pointerId);
    this.setInspected(uid);
  }

  onPointerMove(e) {
    if (!this.ptr) {
      if (e.pointerType === 'mouse' && this.canInteract() && !this.selected) {
        const node = e.target.closest('.card.in-hand');
        this.setInspected(node ? node.dataset.uid : null);
      }
      return;
    }
    if (e.pointerId !== this.ptr.id) return;
    const p = this.ptr;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    const dist = Math.hypot(dx, dy);
    // Above this line the finger has clearly left the fan of resting cards.
    const fanTop = (this.handGeom?.top ?? window.innerHeight) + 10;
    if (p.mode === 'press') {
      if (p.wasSelected) {
        // An enlarged card follows any clear movement. In tap mode a second tap
        // may wobble a little without turning into a drag.
        if (dist > (this.tapMode() ? 24 : 10)) this.beginDrag(p.uid);
      } else if (p.type === 'mouse') {
        if (dist > 7) this.beginDrag(p.uid);
      } else if (dy < -12 && (-dy > Math.abs(dx) * 1.2 || (-dy > Math.abs(dx) * 0.7 && e.clientY < fanTop))) {
        // Touch on the fan: a steep upward swipe picks the card up at once, so it moves
        // with the finger from the start. A diagonal one only once it has left the fan.
        this.beginDrag(p.uid);
      } else if (Math.abs(dx) > 10) {
        p.mode = 'scrub';
      }
    }
    if (p.mode === 'scrub') {
      // Browsing the fan sideways; only leaving the fan upwards picks the card up.
      if (e.clientY < fanTop - 16) this.beginDrag(this.inspected || p.uid);
      else {
        const uid = this.cardAtX(e.clientX);
        if (uid) this.setInspected(uid);
      }
    }
    if (p.mode === 'drag') this.updateDrag(e.clientX, e.clientY);
  }

  onPointerUp(e) {
    const p = this.ptr;
    if (!p || e.pointerId !== p.id) return;
    this.ptr = null;
    if (p.mode === 'drag') {
      this.endDrag(e.clientX, e.clientY);
      return;
    }
    const uid = p.mode === 'scrub' ? this.inspected : p.uid;
    if (!uid) return;
    if (p.mode === 'press' && p.wasSelected) {
      // Second tap: plays only in the optional tap mode, otherwise puts the card back.
      if (this.tapMode()) this.tryPlaySelected();
      else this.deselect();
      return;
    }
    this.select(uid);
  }

  cancelPointer(e) {
    if (!this.ptr || (e && e.pointerId !== this.ptr.id)) return;
    if (this.ptr.mode === 'drag') this.endDrag(-1, -1, true);
    this.ptr = null;
  }

  beginDrag(uid) {
    const c = this.cardByUid(uid);
    const el = this.cardEls.get(uid);
    if (!c || !el) return;
    this.ptr.mode = 'drag';
    this.dragUid = uid;
    // Measured once per drag: reading computed styles every frame forces style recalcs.
    const cw = this.cardWidth();
    const ch = cw * 1.4;
    const still = !!prefersReducedMotion();
    // Where the card is shown right now, read before 'dragging' cancels a running hand
    // transition. The first move turns it into the grip point (see grabAt).
    const shown = new DOMMatrix(getComputedStyle(el).transform);
    this.drag = {
      cw, ch, playLine: this.playLine(), playable: this.g.canPlay(c),
      x: 0, y: 0, gx: 0, gy: -0.68 * ch, scale: 1.08, scaleGoal: 1.08, tilt: 0, offX: 0, offY: 0,
      shown, lastX: null, lastT: 0, still,
    };
    if (!still) {
      // Size and angle carry over from the hand and ease from there.
      this.drag.scale = Math.hypot(shown.a, shown.b) || 1.08;
      this.drag.tilt = (Math.atan2(shown.b, shown.a) * 180) / Math.PI;
    }
    this.selected = null;
    this.inspected = uid;
    this.hideHint();
    el.classList.add('dragging');
    this.app.tips.hide();
    this.tipShown = false;
    this.layoutHand();
  }

  /** The card itself follows the pointer; enemies light up when it hovers them. */
  updateDrag(x, y) {
    const c = this.cardByUid(this.dragUid);
    const el = this.cardEls.get(this.dragUid);
    const d = this.drag;
    if (!c || !el || !d) return;
    const alive = this.g.aliveEnemies();
    const targeted = this.g.needsTarget(c) && alive.length > 0;
    const inZone = y < d.playLine;
    let scale = 1.08;
    let armed = false;
    let label;
    if (!d.playable) {
      label = this.g.flag(c, 'unplayable') ? "This card can't be played" : 'Not enough Energy';
    } else if (targeted) {
      // With a single enemy, anywhere in the field counts as aiming at it.
      const target = this.targetAt(x, y) || (alive.length === 1 && inZone ? alive[0].ref : null);
      if (target !== this.aimTarget) {
        this.aimTarget = target;
        this.highlightTarget(target);
        fillCard(el, c.id, c.up, { g: this.g, inst: c, target: target ? this.g.enemyByRef(target) : null, cost: this.g.costOf(c) });
      }
      armed = !!target;
      if (target) scale = 0.68;
      label = target ? 'Release to attack' : alive.length === 1 ? 'Drag into the field' : 'Drag onto an enemy';
    } else {
      armed = inZone;
      label = inZone ? 'Release to play' : 'Drag into the field';
    }
    el.classList.toggle('will-play', armed);
    this.showPlayZone({ armed, label, line: d.playLine });
    if (d.shown) this.grabAt(x, y);
    d.x = x;
    d.y = y;
    // The position follows the pointer 1:1; only the size change is eased (in dragFrame).
    d.scaleGoal = scale;
    if (d.still) d.scale = scale;
    this.applyDragTransform();
  }

  /**
   * First move of a drag: the spot of the card under the pointer becomes the grip
   * point, so the card moves with the finger from the start instead of sliding
   * into place. If the finger already slid off the card, the grip is clamped to
   * the card and the small remaining gap closes in dragFrame().
   */
  grabAt(x, y) {
    const d = this.drag;
    const m = d.shown;
    d.shown = null;
    // Pointer relative to the transform origin (bottom centre), back through scale and rotation.
    const wx = x - d.cw / 2 - m.e;
    const wy = y - d.ch - m.f;
    const det = m.a * m.d - m.b * m.c || 1;
    d.gx = clamp((m.d * wx - m.c * wy) / det, -0.42 * d.cw, 0.42 * d.cw);
    d.gy = clamp((m.a * wy - m.b * wx) / det, -0.92 * d.ch, -0.1 * d.ch);
    if (d.still) return;
    d.offX = d.cw / 2 + m.e + m.a * d.gx + m.c * d.gy - x;
    d.offY = d.ch + m.f + m.b * d.gx + m.d * d.gy - y;
  }

  /**
   * Transform for a card held at a point. Cards scale and rotate around their
   * bottom centre (the hand's transform-origin), so the translation is solved
   * such that the grip point (gx, gy: offset from the bottom centre, unscaled)
   * stays under the pointer for any scale and tilt. Keeping one origin avoids
   * jumps when a card is picked up or put back.
   */
  heldTransform(x, y, scale, tiltDeg, dims = this.drag) {
    const { cw, ch, gx = 0, gy = -0.68 * ch } = dims;
    const a = (tiltDeg * Math.PI) / 180;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    const tx = x - cw / 2 - scale * (gx * cos - gy * sin);
    const ty = y - ch - scale * (gx * sin + gy * cos);
    return `translate(${tx.toFixed(1)}px, ${ty.toFixed(1)}px) rotate(${tiltDeg.toFixed(2)}deg) scale(${scale.toFixed(3)})`;
  }

  applyDragTransform() {
    const el = this.dragUid && this.cardEls.get(this.dragUid);
    const d = this.drag;
    if (!el || !d) return;
    el.style.transform = this.heldTransform(d.x + d.offX, d.y + d.offY, d.scale, d.tilt);
  }

  /**
   * Every frame while dragging, independent of frame rate: tilt follows horizontal
   * speed, the size eases towards its goal and the pick-up gap closes. None of this
   * delays the position, which always moves with the pointer.
   */
  dragFrame() {
    const d = this.dragUid && this.drag;
    if (!d || d.still) return;
    const now = performance.now();
    if (d.lastX === null) { d.lastX = d.x; d.lastT = now; return; }
    const dt = Math.min(0.1, Math.max(0.001, (now - d.lastT) / 1000));
    const speed = (d.x - d.lastX) / dt; // px per second
    d.lastX = d.x;
    d.lastT = now;
    // Exponential approach that lands exactly on the goal once it is close.
    const ease = (v, goal, rate, eps) => {
      const n = goal + (v - goal) * Math.exp(-dt * rate);
      return Math.abs(n - goal) < eps ? goal : n;
    };
    const tilt = ease(d.tilt, clamp(speed * 0.012, -9, 9), 12, 0.1);
    const scale = ease(d.scale, d.scaleGoal, 18, 0.002);
    const offX = ease(d.offX, 0, 18, 0.5);
    const offY = ease(d.offY, 0, 18, 0.5);
    if (tilt !== d.tilt || scale !== d.scale || offX !== d.offX || offY !== d.offY) {
      Object.assign(d, { tilt, scale, offX, offY });
      this.applyDragTransform();
    }
  }

  endDrag(x, y, cancelled = false) {
    const uid = this.dragUid;
    const c = this.cardByUid(uid);
    const el = this.cardEls.get(uid);
    const d = this.drag;
    this.dragUid = null;
    this.drag = null;
    this.showPlayZone(null);
    el?.classList.remove('dragging', 'will-play');
    const target = this.aimTarget;
    this.aimTarget = null;
    this.highlightTarget(null);
    this.inspected = null;
    if (!c || cancelled) { this.refresh(); return; }
    const drop = { x: d.x + d.offX, y: d.y + d.offY, cw: d.cw, ch: d.ch, gx: d.gx, gy: d.gy };
    if (this.g.needsTarget(c) && this.g.aliveEnemies().length > 0) {
      if (target) this.play(uid, target, { drop });
      else this.refresh();
    } else if (y >= 0 && y < d.playLine) this.play(uid, null, { drop });
    else this.refresh();
  }

  targetAt(x, y) {
    let best = null;
    for (const [ref, r] of this.hitRects) {
      const e = this.g.enemyByRef(ref);
      if (!e || !e.alive) continue;
      if (x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1) {
        const d = Math.abs(x - (r.x0 + r.x1) / 2);
        if (!best || d < best.d) best = { ref, d };
      }
    }
    return best ? best.ref : null;
  }

  highlightTarget(ref) {
    for (const [r, parts] of this.unitEls) parts.el.classList.toggle('targeted', r === ref);
  }

  onEnemyTap(ref) {
    if (!this.canInteract()) return;
    if (this.pendingCell !== null) {
      const slot = this.pendingCell;
      this.pendingCell = null;
      this.hideHint();
      this.useCell(slot, ref);
      return;
    }
    if (!this.selected || !this.tapMode()) return;
    const c = this.cardByUid(this.selected);
    if (c && this.g.needsTarget(c)) this.play(c.uid, ref);
  }

  /** Optional setting: tapping a selected card (or an enemy) plays it. Default is swipe only. */
  tapMode() { return this.app.settings.cardPlay === 'tap'; }

  /** Cards dragged above this line get played. */
  playLine() { return window.innerHeight - safeBottom() - this.cardWidth() * 1.4 * 1.3; }

  showPlayZone(state) {
    const z = this.playZone;
    if (!state) { z.hidden = true; return; }
    z.hidden = false;
    z.style.height = `${Math.max(0, state.line ?? this.playLine())}px`;
    z.classList.toggle('armed', state.armed);
    z.querySelector('span').textContent = state.label;
  }

  tryPlaySelected(targetRef = null) {
    const c = this.cardByUid(this.selected);
    if (!c) return;
    if (this.g.needsTarget(c)) {
      const alive = this.g.aliveEnemies();
      const t = targetRef || this.kbTarget || (alive.length === 1 ? alive[0].ref : null);
      if (t) this.play(c.uid, t);
      else this.showHint('Choose a target');
      return;
    }
    this.play(c.uid, null);
  }

  handleKey(e) {
    if (this.app.modalOpen() || !this.canInteract() || this.ptr || this.dragUid) return;
    if (e.target.closest?.('input, textarea')) return;
    // Ctrl/Cmd/Alt combos are shortcuts (e.g. Ctrl+0), not card keys.
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key;
    if (/^[0-9]$/.test(k)) {
      const idx = k === '0' ? 9 : Number(k) - 1;
      const c = this.g.hand[idx];
      if (c) {
        if (this.selected === c.uid) this.tryPlaySelected();
        else this.select(c.uid);
      }
      e.preventDefault();
    } else if ((k === 'Tab' || k === 'ArrowLeft' || k === 'ArrowRight') && this.selected) {
      const alive = this.g.aliveEnemies();
      if (!alive.length) return;
      let i = alive.findIndex((a) => a.ref === this.kbTarget);
      i = (i + (k === 'ArrowLeft' || (k === 'Tab' && e.shiftKey) ? -1 : 1) + alive.length) % alive.length;
      this.kbTarget = alive[i].ref;
      this.highlightTarget(this.kbTarget);
      e.preventDefault();
    } else if ((k === 'Enter' || k === ' ') && this.selected) {
      this.tryPlaySelected();
      e.preventDefault();
    } else if (k === 'e' || k === 'E') {
      this.endTurn();
    } else if (k === 'Escape') {
      this.deselect();
    }
  }

  // ------------------------------------------------------------- actions ---

  /** drop: where a dragged card was released, so its play animation starts there. */
  async play(uid, targetRef, { drop = null } = {}) {
    const c = this.cardByUid(uid);
    if (!c || !this.canInteract()) return;
    if (!this.g.canPlay(c)) {
      const el = this.cardEls.get(uid);
      el?.classList.remove('shake');
      void el?.offsetWidth;
      el?.classList.add('shake');
      this.app.sfx.play('error');
      this.app.toast(this.g.flag(c, 'unplayable') ? 'This card can\'t be played.' : 'Not enough Energy.');
      this.deselect();
      return;
    }
    this.busy = true;
    this.pendingCell = null;
    this.selected = null;
    this.inspected = null;
    this.kbTarget = null;
    this.hideHint();
    this.highlightTarget(null);
    this.app.tips.hide();
    this.tipShown = false;
    this.currentPlay = c;
    this.playDrop = drop ? { uid, ...drop } : null;
    this.g.playCard(uid, targetRef);
    await this.process();
    this.playDrop = null;
    while (this.g.pending && !this.destroyed) {
      const picked = await this.app.chooseCards(this.g.pending);
      this.g.resolveChoice(picked);
      await this.process();
    }
    this.currentPlay = null;
    if (this.destroyed) return;
    this.busy = false;
    this.refresh();
    await this.checkOutcome();
  }

  async useCell(slot, targetRef = null) {
    const id = this.g.run.cells[slot];
    if (!id || !this.canInteract()) return;
    const def = CELLS[id];
    if (def.target === 'enemy' && !targetRef) {
      const alive = this.g.aliveEnemies();
      if (alive.length === 1) targetRef = alive[0].ref;
      else {
        this.selected = null;
        this.pendingCell = slot;
        this.showHint(`Tap an enemy to use ${def.name}`);
        return;
      }
    }
    this.busy = true;
    this.g.useCell(slot, targetRef);
    await this.process();
    if (this.destroyed) return;
    this.busy = false;
    this.refresh();
    await this.checkOutcome();
  }

  async endTurn() {
    if (!this.canInteract()) return;
    this.app.sfx.unlock();
    this.busy = true;
    this.deselect();
    this.refresh();
    this.g.endTurn();
    await this.process();
    while (this.g.phase === 'enemy' && !this.destroyed) {
      this.g.enemyStep();
      await this.process();
      await wait(this.d(180));
    }
    if (this.destroyed) return;
    this.busy = false;
    this.refresh();
    await this.checkOutcome();
  }

  async checkOutcome() {
    const g = this.g;
    if (!g.outcome || this.finished || this.destroyed) return;
    this.finished = true;
    this.busy = true;
    this.refresh();
    if (g.outcome === 'win') {
      await wait(this.d(500));
      this.scene.victory?.();
      this.app.sfx.play('victory');
      await this.showBanner('Victory', 'win', 1100);
    } else {
      await wait(this.d(400));
      // The world drains of colour; route() restores it on the next screen.
      this.app.root.classList.add('defeat');
      this.app.sfx.play('defeat');
      await this.showBanner('Defeated', 'lose', 1500);
    }
    this.app.onCombatEnd(g);
  }

  // ------------------------------------------------------ event playback ---

  async process() {
    let evs = this.g.drain();
    while (evs.length && !this.destroyed) {
      for (const ev of evs) {
        if (this.destroyed) return;
        await this.playEvent(ev);
      }
      evs = this.g.drain();
    }
    if (this.destroyed) return;
    for (const u of [this.g.player, ...this.g.enemies]) {
      if (u.alive || u.isPlayer) this.display.set(u.ref, { hp: Math.max(0, u.hp), shield: u.shield });
    }
    this.refresh();
  }

  disp(ref) {
    if (!this.display.has(ref)) {
      const u = this.g.unitByRef(ref);
      this.display.set(ref, { hp: u?.hp ?? 0, shield: u?.shield ?? 0 });
    }
    return this.display.get(ref);
  }

  unitColor(ref) {
    if (ref === 'P') return this.currentPlay ? TYPE_COLOR[this.currentPlay.def.type] : '#36c9f0';
    return this.scene.units?.get(ref)?.built?.glow || '#ff5b6b';
  }

  async playEvent(ev) {
    const g = this.g;
    const sfx = this.app.sfx;
    switch (ev.t) {
      case 'spawn': {
        if (this.unitEls.has(ev.tgt)) return;
        const e = g.enemyByRef(ev.tgt);
        const slot = g.enemies.indexOf(e);
        const old = this.scene.enemyOrder[slot];
        if (old && !g.enemyByRef(old)) this.scene.enemyOrder.splice(slot, 1);
        this.scene.addEnemy(e.ref, e.def, true, null);
        this.display.set(e.ref, { hp: e.hp, shield: e.shield });
        this.makeUnitEl(e);
        sfx.play('buff');
        await wait(this.d(300));
        return;
      }
      case 'turn':
        this.enemyPhase = false;
        sfx.play('turn');
        this.refresh();
        await this.showBanner(g.turn === 1 ? 'Combat start' : 'Your turn', 'player', 650);
        return;
      case 'enemyPhase':
        this.enemyPhase = true;
        this.layoutHand();
        sfx.play('enemyturn');
        await this.showBanner('Enemy turn', 'enemy', 550);
        return;
      case 'enemyTurn':
        for (const [ref, parts] of this.unitEls) parts.el.classList.toggle('acting', ref === ev.src);
        return;
      case 'act': {
        this.pop(ev.src, ev.name, 'act');
        const u = g.enemyByRef(ev.src);
        if (u) this.renderUnit(ev.src);
        await wait(this.d(260));
        return;
      }
      case 'play': {
        const el = this.cardEls.get(ev.uid);
        const color = TYPE_COLOR[ev.type] || '#fff';
        this.scene.cast(color);
        sfx.play('card');
        const drop = this.playDrop?.uid === ev.uid ? this.playDrop : null;
        if (el) {
          this.cardEls.delete(ev.uid);
          this.castCard(el, ev, color, drop);
        }
        this.layoutHand();
        // A tapped card is shown in the field before its effects start.
        await wait(this.d(el && !drop ? 330 : 200));
        if (ev.times > 1) this.pop('P', 'Echo!', 'buff');
        return;
      }
      case 'attack': {
        const color = this.unitColor(ev.src);
        const kind = ev.src === 'P' && this.currentPlay && BEAM_CARDS.has(this.currentPlay.id) ? 'beam' : 'shot';
        if (ev.src === 'P' && kind === 'shot') sfx.play('shoot');
        await this.scene.attack(ev.src, ev.tgt, { color, kind, cue: (name) => sfx.play(name) });
        if (ev.blocked > 0) {
          const d = this.disp(ev.tgt);
          d.shield = Math.max(0, d.shield - ev.blocked);
          this.scene.hit(ev.tgt, { blocked: ev.blocked });
          this.pop(ev.tgt, `${ev.blocked}`, 'blocked');
          sfx.play('block');
          this.renderUnit(ev.tgt);
        }
        if (ev.dmg === 0 && !ev.blocked) this.pop(ev.tgt, '0', 'blocked');
        return;
      }
      case 'blocked': {
        const d = this.disp(ev.tgt);
        d.shield = Math.max(0, d.shield - ev.n);
        this.scene.hit(ev.tgt, { blocked: ev.n });
        this.pop(ev.tgt, `${ev.n}`, 'blocked');
        sfx.play('block');
        this.renderUnit(ev.tgt);
        await wait(this.d(80));
        return;
      }
      case 'damage': {
        const d = this.disp(ev.tgt);
        d.hp -= ev.n;
        if (ev.cause === 'detonate') {
          this.scene.explode(ev.tgt);
          sfx.play('hit', 1.6);
        } else if (ev.n > 0) {
          const color = ev.cause === 'burn' ? '#ff7a2f' : ev.tgt === 'P' ? '#ff4f6e' : this.unitColor(ev.tgt);
          this.scene.hit(ev.tgt, { amount: ev.n, color });
          if (ev.cause === 'burn') this.scene.burnTick(ev.tgt);
          sfx.play(ev.tgt === 'P' ? 'hurt' : ev.cause === 'burn' ? 'burn' : 'hit', ev.n / 12);
          this.pop(ev.tgt, `${ev.n}`, ev.n >= 20 ? 'dmg big' : 'dmg');
          bump(this.unitEls.get(ev.tgt)?.plate, 'hurt');
          if (ev.tgt === 'P') this.app.flashDamage(ev.n);
        }
        this.renderUnit(ev.tgt);
        await wait(this.d(ev.n > 0 ? 140 : 40));
        return;
      }
      case 'barrier':
        this.pop(ev.tgt, 'Barrier', 'blocked');
        await wait(this.d(120));
        return;
      case 'shield': {
        const d = this.disp(ev.tgt);
        d.shield += ev.n;
        this.scene.shieldUp(ev.tgt);
        this.pop(ev.tgt, `+${ev.n}`, 'shield');
        sfx.play('shield');
        this.renderUnit(ev.tgt);
        await wait(this.d(120));
        return;
      }
      case 'shieldReset': {
        this.disp(ev.tgt).shield = 0;
        this.renderUnit(ev.tgt);
        return;
      }
      case 'heal': {
        const d = this.disp(ev.tgt);
        d.hp += ev.n;
        this.scene.heal(ev.tgt);
        this.pop(ev.tgt, `+${ev.n}`, 'heal');
        sfx.play('heal');
        this.renderUnit(ev.tgt);
        await wait(this.d(160));
        return;
      }
      case 'status': {
        this.renderUnit(ev.tgt);
        if (QUIET_STATUSES.has(ev.id)) {
          if (ev.id === 'charge' && ev.n > 0) { this.pop(ev.tgt, `+${ev.n} Charge`, 'charge'); sfx.play('energy'); }
          return;
        }
        const def = STATUSES[ev.id];
        const debuff = def.kind === 'debuff' || ev.n < 0;
        const [, color] = STATUS_ICON[ev.id] || [null, '#fff'];
        this.pop(ev.tgt, `${ev.n > 0 ? '+' : ''}${ev.n} ${def.name}`, debuff ? 'debuff' : 'buff', color);
        if (debuff) { this.scene.debuff(ev.tgt, color); sfx.play('debuff'); } else { this.scene.buff(ev.tgt, color); sfx.play('buff'); }
        await wait(this.d(150));
        return;
      }
      case 'cleanse':
        this.pop(ev.tgt, 'Cleansed', 'buff');
        this.scene.buff(ev.tgt, '#9fe3ff');
        this.renderUnit(ev.tgt);
        return;
      case 'death':
      case 'flee': {
        if (ev.tgt === 'P') return;
        this.scene.die(ev.tgt);
        sfx.play('death');
        const parts = this.unitEls.get(ev.tgt);
        if (parts) {
          parts.el.classList.add('dead');
          setTimeout(() => parts.el.remove(), 500);
          this.unitEls.delete(ev.tgt);
          this.hitRects.delete(ev.tgt);
        }
        await wait(this.d(ev.t === 'death' ? 320 : 150));
        return;
      }
      case 'draw': {
        this.syncHandEls();
        sfx.play('draw');
        this.refreshLight();
        await wait(this.d(70));
        return;
      }
      case 'discard':
      case 'fade':
      case 'power': {
        const el = this.cardEls.get(ev.uid);
        if (el && !el.classList.contains('leaving')) {
          el.classList.add('leaving');
          if (ev.t === 'fade') {
            el.classList.add('fading');
            sfx.play('fade');
          } else {
            const r = this.discardBtn.getBoundingClientRect();
            el.style.transform = `translate(${r.left}px, ${r.top - 30}px) scale(.25) rotate(20deg)`;
            el.style.opacity = '0';
          }
          setTimeout(() => el.remove(), 450);
          this.cardEls.delete(ev.uid);
          this.layoutHand();
          this.refreshLight();
          // Cards leave the hand one after another, not as one block.
          await wait(this.d(55));
          return;
        }
        this.refreshLight();
        return;
      }
      case 'move': {
        if (ev.to === 'hand') { this.syncHandEls(); this.cardEls.get(ev.uid)?.classList.add('from-discard'); }
        else {
          const el = this.cardEls.get(ev.uid);
          if (el) { el.remove(); this.cardEls.delete(ev.uid); }
        }
        this.refreshLight();
        await wait(this.d(120));
        return;
      }
      case 'addCard': {
        if (ev.pile === 'hand') this.syncHandEls();
        else this.flyGhost(ev.id, ev.pile);
        this.refreshLight();
        await wait(this.d(ev.pile === 'hand' ? 120 : 260));
        return;
      }
      case 'shuffle':
        this.pop('P', 'Reshuffled', 'act');
        this.refreshLight();
        await wait(this.d(150));
        return;
      case 'energy':
        sfx.play('energy');
        this.refreshLight();
        return;
      case 'relic':
        sfx.play('relic');
        this.app.flashRelic(ev.id);
        return;
      case 'cell': {
        sfx.play('cell');
        this.pop('P', CELLS[ev.id].name, 'buff', CELL_COLOR[ev.id]);
        this.scene.buff('P', CELL_COLOR[ev.id]);
        this.app.renderCells(this);
        await wait(this.d(200));
        return;
      }
      case 'intent': {
        const parts = this.unitEls.get(ev.tgt);
        const e = g.enemyByRef(ev.tgt);
        if (parts && e) this.renderIntent(e, parts.intent);
        return;
      }
      case 'win':
        for (const parts of this.unitEls.values()) parts.el.classList.remove('acting');
        return;
      default:
    }
  }

  /**
   * A played card is presented, flares up and collapses into light that drifts
   * towards what it affects: its target, all enemies, or the runner.
   * Dragged cards do this where they were dropped; tapped ones rise into the field first.
   */
  castCard(el, ev, color, drop) {
    el.classList.add('leaving');
    el.classList.remove('lifted', 'selected', 'will-play', 'playable');
    el.style.zIndex = 200;
    if (prefersReducedMotion()) {
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 300);
      return;
    }
    const cw = this.cardWidth();
    const ch = cw * 1.4;
    const W = window.innerWidth;
    const H = window.innerHeight;
    const from = getComputedStyle(el).transform;
    const cur = new DOMMatrix(from === 'none' ? undefined : from);
    const curScale = Math.hypot(cur.a, cur.b) || 1;
    const stage = drop
      ? this.heldTransform(drop.x, drop.y, Math.min(1.15, curScale * 1.12), 0, drop)
      : `translate(${W / 2 - cw / 2}px, ${H * 0.44 - ch / 2}px) scale(1.15)`;
    // Screen centre of the card once staged (it scales around its bottom centre).
    const m = new DOMMatrix(stage);
    const cx = m.e + cw / 2 - m.c * (ch / 2);
    const cy = m.f + ch - m.d * (ch / 2);
    const aim = this.castAim(ev) || { x: cx, y: cy - 80 };
    const s = 0.14;
    const tx = cx + (aim.x - cx) * 0.55;
    const ty = cy + (aim.y - cy) * 0.55;
    const end = `translate(${tx - cw / 2}px, ${ty - ch + (s * ch) / 2}px) scale(${s})`;
    const dur = this.d(drop ? 460 : 720);
    const hold = drop ? 0.22 : 0.5;
    el.style.transition = 'none';
    el.style.transform = end;
    el.style.opacity = '0';
    // Easing per segment: glide out to the stage, then accelerate into the collapse.
    el.animate([
      { transform: from, opacity: 1, filter: 'brightness(1)', offset: 0, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
      { transform: stage, opacity: 1, filter: `brightness(1.9) drop-shadow(0 0 1.4em ${color})`, offset: hold, easing: 'cubic-bezier(0.55, 0, 0.8, 0.4)' },
      { transform: end, opacity: 0, filter: 'brightness(3) blur(3px)', offset: 1 },
    ], { duration: dur }).onfinish = () => el.remove();
    setTimeout(() => burst(this.fxLayer, cx, cy, color, { size: cw * 1.5, sparks: 14 }), dur * hold);
  }

  /** Where a played card's light goes: the target, the enemies' middle, or the runner. */
  castAim(ev) {
    const centre = (ref) => {
      const p = this.scene.project(ref);
      return p && { x: p.x, y: (p.headY + p.footY) / 2 };
    };
    if (ev.target) return centre(ev.target);
    if (ev.type === 'attack') {
      const pts = this.g.aliveEnemies().map((e) => centre(e.ref)).filter(Boolean);
      if (pts.length) return { x: pts.reduce((a, p) => a + p.x, 0) / pts.length, y: pts.reduce((a, p) => a + p.y, 0) / pts.length };
    }
    return centre('P');
  }

  /** Cheap refresh during playback: piles, energy and hand layout. */
  refreshLight() {
    this.renderBar();
    this.layoutHand();
  }

  /** Energy and pile counters. A counter that changed bumps; spent Energy dips. */
  renderBar() {
    const g = this.g;
    const now = { energy: g.energy, draw: g.draw.length, discard: g.discard.length, faded: g.faded.length };
    const was = this.barShown || now;
    this.barShown = now;
    if (now.energy !== was.energy) bump(this.energyEl, now.energy < was.energy ? 'spend' : 'pulse');
    for (const k of ['draw', 'discard', 'faded']) if (now[k] > was[k]) bump(this[`${k}Btn`]);
    this.energyEl.innerHTML = `${icon('energy')}<b>${g.energy}<small>/${g.maxEnergy()}</small></b>`;
    this.energyEl.classList.toggle('empty', g.energy === 0);
    this.drawBtn.innerHTML = `${icon('draw')}<b>${now.draw}</b>`;
    this.discardBtn.innerHTML = `${icon('discard')}<b>${now.discard}</b>`;
    this.fadedBtn.innerHTML = `${icon('faded')}<b>${now.faded}</b>`;
    this.fadedBtn.hidden = now.faded === 0;
  }

  flyGhost(id, pile) {
    const el = cardEl(id, false, { cls: 'ghost' });
    const cw = this.cardWidth();
    el.style.transform = `translate(${window.innerWidth / 2 - cw / 2}px, ${window.innerHeight * 0.35}px) scale(.9)`;
    this.root.appendChild(el);
    const dest = (pile === 'draw' ? this.drawBtn : this.discardBtn).getBoundingClientRect();
    setTimeout(() => {
      el.style.transform = `translate(${dest.left}px, ${dest.top - 30}px) scale(.2)`;
      el.style.opacity = '0';
    }, this.d(350));
    setTimeout(() => el.remove(), this.d(350) + 500);
  }

  pop(ref, text, cls, color) {
    const p = this.scene.project(ref);
    if (!p) return;
    const el = h(`div.pop.${cls.split(' ').join('.')}`, text);
    if (color) el.style.color = color;
    const y = p.headY + (p.footY - p.headY) * 0.35;
    // Numbers drift away to one side, so quick multi-hits don't stack on each other.
    el.style.setProperty('--dx', `${Math.round((Math.random() - 0.5) * 70)}px`);
    el.style.left = `${p.x + (Math.random() - 0.5) * 30}px`;
    el.style.top = `${y}px`;
    this.popLayer.appendChild(el);
    setTimeout(() => el.remove(), 1100);
  }

  async showBanner(text, cls, ms) {
    this.banner.textContent = text;
    this.banner.className = `banner ${cls}`;
    this.banner.hidden = false;
    void this.banner.offsetWidth;
    this.banner.classList.add('show');
    await wait(this.d(ms));
    this.banner.classList.remove('show');
    await wait(this.d(150));
    this.banner.hidden = true;
  }

  showHint(text) {
    this.hint.textContent = text;
    this.hint.hidden = false;
  }

  hideHint() { this.hint.hidden = true; }

  showPile(which) {
    const g = this.g;
    const list = which === 'draw'
      ? [...g.draw].sort((a, b) => a.def.name.localeCompare(b.def.name))
      : which === 'discard' ? [...g.discard].reverse() : [...g.faded];
    const title = { draw: 'Draw pile', discard: 'Discard pile', faded: 'Faded' }[which];
    const note = which === 'draw' ? 'Shown in alphabetical order, not draw order.' : '';
    this.app.showCardList(title, list.map((c) => ({ id: c.id, up: c.up })), note);
  }
}

export function safeBottom() {
  const v = getComputedStyle(document.documentElement).getPropertyValue('--sab');
  return parseFloat(v) || 0;
}
