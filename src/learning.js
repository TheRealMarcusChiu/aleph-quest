// Learning records: encounters, capture evidence and the party. Pure logic over the save state.
// Thresholds are editable design choices (see docs/LEARNING.md), not empirically derived values.
import { checkAnswer, initialResponseMode } from './answers.js';

export const PARTY_LIMIT = 6;
export const DAY = 86_400_000;
export const MIN_REVIEW_GAP = 72_000_000; // 20 hours
const INTERVAL_DAYS = [1, 2, 4, 7, 14, 30];
const FRESH_STEM_WINDOW = 3;
export const CAPTURE_FAMILIES = ['read-letter', 'understand-meaning', 'inscribe-spelling'];
const COMMAND_FAMILY = { read: 'read-letter', understand: 'understand-meaning', inscribe: 'inscribe-spelling' };
const LATER_COMMANDS = ['analyze', 'build'];
// The first word card teaches this skill on the spot, so a word needing it can still be offered.
const FIRST_CARD_SKILL = 'word-meaning';
const RELEARN_GAP = 2;
const HISTORY_LIMIT = 60;

export function newRecord() {
  return {
    seenAt: null, studiedAt: null, capturedAt: null, masteredAt: null,
    stage: 0, dueAt: null, lastReviewAt: null, lastReview: null, reviewDays: [], reviewOutcomes: [], reviewTotal: 0, evidence: [],
    firstAttempts: 0, firstCorrect: 0, hints: 0,
    captureSteps: [], retired: {}, recentStems: [], questionUse: {}, history: [], xp: 0, favorite: false,
    xpStems: [], formsKnown: [], formRetired: {},
  };
}

// A random encounter may only offer a word whose three demonstrations can all be asked right now.
export function wordCapturable(state, content, wordId) {
  const word = content.wordById.get(wordId);
  if (!word?.requires.every(skill => state.skills[skill] || skill === FIRST_CARD_SKILL)) return false;
  return CAPTURE_FAMILIES.every(family => content.questions.some(q => q.wordId === wordId && q.taskFamily === family && q.requires.every(skill => state.skills[skill] || skill === FIRST_CARD_SKILL)));
}

// What a word can do out in the world follows its part of speech, never the player's say-so.
export function abilityOf(word) {
  if (/\bverb\b/i.test(word.pos)) return 'deed';
  return /noun|name/i.test(word.pos) ? 'name' : 'link';
}

// How well the player knows a word. It grows from varied use and related forms. The lexeme stays what it is.
export function knowledgeRank(record, word, content) {
  if (record?.capturedAt == null) return 0;
  if (record.xpStems.length < 2) return 1;
  const families = new Set(record.xpStems.map(stem => content.questionByStem.get(stem)?.taskFamily));
  if (families.size < 3 || (word.relatedForms.length && !record.formsKnown.length)) return 2;
  return 3;
}

export const wardCandidates = (state, content, ability) => state.party.filter(id => {
  const word = content.wordById.get(id);
  return abilityOf(word) === ability && knowledgeRank(state.words[id], word, content) >= 2;
});

// Source lines this word appears in, opened up by knowing it better. Attested tokens only.
export function unlockedExamples(state, content, wordId) {
  const word = content.wordById.get(wordId);
  const rank = knowledgeRank(state.words[wordId], word, content);
  if (rank < 2) return [];
  const number = word.strongId.slice(1);
  const lines = content.attestations.filter(a => a.tokenId !== word.example.tokenId && a.lemma.split('/').some(part => part.split(' ')[0] === number));
  return (rank < 3 ? lines.slice(0, 2) : lines).map(a => ({ reference: a.reference, hebrew: a.surface.replaceAll('/', '') }));
}

const formAvailable = (state, record, tokenId) => {
  const at = record.formRetired[tokenId];
  return at === undefined || state.interactions - at >= RELEARN_GAP;
};

export function nextRelatedForm(state, content, wordId) {
  const record = state.words[wordId];
  if (record?.capturedAt == null) return null;
  return content.wordById.get(wordId).relatedForms.find(form => !record.formsKnown.includes(form.tokenId) && formAvailable(state, record, form.tokenId)) ?? null;
}

const RELATION_TEXT = {
  inflection: 'an inflection: the same dictionary word, in another form',
  derivation: 'a derivation: a related word built from it',
  'separate-lexeme': 'a separate dictionary word, however alike they look',
};

export function answerRelatedForm(state, content, wordId, tokenId, response, now) {
  const record = state.words[wordId];
  const form = content.wordById.get(wordId).relatedForms.find(item => item.tokenId === tokenId);
  const correct = response === form.relationship;
  state.interactions += 1;
  state.updatedAt = now;
  if (correct) record.formsKnown.push(tokenId);
  else record.formRetired[tokenId] = state.interactions;
  log(record, { at: now, type: 'form', correct });
  return { correct, explanation: `${form.hebrew} is ${RELATION_TEXT[form.relationship]}. Here it means "${form.gloss}".` };
}

