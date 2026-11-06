import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame, tryMove, interact, objective, destination, frontTile, markLessonDone, setFlag } from '../src/engine.js';
import { MAPS, START } from '../src/world.js';
import { content } from '../src/content.js';

const NOW = 1_800_000_000_000;
const game = () => newGame(NOW, 7);
const at = (s, map, x, y, dir = 'down') => Object.assign(s, { map, x, y, dir });

// Breadth-first search through real collision. Shows what a player can walk to.
function reachable(state) {
  const seen = new Set([`${state.map}:${state.x},${state.y}`]);
  const queue = [[state.map, state.x, state.y]];
  while (queue.length) {
    const [map, x, y] = queue.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const dest = destination(state, map, x + dx, y + dy);
      if (!dest) continue;
      const key = `${dest.map}:${dest.x},${dest.y}`;
      if (!seen.has(key)) { seen.add(key); queue.push([dest.map, dest.x, dest.y]); }
    }
  }
  return seen;
}

test('every map row has the declared width', () => {
  for (const [id, map] of Object.entries(MAPS)) {
    assert.ok(map.rows.length >= 10, id);
    for (const [y, row] of map.rows.entries()) assert.equal([...row].length, map.rows[0].length, `${id} row ${y}`);
  }
});

test('a new game starts outside with a visible objective that points to the mentor', () => {
  const s = game();
  assert.deepEqual([s.map, s.x, s.y], [START.map, START.x, START.y]);
  assert.match(objective(s, content), /Tamar/);
  assert.deepEqual(s.party, []);
});

test('walking into a tree is blocked, faces it, and does not move the player', () => {
  const s = game();
  at(s, 'grove', 6, 16, 'right');
  const blocked = tryMove(s, 'left', content, NOW);
  assert.equal(blocked.moved, false);
  assert.equal(s.x, 6);
  assert.equal(s.dir, 'left');
});

test('open ground lets the player walk, and steps are counted', () => {
  const s = game();
  const before = [s.x, s.y, s.steps];
  const r = tryMove(s, 'down', content, NOW);
  assert.equal(r.moved, true);
  assert.deepEqual([s.x, s.y, s.steps], [before[0], before[1] + 1, before[2] + 1]);
});

test('the door to the scriptorium is walkable and reaches Tamar, who starts the first lesson', () => {
  const s = game();
  at(s, 'grove', 11, 20, 'up');
  const r = tryMove(s, 'up', content, NOW);
  assert.equal(r.moved, true);
  assert.equal(s.map, 'scriptorium');
  at(s, 'scriptorium', 5, 4, 'up');
  const talk = interact(s, content, NOW);
  assert.equal(talk.kind, 'dialogue');
  assert.equal(talk.speaker, 'Tamar');
  assert.deepEqual(talk.then, { type: 'lesson', id: 'l-letters' });
});

test('leaving the scriptorium returns to the grove, below the door', () => {
  const s = game();
  at(s, 'scriptorium', 5, 7, 'down');
  const r = tryMove(s, 'down', content, NOW);
  assert.equal(r.moved, true);
  assert.deepEqual([s.map, s.x, s.y], ['grove', 11, 20]);
});

test('reeds stay quiet before the lesson, and the first step after it seeds the safe encounter', () => {
  const s = game();
  at(s, 'grove', 28, 20, 'right');
  const quiet = tryMove(s, 'right', content, NOW);
  assert.equal(quiet.moved, true);
  assert.equal(quiet.event?.type, 'reeds-silent');

  markLessonDone(s, content, 'l-letters', NOW);
  assert.match(objective(s, content), /reeds/i);
  at(s, 'grove', 28, 20, 'right');
  const seeded = tryMove(s, 'right', content, NOW);
  assert.deepEqual(seeded.event, { type: 'encounter', wordId: 'H0001', kind: 'capture' });
});

test('Neri blocks the only bridge until the challenge is answered', () => {
  const s = game();
  assert.ok(!reachable(s).has('grove:17,13'), 'north bank is out of reach');
  setFlag(s, 'neriCleared');
  assert.ok(reachable(s).has('grove:17,13'), 'north bank opens once Neri moves');
});

test('Neri names what is still missing before offering the challenge', () => {
  const s = game();
  at(s, 'grove', 17, 15, 'up');
  const early = interact(s, content, NOW);
  assert.equal(early.speaker, 'Neri');
  assert.equal(early.then, undefined);
});

test('the Field Gate holds until a door is opened, and the Hall sits behind it', () => {
  const s = game();
  setFlag(s, 'neriCleared');
  assert.ok(!reachable(s).has('grove:17,8'));
  s.flags.doorOpen = 'door-m';
  setFlag(s, 'gateOpen');
  const open = reachable(s);
  assert.ok(open.has('grove:17,8'));
  assert.ok(open.has('hall:5,3'), 'Hall of Letters is walkable behind the gate');
});

test('facing a Field Gate door offers that door, not a generic prompt', () => {
  const s = game();
  at(s, 'grove', 15, 10, 'up');
  assert.deepEqual(frontTile(s), { x: 15, y: 9 });
  const r = interact(s, content, NOW);
  assert.deepEqual([r.kind, r.doorId], ['door', 'door-w']);
});

test('a secret glade is reachable only through the leaning pine, and yields the fragment', () => {
  const s = game();
  const r = reachable(s);
  assert.ok(r.has('grove:4,21'), 'the leaning pine lets you through');
  assert.ok(r.has('grove:1,21'), 'glade is reachable');
  assert.ok(!r.has('grove:4,20') && !r.has('grove:4,22'), 'neighbouring pines are solid');
  at(s, 'grove', 2, 20, 'down');
  const found = interact(s, content, NOW);
  assert.equal(found.then?.type, 'passage');
  assert.equal(s.flags.fragmentFound, undefined, 'flag is only set when the passage has been read');
});

test('the north arch refuses without the seal and opens with it', () => {
  const s = game();
  at(s, 'grove', 27, 1, 'up');
  const refused = tryMove(s, 'up', content, NOW);
  assert.equal(refused.moved, false);
  assert.equal(refused.event?.type, 'exit-sealed');
  s.badges['b-reed-seal'] = { at: NOW, questionIds: [] };
  // The whole quest before the arch, so only the seal is being tested here.
  assert.equal(tryMove(s, 'up', content, NOW).event?.type, 'exit-unfinished');
  for (const id of ['l-letters', 'l-meaning', 'l-finals']) markLessonDone(s, content, id, NOW);
  for (const id of content.regionById.get('r1').wordIds.slice(0, 3)) s.words[id] = { capturedAt: NOW };
  Object.assign(s.flags, { neriCleared: true, gateOpen: true, doorOpen: 'door-m' });
  const opened = tryMove(s, 'up', content, NOW);
  assert.equal(opened.event?.type, 'exit-open');
  assert.equal(s.flags.exitOpened, true);
});

test('every interaction counts as exploration for relearning', () => {
  const s = game();
  const before = s.interactions;
  at(s, 'scriptorium', 5, 4, 'up');
  interact(s, content, NOW);
  assert.equal(s.interactions, before + 1);
});
