// Language gates in the world: r1's bridge and doors, every region's duels, locks and readings, and the badge trials.
// These answers unlock the world. They never count as capture or review evidence for a word.
import { checkAnswer, initialResponseMode } from './answers.js';
import { missingForBadge, setFlag, isDone, regionUnlocked, gatePool, gateReady, gateRequired, archiveReady } from './engine.js';
import { wardCandidates, wardQuestion, retireStem, consumeLookup } from './learning.js';

export { gatePool, gateRequired, gateReady, wardCandidates };

const RELEARN_GAP = 2;
const PUZZLE_FLAG = { neri: 'neriCleared', gate: 'gateOpen' };
const hasSkills = (state, question) => question.requires.every(skill => state.skills[skill]);

// r1's rotating pools. Only questions whose skills are taught can come up.
export function currentPuzzle(state, content, group, regionId = 'r1') {
  const ids = content.regionById.get(regionId).puzzleQuestionIds[group];
  for (let i = 0; i < ids.length; i++) {
    const question = content.questionById.get(ids[(state.puzzleIndex[group] + i) % ids.length]);
    if (hasSkills(state, question)) return question;
  }
  return null;
}

export function answerPuzzle(state, content, group, response, now) {
  const question = currentPuzzle(state, content, group);
  if (!question) return null;
  const { correct } = checkAnswer(question, response);
  state.interactions += 1;
  state.updatedAt = now;
  if (correct) {
    setFlag(state, PUZZLE_FLAG[group]);
    if (group === 'gate') state.flags.doorOpen = response;
  } else {
    state.puzzleIndex[group] = content.regionById.get('r1').puzzleQuestionIds[group].indexOf(question.id) + 1;
  }
  return { correct, explanation: question.explanation, question };
}

const retiredNow = (state, question) => {
  const retired = state.retiredCheckpoints[question.id];
  return retired && state.interactions - retired.at < RELEARN_GAP;
};

function abandon(state, attempt) {
  if (!attempt.hintsUsed) return;
  if (attempt.wordId) retireStem(state, state.words[attempt.wordId], attempt.stemId);
  else state.retiredCheckpoints[attempt.questionId] = { at: state.interactions, run: 0 };
}

// Opens the pending attempt for a later-region action, or resumes it. Hints stay with the attempt.
export function openGate(state, content, key, now, { wordId } = {}) {
  const pending = state.attempt;
  if (pending?.key === key && (wordId === undefined || wordId === pending.wordId)) return content.questionById.get(pending.questionId);
  if (!gateReady(state, content, key, wordId).ok) return null;
  const credited = state.gateCredit[key] ?? [];
  const question = wordId !== undefined
    ? wardQuestion(state, content, wordId)
    : gatePool(content, key).map(id => content.questionById.get(id)).find(q => hasSkills(state, q) && !credited.includes(q.id) && !retiredNow(state, q));
  if (!question) return null;
  if (pending) abandon(state, pending);
  // A seal asks about one word, so having just read that word's entry already gave the answer away.
  const lookedUp = wordId !== undefined && consumeLookup(state.words[wordId], now);
  state.attempt = {
    key, questionId: question.id, hintsUsed: lookedUp ? 1 : 0, startedAt: now, responseMode: initialResponseMode(question, state.settings.responseMode),
    ...(wordId !== undefined ? { wordId, stemId: question.semanticStemId } : {}),
  };
  state.updatedAt = now;
  return question;
}

export function useGateHint(state, content) {
  if (!state.attempt) return null;
  state.attempt.hintsUsed += 1;
  return content.questionById.get(state.attempt.questionId).hint;
}

export function setGateResponseMode(state, responseMode) {
  if (state.attempt) state.attempt.responseMode = responseMode;
}

export function submitGate(state, content, response, now) {
  const attempt = state.attempt;
  if (!attempt) return null;
  const { key } = attempt;
  const question = content.questionById.get(attempt.questionId);
  const { correct, nearMiss } = checkAnswer(question, response, attempt.responseMode);
  const independent = correct && attempt.hintsUsed === 0;
  state.attempt = null;
  state.updatedAt = now;
  const result = { correct, independent, nearMiss, explanation: question.explanation, question, cleared: false };

  // Answering here doesn't count as the action that brings a question back, or its own misses would.
  if (!independent) {
    if (attempt.wordId) retireStem(state, state.words[attempt.wordId], attempt.stemId);
    else state.retiredCheckpoints[question.id] = { at: state.interactions, run: 0 };
    return result;
  }
  const credit = [...(state.gateCredit[key] ?? []), question.id];
  if (credit.length >= (attempt.wordId ? 1 : gateRequired(content, key))) {
    state.gates[key] = { at: now, questionIds: credit, ...(attempt.wordId ? { wordId: attempt.wordId } : {}) };
    delete state.gateCredit[key];
    result.cleared = true;
  } else {
    state.gateCredit[key] = credit;
  }
  return result;
}

