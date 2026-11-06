// All dates here come from a synthetic clock. These tests check the scheduling rules,
// not real-world retention, and do not wait real days.
import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame, markLessonDone, chooseEncounter, setFlag } from '../src/engine.js';
import { content } from '../src/content.js';
import {
  startEncounter, completeStudy, openQuestion, submit, useHint, statusOf, retreat, CAPTURE_FAMILIES, DAY,
  reviewEligible, dueWords, startReview, MIN_REVIEW_GAP,
} from '../src/learning.js';

const T0 = Date.UTC(2027, 0, 4, 12);
const WORD = 'H0001';
const rightAnswer = q => q.format === 'tokens' ? q.acceptedSequences[0] : q.acceptedAnswers[0];
const wrongAnswer = q => q.format === 'type' ? 'wrong' : q.choices.find(c => !q.acceptedAnswers.includes(c.id)).id;

function captured(wordId = WORD) {
  const s = newGame(T0, 3);
  markLessonDone(s, content, 'l-letters', T0);
  markLessonDone(s, content, 'l-meaning', T0);
  markLessonDone(s, content, 'l-finals', T0);
  startEncounter(s, content, wordId, 'capture', T0);
  completeStudy(s, wordId, T0);
  for (const family of CAPTURE_FAMILIES) {
    const q = openQuestion(s, content, family, T0);
    submit(s, content, rightAnswer(q), T0);
  }
  return s;
}

const reviewRight = (s, at, wordId = WORD) => {
  const q = startReview(s, content, wordId, at);
  assert.ok(q, 'a fresh review question exists');
  return { q, ...submit(s, content, rightAnswer(q), at) };
};

test('a captured word is not due until a day later', () => {
  const s = captured();
  assert.equal(reviewEligible(s.words[WORD], T0 + DAY - 1), false);
  assert.equal(reviewEligible(s.words[WORD], T0 + DAY), true);
  assert.deepEqual(dueWords(s, T0 + DAY), [WORD]);
});

test('leaving a review after a hint finalizes it as assisted; leaving before any hint costs nothing', () => {
  const s = captured();
  const at = T0 + DAY;
  startReview(s, content, WORD, at);
  retreat(s, content, at);
  assert.deepEqual(s.words[WORD].reviewOutcomes, []);
  assert.equal(s.words[WORD].lastReviewAt, null);

  startReview(s, content, WORD, at);
  useHint(s, content);
  retreat(s, content, at);
  assert.deepEqual(s.words[WORD].reviewOutcomes, [0]);
  assert.equal(s.words[WORD].dueAt, at + DAY);
});

test('capture steps are not reviews, and practice cannot change the schedule', () => {
  const s = captured();
  const r = s.words[WORD];
  const before = r.dueAt;
  startEncounter(s, content, WORD, 'practice', T0 + 10);
  const q = openQuestion(s, content, 'read-letter', T0 + 10);
  submit(s, content, rightAnswer(q), T0 + 10);
  assert.equal(r.dueAt, before);
  assert.equal(r.stage, 0);
  assert.equal(r.evidence.length, 0);
  assert.equal(statusOf(r), 'Captured');
});

test('an independent review advances the 1/2/4/7/14/30 ladder and marks the word Practiced', () => {
  const s = captured();
  const at = T0 + DAY;
  const r = reviewRight(s, at);
  assert.equal(r.independent, true);
  const rec = s.words[WORD];
  assert.equal(rec.stage, 1);
  assert.equal(rec.dueAt, at + 2 * DAY);
  assert.equal(rec.lastReviewAt, at);
  assert.deepEqual(rec.reviewOutcomes, [1]);
  assert.equal(statusOf(rec), 'Practiced');
});

test('the 20-hour gap holds across a UTC midnight, and a second review the same day is refused', () => {
  const s = captured();
  const r = s.words[WORD];
  r.dueAt = T0;
  r.lastReviewAt = T0 - MIN_REVIEW_GAP + 1;
  r.reviewDays = [Math.floor((T0 - 86_400_000) / DAY)];
  assert.equal(reviewEligible(r, T0), false, 'new UTC day but under 20 hours');
  r.lastReviewAt = T0 - MIN_REVIEW_GAP;
  assert.equal(reviewEligible(r, T0), true);
  r.reviewDays.push(Math.floor(T0 / DAY));
  assert.equal(reviewEligible(r, T0), false, 'one finalized review per UTC day');
});

test('a wrong review drops a stage, comes back in a day, and keeps the capture', () => {
  const s = captured();
  reviewRight(s, T0 + DAY);
  const at = T0 + 3 * DAY;
  const q = startReview(s, content, WORD, at);
  const out = submit(s, content, wrongAnswer(q), at);
  assert.equal(out.correct, false);
  const r = s.words[WORD];
  assert.equal(r.stage, 0);
  assert.equal(r.dueAt, at + DAY);
  assert.deepEqual(r.reviewOutcomes, [1, 0]);
  assert.equal(r.capturedAt, T0);
  assert.ok(s.party.includes(WORD));
});

test('a hinted correct review counts as a failed opportunity and earns no evidence', () => {
  const s = captured();
  const at = T0 + DAY;
  const q = startReview(s, content, WORD, at);
  useHint(s, content);
  const out = submit(s, content, rightAnswer(q), at);
  assert.equal(out.correct, true);
  assert.equal(out.independent, false);
  const r = s.words[WORD];
  assert.equal(r.stage, 0);
  assert.equal(r.evidence.length, 0);
  assert.deepEqual(r.reviewOutcomes, [0]);
  assert.equal(r.dueAt, at + DAY);
});

