// Content validator. `--opening` holds the first region to real rules. With no flag it also
// enforces the full campaign floor, and it fails until that content actually exists.
import { fileURLToPath } from 'node:url';
import { comparisonKey } from '../src/answers.js';
import { content } from '../src/content.js';

const CAPTURE_FAMILIES = ['read-letter', 'understand-meaning', 'inscribe-spelling'];
const FINAL_TO_REGULAR = { ך: 'כ', ם: 'מ', ן: 'נ', ף: 'פ', ץ: 'צ' };
const RELATIONSHIPS = new Set(['inflection', 'derivation', 'separate-lexeme']);
const FORMATS = new Set(['choice', 'door', 'type', 'tokens']);

const pointed = text => comparisonKey(text.replaceAll('/', ''), 'pointed');
const lemmaNumbers = lemma => lemma.split('/').map(part => part.split(' ')[0]);
const strongNumber = id => id.slice(1);

export function validateContent(data, phase) {
  const errors = [];
  const err = message => errors.push(message);
  const index = list => new Map(list.map(item => [item.id, item]));
  const words = index(data.words), questions = index(data.questions), lessons = index(data.lessons);
  const sources = index(data.sources);
  const tokens = new Map(data.attestations.map(a => [a.tokenId, a]));
  const taught = new Set(data.lessons.flatMap(l => l.teaches));
  const badgeIds = new Set(data.regions.map(r => r.badge.id));

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
      if (!q.recognitionChoices?.length) err(`${q.id}: typing questions need recognition choices`);
      else choiceSet(q.recognitionChoices, q.recognitionAccepted, 'recognition');
    }
    if (q.format === 'tokens') {
      const ids = new Set(q.tokenOptions.map(t => t.id));
      if (!q.acceptedSequences?.length || !q.acceptedSequences.every(seq => seq.length && seq.every(id => ids.has(id)))) err(`${q.id}: accepted sequence uses unknown tokens`);
    }

    const word = words.get(q.wordId);
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
      'tpl-context-choice': () => answerText()?.includes(word.gloss) || err(`${q.id}: answer is not the word's meaning`),
      'tpl-gloss-type': () => q.acceptedAnswers.includes(word.gloss) || err(`${q.id}: word's meaning is not accepted`),
    }[q.templateId];
    if (keyRule) keyRule();
    else err(`${q.id}: no answer-key rule for template ${q.templateId}`);

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
    for (const id of l.guidedQuestionIds) if (!questions.has(id)) err(`${l.id}: unknown guided question ${id}`);
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
    if (words.get(r.seedWordId)?.requires.some(skill => !data.lessons[0].teaches.includes(skill))) err(`${r.id}: seed word needs more than the first lesson teaches`);
    for (const ids of Object.values(r.puzzleQuestionIds)) for (const id of ids) if (!questions.has(id)) err(`${r.id}: unknown puzzle question ${id}`);
    const badgeQuestions = r.badge.questionIds.map(id => questions.get(id));
    r.badge.questionIds.forEach((id, i) => { if (!badgeQuestions[i]) err(`${r.id}: unknown badge question ${id}`); });
    const present = badgeQuestions.filter(Boolean);
    const families = new Set(present.map(q => q.taskFamily));
    for (const family of r.badge.requiredTaskFamilies) if (!families.has(family)) err(`${r.id}: no badge question for required family ${family}`);
    if (present.length < r.badge.requiredCorrect + 2) err(`${r.id}: badge needs spare questions for retries`);
    for (const q of present) {
      if (q.wordId !== null) err(`${q.id}: badge items must not be capture vocabulary`);
      if (q.tokenId && lessonTokens.has(q.tokenId)) err(`${q.id}: reuses a lesson's worked example`);
      if (q.tokenId && vocabularyTokens.has(q.tokenId)) err(`${q.id}: reuses a vocabulary token`);
    }
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
      if (stage.kind === 'duel') for (const id of stage.targetIds) if (!badgeIds.has(id)) err(`${quest.id}: unknown badge ${id}`);
    }
  }
  for (const p of data.passages) {
    checkSources(p.id, [p.sourceId]);
    if (pointed(p.sourceText) !== pointed(p.display)) err(`${p.id}: display does not match its source text`);
    for (const skill of p.requires) if (!taught.has(skill)) err(`${p.id}: requires untaught skill ${skill}`);
    for (const t of p.tokens) if (!pointed(p.sourceText).includes(pointed(t.hebrew))) err(`${p.id}: token ${t.id} is not in the source text`);
  }

  // Phase floors.
  if (phase === 'opening') {
    if (data.words.length < 8 || data.words.length > 10) err(`opening needs 8 to 10 words, has ${data.words.length}`);
  } else {
    if (data.words.length < 150) err(`campaign needs at least 150 words, has ${data.words.length}`);
    if (data.questions.length < 600) err(`campaign needs at least 600 questions, has ${data.questions.length}`);
    if (data.regions.length !== 8) err(`campaign needs 8 regions, has ${data.regions.length}`);
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
