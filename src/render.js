// Canvas drawing for the 16px world. All tiles and sprites are original and generated here.
import { MAPS, DOORS } from './world.js';
import { objectsOn, tileAt, isDone } from './engine.js';

export const TILE = 16;
const VIEW_W = 20, VIEW_H = 15;
const BASE = {
  pine: '#173c37', pineLight: '#23574c', olive: '#527749', oliveLight: '#6b9159', reed: '#a0b867', reedDark: '#7c9a50',
  mint: '#e2edb2', gold: '#e9ba58', goldDark: '#b4842c', plum: '#695475', plumDark: '#4a3a55', plumLight: '#8a7396',
  ink: '#10231f', parchment: '#d8c98f', parchmentDark: '#b09f68', water: '#3a7d86', waterLight: '#63a7a6', stone: '#7d8778', stoneDark: '#5b6459', wood: '#8a6236', woodDark: '#624423',
  cave: '#2b2a33', caveLight: '#3a3845',
};
// Each biome swaps colors, and picks what the map's border and encounter ground are made of.
const BIOMES = {
  grove: { colors: {}, border: 'pine' },
  springs: { colors: { olive: '#4f8a6e', oliveLight: '#6fae8c', pine: '#1d5a57', pineLight: '#2b7a72', water: '#2f8fb0', waterLight: '#7fd0dc', parchment: '#cfd8b8', parchmentDark: '#a5b593', reed: '#8fd0a8', reedDark: '#5a9f7a', gold: '#e6f2a2', cave: '#20363d', caveLight: '#2f4a52' }, border: 'pine' },
  market: { colors: { olive: '#a79468', oliveLight: '#b9a97f', parchment: '#d9c39a', parchmentDark: '#b89f75', stone: '#b08968', stoneDark: '#8a6650', reed: '#c2b45c', reedDark: '#8f8a3e', plum: '#a4503a', plumDark: '#7a3627', plumLight: '#c47056', cave: '#3a2f27', caveLight: '#4b3d33' }, border: 'wall' },
  gorge: { colors: { olive: '#a5784f', oliveLight: '#bb8e62', stone: '#9b6a4a', stoneDark: '#71482f', water: '#2c5c73', waterLight: '#5a93a6', parchment: '#d3b48a', parchmentDark: '#b3926a', reed: '#c3a35a', reedDark: '#94773c', gold: '#f0c060', cave: '#33241d', caveLight: '#463225' }, border: 'rock' },
  foundry: { colors: { olive: '#57504d', oliveLight: '#6a625e', stone: '#7a4a3a', stoneDark: '#552f24', water: '#d9601f', waterLight: '#f7b23b', parchment: '#8f8378', parchmentDark: '#736960', reed: '#c98b3a', reedDark: '#8f5f28', mint: '#efd9b0', plum: '#4e4a58', plumDark: '#34313d', plumLight: '#6a6677', cave: '#241d1c', caveLight: '#352b29' }, border: 'wall' },
  observatory: { colors: { olive: '#2b3158', oliveLight: '#3d4478', pine: '#10163a', pineLight: '#222a5c', parchment: '#8d8fb8', parchmentDark: '#6f7199', reed: '#7a87d6', reedDark: '#505ba6', gold: '#fde88c', stone: '#5b5f8c', stoneDark: '#3f4268', plum: '#3a3570', plumDark: '#26234f', plumLight: '#5c56a0', mint: '#d6dcff', cave: '#141632', caveLight: '#222548' }, border: 'pine' },
  highlands: { colors: { olive: '#b9cfd8', oliveLight: '#dbe9ee', pine: '#3f6470', pineLight: '#5f8894', parchment: '#8fa6ad', parchmentDark: '#778d94', reed: '#7c8a55', reedDark: '#566138', stone: '#7f8f98', stoneDark: '#5a6971', water: '#a7dcea', waterLight: '#e6f8fc', cave: '#1f3038', caveLight: '#30454e' }, border: 'pine' },
  ruins: { colors: { olive: '#d3b06c', oliveLight: '#e1c489', parchment: '#c49a5c', parchmentDark: '#a47f47', stone: '#b89e72', stoneDark: '#8f7853', reed: '#a89a48', reedDark: '#7a6f30', plum: '#8a5b3c', plumDark: '#633f28', plumLight: '#a97a58', cave: '#3a2c1c', caveLight: '#4d3b27' }, border: 'wall' },
  archive: { colors: { wood: '#6d4e78', woodDark: '#4d3658', parchment: '#f2e3b3', gold: '#ffd76a' }, border: 'pine' },
  garden: { colors: { olive: '#4f9650', oliveLight: '#78c06a', pine: '#2a6a3a', pineLight: '#3c8a4c', reed: '#e7a8c8', reedDark: '#b86d96', gold: '#ffe27a', mint: '#fdf3d0', parchment: '#e8d9a8', parchmentDark: '#c7b684' }, border: 'pine' },
};
const paletteFor = biome => ({ ...BASE, ...BIOMES[biome]?.colors });
let C = BASE;

