import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame, markLessonDone, interact, setFlag, BADGE_ID } from '../src/engine.js';
import { content } from '../src/content.js';
import { currentPuzzle, answerPuzzle, startBadgeRun, openBadgeQuestion, submitBadgeAnswer, useBadgeHint, badgeProgress } from '../src/checkpoints.js';
import { startEncounter, completeStudy, openQuestion, submit, CAPTURE_FAMILIES } from '../src/learning.js';

const NOW = 1_800_000_000_000;
const rightAnswer = q => q.format === 'tokens' ? q.acceptedSequences[0] : q.acceptedAnswers[0];
const wrongAnswer = q => q.format === 'tokens' ? [] : q.format === 'type' ? 'wrong' : q.choices.find(c => !q.acceptedAnswers.includes(c.id)).id;

function prepared(captures = 3) {
  const s = newGame(NOW, 5);
  for (const id of ['l-letters', 'l-meaning', 'l-finals']) markLessonDone(s, content, id, NOW);
  for (const id of content.words.slice(0, captures).map(w => w.id)) {
    startEncounter(s, content, id, 'capture', NOW);
    completeStudy(s, id, NOW);
    for (const family of CAPTURE_FAMILIES) submit(s, content, rightAnswer(openQuestion(s, content, family, NOW)), NOW);
  }
  return s;
}

// Past Neri and the Field Gate, which the quest asks for before the trial.
function atTrial() {
  const s = prepared();
  Object.assign(s.flags, { neriCleared: true, gateOpen: true, doorOpen: 'door-m' });
  return s;
}

test('Neri offers the challenge only when the lesson and captures are in place', () => {
  const s = newGame(NOW, 5);
  Object.assign(s, { map: 'grove', x: 17, y: 15, dir: 'up' });
  assert.equal(interact(s, content, NOW).then, undefined);
  const ready = prepared();
  Object.assign(ready, { map: 'grove', x: 17, y: 15, dir: 'up' });
  assert.deepEqual(interact(ready, content, NOW).then, { type: 'puzzle', group: 'neri' });
});

test('a wrong puzzle answer explains and offers a different question; the right one sets the flag', () => {
  const s = prepared();
  const q = currentPuzzle(s, content, 'neri');
  const wrong = answerPuzzle(s, content, 'neri', wrongAnswer(q), NOW);
  assert.equal(wrong.correct, false);
  assert.ok(wrong.explanation.length > 5);
  assert.equal(s.flags.neriCleared, undefined);
  const next = currentPuzzle(s, content, 'neri');
  assert.notEqual(next.id, q.id);
  assert.equal(answerPuzzle(s, content, 'neri', rightAnswer(next), NOW).correct, true);
  assert.equal(s.flags.neriCleared, true);
});

test('the gate opens only the door the riddle names, and wrong doors turn the stone', () => {
  const s = prepared();
  setFlag(s, 'neriCleared');
  const riddle = currentPuzzle(s, content, 'gate');
  const wrongDoor = riddle.choices.find(c => !riddle.acceptedAnswers.includes(c.id)).id;
  assert.equal(answerPuzzle(s, content, 'gate', wrongDoor, NOW).correct, false);
  assert.equal(s.flags.gateOpen, undefined);
  const turned = currentPuzzle(s, content, 'gate');
  assert.notEqual(turned.id, riddle.id);
  assert.equal(answerPuzzle(s, content, 'gate', turned.acceptedAnswers[0], NOW).correct, true);
  assert.equal(s.flags.gateOpen, true);
  assert.equal(s.flags.doorOpen, turned.acceptedAnswers[0]);
});

test('puzzle answers never count toward capture or review evidence', () => {
  const s = prepared(0);
  setFlag(s, 'neriCleared');
  answerPuzzle(s, content, 'gate', currentPuzzle(s, content, 'gate').acceptedAnswers[0], NOW);
  assert.equal(Object.keys(s.words).length, 0);
});

test('the badge is refused until its skills and captures are met', () => {
  const s = prepared(2);
  const run = startBadgeRun(s, content, 'r1', NOW);
  assert.equal(run.ok, false);
  assert.match(run.reason, /captured/);
  assert.equal(s.badgeRun, null);
});

test('the badge needs four correct answers across all three task families, on words outside the vocabulary', () => {
  const s = atTrial();
  assert.equal(startBadgeRun(s, content, 'r1', NOW).ok, true);
  const seen = [];
  let out;
  for (;;) {
    const q = openBadgeQuestion(s, content, NOW);
    assert.ok(q, 'a question is available');
    assert.equal(q.wordId, null, 'badge items are not capture vocabulary');
    seen.push(q);
    out = submitBadgeAnswer(s, content, rightAnswer(q), NOW);
    if (out.awarded) break;
  }
  assert.ok(seen.length >= 4);
  assert.deepEqual(new Set(seen.map(q => q.taskFamily)).size, 3);
  assert.ok(s.badges[BADGE_ID]);
  assert.deepEqual(s.badges[BADGE_ID].questionIds, seen.map(q => q.id));
  assert.equal(s.badgeRun, null);
});

test('a wrong trial answer explains and retires the stem; a hinted one earns nothing', () => {
  const s = atTrial();
  startBadgeRun(s, content, 'r1', NOW);
  const q = openBadgeQuestion(s, content, NOW);
  const out = submitBadgeAnswer(s, content, wrongAnswer(q), NOW);
  assert.equal(out.correct, false);
  assert.ok(out.explanation);
  const next = openBadgeQuestion(s, content, NOW);
  assert.notEqual(next.id, q.id);
  assert.equal(useBadgeHint(s, content), next.hint);
  const hinted = submitBadgeAnswer(s, content, rightAnswer(next), NOW);
  assert.equal(hinted.correct, true);
  assert.equal(badgeProgress(s, content).correct, 0);
});

test('leaving and re-entering the trial resumes the hinted question, so a hint cannot be laundered', () => {
  const s = atTrial();
  startBadgeRun(s, content, 'r1', NOW);
  const first = openBadgeQuestion(s, content, NOW);
  submitBadgeAnswer(s, content, rightAnswer(first), NOW);
  const hinted = openBadgeQuestion(s, content, NOW);
  useBadgeHint(s, content);

  assert.equal(startBadgeRun(s, content, 'r1', NOW).ok, true);
  assert.equal(openBadgeQuestion(s, content, NOW).id, hinted.id);
  assert.equal(s.badgeRun.current.hintsUsed, 1);
  assert.deepEqual(s.badgeRun.correct, [first.id], 'earned answers are kept');

  const out = submitBadgeAnswer(s, content, rightAnswer(hinted), NOW);
  assert.equal(out.correct, true);
  assert.equal(out.independent, false);
  assert.deepEqual(s.badgeRun.correct, [first.id]);
  assert.notEqual(openBadgeQuestion(s, content, NOW).id, hinted.id, 'a fresh question follows');
});

test('running out of trial questions is not a dead end: leave, explore and try again', () => {
  const s = atTrial();
  startBadgeRun(s, content, 'r1', NOW);
  for (let q; (q = openBadgeQuestion(s, content, NOW));) submitBadgeAnswer(s, content, wrongAnswer(q), NOW);
  assert.equal(openBadgeQuestion(s, content, NOW), null);
  assert.equal(s.badges[BADGE_ID], undefined);
  s.badgeRun = null;
  s.interactions += 2;
  assert.equal(startBadgeRun(s, content, 'r1', NOW).ok, true);
  assert.ok(openBadgeQuestion(s, content, NOW), 'stems return in a later run');
});
