// Generic region rules, run on the labeled synthetic fixture (see fixtures/campaign-fixture.mjs).
// These prove code paths for data of the contract's shape, not the real campaign's content.
import test from 'node:test';
import assert from 'node:assert/strict';
import { campaignFixture } from './fixtures/campaign-fixture.mjs';
import { content as realContent } from '../src/content.js';
import { MAPS, REGION_MAPS, OBJECTS } from '../src/world.js';
import {
  newGame, markLessonDone, chooseEncounter, tryMove, interact, objective, currentStage, missingForBadge, isDone,
  regionUnlocked, capturedIn, activeRegion, nextLesson, promptFor,
} from '../src/engine.js';
import {
  startEncounter, completeStudy, openQuestion, submit, commandStates, CAPTURE_FAMILIES, DAY, startReview, knowledgeRank, abilityOf,
  addToParty, removeFromParty, answerRelatedForm, nextRelatedForm, unlockedExamples, statusOf, retreat,
} from '../src/learning.js';
import { parseImport, exportText } from '../src/storage.js';
import {
  gatePool, gateRequired, gateReady, openGate, useGateHint, submitGate, setGateResponseMode, gateProgress, startBadgeRun, openBadgeQuestion,
  submitBadgeAnswer, useBadgeHint, claimSecret, restoreArchive, wardCandidates, completeReadingWithoutQuestions, currentPuzzle, answerPuzzle,
} from '../src/checkpoints.js';

const content = campaignFixture();
const T0 = Date.UTC(2027, 0, 4, 12);
const right = q => {
  if (q.format === 'tokens') return q.acceptedSequences[0];
  if (q.format === 'match') return q.pairs.map(p => p.right);
  return q.acceptedAnswers[0];
};
const wrong = q => {
  if (q.format === 'tokens') return [];
  if (q.format === 'match') return [];
  if (q.format === 'type') return 'wrong';
  return q.choices.find(c => !q.acceptedAnswers.includes(c.id)).id;
};

function capture(s, wordId, at = T0) {
  startEncounter(s, content, wordId, 'capture', at);
  completeStudy(s, wordId, at);
  for (const family of CAPTURE_FAMILIES) {
    const q = openQuestion(s, content, family, at);
    assert.ok(q, `${wordId} ${family}`);
    submit(s, content, right(q), at);
  }
  assert.ok(s.words[wordId].capturedAt);
}

const R1_LESSONS = ['l-letters', 'l-meaning', 'l-finals'];
function afterR1() {
  const s = newGame(T0, 5);
  for (const id of R1_LESSONS) markLessonDone(s, content, id, T0);
  for (const w of content.regionById.get('r1').wordIds.slice(0, 3)) capture(s, w);
  s.flags.neriCleared = true; s.flags.gateOpen = true; s.flags.doorOpen = 'door-m';
  s.flags.seedDone = true;
  startBadgeRun(s, content, 'r1', T0);
  for (let q; (q = openBadgeQuestion(s, content, T0));) if (submitBadgeAnswer(s, content, right(q), T0).awarded) break;
  assert.ok(s.badges['b-reed-seal']);
  s.flags.exitOpened = true;
  return s;
}
const r2 = content.regionById.get('r2');

function clearGate(s, key, at = T0) {
  for (let guard = 0; guard < 12 && !isDone(s, key); guard++) {
    const q = openGate(s, content, key, at);
    assert.ok(q, `a question for ${key}`);
    submitGate(s, content, right(q), at);
  }
  assert.ok(isDone(s, key), key);
}

function r2Ready() {
  const s = afterR1();
  markLessonDone(s, content, r2.lessonIds[0], T0);
  capture(s, r2.wordIds[0]);
  markLessonDone(s, content, r2.lessonIds[1], T0);
  capture(s, r2.wordIds[1]);
  capture(s, r2.wordIds[2]);
  return s;
}