function noise(x, y, salt = 0) {
  const v = Math.sin(x * 127.1 + y * 311.7 + salt * 74.7) * 43758.5453;
  return v - Math.floor(v);
}

const rect = (g, color, x, y, w = 1, h = 1) => { g.fillStyle = color; g.fillRect(x, y, w, h); };

function ground(g, wx, wy) {
  rect(g, C.olive, 0, 0, 16, 16);
  for (let i = 0; i < 7; i++) rect(g, C.oliveLight, Math.floor(noise(wx, wy, i) * 16), Math.floor(noise(wy, wx, i + 9) * 16));
}

function path(g, wx, wy) {
  rect(g, C.parchment, 0, 0, 16, 16);
  for (let i = 0; i < 8; i++) rect(g, C.parchmentDark, Math.floor(noise(wx, wy, i) * 16), Math.floor(noise(wy, wx, i + 5) * 16));
}

function pine(g, wx, wy) {
  ground(g, wx, wy);
  rect(g, C.woodDark, 7, 13, 2, 3);
  for (let row = 0; row < 13; row++) {
    const half = 2 + Math.floor((row % 5) * 0.9) + Math.floor(row / 3);
    rect(g, C.pine, 8 - half, row + 1, half * 2, 1);
    rect(g, C.pineLight, 8 - half + 1, row + 1, Math.max(1, half - 2), 1);
  }
}

function leaningPine(g, wx, wy) {
  ground(g, wx, wy);
  rect(g, C.woodDark, 6, 13, 2, 3);
  for (let row = 0; row < 13; row++) {
    const half = 2 + Math.floor((row % 5) * 0.9) + Math.floor(row / 3);
    const lean = Math.floor((12 - row) / 3);
    rect(g, C.pine, 7 - half + lean, row + 1, half * 2, 1);
    rect(g, C.pineLight, 7 - half + lean + 1, row + 1, Math.max(1, half - 2), 1);
  }
}

function olive(g, wx, wy) {
  ground(g, wx, wy);
  rect(g, C.woodDark, 6, 11, 4, 5);
  rect(g, C.wood, 7, 11, 1, 4);
  // A low, wide canopy with a silver-green cast, unlike the upright pines.
  [[5, 6], [3, 10], [1, 14], [0, 16], [0, 16], [0, 16], [1, 14], [1, 14], [3, 10], [5, 6]].forEach(([x, width], row) => {
    rect(g, C.olive, x, row + 1, width, 1);
    rect(g, C.reedDark, x + 1, row + 1, Math.max(0, width - 2), 1);
  });
  for (let i = 0; i < 14; i++) rect(g, i % 3 ? C.reed : C.mint, 2 + Math.floor(noise(wx, wy, i) * 12), 2 + Math.floor(noise(wy, wx, i) * 7));
}

function reeds(g, wx, wy, frame) {
  ground(g, wx, wy);
  for (let i = 0; i < 6; i++) {
    const rx = 1 + i * 2.5 + Math.floor(noise(wx, wy, i) * 2);
    const top = 2 + Math.floor(noise(wx, wy, i + 20) * 4);
    const sway = (i + wx + wy + frame) % 2;
    rect(g, C.reedDark, Math.floor(rx), top + 2, 1, 15 - top);
    rect(g, C.reed, Math.floor(rx) + sway, top, 1, 3);
    rect(g, C.gold, Math.floor(rx) + sway, top - 1, 1, 1);
  }
}

