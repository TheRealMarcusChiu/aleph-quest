// Language gates in the world: Neri's bridge, the Field Gate doors and the first badge trial.
// These answers unlock the world. They never count as capture or review evidence for a word.
import { checkAnswer } from './answers.js';
import { missingForBadge, setFlag } from './engine.js';

const RELEARN_GAP = 2;
const PUZZLE_FLAG = { neri: 'neriCleared', gate: 'gateOpen' };

export function currentPuzzle(state, content, group, regionId = 'r1') {
  const ids = content.regionById.get(regionId).puzzleQuestionIds[group];
  return content.questionById.get(ids[state.puzzleIndex[group] % ids.length]);
}

export function answerPuzzle(state, content, group, response, now) {
  const question = currentPuzzle(state, content, group);
  const { correct } = checkAnswer(question, response);
  state.interactions += 1;
  state.updatedAt = now;
  if (correct) {
    setFlag(state, PUZZLE_FLAG[group]);
    if (group === 'gate') state.flags.doorOpen = response;
  } else {
    state.puzzleIndex[group] += 1;
  }
  return { correct, explanation: question.explanation, question };
}

// A run stays open across visits, so progress survives leaving the Hall. Each visit gets a new
// id, which lets answers exposed on an earlier visit return after two other actions.
export function startBadgeRun(state, content, regionId, now) {
  const gaps = missingForBadge(state, content);
  if (gaps.length) return { ok: false, reason: `Still needed: ${gaps.join(', ')}.` };
  state.encounterCounter += 1;
  state.badgeRun = { id: state.encounterCounter, regionId, correct: state.badgeRun?.correct ?? [], current: null };
  state.updatedAt = now;
  return { ok: true };
}

const badgeOf = (state, content) => content.regionById.get(state.badgeRun.regionId).badge;

export function openBadgeQuestion(state, content, now) {
  const run = state.badgeRun;
  if (run.current) return content.questionById.get(run.current.questionId);
  const badge = badgeOf(state, content);
  const covered = new Set(run.correct.map(id => content.questionById.get(id).taskFamily));
  const usable = badge.questionIds.map(id => content.questionById.get(id)).filter(q => {
    if (run.correct.includes(q.id)) return false;
    const retired = state.retiredCheckpoints[q.id];
    return !retired || (retired.run !== run.id && state.interactions - retired.at >= RELEARN_GAP);
  });
  usable.sort((a, b) => covered.has(a.taskFamily) - covered.has(b.taskFamily));
  const question = usable[0];
  if (!question) return null;
  run.current = { questionId: question.id, hintsUsed: 0, startedAt: now, responseMode: question.format === 'type' ? state.settings.responseMode : 'recognition' };
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
  const families = new Set(run.correct.map(id => content.questionById.get(id).taskFamily));
  if (run.correct.length >= badge.requiredCorrect && badge.requiredTaskFamilies.every(f => families.has(f))) {
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
