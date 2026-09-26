// App controller: owns the run, the layers, the HUD, modals and routing
// between screens. Every state change goes through commit() -> save + route.

import { h, clear, esc } from './dom.js';
import { icon, CELL_COLOR } from './icons.js';
import { cardEl } from './cardview.js';
import { relicEl, relicRow, cellEl, shardsHtml } from './widgets.js';
import { Tooltips } from './tooltip.js';
import { Sfx } from './sfx.js';
import { CombatView, safeBottom } from './combat.js';
import * as S from './screens.js';
import * as store from './storage.js';
import * as R from '../core/run.js';
import { CARDS, canUpgrade, cardName } from '../data/cards.js';
import { CELLS } from '../data/cells.js';
import { RELICS } from '../data/relics.js';
import { ACT_NAMES } from '../data/enemies.js';
import { Diorama, FlatStage } from '../render/scene.js';

const TYPE_ORDER = { attack: 0, skill: 1, power: 2, status: 3, curse: 4 };
const sortCards = (list) => [...list].sort((a, b) => TYPE_ORDER[CARDS[a.id].type] - TYPE_ORDER[CARDS[b.id].type]
  || CARDS[a.id].name.localeCompare(CARDS[b.id].name) || (a.up ? 1 : 0) - (b.up ? 1 : 0));