function water(g, wx, wy, frame) {
  rect(g, C.water, 0, 0, 16, 16);
  for (let i = 0; i < 3; i++) rect(g, C.waterLight, (Math.floor(noise(wx, wy, i) * 12) + frame * 2) % 14, 3 + i * 5, 3, 1);
}

function bridge(g) {
  rect(g, C.water, 0, 0, 16, 16);
  rect(g, C.wood, 1, 0, 14, 16);
  for (let y = 0; y < 16; y += 4) rect(g, C.woodDark, 1, y, 14, 1);
  rect(g, C.woodDark, 1, 0, 1, 16);
  rect(g, C.woodDark, 14, 0, 1, 16);
}

function roof(g, wx, wy) {
  rect(g, C.plum, 0, 0, 16, 16);
  for (let y = 0; y < 16; y += 4) {
    rect(g, C.plumDark, 0, y + 3, 16, 1);
    for (let x = (wy % 2) * 4 + (y % 8 ? 2 : 0); x < 16; x += 6) rect(g, C.plumDark, x, y, 1, 3);
  }
  rect(g, C.plumLight, Math.floor(noise(wx, wy) * 12), 1, 3, 1);
}

function wall(g) {
  rect(g, C.mint, 0, 0, 16, 16);
  rect(g, C.reedDark, 0, 14, 16, 2);
  rect(g, C.pine, 0, 0, 16, 1);
  rect(g, C.pine, 5, 5, 6, 5);
  rect(g, C.gold, 6, 6, 4, 3);
}

function door(g, open = false) {
  rect(g, C.mint, 0, 0, 16, 16);
  rect(g, C.goldDark, 2, 1, 12, 15);
  rect(g, open ? C.ink : C.gold, 3, 2, 10, 14);
  if (!open) {
    rect(g, C.goldDark, 8, 2, 1, 14);
    rect(g, C.ink, 10, 9, 1, 2);
  }
}

function gateWall(g) {
  rect(g, C.stone, 0, 0, 16, 16);
  rect(g, C.stoneDark, 0, 5, 16, 1);
  rect(g, C.stoneDark, 0, 11, 16, 1);
  rect(g, C.stoneDark, 5, 0, 1, 5);
  rect(g, C.stoneDark, 11, 6, 1, 5);
  rect(g, C.stoneDark, 3, 12, 1, 4);
}

function fieldDoor(g, open) {
  gateWall(g);
  rect(g, C.goldDark, 2, 0, 12, 16);
  rect(g, open ? C.olive : C.wood, 3, 1, 10, 15);
  if (!open) {
    rect(g, C.woodDark, 6, 1, 1, 15);
    rect(g, C.woodDark, 9, 1, 1, 15);
    rect(g, C.gold, 7, 7, 2, 3);
  }
}

function arch(g, open) {
  rect(g, C.pine, 0, 0, 16, 16);
  rect(g, C.stone, 1, 1, 14, 15);
  rect(g, open ? C.mint : C.plumDark, 4, 4, 8, 12);
  rect(g, C.gold, 7, 1, 2, 3);
  if (!open) rect(g, C.gold, 7, 9, 2, 2);
}

function flowers(g, wx, wy) {
  ground(g, wx, wy);
  for (let i = 0; i < 5; i++) rect(g, i % 2 ? C.gold : C.mint, 2 + Math.floor(noise(wx, wy, i) * 12), 2 + Math.floor(noise(wy, wx, i) * 12));
}

function rock(g, wx, wy) {
  ground(g, wx, wy);
  rect(g, C.stoneDark, 2, 6, 12, 9);
  rect(g, C.stone, 3, 5, 10, 8);
  rect(g, C.mint, 5, 6, 2, 1);
}