test('a second submit on a finalized attempt is ignored', () => {
  const s = captured();
  const q = startReview(s, content, WORD, T0 + DAY);
  submit(s, content, rightAnswer(q), T0 + DAY);
  assert.equal(submit(s, content, rightAnswer(q), T0 + DAY), null);
  assert.equal(s.words[WORD].reviewOutcomes.length, 1);
});

test('consecutive reviews change task and context, and skip the last three stems shown', () => {
  const s = captured();
  let at = T0 + DAY;
  const shown = [];
  for (let i = 0; i < 4; i++) {
    const { q } = reviewRight(s, at);
    shown.push(q);
    at = s.words[WORD].dueAt;
  }
  for (let i = 1; i < shown.length; i++) {
    assert.notEqual(shown[i].taskFamily, shown[i - 1].taskFamily);
    assert.notEqual(shown[i].contextId, shown[i - 1].contextId);
  }
  assert.equal(new Set(shown.slice(0, 3).map(q => q.semanticStemId)).size, 3);
});

test('no fresh prompt means no credit and an unchanged schedule', () => {
  const s = captured();
  const r = s.words[WORD];
  // The last review used this family, and it is the only family left in this cut-down bank.
  r.lastReview = { family: 'read-letter', contextId: 'ctx-recall' };
  const sparse = { ...content, questions: content.questions.filter(q => q.wordId === WORD && q.taskFamily === 'read-letter') };
  const before = [r.dueAt, r.stage];
  assert.equal(startReview(s, sparse, WORD, T0 + DAY), null);
  assert.deepEqual([r.dueAt, r.stage], before);
  assert.equal(s.encounter, null);
});

test('mastery needs four independent reviews on four days across three families and contexts', () => {
  const s = captured();
  const r = s.words[WORD];
  let at = T0 + DAY;
  for (let i = 0; i < 3; i++) {
    reviewRight(s, at);
    at = r.dueAt;
    assert.notEqual(statusOf(r), 'Mastered', `not after ${i + 1} reviews`);
  }
  reviewRight(s, at);
  assert.equal(statusOf(r), 'Mastered');
  assert.equal(r.masteredAt, at);
  assert.equal(new Set(r.reviewDays).size, 4);
});

test('three successes in a day, or all on one family, never reach mastery', () => {
  const s = captured();
  const r = s.words[WORD];
  // Same-day attempts are refused outright.
  reviewRight(s, T0 + DAY);
  assert.equal(startReview(s, content, WORD, T0 + DAY + 1000), null);
  // Evidence from one family only is not enough even on four days.
  r.evidence = [1, 2, 3, 4].map(i => ({ at: T0 + i * DAY, taskFamily: 'read-letter', contextId: `ctx-${i}`, templateId: 't', semanticStemId: `s${i}`, responseMode: 'recognition' }));
  r.reviewDays = [1, 2, 3, 4];
  r.reviewOutcomes = [1, 1, 1, 1];
  assert.equal(statusOf(r), 'Practiced');
});

test('a later lapse demotes current status but keeps masteredAt, collection and evidence', () => {
  const s = captured();
  const r = s.words[WORD];
  let at = T0 + DAY;
  for (let i = 0; i < 4; i++) { reviewRight(s, at); at = r.dueAt; }
  assert.equal(statusOf(r), 'Mastered');
  const masteredAt = r.masteredAt;
  const q = startReview(s, content, WORD, at);
  submit(s, content, wrongAnswer(q), at);
  assert.equal(statusOf(r), 'Practiced');
  assert.equal(r.masteredAt, masteredAt);
  assert.equal(r.evidence.length, 4);
  assert.notEqual(r.capturedAt, null);
});

test('being overdue alone never demotes or fails a word', () => {
  const s = captured();
  reviewRight(s, T0 + DAY);
  const before = statusOf(s.words[WORD]);
  assert.deepEqual(dueWords(s, T0 + 400 * DAY), [WORD]);
  assert.equal(statusOf(s.words[WORD]), before);
});

test('a clock moved backward pauses eligibility and creates no success', () => {
  const s = captured();
  const r = s.words[WORD];
  reviewRight(s, T0 + DAY);
  assert.equal(reviewEligible(r, T0), false);
  assert.equal(r.evidence.length, 1);
});

test('encounters mix due reviews in, and never surface a word whose skills are not taught', () => {
  const s = newGame(T0, 11);
  markLessonDone(s, content, 'l-letters', T0);
  setFlag(s, 'seedDone');
  const withFinals = new Set(content.words.filter(w => w.requires.includes('final-forms')).map(w => w.id));
  for (let i = 0; i < 200; i++) assert.ok(!withFinals.has(chooseEncounter(s, content, 'r1').wordId));

  const c = captured();
  setFlag(c, 'seedDone');
  const kinds = new Set();
  for (let i = 0; i < 200; i++) {
    const pick = chooseEncounter(c, content, 'r1', T0 + DAY);
    kinds.add(pick.kind);
    if (pick.kind === 'review') assert.equal(pick.wordId, WORD);
  }
  assert.deepEqual([...kinds].sort(), ['capture', 'review']);
});
