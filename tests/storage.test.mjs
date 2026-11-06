import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame, markLessonDone, BADGE_ID } from '../src/engine.js';
import { content } from '../src/content.js';
import { startEncounter, completeStudy, openQuestion, submit, CAPTURE_FAMILIES } from '../src/learning.js';
import { saveSlot, loadSlot, listSlots, deleteSlot, exportText, parseImport, slotKey, MAX_SAVE_BYTES, SLOTS } from '../src/storage.js';

const NOW = 1_800_000_000_000;
const rightAnswer = q => q.acceptedAnswers[0];

function memory(initial = {}) {
  const data = new Map(Object.entries(initial));
  return { data, getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)), removeItem: k => data.delete(k) };
}

function played() {
  const s = newGame(NOW, 5);
  for (const id of ['l-letters', 'l-meaning', 'l-finals']) markLessonDone(s, content, id, NOW);
  for (const w of content.words.slice(0, 3)) {
    startEncounter(s, content, w.id, 'capture', NOW);
    completeStudy(s, w.id, NOW);
    for (const family of CAPTURE_FAMILIES) submit(s, content, rightAnswer(openQuestion(s, content, family, NOW)), NOW);
  }
  return s;
}

const envelope = mutate => {
  const doc = JSON.parse(exportText(played(), NOW));
  mutate(doc.state, doc);
  return JSON.stringify(doc);
};
const rejects = (text, pattern) => {
  const result = parseImport(text, content);
  assert.equal(result.ok, false);
  if (pattern) assert.match(result.errors.join(' | '), pattern);
};

test('three slots round-trip the exact game state under the versioned namespace', () => {
  const store = memory();
  const s = played();
  assert.equal(SLOTS.length, 3);
  assert.equal(slotKey(2), 'alephQuest:v1:slot:2');
  assert.equal(saveSlot(store, 2, s, content).ok, true);
  const back = loadSlot(store, 2, content);
  assert.equal(back.status, 'ok');
  assert.deepEqual(back.state, s);
  assert.deepEqual(listSlots(store, content).map(slot => slot.status), ['empty', 'ok', 'empty']);
  deleteSlot(store, 2);
  assert.equal(loadSlot(store, 2, content).status, 'empty');
});

test('a mid-encounter save resumes the same question with its hints', () => {
  const store = memory();
  const s = played();
  const id = content.words[3].id;
  startEncounter(s, content, id, 'capture', NOW);
  completeStudy(s, id, NOW);
  const q = openQuestion(s, content, 'read-letter', NOW);
  s.encounter.current.hintsUsed = 1;
  saveSlot(store, 1, s, content);
  const back = loadSlot(store, 1, content).state;
  assert.equal(back.encounter.current.questionId, q.id);
  assert.equal(back.encounter.current.hintsUsed, 1);
});

test('an unreadable slot is reported and not overwritten by autosave', () => {
  const store = memory({ [slotKey(1)]: '{not json' });
  const loaded = loadSlot(store, 1, content);
  assert.equal(loaded.status, 'corrupt');
  assert.equal(saveSlot(store, 1, played(), content).ok, false);
  assert.equal(store.data.get(slotKey(1)), '{not json');
  assert.equal(saveSlot(store, 1, played(), content, { replaceUnreadable: true }).ok, true);
  assert.equal(loadSlot(store, 1, content).status, 'ok');
});

test('a slot holding valid JSON with a bad state counts as unreadable too', () => {
  const store = memory({ [slotKey(3)]: JSON.stringify({ format: 'alephQuest', version: 1, state: { party: 'nope' } }) });
  assert.equal(loadSlot(store, 3, content).status, 'corrupt');
});

test('blocked or full storage reports failure and never throws', () => {
  const quota = { getItem: () => null, setItem() { throw new Error('QuotaExceeded'); }, removeItem() {} };
  assert.deepEqual(saveSlot(quota, 1, played(), content).ok, false);
  assert.equal(saveSlot(null, 1, played(), content).ok, false);
  const blocked = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }, removeItem() { throw new Error('denied'); } };
  assert.equal(loadSlot(blocked, 1, content).status, 'unavailable');
  assert.equal(loadSlot(null, 1, content).status, 'unavailable');
  assert.deepEqual(listSlots(null, content).map(slot => slot.status), ['unavailable', 'unavailable', 'unavailable']);
});

test('a valid export imports as an equal state', () => {
  const s = played();
  const result = parseImport(exportText(s, NOW), content);
  assert.equal(result.ok, true);
  assert.deepEqual(result.state, s);
});