test('regions unlock only through their badge prerequisites, with real r1 as the only region in shipped data', () => {
  assert.equal(realContent.regions.length, 1, 'the source lane ships r1 data only');
  const s = newGame(T0, 1);
  assert.equal(regionUnlocked(s, content, 'r1'), true);
  assert.equal(regionUnlocked(s, content, 'r2'), false);
  s.badges['b-reed-seal'] = { at: T0, questionIds: [] };
  assert.equal(regionUnlocked(s, content, 'r2'), true);
  assert.equal(regionUnlocked(s, realContent, 'r2'), false, 'a region with no data is never unlocked');
});

test('a region exit refuses without its badge, opens with it, then walks to the next region', () => {
  const s = afterR1();
  delete s.flags.exitOpened;
  Object.assign(s, { map: 'grove', x: 27, y: 1, dir: 'up' });
  const opened = tryMove(s, 'up', content, T0);
  assert.equal(opened.event.type, 'exit-open');
  assert.equal(opened.moved, false);
  assert.equal(s.flags.exitOpened, true);
  const walked = tryMove(s, 'up', content, T0);
  assert.equal(walked.moved, true);
  assert.equal(s.map, 'springs');
  assert.deepEqual([s.x, s.y], [MAPS.springs.arrive.x, MAPS.springs.arrive.y]);
  assert.equal(walked.event.type, 'region-enter');

  // With only real r1 data, the arch still opens and goes nowhere, as accepted.
  const only = afterR1();
  Object.assign(only, { map: 'grove', x: 27, y: 1, dir: 'up' });
  assert.equal(tryMove(only, 'up', realContent, T0).event.type, 'exit-open');
  assert.equal(only.map, 'grove');
});

test('a later region has its own sealed exit, and it records rN:exit rather than a raw flag', () => {
  const s = r2Ready();
  const exitAt = MAPS.springs.exitFront;
  Object.assign(s, { map: 'springs', ...exitAt, dir: 'up' });
  assert.equal(tryMove(s, 'up', content, T0).event.type, 'exit-sealed');
  s.badges['bfx-r2'] = { at: T0, questionIds: [] };
  assert.equal(tryMove(s, 'up', content, T0).event.type, 'exit-open');
  assert.deepEqual(s.gates['r2:exit'], { at: T0, questionIds: [] });
  assert.equal(s.flags['r2:exit'], undefined);
  assert.equal(tryMove(s, 'up', content, T0).moved, true);
  assert.equal(s.map, 'market');
});

test('walking back across a region border returns to the earlier region', () => {
  const s = afterR1();
  Object.assign(s, { map: 'springs', ...MAPS.springs.arrive, dir: 'down' });
  assert.equal(tryMove(s, 'down', content, T0).moved, true);
  assert.deepEqual([s.map, s.x, s.y], ['grove', 27, 1]);
});

test('quest stages read real state by kind, including lesson, capture, puzzle, duel, reading and exit', () => {
  const s = afterR1();
  const quest = r2.questId;
  const ids = () => currentStage(s, content, quest).id;
  assert.equal(ids(), 'learn');
  markLessonDone(s, content, r2.lessonIds[0], T0);
  assert.equal(ids(), 'first');
  capture(s, r2.wordIds[0]);
  assert.equal(ids(), 'learn2');
  markLessonDone(s, content, r2.lessonIds[1], T0);
  assert.equal(ids(), 'three');
  capture(s, r2.wordIds[1]);
  assert.equal(ids(), 'three', 'captures from r1 do not count for this region');
  capture(s, r2.wordIds[2]);
  assert.equal(ids(), 'rival');
  clearGate(s, 'r2:rival');
  assert.equal(ids(), 'gate');
  clearGate(s, 'r2:gate');
  assert.equal(ids(), 'read');
  clearGate(s, 'read:pfx-r2');
  assert.equal(ids(), 'badge');
  assert.match(objective(s, content), /Fixture: earn the badge in r2/);
});

