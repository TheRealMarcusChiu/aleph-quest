// Content validator. `--opening` holds the first region to real rules. With no flag it also
// enforces the full campaign floor, and it fails until that content actually exists.
import { fileURLToPath } from 'node:url';
import { comparisonKey } from '../src/answers.js';
import { content, buildContent } from '../src/content.js';
import { gateRequired } from '../src/engine.js';
import { abilityOf } from '../src/learning.js';
import { OBJECTS, REGION_MAPS } from '../src/world.js';

const CAPTURE_FAMILIES = ['read-letter', 'understand-meaning', 'inscribe-spelling'];
const FINAL_TO_REGULAR = { ך: 'כ', ם: 'מ', ן: 'נ', ף: 'פ', ץ: 'צ' };
const RELATIONSHIPS = new Set(['inflection', 'derivation', 'separate-lexeme']);
const FORMATS = new Set(['choice', 'door', 'type', 'tokens', 'match']);
const STAGE_KINDS = new Set(['lesson', 'capture', 'puzzle', 'duel', 'reading', 'exit']);
const KEY_FIELDS = new Set(['answer', 'form', 'features', 'relationship', 'tokenId']);
const RESERVED_GROUPS = new Set(['rival', 'exit', 'ward', 'secret']);
const R1_FLAGS = new Set(['neriCleared', 'gateOpen', 'exitOpened']);
const CAMPAIGN_REGIONS = ['r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'r8'];
// A pool has to outlast a miss: at least this many answerable items where the quest reaches it.
const POOL_FLOOR = { neri: 3, gate: 2 };

const pointed = text => comparisonKey(text.replaceAll('/', ''), 'pointed');
const lemmaNumbers = lemma => lemma.split('/').map(part => part.split(' ')[0]);
const strongNumber = id => id.slice(1);

// Which skills a player can have at a point in the campaign. A global "some lesson teaches it"
// isn't enough: the lesson has to come before the content in real play.
function campaignSkills(data) {
  const lessons = new Map(data.lessons.map(l => [l.id, l]));
  const beforeRegion = new Map(), afterRegion = new Map(), firstLesson = new Map();
  let running = new Set();
  for (const region of data.regions) {
    beforeRegion.set(region.id, new Set(running));
    firstLesson.set(region.id, new Set([...running, ...(lessons.get(region.lessonIds[0])?.teaches ?? [])]));
    running = new Set(running);
    for (const id of region.lessonIds) for (const skill of lessons.get(id)?.teaches ?? []) running.add(skill);
    afterRegion.set(region.id, new Set(running));
  }
  return { beforeRegion, afterRegion, firstLesson, lessons };
}

// New word-level templates prove their key with this metadata. Each field is checked against the word's
// own record, so an authored key is compared with the source record instead of being taken on trust.
function checkKey(q, word, tokens, err, answers) {
  const { key } = q;
  for (const field of Object.keys(key)) if (!KEY_FIELDS.has(field)) err(`${q.id}: key field ${field} is not documented`);
  if (typeof key.answer !== 'string' || !key.answer) err(`${q.id}: key needs an answer`);
  else if (!answers().includes(key.answer.normalize('NFC'))) err(`${q.id}: key answer "${key.answer}" is not what the question accepts`);
  if (key.tokenId !== undefined && !tokens.has(key.tokenId)) err(`${q.id}: key cites unknown token ${key.tokenId}`);
  if (!word) return;
  const form = key.form === undefined ? null : word.relatedForms.find(item => pointed(item.hebrew) === pointed(key.form));
  if (key.form !== undefined && !form && pointed(word.hebrew) !== pointed(key.form)) err(`${q.id}: key form ${key.form} is not attested for ${word.id}`);
  if (key.relationship !== undefined) {
    if (!RELATIONSHIPS.has(key.relationship)) err(`${q.id}: key relationship ${key.relationship} is unknown`);
    else if (form && form.relationship !== key.relationship) err(`${q.id}: key relationship ${key.relationship} does not match the form's record`);
  }
  for (const [name, value] of Object.entries(key.features ?? {})) {
    if (![word.features?.[name], form?.features?.[name]].includes(value)) err(`${q.id}: key feature ${name}=${value} does not match ${word.id}`);
  }
}

// What a question will accept, as text, for comparing with a key.
function acceptedTexts(q) {
  const norm = text => text.normalize('NFC');
  if (q.format === 'tokens') {
    const text = id => q.tokenOptions.find(t => t.id === id)?.text ?? '';
    return q.acceptedSequences.map(seq => norm(seq.map(text).join('')));
  }
  if (q.format === 'type') return (q.acceptedAnswers ?? []).map(norm);
  if (q.format === 'match') return [];
  return (q.choices ?? []).filter(c => q.acceptedAnswers?.includes(c.id)).map(c => norm(c.text));
}

function checkMatch(q, err) {
  const pairs = Array.isArray(q.pairs) ? q.pairs : [];
  if (pairs.length < 2 || pairs.some(pair => !pair.left || !pair.right)) { err(`${q.id}: match pairs need at least two complete rows`); return; }
  if (new Set(pairs.map(pair => pair.left)).size !== pairs.length) err(`${q.id}: two rows share a left side`);
  const rights = new Set(pairs.map(pair => pair.right));
  if (rights.size < 2) err(`${q.id}: every row has the same right side, so there is nothing to choose`);
  for (const alternative of q.acceptedAnswers ?? []) {
    if (!Array.isArray(alternative) || alternative.length !== pairs.length || !alternative.every(right => rights.has(right))) err(`${q.id}: an alternative answer must give every row a listed right side`);
  }
}

export function validateContent(data, phase) {
  const errors = [];
  const err = message => errors.push(message);
  const index = list => new Map(list.map(item => [item.id, item]));
  const words = index(data.words), questions = index(data.questions), lessons = index(data.lessons);
  const sources = index(data.sources);
  const tokens = new Map(data.attestations.map(a => [a.tokenId, a]));
  const taught = new Set(data.lessons.flatMap(l => l.teaches));
  const badgeIds = new Set(data.regions.map(r => r.badge.id));
  const regions = index(data.regions);
  const reach = campaignSkills(data);
  const built = buildContent(data);

  const duplicates = (list, pick, label) => {
    const seen = new Set();
    for (const item of list) {
      if (seen.has(pick(item))) err(`${pick(item)}: duplicate ${label}`);
      seen.add(pick(item));
    }
  };
  duplicates(data.words, w => w.id, 'word');
  duplicates(data.questions, q => q.id, 'question');
  duplicates(data.lessons, l => l.id, 'lesson');
  duplicates(data.regions, r => r.badge.id, 'badge');
  const lexemes = new Map();
  for (const w of data.words) {
    const lexeme = `${w.strongId}|${w.consonants}`;
    if (lexemes.has(lexeme)) err(`${w.id}: same lexeme as ${lexemes.get(lexeme)}`);
    lexemes.set(lexeme, w.id);
  }

  const checkSources = (owner, ids) => { for (const id of ids) if (!sources.has(id)) err(`${owner}: unknown source ${id}`); };

  // Words and their source tokens.
  for (const w of data.words) {
    if (comparisonKey(w.hebrew, 'consonants') !== w.consonants) err(`${w.id}: consonants do not match the pointed form`);
    if (FINAL_TO_REGULAR[w.consonants.at(-1)] === undefined && Object.values(FINAL_TO_REGULAR).includes(w.consonants.at(-1))) err(`${w.id}: word ends in a regular letter that needs its final form`);
    if (!w.transliteration || !w.gloss || !w.meanings?.length || !w.pos) err(`${w.id}: transliteration, gloss, meanings and pos are required`);
    if (w.root !== null && (typeof w.root !== 'string' || comparisonKey(w.root, 'consonants') !== w.root || !w.root || !w.rootNote)) err(`${w.id}: root must be null, or letters only with a rootNote`);
    if (!/^H\d+$/.test(w.strongId)) err(`${w.id}: bad strongId`);
    for (const skill of w.requires) if (!taught.has(skill)) err(`${w.id}: requires untaught skill ${skill}`);
    checkSources(w.id, [...w.sourceIds, w.example.sourceId, ...w.relatedForms.map(r => r.sourceId)]);

    const example = tokens.get(w.example.tokenId);
    if (!example) err(`${w.id}: example cites unknown token ${w.example.tokenId}`);
    else {
      if (!lemmaNumbers(example.lemma).includes(strongNumber(w.strongId))) err(`${w.id}: example token has lemma ${example.lemma}, not ${w.strongId}`);
      if (example.reference !== w.example.reference) err(`${w.id}: example reference does not match its token`);
      if (!pointed(w.example.hebrew).includes(pointed(example.surface))) err(`${w.id}: example text does not contain its token`);
    }
    if (!w.example.translation) err(`${w.id}: example needs a translation`);

    for (const form of w.relatedForms) {
      if (!RELATIONSHIPS.has(form.relationship)) err(`${w.id}: unknown relationship ${form.relationship}`);
      const token = tokens.get(form.tokenId);
      if (!token) { err(`${w.id}: related form cites unknown token ${form.tokenId}`); continue; }
      if (pointed(form.hebrew) !== pointed(token.surface)) err(`${w.id}: related form ${form.hebrew} does not match its token`);
      if (form.relationship === 'inflection' && !lemmaNumbers(token.lemma).includes(strongNumber(w.strongId))) err(`${w.id}: inflection token has lemma ${token.lemma}`);
    }
  }

  // Questions: legal, identifiable answers.
  const stems = new Map();
  for (const q of data.questions) {
    if (q.wordId !== null && !words.has(q.wordId)) err(`${q.id}: unknown word ${q.wordId}`);
    if (stems.has(q.semanticStemId)) err(`${q.id}: semantic stem already used by ${stems.get(q.semanticStemId)}`);
    stems.set(q.semanticStemId, q.id);
    if (!FORMATS.has(q.format)) err(`${q.id}: unknown format ${q.format}`);
    for (const field of ['prompt', 'explanation', 'hint', 'taskFamily', 'templateId', 'contextId', 'command']) if (!q[field]) err(`${q.id}: ${field} is empty`);
    for (const skill of q.requires) if (!taught.has(skill)) err(`${q.id}: requires untaught skill ${skill}`);
    if (!regions.has(q.regionId)) err(`${q.id}: unknown region ${q.regionId}`);
    else for (const skill of q.requires) if (taught.has(skill) && !reach.afterRegion.get(q.regionId).has(skill)) err(`${q.id}: requires ${skill}, not taught by the end of ${q.regionId}`);
    checkSources(q.id, q.sourceIds);
    if (q.tokenId) {
      const token = tokens.get(q.tokenId);
      if (!token) err(`${q.id}: unknown token ${q.tokenId}`);
      else if (q.displayHebrew && !pointed(token.surface).includes(pointed(q.displayHebrew))) err(`${q.id}: shows Hebrew that is not in its token`);
    }

    const choiceSet = (choices, accepted, label) => {
      const ids = new Set(choices.map(c => c.id));
      const texts = choices.map(c => c.text);
      if (new Set(texts).size !== texts.length) err(`${q.id}: duplicate ${label} text`);
      if (new Set(ids).size !== choices.length) err(`${q.id}: duplicate ${label} id`);
      if (!accepted?.length || !accepted.every(id => ids.has(id))) err(`${q.id}: ${label === 'choice' ? 'answer' : 'recognition answer'} is not one of its options`);
      if (choices.length < 2 || accepted?.length >= choices.length) err(`${q.id}: ${label} needs at least one distractor`);
    };
    if (q.format === 'choice' || q.format === 'door') choiceSet(q.choices, q.acceptedAnswers, 'choice');
    if (q.format === 'type') {
      if (!q.acceptedAnswers?.length) err(`${q.id}: no accepted answers`);
      if (!['gloss', 'consonants', 'pointed'].includes(q.compare)) err(`${q.id}: unknown compare mode`);
      if (q.compare === 'pointed') {
        for (const answer of q.acceptedAnswers ?? []) if (!/[א-ת]/.test(answer) || comparisonKey(answer, 'pointed') === comparisonKey(answer, 'consonants')) err(`${q.id}: a pointed answer must be Hebrew with its points`);
      }
      if (q.compare === 'consonants') {
        for (const answer of q.acceptedAnswers ?? []) if (!/[א-ת]/.test(answer)) err(`${q.id}: a consonant answer must be Hebrew letters`);
      }
      if (!q.recognitionChoices?.length) err(`${q.id}: typing questions need recognition choices`);
      else choiceSet(q.recognitionChoices, q.recognitionAccepted, 'recognition');
    }
    if (q.format === 'tokens') {
      const ids = new Set(q.tokenOptions.map(t => t.id));
      if (!q.acceptedSequences?.length || !q.acceptedSequences.every(seq => seq.length && seq.every(id => ids.has(id)))) err(`${q.id}: accepted sequence uses unknown tokens`);
    }
    if (q.format === 'match') {
      checkMatch(q, err);
      if (q.recognitionChoices) choiceSet(q.recognitionChoices, q.recognitionAccepted, 'recognition');
    }

    const word = words.get(q.wordId);
    if (q.key) checkKey(q, word, tokens, err, () => acceptedTexts(q));
    if (!word) continue;
    for (const skill of word.requires) if (!q.requires.includes(skill)) err(`${q.id}: missing the word's requirement ${skill}`);
    const answerText = () => (q.choices ?? q.recognitionChoices).find(c => (q.acceptedAnswers ?? q.recognitionAccepted).includes(c.id))?.text;
    const letters = [...word.consonants];
    const keyRule = {
      'tpl-first-letter': () => answerText() === letters[0] || err(`${q.id}: answer is not the word's first letter`),
      'tpl-last-letter': () => answerText() === letters.at(-1) || err(`${q.id}: answer is not the word's last letter`),
      'tpl-final-partner': () => answerText() === FINAL_TO_REGULAR[letters.at(-1)] || err(`${q.id}: answer is not the final letter's regular shape`),
      'tpl-inscribe-mirror': () => answerText() === word.consonants || err(`${q.id}: answer is not the word's spelling`),
      'tpl-inscribe-type': () => {
        if (q.acceptedAnswers.some(a => comparisonKey(a, 'consonants') !== word.consonants)) err(`${q.id}: accepted answer is not the word's spelling`);
        const recognized = q.recognitionChoices.find(c => q.recognitionAccepted.includes(c.id))?.text;
        if (recognized !== word.hebrew) err(`${q.id}: recognition answer is not the word's spelling`);
      },
      'tpl-gloss-choice': () => answerText() === word.gloss || err(`${q.id}: answer is not the word's meaning`),
      // In context a word can take any of its listed senses, alone or as "one or the other". It can't just contain a gloss as a substring.
      'tpl-context-choice': () => {
        const senses = new Set([word.gloss, ...word.meanings, ...word.meanings.map(m => m.split(',')[0].trim())]);
        const parts = (answerText() ?? '').split(/\s+or\s+/);
        if (!senses.has(answerText()) && !parts.every(part => senses.has(part))) err(`${q.id}: answer is not the word's meaning`);
      },
      'tpl-gloss-type': () => q.acceptedAnswers.includes(word.gloss) || err(`${q.id}: word's meaning is not accepted`),
    }[q.templateId];
    if (keyRule) keyRule();
    else if (!q.key) err(`${q.id}: no answer-key rule for template ${q.templateId}`);

    if (q.taskFamily === 'understand-meaning') {
      const typed = data.questions.filter(o => o.wordId === q.wordId && o.format === 'type' && o.compare === 'gloss').flatMap(o => o.acceptedAnswers);
      const senses = new Set([...word.meanings.map(m => m.split(',')[0]), ...typed]);
      const options = q.choices ?? q.recognitionChoices;
      const accepted = q.acceptedAnswers ?? [];
      for (const c of options) if (!accepted.includes(c.id) && !(q.recognitionAccepted ?? []).includes(c.id) && senses.has(c.text)) err(`${q.id}: distractor "${c.text}" is a valid sense of this word`);
    }
  }

  // Capture readiness.
  for (const w of data.words) {
    const own = data.questions.filter(q => q.wordId === w.id);
    if (own.length < 6) err(`${w.id}: has ${own.length} questions, needs at least 6`);
    const templates = new Set();
    // The region where this word first appears has to teach what its demonstrations ask.
    const home = data.regions.find(r => r.wordIds.includes(w.id));
    if (!home) err(`${w.id}: is in no region's word list`);
    else {
      if (w.regionIds[0] !== home.id) err(`${w.id}: lists ${w.regionIds[0]} first, but first appears in ${home.id}`);
      const skills = reach.afterRegion.get(home.id);
      for (const skill of w.requires) if (!skills.has(skill)) err(`${w.id}: requires ${skill}, not taught by the end of ${home.id}`);
      for (const family of CAPTURE_FAMILIES) {
        const answerable = own.filter(q => q.taskFamily === family && q.requires.every(skill => skills.has(skill)));
        if (own.some(q => q.taskFamily === family) && answerable.length < 2) err(`${w.id}: ${family} has ${answerable.length} question(s) answerable in ${home.id}, and needs one more for a fresh retry`);
      }
    }
    for (const family of CAPTURE_FAMILIES) {
      const inFamily = own.filter(q => q.taskFamily === family);
      if (!inFamily.length) err(`${w.id}: no ${family} question`);
      else if (inFamily.length < 2) err(`${w.id}: ${family} needs a fresh stem for retries`);
      for (const q of inFamily) {
        if (templates.has(q.templateId)) err(`${w.id}: template ${q.templateId} used across stems`);
        templates.add(q.templateId);
      }
    }
  }

  // Lessons: teach in order, with examples taken from the source.
  const earlier = new Set();
  for (const l of data.lessons) {
    for (const skill of l.requires) if (!earlier.has(skill)) err(`${l.id}: requires ${skill} before any lesson teaches it`);
    for (const skill of l.teaches) earlier.add(skill);
    for (const id of l.guidedQuestionIds) {
      if (!questions.has(id)) { err(`${l.id}: unknown guided question ${id}`); continue; }
      // Guided practice comes before the lesson ends, so this lesson's own skills are only there if already taught.
      const usable = new Set([...earlier].filter(skill => !l.teaches.includes(skill) || l.requires.includes(skill)));
      for (const skill of questions.get(id).requires) if (!usable.has(skill)) err(`${l.id}: guided question ${id} requires ${skill}, which hasn't been taught yet`);
    }
    if (!l.workedExamples.length) err(`${l.id}: needs a worked example`);
    for (const ex of l.workedExamples) {
      const token = tokens.get(ex.tokenId);
      if (!token) err(`${l.id}: worked example cites unknown token ${ex.tokenId}`);
      else if (!pointed(token.surface).includes(pointed(ex.hebrew))) err(`${l.id}: worked example ${ex.hebrew} is not in its token`);
    }
  }

  // Regions and badges.
  const lessonTokens = new Set(data.lessons.flatMap(l => l.workedExamples.map(ex => ex.tokenId)));
  const vocabularyTokens = new Set(data.words.flatMap(w => [w.example.tokenId, ...w.relatedForms.map(r => r.tokenId)]));
  for (const r of data.regions) {
    for (const id of r.requiresBadges) if (!badgeIds.has(id)) err(`${r.id}: requires unknown badge ${id}`);
    for (const id of r.lessonIds) if (!lessons.has(id)) err(`${r.id}: unknown lesson ${id}`);
    for (const id of r.wordIds) if (!words.has(id)) err(`${r.id}: unknown word ${id}`);
    if (!words.has(r.seedWordId)) err(`${r.id}: unknown seed word`);
    const afterFirst = reach.firstLesson.get(r.id);
    if (words.get(r.seedWordId)?.requires.some(skill => !afterFirst.has(skill) && skill !== 'word-meaning')) err(`${r.id}: seed word needs more than the first lesson teaches`);
    for (const ids of Object.values(r.puzzleQuestionIds)) for (const id of ids) if (!questions.has(id)) err(`${r.id}: unknown puzzle question ${id}`);
    for (const group of Object.keys(r.puzzleQuestionIds)) if (RESERVED_GROUPS.has(group)) err(`${r.id}: puzzle group name ${group} is reserved`);
    const badgeQuestions = r.badge.questionIds.map(id => questions.get(id));
    r.badge.questionIds.forEach((id, i) => { if (!badgeQuestions[i]) err(`${r.id}: unknown badge question ${id}`); });
    const skills = reach.afterRegion.get(r.id);
    const present = badgeQuestions.filter(q => q?.requires.every(skill => skills.has(skill)));
    const families = new Set(present.map(q => q.taskFamily));
    for (const family of r.badge.requiredTaskFamilies) if (!families.has(family)) err(`${r.id}: no badge question for required family ${family}`);
    if (present.length < r.badge.requiredCorrect + 2) err(`${r.id}: badge needs spare questions for retries`);
    for (const skill of r.badge.requiresSkills) if (!skills.has(skill)) err(`${r.id}: badge requires ${skill}, not taught by the end of this region`);
    const capturable = r.wordIds.filter(id => words.get(id)?.requires.every(skill => skills.has(skill)));
    if (r.badge.requiresCaptures > capturable.length) err(`${r.id}: badge wants ${r.badge.requiresCaptures} captures, and only ${capturable.length} words can be captured here`);
    for (const q of present) {
      if (q.wordId !== null) err(`${q.id}: badge items must not be capture vocabulary`);
      if (q.tokenId && lessonTokens.has(q.tokenId)) err(`${q.id}: reuses a lesson's worked example`);
      if (q.tokenId && vocabularyTokens.has(q.tokenId)) err(`${q.id}: reuses a vocabulary token`);
    }

    // Quest shape, with targets the game can really complete, and pools that survive a miss where they come up.
    const quest = data.quests.find(item => item.id === r.questId);
    if (!quest) { err(`${r.id}: unknown quest ${r.questId}`); continue; }
    if (quest.regionId !== r.id) err(`${quest.id}: belongs to ${quest.regionId}, used by ${r.id}`);
    const flagTarget = id => {
      if (r.id === 'r1' && R1_FLAGS.has(id)) return true;
      if (id === r.badge.id) return true;
      const [owner, group, extra] = id.split(':');
      return owner === r.id && extra === undefined && (['rival', 'gate', 'exit', 'ward', 'secret'].includes(group) || Object.hasOwn(r.puzzleQuestionIds, group));
    };
    const skillsAt = stageIndex => {
      const have = new Set(reach.beforeRegion.get(r.id));
      for (const id of r.lessonIds) {
        const at = quest.stages.findIndex(stage => stage.kind === 'lesson' && stage.targetIds.includes(id));
        if (at < stageIndex) for (const skill of lessons.get(id)?.teaches ?? []) have.add(skill);
      }
      return have;
    };
    const poolCheck = (group, key, stageIndex) => {
      const pool = r.puzzleQuestionIds[group];
      if (!pool) { err(`${r.id}: puzzleQuestionIds needs ${group}`); return; }
      const have = skillsAt(stageIndex);
      const answerable = pool.filter(id => questions.get(id)?.requires.every(skill => have.has(skill)));
      const needed = Math.max(POOL_FLOOR[group] ?? 2, gateRequired(built, key) + 1);
      if (answerable.length < needed) err(`${r.id}: ${group} pool has ${answerable.length} answerable where the quest reaches it, and needs ${needed} so a miss can retry`);
    };
    const stageOf = target => quest.stages.findIndex(stage => stage.targetIds.includes(target));
    const rivalAt = stageOf(r.id === 'r1' ? 'neriCleared' : `${r.id}:rival`);
    const gateAt = stageOf(r.id === 'r1' ? 'gateOpen' : `${r.id}:gate`);
    poolCheck('neri', `${r.id}:rival`, rivalAt < 0 ? quest.stages.length : rivalAt);
    poolCheck('gate', `${r.id}:gate`, gateAt < 0 ? quest.stages.length : gateAt);
    // Stages run in order and later lessons wait for them, so each stage has to be playable on what comes before it.
    quest.stages.forEach((stage, at) => {
      if (!STAGE_KINDS.has(stage.kind)) { err(`${quest.id}: stage ${stage.id} has unknown kind ${stage.kind}`); return; }
      const have = skillsAt(at);
      const answerable = q => q?.requires.every(skill => have.has(skill) || skill === 'word-meaning');
      if (stage.kind === 'lesson') {
        for (const id of stage.targetIds) {
          if (lessons.has(id) && !r.lessonIds.includes(id)) err(`${quest.id}: lesson ${id} is not in ${r.id}`);
          for (const skill of lessons.get(id)?.requires ?? []) if (!have.has(skill)) err(`${quest.id}: stage ${stage.id} teaches ${id}, which needs ${skill} from a later stage`);
        }
      }
      if (stage.kind === 'capture') {
        for (const id of stage.targetIds) if (!r.wordIds.includes(id)) err(`${quest.id}: capture target ${id} is not in ${r.id}`);
        const pool = (stage.targetIds.length ? stage.targetIds : r.wordIds).filter(id => answerable(words.get(id))
          && CAPTURE_FAMILIES.every(family => data.questions.some(q => q.wordId === id && q.taskFamily === family && answerable(q))));
        if ((stage.requiredCount ?? pool.length) > pool.length) err(`${quest.id}: stage ${stage.id} wants ${stage.requiredCount} captures, and only ${pool.length} can be captured by then`);
      }
      if (['puzzle', 'duel', 'exit'].includes(stage.kind)) {
        for (const id of stage.targetIds) if (!flagTarget(id)) err(`${quest.id}: target ${id} is not something ${r.id} can complete`);
        if (stage.targetIds.includes(r.badge.id) && r.badge.questionIds.filter(id => answerable(questions.get(id))).length < r.badge.requiredCorrect + 2) err(`${quest.id}: stage ${stage.id} reaches the badge before enough of its questions are answerable`);
      }
      if (stage.kind === 'reading') {
        for (const id of stage.targetIds) {
          const passage = data.passages.find(p => p.id === id);
          if (!passage) { err(`${quest.id}: reading target ${id} is not a passage`); continue; }
          if (!passage.requires.every(skill => have.has(skill))) err(`${quest.id}: stage ${stage.id} reads ${id} before its skills are taught`);
          if (passage.questionIds.length && passage.questionIds.filter(item => answerable(questions.get(item))).length < Math.min(2, passage.questionIds.length) + 1) err(`${quest.id}: stage ${stage.id} reads ${id} before a spare question is answerable`);
        }
      }
    });
    const last = quest.stages.at(-1);
    if (last?.kind !== 'exit' || !last.targetIds.includes(r.id === 'r1' ? 'exitOpened' : `${r.id}:exit`)) err(`${quest.id}: the last stage must be this region's exit`);

    // A seal has to be answerable by some word the player can have by then. Seals are optional, but never impossible.
    const ward = OBJECTS.find(o => o.key === `${r.id}:ward`);
    if (ward && phase !== 'opening') {
      const soFar = data.regions.slice(0, data.regions.indexOf(r) + 1).flatMap(item => item.wordIds);
      if (!soFar.some(id => words.has(id) && abilityOf(words.get(id)) === ward.ability)) err(`${r.id}: its ward wants a ${ward.ability} word, and none is available by then`);
    }
    if (!REGION_MAPS[r.id]) err(`${r.id}: has no world maps`);
  }
  const earned = new Set();
  const open = [...data.regions];
  for (let changed = true; changed;) {
    changed = false;
    for (const r of [...open]) if (r.requiresBadges.every(id => earned.has(id))) { earned.add(r.badge.id); open.splice(open.indexOf(r), 1); changed = true; }
  }
  for (const r of open) err(`${r.id}: not reachable through badge prerequisites`);

  // Quests and passages.
  for (const quest of data.quests) {
    checkSources(quest.id, quest.sourceIds);
    for (const stage of quest.stages) {
      if (stage.kind === 'lesson') for (const id of stage.targetIds) if (!lessons.has(id)) err(`${quest.id}: unknown lesson ${id}`);
    }
  }
  for (const p of data.passages) {
    checkSources(p.id, [p.sourceId]);
    if (pointed(p.sourceText) !== pointed(p.display)) err(`${p.id}: display does not match its source text`);
    for (const skill of p.requires) if (!taught.has(skill)) err(`${p.id}: requires untaught skill ${skill}`);
    for (const t of p.tokens) if (!pointed(p.sourceText).includes(pointed(t.hebrew))) err(`${p.id}: token ${t.id} is not in the source text`);
    for (const id of p.questionIds) if (!questions.has(id)) err(`${p.id}: unknown question ${id}`);
    const quest = data.quests.find(item => item.stages.some(stage => stage.kind === 'reading' && stage.targetIds.includes(p.id)));
    if (quest && regions.has(quest.regionId)) {
      const skills = reach.afterRegion.get(quest.regionId);
      for (const skill of p.requires) if (taught.has(skill) && !skills.has(skill)) err(`${p.id}: requires ${skill}, not taught by the end of ${quest.regionId}`);
      const answerable = p.questionIds.filter(id => questions.get(id)?.requires.every(skill => skills.has(skill)));
      if (p.questionIds.length && answerable.length < Math.min(2, p.questionIds.length) + 1) err(`${p.id}: reading needs a spare question for a retry`);
    }
  }

  // Phase floors.
  if (phase === 'opening') {
    if (data.words.length < 8 || data.words.length > 10) err(`opening needs 8 to 10 words, has ${data.words.length}`);
  } else {
    if (data.words.length < 150) err(`campaign needs at least 150 words, has ${data.words.length}`);
    if (data.questions.length < 600) err(`campaign needs at least 600 questions, has ${data.questions.length}`);
    if (data.regions.length !== 8) err(`campaign needs 8 regions, has ${data.regions.length}`);
    else if (data.regions.some((r, i) => r.id !== CAMPAIGN_REGIONS[i] || r.order !== i + 1)) err('campaign regions must be r1..r8, in order');
  }
  return errors;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const phase = process.argv.includes('--opening') ? 'opening' : 'full';
  const errors = validateContent(content, phase);
  if (errors.length) {
    console.error(`Content validation failed (${phase}): ${errors.length} problem(s)`);
    for (const e of errors) console.error(`  ${e}`);
    process.exit(1);
  }
  console.log(`Content valid (${phase}): ${content.words.length} words, ${content.questions.length} questions, ${content.lessons.length} lessons, ${content.regions.length} region(s), ${content.attestations.length} source tokens.`);
}
