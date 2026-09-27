// Cells: single-use consumables, usable during your turn in combat.

export const CELLS = {
  blast_cell: {
    name: 'Blast Cell', rarity: 'common', target: 'enemy',
    desc: 'Deal 20 damage to an enemy.',
    use(g, t) { g.dealDamage(t, 20, 'cell'); },
  },
  shield_cell: {
    name: 'Shield Cell', rarity: 'common', target: 'none',
    desc: 'Gain 12 Shield.',
    use(g) { g.gainShield(g.player, 12, false); },
  },
  energy_cell: {
    name: 'Energy Cell', rarity: 'common', target: 'none',
    desc: 'Gain 2 Energy.',
    use(g) { g.gainEnergy(2); },
  },
  data_cell: {
    name: 'Data Cell', rarity: 'common', target: 'none',
    desc: 'Draw 3 cards.',
    use(g) { g.drawCards(3); },
  },
  fire_cell: {
    name: 'Fire Cell', rarity: 'common', target: 'none',
    desc: 'Apply 6 Burn to ALL enemies.',
    use(g) { for (const e of g.aliveEnemies()) g.applyStatus(e, 'burn', 6); },
  },
  amp_cell: {
    name: 'Amp Cell', rarity: 'uncommon', target: 'none',
    desc: 'Gain 2 Amp.',
    use(g) { g.applyStatus(g.player, 'amp', 2); },
  },
  jammer_cell: {
    name: 'Jammer Cell', rarity: 'common', target: 'enemy',
    desc: 'Apply 3 Jammed to an enemy.',
    use(g, t) { g.applyStatus(t, 'jammed', 3); },
  },
  expose_cell: {
    name: 'Expose Cell', rarity: 'common', target: 'enemy',
    desc: 'Apply 3 Exposed to an enemy.',
    use(g, t) { g.applyStatus(t, 'exposed', 3); },
  },
  repair_cell: {
    name: 'Repair Cell', rarity: 'uncommon', target: 'none',
    desc: 'Heal 20% of your Max HP.',
    use(g) { g.heal(g.player, Math.floor(g.player.maxHp * 0.2)); },
  },
  charge_cell: {
    name: 'Charge Cell', rarity: 'uncommon', target: 'none',
    desc: 'Gain 4 Charge.',
    use(g) { g.gainCharge(4); },
  },
  phase_cell: {
    name: 'Phase Cell', rarity: 'rare', target: 'none',
    desc: 'Gain 1 Phased. (All damage you take this round is reduced to 1.)',
    use(g) { g.applyStatus(g.player, 'phased', 1); },
  },
};

export const CELL_WEIGHTS = { common: 65, uncommon: 25, rare: 10 };
