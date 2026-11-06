// Save slots and import/export. All incoming data is rebuilt from a strict schema, so an
// accepted state holds only known fields and ids. A failed parse never touches the live game.
import { MAPS, DOORS } from './world.js';
import { destination, capturedCount } from './engine.js';
import { CAPTURE_FAMILIES } from './learning.js';

export const SLOTS = [1, 2, 3];
export const MAX_SAVE_BYTES = 512 * 1024;
const NAMESPACE = 'alephQuest:v1';
const FORMAT = 'alephQuest';
const VERSION = 1;
const MAX_TIME = 8.64e15;
const MAX_COUNT = 1e9;
const KNOWN_FLAGS = new Set(['seedDone', 'neriCleared', 'gateOpen', 'fragmentFound', 'exitOpened']);
const HISTORY_LIMIT = 60;

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

function stateSchema(content) {
  const isWord = id => content.wordById.has(id);
  const isQuestion = id => content.questionById.has(id);
  const isStem = id => content.questions.some(q => q.semanticStemId === id);
  const isLesson = id => content.lessonById.has(id);
  const isSkill = id => content.lessons.some(l => l.teaches.includes(id));
  const isBadge = id => content.regions.some(r => r.badge.id === id);
  const isContext = id => content.questions.some(q => q.contextId === id);
  const isTemplate = id => content.questions.some(q => q.templateId === id);
  const isFamily = id => content.questions.some(q => q.taskFamily === id);
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
      at: time, type: oneOf('seen', 'studied', 'captured', 'answer', 'review'),
      questionId: optional(known(isQuestion)), correct: optional(bool), independent: optional(bool),
      responseMode: optional(responseMode), kind: optional(oneOf('capture', 'review', 'practice')),
    }), HISTORY_LIMIT),
    xp: count, favorite: bool,
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
    settings: shape({ sound: bool, calm: bool, responseMode }),
    encounter: nullable(shape({ id: count, wordId: known(isWord), kind: oneOf('capture', 'review', 'practice'), assistedNext: bool, current: nullable(current) })),
    badgeRun: nullable(shape({
      id: count, regionId: known(id => content.regionById.has(id)), correct: list(known(isQuestion), 50),
      current: nullable(shape({ questionId: known(isQuestion), hintsUsed: count, startedAt: time, responseMode })),
    })),
    retiredCheckpoints: mapOf(isQuestion, shape({ at: count, run: count })),
    puzzleIndex: shape({ neri: count, gate: count }),
  });
}

// Each demonstration must describe a real question of this word, and a capture needs all three.
function checkCaptureEvidence(id, record, content, errors) {
  const path = `words.${id}`;
  const stemQuestion = stem => content.questions.find(q => q.semanticStemId === stem);
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
}

// A saved attempt must match the question it names. Only type questions are answered by typing.
function checkPendingMode(owner, question, responseMode, errors) {
  if (responseMode === 'typing' && question.format !== 'type') errors.push(`${owner}: typing is only for type questions`);
}

function checkEncounter(state, content, errors) {
  const encounter = state.encounter;
  if (!encounter) return;
  const record = state.words[encounter.wordId];
  if (!record) { errors.push('encounter: word has no record'); return; }
  if ((encounter.kind === 'capture') !== (record.capturedAt == null)) errors.push(`encounter: a ${encounter.kind} encounter doesn't fit this word's capture status`);
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
    if (new Set(earned.questionIds).size < badge.requiredCorrect) errors.push(`badges.${badge.id}: too few answers`);
    const families = new Set(earned.questionIds.map(id => content.questionById.get(id).taskFamily));
    for (const family of badge.requiredTaskFamilies) if (!families.has(family)) errors.push(`badges.${badge.id}: needs a ${family} answer`);
    if (!badge.requiresSkills.every(skill => state.skills[skill])) errors.push(`badges.${badge.id}: skills are missing`);
    if (capturedCount(state) < badge.requiresCaptures) errors.push(`badges.${badge.id}: too few captures`);
    if (!region.requiresBadges.every(id => state.badges[id])) errors.push(`badges.${badge.id}: earlier badge missing`);
  }

  const { flags } = state;
  if (flags.exitOpened && !state.badges['b-reed-seal']) errors.push('flags.exitOpened: needs the Reed Seal');
  if (!!flags.gateOpen !== !!flags.doorOpen) errors.push('flags: gateOpen and doorOpen must agree');
  if (flags.gateOpen && !flags.neriCleared) errors.push('flags.gateOpen: needs neriCleared');

  const dest = MAPS[state.map] && destination(state, state.map, state.x, state.y);
  if (!dest) errors.push('position: player is not on a walkable tile');

  checkEncounter(state, content, errors);
  if (state.badgeRun) {
    const { badge } = content.regionById.get(state.badgeRun.regionId);
    const ids = [...state.badgeRun.correct, ...(state.badgeRun.current ? [state.badgeRun.current.questionId] : [])];
    if (!ids.every(id => badge.questionIds.includes(id))) errors.push('badgeRun: lists a question outside this badge');
    const { correct, current } = state.badgeRun;
    if (new Set(correct).size !== correct.length) errors.push('badgeRun: credits a question twice');
    if (current && correct.includes(current.questionId)) errors.push('badgeRun: pending question is already credited');
    if (current) checkPendingMode('badgeRun', content.questionById.get(current.questionId), current.responseMode, errors);
  }
}

export function validateState(raw, content) {
  const errors = [];
  const state = stateSchema(content)(raw, 'state', errors);
  if (errors.length) return { ok: false, errors };
  checkConsistency(state, content, errors);
  return errors.length ? { ok: false, errors } : { ok: true, state };
}

export function parseImport(text, content) {
  if (typeof text !== 'string' || text.length > MAX_SAVE_BYTES) return { ok: false, errors: ['This file is too large to be a save.'] };
  let doc;
  try { doc = JSON.parse(text); } catch { return { ok: false, errors: ['This file is not valid JSON.'] }; }
  if (!isPlain(doc)) return { ok: false, errors: ['This file is not an Aleph Quest save.'] };
  if (doc.format !== FORMAT) return { ok: false, errors: ['This file has the wrong format.'] };
  if (doc.version !== VERSION) return { ok: false, errors: [`This save is version ${String(doc.version).slice(0, 12)}. This game reads version ${VERSION}.`] };
  for (const key of Object.keys(doc)) if (!['format', 'version', 'exportedAt', 'state'].includes(key)) return { ok: false, errors: [`Unknown field ${key.slice(0, 40)}`] };
  return validateState(doc.state, content);
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

export function saveSlot(backend, slot, state, content, { replaceUnreadable = false } = {}) {
  if (!backend) return { ok: false, reason: 'unavailable' };
  try {
    if (!replaceUnreadable && loadSlot(backend, slot, content).status === 'corrupt') return { ok: false, reason: 'unreadable' };
    backend.setItem(slotKey(slot), exportText(state, state.updatedAt));
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
