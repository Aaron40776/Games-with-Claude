// Card definitions.
//
// Text tokens:  {D:key} attack damage (shows Amp/Jammed/Exposed live in combat)
//               {S:key} Shield from cards (shows Plating/Fragile)
//               {key}   plain value
// `vals` are the base values, `up` overrides them when the card is upgraded.
// `play(g, v, target, card)` may be a generator and `yield g.choose(...)`
// to ask the player to pick cards mid-effect.
// `rating` (0-10) is used by the reward/shop weighting and the sim bot.

export const CARDS = {
  // ------------------------------------------------------------ starter ---
  pulse_shot: {
    name: 'Pulse Shot', type: 'attack', rarity: 'starter', cost: 1, target: 'enemy', rating: 1,
    vals: { dmg: 6 }, up: { dmg: 9 },
    text: 'Deal {D:dmg} damage.',
    play(g, v, t) { g.attack(t, v.dmg); },
  },
  deflect: {
    name: 'Deflect', type: 'skill', rarity: 'starter', cost: 1, target: 'self', rating: 1,
    vals: { sh: 5 }, up: { sh: 8 },
    text: 'Gain {S:sh} Shield.',
    play(g, v) { g.shield(v.sh); },
  },
  arc_lance: {
    name: 'Arc Lance', type: 'attack', rarity: 'starter', cost: 2, target: 'enemy', rating: 5,
    vals: { dmg: 8, ex: 2 }, up: { dmg: 10, ex: 3 },
    text: 'Deal {D:dmg} damage. Apply {ex} Exposed.',
    play(g, v, t) { g.attack(t, v.dmg); g.applyStatus(t, 'exposed', v.ex); },
  },

  // ------------------------------------------------------ common attacks ---
  twin_burst: {
    name: 'Twin Burst', type: 'attack', rarity: 'common', cost: 1, target: 'enemy', rating: 5,
    vals: { dmg: 5 }, up: { dmg: 7 },
    text: 'Deal {D:dmg} damage twice.',
    play(g, v, t) { g.attack(t, v.dmg); g.attack(t, v.dmg); },
  },
  scatter_blast: {
    name: 'Scatter Blast', type: 'attack', rarity: 'common', cost: 1, target: 'all', rating: 6,
    vals: { dmg: 7 }, up: { dmg: 10 },
    text: 'Deal {D:dmg} damage to ALL enemies.',
    play(g, v) { g.attackAll(v.dmg); },
  },
  rail_spike: {
    name: 'Rail Spike', type: 'attack', rarity: 'common', cost: 2, target: 'enemy', rating: 5,
    vals: { dmg: 13 }, up: { dmg: 18 },
    text: 'Deal {D:dmg} damage. Ignores Shield.',
    play(g, v, t) { g.attack(t, v.dmg, { pierce: true }); },
  },
  ember_round: {
    name: 'Ember Round', type: 'attack', rarity: 'common', cost: 1, target: 'enemy', rating: 5,
    vals: { dmg: 5, burn: 3 }, up: { dmg: 7, burn: 4 },
    text: 'Deal {D:dmg} damage. Apply {burn} Burn.',
    play(g, v, t) { g.attack(t, v.dmg); g.applyStatus(t, 'burn', v.burn); },
  },
  quick_draw: {
    name: 'Quick Draw', type: 'attack', rarity: 'common', cost: 0, target: 'enemy', rating: 5,
    vals: { dmg: 3 }, up: { dmg: 6 },
    text: 'Deal {D:dmg} damage. Draw 1 card.',
    play(g, v, t) { g.attack(t, v.dmg); g.drawCards(1); },
  },
  bulwark_slam: {
    name: 'Bulwark Slam', type: 'attack', rarity: 'common', cost: 1, upCost: 0, target: 'enemy', rating: 5,
    vals: {}, up: {},
    dyn: (g, v) => ({ ...v, dmg: g.player.shield }),
    text: 'Deal damage equal to your Shield.',
    combatText: 'Deal damage equal to your Shield ({D:dmg}).',
    play(g, v, t) { g.attack(t, g.player.shield); },
  },
  charge_shot: {
    name: 'Charge Shot', type: 'attack', rarity: 'common', cost: 1, target: 'enemy', rating: 5,
    vals: { dmg: 6, ch: 1 }, up: { dmg: 8, ch: 2 },
    text: 'Deal {D:dmg} damage. Gain {ch} Charge.',
    play(g, v, t) { g.attack(t, v.dmg); g.gainCharge(v.ch); },
  },
  static_needle: {
    name: 'Static Needle', type: 'attack', rarity: 'common', cost: 1, target: 'enemy', rating: 5,
    vals: { dmg: 8, jam: 1 }, up: { dmg: 10, jam: 2 },
    text: 'Deal {D:dmg} damage. Apply {jam} Jammed.',
    play(g, v, t) { g.attack(t, v.dmg); g.applyStatus(t, 'jammed', v.jam); },
  },
  ricochet: {
    name: 'Ricochet', type: 'attack', rarity: 'common', cost: 1, target: 'random', rating: 4,
    vals: { dmg: 3, n: 3 }, up: { dmg: 3, n: 4 },
    text: 'Deal {D:dmg} damage to a random enemy {n} times.',
    play(g, v) { for (let i = 0; i < v.n; i++) g.attackRandom(v.dmg); },
  },
  slug_round: {
    name: 'Slug Round', type: 'attack', rarity: 'common', cost: 2, target: 'enemy', rating: 4,
    vals: { dmg: 16 }, up: { dmg: 21 },
    text: 'Deal {D:dmg} damage.',
    play(g, v, t) { g.attack(t, v.dmg); },
  },

  // ------------------------------------------------------- common skills ---
  phase_step: {
    name: 'Phase Step', type: 'skill', rarity: 'common', cost: 1, target: 'self', rating: 6,
    vals: { sh: 7 }, up: { sh: 10 },
    text: 'Gain {S:sh} Shield. Draw 1 card.',
    play(g, v) { g.shield(v.sh); g.drawCards(1); },
  },
  hardlight_wall: {
    name: 'Hardlight Wall', type: 'skill', rarity: 'common', cost: 2, target: 'self', rating: 3,
    vals: { sh: 14 }, up: { sh: 19 },
    text: 'Gain {S:sh} Shield.',
    play(g, v) { g.shield(v.sh); },
  },
  capacitor: {
    name: 'Capacitor', type: 'skill', rarity: 'common', cost: 1, target: 'self', rating: 4,
    vals: { ch: 2 }, up: { ch: 3 },
    text: 'Gain {ch} Charge. Draw 1 card.',
    play(g, v) { g.gainCharge(v.ch); g.drawCards(1); },
  },
  scan: {
    name: 'Scan', type: 'skill', rarity: 'common', cost: 1, upCost: 0, target: 'none', rating: 5,
    vals: { n: 3 }, up: { n: 3 },
    text: 'Draw {n} cards.',
    play(g, v) { g.drawCards(v.n); },
  },
  flashbang: {
    name: 'Flashbang', type: 'skill', rarity: 'common', cost: 1, target: 'all', rating: 5,
    vals: { jam: 2 }, up: { jam: 3 },
    text: 'Apply {jam} Jammed to ALL enemies.',
    play(g, v) { for (const e of g.aliveEnemies()) g.applyStatus(e, 'jammed', v.jam); },
  },
  vent: {
    name: 'Vent', type: 'skill', rarity: 'common', cost: 0, target: 'self', rating: 3, hold: true,
    vals: { sh: 3 }, up: { sh: 5 },
    text: 'Gain {S:sh} Shield.',
    play(g, v) { g.shield(v.sh); },
  },
  overcharge: {
    name: 'Overcharge', type: 'skill', rarity: 'common', cost: 0, target: 'self', rating: 4,
    vals: { ch: 2 }, up: { ch: 3 },
    text: 'Lose 2 HP. Gain {ch} Charge.',
    play(g, v) { g.loseHp(g.player, 2, 'self'); g.gainCharge(v.ch); },
  },
  target_lock: {
    name: 'Target Lock', type: 'skill', rarity: 'common', cost: 0, target: 'enemy', rating: 4,
    vals: { ex: 1 }, up: { ex: 2 },
    text: 'Apply {ex} Exposed.',
    play(g, v, t) { g.applyStatus(t, 'exposed', v.ex); },
  },

  // ---------------------------------------------------- uncommon attacks ---
  discharge: {
    name: 'Discharge', type: 'attack', rarity: 'uncommon', cost: 1, target: 'enemy', rating: 6,
    vals: { per: 5 }, up: { per: 7 },
    dyn: (g, v) => ({ ...v, total: v.per * g.status(g.player, 'charge') }),
    text: 'Deal {per} damage for each Charge you have. Lose all Charge.',
    combatText: 'Deal {D:total} damage ({per} per Charge). Lose all Charge.',
    play(g, v, t) {
      const n = g.status(g.player, 'charge');
      if (n > 0) g.attack(t, v.per * n);
      g.setStatus(g.player, 'charge', 0);
    },
  },
  arc_chain: {
    name: 'Arc Chain', type: 'attack', rarity: 'uncommon', cost: 2, target: 'all', rating: 6,
    vals: { dmg: 9 }, up: { dmg: 12 },
    text: 'Deal {D:dmg} damage to ALL enemies. Gain 1 Charge for each enemy hit.',
    play(g, v) {
      const hit = g.aliveEnemies().length;
      g.attackAll(v.dmg);
      g.gainCharge(hit);
    },
  },
  fusion_beam: {
    name: 'Fusion Beam', type: 'attack', rarity: 'uncommon', cost: 'X', target: 'enemy', rating: 6,
    vals: { dmg: 9 }, up: { dmg: 12 },
    text: 'Deal {D:dmg} damage X times.',
    play(g, v, t) { for (let i = 0; i < v.x; i++) g.attack(t, v.dmg); },
  },
  finisher: {
    name: 'Finisher', type: 'attack', rarity: 'uncommon', cost: 1, target: 'enemy', rating: 5,
    vals: { dmg: 9 }, up: { dmg: 12 },
    text: 'Deal {D:dmg} damage. If this destroys the enemy, gain 2 Energy.',
    play(g, v, t) { if (g.attack(t, v.dmg).killed) g.gainEnergy(2); },
  },
  momentum: {
    name: 'Momentum', type: 'attack', rarity: 'uncommon', cost: 1, target: 'enemy', rating: 5,
    vals: { dmg: 6, inc: 3 }, up: { dmg: 8, inc: 4 },
    dyn: (g, v, card) => ({ ...v, dmg: v.dmg + (card.bonus || 0) }),
    text: 'Deal {D:dmg} damage. Increase this card\'s damage by {inc} this combat.',
    play(g, v, t, card) { g.attack(t, v.dmg); card.bonus = (card.bonus || 0) + v.inc; },
  },
  pierce_veil: {
    name: 'Pierce the Veil', type: 'attack', rarity: 'uncommon', cost: 2, target: 'enemy', rating: 5, volatile: true,
    vals: { dmg: 20 }, up: { dmg: 28 },
    text: 'Deal {D:dmg} damage.',
    play(g, v, t) { g.attack(t, v.dmg); },
  },
  siphon: {
    name: 'Siphon', type: 'attack', rarity: 'uncommon', cost: 2, target: 'enemy', rating: 5, fade: true,
    vals: { dmg: 10 }, up: { dmg: 14 },
    text: 'Deal {D:dmg} damage. Heal HP equal to the damage that got through Shield.',
    play(g, v, t) { const r = g.attack(t, v.dmg); g.heal(g.player, r.hpLoss); },
  },
  wildfire: {
    name: 'Wildfire', type: 'attack', rarity: 'uncommon', cost: 1, target: 'all', rating: 6,
    vals: { dmg: 4, burn: 2 }, up: { dmg: 6, burn: 3 },
    text: 'Deal {D:dmg} damage and apply {burn} Burn to ALL enemies.',
    play(g, v) {
      g.attackAll(v.dmg);
      for (const e of g.aliveEnemies()) g.applyStatus(e, 'burn', v.burn);
    },
  },

  // ----------------------------------------------------- uncommon skills ---
  firestorm: {
    name: 'Firestorm', type: 'skill', rarity: 'uncommon', cost: 2, target: 'all', rating: 6,
    vals: { burn: 6 }, up: { burn: 9 },
    text: 'Apply {burn} Burn to ALL enemies.',
    play(g, v) { for (const e of g.aliveEnemies()) g.applyStatus(e, 'burn', v.burn); },
  },
  catalyst: {
    name: 'Catalyst', type: 'skill', rarity: 'uncommon', cost: 1, target: 'enemy', rating: 5, fade: true,
    vals: { mult: 2 }, up: { mult: 3 },
    text: '{multWord} the enemy\'s Burn.',
    words: { multWord: (v) => (v.mult === 3 ? 'Triple' : 'Double') },
    play(g, v, t) {
      const b = g.status(t, 'burn');
      if (b > 0) g.applyStatus(t, 'burn', b * (v.mult - 1));
    },
  },
  entrench: {
    name: 'Entrench', type: 'skill', rarity: 'uncommon', cost: 2, upCost: 1, target: 'self', rating: 5,
    vals: {}, up: {},
    text: 'Double your Shield.',
    play(g) { if (g.player.shield > 0) g.gainShield(g.player, g.player.shield, false); },
  },
  rewind: {
    name: 'Rewind', type: 'skill', rarity: 'uncommon', cost: 1, upCost: 0, target: 'none', rating: 4,
    vals: {}, up: {},
    text: 'Put a card from your discard pile into your hand.',
    *play(g) {
      const picked = yield g.choose({ options: [...g.discard], min: 1, max: 1, prompt: 'Return a card to your hand' });
      for (const c of picked) g.moveCard(c, 'hand');
    },
  },
  adrenal_spike: {
    name: 'Adrenal Spike', type: 'skill', rarity: 'uncommon', cost: 0, target: 'none', rating: 7, fade: true,
    vals: { en: 1 }, up: { en: 2 },
    text: 'Gain {en} Energy. Draw 2 cards.',
    play(g, v) { g.gainEnergy(v.en); g.drawCards(2); },
  },
  surge: {
    name: 'Surge', type: 'skill', rarity: 'uncommon', cost: 0, target: 'self', rating: 4,
    vals: { amp: 2 }, up: { amp: 4 },
    text: 'Gain {amp} Amp this turn.',
    play(g, v) { g.applyStatus(g.player, 'amp', v.amp); g.applyStatus(g.player, 'surge', v.amp); },
  },
  reroute: {
    name: 'Reroute', type: 'skill', rarity: 'uncommon', cost: 0, target: 'none', rating: 3, fade: true,
    upFlags: { fade: false },
    vals: {}, up: {},
    text: 'Discard your hand, then draw that many cards.',
    play(g) {
      const n = g.hand.length;
      for (const c of [...g.hand]) g.discardCard(c);
      g.drawCards(n);
    },
  },
  coolant_flush: {
    name: 'Coolant Flush', type: 'skill', rarity: 'uncommon', cost: 1, target: 'self', rating: 4,
    vals: { sh: 8 }, up: { sh: 11 },
    text: 'Gain {S:sh} Shield. Remove Exposed, Jammed, Fragile and Burn from yourself.',
    play(g, v) { g.shield(v.sh); g.cleanse(g.player); },
  },

  // ----------------------------------------------------- uncommon powers ---
  reactor: {
    name: 'Reactor', type: 'power', rarity: 'uncommon', cost: 1, upCost: 0, target: 'self', rating: 6,
    vals: { n: 1 }, up: { n: 1 },
    text: 'At the start of your turn, gain {n} Charge.',
    play(g, v) { g.applyStatus(g.player, 'reactor', v.n); },
  },
  hardlight_plating: {
    name: 'Hardlight Plating', type: 'power', rarity: 'uncommon', cost: 1, target: 'self', rating: 6,
    vals: { n: 3 }, up: { n: 4 },
    text: 'At the end of your turn, gain {n} Shield.',
    play(g, v) { g.applyStatus(g.player, 'hardlight', v.n); },
  },
  ignition_field: {
    name: 'Ignition Field', type: 'power', rarity: 'uncommon', cost: 1, target: 'self', rating: 6,
    vals: { n: 2 }, up: { n: 3 },
    text: 'At the start of your turn, apply {n} Burn to ALL enemies.',
    play(g, v) { g.applyStatus(g.player, 'ignition', v.n); },
  },
  reflector: {
    name: 'Reflector', type: 'power', rarity: 'uncommon', cost: 1, target: 'self', rating: 5,
    vals: { n: 3 }, up: { n: 5 },
    text: 'Gain {n} Spikes.',
    play(g, v) { g.applyStatus(g.player, 'spikes', v.n); },
  },
  ghost_protocol: {
    name: 'Ghost Protocol', type: 'power', rarity: 'uncommon', cost: 1, target: 'self', rating: 6,
    upFlags: { opening: true },
    vals: { n: 1 }, up: { n: 1 },
    text: 'Whenever you play a card, gain {n} Shield.',
    play(g, v) { g.applyStatus(g.player, 'ghost', v.n); },
  },

  // ---------------------------------------------------------------- rare ---
  singularity: {
    name: 'Singularity', type: 'attack', rarity: 'rare', cost: 3, target: 'all', rating: 7, fade: true,
    vals: { dmg: 24 }, up: { dmg: 32 },
    text: 'Deal {D:dmg} damage to ALL enemies.',
    play(g, v) { g.attackAll(v.dmg); },
  },
  overdrive: {
    name: 'Overdrive', type: 'power', rarity: 'rare', cost: 1, upCost: 0, target: 'self', rating: 8,
    vals: { ex: 2 }, up: { ex: 2 },
    text: 'Apply {ex} Exposed to yourself. At the start of your turn, gain 1 Energy.',
    play(g, v) { g.applyStatus(g.player, 'exposed', v.ex); g.applyStatus(g.player, 'overdrive', 1); },
  },
  ascension_protocol: {
    name: 'Ascension Protocol', type: 'power', rarity: 'rare', cost: 3, target: 'self', rating: 7,
    vals: { n: 2 }, up: { n: 3 },
    text: 'At the start of your turn, gain {n} Amp.',
    play(g, v) { g.applyStatus(g.player, 'ascend', v.n); },
  },
  echo_chamber: {
    name: 'Echo Chamber', type: 'power', rarity: 'rare', cost: 2, upCost: 1, target: 'self', rating: 8,
    vals: {}, up: {},
    text: 'The first card you play each turn is played twice.',
    play(g) { g.applyStatus(g.player, 'echo', 1); },
  },
  uplink: {
    name: 'Uplink', type: 'power', rarity: 'rare', cost: 1, target: 'self', rating: 7,
    upFlags: { opening: true },
    vals: {}, up: {},
    text: 'Draw 1 additional card each turn.',
    play(g) { g.applyStatus(g.player, 'uplink', 1); },
  },
  meltdown: {
    name: 'Meltdown', type: 'attack', rarity: 'rare', cost: 2, target: 'all', rating: 7,
    vals: { dmg: 6 }, up: { dmg: 9 },
    text: 'Deal {D:dmg} damage to ALL enemies. Then each enemy loses HP equal to its Burn.',
    play(g, v) {
      g.attackAll(v.dmg);
      for (const e of g.aliveEnemies()) {
        const b = g.status(e, 'burn');
        if (b > 0) g.loseHp(e, b, 'burn');
      }
    },
  },
  amplify: {
    name: 'Amplify', type: 'skill', rarity: 'rare', cost: 1, target: 'self', rating: 6, fade: true,
    upFlags: { fade: false },
    vals: {}, up: {},
    text: 'Double your Amp.',
    play(g) {
      const a = g.status(g.player, 'amp');
      if (a > 0) g.applyStatus(g.player, 'amp', a);
    },
  },
  static_shell: {
    name: 'Static Shell', type: 'power', rarity: 'rare', cost: 1, upCost: 0, target: 'self', rating: 6,
    vals: { n: 3 }, up: { n: 3 },
    text: 'Whenever you gain Charge, gain {n} Shield per Charge.',
    play(g, v) { g.applyStatus(g.player, 'static_shell', v.n); },
  },
  rift_tear: {
    name: 'Rift Tear', type: 'attack', rarity: 'rare', cost: 4, target: 'enemy', rating: 7,
    vals: { dmg: 32 }, up: { dmg: 42 },
    costFn: (g, base) => Math.max(0, base - g.turnInfo.cards),
    text: 'Deal {D:dmg} damage. Costs 1 less for each other card played this turn.',
    play(g, v, t) { g.attack(t, v.dmg); },
  },
  phase_shift: {
    name: 'Phase Shift', type: 'skill', rarity: 'rare', cost: 2, upCost: 1, target: 'self', rating: 7, fade: true,
    vals: {}, up: {},
    text: 'Gain 1 Phased. (All damage you take this round is reduced to 1.)',
    play(g) { g.applyStatus(g.player, 'phased', 1); },
  },

  // ------------------------------------------------------ status / curse ---
  static: {
    name: 'Static', type: 'status', rarity: 'special', cost: null, target: 'none', rating: -4,
    unplayable: true, volatile: true,
    vals: {}, up: {},
    text: 'Interference that clogs your hand.',
  },
  scorch: {
    name: 'Scorch', type: 'status', rarity: 'special', cost: null, target: 'none', rating: -5,
    unplayable: true,
    vals: { hp: 2 }, up: { hp: 2 },
    text: 'At the end of your turn, if this is in your hand, take {hp} damage.',
  },
  rift_scar: {
    name: 'Rift Scar', type: 'curse', rarity: 'special', cost: null, target: 'none', rating: -6,
    unplayable: true,
    vals: {}, up: {},
    text: 'A wound the rift left behind.',
  },
};

// Every playable card that can show up in rewards and shops.
export const REWARD_POOL = Object.keys(CARDS).filter((id) =>
  ['common', 'uncommon', 'rare'].includes(CARDS[id].rarity));

export const STARTER_DECK = [
  'pulse_shot', 'pulse_shot', 'pulse_shot', 'pulse_shot', 'pulse_shot',
  'deflect', 'deflect', 'deflect', 'deflect',
  'arc_lance',
];

/** Flag lookup that respects upgrades (e.g. Reroute loses Fade when upgraded). */
export function cardFlag(id, up, flag) {
  const def = CARDS[id];
  if (up && def.upFlags && flag in def.upFlags) return def.upFlags[flag];
  return !!def[flag];
}

export function baseCost(id, up) {
  const def = CARDS[id];
  return up && def.upCost !== undefined ? def.upCost : def.cost;
}

export function cardVals(id, up) {
  const def = CARDS[id];
  return up ? { ...def.vals, ...def.up } : { ...def.vals };
}

export function canUpgrade(id, up) {
  const r = CARDS[id].rarity;
  return !up && r !== 'special';
}

/** Display name with "+" for upgraded cards. */
export function cardName(id, up) {
  return CARDS[id].name + (up ? '+' : '');
}