export function gateProgress(state, content, key) {
  return { correct: (state.gateCredit[key] ?? []).length, required: gateRequired(content, key) };
}

export function completeReadingWithoutQuestions(state, content, passageId, now) {
  const key = `read:${passageId}`;
  if (gatePool(content, key).length || !gateReady(state, content, key).ok) return { ok: false };
  state.gates[key] = { at: now, questionIds: [] };
  state.updatedAt = now;
  return { ok: true };
}

export function claimSecret(state, content, key, now) {
  if (isDone(state, key)) return { ok: true };
  const [regionId] = key.split(':');
  if (!regionUnlocked(state, content, regionId) || !isDone(state, `${regionId}:ward`)) return { ok: false };
  state.gates[key] = { at: now, questionIds: [] };
  state.updatedAt = now;
  return { ok: true };
}

export function restoreArchive(state, content, now) {
  if (state.endingAt != null) return { ok: true };
  if (!archiveReady(state, content)) return { ok: false };
  state.endingAt = now;
  state.updatedAt = now;
  return { ok: true };
}

// A run stays open across visits, so progress and the pending attempt with its hints survive leaving
// the Hall. Each visit gets a new id, which lets answers exposed earlier return after two other actions.
export function startBadgeRun(state, content, regionId, now) {
  const { badge } = content.regionById.get(regionId);
  if (!regionUnlocked(state, content, regionId)) return { ok: false, reason: 'This region is still sealed.' };
  if (state.badges[badge.id]) return { ok: false, reason: `The ${badge.title} is already yours.` };
  const gaps = missingForBadge(state, content, regionId);
  if (gaps.length) return { ok: false, reason: `Still needed: ${gaps.join(', ')}.` };
  const previous = state.badgeRun?.regionId === regionId ? state.badgeRun : null;
  state.encounterCounter += 1;
  state.badgeRun = { id: state.encounterCounter, regionId, correct: previous?.correct ?? [], current: previous?.current ?? null };
  state.updatedAt = now;
  return { ok: true };
}

const badgeOf = (state, content) => content.regionById.get(state.badgeRun.regionId).badge;

// The moment these answers qualify, the badge is awarded and the run closes.
export function trialComplete(badge, questionIds, content) {
  const families = new Set(questionIds.map(id => content.questionById.get(id).taskFamily));
  return new Set(questionIds).size >= badge.requiredCorrect && badge.requiredTaskFamilies.every(f => families.has(f));
}

export function openBadgeQuestion(state, content, now) {
  const run = state.badgeRun;
  if (missingForBadge(state, content, run.regionId).length) return null;
  if (run.current) return content.questionById.get(run.current.questionId);
  const badge = badgeOf(state, content);
  const covered = new Set(run.correct.map(id => content.questionById.get(id).taskFamily));
  const usable = badge.questionIds.map(id => content.questionById.get(id)).filter(q => {
    if (run.correct.includes(q.id) || !hasSkills(state, q)) return false;
    const retired = state.retiredCheckpoints[q.id];
    return !retired || (retired.run !== run.id && state.interactions - retired.at >= RELEARN_GAP);
  });
  usable.sort((a, b) => covered.has(a.taskFamily) - covered.has(b.taskFamily));
  const question = usable[0];
  if (!question) return null;
  run.current = { questionId: question.id, hintsUsed: 0, startedAt: now, responseMode: initialResponseMode(question, state.settings.responseMode) };
  return question;
}

export function useBadgeHint(state, content) {
  const current = state.badgeRun?.current;
  if (!current) return null;
  current.hintsUsed += 1;
  return content.questionById.get(current.questionId).hint;
}

export function setBadgeResponseMode(state, responseMode) {
  if (state.badgeRun?.current) state.badgeRun.current.responseMode = responseMode;
}

export function submitBadgeAnswer(state, content, response, now) {
  const run = state.badgeRun;
  const current = run?.current;
  if (!current) return null;
  const question = content.questionById.get(current.questionId);
  const { correct, nearMiss } = checkAnswer(question, response, current.responseMode);
  const independent = correct && current.hintsUsed === 0;
  run.current = null;
  state.interactions += 1;
  state.updatedAt = now;

  const result = { correct, independent, nearMiss, explanation: question.explanation, question, awarded: false };
  if (!independent) {
    state.retiredCheckpoints[question.id] = { at: state.interactions - 1, run: run.id };
    return result;
  }
  run.correct.push(question.id);
  const badge = badgeOf(state, content);
  if (trialComplete(badge, run.correct, content)) {
    state.badges[badge.id] = { at: now, questionIds: run.correct };
    state.badgeRun = null;
    result.awarded = true;
  }
  return result;
}

export function badgeProgress(state, content) {
  if (!state.badgeRun) return { correct: 0, required: 0 };
  const badge = badgeOf(state, content);
  return { correct: state.badgeRun.correct.length, required: badge.requiredCorrect };
}
