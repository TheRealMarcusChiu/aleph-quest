// Save format v2: real opening-written v1 saves, semantic bounds for every new state, atomic refusal.
// The two opening-v1 files are real exports from the accepted opening build (browser-52502ce).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { campaignFixture } from './fixtures/campaign-fixture.mjs';
import { content as realContent } from '../src/content.js';
import { MAPS, REGION_MAPS } from '../src/world.js';
import { newGame, markLessonDone, isDone } from '../src/engine.js';
import { startEncounter, completeStudy, openQuestion, submit, CAPTURE_FAMILIES, addToParty, retreat, answerRelatedForm, nextRelatedForm } from '../src/learning.js';
import { openGate, useGateHint, submitGate, startBadgeRun, openBadgeQuestion, submitBadgeAnswer, claimSecret, restoreArchive } from '../src/checkpoints.js';
import { parseImport, exportText, saveSlot, loadSlot, slotKey, validateState, MAX_SAVE_BYTES } from '../src/storage.js';

const content = campaignFixture();
const T0 = Date.UTC(2027, 0, 4, 12);
const opening = name => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
const r2 = content.regionById.get('r2');
const right = q => (q.format === 'tokens' ? q.acceptedSequences[0] : q.format === 'match' ? q.pairs.map(p => p.right) : q.acceptedAnswers[0]);

function memory(initial = {}) {
  const data = new Map(Object.entries(initial));
  return { data, getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)), removeItem: k => data.delete(k) };
}

function capture(s, wordId) {
  startEncounter(s, content, wordId, 'capture', T0);
  completeStudy(s, wordId, T0);
  for (const family of CAPTURE_FAMILIES) submit(s, content, right(openQuestion(s, content, family, T0)), T0);
}

function afterR1() {
  const s = newGame(T0, 5);
  for (const id of ['l-letters', 'l-meaning', 'l-finals']) markLessonDone(s, content, id, T0);
  for (const w of content.regionById.get('r1').wordIds.slice(0, 3)) capture(s, w);
  Object.assign(s.flags, { seedDone: true, neriCleared: true, gateOpen: true, doorOpen: 'door-m' });
  startBadgeRun(s, content, 'r1', T0);
  for (let q; (q = openBadgeQuestion(s, content, T0));) if (submitBadgeAnswer(s, content, right(q), T0).awarded) break;
  s.flags.exitOpened = true;
  return s;
}

function r2Ready() {
  const s = afterR1();
  for (const id of r2.lessonIds) markLessonDone(s, content, id, T0);
  for (const w of r2.wordIds.slice(0, 3)) capture(s, w);
  Object.assign(s, { map: 'springs', ...MAPS.springs.arrive, dir: 'up' });
  return s;
}

const clearGate = (s, key) => {
  for (let guard = 0; guard < 12 && !isDone(s, key); guard++) submitGate(s, content, right(openGate(s, content, key, T0)), T0);
};

const roundTrip = (s, data = content, label = '') => {
  const back = parseImport(exportText(s, T0), data);
  assert.equal(back.ok, true, `${label}: ${back.errors?.join(' | ')}`);
  assert.deepEqual(back.state, JSON.parse(JSON.stringify(s)), label);
  return back.state;
};

const refuses = (s, pattern) => {
  const snapshot = structuredClone(s);
  const out = parseImport(exportText(s, T0), content);
  assert.equal(out.ok, false, `expected refusal for ${pattern}`);
  assert.match(out.errors.join(' | '), pattern);
  assert.equal(out.state, undefined);
  assert.deepEqual(s, snapshot, 'input untouched');
};

test('real opening saves load through an explicit migration, with progress exact', () => {
  for (const name of ['opening-v1-first-capture.json', 'opening-v1-partial-trial.json']) {
    const text = opening(name);
    const raw = JSON.parse(text);
    const out = parseImport(text, realContent);
    assert.equal(out.ok, true, `${name}: ${out.errors?.join(' | ')}`);
    assert.equal(out.state.version, 2);
    assert.deepEqual(JSON.parse(text), raw, 'the input document is untouched');
    for (const field of ['map', 'x', 'y', 'steps', 'rng', 'skills', 'lessons', 'flags', 'party', 'badges', 'badgeRun', 'retiredCheckpoints', 'puzzleIndex', 'encounter']) {
      assert.deepEqual(out.state[field], raw.state[field], field);
    }
    for (const [id, record] of Object.entries(raw.state.words)) {
      assert.deepEqual({ ...out.state.words[id], xpStems: undefined, formsKnown: undefined, formRetired: undefined }, { ...record, xpStems: undefined, formsKnown: undefined, formRetired: undefined }, id);
      assert.deepEqual(out.state.words[id].xpStems, []);
    }
    assert.deepEqual(out.state.settings, { ...raw.state.settings, sacredName: 'written' });
    assert.deepEqual([out.state.gates, out.state.gateCredit, out.state.attempt, out.state.endingAt], [{}, {}, null, null]);
    roundTrip(out.state, realContent, name);
  }
});