test('capture counts are scoped to the region, and to named words when a stage names them', () => {
  const s = afterR1();
  assert.equal(capturedIn(s, content, 'r1'), 3);
  assert.equal(capturedIn(s, content, 'r2'), 0);
  assert.ok(missingForBadge(s, content, 'r2').some(line => /3 more captured/.test(line)), 'badge captures are per region');
  const named = { ...content, questById: new Map(content.questById) };
  const quest = structuredClone(content.questById.get(r2.questId));
  markLessonDone(s, content, r2.lessonIds[0], T0);
  quest.stages[1] = { id: 'named', text: 'x', kind: 'capture', targetIds: [r2.wordIds[1]], requiredCount: 1 };
  named.questById.set(r2.questId, quest);
  capture(s, r2.wordIds[0]);
  assert.equal(currentStage(s, named, r2.questId).id, 'named', 'a different word does not satisfy a named target');
});

test('the objective follows the first unfinished region, and the real r1 ending still says where the build stops', () => {
  const s = afterR1();
  assert.match(objective(s, content), /Fixture: learn from the mentor in r2/);
  assert.equal(activeRegion(s, content).id, 'r2');
  assert.match(objective(s, realContent), /build ends here/);
});

test('mentors teach their region lessons in order, and only when the quest has reached them', () => {
  const s = afterR1();
  assert.equal(nextLesson(s, content, 'r2'), r2.lessonIds[0]);
  markLessonDone(s, content, r2.lessonIds[0], T0);
  assert.equal(nextLesson(s, content, 'r2'), null, 'the second lesson waits for its quest stage');
  capture(s, r2.wordIds[0]);
  assert.equal(nextLesson(s, content, 'r2'), r2.lessonIds[1]);
  Object.assign(s, { map: REGION_MAPS.r2.house, x: 5, y: 3, dir: 'up' });
  const talk = interact(s, content, T0);
  assert.equal(talk.kind, 'dialogue');
  assert.equal(talk.speaker, 'Mentor r2', 'the mentor name comes from lesson data');
  assert.deepEqual(talk.then, { type: 'lesson', id: r2.lessonIds[1] });
});

test('encounter tiles stay quiet before the region lesson, then seed a word, and never offer an uneligible word', () => {
  const s = afterR1();
  const reed = { map: 'springs', x: 19, y: 19 };
  Object.assign(s, { map: 'springs', x: 19, y: 18, dir: 'down' });
  assert.equal(tryMove(s, 'down', content, T0).event.type, 'reeds-silent');
  markLessonDone(s, content, r2.lessonIds[0], T0);
  Object.assign(s, { ...reed, y: 18, dir: 'down' });
  const seeded = tryMove(s, 'down', content, T0);
  assert.deepEqual(seeded.event, { type: 'encounter', wordId: r2.seedWordId, kind: 'capture' });

  const needsB = new Set(content.words.filter(w => w.requires.includes('fx-r2-b')).map(w => w.id));
  assert.ok(needsB.size);
  startEncounter(s, content, r2.seedWordId, 'capture', T0);
  retreat(s, content, T0);
  for (let i = 0; i < 300; i++) {
    const pick = chooseEncounter(s, content, 'r2', T0);
    assert.ok(!needsB.has(pick.wordId), `${pick.wordId} needs an untaught skill`);
  }
});

test('due words from earlier regions mix into later regions, with only taught questions', () => {
  const s = r2Ready();
  const later = T0 + DAY + 1;
  const kinds = new Set();
  const wordsSeen = new Set();
  for (let i = 0; i < 400; i++) {
    const pick = chooseEncounter(s, content, 'r2', later);
    kinds.add(pick.kind);
    wordsSeen.add(pick.wordId);
  }
  assert.ok(kinds.has('review'));
  assert.ok([...wordsSeen].some(id => content.wordById.get(id).regionIds[0] === 'r1'), 'r1 reviews appear in r2');
  const q = startReview(s, content, content.regionById.get('r1').wordIds[0], later);
  assert.ok(q.requires.every(skill => s.skills[skill]));
});

