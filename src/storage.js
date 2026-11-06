// Save slots and import/export. All incoming data is rebuilt from a strict schema, so an
// accepted state holds only known fields and ids. A failed parse never touches the live game.
import { MAPS, DOORS, OBJECTS } from './world.js';
import { destination, capturedIn, isDone, regionUnlocked, stageBlocking, gatePool, gateRequired, gateReady, missingForBadge } from './engine.js';
import { CAPTURE_FAMILIES, wordCapturable, abilityOf } from './learning.js';
import { trialComplete } from './checkpoints.js';

export const SLOTS = [1, 2, 3];
export const MAX_SAVE_BYTES = 2 * 1024 * 1024;
// Slots keep their original key names, so an older build sees a newer save as unreadable and leaves it alone.
const NAMESPACE = 'alephQuest:v1';
const FORMAT = 'alephQuest';
const VERSION = 2;
const MAX_TIME = 8.64e15;
const MAX_COUNT = 1e9;
const KNOWN_FLAGS = new Set(['seedDone', 'neriCleared', 'gateOpen', 'fragmentFound', 'exitOpened']);
const HISTORY_LIMIT = 60;
const FIXED_GROUPS = new Set(['rival', 'gate', 'exit', 'ward', 'secret']);

export const slotKey = slot => `${NAMESPACE}:slot:${slot}`;
export const lastSlotKey = `${NAMESPACE}:lastSlot`;

// Schema primitives. Each returns the accepted value, or records an error at its path.
const fail = (errors, path, why) => { errors.push(`${path}: ${why}`); return undefined; };
const int = (min, max) => (v, path, errors) => (Number.isInteger(v) && v >= min && v <= max) ? v : fail(errors, path, `must be a whole number from ${min} to ${max}`);
const time = int(0, MAX_TIME);
const count = int(0, MAX_COUNT);
const bool = (v, path, errors) => typeof v === 'boolean' ? v : fail(errors, path, 'must be true or false');
const oneOf = (...allowed) => (v, path, errors) => allowed.includes(v) ? v : fail(errors, path, 'is not an allowed value');
const known = has => (v, path, errors) => (typeof v === 'string' && has(v)) ? v : fail(errors, path, `unknown id ${String(v).slice(0, 40)}`);
const nullable = check => (v, path, errors) => v === null ? null : check(v, path, errors);
const optional = check => Object.assign((v, path, errors) => check(v, path, errors), { optional: true });
const isPlain = v => typeof v === 'object' && v !== null && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;

const list = (check, max) => (v, path, errors) => {
  if (!Array.isArray(v)) return fail(errors, path, 'must be a list');
  if (v.length > max) return fail(errors, path, `has more than ${max} items`);
  return v.map((item, i) => check(item, `${path}[${i}]`, errors));
};

const shape = spec => (v, path, errors) => {
  if (!isPlain(v)) return fail(errors, path, 'must be an object');
  for (const key of Object.keys(v)) if (!Object.hasOwn(spec, key)) fail(errors, `${path}.${key}`, 'unknown field');
  const out = {};
  for (const [key, check] of Object.entries(spec)) {
    if (!Object.hasOwn(v, key)) {
      if (!check.optional) fail(errors, `${path}.${key}`, 'is missing');
      continue;
    }
    out[key] = check(v[key], `${path}.${key}`, errors);
  }
  return out;
};

const mapOf = (hasKey, check, max = 2000) => (v, path, errors) => {
  if (!isPlain(v)) return fail(errors, path, 'must be an object');
  const keys = Object.keys(v);
  if (keys.length > max) return fail(errors, path, `has more than ${max} entries`);
  const out = {};
  for (const key of keys) {
    if (hasKey(key)) out[key] = check(v[key], `${path}.${key}`, errors);
    else fail(errors, `${path}.${key}`, 'unknown id');
  }
  return out;
};

