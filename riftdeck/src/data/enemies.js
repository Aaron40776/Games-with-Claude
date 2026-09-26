// Enemy definitions and encounter tables.
//
// A move is a declarative bundle of effects that the Combat executes:
//   dmg, hits      attack the player (dmg may be a function of (g, e))
//   shield         Shield for itself          shieldAll  Shield for all allies
//   buff {id:n}    statuses on itself         buffAll    statuses on all allies
//   debuff {id:n}  statuses on the player
//   addCards [{id, n, to: 'discard'|'draw'|'hand'}]
//   heal, summon {id, n, max}, special(g, e), intent (display override)
// `ai(e, g, rng)` returns the id of the next move; it runs after each turn,
// so the player always sees what comes next.

const last = (e, n = 1) => e.history[e.history.length - n];

/**
 * Weighted pick with repetition rules.
 * noRepeat: moves that may not be used twice in a row.
 * max2:     moves that may not be used three times in a row.
 */
function choose(rng, e, table, { noRepeat = [], max2 = [] } = {}) {
  const allowed = table.filter(([id, w]) => {
    if (w <= 0) return false;
    if (noRepeat.includes(id) && last(e) === id) return false;
    if (max2.includes(id) && last(e) === id && last(e, 2) === id) return false;
    return true;
  });
  return rng.weighted(allowed.length ? allowed : table);
}

/** Fixed rotation through a list of moves (bosses). */
function cycle(e, list, start = 0) {
  e.vars.i = e.vars.i === undefined ? start : (e.vars.i + 1) % list.length;
  return list[e.vars.i];
}

const alternate = (e, a, b) => (last(e) === a ? b : a);

