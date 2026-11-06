// Pure world rules: movement, collision, interaction and quest state. No DOM, no canvas.
import { MAPS, START, SOLID, ENCOUNTER_TILES, DOORS, OBJECTS } from './world.js';
import { dueWords, wordCapturable, wardCandidates } from './learning.js';

export const BADGE_ID = 'b-reed-seal';
const VECTORS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const ENCOUNTER_RATE = 0.2;
const REVIEW_MIX = 0.5;
const CAMPAIGN_REGIONS = 8;

export function newGame(now, seed = (now % 2147483647) | 0) {
  return {
    version: 2, createdAt: now, updatedAt: now,
    map: START.map, x: START.x, y: START.y, dir: START.dir, steps: 0,
    rng: seed | 0, interactions: 0, encounterCounter: 0, reedCooldown: 0,
    skills: {}, lessons: {}, flags: {}, words: {}, party: [], badges: {},
    settings: { sound: false, calm: false, responseMode: 'typing', sacredName: 'written' },
    encounter: null, badgeRun: null, retiredCheckpoints: {}, puzzleIndex: { neri: 0, gate: 0 },
    gates: {}, gateCredit: {}, attempt: null, endingAt: null,
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

// r1 keeps its original flags. Later regions store a verified record per action, and status derives from it.
export const isDone = (state, key) => (key === 'ending' ? state.endingAt != null : !!state.flags[key] || !!state.gates[key]);

export function regionUnlocked(state, content, regionId) {
  const region = content.regionById.get(regionId);
  return !!region && region.requiresBadges.every(id => state.badges[id]);
}

export const capturedIn = (state, content, regionId) => content.regionById.get(regionId).wordIds.filter(id => state.words[id]?.capturedAt != null).length;

export function objectsOn(state, map) {
  return OBJECTS.filter(o => o.map === map && !(o.hiddenBy && isDone(state, o.hiddenBy))).map(o => {
    const moved = o.movedTo && isDone(state, o.movedTo.flag);
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

// Quest stages read real state. A flag target can also name a badge, for duel stages like r1's.
function stageDone(state, content, stage, regionId) {
  const target = id => !!state.badges[id] || isDone(state, id);
  if (stage.kind === 'lesson') return stage.targetIds.every(id => state.lessons[id]);
  if (stage.kind === 'capture') {
    const pool = stage.targetIds.length ? stage.targetIds : content.regionById.get(regionId)?.wordIds ?? [];
    return pool.filter(id => state.words[id]?.capturedAt != null).length >= (stage.requiredCount ?? pool.length);
  }
  if (stage.kind === 'reading') return stage.targetIds.every(id => isDone(state, `read:${id}`));
  if (stage.kind === 'puzzle' || stage.kind === 'exit' || stage.kind === 'duel') return stage.targetIds.every(target);
  return false;
}

export function currentStage(state, content, questId = 'q-grove') {
  const quest = content.questById.get(questId);
  return quest.stages.find(stage => !stageDone(state, content, stage, quest.regionId)) ?? null;
}

// The stage holding up a target, or null when everything before it is done.
export function stageBlocking(state, content, regionId, target) {
  const quest = content.questById.get(content.regionById.get(regionId).questId);
  const stages = quest?.stages ?? [];
  const at = stages.findIndex(stage => stage.targetIds.includes(target));
  return at < 0 ? null : stages.slice(0, at).find(stage => !stageDone(state, content, stage, regionId)) ?? null;
}

// The first region in order with unfinished quest stages, or null when all are done.
export function activeRegion(state, content) {
  return content.regions.find(region => content.questById.has(region.questId) && currentStage(state, content, region.questId)) ?? null;
}

const campaignComplete = content => content.regions.length >= CAMPAIGN_REGIONS;

// The ending needs every quest finished, so a required stage can't be walked around anywhere in the campaign.
export const archiveReady = (state, content) => campaignComplete(content) && !activeRegion(state, content)
  && content.regions.every(region => state.badges[region.badge.id]) && isDone(state, `${content.regions.at(-1).id}:exit`);

export function objective(state, content) {
  if (state.endingAt != null) return 'The archive stands restored. Walk the Review Garden to keep your words alive.';
  const region = activeRegion(state, content);
  if (region) return currentStage(state, content, region.questId).text;
  if (campaignComplete(content)) return 'Carry the last scroll to the great reading desk in the archive.';
  return 'The road to the Vowel Springs is open. This build ends here for now.';
}

// Any due word can come up anywhere, which mixes old regions' words into new ground.
function dueReview(state, now) {
  const due = dueWords(state, now);
  if (!due.length || nextRandom(state) >= REVIEW_MIX) return null;
  return { wordId: due[Math.floor(nextRandom(state) * due.length)], kind: 'review' };
}

export function chooseEncounter(state, content, regionId, now = 0) {
  if (regionId == null) {
    const review = dueReview(state, now);
    if (review) return review;
    const owned = Object.keys(state.words).filter(id => state.words[id].capturedAt != null);
    return owned.length ? { wordId: owned[Math.floor(nextRandom(state) * owned.length)], kind: 'practice' } : null;
  }
  const region = content.regionById.get(regionId);
  const eligible = region.wordIds.filter(id => wordCapturable(state, content, id));
  if (regionId === 'r1' && !state.flags.seedDone) return { wordId: region.seedWordId, kind: 'capture' };
  if (regionId !== 'r1' && eligible.includes(region.seedWordId) && !state.words[region.seedWordId]) return { wordId: region.seedWordId, kind: 'capture' };
  const review = dueReview(state, now);
  if (review) return review;
  const uncaptured = eligible.filter(id => state.words[id]?.capturedAt == null);
  const pool = uncaptured.length ? uncaptured : eligible;
  if (!pool.length) return null;
  return { wordId: pool[Math.floor(nextRandom(state) * pool.length)], kind: uncaptured.length ? 'capture' : 'practice' };
}

// Bumping a region's exit: sealed without its badge, opens once, then walks on if there's more world with data.
function exitStep(state, content, now) {
  const map = MAPS[state.map];
  const region = content.regionById.get(map.regionId);
  if (!state.badges[region?.badge.id]) return { moved: false, event: { type: 'exit-sealed', regionId: map.regionId } };
  const key = region.id === 'r1' ? 'exitOpened' : `${region.id}:exit`;
  if (!isDone(state, key)) {
    const held = stageBlocking(state, content, region.id, key);
    if (held) return { moved: false, event: { type: 'exit-unfinished', regionId: region.id, text: held.text } };
    if (region.id === 'r1') setFlag(state, key);
    else state.gates[key] = { at: now, questionIds: [] };
    state.updatedAt = now;
    return { moved: false, event: { type: 'exit-open', regionId: region.id } };
  }
  const to = map.exitTo;
  const nextRegion = to && MAPS[to.map].regionId;
  if (!to || !regionUnlocked(state, content, nextRegion) || (region.id === nextRegion && !campaignComplete(content))) return { moved: false, event: { type: 'exit-open', regionId: region.id } };
  Object.assign(state, { map: to.map, x: to.x, y: to.y, dir: to.dir });
  state.steps += 1;
  state.updatedAt = now;
  return { moved: true, warped: true, event: { type: nextRegion === region.id ? 'archive-enter' : 'region-enter', regionId: nextRegion } };
}

export function tryMove(state, dir, content, now) {
  state.dir = dir;
  const [dx, dy] = VECTORS[dir];
  const nx = state.x + dx, ny = state.y + dy;

  if (tileAt(state.map, nx, ny) === 'X') return exitStep(state, content, now);

  const dest = destination(state, state.map, nx, ny);
  if (!dest) return { moved: false };

  const warped = dest.map !== state.map;
  Object.assign(state, { map: dest.map, x: dest.x, y: dest.y });
  if (dest.dir) state.dir = dest.dir;
  state.steps += 1;
  state.updatedAt = now;
  state.reedCooldown = Math.max(0, state.reedCooldown - 1);
  if (warped || !ENCOUNTER_TILES.has(tileAt(state.map, state.x, state.y))) return { moved: true, warped };

  const regionId = MAPS[state.map].regionId;
  const region = content.regionById.get(regionId);
  const silent = regionId && !state.lessons[region?.lessonIds[0]];
  if (silent) return { moved: true, event: { type: 'reeds-silent', regionId } };
  const seeding = regionId === 'r1' ? !state.flags.seedDone : regionId && !state.words[region.seedWordId] && wordCapturable(state, content, region.seedWordId);
  if (!seeding && (state.reedCooldown > 0 || nextRandom(state) > ENCOUNTER_RATE)) return { moved: true };
  state.reedCooldown = 3;
  const encounter = chooseEncounter(state, content, regionId, now);
  if (regionId === 'r1') setFlag(state, 'seedDone');
  return encounter ? { moved: true, event: { type: 'encounter', ...encounter } } : { moved: true };
}

export function markLessonDone(state, content, lessonId, now) {
  const lesson = content.lessonById.get(lessonId);
  state.lessons[lessonId] = now;
  for (const skill of lesson.teaches) state.skills[skill] = now;
  state.updatedAt = now;
}

export const neriReady = state => !!state.lessons['l-finals'] && capturedCount(state) >= 3;

export function missingForBadge(state, content, regionId = 'r1') {
  const { badge } = content.regionById.get(regionId);
  const missing = badge.requiresSkills.filter(skill => !state.skills[skill]);
  const words = badge.requiresCaptures - capturedIn(state, content, regionId);
  const stage = stageBlocking(state, content, regionId, badge.id);
  return [...missing, ...(words > 0 ? [`${words} more captured ${words === 1 ? 'word' : 'words'}`] : []), ...(stage ? [stage.text] : [])];
}

// The next lesson a region's mentor can teach: prerequisites met, and the quest has reached it.
export function nextLesson(state, content, regionId) {
  return content.regionById.get(regionId).lessonIds.find(id => {
    if (state.lessons[id]) return false;
    if (!content.lessonById.get(id).requires.every(skill => state.skills[skill])) return false;
    return !stageBlocking(state, content, regionId, id);
  }) ?? null;
}

// Which question ids an action can ask, for a key like r2:rival, r2:gate, r2:<optional group> or read:<passage>.
export function gatePool(content, key) {
  if (key.startsWith('read:')) return content.passageById.get(key.slice(5))?.questionIds ?? [];
  const [regionId, group] = key.split(':');
  const pools = content.regionById.get(regionId)?.puzzleQuestionIds;
  if (!pools || group === 'neri') return [];
  return (group === 'rival' ? pools.neri : pools[group]) ?? [];
}

// How many distinct fresh correct answers an action needs. Pools stay at least twice this, for retries.
export function gateRequired(content, key) {
  const pool = gatePool(content, key).length;
  if (key.startsWith('read:')) return Math.min(2, pool);
  if (!key.endsWith(':rival')) return 1;
  const { order } = content.regionById.get(key.split(':')[0]);
  return Math.min(order <= 3 ? 2 : 3, Math.max(1, Math.floor(pool / 2)));
}

const passageRegion = (content, passageId) => content.quests.find(quest => quest.stages.some(stage => stage.kind === 'reading' && stage.targetIds.includes(passageId)))?.regionId;

// Every gate entry point checks this, and storage applies it again to a pending attempt at import.
export function gateReady(state, content, key, wordId) {
  const no = reason => ({ ok: false, reason });
  if (isDone(state, key)) return no('already finished');
  if (key.startsWith('read:')) {
    const passageId = key.slice(5);
    const passage = content.passageById.get(passageId);
    if (!passage) return no('nothing to read');
    if (!passage.requires.every(skill => state.skills[skill])) return no('this text needs a lesson you haven\'t had yet');
    const regionId = passageRegion(content, passageId);
    if (!regionId) return { ok: true };
    if (!regionUnlocked(state, content, regionId)) return no('this region is still sealed');
    const blocked = stageBlocking(state, content, regionId, passageId);
    return blocked ? no(blocked.text) : { ok: true };
  }
  const [regionId, group] = key.split(':');
  if (!regionUnlocked(state, content, regionId)) return no('this region is still sealed');
  if (group === 'ward') {
    if (!isDone(state, `${regionId}:gate`)) return no('it won\'t answer until this region\'s gate is open');
    if (wordId === undefined) return { ok: true };
    const ability = OBJECTS.find(o => o.key === key)?.ability;
    return wardCandidates(state, content, ability).includes(wordId) ? { ok: true } : no('that word can\'t answer this seal');
  }
  if (!gatePool(content, key).length) return no('nothing is asked here');
  const blocked = stageBlocking(state, content, regionId, key);
  if (blocked) return no(blocked.text);
  if (group === 'gate' && !isDone(state, `${regionId}:rival`)) return no('Neri is still in the way');
  const first = content.regionById.get(regionId).lessonIds[0];
  return state.lessons[first] ? { ok: true } : no('learn from this region\'s mentor first');
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

function talkToMentor(state, content, object) {
  const region = content.regionById.get(object.regionId);
  const lesson = nextLesson(state, content, region.id);
  if (lesson) return {
    lines: [state.lessons[region.lessonIds[0]] ? 'You came back at the right time. There\'s more I can show you.' : `Welcome to ${region.title}. ${region.theme} Sit down and I\'ll show you what you need here.`],
    then: { type: 'lesson', id: lesson },
  };
  const stage = currentStage(state, content, region.questId);
  return { lines: [stage ? `Keep going. ${stage.text}` : `You have done what ${region.title} asked of you. The road on is open.`] };
}

function talkToRival(state, content, object) {
  const key = `${object.regionId}:rival`;
  if (isDone(state, key)) return { lines: ['All right, you got past me again. I\'ll be further up the road, and I\'ll be ready next time.'] };
  const ready = gateReady(state, content, key);
  const title = content.regionById.get(object.regionId).title;
  if (!ready.ok) return { lines: [`You again. Nobody gets through ${title} on my watch without proving they belong. First: ${ready.reason}`] };
  const need = gateRequired(content, key);
  return { lines: [`You made it to ${title}. Good. Beat me here and I\'ll step aside. I want ${need} clean ${need === 1 ? 'answer' : 'answers'}, no hints. Miss one and I\'ll explain, because I want a real duel.`], then: { type: 'gate', key } };
}

function talkToKeeper(state, content, object) {
  const region = content.regionById.get(object.regionId);
  if (state.badges[region.badge.id]) return { lines: [`The ${region.badge.title} is yours. The road out of ${region.title} will open for it.`] };
  const missing = missingForBadge(state, content, region.id);
  if (missing.length) return { lines: [`I keep the ${region.badge.title}. You still need: ${missing.join(', ')}.`] };
  return {
    lines: [`My trial uses examples you haven't met here, because a reader has to handle new text. ${region.badge.requiredCorrect} clean answers, in every kind I test, earn the ${region.badge.title}. Miss one and I'll explain, then give you another.`],
    then: { type: 'badge', regionId: region.id },
  };
}

function talkToGardener(state) {
  const due = dueWords(state, state.updatedAt).length;
  return {
    lines: [due ? `The archive is whole, and the words still need tending. ${due} ${due === 1 ? 'word is' : 'words are'} ready for review. The beds will bring them to you.` : 'The archive is whole, and the words still need tending. Nothing is due right now, so walk the beds and practice whatever you like.'],
  };
}

const NPC_SCRIPTS = { tamar: talkToTamar, neri: talkToNeri, ilana: talkToIlana, mentor: talkToMentor, rival: talkToRival, keeper: talkToKeeper, gardener: talkToGardener };

const speakerFor = (object, content) => (object.role === 'mentor' ? content.lessonById.get(content.regionById.get(object.regionId).lessonIds[0])?.mentor ?? object.name : object.name);

function lockScript(state, content, object) {
  const ready = gateReady(state, content, object.key);
  if (!ready.ok) return { lines: [`It doesn't answer yet. ${ready.reason}`] };
  return { lines: ['Words are cut into it, and it wants an answer.'], then: { type: 'gate', key: object.key } };
}

function lecternScript(state, content, object) {
  const quest = content.questById.get(content.regionById.get(object.regionId).questId);
  const unread = quest.stages.filter(stage => stage.kind === 'reading').flatMap(stage => stage.targetIds).find(id => !isDone(state, `read:${id}`));
  if (!unread) return { lines: ['The pages here are ones you have already read. They will keep.'] };
  const ready = gateReady(state, content, `read:${unread}`);
  if (!ready.ok) return { lines: [`The page won't make sense yet. ${ready.reason}`] };
  return { lines: ['A page lies open on the stand.'], then: { type: 'reading', passageId: unread } };
}

function shrineScript(state, content, object) {
  const pools = content.regionById.get(object.regionId).puzzleQuestionIds;
  const group = Object.keys(pools).filter(name => name !== 'neri' && name !== 'gate').find(name => !isDone(state, `${object.regionId}:${name}`));
  if (!group) return { lines: ['An old shrine, swept clean. Nothing is asked of you here.'] };
  const key = `${object.regionId}:${group}`;
  const ready = gateReady(state, content, key);
  if (!ready.ok) return { lines: [`The carving is still beyond you. ${ready.reason}`] };
  return { lines: ['There is a carving here, asking something of whoever stops.'], then: { type: 'gate', key } };
}

function wardScript(state, content, object) {
  const ready = gateReady(state, content, object.key);
  if (!ready.ok) return { lines: [`The seal is quiet. ${ready.reason}`] };
  const label = { name: 'names a thing', deed: 'does something', link: 'joins things up' }[object.ability];
  return { lines: [`The seal wants a word from your party that ${label}, and one you know well. Practice a word in new ways and it grows strong enough.`], then: { type: 'ward', key: object.key, ability: object.ability } };
}

function secretScript(state, content, object) {
  if (!isDone(state, `${object.regionId}:ward`)) return { lines: ['A hidden cache, closed with the same mark as the seal nearby. Open the seal first.'] };
  return { lines: object.lines, then: { type: 'secret', key: object.key } };
}

function restoreScript(state, content) {
  if (state.endingAt != null) return { lines: ['The desk is quiet now. Every scroll is home.'] };
  const missing = content.regions.filter(region => !state.badges[region.badge.id]).map(region => region.badge.title);
  if (!campaignComplete(content) || missing.length) return { lines: [`The desk waits for every seal. Still missing: ${missing.join(', ') || 'regions not yet restored'}.`] };
  const open = activeRegion(state, content);
  if (open) return { lines: [`The desk isn't ready. There is still this to do: ${currentStage(state, content, open.questId).text}`] };
  return { lines: ['You lay the last scroll on the desk. Around you the shelves are full for the first time since the storm.'], then: { type: 'ending' } };
}

const OBJECT_SCRIPTS = { lock: lockScript, lectern: lecternScript, shrine: shrineScript, ward: wardScript, secret: secretScript, restore: restoreScript };

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
  if (object.kind === 'npc') return { kind: 'dialogue', speaker: speakerFor(object, content), ...NPC_SCRIPTS[object.role](state, content, object) };
  if (object.kind === 'sign' || object.kind === 'folk') return { kind: 'dialogue', speaker: object.name, lines: object.lines };
  if (object.kind === 'riddle') return { kind: 'riddle' };
  if (OBJECT_SCRIPTS[object.kind]) return { kind: 'dialogue', speaker: object.name, ...OBJECT_SCRIPTS[object.kind](state, content, object) };
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