function floor(g, wx, wy) {
  rect(g, C.woodDark, 0, 0, 16, 16);
  rect(g, C.wood, 0, 0, 16, 7);
  rect(g, C.wood, 0, 8, 16, 7);
  rect(g, C.woodDark, (wy * 7 + wx * 16) % 16, 0, 1, 7);
}

function innerWall(g) {
  rect(g, C.pine, 0, 0, 16, 16);
  rect(g, C.pineLight, 0, 13, 16, 3);
}

function shelf(g, wx) {
  rect(g, C.woodDark, 0, 0, 16, 16);
  rect(g, C.wood, 1, 2, 14, 12);
  for (let shelfRow = 0; shelfRow < 2; shelfRow++) {
    rect(g, C.woodDark, 1, 7 + shelfRow * 6, 14, 1);
    for (let i = 0; i < 4; i++) rect(g, (i + wx) % 2 ? C.mint : C.parchment, 2 + i * 3, 3 + shelfRow * 6, 2, 4);
  }
}

function tableTile(g, wx, wy) {
  floor(g, wx, wy);
  rect(g, C.woodDark, 2, 4, 12, 10);
  rect(g, C.parchment, 3, 3, 10, 8);
  rect(g, C.ink, 5, 5, 6, 1);
  rect(g, C.ink, 5, 7, 4, 1);
}

function rug(g, wx, wy) {
  floor(g, wx, wy);
  rect(g, C.plum, 0, 1, 16, 14);
  rect(g, C.gold, 2, 3, 12, 1);
  rect(g, C.gold, 2, 12, 12, 1);
}

function mat(g, wx, wy) {
  floor(g, wx, wy);
  rect(g, C.reedDark, 1, 6, 14, 9);
  rect(g, C.reed, 2, 7, 12, 7);
}

function bannerWall(g, wx) {
  innerWall(g);
  rect(g, wx % 2 ? C.gold : C.plum, 4, 1, 8, 12);
  rect(g, C.ink, 7, 3, 2, 8);
}

function pillar(g, wx, wy) {
  floor(g, wx, wy);
  rect(g, C.stoneDark, 4, 0, 8, 16);
  rect(g, C.stone, 5, 0, 5, 16);
}

function caveFloor(g, wx, wy) {
  rect(g, C.caveLight, 0, 0, 16, 16);
  for (let i = 0; i < 6; i++) rect(g, C.cave, Math.floor(noise(wx, wy, i) * 15), Math.floor(noise(wy, wx, i + 3) * 15), 2, 1);
}

function caveWall(g, wx, wy) {
  rect(g, C.cave, 0, 0, 16, 16);
  rect(g, C.ink, 0, 13, 16, 3);
  for (let i = 0; i < 4; i++) rect(g, C.caveLight, Math.floor(noise(wx, wy, i) * 13), Math.floor(noise(wy, wx, i) * 10), 3, 2);
}

function moss(g, wx, wy, frame) {
  caveFloor(g, wx, wy);
  for (let i = 0; i < 6; i++) {
    const x = 1 + i * 2.5 + Math.floor(noise(wx, wy, i) * 2);
    rect(g, C.reedDark, Math.floor(x), 8 + (i % 3), 2, 6);
    rect(g, C.reed, Math.floor(x) + ((i + frame) % 2), 7 + (i % 3), 1, 2);
  }
}

function caveMouth(g, wx, wy) {
  ground(g, wx, wy);
  rect(g, C.cave, 1, 2, 14, 14);
  rect(g, C.ink, 3, 5, 10, 11);
  rect(g, C.stone, 1, 2, 14, 2);
}

function pavement(g, wx, wy) {
  rect(g, C.parchmentDark, 0, 0, 16, 16);
  for (const [x, y, w, h] of [[0, 0, 7, 7], [8, 0, 8, 7], [0, 8, 4, 8], [5, 8, 11, 8]]) rect(g, C.parchment, x, y, w, h);
  rect(g, C.stoneDark, Math.floor(noise(wx, wy) * 12), Math.floor(noise(wy, wx) * 12), 2, 1);
}