export const ENEMIES = {
  // =================================================================== ACT 1
  shardling: {
    name: 'Shardling', hp: [12, 16], model: 'shardling',
    moves: {
      stab: { name: 'Stab', dmg: 5 },
      harden: { name: 'Harden', shield: 4, buff: { amp: 1 } },
    },
    ai: (e, g, rng) => choose(rng, e, [['stab', 65], ['harden', 35]], { noRepeat: ['harden'] }),
  },
  broodling: {
    name: 'Broodling', hp: [8, 11], model: 'shardling', size: 0.7, tint: '#c07bff',
    moves: { nip: { name: 'Nip', dmg: 4 } },
    ai: () => 'nip',
  },
  drone: {
    name: 'Scrap Drone', hp: [24, 28], model: 'drone',
    moves: {
      bolt: { name: 'Bolt', dmg: 8 },
      patch: { name: 'Patch Up', dmg: 4, shield: 7 },
    },
    ai: (e, g, rng) => (e.history.length ? alternate(e, 'bolt', 'patch') : rng.pick(['bolt', 'patch'])),
  },
  leech: {
    name: 'Rift Leech', hp: [40, 44], model: 'leech',
    moves: {
      latch: { name: 'Latch', dmg: 11 },
      coil: { name: 'Coil', dmg: 7, shield: 5 },
      swell: { name: 'Swell', shield: 6, buff: { amp: 3 } },
    },
    ai: (e, g, rng) => (e.history.length
      ? choose(rng, e, [['latch', 45], ['coil', 30], ['swell', 25]], { noRepeat: ['swell'], max2: ['latch', 'coil'] })
      : 'latch'),
  },
  wisp: {
    name: 'Static Wisp', hp: [20, 24], model: 'wisp',
    moves: {
      crackle: { name: 'Crackle', dmg: 6 },
      interfere: { name: 'Interference', shield: 3, addCards: [{ id: 'static', n: 2, to: 'discard' }] },
      flicker: { name: 'Flicker', dmg: 3, debuff: { jammed: 1 } },
    },
    ai: (e, g, rng) => choose(rng, e, [['crackle', 45], ['interfere', 30], ['flicker', 25]], { noRepeat: ['interfere', 'flicker'] }),
  },
  crawler: {
    name: 'Cinder Crawler', hp: [34, 38], model: 'crawler',
    moves: {
      bite: { name: 'Scorch Bite', dmg: 7, debuff: { burn: 2 } },
      spit: { name: 'Spit Embers', dmg: 4, addCards: [{ id: 'scorch', n: 1, to: 'discard' }] },
    },
    ai: (e, g, rng) => choose(rng, e, [['bite', 60], ['spit', 40]], { noRepeat: ['spit'], max2: ['bite'] }),
  },

  // act 1 elites
  warden: {
    name: 'Warden Mk.I', hp: [80, 84], model: 'warden', elite: true,
    statuses: { enforcer: 2 },
    moves: {
      power_up: { name: 'Power Up', shield: 10, intent: 'buff' },
      crush: { name: 'Crush', dmg: 14 },
      pin: { name: 'Pin', dmg: 6, debuff: { exposed: 2 } },
    },
    onPlayerCard(g, e, card) {
      if (card.def.type === 'skill') g.applyStatus(e, 'amp', g.status(e, 'enforcer'), e);
    },
    ai: (e, g, rng) => (e.history.length
      ? choose(rng, e, [['crush', 67], ['pin', 33]], { noRepeat: ['pin'], max2: ['crush'] })
      : 'power_up'),
  },
  sentry: {
    name: 'Sentry', hp: [36, 40], model: 'sentry', elite: true,
    moves: {
      beam: { name: 'Beam', dmg: 9 },
      jam: { name: 'Jam Signal', addCards: [{ id: 'static', n: 2, to: 'discard' }] },
    },
    onSpawn(g, e, index) { e.vars.startJam = index % 2 === 1; },
    ai: (e) => (e.history.length ? alternate(e, 'beam', 'jam') : (e.vars.startJam ? 'jam' : 'beam')),
  },
  brood: {
    name: 'Brood Mother', hp: [88, 94], model: 'brood', elite: true,
    onCombatStart(g, e) { g.summon('broodling', e); g.summon('broodling', e); },
    moves: {
      spawn: { name: 'Spawn', summon: { id: 'broodling', n: 1, max: 3 } },
      lash: { name: 'Lash', dmg: 11 },
      screech: { name: 'Screech', buffAll: { amp: 2 } },
    },
    ai: (e, g, rng) => (e.history.length
      ? choose(rng, e, [['spawn', g.minionsOf(e).length < 2 ? 45 : 0], ['lash', 40], ['screech', 20]], { noRepeat: ['spawn', 'screech'] })
      : 'lash'),
  },

  // act 1 boss
  gatekeeper: {
    name: 'The Gatekeeper', hp: [160, 160], model: 'gatekeeper', boss: true,
    moves: {
      seal: { name: 'Seal', shield: 14, buff: { amp: 1 } },
      hammer: { name: 'Hammer', dmg: 14 },
      shatter: { name: 'Shatterwave', dmg: 4, hits: 3, addCards: [{ id: 'scorch', n: 1, to: 'discard' }] },
      charge: { name: 'Charging Rift Slam', shield: 10, intent: 'charge' },
      slam: { name: 'Rift Slam', dmg: 24 },
    },
    ai: (e) => cycle(e, ['seal', 'hammer', 'shatter', 'charge', 'slam']),
  },

  // =================================================================== ACT 2
  hound: {
    name: 'Void Hound', hp: [38, 42], model: 'hound',
    moves: {
      rend: { name: 'Rend', dmg: 5, hits: 2 },
      pounce: { name: 'Pounce', dmg: 11, debuff: { jammed: 1 } },
      howl: { name: 'Howl', shield: 6, buffAll: { amp: 1 } },
    },
    ai: (e, g, rng) => choose(rng, e, [['rend', 45], ['pounce', 35], ['howl', 20]], { noRepeat: ['howl', 'pounce'] }),
  },
  pup: {
    name: 'Hound Pup', hp: [14, 18], model: 'hound', size: 0.6,
    moves: { bite: { name: 'Bite', dmg: 3, hits: 2 } },
    ai: () => 'bite',
  },
  mine: {
    name: 'Tether Mine', hp: [18, 22], model: 'mine',
    statuses: { countdown: 3 },
    moves: {
      tick: {
        name: 'Arming', intent: 'unknown',
        special(g, e) { g.setStatus(e, 'countdown', g.status(e, 'countdown') - 1); },
      },
      detonate: {
        name: 'Detonate', dmg: 26,
        special(g, e) { g.destroy(e, 'detonate'); },
      },
    },
    ai: (e, g) => (g.status(e, 'countdown') <= 1 ? 'detonate' : 'tick'),
  },
  cultist: {
    name: 'Phase Cultist', hp: [50, 56], model: 'cultist',
    moves: {
      incant: { name: 'Incantation', buff: { ascend: 3 } },
      bolt: { name: 'Hex Bolt', dmg: 6 },
    },
    ai: (e) => (e.history.length ? 'bolt' : 'incant'),
  },
  eel: {
    name: 'Siphon Eel', hp: [56, 62], model: 'eel',
    moves: {
      drain: { name: 'Drain', dmg: 9, heal: 6 },
      constrict: { name: 'Constrict', debuff: { jammed: 2, fragile: 2 } },
      lash: { name: 'Tail Lash', dmg: 14 },
    },
    ai: (e, g, rng) => choose(rng, e, [['drain', 40], ['lash', 35], ['constrict', 25]], { noRepeat: ['constrict'], max2: ['drain', 'lash'] }),
  },
  shade: {
    name: 'Mirror Shade', hp: [44, 48], model: 'shade',
    moves: {
      reflect: { name: 'Reflect', shield: 8, buff: { spikes: 2 } },
      strike: { name: 'Glass Strike', dmg: 12 },
    },
    ai: (e, g, rng) => choose(rng, e, [['strike', 65], ['reflect', 35]], { noRepeat: ['reflect'] }),
  },

  // act 2 elites
  knight: {
    name: 'Null Knight', hp: [128, 136], model: 'knight', elite: true,
    moves: {
      phase: { name: 'Phase Strike', dmg: 8, buff: { phased: 1 } },
      cleave: { name: 'Cleave', dmg: 20 },
    },
    ai: (e) => (e.history.length ? alternate(e, 'phase', 'cleave') : 'phase'),
  },
  riftmother: {
    name: 'Riftmother', hp: [130, 136], model: 'mother', elite: true,
    onCombatStart(g, e) { g.summon('pup', e); g.summon('pup', e); },
    moves: {
      call: { name: 'Call the Pack', summon: { id: 'pup', n: 2, max: 4 } },
      crush: { name: 'Crush', dmg: 16 },
      scream: { name: 'Scream', debuff: { jammed: 2, exposed: 1 } },
    },
    ai: (e, g, rng) => (e.history.length
      ? choose(rng, e, [['call', g.minionsOf(e).length < 2 ? 40 : 0], ['crush', 40], ['scream', 20]], { noRepeat: ['call', 'scream'] })
      : 'crush'),
  },
  seraph: {
    name: 'Choir Seraph', hp: [66, 70], model: 'seraph', elite: true,
    moves: {
      hymn: { name: 'Hymn', shieldAll: 10, buffAll: { amp: 1 } },
      smite: { name: 'Smite', dmg: 12 },
    },
    onSpawn(g, e, index) { e.vars.startHymn = index % 2 === 1; },
    ai: (e) => (e.history.length ? alternate(e, 'smite', 'hymn') : (e.vars.startHymn ? 'hymn' : 'smite')),
  },

  // act 2 boss
  leviathan: {
    name: 'The Undertow', hp: [230, 230], model: 'leviathan', boss: true,
    statuses: { overload_core: 2 },
    moves: {
      undertow: { name: 'Undertow', shield: 10, addCards: [{ id: 'static', n: 2, to: 'draw' }] },
      crush: { name: 'Pressure Crush', dmg: 22 },
      whirlpool: { name: 'Whirlpool', dmg: 6, hits: 3, debuff: { jammed: 2 } },
      tidal: { name: 'Tidal Surge', shield: 16, buff: { amp: 1 } },
    },
    onHit(g, e) {
      if (!e.vars.frenzy && e.hp > 0 && e.hp < e.maxHp / 2) {
        e.vars.frenzy = true;
        const n = g.status(e, 'overload_core');
        g.setStatus(e, 'overload_core', 0);
        g.applyStatus(e, 'amp', n, e);
      }
    },
    ai: (e) => cycle(e, ['undertow', 'crush', 'whirlpool', 'tidal']),
  },

  // =================================================================== ACT 3
  sentinel: {
    name: 'Core Sentinel', hp: [66, 72], model: 'sentinel',
    moves: {
      laser: { name: 'Laser', dmg: 16 },
      bulwark: { name: 'Bulwark Protocol', shieldAll: 12 },
      overheat: { name: 'Overheat', dmg: 8, addCards: [{ id: 'scorch', n: 2, to: 'discard' }] },
    },
    ai: (e, g, rng) => choose(rng, e,
      [['laser', 45], ['bulwark', g.aliveEnemies().length > 1 ? 30 : 10], ['overheat', 25]],
      { noRepeat: ['bulwark', 'overheat'] }),
  },
  mite: {
    name: 'Entropy Mite', hp: [15, 19], model: 'mite',
    moves: {
      bite: { name: 'Bite', dmg: 5, debuff: { burn: 1 } },
      gnaw: { name: 'Gnaw', dmg: 3, hits: 2 },
    },
    ai: (e, g, rng) => choose(rng, e, [['bite', 50], ['gnaw', 50]], { max2: ['bite', 'gnaw'] }),
  },
  hulk: {
    name: 'Spire Hulk', hp: [100, 108], model: 'hulk',
    moves: {
      stomp: { name: 'Stomp', dmg: 10, debuff: { exposed: 1 } },
      windup: { name: 'Wind Up', shield: 14, buff: { amp: 3 } },
      demolish: { name: 'Demolish', dmg: 30 },
    },
    ai: (e) => cycle(e, ['stomp', 'windup', 'demolish']),
  },
  nullseraph: {
    name: 'Null Seraph', hp: [72, 78], model: 'seraph', tint: '#ff4f6e',
    moves: {
      judgment: { name: 'Judgment', dmg: 9, hits: 2 },
      silence: { name: 'Silence', debuff: { jammed: 2, exposed: 2 } },
      radiance: { name: 'Radiance', shield: 14, buff: { regen: 5 } },
    },
    ai: (e, g, rng) => choose(rng, e, [['judgment', 50], ['silence', 25], ['radiance', 25]], { noRepeat: ['silence', 'radiance'] }),
  },
  weaver: {
    name: 'Void Weaver', hp: [60, 66], model: 'weaver',
    moves: {
      entangle: { name: 'Entangle', debuff: { fragile: 2 }, addCards: [{ id: 'static', n: 2, to: 'draw' }] },
      needle: { name: 'Needle Storm', dmg: 6, hits: 3 },
    },
    ai: (e, g, rng) => choose(rng, e, [['needle', 60], ['entangle', 40]], { noRepeat: ['entangle'] }),
  },

  // act 3 elites
  sovereign: {
    name: 'Void Sovereign', hp: [220, 230], model: 'sovereign', elite: true,
    moves: {
      tax: { name: 'Tithe', dmg: 10, hits: 2, shield: 12 },
      decree: { name: 'Decree', debuff: { exposed: 2, jammed: 2 } },
      execute: { name: 'Execute', dmg: 32 },
      coronation: { name: 'Coronation', buff: { amp: 3 } },
    },
    ai: (e) => cycle(e, ['tax', 'decree', 'execute', 'coronation']),
  },
  archon: {
    name: 'Archon', hp: [104, 110], model: 'archon', elite: true,
    statuses: { resonance: 4 },
    moves: {
      strike: { name: 'Strike', dmg: 13 },
      ward: { name: 'Ward', shieldAll: 14 },
      brand: { name: 'Brand', dmg: 7, debuff: { burn: 3 } },
    },
    onSpawn(g, e, index) { e.vars.offset = index % 2; },
    onAllyDeath(g, e) {
      g.applyStatus(e, 'amp', g.status(e, 'resonance'), e);
      g.heal(e, Math.floor(e.maxHp * 0.25));
    },
    ai: (e, g, rng) => (e.history.length
      ? choose(rng, e, [['strike', 45], ['ward', 25], ['brand', 30]], { noRepeat: ['ward', 'brand'] })
      : (e.vars.offset ? 'brand' : 'strike')),
  },
  colossus: {
    name: 'Rift Colossus', hp: [250, 260], model: 'colossus', elite: true,
    moves: {
      slam: { name: 'Slam', dmg: 15 },
      guard: { name: 'Guard', shield: 30 },
      charge: { name: 'Charging', intent: 'charge' },
      annihilate: { name: 'Annihilate', dmg: 42 },
    },
    ai: (e) => cycle(e, ['slam', 'guard', 'charge', 'annihilate']),
  },

  // final boss
  heart: {
    name: 'Heart of the Rift', hp: [400, 400], model: 'heart', boss: true,
    statuses: { rift_barrier: 120 },
    moves: {
      awaken: {
        name: 'Awaken', debuff: { jammed: 2, fragile: 2 },
        addCards: [{ id: 'static', n: 1, to: 'draw' }, { id: 'scorch', n: 1, to: 'draw' }],
      },
      lance: { name: 'Rift Lance', dmg: 30 },
      barrage: { name: 'Echo Barrage', dmg: 2, hits: 8 },
      reconfigure: { name: 'Reconfigure', shield: 25, buff: { amp: 2 } },
      echo: { name: 'Resonant Echo', dmg: 10, hits: 2, addCards: [{ id: 'scorch', n: 1, to: 'discard' }] },
    },
    ai: (e) => (e.history.length ? cycle(e, ['lance', 'barrage', 'reconfigure', 'echo']) : 'awaken'),
  },
};

