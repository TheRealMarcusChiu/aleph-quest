// Canvas drawing for the 16px world. All tiles and sprites are original and generated here.
import { MAPS, DOORS } from './world.js';
import { objectsOn, tileAt } from './engine.js';

export const TILE = 16;
const VIEW_W = 20, VIEW_H = 15;
const C = {
  pine: '#173c37', pineLight: '#23574c', olive: '#527749', oliveLight: '#6b9159', reed: '#a0b867', reedDark: '#7c9a50',
  mint: '#e2edb2', gold: '#e9ba58', goldDark: '#b4842c', plum: '#695475', plumDark: '#4a3a55', plumLight: '#8a7396',
  ink: '#10231f', parchment: '#d8c98f', parchmentDark: '#b09f68', water: '#3a7d86', waterLight: '#63a7a6', stone: '#7d8778', stoneDark: '#5b6459', wood: '#8a6236', woodDark: '#624423',
};

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

export function drawTile(g, tile, wx, wy, frame, state, map) {
  switch (tile) {
    case '#': return map === 'grove' ? pine(g, wx, wy) : innerWall(g);
    case '?': return leaningPine(g, wx, wy);
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
    case 'X': return arch(g, !!state.badges['b-reed-seal']);
    case 'f': return flowers(g, wx, wy);
    case 'r': return map === 'hall' ? pillar(g, wx, wy) : rock(g, wx, wy);
    case ':': return floor(g, wx, wy);
    case 's': return shelf(g, wx);
    case 't': return tableTile(g, wx, wy);
    case 'R': return rug(g, wx, wy);
    case 'E': return mat(g, wx, wy);
    case 'W': return bannerWall(g, wx);
    default: return map === 'grove' ? ground(g, wx, wy) : innerWall(g);
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

function drawObject(g, object, x, y) {
  if (object.kind === 'npc') return drawFigure(g, object.sprite, x, y - 2, 'down', 0);
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