test('malformed files are rejected with a reason', () => {
  rejects('not json', /JSON/);
  rejects('null');
  rejects('[]');
  rejects(JSON.stringify({ format: 'other', version: 1, state: {} }), /format/i);
  rejects('x'.repeat(MAX_SAVE_BYTES + 1), /large/i);
});

test('other save versions are refused', () => {
  rejects(envelope((state, doc) => { doc.version = 2; }), /version/i);
  rejects(envelope(state => { state.version = 2; }), /version/i);
});

test('unknown fields are refused at any depth, including prototype keys', () => {
  rejects(envelope(state => { state.hacked = true; }), /hacked/);
  rejects(envelope(state => { state.words.H0001.evil = 1; }), /evil/);
  rejects(envelope(state => { state.settings.extra = 1; }), /extra/);
  const proto = exportText(played(), NOW).replace('"version":1,"createdAt"', '"__proto__":{"polluted":true},"version":1,"createdAt"');
  rejects(proto, /__proto__/);
  assert.equal({}.polluted, undefined);
});

test('unknown ids are refused', () => {
  rejects(envelope(state => { state.words.H9999 = state.words.H0001; }), /H9999/);
  rejects(envelope(state => { state.lessons['l-nope'] = NOW; }), /l-nope/);
  rejects(envelope(state => { state.skills['fake-skill'] = NOW; }), /fake-skill/);
  rejects(envelope(state => { state.flags.fakeFlag = true; }), /fakeFlag/);
  rejects(envelope(state => { state.badges['b-fake'] = { at: NOW, questionIds: [] }; }), /b-fake/);
  rejects(envelope(state => { state.map = 'nowhere'; }), /map/);
});

test('numbers must be finite integers within bounds', () => {
  rejects(envelope(state => { state.steps = -1; }), /steps/);
  rejects(envelope(state => { state.steps = 1.5; }), /steps/);
  rejects(envelope(state => { state.words.H0001.stage = 99; }), /stage/);
  rejects(exportText(played(), NOW).replace(/"steps":\d+/, '"steps":1e999'), /steps/);
  rejects(envelope(state => { state.words.H0001.reviewOutcomes = [7]; }), /reviewOutcomes/);
  rejects(envelope(state => { state.words.H0001.history = Array(5000).fill({ at: NOW, type: 'seen' }); }), /history/);
});

test('the party is bounded, unique and captured', () => {
  rejects(envelope(state => { state.party = ['H0001', 'H0001']; }), /party/i);
  rejects(envelope(state => { state.party = content.words.slice(0, 7).map(w => w.id); }), /party/i);
  rejects(envelope(state => { state.party = ['H5612']; }), /party/i);
});

test('badges must agree with the learner\'s record', () => {
  const earned = ['b-final-1', 'b-final-2', 'b-spell-1', 'b-order-1'];
  const badge = (over = {}) => state => { state.badges[BADGE_ID] = { at: NOW, questionIds: earned, ...over }; };
  rejects(envelope(badge({ questionIds: ['b-final-1'] })), /badge/i);
  rejects(envelope(state => { badge()(state); state.words = {}; state.party = []; }), /badge/i);
  rejects(envelope(state => { badge()(state); delete state.skills['final-forms']; delete state.lessons['l-finals']; state.words = {}; state.party = []; }), /badge/i);
  rejects(envelope(badge({ questionIds: ['p-gate-1'] })), /badge/i);
  assert.equal(parseImport(envelope(badge()), content).ok, true);
});

test('story flags must agree with each other, and the position must be walkable', () => {
  rejects(envelope(state => { state.flags.exitOpened = true; }), /exitOpened/);
  rejects(envelope(state => { state.flags.gateOpen = true; }), /door/i);
  rejects(envelope(state => { Object.assign(state, { map: 'grove', x: 0, y: 0 }); }), /position/i);
  rejects(envelope(state => { Object.assign(state, { map: 'grove', x: 500, y: 0 }); }), /position/i);
});

test('captured words must carry a schedule, and an encounter must point at a real question for its word', () => {
  rejects(envelope(state => { state.words.H0001.dueAt = null; }), /dueAt/);
  rejects(envelope(state => {
    state.encounter = { id: 1, wordId: 'H0776', kind: 'capture', assistedNext: false, current: { questionId: 'H0001-gloss', stemId: 'H0001-gloss', family: 'understand-meaning', startedAt: NOW, hintsUsed: 0, assisted: false, responseMode: 'recognition' } };
  }), /encounter/i);
});

test('a rejected import returns no state and cannot touch the game passed around it', () => {
  const live = played();
  const snapshot = structuredClone(live);
  const result = parseImport(envelope(state => { state.party = 'bad'; }), content);
  assert.equal(result.state, undefined);
  assert.deepEqual(live, snapshot);
});