// Autosave validates on every step, so these lookups must stay cheap at 150 words and 900 questions.
const lookups = new WeakMap();
function idsOf(content) {
  if (!lookups.has(content)) {
    const set = pick => new Set(content.questions.map(pick));
    lookups.set(content, {
      stems: set(q => q.semanticStemId), contexts: set(q => q.contextId), templates: set(q => q.templateId), families: set(q => q.taskFamily),
      skills: new Set(content.lessons.flatMap(l => l.teaches)), badges: new Set(content.regions.map(r => r.badge.id)),
      forms: new Set(content.words.flatMap(w => w.relatedForms.map(form => form.tokenId))),
    });
  }
  return lookups.get(content);
}

// r1 still uses its named flags. Every later action has one record, keyed rN:<action> or read:<passage>.
function isGateKey(content, key) {
  if (key.startsWith('read:')) return content.passageById.has(key.slice(5));
  const [regionId, group, extra] = key.split(':');
  if (extra !== undefined || !group || regionId === 'r1') return false;
  const pools = content.regionById.get(regionId)?.puzzleQuestionIds;
  return !!pools && group !== 'neri' && (FIXED_GROUPS.has(group) || Object.hasOwn(pools, group));
}

function stateSchema(content) {
  const ids = idsOf(content);
  const isWord = id => content.wordById.has(id);
  const isQuestion = id => content.questionById.has(id);
  const isStem = id => ids.stems.has(id);
  const isLesson = id => content.lessonById.has(id);
  const isSkill = id => ids.skills.has(id);
  const isBadge = id => ids.badges.has(id);
  const isContext = id => ids.contexts.has(id);
  const isTemplate = id => ids.templates.has(id);
  const isFamily = id => ids.families.has(id);
  const isForm = id => ids.forms.has(id);
  const isGate = key => isGateKey(content, key);
  const responseMode = oneOf('typing', 'recognition');
  const stem = known(isStem), family = known(isFamily);

  const evidence = shape({ at: time, taskFamily: family, contextId: known(isContext), templateId: known(isTemplate), semanticStemId: stem, responseMode });
  const record = shape({
    seenAt: nullable(time), studiedAt: nullable(time), capturedAt: nullable(time), masteredAt: nullable(time),
    stage: int(0, 5), dueAt: nullable(time), lastReviewAt: nullable(time),
    lastReview: nullable(shape({ family, contextId: known(isContext) })),
    reviewDays: list(int(0, MAX_TIME), 1000), reviewOutcomes: list(int(0, 1), 5), reviewTotal: count,
    evidence: list(evidence, 1000),
    firstAttempts: count, firstCorrect: count, hints: count,
    captureSteps: list(shape({ family, templateId: known(isTemplate), semanticStemId: stem, contextId: known(isContext), responseMode, at: time }), 3),
    retired: mapOf(isStem, shape({ at: count, encounter: count })),
    recentStems: list(stem, 6),
    questionUse: mapOf(isQuestion, count),
    history: list(shape({
      at: time, type: oneOf('seen', 'studied', 'captured', 'answer', 'review', 'form'),
      questionId: optional(known(isQuestion)), correct: optional(bool), independent: optional(bool),
      responseMode: optional(responseMode), kind: optional(oneOf('capture', 'review', 'practice')),
    }), HISTORY_LIMIT),
    xp: count, favorite: bool,
    xpStems: list(stem, 2000), formsKnown: list(known(isForm), 200), formRetired: mapOf(isForm, count, 200),
  });
  const current = shape({ questionId: known(isQuestion), stemId: stem, family, startedAt: time, hintsUsed: count, assisted: bool, responseMode });
  const flags = (v, path, errors) => {
    if (!isPlain(v)) return fail(errors, path, 'must be an object');
    const out = {};
    for (const key of Object.keys(v)) {
      if (key === 'doorOpen') out.doorOpen = oneOf(...Object.values(DOORS))(v[key], `${path}.doorOpen`, errors);
      else if (KNOWN_FLAGS.has(key)) out[key] = oneOf(true)(v[key], `${path}.${key}`, errors);
      else fail(errors, `${path}.${key}`, 'unknown flag');
    }
    return out;
  };

  return shape({
    version: oneOf(VERSION), createdAt: time, updatedAt: time,
    map: known(id => Object.hasOwn(MAPS, id)), x: int(0, 1000), y: int(0, 1000), dir: oneOf('up', 'down', 'left', 'right'), steps: count,
    rng: int(-2147483648, 2147483647), interactions: count, encounterCounter: count, reedCooldown: int(0, 100),
    skills: mapOf(isSkill, time), lessons: mapOf(isLesson, time), flags,
    words: mapOf(isWord, record), party: list(known(isWord), 6),
    badges: mapOf(isBadge, shape({ at: time, questionIds: list(known(isQuestion), 50) })),
    settings: shape({ sound: bool, calm: bool, responseMode, sacredName: oneOf('written', 'substitute') }),
    encounter: nullable(shape({ id: count, wordId: known(isWord), kind: oneOf('capture', 'review', 'practice'), assistedNext: bool, current: nullable(current) })),
    badgeRun: nullable(shape({
      id: count, regionId: known(id => content.regionById.has(id)), correct: list(known(isQuestion), 50),
      current: nullable(shape({ questionId: known(isQuestion), hintsUsed: count, startedAt: time, responseMode })),
    })),
    retiredCheckpoints: mapOf(isQuestion, shape({ at: count, run: count })),
    puzzleIndex: shape({ neri: count, gate: count }),
    gates: mapOf(isGate, shape({ at: time, questionIds: list(known(isQuestion), 50), wordId: optional(known(isWord)) })),
    gateCredit: mapOf(isGate, list(known(isQuestion), 50)),
    attempt: nullable(shape({ key: known(isGate), questionId: known(isQuestion), hintsUsed: count, startedAt: time, responseMode, wordId: optional(known(isWord)), stemId: optional(stem) })),
    endingAt: nullable(time),
  });
}

