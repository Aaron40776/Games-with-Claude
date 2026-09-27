// Narrative events ("?" rooms). Each option lists declarative effects that
// run.js interprets:
//   { hp: -n }  { heal: n }  { healPct: 0.33 }  { maxHp: n }  { shards: n }
//   { relic: 'common'|'uncommon'|'rare'|'random' }   { curse: id }
//   { randomCard: rarity }   { cardChoice: rarity, n }
//   { deck: 'remove'|'upgrade'|'duplicate', n }       { randomUpgrade: n }
//   { cells: n }   { fight: [enemyIds], kind }
// `roll` picks one weighted outcome instead of fixed effects.
// Options without `next` end the event and show `result`.

import { canUpgrade } from './cards.js';

const leave = { label: 'Leave', detail: 'Move on.', result: 'You leave it behind.' };

export const EVENTS = {
  rift_gate: {
    name: 'The Rift Gate', opening: true,
    text: 'The gate folds shut behind you. In the static between layers, something old offers you a gift for the descent.',
    options: (run, rng) => {
      const pool = [
        { label: 'Purge', detail: 'Remove a card from your deck.', effects: [{ deck: 'remove', n: 1 }], result: 'A weight lifts from your deck.' },
        { label: 'Salvage', detail: 'Obtain a random common relic.', effects: [{ relic: 'common' }], result: 'Something rattles loose from the gate.' },
        { label: 'Knowledge', detail: 'Choose 1 of 3 uncommon cards.', effects: [{ cardChoice: 'uncommon', n: 3 }], result: 'New patterns settle into your mind.' },
        { label: 'Wealth', detail: 'Gain 100 Shards.', effects: [{ shards: 100 }], result: 'Shards rain from the seam.' },
        { label: 'Tune', detail: 'Upgrade 2 random cards.', effects: [{ randomUpgrade: 2 }], result: 'Your gear hums at a higher pitch.' },
      ];
      rng.shuffle(pool);
      return [
        { label: 'Fortify', detail: 'Raise your Max HP by 8.', effects: [{ maxHp: 8 }], result: 'Your frame hardens against the rift.' },
        pool[0], pool[1],
      ];
    },
  },

  echo_cache: {
    name: 'Echo Cache', acts: [1, 2],
    text: 'A sealed cache pulses with stolen memories. Its lock is barbed, and it bites anyone who touches it.',
    options: [
      { label: 'Pry it open', detail: 'Lose 8 HP. Obtain a random relic.', effects: [{ hp: -8 }, { relic: 'random' }], result: 'The lock tears your glove, but the cache gives up its prize.' },
      leave,
    ],
  },
  broken_terminal: {
    name: 'Broken Terminal', acts: [1, 2, 3],
    text: 'A terminal flickers in the dark, still connected to your gear. It offers two maintenance routines before its power fails.',
    options: [
      { label: 'Recompile', detail: 'Upgrade 2 random cards.', effects: [{ randomUpgrade: 2 }], result: 'Progress bars crawl to 100%. Your cards feel sharper.' },
      { label: 'Purge', detail: 'Lose 6 HP. Remove a card from your deck.', effects: [{ hp: -6 }, { deck: 'remove', n: 1 }], result: 'The terminal sparks as it deletes the file.' },
      leave,
    ],
  },
  drifting_courier: {
    name: 'Drifting Courier', acts: [1, 2],
    text: 'A courier drone tumbles through the void, its cargo net stuffed with Cells. It chirps a price at you.',
    options: [
      { label: 'Buy', detail: 'Pay 45 Shards. Gain 2 random Cells.', req: (run) => run.shards >= 45 && run.cells.filter((c) => c === null).length >= 2, reqText: 'Requires 45 Shards and 2 free Cell slots.', effects: [{ shards: -45 }, { cells: 2 }], result: 'The drone chirps happily and floats away.' },
      { label: 'Rob', detail: 'Gain 70 Shards. Become cursed: Rift Scar.', effects: [{ shards: 70 }, { curse: 'rift_scar' }], result: 'You crack the drone open. Its dying pulse leaves a scar.' },
      leave,
    ],
  },
  rift_pool: {
    name: 'Rift Pool', acts: [1, 2, 3],
    text: 'A pool of liquid light sits perfectly still, reflecting a sky that is not there.',
    options: [
      { label: 'Drink', detail: 'Heal 33% of your Max HP.', effects: [{ healPct: 0.33 }], result: 'Warmth spreads through you.' },
      { label: 'Immerse', detail: 'Raise your Max HP by 5.', effects: [{ maxHp: 5 }], result: 'You come out of the pool a little more solid.' },
    ],
  },
  mirror_hall: {
    name: 'Mirror Hall', acts: [2, 3],
    text: 'Endless mirrors show endless versions of you, each holding a slightly different hand of cards.',
    options: [
      { label: 'Reflect', detail: 'Duplicate a card in your deck.', effects: [{ deck: 'duplicate', n: 1 }], result: 'One of your reflections hands you a card.' },
      { label: 'Shatter', detail: 'Gain 60 Shards. Lose 8 HP.', effects: [{ shards: 60 }, { hp: -8 }], result: 'Glass everywhere. Some of it is valuable.' },
      leave,
    ],
  },
  ghost_signal: {
    name: 'Ghost Signal', acts: [1, 2],
    text: 'A distress beacon repeats a name you almost recognize. The source is close, and something else is listening too.',
    options: [
      {
        label: 'Trace the signal', detail: '50%: Obtain a random rare card. 50%: Ambush.',
        roll: [
          { w: 50, effects: [{ randomCard: 'rare' }], result: 'You find a fallen runner\'s gear, still humming.' },
          { w: 50, effects: [{ fight: ['wisp', 'wisp'], kind: 'normal' }], result: 'It was bait.' },
        ],
      },
      { label: 'Ignore it', detail: 'Move on.', result: 'The signal fades behind you.' },
    ],
  },
  scrap_heap: {
    name: 'Scrap Heap', acts: [1],
    text: 'A mountain of broken drones and shattered plating. Most of it is junk. Most.',
    options: [
      { label: 'Dig', detail: 'Lose 5 HP. Obtain a random common relic.', effects: [{ hp: -5 }, { relic: 'common' }], result: 'Your hands are cut, but you pull something useful from the heap.' },
      { label: 'Salvage', detail: 'Gain 35 Shards.', effects: [{ shards: 35 }], result: 'You strip the easy parts and sell them to no one in particular.' },
      leave,
    ],
  },
  fractured_shrine: {
    name: 'Fractured Shrine', acts: [2, 3],
    text: 'A shrine to a runner who never came back. The offering bowl is empty. The relic on the altar is not.',
    options: [
      { label: 'Pray', detail: 'Pay 50 Shards. Remove a card from your deck.', req: (run) => run.shards >= 50, reqText: 'Requires 50 Shards.', effects: [{ shards: -50 }, { deck: 'remove', n: 1 }], result: 'You feel lighter.' },
      { label: 'Desecrate', detail: 'Obtain a random uncommon relic. Become cursed: Rift Scar.', effects: [{ relic: 'uncommon' }, { curse: 'rift_scar' }], result: 'The shrine goes dark. Something follows you out.' },
      leave,
    ],
  },
  fallen_runner: {
    name: 'Fallen Runner', acts: [1, 2, 3],
    text: 'A runner\'s suit drifts past, empty. The pack on its back is still sealed.',
    options: [
      { label: 'Search the pack', detail: 'Choose 1 of 3 uncommon cards.', effects: [{ cardChoice: 'uncommon', n: 3 }], result: 'Their tactics become yours.' },
      { label: 'Take the cells', detail: 'Gain 1 random Cell.', req: (run) => run.cells.includes(null), reqText: 'Requires a free Cell slot.', effects: [{ cells: 1 }], result: 'You pocket what is left of their supplies.' },
      { label: 'Pay respects', detail: 'Heal 10 HP.', effects: [{ heal: 10 }], result: 'You take a moment. It helps.' },
    ],
  },
  overclock_station: {
    name: 'Overclock Station', acts: [2, 3],
    text: 'An abandoned tuning rig. The safety limiters have been ripped out.',
    options: [
      { label: 'Overclock', detail: 'Lose 7 Max HP. Obtain a random rare card.', effects: [{ maxHp: -7 }, { randomCard: 'rare' }], result: 'The rig screams. Something powerful is burned into your deck.' },
      { label: 'Calibrate', detail: 'Upgrade a card.', req: (run) => run.deck.some((c) => canUpgrade(c.id, c.up)), reqText: 'Every card is already upgraded.', effects: [{ deck: 'upgrade', n: 1 }], result: 'Clean, precise, safe.' },
      leave,
    ],
  },
  void_gamble: {
    name: 'Void Gamble', acts: [2, 3],
    text: 'A masked figure shuffles shards between three cups. "Double or nothing, runner?"',
    options: [
      {
        label: 'Bet 50 Shards', detail: '50%: Win 75 Shards. 50%: Lose your 50 Shards.',
        req: (run) => run.shards >= 50, reqText: 'Requires 50 Shards.',
        roll: [
          { w: 50, effects: [{ shards: 75 }], result: 'The cup lifts. Shards everywhere. The figure bows.' },
          { w: 50, effects: [{ shards: -50 }], result: 'Empty cup. The figure laughs and vanishes.' },
        ],
      },
      leave,
    ],
  },
};