function stall(g, wx, wy) {
  pavement(g, wx, wy);
  for (let x = 0; x < 16; x += 4) rect(g, x % 8 ? C.mint : C.plum, x, 1, 4, 5);
  rect(g, C.woodDark, 1, 6, 14, 8);
  rect(g, C.wood, 2, 6, 12, 5);
  rect(g, C.gold, 4, 7, 2, 2);
  rect(g, C.reed, 9, 7, 3, 2);
}

function forge(g, wx, wy) {
  ground(g, wx, wy);
  rect(g, C.stoneDark, 2, 3, 12, 13);
  rect(g, C.ink, 4, 6, 8, 6);
  rect(g, C.water, 5, 8, 6, 4);
  rect(g, C.waterLight, 7, 9, 2, 2);
}

function dome(g, wx, wy) {
  ground(g, wx, wy);
  [[5, 6], [3, 10], [2, 12], [1, 14], [1, 14], [1, 14], [1, 14], [1, 14]].forEach(([x, w], y) => {
    rect(g, C.stone, x, y + 1, w, 1);
    rect(g, C.stoneDark, x, y + 1, 2, 1);
  });
  rect(g, C.gold, 6, 2, 4, 2);
  rect(g, C.stoneDark, 1, 9, 14, 7);
  rect(g, C.mint, 7, 11, 2, 5);
}

function ruinPillar(g, wx, wy) {
  ground(g, wx, wy);
  rect(g, C.stoneDark, 4, 3, 8, 13);
  rect(g, C.stone, 5, 3, 5, 13);
  rect(g, C.mint, 3, 1, 10, 2);
  rect(g, C.stoneDark, 3, 14, 10, 2);
}

function fountain(g, wx, wy, frame) {
  ground(g, wx, wy);
  rect(g, C.stoneDark, 1, 5, 14, 10);
  rect(g, C.water, 3, 7, 10, 6);
  rect(g, C.waterLight, 6 + frame, 8, 4, 2);
  rect(g, C.stone, 7, 2, 2, 6);
}

function beacon(g, wx, wy, frame) {
  ground(g, wx, wy);
  rect(g, C.woodDark, 7, 6, 2, 10);
  rect(g, C.goldDark, 5, 2, 6, 5);
  rect(g, frame ? C.gold : C.mint, 6, 3, 4, 3);
}

// Whatever fills the space around a map. Each biome uses the shape that suits it.
function border(g, wx, wy, map) {
  const kind = BIOMES[MAPS[map].biome]?.border;
  if (!MAPS[map].outdoor) return innerWall(g);
  if (kind === 'wall') return gateWall(g);
  if (kind === 'rock') return rock(g, wx, wy);
  return pine(g, wx, wy);
}

export function drawTile(g, tile, wx, wy, frame, state, map) {
  switch (tile) {
    case '#': return border(g, wx, wy, map);
    case '?': return leaningPine(g, wx, wy);
    case '%': return caveWall(g, wx, wy);
    case ';': return moss(g, wx, wy, frame);
    case 'c': return caveFloor(g, wx, wy);
    case 'C': return caveMouth(g, wx, wy);
    case '_': return pavement(g, wx, wy);
    case 'M': return stall(g, wx, wy);
    case 'A': return forge(g, wx, wy);
    case 'T': return dome(g, wx, wy);
    case 'P': return ruinPillar(g, wx, wy);
    case 'Y': return fountain(g, wx, wy, frame);
    case 'L': return beacon(g, wx, wy, frame);
    case 'o': return olive(g, wx, wy);
    case '"': return reeds(g, wx, wy, frame);
    case '~': return water(g, wx, wy, frame);
    case '=': return bridge(g);
    case ',': return path(g, wx, wy);
    case '^': return roof(g, wx, wy);
    case '|': return wall(g);
    case 'D': return door(g);
    case 'G': return gateWall(g);
    case '1': case '2': case '3': return fieldDoor(g, state.flags.doorOpen === DOORS[tile]);
    case 'X': return arch(g, map === 'grove' ? !!state.badges['b-reed-seal'] : isDone(state, `${MAPS[map].regionId}:exit`));
    case 'f': return flowers(g, wx, wy);
    case 'r': return MAPS[map].outdoor ? rock(g, wx, wy) : pillar(g, wx, wy);
    case ':': return floor(g, wx, wy);
    case 's': return shelf(g, wx);
    case 't': return tableTile(g, wx, wy);
    case 'R': return rug(g, wx, wy);
    case 'E': return mat(g, wx, wy);
    case 'W': return bannerWall(g, wx);
    default: return MAPS[map].outdoor ? ground(g, wx, wy) : innerWall(g);
  }
}