// Each demonstration must describe a real question of this word, and a capture needs all three.
function checkCaptureEvidence(id, record, content, errors) {
  const path = `words.${id}`;
  const stemQuestion = stem => content.questionByStem.get(stem);
  const steps = record.captureSteps;
  for (const step of steps) {
    const q = stemQuestion(step.semanticStemId);
    if (q.wordId !== id || q.taskFamily !== step.family || q.templateId !== step.templateId || q.contextId !== step.contextId) {
      errors.push(`${path}.captureSteps: ${step.semanticStemId} doesn't match its question`);
    }
  }
  for (const key of ['family', 'templateId', 'semanticStemId']) {
    if (new Set(steps.map(step => step[key])).size !== steps.length) errors.push(`${path}.captureSteps: repeats a ${key}`);
  }
  const complete = CAPTURE_FAMILIES.every(family => steps.some(step => step.family === family));
  if (complete !== (record.capturedAt != null)) errors.push(`${path}.captureSteps: must be complete exactly when the word is captured`);
  if (steps.length && (record.seenAt == null || record.studiedAt == null)) errors.push(`${path}.studiedAt: demonstrations need a study record`);
  for (const e of record.evidence) {
    const q = stemQuestion(e.semanticStemId);
    if (q.wordId !== id || q.taskFamily !== e.taskFamily || q.templateId !== e.templateId || q.contextId !== e.contextId) {
      errors.push(`${path}.evidence: ${e.semanticStemId} doesn't match its question`);
    }
  }
  for (const stem of record.xpStems) if (stemQuestion(stem).wordId !== id) errors.push(`${path}.xpStems: ${stem} belongs to another word`);
  if (new Set(record.xpStems).size !== record.xpStems.length) errors.push(`${path}.xpStems: repeats a stem`);
  if (record.xp < record.xpStems.length) errors.push(`${path}.xp: less than its varied uses`);
  const forms = content.wordById.get(id).relatedForms.map(form => form.tokenId);
  for (const token of [...record.formsKnown, ...Object.keys(record.formRetired)]) if (!forms.includes(token)) errors.push(`${path}.formsKnown: ${token} is not a form of this word`);
  if (record.formsKnown.length && record.capturedAt == null) errors.push(`${path}.formsKnown: needs a captured word`);
}