export class App {
  constructor(root) {
    this.root = root;
    this.settings = store.loadSettings();
    this.meta = store.loadMeta();
    this.sfx = new Sfx(this.settings);
    this.run = null;
    this.combat = null;
    this.modals = [];
    this.shownAct = null;

    this.canvas = h('canvas.scene', { 'aria-hidden': 'true' });
    this.stage = h('div.stage');
    this.screenEl = h('main.screen-layer');
    this.hud = h('header.hud', { hidden: true });
    this.modalEl = h('div.modal-layer');
    this.toastEl = h('div.toast', { role: 'status', hidden: true });
    this.flashEl = h('div.dmg-flash');
    this.actBanner = h('div.act-banner', { hidden: true });
    root.append(this.canvas, this.stage, this.screenEl, this.hud, this.actBanner, this.modalEl, this.toastEl, this.flashEl);
    this.tips = new Tooltips(root);

    try {
      this.scene = new Diorama(this.canvas, { quality: this.settings.quality });
    } catch (err) {
      console.warn('WebGL unavailable, running without 3D.', err);
      this.canvas.remove();
      root.classList.add('no-webgl');
      this.scene = new FlatStage();
    }
    this.scene.speed = this.settings.speed === 'fast' ? 1.8 : 1;

    this.probe = h('div.safe-probe');
    root.appendChild(this.probe);
    const onResize = () => {
      document.documentElement.style.setProperty('--sab', `${parseFloat(getComputedStyle(this.probe).paddingBottom) || 0}px`);
      document.documentElement.style.setProperty('--vh', `${window.innerHeight}px`);
      this.scene.resize();
      this.combat?.updateInsets();
      if (!this.combat && this.run && !this.run.room && !this.modals.length) this.route();
    };
    window.addEventListener('resize', () => { clearTimeout(this.resizeT); this.resizeT = setTimeout(onResize, 120); });
    onResize();
    root.addEventListener('pointerdown', () => this.sfx.unlock(), { capture: true });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.modals.length) {
        const top = this.modals[this.modals.length - 1];
        if (top.dismissible) top.close();
      }
    });
  }

  get savedRun() { return this.run && !this.run.over ? this.run : null; }

  boot(snapshot) {
    const fromSnap = snapshot?.run ? R.deserializeRun(snapshot.run) : null;
    this.run = fromSnap || store.loadRun();
    if (fromSnap && snapshot.inRun) this.route();
    else this.toTitle();
  }

  snapshot() {
    return { run: this.run ? R.serializeRun(this.run) : null, inRun: !!this.run && !this.onTitle };
  }

  save() {
    if (this.run && !this.run.over) store.saveRun(this.run);
  }

  /** Save and re-render after any run mutation. */
  commit() {
    this.save();
    this.route();
  }

  // --------------------------------------------------------------- flow ---

  toTitle() {
    this.onTitle = true;
    this.endCombatView();
    this.closeAllModals();
    this.hud.hidden = true;
    this.scene.setAct(this.run && !this.run.over ? this.run.act : 1);
    this.scene.showTitle();
    this.setScreen(S.renderTitle(this), 'title');
  }

  startRun(seed) {
    store.clearRun();
    this.run = R.newRun(seed);
    this.shownAct = null;
    this.onTitle = false;
    this.commit();
  }

  continueRun() {
    this.onTitle = false;
    this.shownAct = this.run.act;
    this.route();
  }

  route() {
    this.closeAllModals();
    const run = this.run;
    if (!run) { this.toTitle(); return; }
    this.onTitle = false;
    this.scene.setAct(run.act);
    this.sfx.setAct(run.act);
    if (run.over) {
      this.endCombatView();
      this.recordRunEnd();
      this.hud.hidden = true;
      this.scene.showIdle();
      this.setScreen(S.renderEnd(this), 'end');
      return;
    }
    const room = run.room;
    const fighting = room && room.stage === 'fight' && ['combat', 'elite', 'boss', 'event'].includes(room.type);
    if (fighting) {
      if (!this.combat) this.startCombat();
      return;
    }
    this.endCombatView();
    this.renderHud();
    this.scene.showIdle();
    this.scene.setInsets(this.hudHeight(), 0);
    if (!room) {
      this.setScreen(S.renderMap(this), 'map');
      if (this.shownAct !== run.act) {
        this.shownAct = run.act;
        this.showActBanner(run.act);
      }
      return;
    }
    const render = {
      combat: S.renderReward, elite: S.renderReward, boss: S.renderReward,
      event: S.renderEvent, shop: S.renderShop, rest: S.renderRest, treasure: S.renderTreasure,
    }[room.type];
    const screenName = ['combat', 'elite', 'boss'].includes(room.type) ? 'reward' : room.type;
    this.setScreen(render(this), screenName);
    if (room.pendingChoice) this.showPendingChoice();
  }

  setScreen(el, name) {
    clear(this.screenEl);
    this.screenEl.dataset.screen = name;
    this.screenEl.appendChild(el);
    this.screenEl.scrollTop = 0;
    this.tips.hide();
  }

  leaveRoom() {
    const wasBoss = this.run.room?.type === 'boss';
    if (R.leaveRoom(this.run)) {
      if (wasBoss && !this.run.over) this.sfx.play('victory');
      this.commit();
    }
  }

  startCombat() {
    clear(this.screenEl);
    this.screenEl.dataset.screen = 'fight';
    this.tips.hide();
    this.renderHud();
    const g = R.makeCombat(this.run);
    g.start();
    this.combat = new CombatView(this, g);
    this.combat.start();
  }

  endCombatView() {
    if (this.combat) {
      this.combat.destroy();
      this.combat = null;
    }
  }

  onCombatEnd(g) {
    R.finishCombat(this.run, g);
    this.endCombatView();
    if (this.run.over) store.clearRun();
    this.commit();
  }

  recordRunEnd() {
    const run = this.run;
    if (run.recorded) return;
    run.recorded = true;
    const m = this.meta;
    const score = R.computeScore(run);
    m.runs++;
    if (run.over === 'win') m.wins++;
    m.bestFloor = Math.max(m.bestFloor, run.floor);
    m.bestScore = Math.max(m.bestScore, score);
    m.history = [{ seed: run.seed, result: run.over, floor: run.floor, act: run.act, score, date: Date.now() }, ...m.history].slice(0, 20);
    store.saveMeta(m);
    store.clearRun();
  }

  // ---------------------------------------------------------------- hud ---

  hudHeight() {
    return this.hud.hidden ? 0 : this.hud.getBoundingClientRect().height;
  }

  renderHud() {
    const run = this.run;
    if (!run) { this.hud.hidden = true; return; }
    this.hud.hidden = false;
    clear(this.hud);
    this.hudHp = h('span.hud-hp', { tip: () => `<b>Health</b><p>${run.hp} of ${run.maxHp}. The run ends at 0.</p>` });
    this.hudShards = h('span.hud-shards', { html: shardsHtml(run.shards), tip: '<b>Shards</b><p>Currency for the Drift Market.</p>' });
    this.hudCells = h('span.hud-cells');
    const floor = h('span.hud-floor', h('b', `Act ${run.act}`), h('small', `Floor ${run.floor}`));
    const deckBtn = h('button.hud-btn', { type: 'button', 'aria-label': 'View deck', onclick: () => this.showDeck(), html: `${icon('deck')}<b>${run.deck.length}</b>` });
    const menuBtn = h('button.hud-btn', { type: 'button', 'aria-label': 'Menu', onclick: () => this.showSettings(true), html: icon('menu') });
    this.hudRelics = h('div.hud-relics');
    for (const r of run.relics) this.hudRelics.appendChild(relicEl(r.id, { counter: r.counter }));
    this.hud.append(h('div.hud-main', this.hudHp, this.hudShards, h('span.hud-spacer'), floor, deckBtn, menuBtn), h('div.hud-sub', this.hudCells, this.hudRelics));
    this.updateHud({ hp: run.hp, maxHp: run.maxHp });
    this.renderCells(this.combat);
  }

  updateHud({ hp, maxHp }) {
    if (!this.hudHp) return;
    this.hudHp.innerHTML = `${icon('heart')}<b>${Math.max(0, hp)}<small>/${maxHp}</small></b>`;
    this.hudHp.classList.toggle('low', hp / maxHp < 0.3);
  }

  renderCells(combatView) {
    if (!this.hudCells || !this.run) return;
    clear(this.hudCells);
    this.run.cells.forEach((id, slot) => {
      const el = cellEl(id);
      if (id) {
        el.setAttribute('role', 'button');
        el.tabIndex = 0;
        el.addEventListener('click', (e) => { e.stopPropagation(); this.cellMenu(slot); });
      }
      this.hudCells.appendChild(el);
    });
  }

  cellMenu(slot) {
    const id = this.run.cells[slot];
    if (!id) return;
    this.tips.hide();
    const c = CELLS[id];
    const cv = this.combat;
    const usable = cv && cv.canInteract();
    const body = h('div.cell-menu',
      h('div.relic-row', h('span.relic.big', { style: { color: CELL_COLOR[id] }, html: icon('cell') }), h('div.relic-info', h('b', c.name), h('span.dim', c.desc))),
      !cv ? h('p.dim', 'Cells can only be used during your turn in combat.') : null);
    const m = this.openModal(body, {
      title: 'Cell',
      actions: [
        usable && { label: 'Use', primary: true, onclick: () => { m.close(); cv.useCell(slot); } },
        { label: 'Discard', onclick: () => { m.close(); this.confirm(`Discard ${c.name}?`, 'It will be gone for good.', 'Discard', () => { this.run.cells[slot] = null; this.save(); this.renderCells(cv); }); } },
        { label: 'Close', onclick: () => m.close() },
      ].filter(Boolean),
    });
  }

  flashRelic(id) {
    const el = this.hudRelics?.querySelector(`[data-relic="${id}"]`);
    if (!el) return;
    el.classList.remove('flash');
    void el.offsetWidth;
    el.classList.add('flash');
  }

  flashDamage(n) {
    this.flashEl.classList.remove('on');
    void this.flashEl.offsetWidth;
    this.flashEl.style.setProperty('--a', String(Math.min(0.5, 0.12 + n / 60)));
    this.flashEl.classList.add('on');
  }

  toast(text) {
    this.toastEl.textContent = text;
    this.toastEl.hidden = false;
    this.toastEl.classList.remove('show');
    void this.toastEl.offsetWidth;
    this.toastEl.classList.add('show');
    clearTimeout(this.toastT);
    this.toastT = setTimeout(() => { this.toastEl.hidden = true; }, 2200);
  }

  showActBanner(act) {
    const b = this.actBanner;
    b.innerHTML = `<small>Act ${act}</small><b>${esc(ACT_NAMES[act])}</b>`;
    b.hidden = false;
    b.classList.remove('show');
    void b.offsetWidth;
    b.classList.add('show');
    setTimeout(() => { b.hidden = true; }, 2600);
  }

  // ------------------------------------------------------------- modals ---

  modalOpen() { return this.modals.length > 0; }

  /**
   * openModal(content, { title, actions: [{label, primary, onclick, disabled}], dismissible, wide, onClose })
   * Returns { close, el, setActions }.
   */
  openModal(content, { title, sub, actions = [], dismissible = true, wide = false, onClose } = {}) {
    this.tips.hide();
    const actionsEl = h('div.actions');
    const box = h(`div.modal${wide ? '.wide' : ''}`, { role: 'dialog', 'aria-modal': 'true', 'aria-label': title || 'Dialog' },
      title && h('h2', title),
      sub && h('p.dim.modal-sub', sub),
      h('div.modal-body', content),
      actionsEl);
    const backdrop = h('div.modal-backdrop', box);
    const m = {
      el: box, dismissible,
      close: () => {
        backdrop.remove();
        this.modals = this.modals.filter((x) => x !== m);
        onClose?.();
      },
      setActions: (list) => {
        clear(actionsEl);
        for (const a of list) {
          if (!a) continue;
          actionsEl.appendChild(h(`button.btn${a.primary ? '.primary' : ''}`, { type: 'button', disabled: a.disabled, onclick: a.onclick }, a.label));
        }
      },
    };
    m.setActions(actions);
    if (dismissible) backdrop.addEventListener('pointerdown', (e) => { if (e.target === backdrop) m.close(); });
    this.modalEl.appendChild(backdrop);
    this.modals.push(m);
    requestAnimationFrame(() => box.querySelector('.btn.primary, .btn')?.focus({ preventScroll: true }));
    return m;
  }

  closeAllModals() {
    for (const m of [...this.modals]) {
      m.close();
    }
    this.modals = [];
  }

  confirm(title, body, okLabel, onOk) {
    const content = typeof body === 'string' ? h('p', body) : body;
    const m = this.openModal(content, {
      title,
      actions: [
        { label: 'Cancel', onclick: () => m.close() },
        { label: okLabel, primary: true, onclick: () => { m.close(); onOk(); } },
      ],
    });
  }

  /** In-combat choice (e.g. Rewind). Resolves with the chosen card uids. */
  chooseCards(req) {
    return new Promise((resolve) => {
      const picked = new Set();
      const grid = h('div.card-grid');
      const update = () => {
        for (const el of grid.children) el.classList.toggle('picked', picked.has(el.dataset.uid));
        m.setActions([{ label: `Confirm${req.max > 1 ? ` (${picked.size})` : ''}`, primary: true, disabled: picked.size < req.min, onclick: () => { m.close(); resolve([...picked]); } }]);
      };
      for (const c of req.options) {
        const el = cardEl(c.id, c.up, { cls: 'pickable' });
        el.dataset.uid = c.uid;
        el.addEventListener('click', () => {
          if (picked.has(c.uid)) picked.delete(c.uid);
          else {
            if (picked.size >= req.max) picked.clear();
            picked.add(c.uid);
          }
          this.sfx.play('click');
          update();
        });
        grid.appendChild(el);
      }
      const m = this.openModal(grid, { title: req.prompt, dismissible: false, wide: true });
      update();
    });
  }

  showCardList(title, cards, note = '', { upgradesToggle = false } = {}) {
    const grid = h('div.card-grid');
    let showUp = false;
    const fill = () => {
      clear(grid);
      if (!cards.length) grid.appendChild(h('p.dim', 'No cards.'));
      for (const c of cards) grid.appendChild(cardEl(c.id, c.up || (showUp && canUpgrade(c.id, c.up)), { cls: 'static' }));
    };
    fill();
    const content = h('div', note && h('p.dim', note), grid);
    const m = this.openModal(content, {
      title: `${title} (${cards.length})`,
      wide: true,
      actions: [
        upgradesToggle && { label: 'Show upgrades', onclick: (e) => { showUp = !showUp; e.target.textContent = showUp ? 'Hide upgrades' : 'Show upgrades'; fill(); } },
        { label: 'Close', primary: true, onclick: () => m.close() },
      ].filter(Boolean),
    });
  }

  showDeck() {
    this.showCardList('Your deck', sortCards(this.run.deck), '', { upgradesToggle: true });
  }

  /** Deck/card choices stored in run.room.pendingChoice (events, rest, shop). */
  showPendingChoice() {
    const run = this.run;
    const pc = run.room.pendingChoice;
    if (pc.kind === 'cards') {
      this.cardPicker(pc.options, 'Choose a card', (i) => { R.resolveCardChoice(run, i); this.commit(); }, true);
      return;
    }
    const opts = sortCards(R.deckChoiceOptions(run));
    const title = { remove: 'Remove a card', upgrade: 'Upgrade a card', duplicate: 'Duplicate a card' }[pc.op];
    const sub = pc.source === 'shop' ? `Costs ${R.removalPrice(run)} Shards.` : pc.op === 'upgrade' ? 'Tap a card to preview the upgrade.' : '';
    let chosen = null;
    const grid = h('div.card-grid');
    const preview = h('div.upgrade-preview', { hidden: true });
    const cancel = () => { R.resolveDeckChoice(run, []); this.commit(); };
    const update = () => {
      for (const el of grid.children) el.classList.toggle('picked', el.dataset.uid === chosen);
      if (pc.op === 'upgrade' && chosen) {
        const c = opts.find((x) => x.uid === chosen);
        clear(preview);
        preview.append(cardEl(c.id, false, { cls: 'static' }), h('span.arrow', { html: icon('arrow') }), cardEl(c.id, true, { cls: 'static' }));
        preview.hidden = false;
      }
      m.setActions([
        pc.cancellable && { label: 'Cancel', onclick: () => { m.close(); cancel(); } },
        { label: { remove: 'Remove', upgrade: 'Upgrade', duplicate: 'Duplicate' }[pc.op], primary: true, disabled: !chosen, onclick: () => { m.close(); R.resolveDeckChoice(run, [chosen]); this.sfx.play(pc.op === 'upgrade' ? 'buff' : 'fade'); this.commit(); } },
      ].filter(Boolean));
    };
    for (const c of opts) {
      const el = cardEl(c.id, c.up, { cls: 'pickable' });
      el.dataset.uid = c.uid;
      el.addEventListener('click', () => { chosen = c.uid; this.sfx.play('click'); update(); if (pc.op === 'upgrade') preview.scrollIntoView?.({ block: 'nearest' }); });
      grid.appendChild(el);
    }
    const m = this.openModal(h('div', preview, grid), { title, sub, wide: true, dismissible: false });
    update();
  }

  /** Pick 1 of N cards (rewards / events). onPick(index|null). */
  cardPicker(options, title, onPick, allowSkip = true) {
    let chosen = null;
    const row = h('div.card-pick-row');
    options.forEach((c, i) => {
      const el = cardEl(c.id, c.up, { cls: 'pickable big' });
      el.addEventListener('click', () => {
        if (chosen === i) { m.close(); onPick(i); this.sfx.play('card'); return; }
        chosen = i;
        this.sfx.play('click');
        for (const [k, child] of [...row.children].entries()) child.classList.toggle('picked', k === i);
        m.setActions(actions());
      });
      row.appendChild(el);
    });
    const actions = () => [
      allowSkip && { label: 'Skip', onclick: () => { m.close(); onPick(null); } },
      { label: chosen === null ? 'Take card' : `Take ${cardName(options[chosen].id, options[chosen].up)}`, primary: true, disabled: chosen === null, onclick: () => { m.close(); onPick(chosen); this.sfx.play('card'); } },
    ].filter(Boolean);
    const m = this.openModal(row, { title, sub: 'Tap a card to select it.', wide: true, actions: actions(), dismissible: allowSkip });
  }

  chooseRewardCard() {
    const rw = this.run.room.rewards;
    this.cardPicker(rw.cards, 'Choose a card', (i) => {
      if (i === null) { this.toast('Card skipped.'); }
      R.pickRewardCard(this.run, i);
      this.commit();
    }, true);
  }

  chooseBossRelic() {
    const rw = this.run.room.rewards;
    const list = h('div.boss-relics');
    rw.bossRelics.forEach((id, i) => {
      list.appendChild(h('button.boss-relic', {
        type: 'button',
        onclick: () => { m.close(); R.pickBossRelic(this.run, i); this.sfx.play('relic'); this.commit(); },
      }, relicRow(id)));
    });
    const m = this.openModal(list, {
      title: 'Choose a boss relic',
      sub: 'Powerful, but most come with a cost.',
      actions: [{ label: 'Skip', onclick: () => { m.close(); R.pickBossRelic(this.run, null); this.commit(); } }],
    });
  }

  showSettings(inRun = false) {
    const s = this.settings;
    const toggle = (label, key, values, labels) => {
      const btn = h('button.seg', { type: 'button' });
      const draw = () => { btn.innerHTML = `<span>${label}</span><b>${labels[values.indexOf(s[key])]}</b>`; };
      btn.addEventListener('click', () => {
        s[key] = values[(values.indexOf(s[key]) + 1) % values.length];
        store.saveSettings(s);
        this.sfx.applySettings();
        if (key === 'quality') this.scene.setQuality(s.quality);
        if (key === 'speed') this.scene.speed = s.speed === 'fast' ? 1.8 : 1;
        this.sfx.play('click');
        draw();
      });
      draw();
      return btn;
    };
    const body = h('div.settings',
      toggle('Sound effects', 'sound', [true, false], ['On', 'Off']),
      toggle('Music', 'music', [true, false], ['On', 'Off']),
      toggle('Animation speed', 'speed', ['normal', 'fast'], ['Normal', 'Fast']),
      toggle('Graphics', 'quality', ['high', 'low'], ['High', 'Low']),
      inRun && this.run && h('p.dim.seed-line', `Seed ${this.run.seed} · Floor ${this.run.floor}`));
    const m = this.openModal(body, {
      title: inRun ? 'Menu' : 'Settings',
      actions: [
        inRun && { label: 'How to play', onclick: () => this.showHelp() },
        inRun && { label: 'Abandon run', onclick: () => { this.confirm('Abandon this run?', 'It will count as a loss.', 'Abandon', () => { m.close(); this.abandonRun(); }); } },
        inRun && { label: 'Save & quit', onclick: () => { m.close(); this.save(); this.toTitle(); } },
        { label: 'Close', primary: true, onclick: () => m.close() },
      ].filter(Boolean),
    });
  }

  abandonRun() {
    this.endCombatView();
    this.run.over = 'lose';
    this.commit();
  }

  showHelp() {
    const body = h('div.help', { html: `
      <p><b>Goal.</b> Climb three acts of the rift and defeat the boss at the top of each map. Your HP carries over between fights.</p>
      <p><b>Your turn.</b> You get <b class="kw">Energy</b> and draw 5 cards. Play cards by dragging them up (or tapping twice). Attacks that target one enemy need a target: drag the arrow onto it, or select the card and tap the enemy.</p>
      <p><b>Intents.</b> The icon above each enemy shows what it will do next turn: attack (with damage), defend, buff, debuff or something unknown. Plan your <b class="kw">Shield</b> around it. Shield disappears at the start of your next turn.</p>
      <p><b>Growing your deck.</b> After fights you pick 1 of 3 cards. A lean deck draws its best cards more often, so skipping is often right. Rest sites heal or upgrade a card, shops remove cards.</p>
      <p><b>Keywords.</b> <b class="kw">Burn</b> hurts over time. <b class="kw">Exposed</b> takes 50% more attack damage. <b class="kw">Jammed</b> deals 25% less. <b class="kw">Charge</b> is stored energy for Discharge effects. <b class="kw">Fade</b> cards leave the fight after use. Tap or hover any icon for details.</p>
      <p class="dim">Keyboard: 1–9 select a card, Enter plays it, arrow keys pick a target, E ends the turn, Esc cancels.</p>` });
    const m = this.openModal(body, { title: 'How to play', actions: [{ label: 'Got it', primary: true, onclick: () => m.close() }] });
  }
}

export { safeBottom, relicRow, cardName, RELICS };