test('a migrated partial trial plays on in the new code exactly where it stopped', () => {
  const s = parseImport(opening('opening-v1-partial-trial.json'), realContent).state;
  assert.equal(s.badgeRun.current.questionId, 'b-spell-2');
  assert.equal(startBadgeRun(s, realContent, 'r1', T0).ok, true);
  const q = openBadgeQuestion(s, realContent, T0);
  assert.equal(q.id, 'b-spell-2');
  assert.equal(submitBadgeAnswer(s, realContent, q.acceptedAnswers[0], T0).awarded, true);
  roundTrip(s, realContent, 'after award');
});

test('a slot holding a v1 save loads, autosaves as v2 and stays readable, and is not rewritten until play saves', () => {
  const store = memory({ [slotKey(1)]: opening('opening-v1-first-capture.json') });
  const loaded = loadSlot(store, 1, realContent);
  assert.equal(loaded.status, 'ok');
  assert.equal(store.getItem(slotKey(1)), opening('opening-v1-first-capture.json'), 'loading writes nothing');
  assert.equal(saveSlot(store, 1, loaded.state, realContent).ok, true);
  assert.equal(JSON.parse(store.getItem(slotKey(1))).version, 2);
  assert.deepEqual(loadSlot(store, 1, realContent).state, loaded.state);
});

test('a v1 document cannot smuggle v2 fields, and version discriminators must agree', () => {
  const doc = JSON.parse(opening('opening-v1-first-capture.json'));
  for (const smuggled of ['gates', 'gateCredit', 'attempt', 'endingAt']) {
    const bad = structuredClone(doc);
    bad.state[smuggled] = smuggled === 'attempt' || smuggled === 'endingAt' ? null : {};
    const out = parseImport(JSON.stringify(bad), realContent);
    assert.equal(out.ok, false, smuggled);
    assert.match(out.errors.join(), new RegExp(smuggled));
  }
  const nested = structuredClone(doc);
  nested.state.words.H0001.xpStems = [];
  assert.equal(parseImport(JSON.stringify(nested), realContent).ok, false);
  const mixed = structuredClone(doc);
  mixed.version = 2;
  assert.equal(parseImport(JSON.stringify(mixed), realContent).ok, false, 'envelope v2 over a v1 state');
  const mixed2 = structuredClone(doc);
  mixed2.state.version = 2;
  assert.equal(parseImport(JSON.stringify(mixed2), realContent).ok, false, 'envelope v1 over a v2 state');
  const future = structuredClone(doc);
  future.version = 3;
  assert.match(parseImport(JSON.stringify(future), realContent).errors.join(), /version/i);
});