// A saved attempt must match the question it names, in a mode that question really offers.
function checkPendingMode(owner, question, responseMode, errors) {
  if (responseMode === 'typing' && question.format !== 'type' && question.format !== 'match') errors.push(`${owner}: typing is only for type questions`);
  if (responseMode === 'recognition' && question.format === 'match' && !question.recognitionChoices) errors.push(`${owner}: this match has no choice list`);
}

function checkEncounter(state, content, errors) {
  const encounter = state.encounter;
  if (!encounter) return;
  const record = state.words[encounter.wordId];
  if (!record) { errors.push('encounter: word has no record'); return; }
  if ((encounter.kind === 'capture') !== (record.capturedAt == null)) errors.push(`encounter: a ${encounter.kind} encounter doesn't fit this word's capture status`);
  if (encounter.kind === 'capture' && !wordCapturable(state, content, encounter.wordId)) errors.push('encounter: this word needs a lesson the player hasn\'t had');
  const { current } = encounter;
  if (!current) return;
  const question = content.questionById.get(current.questionId);
  if (question.wordId !== encounter.wordId) errors.push('encounter: question belongs to another word');
  if (question.semanticStemId !== current.stemId) errors.push('encounter: stem doesn\'t match the question');
  if (question.taskFamily !== current.family) errors.push('encounter: family doesn\'t match the question');
  if (!question.requires.every(skill => state.skills[skill])) errors.push('encounter: question needs an untaught skill');
  if (encounter.kind === 'capture' && record.captureSteps.some(step => step.family === current.family)) errors.push('encounter: this family is already shown');
  checkPendingMode('encounter', question, current.responseMode, errors);
}

const passageRegionId = (content, passageId) => content.quests.find(quest => quest.stages.some(stage => stage.kind === 'reading' && stage.targetIds.includes(passageId)))?.regionId;

// A finished action must have been possible: its region open, what comes before it done, and real answers behind it.
function checkGateRecord(state, content, key, record, errors) {
  const path = `gates.${key}`;
  const hasSkills = id => content.questionById.get(id).requires.every(skill => state.skills[skill]);
  const answers = () => {
    const pool = gatePool(content, key);
    if (new Set(record.questionIds).size !== record.questionIds.length) errors.push(`${path}: credits a question twice`);
    if (record.questionIds.some(id => !pool.includes(id))) errors.push(`${path}: lists a question outside this pool`);
    if (record.questionIds.length < gateRequired(content, key)) errors.push(`${path}: too few answers`);
    if (!record.questionIds.every(hasSkills)) errors.push(`${path}: answered a question with an untaught skill`);
  };
  if (key.startsWith('read:')) {
    const passageId = key.slice(5);
    const regionId = passageRegionId(content, passageId);
    if (regionId && (!regionUnlocked(state, content, regionId) || stageBlocking(state, content, regionId, passageId))) errors.push(`${path}: reached before its quest allows`);
    if (!content.passageById.get(passageId).requires.every(skill => state.skills[skill])) errors.push(`${path}: needs an untaught skill`);
    return answers();
  }
  const [regionId, group] = key.split(':');
  const region = content.regionById.get(regionId);
  if (!regionUnlocked(state, content, regionId)) errors.push(`${path}: this region is still sealed`);
  if (group === 'exit' || group === 'secret') {
    if (record.questionIds.length) errors.push(`${path}: takes no answers`);
    if (group === 'exit' && !state.badges[region.badge.id]) errors.push(`${path}: needs the region badge`);
    if (group === 'secret' && !isDone(state, `${regionId}:ward`)) errors.push(`${path}: needs the ward`);
    return undefined;
  }
  if (group === 'ward') {
    const word = record.wordId && content.wordById.get(record.wordId);
    const ability = OBJECTS.find(o => o.key === key)?.ability;
    if (!isDone(state, `${regionId}:gate`)) errors.push(`${path}: needs the region gate`);
    if (!word || state.words[record.wordId]?.capturedAt == null || abilityOf(word) !== ability) errors.push(`${path}: needs a captured word of the right kind`);
    if (record.questionIds.length !== 1 || content.questionById.get(record.questionIds[0]).wordId !== record.wordId || !hasSkills(record.questionIds[0])) errors.push(`${path}: needs one real answer about that word`);
    return undefined;
  }
  if (stageBlocking(state, content, regionId, key)) errors.push(`${path}: reached before its quest allows`);
  if (group === 'gate' && !isDone(state, `${regionId}:rival`)) errors.push(`${path}: needs the rival first`);
  return answers();
}