test('a question with an untaught skill is never served by an encounter command, puzzle, gate or badge', () => {
  const s = afterR1();
  markLessonDone(s, content, r2.lessonIds[0], T0);
  const word = r2.wordIds[0];
  startEncounter(s, content, word, 'capture', T0);
  completeStudy(s, word, T0);
  const states = commandStates(s, content, word);
  assert.equal(states.analyze, undefined, 'Analyze is not offered before its lesson');
  assert.equal(states.build, undefined, 'Build is not offered before its lesson');
  retreat(s, content, T0);
  assert.equal(gateReady(s, content, 'r2:rival').ok, false);
  assert.equal(openGate(s, content, 'r2:rival', T0), null);
  assert.equal(s.attempt, null);
  const run = startBadgeRun(s, content, 'r2', T0);
  assert.equal(run.ok, false);
  assert.equal(s.badgeRun, null);
});

test('Analyze and Build arrive with their lesson, and never fill a capture step', () => {
  const s = afterR1();
  markLessonDone(s, content, r2.lessonIds[0], T0);
  markLessonDone(s, content, r2.lessonIds[1], T0);
  const word = r2.wordIds[0];
  startEncounter(s, content, word, 'capture', T0);
  completeStudy(s, word, T0);
  const states = commandStates(s, content, word);
  assert.equal(states.analyze.enabled, true);
  assert.equal(states.build.enabled, true);
  const q = openQuestion(s, content, states.analyze.family, T0);
  assert.equal(q.command, 'analyze');
  const out = submit(s, content, right(q), T0);
  assert.equal(out.independent, true);
  assert.equal(s.words[word].captureSteps.length, 0, 'the three required demonstrations stay separate');
  assert.ok(s.encounter, 'the encounter continues');
});

test('walking alone recovers a word whose stems were all missed: no permanent exhaustion', () => {
  const s = afterR1();
  markLessonDone(s, content, r2.lessonIds[0], T0);
  const word = r2.wordIds[0];
  startEncounter(s, content, word, 'capture', T0);
  completeStudy(s, word, T0);
  for (let q; (q = openQuestion(s, content, 'read-letter', T0));) submit(s, content, wrong(q), T0);
  assert.equal(commandStates(s, content, word).read.enabled, false);
  retreat(s, content, T0);
  startEncounter(s, content, word, 'capture', T0);
  retreat(s, content, T0);
  startEncounter(s, content, word, 'capture', T0);
  assert.equal(commandStates(s, content, word).read.enabled, true, 'starting new encounters is enough');
  assert.equal(submit(s, content, right(openQuestion(s, content, 'read-letter', T0)), T0).independent, true);
});

test('rival duels need several fresh correct answers, and a miss explains and moves on', () => {
  const s = r2Ready();
  assert.equal(gatePool(content, 'r2:rival').length, 6);
  assert.equal(gateRequired(content, 'r2:rival'), 2);
  assert.equal(gateRequired(content, 'r5:rival'), 3);
  assert.equal(gateRequired(content, 'r2:gate'), 1);
  const first = openGate(s, content, 'r2:rival', T0);
  const missed = submitGate(s, content, wrong(first), T0);
  assert.equal(missed.correct, false);
  assert.ok(missed.explanation);
  assert.equal(s.attempt, null);
  const second = openGate(s, content, 'r2:rival', T0);
  assert.notEqual(second.id, first.id, 'a fresh question, not the one just explained');
  submitGate(s, content, right(second), T0);
  assert.deepEqual(gateProgress(s, content, 'r2:rival'), { correct: 1, required: 2 });
  assert.equal(isDone(s, 'r2:rival'), false);
  const third = openGate(s, content, 'r2:rival', T0);
  const won = submitGate(s, content, right(third), T0);
  assert.equal(won.cleared, true);
  assert.deepEqual(s.gates['r2:rival'], { at: T0, questionIds: [second.id, third.id] });
  assert.equal(s.gateCredit['r2:rival'], undefined);
});

