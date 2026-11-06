import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame, interact, markLessonDone } from '../src/engine.js';
import { content } from '../src/content.js';
import {
  startEncounter, commandStates, completeStudy, openQuestion, useHint, submit, retreat, statusOf, setCurrentResponseMode,
  addToParty, removeFromParty, PARTY_LIMIT, CAPTURE_FAMILIES,
} from '../src/learning.js';

const NOW = 1_800_000_000_000;
const WORD = 'H0001';

function ready() {
  const s = newGame(NOW, 3);
  markLessonDone(s, content, 'l-letters', NOW);
  markLessonDone(s, content, 'l-meaning', NOW);
  markLessonDone(s, content, 'l-finals', NOW);
  return s;
}
const rightAnswer = q => q.format === 'tokens' ? q.acceptedSequences[0] : q.acceptedAnswers[0];
const wrongAnswer = q => q.format === 'type' ? 'wrong' : q.format === 'tokens' ? [] : q.choices.find(c => !q.acceptedAnswers.includes(c.id)).id;

const answerRight = (s, family, now = NOW) => {
  const q = openQuestion(s, content, family, now);
  return { q, ...submit(s, content, rightAnswer(q), now) };
};
const answerWrong = (s, family, now = NOW) => {
  const q = openQuestion(s, content, family, now);
  return { q, ...submit(s, content, wrongAnswer(q), now) };
};

test('an encounter marks the word Seen; study marks it Studied but gives no retrieval credit', () => {
  const s = ready();
  startEncounter(s, content, WORD, 'capture', NOW);
  assert.equal(statusOf(s.words[WORD]), 'Seen');
  completeStudy(s, WORD, NOW);
  assert.equal(statusOf(s.words[WORD]), 'Studied');
  assert.equal(s.words[WORD].captureSteps.length, 0);
  assert.equal(s.words[WORD].firstAttempts, 0);
});

test('commands unlock gradually: only Study and Retreat before the word card, Understand after its worked example', () => {
  const s = newGame(NOW, 3);
  markLessonDone(s, content, 'l-letters', NOW);
  startEncounter(s, content, WORD, 'capture', NOW);
  let c = commandStates(s, content, WORD);
  assert.equal(c.read.enabled, false);
  assert.equal(c.study.enabled, true);
  assert.equal(c.retreat.enabled, true);
  completeStudy(s, WORD, NOW);
  c = commandStates(s, content, WORD);
  assert.equal(c.read.enabled, true);
  assert.equal(c.inscribe.enabled, true);
  assert.equal(c.understand.enabled, false);
  assert.match(c.understand.reason, /example/i);
  markLessonDone(s, content, 'l-meaning', NOW);
  assert.equal(commandStates(s, content, WORD).understand.enabled, true);
  assert.equal(c.analyze, undefined, 'later commands do not exist yet');
});

test('three distinct families capture the word, add it to the party and schedule the first review', () => {
  const s = ready();
  startEncounter(s, content, WORD, 'capture', NOW);
  completeStudy(s, WORD, NOW);
  const seen = new Set();
  let last;
  for (const family of CAPTURE_FAMILIES) {
    last = answerRight(s, family);
    assert.equal(last.correct, true);
    seen.add(last.q.semanticStemId);
  }
  assert.equal(seen.size, 3);
  assert.equal(last.captured, true);
  const r = s.words[WORD];
  assert.equal(statusOf(r), 'Captured');
  assert.equal(r.capturedAt, NOW);
  assert.equal(r.dueAt, NOW + 86_400_000);
  assert.deepEqual(s.party, [WORD]);
  assert.equal(new Set(r.captureSteps.map(step => step.templateId)).size, 3);
  assert.equal(s.encounter, null);
});

test('a filled family cannot be repeated for more credit', () => {
  const s = ready();
  startEncounter(s, content, WORD, 'capture', NOW);
  completeStudy(s, WORD, NOW);
  answerRight(s, 'read-letter');
  assert.equal(openQuestion(s, content, 'read-letter', NOW), null);
  assert.equal(commandStates(s, content, WORD).read.enabled, false);
});

test('a wrong answer explains, shows a fresh stem next and never reuses the exposed one', () => {
  const s = ready();
  startEncounter(s, content, WORD, 'capture', NOW);
  completeStudy(s, WORD, NOW);
  const first = answerWrong(s, 'read-letter');
  assert.equal(first.correct, false);
  assert.ok(first.explanation.length > 10);
  assert.equal(s.words[WORD].captureSteps.length, 0);
  const second = openQuestion(s, content, 'read-letter', NOW);
  assert.notEqual(second.semanticStemId, first.q.semanticStemId);
  assert.notEqual(second.templateId, first.q.templateId);
});

