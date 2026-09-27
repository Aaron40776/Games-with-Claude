// Status effects. Hooks receive (g, unit, stacks) where g is the Combat.
// Duration statuses tick down at the end of each round (see Combat.endRound).

export const DURATION_STATUSES = new Set(['exposed', 'jammed', 'fragile', 'phased']);

const turns = (n) => `${n} turn${n === 1 ? '' : 's'}`;

export const STATUSES = {
  // --- generic buffs / debuffs -------------------------------------------
  amp: {
    name: 'Amp', kind: 'buff', negative: true,
    desc: (n) => (n >= 0 ? `Attacks deal ${n} additional damage.` : `Attacks deal ${-n} less damage.`),
  },
  plating: {
    name: 'Plating', kind: 'buff', negative: true,
    desc: (n) => `Gains ${n} additional Shield from cards.`,
  },
  exposed: {
    name: 'Exposed', kind: 'debuff',
    desc: (n) => `Takes 50% more damage from attacks for ${turns(n)}.`,
  },
  jammed: {
    name: 'Jammed', kind: 'debuff',
    desc: (n) => `Deals 25% less attack damage for ${turns(n)}.`,
  },
  fragile: {
    name: 'Fragile', kind: 'debuff',
    desc: (n) => `Gains 25% less Shield from cards for ${turns(n)}.`,
  },
  burn: {
    name: 'Burn', kind: 'debuff',
    desc: (n) => `At the start of its turn, loses ${n} HP. Then Burn decreases by 1.`,
    onTurnStart(g, u, n) {
      g.loseHp(u, n, 'burn');
      g.setStatus(u, 'burn', n - 1);
    },
  },
  phased: {
    name: 'Phased', kind: 'buff',
    desc: (n) => `All damage taken is reduced to 1 for ${turns(n)}.`,
  },
  spikes: {
    name: 'Spikes', kind: 'buff',
    desc: (n) => `Whenever attacked, deals ${n} damage back to the attacker.`,
  },
  regen: {
    name: 'Regen', kind: 'buff',
    desc: (n) => `At the end of its turn, heals ${n} HP. Then Regen decreases by 1.`,
    onTurnEnd(g, u, n) {
      g.heal(u, n);
      g.setStatus(u, 'regen', n - 1);
    },
  },
  ascend: {
    name: 'Ascend', kind: 'buff',
    desc: (n) => `At the start of its turn, gains ${n} Amp.`,
    onTurnStart(g, u, n) {
      g.applyStatus(u, 'amp', n, u);
    },
  },
  surge: {
    name: 'Surge', kind: 'buff',
    desc: (n) => `At the end of this turn, loses ${n} Amp.`,
    onTurnEnd(g, u, n) {
      g.applyStatus(u, 'amp', -n, u);
      g.setStatus(u, 'surge', 0);
    },
  },
  bulwark: {
    name: 'Bulwark', kind: 'buff',
    desc: () => 'Shield does not expire at the start of its turn.',
  },

  // --- player resources / powers ---------------------------------------------
  charge: {
    name: 'Charge', kind: 'buff',
    desc: (n) => `${n} stored rift energy. Discharge effects consume it.`,
  },
  reactor: {
    name: 'Reactor', kind: 'buff',
    desc: (n) => `At the start of your turn, gain ${n} Charge.`,
    onTurnStart(g, u, n) {
      g.gainCharge(n);
    },
  },
  hardlight: {
    name: 'Hardlight', kind: 'buff',
    desc: (n) => `At the end of your turn, gain ${n} Shield.`,
    onTurnEnd(g, u, n) {
      g.gainShield(u, n, false);
    },
  },
  ignition: {
    name: 'Ignition', kind: 'buff',
    desc: (n) => `At the start of your turn, apply ${n} Burn to ALL enemies.`,
    onTurnStart(g, u, n) {
      for (const e of g.aliveEnemies()) g.applyStatus(e, 'burn', n, u);
    },
  },
  ghost: {
    name: 'Ghost Protocol', kind: 'buff',
    desc: (n) => `Whenever you play a card, gain ${n} Shield.`,
  },
  overdrive: {
    name: 'Overdrive', kind: 'buff',
    desc: (n) => `At the start of your turn, gain ${n} Energy.`,
    onTurnStart(g, u, n) {
      g.gainEnergy(n);
    },
  },
  echo: {
    name: 'Echo', kind: 'buff',
    desc: (n) => `The first ${n === 1 ? 'card' : `${n} cards`} you play each turn ${n === 1 ? 'is' : 'are'} played twice.`,
  },
  uplink: {
    name: 'Uplink', kind: 'buff',
    desc: (n) => `Draw ${n} additional card${n === 1 ? '' : 's'} each turn.`,
  },
  static_shell: {
    name: 'Static Shell', kind: 'buff',
    desc: (n) => `Whenever you gain Charge, gain ${n} Shield per Charge.`,
  },

  // --- enemy passives (mostly informational; logic lives in enemy defs) -------
  enforcer: {
    name: 'Enforcer', kind: 'buff',
    desc: (n) => `Whenever you play a Skill, gains ${n} Amp.`,
  },
  countdown: {
    name: 'Countdown', kind: 'debuff',
    desc: (n) => `Detonates in ${turns(n)}.`,
  },
  minion: {
    name: 'Minion', kind: 'debuff',
    desc: () => 'Flees when its summoner is destroyed.',
  },
  resonance: {
    name: 'Resonance', kind: 'buff',
    desc: (n) => `When an ally is destroyed, gains ${n} Amp.`,
  },
  overload_core: {
    name: 'Overload Core', kind: 'buff',
    desc: (n) => `Below half HP, gains ${n} Amp once.`,
  },
  rift_barrier: {
    name: 'Rift Barrier', kind: 'buff',
    desc: (n) => `Cannot lose more than ${n} HP in a single turn.`,
  },
};

/** Statuses that count as debuffs for cleansing effects. */
export const CLEANSABLE = ['exposed', 'jammed', 'fragile', 'burn'];
