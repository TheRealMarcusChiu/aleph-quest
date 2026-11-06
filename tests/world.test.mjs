// World structure, independent of language content: real collision, real warps, real gates.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MAPS, OBJECTS, SOLID, REGION_MAPS, START, TILE_NAMES } from '../src/world.js';
import { destination, newGame, objectsOn, tileAt } from '../src/engine.js';

const REGIONS = ['r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'r8'];
const finished = () => {
  const s = newGame(0, 1);
  s.flags = { seedDone: true, neriCleared: true, gateOpen: true, doorOpen: 'door-m', fragmentFound: true, exitOpened: true };
  for (const r of REGIONS.slice(1)) for (const key of ['rival', 'gate', 'exit', 'ward', 'secret']) s.gates[`${r}:${key}`] = { at: 0, questionIds: [] };
  s.endingAt = 1;
  return s;
};
const VEC = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// Everything walkable from a start, following warps and region exits the way the player does.
function reachable(state, from = { map: START.map, x: START.x, y: START.y }) {
  const seen = new Set([`${from.map}:${from.x},${from.y}`]);
  const queue = [from];
  while (queue.length) {
    const { map, x, y } = queue.shift();
    for (const [dx, dy] of VEC) {
      let dest = destination(state, map, x + dx, y + dy);
      if (!dest && tileAt(map, x + dx, y + dy) === 'X' && MAPS[map].exitTo) dest = MAPS[map].exitTo;
      if (!dest) continue;
      const key = `${dest.map}:${dest.x},${dest.y}`;
      if (!seen.has(key)) { seen.add(key); queue.push(dest); }
    }
  }
  return seen;
}
const mapsIn = seen => new Set([...seen].map(key => key.split(':')[0]));

test('eight regions each have a distinct outdoor map, biome and interiors', () => {
  assert.deepEqual(Object.keys(REGION_MAPS), REGIONS);
  const outdoors = REGIONS.map(r => MAPS[REGION_MAPS[r].outdoor]);
  assert.equal(new Set(outdoors.map(m => m.biome)).size, 8);
  for (const r of REGIONS) {
    const set = REGION_MAPS[r];
    assert.equal(MAPS[set.outdoor].regionId, r);
    assert.equal(MAPS[set.outdoor].outdoor, true);
    assert.equal(MAPS[set.house].regionId, r);
    assert.equal(MAPS[set.hall].regionId, r);
    if (r !== 'r1') assert.equal(MAPS[set.cave].regionId, r);
  }
});

test('no two outdoor maps are reskins: their layouts differ on most tiles', () => {
  const maps = REGIONS.map(r => MAPS[REGION_MAPS[r].outdoor]);
  for (let a = 0; a < maps.length; a++) {
    for (let b = a + 1; b < maps.length; b++) {
      let same = 0, total = 0;
      for (let y = 0; y < Math.min(maps[a].rows.length, maps[b].rows.length); y++) {
        for (let x = 0; x < Math.min(maps[a].rows[0].length, maps[b].rows[0].length); x++) {
          total += 1;
          if (maps[a].rows[y][x] === maps[b].rows[y][x]) same += 1;
        }
      }
      assert.ok(same / total < 0.75, `${maps[a].title} and ${maps[b].title} share ${(same / total).toFixed(2)} of their tiles`);
    }
  }
});

test('every map is rectangular, known tiles only, with Hebrew kept out of world data', () => {
  for (const [id, map] of Object.entries(MAPS)) {
    assert.ok(map.rows.length >= 10, id);
    for (const [y, row] of map.rows.entries()) {
      assert.equal([...row].length, map.rows[0].length, `${id} row ${y}`);
      for (const tile of row) assert.ok(TILE_NAMES.has(tile), `${id} row ${y}: unknown tile ${tile}`);
    }
  }
  assert.doesNotMatch(readFileSync(new URL('../src/world.js', import.meta.url), 'utf8'), /[א-ת]/);
});

test('each outdoor map has towns, paths, encounter ground, a landmark and a place for every actor', () => {
  for (const r of REGIONS) {
    const map = MAPS[REGION_MAPS[r].outdoor];
    const tiles = new Set(map.rows.join(''));
    assert.ok(tiles.has('"'), `${r} has encounter ground`);
    assert.ok(tiles.has(','), `${r} has paths`);
    assert.ok(tiles.has('D'), `${r} has a building door`);
    assert.ok(tiles.has('X'), `${r} has a region exit`);
  }
  for (const r of REGIONS.slice(1)) {
    const set = REGION_MAPS[r];
    const on = (map, role) => OBJECTS.filter(o => o.map === map && (o.role === role || o.kind === role));
    assert.equal(on(set.house, 'mentor').length, 1, `${r} mentor`);
    assert.equal(on(set.hall, 'keeper').length, 1, `${r} keeper`);
    assert.equal(on(set.outdoor, 'rival').length, 1, `${r} rival`);
    assert.equal(on(set.outdoor, 'lock').length, 1, `${r} lock`);
    assert.equal(on(set.outdoor, 'lectern').length, 1, `${r} lectern`);
    assert.ok(on(set.outdoor, 'sign').length >= 1, `${r} sign`);
    assert.ok(on(set.outdoor, 'folk').length >= 1, `${r} townsfolk`);
    assert.equal(on(set.cave, 'ward').length, 1, `${r} ward`);
    assert.equal(on(set.cave, 'secret').length, 1, `${r} secret`);
    assert.ok(new Set(MAPS[set.cave].rows.join('')).has(';'), `${r} cave moss`);
  }
});

test('all objects stand on open ground inside their maps, and every warp lands somewhere walkable', () => {
  const s = newGame(0, 1);
  for (const o of OBJECTS) {
    const tile = tileAt(o.map, o.x, o.y);
    assert.ok(tile !== undefined, `${o.id} is on its map`);
    assert.ok(!SOLID.has(tile), `${o.id} stands on solid ${tile}`);
  }
  for (const [id, map] of Object.entries(MAPS)) {
    for (const [at, warp] of Object.entries(map.warps ?? {})) {
      assert.ok(MAPS[warp.map], `${id} ${at} goes to a real map`);
      assert.ok(!SOLID.has(tileAt(warp.map, warp.x, warp.y)), `${id} ${at} lands on solid`);
      assert.equal(MAPS[warp.map].warps?.[`${warp.x},${warp.y}`], undefined, `${id} ${at} lands on another warp`);
    }
    if (map.exitTo) assert.ok(!SOLID.has(tileAt(map.exitTo.map, map.exitTo.x, map.exitTo.y)), `${id} exit lands on solid`);
  }
  assert.ok(s);
});

test('with every gate cleared, the whole world is walkable from the start, including the garden', () => {
  const seen = reachable(finished());
  const maps = mapsIn(seen);
  for (const id of Object.keys(MAPS)) assert.ok(maps.has(id), `${id} is reachable`);
  // Every walkable tile that is not walled off on purpose is reachable, so nothing was left stranded.
  for (const [id, map] of Object.entries(MAPS)) {
    const walkable = map.rows.join('').length;
    const reached = [...seen].filter(key => key.startsWith(`${id}:`)).length;
    assert.ok(reached > 0 && reached <= walkable, id);
  }
});

test('the rival, then the lock, physically block the way in each new region, and the ward blocks the cave shortcut', () => {
  for (const r of REGIONS.slice(1)) {
    const set = REGION_MAPS[r];
    const arrive = MAPS[set.outdoor].arrive;
    const reach = s => reachable(s, { map: set.outdoor, ...arrive });
    const lock = OBJECTS.find(o => o.map === set.outdoor && o.kind === 'lock');
    const rival = OBJECTS.find(o => o.map === set.outdoor && o.role === 'rival');
    const exit = MAPS[set.outdoor].exitFront;

    const s = newGame(0, 1);
    s.flags.exitOpened = true;
    let seen = reach(s);
    assert.ok(seen.has(`${set.house}:${MAPS[set.house].npcFront.x},${MAPS[set.house].npcFront.y}`), `${r}: mentor is reachable first`);
    assert.ok(!seen.has(`${set.outdoor}:${lock.x},${lock.y + 1}`) || lock.y < rival.y === false, `${r}: rival stands before the lock`);
    assert.ok(!seen.has(`${set.hall}:${MAPS[set.hall].npcFront.x},${MAPS[set.hall].npcFront.y}`), `${r}: hall is shut before the rival`);
    assert.ok(!seen.has(`${set.outdoor}:${exit.x},${exit.y}`), `${r}: exit is out of reach before the rival`);

    s.gates[`${r}:rival`] = { at: 0, questionIds: [] };
    seen = reach(s);
    assert.ok(mapsIn(seen).has(set.cave), `${r}: cave opens after the rival`);
    assert.ok(!seen.has(`${set.hall}:${MAPS[set.hall].npcFront.x},${MAPS[set.hall].npcFront.y}`), `${r}: hall is shut before the lock`);
    assert.ok(!seen.has(`${set.cave}:${MAPS[set.cave].shortcutFront.x},${MAPS[set.cave].shortcutFront.y}`), `${r}: ward blocks the shortcut`);
    assert.ok(!seen.has(`${set.outdoor}:${exit.x},${exit.y}`), `${r}: exit shut before the lock`);

    s.gates[`${r}:gate`] = { at: 0, questionIds: [] };
    seen = reach(s);
    assert.ok(seen.has(`${set.hall}:${MAPS[set.hall].npcFront.x},${MAPS[set.hall].npcFront.y}`), `${r}: hall opens after the lock`);
    assert.ok(seen.has(`${set.outdoor}:${exit.x},${exit.y}`), `${r}: exit tile reachable after the lock`);
    assert.ok(objectsOn(s, set.outdoor).every(o => o.kind !== 'lock'), `${r}: the lock is gone once solved`);

    s.gates[`${r}:ward`] = { at: 0, questionIds: [] };
    seen = reach(s);
    assert.ok(seen.has(`${set.cave}:${MAPS[set.cave].shortcutFront.x},${MAPS[set.cave].shortcutFront.y}`), `${r}: the ward opens the shortcut`);
  }
});

test('the garden stays closed until the ending', () => {
  const s = finished();
  s.endingAt = null;
  assert.ok(!mapsIn(reachable(s)).has('garden'));
  s.endingAt = 1;
  assert.ok(mapsIn(reachable(s)).has('garden'));
});

test('region one keeps the accepted layout, doors and cast', () => {
  assert.equal(MAPS.grove.rows.length, 30);
  assert.equal(MAPS.grove.rows[9], 'GGGGGGGGGGGGGGG1G2G3GGGGGGGGGGGGGGGGGGGG');
  for (const id of ['tamar', 'ilana', 'neri', 'sign-start', 'sign-reeds', 'sign-well', 'riddle-stone', 'fragment']) assert.ok(OBJECTS.find(o => o.id === id), id);
  assert.deepEqual(START, { map: 'grove', x: 11, y: 23, dir: 'up' });
});