test('a hint cannot clear a gate, and survives leaving and coming back', () => {
  const s = r2Ready();
  clearGate(s, 'r2:rival');
  const q = openGate(s, content, 'r2:gate', T0);
  assert.equal(useGateHint(s, content), q.hint);
  assert.equal(openGate(s, content, 'r2:gate', T0).id, q.id, 'leaving and returning resumes the same attempt');
  assert.equal(s.attempt.hintsUsed, 1);
  const out = submitGate(s, content, right(q), T0);
  assert.equal(out.correct, true);
  assert.equal(out.independent, false);
  assert.equal(isDone(s, 'r2:gate'), false);
  const next = openGate(s, content, 'r2:gate', T0);
  assert.notEqual(next.id, q.id);
  assert.equal(submitGate(s, content, right(next), T0).cleared, true);
});

test('switching to another gate cannot launder a hint: the hinted question retires', () => {
  const extra = { ...content, regionById: new Map(content.regionById) };
  extra.regionById.set('r2', { ...r2, puzzleQuestionIds: { ...r2.puzzleQuestionIds, env: r2.puzzleQuestionIds.gate } });
  const s = r2Ready();
  const hinted = openGate(s, extra, 'r2:rival', T0);
  useGateHint(s, extra);
  assert.ok(openGate(s, extra, 'r2:env', T0));
  assert.equal(s.attempt.key, 'r2:env');
  assert.ok(s.retiredCheckpoints[hinted.id], 'the exposed question is retired');
  assert.notEqual(openGate(s, extra, 'r2:rival', T0).id, hinted.id);
});

test('type questions in a gate follow the response mode, and recognition is honest', () => {
  const pool = { ...content, regionById: new Map(content.regionById) };
  const typed = content.questions.find(q => q.id === 'bfx-r2-5');
  pool.regionById.set('r2', { ...r2, puzzleQuestionIds: { neri: r2.puzzleQuestionIds.neri, gate: [typed.id] } });
  const s = r2Ready();
  s.gates['r2:rival'] = { at: T0, questionIds: [] };
  openGate(s, pool, 'r2:gate', T0);
  assert.equal(s.attempt.responseMode, 'typing');
  setGateResponseMode(s, 'recognition');
  assert.equal(s.attempt.responseMode, 'recognition');
  assert.equal(submitGate(s, pool, typed.recognitionAccepted[0], T0).cleared, true);
});

test('r1 puzzles skip questions whose skills are not taught, and a fully gated pool offers nothing', () => {
  const s = newGame(T0, 1);
  assert.equal(currentPuzzle(s, realContent, 'neri'), null, 'the r1 pool needs final-forms');
  for (const id of R1_LESSONS) markLessonDone(s, realContent, id, T0);
  assert.equal(currentPuzzle(s, realContent, 'neri').id, 'p-neri-1');
  assert.equal(answerPuzzle(s, realContent, 'neri', 'c0', T0).correct, true);
});

test('a badge trial is scoped to its region: other-region runs never carry over', () => {
  const s = r2Ready();
  s.badgeRun = { id: 1, regionId: 'r1', correct: ['b-final-1'], current: { questionId: 'b-spell-1', hintsUsed: 1, startedAt: T0, responseMode: 'recognition' } };
  assert.equal(startBadgeRun(s, content, 'r2', T0).ok, true);
  assert.equal(s.badgeRun.regionId, 'r2');
  assert.deepEqual(s.badgeRun.correct, []);
  assert.equal(s.badgeRun.current, null);
});

test('a badge is refused for a locked region even with everything else in place, and never reopens once earned', () => {
  const s = r2Ready();
  assert.equal(startBadgeRun(s, content, 'r3', T0).ok, false);
  startBadgeRun(s, content, 'r2', T0);
  for (let q; (q = openBadgeQuestion(s, content, T0));) if (submitBadgeAnswer(s, content, right(q), T0).awarded) break;
  assert.ok(s.badges['bfx-r2']);
  assert.equal(new Set(s.badges['bfx-r2'].questionIds).size, s.badges['bfx-r2'].questionIds.length);
  assert.equal(startBadgeRun(s, content, 'r2', T0).ok, false, 'an earned badge has no second run');
});