export const ENCOUNTERS = {
  1: {
    easy: [['leech'], ['drone'], ['shardling', 'shardling'], ['crawler']],
    normal: [
      ['shardling', 'shardling', 'shardling'], ['drone', 'wisp'], ['shardling', 'leech'],
      ['crawler', 'shardling'], ['wisp', 'wisp'], ['drone', 'drone'], ['wisp', 'crawler'],
    ],
    elite: [['warden'], ['sentry', 'sentry', 'sentry'], ['brood']],
    boss: [['gatekeeper']],
  },
  2: {
    easy: [['hound'], ['cultist'], ['eel'], ['shade']],
    normal: [
      ['hound', 'hound'], ['mine', 'cultist'], ['eel', 'mine'], ['hound', 'shade'],
      ['mine', 'hound', 'mine'], ['shade', 'cultist'], ['cultist', 'cultist'],
    ],
    elite: [['knight'], ['riftmother'], ['seraph', 'seraph']],
    boss: [['leviathan']],
  },
  3: {
    easy: [['sentinel'], ['hulk'], ['nullseraph'], ['mite', 'mite', 'mite']],
    normal: [
      ['mite', 'sentinel', 'mite'], ['hulk', 'mite'], ['nullseraph', 'weaver'], ['weaver', 'sentinel'],
      ['mite', 'mite', 'mite', 'mite'], ['nullseraph', 'sentinel'], ['weaver', 'weaver'],
    ],
    elite: [['sovereign'], ['archon', 'archon'], ['colossus']],
    boss: [['heart']],
  },
};

export const ACT_NAMES = { 1: 'The Fracture', 2: 'The Undertow', 3: 'The Core' };