// Palette-swapped pixel figures. Rows are 12 wide: 1 skin, 2 hair or scarf, 3 robe, 4 trim, 5 satchel, 6 dark, 7 shoe.
const SPRITE_ROWS = {
  down: ['...222222...', '..22222222..', '..21111112..', '..16111161..', '..11111111..', '...111111...', '..33333333..', '.3334444333.', '.1333333331.', '.1335553331.', '..33333333..', '..33333333..'],
  up: ['...222222...', '..22222222..', '..22222222..', '..22222222..', '..22222222..', '...222222...', '..33333333..', '.3333333333.', '.1333333331.', '.1333333331.', '..33333333..', '..33333333..'],
  side: ['...222222...', '..2222222...', '..2211111...', '..2211161...', '..2211111...', '...21111....', '..3333333...', '..3344333...', '..3333113...', '..3553113...', '..3333333...', '..3333333...'],
};
const LEGS = [['..33....33..', '..77....77..'], ['..33....33..', '..77........'], ['..33....33..', '........77..']];
const PALETTES = {
  player: { 1: '#e6b98c', 2: '#3b2a24', 3: '#3f7f5f', 4: '#e9ba58', 5: '#b4842c', 6: '#10231f', 7: '#10231f' },
  tamar: { 1: '#c98f63', 2: '#e2edb2', 3: '#695475', 4: '#e9ba58', 5: '#4a3a55', 6: '#10231f', 7: '#10231f' },
  neri: { 1: '#efc9a0', 2: '#8a2f24', 3: '#b4842c', 4: '#e2edb2', 5: '#624423', 6: '#10231f', 7: '#10231f' },
  ilana: { 1: '#a5704a', 2: '#d8c98f', 3: '#173c37', 4: '#a0b867', 5: '#23574c', 6: '#10231f', 7: '#10231f' },
  dalia: { 1: '#d7a278', 2: '#27424f', 3: '#2f8fb0', 4: '#e6f2a2', 5: '#1d5a57', 6: '#10231f', 7: '#10231f' },
  oren: { 1: '#b98059', 2: '#cfd8b8', 3: '#1d5a57', 4: '#7fd0dc', 5: '#2b7a72', 6: '#10231f', 7: '#10231f' },
  eitan: { 1: '#c98f63', 2: '#5a3b24', 3: '#a4503a', 4: '#e9ba58', 5: '#7a3627', 6: '#10231f', 7: '#10231f' },
  rut: { 1: '#efc9a0', 2: '#7a2b22', 3: '#c2b45c', 4: '#a4503a', 5: '#8f8a3e', 6: '#10231f', 7: '#10231f' },
  hadas: { 1: '#a5704a', 2: '#2c1d14', 3: '#9b6a4a', 4: '#f0c060', 5: '#71482f', 6: '#10231f', 7: '#10231f' },
  gil: { 1: '#d7a278', 2: '#a5784f', 3: '#2c5c73', 4: '#d3b48a', 5: '#71482f', 6: '#10231f', 7: '#10231f' },
  yonah: { 1: '#c98f63', 2: '#34313d', 3: '#d9601f', 4: '#efd9b0', 5: '#552f24', 6: '#10231f', 7: '#10231f' },
  talia: { 1: '#a5704a', 2: '#f7b23b', 3: '#4e4a58', 4: '#d9601f', 5: '#34313d', 6: '#10231f', 7: '#10231f' },
  shira: { 1: '#efc9a0', 2: '#10163a', 3: '#3a3570', 4: '#fde88c', 5: '#26234f', 6: '#10231f', 7: '#10231f' },
  micha: { 1: '#b98059', 2: '#8d8fb8', 3: '#10163a', 4: '#d6dcff', 5: '#222a5c', 6: '#10231f', 7: '#10231f' },
  amos: { 1: '#c98f63', 2: '#dbe9ee', 3: '#3f6470', 4: '#a7dcea', 5: '#5a6971', 6: '#10231f', 7: '#10231f' },
  lea: { 1: '#d7a278', 2: '#4a3a55', 3: '#7c8a55', 4: '#dbe9ee', 5: '#566138', 6: '#10231f', 7: '#10231f' },
  noa: { 1: '#a5704a', 2: '#633f28', 3: '#c49a5c', 4: '#8a5b3c', 5: '#7a6f30', 6: '#10231f', 7: '#10231f' },
  avi: { 1: '#efc9a0', 2: '#b89e72', 3: '#8a5b3c', 4: '#f2e3b3', 5: '#633f28', 6: '#10231f', 7: '#10231f' },
  folk: { 1: '#d7a278', 2: '#624423', 3: '#8a7396', 4: '#d8c98f', 5: '#4a3a55', 6: '#10231f', 7: '#10231f' },
};