test('every step of a later region round-trips: gates, hints, duels, badge, ward, secret, exit', () => {
  const s = r2Ready();
  const step = label => roundTrip(s, content, label);
  step('ready');
  const first = openGate(s, content, 'r2:rival', T0);
  step('duel pending');
  useGateHint(s, content);
  step('duel hinted');
  submitGate(s, content, right(first), T0);
  step('duel hinted answer');
  submitGate(s, content, right(openGate(s, content, 'r2:rival', T0)), T0);
  step('duel one credit');
  submitGate(s, content, right(openGate(s, content, 'r2:rival', T0)), T0);
  assert.ok(isDone(s, 'r2:rival'));
  step('duel cleared');
  clearGate(s, 'r2:gate');
  step('gate cleared');
  openGate(s, content, 'read:pfx-r2', T0);
  step('reading pending');
  clearGate(s, 'read:pfx-r2');
  step('reading done');
  startBadgeRun(s, content, 'r2', T0);
  for (let q; (q = openBadgeQuestion(s, content, T0));) {
    step(`badge pending ${q.id}`);
    if (submitBadgeAnswer(s, content, right(q), T0).awarded) break;
    step(`badge answered ${q.id}`);
  }
  assert.ok(s.badges['bfx-r2']);
  step('badge earned');

  const id = r2.wordIds[0];
  addToParty(s, id);
  for (const family of ['fx-analyze', 'fx-build']) {
    startEncounter(s, content, id, 'practice', T0);
    step('practice');
    submit(s, content, right(openQuestion(s, content, family, T0)), T0);
    step('practice answered');
    retreat(s, content, T0);
  }
  answerRelatedForm(s, content, id, nextRelatedForm(s, content, id).tokenId, 'derivation', T0);
  step('form missed');
  const wardQ = openGate(s, content, 'r2:ward', T0, { wordId: id });
  step('ward pending');
  useGateHint(s, content);
  step('ward hinted');
  submitGate(s, content, right(wardQ), T0);
  step('ward hinted answer');
  submitGate(s, content, right(openGate(s, content, 'r2:ward', T0, { wordId: id })), T0);
  step('ward open');
  assert.equal(claimSecret(s, content, 'r2:secret', T0).ok, true);
  step('secret');
  s.gates['r2:exit'] = { at: T0, questionIds: [] };
  step('exit');
});

test('gate records need the real prerequisites and real answers from the right pool', () => {
  const base = () => r2Ready();
  const answers = () => r2.puzzleQuestionIds.neri.slice(0, 2);
  const withRival = over => { const s = base(); s.gates['r2:rival'] = { at: T0, questionIds: answers(), ...over }; return s; };

  roundTrip(withRival({}), content, 'control');
  refuses(withRival({ questionIds: [] }), /r2:rival.*answers/);
  refuses(withRival({ questionIds: [answers()[0], answers()[0]] }), /r2:rival/);
  refuses(withRival({ questionIds: ['b-final-1', 'b-final-2'] }), /r2:rival/);

  const early = afterR1();
  early.gates['r2:rival'] = { at: T0, questionIds: answers() };
  refuses(early, /r2:rival/);

  const gateFirst = base();
  gateFirst.gates['r2:gate'] = { at: T0, questionIds: [r2.puzzleQuestionIds.gate[0]] };
  refuses(gateFirst, /r2:gate/);

  const exit = base();
  exit.gates['r2:exit'] = { at: T0, questionIds: [] };
  refuses(exit, /r2:exit/);

  const locked = afterR1();
  locked.gates['r3:rival'] = { at: T0, questionIds: content.regionById.get('r3').puzzleQuestionIds.neri.slice(0, 2) };
  refuses(locked, /r3:rival/);

  const unknownKey = base();
  unknownKey.gates['r2:nope'] = { at: T0, questionIds: [] };
  refuses(unknownKey, /r2:nope/);
  const proto = exportText(base(), T0).replace('"gates":{}', '"gates":{"__proto__":{"at":1,"questionIds":[]}}');
  assert.equal(parseImport(proto, content).ok, false);
  assert.equal({}.at, undefined);
});

test('ward, secret and reading records are tied to who could really have done them', () => {
  const opened = () => {
    const s = r2Ready();
    clearGate(s, 'r2:rival');
    clearGate(s, 'r2:gate');
    return s;
  };
  const wordId = r2.wordIds[0];
  const q = content.questions.find(item => item.wordId === wordId).id;
  const ward = over => { const s = opened(); s.gates['r2:ward'] = { at: T0, questionIds: [q], wordId, ...over }; return s; };
  roundTrip(ward({}), content, 'control');
  refuses(ward({ wordId: undefined }), /r2:ward/);
  refuses(ward({ questionIds: [content.questions.find(item => item.wordId === r2.wordIds[1]).id] }), /r2:ward/);
  refuses(ward({ wordId: content.regionById.get('r3').wordIds[0] }), /r2:ward/);
  const notGated = r2Ready();
  notGated.gates['r2:ward'] = { at: T0, questionIds: [q], wordId };
  refuses(notGated, /r2:ward/);

  const secret = opened();
  secret.gates['r2:secret'] = { at: T0, questionIds: [] };
  refuses(secret, /r2:secret/);

  const reading = opened();
  reading.gates['read:pfx-r2'] = { at: T0, questionIds: [content.passageById.get('pfx-r2').questionIds[0]] };
  refuses(reading, /read:pfx-r2.*answers/);
  const unknownPassage = opened();
  unknownPassage.gates['read:nope'] = { at: T0, questionIds: [] };
  refuses(unknownPassage, /read:nope/);
});