test('a hinted success teaches but fills no capture step', () => {
  const s = ready();
  startEncounter(s, content, WORD, 'capture', NOW);
  completeStudy(s, WORD, NOW);
  const q = openQuestion(s, content, 'read-letter', NOW);
  assert.equal(useHint(s, content), q.hint);
  const r = submit(s, content, rightAnswer(q), NOW);
  assert.equal(r.correct, true);
  assert.equal(r.independent, false);
  assert.equal(s.words[WORD].captureSteps.length, 0);
  assert.equal(s.words[WORD].hints, 1);
  assert.notEqual(openQuestion(s, content, 'read-letter', NOW).semanticStemId, q.semanticStemId);
});

test('reopening the card mid-encounter taints the next answer', () => {
  const s = ready();
  startEncounter(s, content, WORD, 'capture', NOW);
  completeStudy(s, WORD, NOW);
  completeStudy(s, WORD, NOW);
  const r = answerRight(s, 'read-letter');
  assert.equal(r.correct, true);
  assert.equal(r.independent, false);
  assert.equal(s.words[WORD].captureSteps.length, 0);
  assert.equal(answerRight(s, 'read-letter').independent, true);
});

test('reopening the card over a pending question taints that question, and a fresh stem still earns the step', () => {
  const s = ready();
  startEncounter(s, content, WORD, 'capture', NOW);
  completeStudy(s, WORD, NOW);
  const pending = openQuestion(s, content, 'understand-meaning', NOW);
  completeStudy(s, WORD, NOW); // Back to commands, then Study again
  assert.equal(s.encounter.current.assisted, true);
  assert.equal(s.encounter.assistedNext, false, 'only the outstanding attempt pays for the card');
  assert.equal(openQuestion(s, content, 'understand-meaning', NOW).id, pending.id, 'the same question resumes');

  const answered = submit(s, content, rightAnswer(pending), NOW);
  assert.equal(answered.correct, true);
  assert.equal(answered.independent, false);
  assert.equal(s.words[WORD].captureSteps.length, 0);

  const fresh = openQuestion(s, content, 'understand-meaning', NOW);
  assert.notEqual(fresh.semanticStemId, pending.semanticStemId);
  assert.equal(submit(s, content, rightAnswer(fresh), NOW).independent, true);
});

test('switching response mode keeps a card-exposed attempt assisted', () => {
  const s = ready();
  startEncounter(s, content, WORD, 'capture', NOW);
  completeStudy(s, WORD, NOW);
  s.words[WORD].retired['H0001-mirror'] = { at: s.interactions, encounter: s.encounter.id };
  const q = openQuestion(s, content, 'inscribe-spelling', NOW);
  completeStudy(s, WORD, NOW);
  setCurrentResponseMode(s, 'recognition');
  assert.equal(submit(s, content, q.recognitionAccepted[0], NOW).independent, false);
});

test('walking away to another command does not launder a card-exposed attempt', () => {
  const s = ready();
  startEncounter(s, content, WORD, 'capture', NOW);
  completeStudy(s, WORD, NOW);
  const exposed = openQuestion(s, content, 'understand-meaning', NOW);
  completeStudy(s, WORD, NOW);
  const other = openQuestion(s, content, 'read-letter', NOW);
  assert.equal(s.words[WORD].retired[exposed.semanticStemId].encounter, s.encounter.id, 'the exposed stem retires');
  assert.equal(submit(s, content, rightAnswer(other), NOW).independent, false, 'the taint follows the next answer');
  assert.equal(s.words[WORD].captureSteps.length, 0);
});

test('retreating from a card-exposed attempt retires its stem', () => {
  const s = ready();
  startEncounter(s, content, WORD, 'capture', NOW);
  completeStudy(s, WORD, NOW);
  const exposed = openQuestion(s, content, 'read-letter', NOW);
  completeStudy(s, WORD, NOW);
  retreat(s, content, NOW);
  assert.ok(s.words[WORD].retired[exposed.semanticStemId]);
});