test('badge questions filter by skill too, and a hinted badge answer earns nothing across formats', () => {
  const s = r2Ready();
  startBadgeRun(s, content, 'r2', T0);
  const seen = new Set();
  for (let guard = 0; guard < 20 && !s.badges['bfx-r2']; guard++) {
    const q = openBadgeQuestion(s, content, T0);
    assert.ok(q.requires.every(skill => s.skills[skill]));
    seen.add(q.format);
    if (guard === 0) {
      useBadgeHint(s, content);
      assert.equal(submitBadgeAnswer(s, content, right(q), T0).independent, false);
      assert.deepEqual(s.badgeRun.correct, []);
      continue;
    }
    submitBadgeAnswer(s, content, right(q), T0);
  }
  assert.ok(s.badges['bfx-r2']);
});

test('XP comes from varied use only: repeating a stem earns nothing more', () => {
  const s = r2Ready();
  const id = r2.wordIds[0];
  addToParty(s, id);
  assert.ok(s.party.includes(id));
  const practice = family => {
    startEncounter(s, content, id, 'practice', T0);
    const q = openQuestion(s, content, family, T0);
    submit(s, content, right(q), T0);
    retreat(s, content, T0);
    return q;
  };
  const first = practice('fx-analyze');
  assert.equal(s.words[id].xp, 1);
  assert.deepEqual(s.words[id].xpStems, [first.semanticStemId]);
  practice('fx-analyze');
  assert.equal(s.words[id].xp, 1, 'the same task again is not new use');
  practice('fx-build');
  assert.equal(s.words[id].xp, 2);
});

test('knowledge grows from varied use and related forms, and the word itself never changes', () => {
  const s = r2Ready();
  const id = r2.wordIds[0];
  const word = content.wordById.get(id);
  addToParty(s, id);
  assert.equal(knowledgeRank(s.words[id], word, content), 1);
  for (const family of ['fx-analyze', 'fx-build']) {
    startEncounter(s, content, id, 'practice', T0);
    submit(s, content, right(openQuestion(s, content, family, T0)), T0);
    retreat(s, content, T0);
  }
  assert.equal(knowledgeRank(s.words[id], word, content), 2);
  assert.ok(unlockedExamples(s, content, id).length >= 1, 'rank 2 unlocks attested lines');
  assert.deepEqual(unlockedExamples(s, content, r2.wordIds[1]), [], 'rank 1 has none');
  for (const family of ['read-letter', 'understand-meaning']) {
    startEncounter(s, content, id, 'practice', T0);
    const q = openQuestion(s, content, family, T0);
    submit(s, content, right(q), T0);
    retreat(s, content, T0);
  }
  assert.equal(knowledgeRank(s.words[id], word, content), 2, 'a related form is still unknown');
  const form = nextRelatedForm(s, content, id);
  assert.equal(form.hebrew, word.relatedForms[0].hebrew);
  const before = structuredClone(word);
  const out = answerRelatedForm(s, content, id, form.tokenId, form.relationship, T0);
  assert.equal(out.correct, true);
  assert.equal(knowledgeRank(s.words[id], word, content), 3);
  assert.deepEqual(word, before);
  assert.equal(s.words[id].formsKnown[0], form.tokenId);
});

test('a missed related form explains and waits before it can be retried, without losing anything', () => {
  const s = r2Ready();
  const id = r2.wordIds[0];
  const form = nextRelatedForm(s, content, id);
  const out = answerRelatedForm(s, content, id, form.tokenId, 'derivation', T0);
  assert.equal(out.correct, false);
  assert.match(out.explanation, /inflection|same word/i);
  assert.deepEqual(s.words[id].formsKnown, []);
  assert.equal(nextRelatedForm(s, content, id), null, 'the answer was just shown');
  s.interactions += 2;
  assert.equal(nextRelatedForm(s, content, id).tokenId, form.tokenId);
});