function checkAttempt(state, content, errors) {
  const { attempt } = state;
  for (const [key, credit] of Object.entries(state.gateCredit)) {
    const pool = gatePool(content, key);
    if (isDone(state, key)) errors.push(`gateCredit.${key}: already finished`);
    if (new Set(credit).size !== credit.length || !credit.every(id => pool.includes(id))) errors.push(`gateCredit.${key}: lists a bad question`);
    if (credit.length >= gateRequired(content, key)) errors.push(`gateCredit.${key}: these answers would already have finished it`);
  }
  if (!attempt) return;
  const question = content.questionById.get(attempt.questionId);
  if (!attempt.key.endsWith(':ward') && (attempt.wordId !== undefined || attempt.stemId !== undefined)) errors.push('attempt: only a ward names a word');
  const ready = gateReady(state, content, attempt.key, attempt.wordId);
  if (!ready.ok) errors.push(`attempt: ${ready.reason}`);
  if (attempt.key.endsWith(':ward')) {
    if (attempt.wordId === undefined || question.wordId !== attempt.wordId || question.semanticStemId !== attempt.stemId) errors.push('attempt: the question doesn\'t fit the word');
  } else if (!gatePool(content, attempt.key).includes(attempt.questionId)) errors.push('attempt: lists a question outside this pool');
  if (!question.requires.every(skill => state.skills[skill])) errors.push('attempt: question needs an untaught skill');
  if ((state.gateCredit[attempt.key] ?? []).includes(attempt.questionId)) errors.push('attempt: pending question is already credited');
  checkPendingMode('attempt', question, attempt.responseMode, errors);
}

// A player can only stand where they could have walked: past each earlier region's open exit.
function checkPosition(state, content, errors) {
  const place = MAPS[state.map];
  const { regionId } = place;
  if (regionId === null) {
    if (state.endingAt == null) errors.push('position: the Review Garden opens after the ending');
  } else if (!regionUnlocked(state, content, regionId)) {
    errors.push(`position: ${regionId} is still sealed`);
  } else {
    const at = content.regions.findIndex(region => region.id === regionId);
    const before = content.regions[at - 1];
    if (before && !isDone(state, before.id === 'r1' ? 'exitOpened' : `${before.id}:exit`)) errors.push(`position: the road out of ${before.id} is not open`);
    if (state.map === 'archive' && !isDone(state, `${regionId}:exit`)) errors.push('position: the archive road is not open');
  }
  if (!destination(state, state.map, state.x, state.y)) errors.push('position: player is not on a walkable tile');
}

