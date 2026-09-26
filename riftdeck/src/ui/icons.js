// Inline SVG icon set (24x24, stroke-based, colored via currentColor).

const svg = (body, sw = 2) =>
  `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

const soft = 'fill="currentColor" fill-opacity=".22"';

const P = {
  attack: `<path d="M15.5 3H21v5.5L10.5 19 5 13.5z" fill="currentColor" stroke="none"/><path d="M4.5 12.5l7 7M7.5 16.5L3 21"/>`,
  defend: `<path d="M12 2.5l8 3.3v6.1c0 4.8-3.4 8.3-8 10.1-4.6-1.8-8-5.3-8-10.1V5.8z" ${soft}/>`,
  buff: `<path d="M12 3l7 8h-4v9H9v-9H5z" ${soft}/>`,
  debuff: `<path d="M12 21l-7-8h4V4h6v9h4z" ${soft}/>`,
  summon: `<circle cx="12" cy="12" r="8.5" ${soft}/><path d="M12 8v8M8 12h8"/>`,
  unknown: `<circle cx="12" cy="12" r="9" ${soft}/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7M12 17h.01"/>`,
  charge: `<path d="M13 2L4 14h7l-1 8 10-13h-7z" ${soft}/>`,
  heart: `<path d="M12 20.5C5.5 15.5 3 12 3 8.5A4.5 4.5 0 0 1 12 6.4a4.5 4.5 0 0 1 9 2.1c0 3.5-2.5 7-9 12z" ${soft}/>`,
  shard: `<path d="M12 2l7 7-7 13L5 9z" ${soft}/><path d="M5 9h14M9.5 9L12 22l2.5-13"/>`,
  energy: `<path d="M13 2L4 14h7l-1 8 10-13h-7z" fill="currentColor" stroke="none"/>`,
  deck: `<rect x="7" y="3" width="12" height="16" rx="1.5" ${soft}/><path d="M4.5 7v12.5A1.5 1.5 0 0 0 6 21h10"/>`,
  draw: `<rect x="4" y="4" width="11" height="16" rx="1.5" ${soft}/><path d="M19 7v13"/>`,
  discard: `<rect x="9" y="4" width="11" height="16" rx="1.5" ${soft}/><path d="M5 7v13"/>`,
  faded: `<rect x="6.5" y="4" width="11" height="16" rx="1.5" stroke-dasharray="3 2.5"/>`,
  menu: `<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>`,
  close: `<path d="M6 6l12 12M18 6L6 18"/>`,
  check: `<path d="M4 12.5l5 5L20 6.5"/>`,
  arrow: `<path d="M5 12h14M13 6l6 6-6 6"/>`,
  // map nodes
  combat: `<path d="M5 4l14 14M19 4L5 18"/><path d="M4 15l5 5M15 20l5-5"/>`,
  elite: `<path d="M4 3l4 6M20 3l-4 6"/><path d="M6.5 9h11l1.3 6.2L15.5 19h-7l-3.3-3.8z" ${soft}/><path d="M10 13.5h.01M14 13.5h.01"/>`,
  rest: `<path d="M12 21.5c4 0 7-2.5 7-6.5 0-3-2-5-3.5-6.5.2 2-1 3.5-2.5 4 .5-3-1.5-6.5-4-9 0 4-4 6.5-4 11.5 0 4 3 6.5 7 6.5z" ${soft}/>`,
  shop: `<path d="M5 8h14l-1.2 13H6.2z" ${soft}/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/>`,
  event: `<path d="M8.5 8.5a3.5 3.5 0 1 1 4.9 3.2c-.9.4-1.4 1.2-1.4 2.1V15"/><path d="M12 19h.01"/>`,
  treasure: `<rect x="3" y="9" width="18" height="11" rx="1.5" ${soft}/><path d="M3 9l2.5-4.5h13L21 9M12 12v3.5"/>`,
  boss: `<path d="M12 2l3 6.3 6.8.9-5 4.6 1.3 6.7L12 17.2l-6.1 3.3 1.3-6.7-5-4.6 6.8-.9z" ${soft}/>`,
  // statuses
  amp: `<path d="M6 13l6-6 6 6M6 19l6-6 6 6"/>`,
  plating: `<path d="M4 7l8-4 8 4-8 4z" ${soft}/><path d="M4 12l8 4 8-4M4 17l8 4 8-4"/>`,
  exposed: `<circle cx="12" cy="12" r="6.5"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/>`,
  jammed: `<path d="M2 12h4l2.5-6 4 12 2.5-6h7"/>`,
  fragile: `<path d="M12 2l8.5 4.8v10.4L12 22l-8.5-4.8V6.8z"/><path d="M12 6l-2 5 4 2-2 5"/>`,
  phased: `<circle cx="12" cy="12" r="8.5" stroke-dasharray="3 3"/><circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none"/>`,
  spikes: `<path d="M12 2v6M12 16v6M2 12h6M16 12h6M5 5l4 4M15 15l4 4M19 5l-4 4M9 15l-4 4"/>`,
  regen: `<path d="M12 4.5v15M4.5 12h15"/>`,
  ascend: `<path d="M12 21V4M6 10l6-6 6 6M6 21h12"/>`,
  bulwark: `<path d="M4 21V9h3V5.5h3V9h4V5.5h3V9h3v12z" ${soft}/>`,
  reactor: `<circle cx="12" cy="12" r="2" fill="currentColor"/><ellipse cx="12" cy="12" rx="9.5" ry="3.8"/><ellipse cx="12" cy="12" rx="9.5" ry="3.8" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="9.5" ry="3.8" transform="rotate(120 12 12)"/>`,
  hex: `<path d="M12 2.5l8.2 4.75v9.5L12 21.5l-8.2-4.75v-9.5z" ${soft}/>`,
  ignition: `<circle cx="12" cy="12" r="9.5" stroke-dasharray="2 2.5"/><path d="M12 18c2.3 0 4-1.4 4-3.7 0-1.7-1.1-2.8-2-3.7 0 1.2-.6 2-1.4 2.3.3-1.7-.9-3.7-2.3-5.1 0 2.3-2.3 3.7-2.3 6.5 0 2.3 1.7 3.7 4 3.7z" ${soft}/>`,
  ghost: `<path d="M6 21V10a6 6 0 0 1 12 0v11l-2-2-2 2-2-2-2 2-2-2z" ${soft}/><path d="M10 11h.01M14 11h.01"/>`,
  gauge: `<path d="M3.5 17a8.5 8.5 0 1 1 17 0"/><path d="M12 17l4.5-6"/>`,
  echo: `<circle cx="9" cy="12" r="5.5"/><circle cx="15" cy="12" r="5.5" ${soft}/>`,
  uplink: `<path d="M12 21v-9M8.2 8a5.4 5.4 0 0 1 7.6 0M5.2 5a9.6 9.6 0 0 1 13.6 0"/><circle cx="12" cy="11" r="1.2" fill="currentColor"/>`,
  shellbolt: `<path d="M12 2.5l8.2 4.75v9.5L12 21.5l-8.2-4.75v-9.5z"/><path d="M13 6l-4 7h3l-1 5 4-7h-3z" fill="currentColor" stroke="none"/>`,
  warning: `<path d="M12 3l10 18H2z" ${soft}/><path d="M12 10v5M12 18h.01"/>`,
  clock: `<circle cx="12" cy="13" r="8" ${soft}/><path d="M12 9v4l3 2M9 2h6"/>`,
  dot: `<circle cx="12" cy="12" r="4" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="8.5" stroke-dasharray="2 3"/>`,
  waves: `<path d="M2 9c2.5-4 5-4 7.5 0s5 4 7.5 0 3.5-3 5-1M2 16c2.5-4 5-4 7.5 0s5 4 7.5 0 3.5-3 5-1"/>`,
  core: `<circle cx="12" cy="12" r="4" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="9"/>`,
  wall: `<path d="M3 5h18v14H3zM3 12h18M9 5v7M15 12v7"/>`,
  // relic-only glyphs
  anchor: `<circle cx="12" cy="5" r="2.5"/><path d="M12 7.5V21M5 13a7 7 0 0 0 14 0M8 11h8"/>`,
  magnet: `<path d="M6 3v9a6 6 0 0 0 12 0V3h-4v9a2 2 0 0 1-4 0V3z" ${soft}/><path d="M6 7h4M14 7h4"/>`,
  cycle: `<path d="M20 11A8 8 0 0 0 6 6.3L4 8.5M4 13a8 8 0 0 0 14 4.7l2-2.2"/><path d="M4 4v4.5h4.5M20 20v-4.5h-4.5"/>`,
  crown: `<path d="M3 18l1.5-11 5 5L12 5l2.5 7 5-5L21 18z" ${soft}/><path d="M3 21h18"/>`,
  eye: `<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" ${soft}/><circle cx="12" cy="12" r="3"/>`,
  cell: `<rect x="7.5" y="4" width="9" height="17" rx="2" ${soft}/><path d="M10 2h4M7.5 12.5h9"/>`,
  flame: `<path d="M12 21.5c4 0 7-2.5 7-6.5 0-3-2-5-3.5-6.5.2 2-1 3.5-2.5 4 .5-3-1.5-6.5-4-9 0 4-4 6.5-4 11.5 0 4 3 6.5 7 6.5z" ${soft}/>`,
  sound: `<path d="M4 9.5h4l5-4.5v14l-5-4.5H4z" ${soft}/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>`,
  mute: `<path d="M4 9.5h4l5-4.5v14l-5-4.5H4z" ${soft}/><path d="M17 9.5l5 5M22 9.5l-5 5"/>`,
  play: `<path d="M7 4.5v15l12-7.5z" ${soft}/>`,
  flag: `<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>`,
};

