// Pure world rules: movement, collision, interaction and quest state. No DOM, no canvas.
import { MAPS, START, SOLID, REEDS, DOORS, OBJECTS } from './world.js';
import { dueWords } from './learning.js';

export const BADGE_ID = 'b-reed-seal';
const VECTORS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const ENCOUNTER_RATE = 0.2;
const REVIEW_MIX = 0.5;

export function newGame(now, seed = (now % 2147483647) | 0) {
  return {
    version: 1, createdAt: now, updatedAt: now,
    map: START.map, x: START.x, y: START.y, dir: START.dir, steps: 0,
    rng: seed | 0, interactions: 0, encounterCounter: 0, reedCooldown: 0,
    skills: {}, lessons: {}, flags: {}, words: {}, party: [], badges: {},
    settings: { sound: false, calm: false, responseMode: 'typing' },
    encounter: null, badgeRun: null, retiredCheckpoints: {}, puzzleIndex: { neri: 0, gate: 0 },
  };
}

// mulberry32: small seedable generator so saves resume the same sequence.
export function nextRandom(state) {
  state.rng = (state.rng + 0x6D2B79F5) | 0;
  let t = state.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export const tileAt = (map, x, y) => MAPS[map].rows[y]?.[x];
export const capturedCount = state => Object.values(state.words).filter(r => r.capturedAt != null).length;
export const setFlag = (state, flag) => { state.flags[flag] = true; };

export function objectsOn(state, map) {
  return OBJECTS.filter(o => o.map === map && !(o.kind === 'fragment' && state.flags.fragmentFound)).map(o => {
    const moved = o.movedTo && state.flags[o.movedTo.flag];
    return moved ? { ...o, x: o.movedTo.x, y: o.movedTo.y } : o;
  });
}

const doorOpen = (state, x, y) => {
  const id = DOORS[tileAt('grove', x, y)];
  return id && state.flags.doorOpen === id;
};

// Where a step onto (x, y) lands, or null if the tile refuses it.
export function destination(state, map, x, y) {
  const tile = tileAt(map, x, y);
  if (tile === undefined) return null;
  if (SOLID.has(tile) && !(map === 'grove' && doorOpen(state, x, y))) return null;
  if (objectsOn(state, map).some(o => o.x === x && o.y === y)) return null;
  const warp = MAPS[map].warps?.[`${x},${y}`];
  return warp ?? { map, x, y };
}

export function frontTile(state) {
  const [dx, dy] = VECTORS[state.dir];
  return { x: state.x + dx, y: state.y + dy };
}

export function chooseEncounter(state, content, regionId, now = 0) {
  const region = content.regionById.get(regionId);
  const known = id => (content.wordById.get(id).requires ?? []).every(skill => state.skills[skill]);
  const eligible = region.wordIds.filter(known);
  if (!state.flags.seedDone) return { wordId: region.seedWordId, kind: 'capture' };
  const due = dueWords(state, now).filter(id => eligible.includes(id));
  if (due.length && nextRandom(state) < REVIEW_MIX) return { wordId: due[0], kind: 'review' };
  const uncaptured = eligible.filter(id => state.words[id]?.capturedAt == null);
  const pool = uncaptured.length ? uncaptured : eligible;
  return { wordId: pool[Math.floor(nextRandom(state) * pool.length)], kind: uncaptured.length ? 'capture' : 'practice' };
}

export function tryMove(state, dir, content, now) {
  state.dir = dir;
  const [dx, dy] = VECTORS[dir];
  const nx = state.x + dx, ny = state.y + dy;

  if (tileAt(state.map, nx, ny) === 'X') {
    if (!state.badges[BADGE_ID]) return { moved: false, event: { type: 'exit-sealed' } };
    setFlag(state, 'exitOpened');
    return { moved: false, event: { type: 'exit-open' } };
  }

  const dest = destination(state, state.map, nx, ny);
  if (!dest) return { moved: false };

  const warped = dest.map !== state.map;
  Object.assign(state, { map: dest.map, x: dest.x, y: dest.y });
  if (dest.dir) state.dir = dest.dir;
  state.steps += 1;
  state.updatedAt = now;
  state.reedCooldown = Math.max(0, state.reedCooldown - 1);
  if (warped || tileAt(state.map, state.x, state.y) !== REEDS) return { moved: true, warped };

  if (!state.lessons['l-letters']) return { moved: true, event: { type: 'reeds-silent' } };
  if (state.flags.seedDone && (state.reedCooldown > 0 || nextRandom(state) > ENCOUNTER_RATE)) return { moved: true };
  state.reedCooldown = 3;
  const encounter = chooseEncounter(state, content, 'r1', now);
  setFlag(state, 'seedDone');
  return { moved: true, event: { type: 'encounter', ...encounter } };
}

export function markLessonDone(state, content, lessonId, now) {
  const lesson = content.lessonById.get(lessonId);
  state.lessons[lessonId] = now;
  for (const skill of lesson.teaches) state.skills[skill] = now;
  state.updatedAt = now;
}

function stageDone(state, stage) {
  if (stage.kind === 'lesson') return stage.targetIds.every(id => state.lessons[id]);
  if (stage.kind === 'capture') return capturedCount(state) >= stage.requiredCount;
  if (stage.kind === 'puzzle' || stage.kind === 'exit') return stage.targetIds.every(id => state.flags[id]);
  if (stage.kind === 'duel') return stage.targetIds.every(id => state.badges[id]);
  return false;
}

export function currentStage(state, content, questId = 'q-grove') {
  return content.questById.get(questId).stages.find(stage => !stageDone(state, stage)) ?? null;
}

export function objective(state, content) {
  return currentStage(state, content)?.text ?? 'The road to the Vowel Springs is open. This build ends here for now.';
}

export const neriReady = state => !!state.lessons['l-finals'] && capturedCount(state) >= 3;

export function missingForBadge(state, content, regionId = 'r1') {
  const { badge } = content.regionById.get(regionId);
  const missing = badge.requiresSkills.filter(skill => !state.skills[skill]);
  const words = badge.requiresCaptures - capturedCount(state);
  return [...missing, ...(words > 0 ? [`${words} more captured ${words === 1 ? 'word' : 'words'}`] : [])];
}

function talkToTamar(state) {
  const count = capturedCount(state);
  if (!state.lessons['l-letters']) return {
    lines: [
      'There you are. The storm broke the archive roof last night, and the word scrolls blew all over the grove.',
      'Words hide in the reeds until someone reads them, and that someone is you. I\'ll show you how to read one first.',
    ],
    then: { type: 'lesson', id: 'l-letters' },
  };
  if (count === 0) return { lines: ['The reeds east along the path are stirring. Walk in and a word will surface. Choose Study first, then show me you can read it.'] };
  if (!state.lessons['l-finals']) return {
    lines: ['You caught one! Some words out there use letters that change shape at the end of a word, so learn those next.'],
    then: { type: 'lesson', id: 'l-finals' },
  };
  if (count < 3) return { lines: [`Now the reeds will show you more words. Capture ${3 - count} more, then go to the bridge north of the path. Neri won\'t let you cross before that.`] };
  if (!state.flags.neriCleared) return { lines: ['That\'s three. Neri is waiting on the bridge to test you. Go on, you know more than you think.'] };
  if (!state.badges[BADGE_ID]) return { lines: ['Beyond the bridge is the Field Gate, then the Hall of Letters. Ilana keeps the Reed Seal there.'] };
  return { lines: ['The Reed Seal! You read what the grove had to teach. The arch to the north will open for you now.'] };
}

function talkToNeri(state) {
  if (state.flags.neriCleared) return { lines: ['Fine, you can read. If you want something to do, there is an old marker by the west pines. I never could work out what it means.'] };
  if (!neriReady(state)) {
    const need = [];
    if (!state.lessons['l-finals']) need.push('Tamar\'s lesson on final forms');
    const n = 3 - capturedCount(state);
    if (n > 0) need.push(`${n} more captured ${n === 1 ? 'word' : 'words'}`);
    return { lines: [`Neri. Also an apprentice, and the better one. Nobody crosses this bridge who can't tell a final letter from a regular one. Come back with ${need.join(' and ')}.`] };
  }
  return { lines: ['So you caught a few words. Let\'s see whether you can read them. One right answer and I\'ll move.'], then: { type: 'puzzle', group: 'neri' } };
}

function talkToIlana(state, content) {
  if (state.badges[BADGE_ID]) return { lines: ['The seal is yours. Take it to the arch at the north end of the grove.'] };
  const missing = missingForBadge(state, content);
  if (missing.length) return { lines: [`I keep the Reed Seal for scribes who can read this grove's letters. You still need: ${missing.join(', ')}.`] };
  return {
    lines: ['My trial uses words you haven\'t met, because a reader has to handle new words. Four right answers, of three kinds, earn the seal. Miss one and I\'ll explain, then give you another.'],
    then: { type: 'badge', regionId: 'r1' },
  };
}

const SCRIPTS = { tamar: talkToTamar, neri: talkToNeri, ilana: talkToIlana };

export function interact(state, content, now) {
  const { x, y } = frontTile(state);
  const tile = tileAt(state.map, x, y);
  const object = objectsOn(state, state.map).find(o => o.x === x && o.y === y);

  if (state.map === 'grove' && DOORS[tile] && !doorOpen(state, x, y)) {
    state.interactions += 1;
    if (state.flags.gateOpen) return { kind: 'dialogue', speaker: 'Field Gate', lines: ['This door stays shut. You already opened the right one.'] };
    return { kind: 'door', doorId: DOORS[tile] };
  }
  if (tile === 'X') return { kind: 'exit' };
  if (!object) return { kind: 'none' };

  state.interactions += 1;
  state.updatedAt = now;
  if (object.kind === 'npc') return { kind: 'dialogue', speaker: object.name, ...SCRIPTS[object.id](state, content) };
  if (object.kind === 'sign') return { kind: 'dialogue', speaker: object.name, lines: object.lines };
  if (object.kind === 'riddle') return { kind: 'riddle' };
  return { kind: 'dialogue', speaker: object.name, lines: ['A strip of old scroll lies under the pine needles. It has one clause on it.'], then: { type: 'passage', id: 'p-gen-44-19' } };
}

// What pressing A would do right now, for the on-screen prompt.
export function promptFor(state) {
  const { x, y } = frontTile(state);
  const tile = tileAt(state.map, x, y);
  if (state.map === 'grove' && DOORS[tile] && !doorOpen(state, x, y)) return 'Press Enter or the A button to try this door';
  if (tile === 'X') return 'Press Enter or the A button to try the arch';
  const object = objectsOn(state, state.map).find(o => o.x === x && o.y === y);
  return object ? `Press Enter or the A button to ${object.verb}` : '';
}