// Rules a schema can't express: facts in one part of the save must agree with the others.
function checkConsistency(state, content, errors) {
  const seen = new Set(state.party);
  if (seen.size !== state.party.length) errors.push('party: lists a word twice');
  for (const id of state.party) if (state.words[id]?.capturedAt == null) errors.push(`party: ${id} is not captured`);

  for (const [id, record] of Object.entries(state.words)) {
    if (record.capturedAt != null && record.dueAt == null) errors.push(`words.${id}.dueAt: captured words need a next review`);
    if (record.capturedAt != null && !content.wordById.get(id).requires.every(skill => state.skills[skill])) errors.push(`words.${id}: captured without its skills`);
    checkCaptureEvidence(id, record, content, errors);
  }
  for (const skill of Object.keys(state.skills)) {
    const taught = content.lessons.some(l => l.teaches.includes(skill) && state.lessons[l.id]);
    if (!taught) errors.push(`skills.${skill}: no finished lesson teaches it`);
  }

  for (const region of content.regions) {
    const earned = state.badges[region.badge.id];
    if (!earned) continue;
    const { badge } = region;
    const allowed = earned.questionIds.every(id => badge.questionIds.includes(id));
    if (!allowed) errors.push(`badges.${badge.id}: lists a question outside this badge`);
    if (new Set(earned.questionIds).size !== earned.questionIds.length) errors.push(`badges.${badge.id}: credits a question twice`);
    if (new Set(earned.questionIds).size < badge.requiredCorrect) errors.push(`badges.${badge.id}: too few answers`);
    const families = new Set(earned.questionIds.map(id => content.questionById.get(id).taskFamily));
    for (const family of badge.requiredTaskFamilies) if (!families.has(family)) errors.push(`badges.${badge.id}: needs a ${family} answer`);
    if (!badge.requiresSkills.every(skill => state.skills[skill])) errors.push(`badges.${badge.id}: skills are missing`);
    if (capturedIn(state, content, region.id) < badge.requiresCaptures) errors.push(`badges.${badge.id}: too few captures`);
    if (!region.requiresBadges.every(id => state.badges[id])) errors.push(`badges.${badge.id}: earlier badge missing`);
  }

  const { flags } = state;
  if (flags.exitOpened && !state.badges['b-reed-seal']) errors.push('flags.exitOpened: needs the Reed Seal');
  if (!!flags.gateOpen !== !!flags.doorOpen) errors.push('flags: gateOpen and doorOpen must agree');
  if (flags.gateOpen && !flags.neriCleared) errors.push('flags.gateOpen: needs neriCleared');

  for (const [key, record] of Object.entries(state.gates)) checkGateRecord(state, content, key, record, errors);
  checkAttempt(state, content, errors);
  if (state.endingAt != null) {
    const last = content.regions.at(-1);
    if (content.regions.length < 8 || !content.regions.every(region => state.badges[region.badge.id]) || !isDone(state, `${last.id}:exit`)) errors.push('endingAt: the archive isn\'t ready to be restored');
  }

  checkPosition(state, content, errors);

  checkEncounter(state, content, errors);
  if (state.badgeRun) {
    const region = content.regionById.get(state.badgeRun.regionId);
    const { badge } = region;
    const ids = [...state.badgeRun.correct, ...(state.badgeRun.current ? [state.badgeRun.current.questionId] : [])];
    if (!ids.every(id => badge.questionIds.includes(id))) errors.push('badgeRun: lists a question outside this badge');
    const { correct, current } = state.badgeRun;
    if (new Set(correct).size !== correct.length) errors.push('badgeRun: credits a question twice');
    if (trialComplete(badge, correct, content)) errors.push('badgeRun: these answers complete the trial, so it can\'t still be open');
    if (current && correct.includes(current.questionId)) errors.push('badgeRun: pending question is already credited');
    if (current) checkPendingMode('badgeRun', content.questionById.get(current.questionId), current.responseMode, errors);
    // Only a qualified player can have opened a trial, and these stay true once met, so this closes every resume path.
    if (state.badges[badge.id]) errors.push('badgeRun: this badge is already earned');
    if (!regionUnlocked(state, content, region.id)) errors.push('badgeRun: this region is still sealed');
    if (missingForBadge(state, content, region.id).length) errors.push('badgeRun: its prerequisites are not met');
    if (!ids.every(id => content.questionById.get(id).requires.every(skill => state.skills[skill]))) errors.push('badgeRun: question needs an untaught skill');
  }
}

export function validateState(raw, content) {
  const errors = [];
  const state = stateSchema(content)(raw, 'state', errors);
  if (errors.length) return { ok: false, errors };
  checkConsistency(state, content, errors);
  return errors.length ? { ok: false, errors } : { ok: true, state };
}

const V2_STATE_FIELDS = ['gates', 'gateCredit', 'attempt', 'endingAt'];
const V2_RECORD_FIELDS = ['xpStems', 'formsKnown', 'formRetired'];

