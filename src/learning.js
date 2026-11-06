// Learning records: encounters, capture evidence and the party. Pure logic over the save state.
// Thresholds are editable design choices (see docs/LEARNING.md), not empirically derived values.
import { checkAnswer } from './answers.js';

export const PARTY_LIMIT = 6;
export const DAY = 86_400_000;
export const MIN_REVIEW_GAP = 72_000_000; // 20 hours
const INTERVAL_DAYS = [1, 2, 4, 7, 14, 30];
const FRESH_STEM_WINDOW = 3;
export const CAPTURE_FAMILIES = ['read-letter', 'understand-meaning', 'inscribe-spelling'];
const COMMAND_FAMILY = { read: 'read-letter', understand: 'understand-meaning', inscribe: 'inscribe-spelling' };
const RELEARN_GAP = 2;
const HISTORY_LIMIT = 60;

export function newRecord() {
  return {
    seenAt: null, studiedAt: null, capturedAt: null, masteredAt: null,
    stage: 0, dueAt: null, lastReviewAt: null, lastReview: null, reviewDays: [], reviewOutcomes: [], reviewTotal: 0, evidence: [],
    firstAttempts: 0, firstCorrect: 0, hints: 0,
    captureSteps: [], retired: {}, recentStems: [], questionUse: {}, history: [], xp: 0, favorite: false,
  };
}

const recordFor = (state, wordId) => (state.words[wordId] ??= newRecord());
const log = (record, entry) => {
  record.history.push(entry);
  if (record.history.length > HISTORY_LIMIT) record.history.shift();
};

export function statusOf(record) {
  if (!record) return 'Unseen';
  if (record.capturedAt == null) return record.studiedAt != null ? 'Studied' : 'Seen';
  if (masteryMet(record)) return 'Mastered';
  return record.evidence.length ? 'Practiced' : 'Captured';
}

const distinct = (list, pick) => new Set(list.map(pick)).size;

export function masteryMet(record) {
  const { evidence, reviewOutcomes } = record;
  if (evidence.length < 4 || record.reviewTotal < 4) return false;
  if (distinct(evidence, e => Math.floor(e.at / DAY)) < 4) return false;
  if (distinct(evidence, e => e.taskFamily) < 3 || distinct(evidence, e => e.contextId) < 3) return false;
  const mean = reviewOutcomes.reduce((a, b) => a + b, 0) / reviewOutcomes.length;
  return mean >= 0.8 && reviewOutcomes.at(-1) === 1;
}

export function reviewEligible(record, now) {
  if (record?.capturedAt == null || now < record.dueAt) return false;
  if (record.reviewDays.includes(Math.floor(now / DAY))) return false;
  return record.lastReviewAt == null || now - record.lastReviewAt >= MIN_REVIEW_GAP;
}

export function dueWords(state, now) {
  return Object.entries(state.words)
    .filter(([, record]) => reviewEligible(record, now))
    .sort(([a, ra], [b, rb]) => ra.dueAt - rb.dueAt || (a < b ? -1 : 1))
    .map(([id]) => id);
}

function reviewQuestion(state, content, wordId) {
  const record = recordFor(state, wordId);
  const recent = new Set(record.recentStems.slice(-FRESH_STEM_WINDOW));
  const haveFamilies = new Set(record.evidence.map(e => e.taskFamily));
  const haveContexts = new Set(record.evidence.map(e => e.contextId));
  const score = q => (haveFamilies.has(q.taskFamily) ? 0 : -2) + (haveContexts.has(q.contextId) ? 0 : -1);
  return content.questions
    .filter(q => q.wordId === wordId && hasSkills(state, q) && !recent.has(q.semanticStemId)
      && q.taskFamily !== record.lastReview?.family && q.contextId !== record.lastReview?.contextId)
    .sort((a, b) => score(a) - score(b) || (record.questionUse[a.id] ?? 0) - (record.questionUse[b.id] ?? 0) || (a.id < b.id ? -1 : 1))[0] ?? null;
}

// Starts a due review, or returns null with the schedule untouched when none can be offered.
export function startReview(state, content, wordId, now) {
  if (!reviewEligible(state.words[wordId], now)) return null;
  const question = reviewQuestion(state, content, wordId);
  if (!question) return null;
  startEncounter(state, content, wordId, 'review', now);
  present(state, state.words[wordId], question, now);
  return question;
}