function drawFigure(g, name, x, y, dir, step) {
  const palette = PALETTES[name];
  const rows = [...(SPRITE_ROWS[dir === 'left' || dir === 'right' ? 'side' : dir]), ...LEGS[step]];
  const flip = dir === 'right';
  rows.forEach((row, ry) => {
    [...row].forEach((cell, rx) => {
      if (cell !== '.') rect(g, palette[cell], x + 2 + (flip ? 11 - rx : rx), y + ry + 2, 1, 1);
    });
  });
}

const carved = (g, x, y) => {
  rect(g, C.stoneDark, x + 3, y + 1, 10, 15);
  rect(g, C.stone, x + 4, y + 2, 8, 13);
};

const OBJECT_ART = {
  lock(g, x, y) {
    carved(g, x, y);
    rect(g, C.goldDark, x + 2, y + 6, 12, 5);
    rect(g, C.gold, x + 6, y + 4, 4, 9);
    rect(g, C.ink, x + 7, y + 7, 2, 3);
  },
  lectern(g, x, y) {
    rect(g, C.woodDark, x + 7, y + 8, 2, 8);
    rect(g, C.woodDark, x + 2, y + 2, 12, 7);
    rect(g, C.parchment, x + 3, y + 2, 10, 5);
    rect(g, C.ink, x + 5, y + 3, 6, 1);
    rect(g, C.ink, x + 5, y + 5, 4, 1);
  },
  shrine(g, x, y) {
    carved(g, x, y);
    rect(g, C.plumDark, x + 6, y + 5, 4, 8);
    rect(g, C.gold, x + 7, y + 3, 2, 2);
  },
  ward(g, x, y) {
    rect(g, C.plumDark, x + 1, y + 1, 14, 15);
    rect(g, C.plum, x + 2, y + 2, 12, 13);
    rect(g, C.gold, x + 7, y + 3, 2, 10);
    rect(g, C.gold, x + 4, y + 7, 8, 2);
  },
  secret(g, x, y) {
    rect(g, C.woodDark, x + 2, y + 6, 12, 9);
    rect(g, C.wood, x + 3, y + 7, 10, 3);
    rect(g, C.gold, x + 7, y + 8, 2, 3);
  },
  restore(g, x, y) {
    rect(g, C.woodDark, x, y + 3, 16, 12);
    rect(g, C.wood, x + 1, y + 4, 14, 9);
    rect(g, C.parchment, x + 3, y + 5, 10, 6);
    rect(g, C.gold, x + 7, y + 6, 2, 4);
  },
};