test('abilities: a ward needs the gate solved, a party word of the right class and rank, and a fresh real answer', () => {
  const s = r2Ready();
  const id = r2.wordIds[0];
  assert.equal(abilityOf(content.wordById.get(id)), 'name');
  assert.equal(gateReady(s, content, 'r2:ward').ok, false, 'not before the region gate');
  clearGate(s, 'r2:rival');
  clearGate(s, 'r2:gate');
  assert.deepEqual(wardCandidates(s, content, 'name'), [], 'no party word has grown yet');
  addToParty(s, id);
  for (const family of ['fx-analyze', 'fx-build']) {
    startEncounter(s, content, id, 'practice', T0);
    submit(s, content, right(openQuestion(s, content, family, T0)), T0);
    retreat(s, content, T0);
  }
  assert.deepEqual(wardCandidates(s, content, 'name'), [id]);
  assert.deepEqual(wardCandidates(s, content, 'deed'), [], 'a noun does not answer a deed seal');
  const q = openGate(s, content, 'r2:ward', T0, { wordId: id });
  assert.equal(q.wordId, id);
  assert.equal(s.attempt.wordId, id);
  const miss = submitGate(s, content, wrong(q), T0);
  assert.equal(miss.correct, false);
  assert.ok(s.words[id].retired[q.semanticStemId], 'a missed ward question retires on the word');
  const next = openGate(s, content, 'r2:ward', T0, { wordId: id });
  assert.notEqual(next.id, q.id);
  assert.equal(submitGate(s, content, right(next), T0).cleared, true);
  assert.deepEqual(s.gates['r2:ward'], { at: T0, questionIds: [next.id], wordId: id });
  assert.equal(s.words[id].evidence.length, 0, 'using an ability is not review evidence');
});

test('a word leaving the party ends its pending seal question, and a hint on it still retires the question', () => {
  const s = r2Ready();
  clearGate(s, 'r2:rival');
  clearGate(s, 'r2:gate');
  const id = r2.wordIds[0];
  addToParty(s, id);
  for (const family of ['fx-analyze', 'fx-build']) {
    startEncounter(s, content, id, 'practice', T0);
    submit(s, content, right(openQuestion(s, content, family, T0)), T0);
    retreat(s, content, T0);
  }
  const q = openGate(s, content, 'r2:ward', T0, { wordId: id });
  useGateHint(s, content);
  removeFromParty(s, id);
  assert.equal(s.attempt, null);
  assert.ok(s.words[id].retired[q.semanticStemId], 'the hint is not laundered');
  assert.equal(parseImport(exportText(s, T0), content).ok, true, 'the save stays readable');
});

test('a later-region word can reach Mastered through varied reviews on separate days (synthetic clock)', () => {
  const s = r2Ready();
  const id = r2.wordIds[0];
  const families = new Set();
  let at = T0 + DAY;
  for (let i = 0; i < 4; i++) {
    const q = startReview(s, content, id, at);
    assert.ok(q, `a review is ready on day ${i}`);
    families.add(q.taskFamily);
    assert.equal(submit(s, content, right(q), at).independent, true);
    assert.equal(parseImport(exportText(s, at), content).ok, true);
    at = s.words[id].dueAt;
  }
  assert.equal(statusOf(s.words[id]), 'Mastered');
  assert.ok(families.size >= 3);
  assert.ok(families.has('fx-analyze') || families.has('fx-build'), 'later task types join the rotation');
});

test('the hidden cache needs the ward, and optional groups use the shrine without blocking anything', () => {
  const s = r2Ready();
  assert.equal(claimSecret(s, content, 'r2:secret', T0).ok, false);
  s.gates['r2:ward'] = { at: T0, questionIds: [] };
  assert.equal(claimSecret(s, content, 'r2:secret', T0).ok, true);
  assert.deepEqual(s.gates['r2:secret'], { at: T0, questionIds: [] });

  const extra = { ...content, regionById: new Map(content.regionById) };
  extra.regionById.set('r2', { ...r2, puzzleQuestionIds: { ...r2.puzzleQuestionIds, env: r2.puzzleQuestionIds.gate } });
  const shrine = OBJECTS.find(o => o.id === 'r2-shrine');
  Object.assign(s, { map: shrine.map, x: shrine.x + 1, y: shrine.y, dir: 'left' });
  assert.deepEqual(interact(s, extra, T0).then, { type: 'gate', key: 'r2:env' });
  assert.equal(interact(s, content, T0).then, undefined, 'no optional pool: just a shrine');
  clearGate2(s, extra);
  assert.equal(isDone(s, 'r2:env'), true);
});