function finalizeReview(record, question, current, independent, now) {
  record.lastReviewAt = now;
  record.lastReview = { family: question.taskFamily, contextId: question.contextId };
  record.reviewDays.push(Math.floor(now / DAY));
  record.reviewTotal += 1;
  record.reviewOutcomes = [...record.reviewOutcomes, independent ? 1 : 0].slice(-5);
  if (independent) {
    record.evidence.push({ at: now, taskFamily: question.taskFamily, contextId: question.contextId, templateId: question.templateId, semanticStemId: question.semanticStemId, responseMode: current.responseMode });
    record.stage = Math.min(record.stage + 1, INTERVAL_DAYS.length - 1);
    record.dueAt = now + INTERVAL_DAYS[record.stage] * DAY;
  } else {
    record.stage = Math.max(record.stage - 1, 0);
    record.dueAt = now + Math.max(DAY, MIN_REVIEW_GAP);
  }
  if (record.masteredAt == null && masteryMet(record)) record.masteredAt = now;
  log(record, { at: now, type: 'review', questionId: question.id, independent });
}

export function startEncounter(state, content, wordId, kind, now) {
  const record = recordFor(state, wordId);
  if (record.seenAt == null) {
    record.seenAt = now;
    log(record, { at: now, type: 'seen' });
  }
  state.encounterCounter += 1;
  state.encounter = { id: state.encounterCounter, wordId, kind, assistedNext: false, current: null };
  state.updatedAt = now;
  return state.encounter;
}

// A card opened before the word has been studied is the introduction. Opened again during an
// encounter it is answer-bearing, so the outstanding or next response cannot count as independent.
export function completeStudy(state, wordId, now) {
  const record = recordFor(state, wordId);
  const encounter = state.encounter;
  if (record.studiedAt == null) {
    record.studiedAt = now;
    log(record, { at: now, type: 'studied' });
  } else if (encounter?.wordId === wordId) {
    if (encounter.current) encounter.current.assisted = true;
    else encounter.assistedNext = true;
  }
  state.updatedAt = now;
}

const hasSkills = (state, question) => question.requires.every(skill => state.skills[skill]);

function stemAvailable(state, record, stemId) {
  const entry = record.retired[stemId];
  if (!entry) return true;
  return entry.encounter !== state.encounter?.id && state.interactions - entry.at >= RELEARN_GAP;
}

function candidates(state, content, wordId, family) {
  const record = recordFor(state, wordId);
  const filled = new Set(record.captureSteps.map(step => step.semanticStemId));
  const preferTyped = family === 'inscribe-spelling' && state.settings.responseMode === 'typing'
    && Object.values(state.words).some(r => r.capturedAt != null);
  const rank = q => (preferTyped && q.format === 'type' ? -1 : 0) + (record.questionUse[q.id] ?? 0);
  return content.questions
    .filter(q => q.wordId === wordId && q.taskFamily === family && hasSkills(state, q)
      && stemAvailable(state, record, q.semanticStemId) && !filled.has(q.semanticStemId))
    .sort((a, b) => rank(a) - rank(b) || (a.id < b.id ? -1 : 1));
}

export function commandStates(state, content, wordId) {
  const record = recordFor(state, wordId);
  const inCapture = state.encounter?.kind !== 'practice';
  const describe = (command, family) => {
    const needsSkill = content.questions.filter(q => q.wordId === wordId && q.taskFamily === family).every(q => !hasSkills(state, q));
    if (inCapture && record.captureSteps.some(step => step.family === family)) return { enabled: false, family, done: true, reason: 'Already shown for this word.' };
    if (record.studiedAt == null) return { enabled: false, family, reason: 'Study this word\'s card first.' };
    if (needsSkill) return { enabled: false, family, reason: 'Finish the worked example on your first word card to unlock this.' };
    if (!candidates(state, content, wordId, family).length && state.encounter?.current?.family !== family) {
      return { enabled: false, family, reason: 'No fresh questions left for now. Study it or leave. New ones return after two other actions.' };
    }
    return { enabled: true, family };
  };
  const out = { study: { enabled: true }, retreat: { enabled: true } };
  for (const [command, family] of Object.entries(COMMAND_FAMILY)) out[command] = describe(command, family);
  return out;
}

function retire(state, record, stemId) {
  record.retired[stemId] = { at: state.interactions, encounter: state.encounter.id };
}