// Version 1 is the accepted opening's format. It has no later regions, so the new fields start empty and
// everything it did hold passes the same validation. A v1 document holding v2 fields is not one we wrote.
function migrateV1(state) {
  if (!isPlain(state)) return { errors: ['state: must be an object'] };
  if (state.version !== 1) return { errors: [`state.version: version ${String(state.version).slice(0, 12)} doesn't match a version 1 save`] };
  const smuggled = V2_STATE_FIELDS.filter(field => Object.hasOwn(state, field));
  const words = isPlain(state.words) ? state.words : {};
  for (const [id, record] of Object.entries(words)) {
    if (isPlain(record)) for (const field of V2_RECORD_FIELDS) if (Object.hasOwn(record, field)) smuggled.push(`words.${id}.${field}`);
  }
  if (smuggled.length) return { errors: smuggled.map(field => `state.${field}: unknown field in a version 1 save`) };
  return {
    state: {
      ...state,
      version: VERSION,
      settings: isPlain(state.settings) ? { ...state.settings, sacredName: 'written' } : state.settings,
      words: isPlain(state.words)
        ? Object.fromEntries(Object.entries(state.words).map(([id, record]) => [id, isPlain(record) ? { ...record, xpStems: [], formsKnown: [], formRetired: {} } : record]))
        : state.words,
      gates: {}, gateCredit: {}, attempt: null, endingAt: null,
    },
  };
}

export function parseImport(text, content) {
  if (typeof text !== 'string' || text.length > MAX_SAVE_BYTES) return { ok: false, errors: ['This file is too large to be a save.'] };
  let doc;
  try { doc = JSON.parse(text); } catch { return { ok: false, errors: ['This file is not valid JSON.'] }; }
  if (!isPlain(doc)) return { ok: false, errors: ['This file is not an Aleph Quest save.'] };
  if (doc.format !== FORMAT) return { ok: false, errors: ['This file has the wrong format.'] };
  if (doc.version !== VERSION && doc.version !== 1) return { ok: false, errors: [`This save is version ${String(doc.version).slice(0, 12)}. This game reads versions 1 and ${VERSION}.`] };
  for (const key of Object.keys(doc)) if (!['format', 'version', 'exportedAt', 'state'].includes(key)) return { ok: false, errors: [`Unknown field ${key.slice(0, 40)}`] };
  if (doc.version === VERSION) return validateState(doc.state, content);
  const migrated = migrateV1(doc.state);
  return migrated.errors ? { ok: false, errors: migrated.errors } : validateState(migrated.state, content);
}

export const exportText = (state, now) => JSON.stringify({ format: FORMAT, version: VERSION, exportedAt: now, state });

export function loadSlot(backend, slot, content) {
  if (!backend) return { status: 'unavailable' };
  let text;
  try { text = backend.getItem(slotKey(slot)); } catch { return { status: 'unavailable' }; }
  if (text === null) return { status: 'empty' };
  const result = parseImport(text, content);
  return result.ok ? { status: 'ok', state: result.state } : { status: 'corrupt', errors: result.errors };
}

// Never replace a slot with something the game itself would later refuse to read.
export function saveSlot(backend, slot, state, content, { replaceUnreadable = false } = {}) {
  if (!backend) return { ok: false, reason: 'unavailable' };
  try {
    const text = exportText(state, state.updatedAt);
    if (text.length > MAX_SAVE_BYTES) return { ok: false, reason: 'too-large' };
    if (!validateState(JSON.parse(text).state, content).ok) return { ok: false, reason: 'invalid' };
    if (!replaceUnreadable && loadSlot(backend, slot, content).status === 'corrupt') return { ok: false, reason: 'unreadable' };
    backend.setItem(slotKey(slot), text);
    return { ok: true };
  } catch {
    return { ok: false, reason: 'write-failed' };
  }
}

export function deleteSlot(backend, slot) {
  try { backend?.removeItem(slotKey(slot)); return true; } catch { return false; }
}

export const listSlots = (backend, content) => SLOTS.map(slot => ({ slot, ...loadSlot(backend, slot, content) }));

// Touching window.localStorage can itself throw when storage is blocked.
export function browserStorage(getter = () => globalThis.localStorage) {
  try {
    const store = getter();
    return store ?? null;
  } catch {
    return null;
  }
}