function clearGate2(s, data) {
  for (let guard = 0; guard < 8 && !isDone(s, 'r2:env'); guard++) {
    const q = openGate(s, data, 'r2:env', T0);
    submitGate(s, data, right(q), T0);
  }
}

test('reading stands need taught skills and real answers, and a passage with no questions completes on reading', () => {
  const s = r2Ready();
  assert.equal(gateRequired(content, 'read:pfx-r2'), 2);
  const q = openGate(s, content, 'read:pfx-r2', T0);
  assert.equal(q, null, 'the quest has not reached the reading stage');
  clearGate(s, 'r2:rival');
  clearGate(s, 'r2:gate');
  const lectern = OBJECTS.find(o => o.id === 'r2-lectern');
  Object.assign(s, { map: lectern.map, x: lectern.x + 1, y: lectern.y, dir: 'left' });
  assert.deepEqual(interact(s, content, T0).then, { type: 'reading', passageId: 'pfx-r2' });
  clearGate(s, 'read:pfx-r2');
  assert.equal(s.gates['read:pfx-r2'].questionIds.length, 2);

  const sparse = { ...content, passageById: new Map(content.passageById) };
  sparse.passageById.set('pfx-r2', { ...content.passageById.get('pfx-r2'), questionIds: [] });
  delete s.gates['read:pfx-r2'];
  assert.equal(completeReadingWithoutQuestions(s, sparse, 'pfx-r2', T0).ok, true);
  assert.equal(isDone(s, 'read:pfx-r2'), true);
  delete s.gates['read:pfx-r2'];
  assert.equal(completeReadingWithoutQuestions(s, content, 'pfx-r2', T0).ok, false, 'questions must be answered when they exist');
});

test('the archive restores only when every region is really finished, and the garden opens after', () => {
  const s = r2Ready();
  const refused = restoreArchive(s, content, T0);
  assert.equal(refused.ok, false);
  assert.equal(s.endingAt, null);
  assert.equal(restoreArchive(s, realContent, T0).ok, false, 'the opening-only build has no ending');
  for (const r of content.regions) s.badges[r.badge.id] = { at: T0, questionIds: [] };
  assert.equal(restoreArchive(s, content, T0).ok, false, 'badges alone are not the last road');
  s.gates['r8:exit'] = { at: T0, questionIds: [] };
  assert.equal(restoreArchive(s, content, T0).ok, true);
  assert.equal(s.endingAt, T0);
  assert.equal(isDone(s, 'ending'), true);
  assert.match(objective(s, content), /Review Garden/);
});

test('in the Review Garden, due words come first and everything captured can be practiced', () => {
  const s = r2Ready();
  s.endingAt = T0;
  Object.assign(s, { map: 'garden', x: 3, y: 2, dir: 'right' });
  for (const id of Object.keys(s.words)) s.words[id].dueAt = T0 + 10 * DAY;
  const pick = chooseEncounter(s, content, null, T0);
  assert.equal(pick.kind, 'practice');
  assert.ok(s.words[pick.wordId].capturedAt != null);
  s.words[r2.wordIds[0]].dueAt = T0 - 1;
  const kinds = new Set();
  for (let i = 0; i < 100; i++) kinds.add(chooseEncounter(s, content, null, T0).kind);
  assert.deepEqual([...kinds].sort(), ['practice', 'review']);
  assert.equal(statusOf(s.words[r2.wordIds[0]]), 'Captured');
});

test('prompts name every new actor without leaking answers', () => {
  const s = r2Ready();
  const lock = OBJECTS.find(o => o.id === 'r2-lock');
  Object.assign(s, { map: lock.map, x: lock.x, y: lock.y + 1, dir: 'up' });
  assert.match(promptFor(s), /sluice stone/);
});