test('pending attempts and partial credit are validated like encounters', () => {
  const pending = over => {
    const s = r2Ready();
    openGate(s, content, 'r2:rival', T0);
    Object.assign(s.attempt, over);
    return s;
  };
  roundTrip(pending({ hintsUsed: 2 }), content, 'hinted control');
  refuses(pending({ questionId: 'b-final-1' }), /attempt/);
  refuses(pending({ responseMode: 'typing' }), /attempt.*typing/);
  refuses(pending({ key: 'r9:rival' }), /attempt/);
  refuses(pending({ key: 'r2:exit' }), /attempt/);
  const finished = pending({});
  finished.gates['r2:rival'] = { at: T0, questionIds: r2.puzzleQuestionIds.neri.slice(0, 2) };
  refuses(finished, /attempt/);
  const untaught = afterR1();
  untaught.attempt = { key: 'r2:rival', questionId: r2.puzzleQuestionIds.neri[0], hintsUsed: 0, startedAt: T0, responseMode: 'recognition' };
  refuses(untaught, /attempt/);

  const credit = ids => { const s = r2Ready(); s.gateCredit['r2:rival'] = ids; return s; };
  roundTrip(credit(r2.puzzleQuestionIds.neri.slice(0, 1)), content, 'partial credit control');
  refuses(credit(r2.puzzleQuestionIds.neri.slice(0, 2)), /gateCredit/);
  refuses(credit([r2.puzzleQuestionIds.neri[0], r2.puzzleQuestionIds.neri[0]]), /gateCredit/);
  refuses(credit(['b-final-1']), /gateCredit/);
  const creditedPending = pending({});
  creditedPending.gateCredit['r2:rival'] = [creditedPending.attempt.questionId];
  refuses(creditedPending, /attempt/);
});

test('a pending ward needs a word that can really answer it', () => {
  const s = r2Ready();
  clearGate(s, 'r2:rival');
  clearGate(s, 'r2:gate');
  const id = r2.wordIds[0];
  const q = content.questions.find(item => item.wordId === id);
  s.attempt = { key: 'r2:ward', questionId: q.id, hintsUsed: 0, startedAt: T0, responseMode: 'recognition', wordId: id, stemId: q.semanticStemId };
  refuses(s, /attempt.*word/);
});

test('position, region and ending contradictions are refused; legitimate returns to old regions are not', () => {
  const inR3 = afterR1();
  Object.assign(inR3, { map: 'market', ...MAPS.market.arrive });
  refuses(inR3, /position.*sealed|position/);

  const noExit = afterR1();
  delete noExit.flags.exitOpened;
  Object.assign(noExit, { map: 'springs', ...MAPS.springs.arrive });
  refuses(noExit, /position/);

  const back = r2Ready();
  Object.assign(back, { map: 'grove', x: 27, y: 1, dir: 'down' });
  roundTrip(back, content, 'back in r1 after r2');

  const garden = r2Ready();
  Object.assign(garden, { map: 'garden', x: 11, y: 13 });
  refuses(garden, /position/);

  const ending = r2Ready();
  ending.endingAt = T0;
  refuses(ending, /endingAt/);

  const inSolid = r2Ready();
  Object.assign(inSolid, { map: 'springs', x: 0, y: 0 });
  refuses(inSolid, /position/);

  const atLock = r2Ready();
  const lock = { x: 14, y: 5 };
  Object.assign(atLock, { map: 'springs', ...lock });
  refuses(atLock, /position/);
});

test('earned badges: raw repeats and open trials beside an earned badge are refused, and each region\'s captures are its own', () => {
  const s = afterR1();
  const earned = s.badges['b-reed-seal'].questionIds;
  const repeat = structuredClone(s);
  repeat.badges['b-reed-seal'].questionIds = [...earned, earned[0]];
  refuses(repeat, /badges.*twice/);

  const reopened = structuredClone(s);
  reopened.badgeRun = { id: 99, regionId: 'r1', correct: [], current: null };
  refuses(reopened, /badgeRun.*earned/);

  const qualified = r2Ready();
  qualified.badges['bfx-r2'] = { at: T0, questionIds: content.regionById.get('r2').badge.questionIds.slice(0, 4) };
  const shy = structuredClone(qualified);
  delete shy.words[r2.wordIds[2]];
  shy.party = shy.party.filter(id => id !== r2.wordIds[2]);
  refuses(shy, /badges.bfx-r2.*captures/);
});