export function openQuestion(state, content, family, now) {
  const encounter = state.encounter;
  const record = recordFor(state, encounter.wordId);
  if (encounter.current) {
    if (encounter.current.family === family) return content.questionById.get(encounter.current.questionId);
    if (encounter.current.hintsUsed || encounter.current.assisted) retire(state, record, encounter.current.stemId);
    // The card was seen, so changing commands can't clear what it exposed.
    if (encounter.current.assisted) encounter.assistedNext = true;
    encounter.current = null;
  }
  if (encounter.kind === 'capture' && record.captureSteps.some(step => step.family === family)) return null;
  const question = candidates(state, content, encounter.wordId, family)[0];
  if (!question) return null;
  present(state, record, question, now);
  return question;
}

function present(state, record, question, now) {
  const encounter = state.encounter;
  encounter.current = {
    questionId: question.id, stemId: question.semanticStemId, family: question.taskFamily, startedAt: now,
    hintsUsed: 0, assisted: encounter.assistedNext,
    responseMode: question.format === 'type' ? state.settings.responseMode : 'recognition',
  };
  encounter.assistedNext = false;
  record.questionUse[question.id] = (record.questionUse[question.id] ?? 0) + 1;
  record.recentStems = [...record.recentStems, question.semanticStemId].slice(-6);
}

export function useHint(state, content) {
  const current = state.encounter?.current;
  if (!current) return null;
  current.hintsUsed += 1;
  recordFor(state, state.encounter.wordId).hints += 1;
  return content.questionById.get(current.questionId).hint;
}

// The learner switched a typing question to its recognition choices. An entry aid, not a hint.
export function setCurrentResponseMode(state, responseMode) {
  if (state.encounter?.current) state.encounter.current.responseMode = responseMode;
}

export function submit(state, content, response, now) {
  const encounter = state.encounter;
  const current = encounter?.current;
  if (!current) return null;
  const question = content.questionById.get(current.questionId);
  const record = recordFor(state, encounter.wordId);
  const { correct, nearMiss } = checkAnswer(question, response, current.responseMode);
  const independent = correct && current.hintsUsed === 0 && !current.assisted;

  record.firstAttempts += 1;
  if (correct) record.firstCorrect += 1;
  state.interactions += 1;
  state.updatedAt = now;
  encounter.current = null;
  log(record, { at: now, type: 'answer', questionId: question.id, correct, independent, responseMode: current.responseMode, kind: encounter.kind });

  const result = { correct, independent, nearMiss, explanation: question.explanation, question, captured: false };
  if (independent && state.party.includes(encounter.wordId)) record.xp += 1;

  if (encounter.kind === 'review') {
    finalizeReview(record, question, current, independent, now);
    state.encounter = null;
    return result;
  }
  if (encounter.kind === 'capture' && independent) {
    record.captureSteps.push({ family: question.taskFamily, templateId: question.templateId, semanticStemId: question.semanticStemId, contextId: question.contextId, responseMode: current.responseMode, at: now });
    if (CAPTURE_FAMILIES.every(family => record.captureSteps.some(step => step.family === family))) {
      record.capturedAt = now;
      record.dueAt = now + DAY;
      record.stage = 0;
      log(record, { at: now, type: 'captured' });
      if (state.party.length < PARTY_LIMIT) state.party.push(encounter.wordId);
      state.encounter = null;
      result.captured = true;
    }
  } else if (!independent) {
    retire(state, record, question.semanticStemId);
  }
  return result;
}

export function retreat(state, content, now) {
  const encounter = state.encounter;
  if (!encounter) return;
  const { current } = encounter;
  if (current?.hintsUsed || current?.assisted) {
    const record = recordFor(state, encounter.wordId);
    retire(state, record, current.stemId);
    if (encounter.kind === 'review') finalizeReview(record, content.questionById.get(current.questionId), current, false, now);
  }
  state.encounter = null;
  state.updatedAt = now;
}

export function addToParty(state, wordId) {
  if (state.words[wordId]?.capturedAt == null) return { ok: false, reason: 'Only captured words can join your party.' };
  if (state.party.includes(wordId)) return { ok: true };
  if (state.party.length >= PARTY_LIMIT) return { ok: false, reason: 'Your party is full. Remove a word first.' };
  state.party.push(wordId);
  return { ok: true };
}

export function removeFromParty(state, wordId) {
  state.party = state.party.filter(id => id !== wordId);
}