// Used by abilities in the world. It takes a fresh eligible question of this word and is not review evidence.
export function wardQuestion(state, content, wordId) {
  const record = state.words[wordId];
  return content.questions
    .filter(q => q.wordId === wordId && hasSkills(state, q) && stemAvailable(state, record, q.semanticStemId))
    .sort((a, b) => (record.questionUse[a.id] ?? 0) - (record.questionUse[b.id] ?? 0) || (a.id < b.id ? -1 : 1))[0] ?? null;
}

export const retireStem = (state, record, stemId) => { record.retired[stemId] = { at: state.interactions, encounter: 0 }; };

// Reading a Worddex entry shows the answers. The next answer about that word pays for it, unless enough
// time has passed for it to be memory. It waits on the record so leaving or reloading can't wash it out.
export const noteLookup = (record, now) => { record.lookedUpAt = now; };

export function consumeLookup(record, now) {
  const fresh = record.lookedUpAt !== undefined && now - record.lookedUpAt < MIN_REVIEW_GAP;
  delete record.lookedUpAt;
  return fresh;
}

// Opening the Worddex lists glosses, so any question left pending can no longer count as independent.
export function helpFromLookup(state) {
  const pending = [state.attempt, state.badgeRun?.current].filter(Boolean);
  for (const item of pending) item.hintsUsed ||= 1;
  if (state.encounter?.current) state.encounter.current.assisted = true;
  return pending.length > 0 || !!state.encounter?.current;
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
  const pool = content.questions
    .filter(q => q.wordId === wordId && hasSkills(state, q) && !recent.has(q.semanticStemId) && q.taskFamily !== record.lastReview?.family)
    .sort((a, b) => score(a) - score(b) || (record.questionUse[a.id] ?? 0) - (record.questionUse[b.id] ?? 0) || (a.id < b.id ? -1 : 1));
  // Another context is better, but a new family in the same context beats no review at all.
  return pool.find(q => q.contextId !== record.lastReview?.contextId) ?? pool[0] ?? null;
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
  // A new encounter counts as an action, so missed questions return for someone who only walks.
  state.interactions += 1;
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
    if (needsSkill) return { enabled: false, family, reason: state.skills[FIRST_CARD_SKILL] ? 'A later lesson unlocks this. Ask this region\'s mentor.' : 'Finish the worked example on your first word card to unlock this.' };
    if (!candidates(state, content, wordId, family).length && state.encounter?.current?.family !== family) {
      return { enabled: false, family, reason: 'No fresh questions left for now. Study it or leave. New ones return after two other actions.' };
    }
    return { enabled: true, family };
  };
  const out = { study: { enabled: true }, retreat: { enabled: true } };
  for (const [command, family] of Object.entries(COMMAND_FAMILY)) out[command] = describe(command, family);
  // Later commands don't exist on the menu until a lesson has made one of their questions answerable.
  for (const command of LATER_COMMANDS) {
    const own = content.questions.filter(q => q.wordId === wordId && q.command === command && hasSkills(state, q));
    if (!own.length) continue;
    const pending = own.find(q => q.id === state.encounter?.current?.questionId);
    const fresh = own.filter(q => stemAvailable(state, record, q.semanticStemId)).sort((a, b) => (record.questionUse[a.id] ?? 0) - (record.questionUse[b.id] ?? 0));
    const family = (pending ?? fresh[0] ?? own[0]).taskFamily;
    out[command] = record.studiedAt == null
      ? { enabled: false, family, reason: 'Study this word\'s card first.' }
      : pending || fresh.length ? { enabled: true, family } : { enabled: false, family, reason: 'No fresh questions left for now. New ones return after two other actions.' };
  }
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
    hintsUsed: 0, assisted: consumeLookup(record, now) || encounter.assistedNext,
    responseMode: initialResponseMode(question, state.settings.responseMode),
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
  // XP rewards varied use: a task the word has already earned from gives nothing more.
  if (independent && state.party.includes(encounter.wordId) && !record.xpStems.includes(question.semanticStemId)) {
    record.xp += 1;
    record.xpStems.push(question.semanticStemId);
  }

  if (encounter.kind === 'review') {
    finalizeReview(record, question, current, independent, now);
    if (!independent) retire(state, record, question.semanticStemId);
    state.encounter = null;
    return result;
  }
  if (encounter.kind === 'capture' && independent && CAPTURE_FAMILIES.includes(question.taskFamily)) {
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
  // A seal's pending question needs this word in the party. Leaving ends it, and a hint already taken still costs the question.
  if (state.attempt?.wordId === wordId) {
    if (state.attempt.hintsUsed) retireStem(state, state.words[wordId], state.attempt.stemId);
    state.attempt = null;
  }
}