export function icon(name, cls = '') {
  const body = P[name] || P.unknown;
  return `<span class="ico ${cls}">${svg(body)}</span>`;
}

// status id -> [icon, color]
export const STATUS_ICON = {
  amp: ['amp', '#ff8a5c'],
  plating: ['plating', '#7cc4ff'],
  exposed: ['exposed', '#ff5b6b'],
  jammed: ['jammed', '#c38bff'],
  fragile: ['fragile', '#ff9f5b'],
  burn: ['flame', '#ff7a2f'],
  phased: ['phased', '#bfe8ff'],
  spikes: ['spikes', '#ffd166'],
  regen: ['regen', '#5be39b'],
  ascend: ['ascend', '#ff8a5c'],
  surge: ['charge', '#ffb35c'],
  bulwark: ['bulwark', '#7cc4ff'],
  charge: ['charge', '#ffe066'],
  reactor: ['reactor', '#ffe066'],
  hardlight: ['hex', '#7cc4ff'],
  ignition: ['ignition', '#ff7a2f'],
  ghost: ['ghost', '#9fe3ff'],
  overdrive: ['gauge', '#ffc84a'],
  echo: ['echo', '#b98cff'],
  uplink: ['uplink', '#36c9f0'],
  static_shell: ['shellbolt', '#ffe066'],
  enforcer: ['warning', '#ff5b6b'],
  countdown: ['clock', '#ff5b6b'],
  minion: ['dot', '#a4adc8'],
  resonance: ['waves', '#b98cff'],
  overload_core: ['core', '#ff8a5c'],
  rift_barrier: ['wall', '#8ef3e0'],
};