test('an active trial must be qualified at import: the helper-only bypass is closed at the door', () => {
  const unqualified = newGame(T0, 1);
  unqualified.badgeRun = { id: 1, regionId: 'r1', correct: ['b-final-1'], current: null };
  const out = parseImport(exportText(unqualified, T0), realContent);
  assert.equal(out.ok, false);
  assert.match(out.errors.join(), /badgeRun/);

  const locked = afterR1();
  locked.badgeRun = { id: 1, regionId: 'r3', correct: [], current: null };
  refuses(locked, /badgeRun/);
});

test('record additions have bounds: unknown stems and forms are refused', () => {
  const s = afterR1();
  const id = content.regionById.get('r1').wordIds[0];
  const stems = structuredClone(s);
  stems.words[id].xpStems = ['not-a-stem'];
  refuses(stems, /xpStems/);
  const foreign = structuredClone(s);
  foreign.words[id].xpStems = ['H0251-gloss'];
  refuses(foreign, /xpStems/);
  const forms = structuredClone(s);
  forms.words[id].formsKnown = ['not-a-token'];
  refuses(forms, /formsKnown/);
  const retired = structuredClone(s);
  retired.words[id].formRetired = { 'not-a-token': 1 };
  refuses(retired, /formRetired/);
  const settings = structuredClone(s);
  settings.settings.sacredName = 'other';
  refuses(settings, /sacredName/);
});

test('a save the game itself could not read is never written over a good slot', () => {
  const store = memory();
  const s = r2Ready();
  assert.equal(saveSlot(store, 1, s, content).ok, true);
  const before = store.getItem(slotKey(1));
  const broken = structuredClone(s);
  broken.party = ['H9999'];
  const out = saveSlot(store, 1, broken, content);
  assert.equal(out.ok, false);
  assert.equal(out.reason, 'invalid');
  assert.equal(store.getItem(slotKey(1)), before);
});

test('a save larger than its own import limit reports failure instead of writing an unreadable slot', () => {
  const s = r2Ready();
  const store = memory();
  assert.equal(saveSlot(store, 1, s, content).ok, true);
  const before = store.getItem(slotKey(1));
  assert.ok(MAX_SAVE_BYTES >= 2 * 1024 * 1024, 'room for 150 full records');
  const huge = structuredClone(s);
  // Synthetic bulk of legal records, far beyond any real play, so only the size rule can object.
  for (const w of r2.wordIds.slice(3, 15)) capture(huge, w);
  for (const w of r2.wordIds.slice(0, 15)) {
    const q = content.questions.find(item => item.wordId === w && item.taskFamily === 'read-letter');
    huge.words[w].evidence = Array.from({ length: 1000 }, () => ({ at: T0, taskFamily: q.taskFamily, contextId: q.contextId, templateId: q.templateId, semanticStemId: q.semanticStemId, responseMode: 'recognition' }));
  }
  huge.words[r2.wordIds[0]].evidence[0].at = T0;
  assert.equal(validateState(JSON.parse(JSON.stringify(huge)), content).ok, true, 'each record is legal on its own');
  const out = saveSlot(store, 1, huge, content);
  assert.deepEqual(out, { ok: false, reason: 'too-large' });
  assert.equal(store.getItem(slotKey(1)), before);
});

test('a fully played 150-word save stays well under the import limit, and validates quickly', () => {
  const s = newGame(T0, 3);
  for (const lesson of content.lessons) markLessonDone(s, content, lesson.id, T0);
  for (const word of content.words) capture(s, word.id);
  const text = exportText(s, T0);
  assert.ok(text.length < MAX_SAVE_BYTES / 2, `${text.length} bytes`);
  const started = performance.now();
  assert.equal(parseImport(text, content).ok, true);
  assert.ok(performance.now() - started < 500, 'validation is fast enough to run on autosave');
  assert.ok(REGION_MAPS.r8);
  assert.ok(restoreArchive);
});
