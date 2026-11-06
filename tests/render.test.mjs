// Rasterizes the world with a tiny fillRect-only canvas, so the pixel art can be checked without a
// browser. Writes PNGs to test-output/ for a human to look at. It can't check real font rendering.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync, crc32 } from 'node:zlib';
import { drawWorld, drawWordSprite } from '../src/render.js';
import { newGame, setFlag } from '../src/engine.js';

function fakeCanvas(width, height) {
  const pixels = new Uint32Array(width * height);
  const stack = [];
  let ox = 0, oy = 0, color = 0;
  const context = {
    imageSmoothingEnabled: true,
    set fillStyle(hex) { color = parseInt(hex.slice(1), 16); },
    fillRect(x, y, w, h) {
      for (let py = Math.max(0, y + oy); py < Math.min(height, y + oy + h); py++) {
        for (let px = Math.max(0, x + ox); px < Math.min(width, x + ox + w); px++) pixels[py * width + px] = color;
      }
    },
    save() { stack.push([ox, oy]); },
    restore() { [ox, oy] = stack.pop(); },
    translate(x, y) { ox += x; oy += y; },
  };
  return { width, height, pixels, getContext: () => context };
}

function png({ width, height, pixels }, scale = 2) {
  const raw = Buffer.alloc((width * scale * 3 + 1) * height * scale);
  let at = 0;
  for (let y = 0; y < height * scale; y++) {
    raw[at++] = 0;
    for (let x = 0; x < width * scale; x++) {
      const p = pixels[Math.floor(y / scale) * width + Math.floor(x / scale)];
      raw[at++] = p >> 16; raw[at++] = (p >> 8) & 255; raw[at++] = p & 255;
    }
  }
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width * scale, 0); header.writeUInt32BE(height * scale, 4);
  header[8] = 8; header[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const output = new URL('../test-output/', import.meta.url);
const render = (name, place, setup = () => {}) => {
  const state = { ...newGame(0, 1), ...place };
  setup(state);
  const canvas = fakeCanvas(320, 240);
  drawWorld(canvas, state, { frame: 0 });
  mkdirSync(output, { recursive: true });
  writeFileSync(new URL(`${name}.png`, output), png(canvas));
  return canvas;
};
const colors = canvas => new Set(canvas.pixels).size;

test('every area draws a full, varied frame with the player in it', () => {
  const scenes = {
    start: render('start', { map: 'grove', x: 11, y: 23, dir: 'up' }),
    reeds: render('reeds', { map: 'grove', x: 30, y: 19, dir: 'left' }),
    bridge: render('bridge', { map: 'grove', x: 17, y: 16, dir: 'up' }),
    gate: render('gate', { map: 'grove', x: 17, y: 11, dir: 'up' }, s => setFlag(s, 'neriCleared')),
    north: render('north', { map: 'grove', x: 24, y: 5, dir: 'right' }),
    secret: render('secret', { map: 'grove', x: 5, y: 21, dir: 'left' }),
    scriptorium: render('scriptorium', { map: 'scriptorium', x: 5, y: 6, dir: 'up' }),
    hall: render('hall', { map: 'hall', x: 5, y: 5, dir: 'up' }),
  };
  for (const [name, canvas] of Object.entries(scenes)) {
    assert.ok(colors(canvas) >= 6, `${name} has ${colors(canvas)} colors`);
    assert.ok(canvas.pixels.includes(0x3f7f5f), `${name} shows the player's robe`);
  }
  const open = render('gate-open', { map: 'grove', x: 17, y: 11, dir: 'up' }, s => { setFlag(s, 'neriCleared'); setFlag(s, 'gateOpen'); s.flags.doorOpen = 'door-m'; });
  assert.notDeepEqual(open.pixels, scenes.gate.pixels, 'an opened door looks different');
});

test('word creatures are drawn by id and differ between words', () => {
  const a = fakeCanvas(16, 16), b = fakeCanvas(16, 16);
  drawWordSprite(a, 'H0001');
  drawWordSprite(b, 'H0776');
  assert.notDeepEqual(a.pixels, b.pixels);
  mkdirSync(output, { recursive: true });
  writeFileSync(new URL('creature.png', output), png(a, 8));
});