export const INTENT_COLOR = {
  attack: '#ff5b4a',
  defend: '#7cc4ff',
  buff: '#5be39b',
  debuff: '#c38bff',
  summon: '#ffc84a',
  unknown: '#a4adc8',
  charge: '#ffc84a',
};

export const NODE_COLOR = {
  combat: '#c9d0e6',
  elite: '#ff5b6b',
  rest: '#ff9f43',
  shop: '#8ef3e0',
  event: '#b98cff',
  treasure: '#ffc84a',
  boss: '#ff4f6e',
};

export const NODE_LABEL = {
  combat: 'Combat',
  elite: 'Elite',
  rest: 'Rest site',
  shop: 'Shop',
  event: 'Unknown',
  treasure: 'Treasure',
  boss: 'Boss',
};

export const RELIC_ICON = {
  rift_anchor: 'anchor', spare_cell: 'cell', kinetic_plate: 'defend', focus_lens: 'exposed',
  gyro_plating: 'plating', nano_mesh: 'heart', data_shard: 'deck', pocket_capacitor: 'charge',
  scrap_magnet: 'magnet', ember_core: 'flame', tally_counter: 'clock', shock_coil: 'jammed',
  hardlight_buckle: 'hex', failsafe: 'regen', field_kit: 'rest', recycler: 'cycle',
  target_array: 'exposed', wide_band: 'uplink', void_battery: 'cell', phoenix_sigil: 'flame',
  mirror_core: 'echo', arc_coil: 'spikes', ghost_mantle: 'ghost', membership_chip: 'shard',
  cell_rack: 'cell', rift_engine: 'gauge', hollow_crown: 'crown', static_heart: 'heart',
  wide_lens: 'eye', void_lure: 'elite',
};

export const RARITY_COLOR = {
  starter: '#a4adc8', common: '#a4adc8', uncommon: '#4fb8ff', rare: '#ffc84a',
  shop: '#8ef3e0', boss: '#ff4f6e', special: '#7d8799',
};

export const CELL_COLOR = {
  blast_cell: '#ff6a3d', shield_cell: '#7cc4ff', energy_cell: '#ffc84a', data_cell: '#36c9f0',
  fire_cell: '#ff7a2f', amp_cell: '#ff8a5c', jammer_cell: '#c38bff', expose_cell: '#ff5b6b',
  repair_cell: '#5be39b', charge_cell: '#ffe066', phase_cell: '#bfe8ff',
};