test('retreat keeps progress, and the same steps still count in a later encounter', () => {
  const s = ready();
  startEncounter(s, content, WORD, 'capture', NOW);
  completeStudy(s, WORD, NOW);
  answerRight(s, 'read-letter');
  retreat(s, content, NOW);
  assert.equal(s.encounter, null);
  startEncounter(s, content, WORD, 'capture', NOW + 1000);
  assert.equal(s.words[WORD].captureSteps.length, 1);
  answerRight(s, 'understand-meaning');
  assert.equal(answerRight(s, 'inscribe-spelling').captured, true);
});

test('finite stems run out without a softlock: leave, explore twice and the word can be relearned', () => {
  const s = ready();
  startEncounter(s, content, WORD, 'capture', NOW);
  completeStudy(s, WORD, NOW);
  answerWrong(s, 'read-letter');
  answerWrong(s, 'read-letter');
  assert.equal(openQuestion(s, content, 'read-letter', NOW), null, 'fresh read stems are exhausted');
  const command = commandStates(s, content, WORD).read;
  assert.equal(command.enabled, false);
  assert.match(command.reason, /fresh/i);
  retreat(s, content, NOW);

  // Same encounter ended, but no exploration yet beyond the two failed tries.
  startEncounter(s, content, WORD, 'capture', NOW + 1);
  s.encounter = null;
  s.map = 'scriptorium'; s.x = 5; s.y = 4; s.dir = 'up';
  interact(s, content, NOW + 2);
  interact(s, content, NOW + 3);

  startEncounter(s, content, WORD, 'capture', NOW + 4);
  const back = openQuestion(s, content, 'read-letter', NOW + 4);
  assert.ok(back, 'stems come back after two other interactions');
  assert.equal(submit(s, content, rightAnswer(back), NOW + 4).independent, true);
});

test('a word that was wrong repeatedly is still permanently captured once earned', () => {
  const s = ready();
  startEncounter(s, content, WORD, 'capture', NOW);
  completeStudy(s, WORD, NOW);
  answerWrong(s, 'understand-meaning');
  for (const family of CAPTURE_FAMILIES) answerRight(s, family);
  assert.equal(statusOf(s.words[WORD]), 'Captured');
  assert.equal(s.words[WORD].firstCorrect, 3);
  assert.equal(s.words[WORD].firstAttempts, 4);
});

test('closing a question without answering keeps the hint record and costs nothing else', () => {
  const s = ready();
  startEncounter(s, content, WORD, 'capture', NOW);
  completeStudy(s, WORD, NOW);
  const q = openQuestion(s, content, 'read-letter', NOW);
  useHint(s, content);
  assert.equal(s.encounter.current.questionId, q.id);
  assert.equal(s.encounter.current.hintsUsed, 1);
  assert.equal(openQuestion(s, content, 'read-letter', NOW).id, q.id, 'resuming returns to the same hinted question');
});

test('the party holds six words, captured ones only, and collection is separate from it', () => {
  const s = ready();
  const ids = content.regionById.get('r1').wordIds;
  for (const id of ids) {
    startEncounter(s, content, id, 'capture', NOW);
    completeStudy(s, id, NOW);
    for (const family of CAPTURE_FAMILIES) answerRight(s, family);
  }
  assert.equal(s.party.length, PARTY_LIMIT);
  assert.equal(Object.values(s.words).filter(r => r.capturedAt != null).length, ids.length);
  assert.equal(addToParty(s, ids.at(-1)).ok, false);
  removeFromParty(s, ids[0]);
  assert.equal(s.words[ids[0]].capturedAt, NOW, 'leaving the party never removes the capture');
  assert.equal(addToParty(s, ids.at(-1)).ok, true);
  const uncaught = newGame(NOW, 1);
  assert.equal(addToParty(uncaught, ids[0]).ok, false);
});

test('recognition mode meets the same goal and is recorded honestly', () => {
  const s = ready();
  s.settings.responseMode = 'recognition';
  startEncounter(s, content, WORD, 'capture', NOW);
  completeStudy(s, WORD, NOW);
  const r = s.words[WORD];
  for (const stem of ['H0001-mirror', 'H0001-write']) r.retired[stem] = undefined;
  r.retired['H0001-mirror'] = { at: s.interactions, encounter: s.encounter.id };
  const q = openQuestion(s, content, 'inscribe-spelling', NOW);
  assert.equal(q.id, 'H0001-write');
  const result = submit(s, content, q.recognitionAccepted[0], NOW);
  assert.equal(result.independent, true);
  assert.equal(r.captureSteps[0].responseMode, 'recognition');
});