function drawObject(g, object, x, y) {
  if (object.kind === 'npc' || object.kind === 'folk') return drawFigure(g, object.sprite, x, y - 2, 'down', 0);
  if (OBJECT_ART[object.kind]) return OBJECT_ART[object.kind](g, x, y);
  if (object.kind === 'sign') {
    rect(g, C.woodDark, x + 7, y + 8, 2, 8);
    rect(g, C.woodDark, x + 2, y + 2, 12, 8);
    rect(g, C.wood, x + 3, y + 3, 10, 6);
    rect(g, C.ink, x + 5, y + 5, 6, 1);
    return rect(g, C.ink, x + 5, y + 7, 4, 1);
  }
  if (object.kind === 'riddle') {
    rect(g, C.stoneDark, x + 3, y + 1, 10, 15);
    rect(g, C.stone, x + 4, y + 2, 8, 13);
    rect(g, C.gold, x + 6, y + 4, 4, 1);
    rect(g, C.gold, x + 6, y + 7, 4, 1);
    return rect(g, C.gold, x + 6, y + 10, 4, 1);
  }
  rect(g, C.parchmentDark, x + 3, y + 7, 10, 6);
  rect(g, C.parchment, x + 3, y + 6, 10, 5);
  rect(g, C.goldDark, x + 3, y + 6, 1, 6);
  return rect(g, C.ink, x + 6, y + 8, 5, 1);
}

// walk: { fromX, fromY, t } while the player tweens between tiles.
export function drawWorld(canvas, state, { walk = null, frame = 0 } = {}) {
  const g = canvas.getContext('2d');
  g.imageSmoothingEnabled = false;
  const map = MAPS[state.map];
  C = paletteFor(map.biome);
  const rows = map.rows.length, cols = map.rows[0].length;
  const t = walk?.t ?? 1;
  const px = (walk ? walk.fromX + (state.x - walk.fromX) * t : state.x) * TILE;
  const py = (walk ? walk.fromY + (state.y - walk.fromY) * t : state.y) * TILE;
  const worldW = cols * TILE, worldH = rows * TILE, viewW = VIEW_W * TILE, viewH = VIEW_H * TILE;
  // Rooms smaller than the view sit centered on dark surround.
  const camX = worldW < viewW ? (worldW - viewW) / 2 : Math.max(0, Math.min(worldW - viewW, px + 8 - viewW / 2));
  const camY = worldH < viewH ? (worldH - viewH) / 2 : Math.max(0, Math.min(worldH - viewH, py + 8 - viewH / 2));

  rect(g, C.ink, 0, 0, viewW, viewH);
  for (let wy = Math.max(0, Math.floor(camY / TILE)); wy < Math.min(rows, Math.ceil((camY + viewH) / TILE)); wy++) {
    for (let wx = Math.max(0, Math.floor(camX / TILE)); wx < Math.min(cols, Math.ceil((camX + viewW) / TILE)); wx++) {
      g.save();
      g.translate(Math.round(wx * TILE - camX), Math.round(wy * TILE - camY));
      drawTile(g, tileAt(state.map, wx, wy), wx, wy, frame, state, state.map);
      g.restore();
    }
  }
  for (const object of objectsOn(state, state.map)) drawObject(g, object, Math.round(object.x * TILE - camX), Math.round(object.y * TILE - camY));
  const step = walk && t < 1 ? 1 + (state.steps % 2) : 0;
  drawFigure(g, 'player', Math.round(px - camX), Math.round(py - camY) - 2, state.dir, step);
}

// A small symmetric ink creature, seeded by the word id. The whole word gets one aura; letters are never animated.
export function drawWordSprite(canvas, wordId) {
  const g = canvas.getContext('2d');
  C = BASE;
  let seed = 0;
  for (const ch of wordId) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  rect(g, C.pine, 0, 0, 16, 16);
  const colors = [C.reed, C.gold, C.mint, C.plumLight];
  const main = colors[seed % colors.length], second = colors[(seed >> 3) % colors.length];
  for (let y = 2; y < 14; y++) {
    for (let x = 2; x < 8; x++) {
      const fill = noise(x, y, seed % 97);
      const edge = Math.hypot(x - 8, y - 8) / 6;
      if (edge < 0.62 || fill > edge * 0.8) {
        const color = fill > 0.68 ? second : main;
        rect(g, color, x, y);
        rect(g, color, 15 - x, y);
      }
    }
  }
  rect(g, C.ink, 5, 7, 2, 2);
  rect(g, C.ink, 9, 7, 2, 2);
}
