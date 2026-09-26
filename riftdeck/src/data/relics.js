// Relics: passive items. Combat hooks receive (g, relic) where relic is the
// run's relic entry ({ id, counter }), so counters persist between combats.

export const RELICS = {
  // ---------------------------------------------------------------- starter
  rift_anchor: {
    name: 'Rift Anchor', rarity: 'starter',
    desc: 'At the end of combat, heal 6 HP.',
    combatEndHeal: 6,
  },

  // ----------------------------------------------------------------- common
  spare_cell: {
    name: 'Spare Cell', rarity: 'common',
    desc: 'Gain 1 extra Energy on your first turn of each combat.',
    onTurnStart(g) { if (g.turn === 1) g.gainEnergy(1); },
  },
  kinetic_plate: {
    name: 'Kinetic Plate', rarity: 'common',
    desc: 'Start each combat with 10 Shield.',
    onCombatStart(g) { g.gainShield(g.player, 10, false); },
  },
  focus_lens: {
    name: 'Focus Lens', rarity: 'common',
    desc: 'Start each combat with 1 Amp.',
    onCombatStart(g) { g.applyStatus(g.player, 'amp', 1); },
  },
  gyro_plating: {
    name: 'Gyro Plating', rarity: 'common',
    desc: 'Start each combat with 1 Plating.',
    onCombatStart(g) { g.applyStatus(g.player, 'plating', 1); },
  },
  nano_mesh: {
    name: 'Nano Mesh', rarity: 'common',
    desc: 'Raise your Max HP by 8.',
    onPickup(run) { run.maxHp += 8; run.hp += 8; },
  },
  data_shard: {
    name: 'Data Shard', rarity: 'common',
    desc: 'Draw 2 additional cards on your first turn of each combat.',
    drawBonus: (g) => (g.turn === 1 ? 2 : 0),
  },
  pocket_capacitor: {
    name: 'Pocket Capacitor', rarity: 'common',
    desc: 'Start each combat with 2 Charge.',
    onCombatStart(g) { g.gainCharge(2); },
  },
  scrap_magnet: {
    name: 'Scrap Magnet', rarity: 'common',
    desc: 'Combats reward 25% more Shards.',
    shardMult: 1.25,
  },

  // --------------------------------------------------------------- uncommon
  ember_core: {
    name: 'Ember Core', rarity: 'uncommon',
    desc: 'Whenever you apply Burn to an enemy, apply 1 additional Burn.',
  },
  tally_counter: {
    name: 'Tally Counter', rarity: 'uncommon', counter: 0,
    desc: 'Every 10th Attack you play deals double damage.',
    beforePlay(g, r, card) {
      if (card.def.type !== 'attack') return;
      r.counter = (r.counter || 0) + 1;
      if (r.counter >= 10) {
        r.counter = 0;
        g.curPlay.double = true;
        g.flashRelic(r.id);
      }
    },
  },
  shock_coil: {
    name: 'Shock Coil', rarity: 'uncommon',
    desc: 'Every time you play 3 Attacks in a single turn, gain 1 Amp.',
    onCardPlayed(g, r, card) {
      if (card.def.type === 'attack' && g.turnInfo.attacks % 3 === 0) {
        g.applyStatus(g.player, 'amp', 1);
        g.flashRelic(r.id);
      }
    },
  },
  hardlight_buckle: {
    name: 'Hardlight Buckle', rarity: 'uncommon',
    desc: 'If you end your turn without Shield, gain 6 Shield.',
    onTurnEnd(g, r) {
      if (g.player.shield === 0) {
        g.gainShield(g.player, 6, false);
        g.flashRelic(r.id);
      }
    },
  },
  failsafe: {
    name: 'Failsafe', rarity: 'uncommon',
    desc: 'The first time your HP drops below 50% in a combat, heal 12 HP.',
    onPlayerHpLoss(g, r) {
      const p = g.player;
      if (!g.combatInfo.failsafe && p.hp > 0 && p.hp < p.maxHp / 2) {
        g.combatInfo.failsafe = true;
        g.heal(p, 12);
        g.flashRelic(r.id);
      }
    },
  },
  field_kit: {
    name: 'Field Kit', rarity: 'uncommon',
    desc: 'Recovering at rest sites heals an additional 15 HP.',
    restBonus: 15,
  },
  recycler: {
    name: 'Recycler', rarity: 'uncommon',
    desc: 'Whenever a card Fades, gain 3 Shield.',
    onFade(g, r) { g.gainShield(g.player, 3, false); g.flashRelic(r.id); },
  },
  target_array: {
    name: 'Target Array', rarity: 'uncommon',
    desc: 'At the start of each combat, apply 1 Exposed to ALL enemies.',
    onCombatStart(g) { for (const e of g.aliveEnemies()) g.applyStatus(e, 'exposed', 1); },
  },
  wide_band: {
    name: 'Wide Band', rarity: 'uncommon',
    desc: 'Card rewards offer 1 additional card.',
    cardRewardBonus: 1,
  },

  // ------------------------------------------------------------------- rare
  void_battery: {
    name: 'Void Battery', rarity: 'rare',
    desc: 'Unspent Energy carries over to your next turn.',
    keepEnergy: true,
  },
  phoenix_sigil: {
    name: 'Phoenix Sigil', rarity: 'rare', counter: 1,
    desc: 'The first time you would die, heal to 50% of your Max HP instead.',
  },
  mirror_core: {
    name: 'Mirror Core', rarity: 'rare',
    desc: 'The first Attack you play each combat is played twice.',
  },
  arc_coil: {
    name: 'Arc Coil', rarity: 'rare',
    desc: 'At the start of your turn, deal 3 damage to ALL enemies.',
    onTurnStart(g, r) {
      for (const e of g.aliveEnemies()) g.dealDamage(e, 3, 'relic');
      g.flashRelic(r.id);
    },
  },
  ghost_mantle: {
    name: 'Ghost Mantle', rarity: 'rare',
    desc: 'At the start of Elite and Boss combats, gain 1 Phased.',
    onCombatStart(g, r) {
      if (g.kind === 'elite' || g.kind === 'boss') {
        g.applyStatus(g.player, 'phased', 1);
        g.flashRelic(r.id);
      }
    },
  },

  // ------------------------------------------------------------------- shop
  membership_chip: {
    name: 'Membership Chip', rarity: 'shop',
    desc: 'Everything in shops is 20% cheaper.',
    priceMult: 0.8,
  },
  cell_rack: {
    name: 'Cell Rack', rarity: 'shop',
    desc: 'Gain 1 additional Cell slot.',
    onPickup(run) { run.cells.push(null); },
  },

  // ------------------------------------------------------------------- boss
  rift_engine: {
    name: 'Rift Engine', rarity: 'boss',
    desc: 'Gain 1 Energy at the start of each turn. You can no longer Recover at rest sites.',
    energy: 1, noRestHeal: true,
  },
  hollow_crown: {
    name: 'Hollow Crown', rarity: 'boss',
    desc: 'Gain 1 Energy at the start of each turn. You can no longer see enemy intents.',
    energy: 1, hideIntents: true,
  },
  static_heart: {
    name: 'Static Heart', rarity: 'boss',
    desc: 'Gain 1 Energy at the start of each turn. At the start of each combat, shuffle 2 Static into your draw pile.',
    energy: 1,
    onCombatStart(g) { g.addCard('static', 'draw', { n: 2 }); },
  },
  wide_lens: {
    name: 'Wide Lens', rarity: 'boss',
    desc: 'Draw 1 additional card each turn.',
    drawBonus: () => 1,
  },
  void_lure: {
    name: 'Void Lure', rarity: 'boss',
    desc: 'Elites drop an additional relic. Raise your Max HP by 10.',
    extraEliteRelic: true,
    onPickup(run) { run.maxHp += 10; run.hp += 10; },
  },
};

export const RELIC_POOLS = ['common', 'uncommon', 'rare', 'shop', 'boss'].reduce((acc, r) => {
  acc[r] = Object.keys(RELICS).filter((id) => RELICS[id].rarity === r);
  return acc;
}, {});
