// TEST FIXTURE ONLY. Nothing in src/ imports this, and it never counts as the real campaign.
// It keeps the real r1 data and adds synthetic r2..r8 records: the Hebrew is made-up letter
// strings and the glosses are placeholders. It proves the generic game code handles data of the
// shared-contract shape. It proves nothing about language content, which the content lane owns.
import { readFileSync } from 'node:fs';
import { buildContent } from '../../src/content.js';

const raw = name => JSON.parse(readFileSync(new URL(`../../data/${name}.json`, import.meta.url), 'utf8'));
const LETTERS = [...'אבגדהזחטילנסעפקרשת'];
const FINAL = { נ: 'ן', פ: 'ף' };
const QAMATS = 'ָ';
const SRC = ['aleph-quest-original'];
export const FIXTURE_REGIONS = ['r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'r8'];
const POS = { r6: 'verb', r7: 'verb' };

function spell(n, length) {
  const letters = [];
  for (let i = 0, v = n; i < length; i++) { letters.push(LETTERS[v % LETTERS.length]); v = Math.floor(v / LETTERS.length) + 3 + i; }
  letters[length - 1] = FINAL[letters[length - 1]] ?? letters[length - 1];
  return letters.join('');
}
const point = consonants => [...consonants].map(c => c + QAMATS).join('');

function common(id, regionId, requires, extra) {
  return {
    id, regionId, wordId: null, command: 'read', taskFamily: 'fx-family', semanticStemId: id, templateId: `tpl-${id}`, contextId: 'ctx-fx',
    requires, sourceIds: SRC, format: 'choice', prompt: `Fixture prompt ${id}.`, explanation: `Fixture explanation for ${id}.`, hint: `Fixture hint for ${id}.`,
    choices: [{ id: 'c0', text: 'fixture right' }, { id: 'c1', text: 'fixture wrong' }, { id: 'c2', text: 'fixture other' }], acceptedAnswers: ['c0'],
    ...extra,
  };
}

function wordRecords(regionId, index, skills) {
  const n = regionId.slice(1) * 100 + index;
  const id = `FX${n}`;
  const consonants = spell(n * 7 + index, 3 + (index % 2));
  const hebrew = point(consonants);
  const gloss = `fxgloss ${n}`;
  const needsB = index % 4 === 3;
  const requires = ['alphabet', 'rtl', 'word-meaning', skills[0], ...(needsB ? [skills[1]] : [])];
  const tokenId = `fx${n}a`, formToken = `fx${n}b`;
  const word = {
    id, strongId: `H${90000 + n}`, hebrew, consonants, transliteration: `fxsay${n}`, gloss, meanings: [gloss], pos: POS[regionId] ?? 'noun',
    root: index % 5 === 0 ? consonants : null, ...(index % 5 === 0 ? { rootNote: 'Fixture root.' } : {}),
    features: { gender: 'masculine', number: 'singular' },
    relatedForms: [{ hebrew: `${hebrew}וֹ`, relationship: 'inflection', features: { suffix: 'his' }, gloss: `${gloss} of his`, reference: 'Fix.1.1', tokenId: formToken, sourceId: SRC[0] }],
    example: { hebrew, translation: `Fixture line ${n}`, reference: 'Fix.1.1', tokenId, sourceId: SRC[0], original: true },
    regionIds: [regionId], requires, sourceIds: SRC,
  };
  const attest = [
    { tokenId, reference: 'Fix.1.1', surface: hebrew, lemma: String(90000 + n), morph: 'fx' },
    { tokenId: formToken, reference: 'Fix.1.2', surface: `${hebrew}וֹ`, lemma: String(90000 + n), morph: 'fx' },
  ];
  const q = (suffix, extra) => common(`${id}-${suffix}`, regionId, requires, { wordId: id, templateId: `tpl-${suffix}`, ...extra });
  const letters = [...consonants];
  const options = (right, ...wrong) => [{ id: 'c0', text: right, lang: 'he' }, ...wrong.map((text, i) => ({ id: `c${i + 1}`, text, lang: 'he' }))];
  const glossChoices = [{ id: 'c0', text: gloss }, { id: 'c1', text: 'fxwrong one' }, { id: 'c2', text: 'fxwrong two' }];
  const questions = [
    q('first-letter', { command: 'read', taskFamily: 'read-letter', templateId: 'tpl-first-letter', contextId: 'ctx-letter', displayHebrew: hebrew, choices: options(letters[0], 'ץ', 'ף') }),
    q('last-letter', { command: 'read', taskFamily: 'read-letter', templateId: 'tpl-last-letter', contextId: 'ctx-letter', displayHebrew: hebrew, choices: options(letters.at(-1), 'ץ', 'ך') }),
    q('gloss', { command: 'understand', taskFamily: 'understand-meaning', templateId: 'tpl-gloss-choice', contextId: 'ctx-citation', displayHebrew: hebrew, choices: glossChoices }),
    q('type-gloss', { command: 'understand', taskFamily: 'understand-meaning', templateId: 'tpl-gloss-type', contextId: 'ctx-translate', format: 'type', compare: 'gloss', displayHebrew: hebrew, choices: undefined, acceptedAnswers: [gloss], recognitionChoices: glossChoices, recognitionAccepted: ['c0'] }),
    q('mirror', { command: 'inscribe', taskFamily: 'inscribe-spelling', templateId: 'tpl-inscribe-mirror', contextId: 'ctx-spelling', choices: options(consonants, `${consonants}ץ`, `ף${consonants}`) }),
    q('write', { command: 'inscribe', taskFamily: 'inscribe-spelling', templateId: 'tpl-inscribe-type', contextId: 'ctx-recall', format: 'type', compare: 'consonants', choices: undefined, acceptedAnswers: [consonants], recognitionChoices: options(hebrew, `${hebrew}ץ`, `ף${hebrew}`), recognitionAccepted: ['c0'] }),
    q('analyze', { command: 'analyze', taskFamily: 'fx-analyze', templateId: 'tpl-fx-analyze', contextId: 'ctx-fx-forms', requires: [...new Set([...requires, skills[1]])], key: { answer: 'masculine', features: { gender: 'masculine' } }, choices: [{ id: 'c0', text: 'masculine' }, { id: 'c1', text: 'feminine' }] }),
    q('build', { command: 'build', taskFamily: 'fx-build', templateId: 'tpl-fx-build', contextId: 'ctx-fx-build', requires: [...new Set([...requires, skills[1]])], format: 'tokens', choices: undefined, acceptedAnswers: undefined, key: { answer: consonants }, tokenOptions: [...letters.map((text, i) => ({ id: `t${i}`, text })), { id: 'tx', text: 'ץ' }], acceptedSequences: [letters.map((_, i) => `t${i}`)] }),
  ];
  return { word, attest, questions };
}

function region(regionId, order, previousBadge) {
  const skills = [`fx-${regionId}-a`, `fx-${regionId}-b`];
  const lessonIds = [`lfx-${regionId}-a`, `lfx-${regionId}-b`];
  const before = order === 2 ? ['alphabet', 'rtl', 'final-forms', 'word-meaning'] : [`fx-r${order - 1}-b`];
  const guided = common(`gfx-${regionId}`, regionId, before, { taskFamily: 'fx-guided', contextId: 'ctx-fx-guided' });
  const lessons = [
    { id: lessonIds[0], regionId, title: `Fixture lesson ${regionId} A`, mentor: `Mentor ${regionId}`, requires: before, teaches: [skills[0]], chart: null, explanation: 'Fixture explanation.', workedExamples: [{ hebrew: point('אבג'), translation: 'fixture', tokenId: 'fxlesson', reference: 'Fix.1.1', note: 'Fixture note.' }], guidedQuestionIds: [guided.id] },
    { id: lessonIds[1], regionId, title: `Fixture lesson ${regionId} B`, mentor: `Mentor ${regionId}`, requires: [skills[0]], teaches: [skills[1]], chart: null, explanation: 'Fixture explanation.', workedExamples: [{ hebrew: point('אבג'), translation: 'fixture', tokenId: 'fxlesson', reference: 'Fix.1.1', note: 'Fixture note.' }], guidedQuestionIds: [] },
  ];
  const built = Array.from({ length: 20 }, (_, i) => wordRecords(regionId, i, skills));
  const after = [...before, ...skills];
  const pool = (prefix, n, requires, more = () => ({})) => Array.from({ length: n }, (_, i) => common(`${prefix}-${regionId}-${i}`, regionId, requires, { taskFamily: i % 2 ? 'fx-classify' : 'fx-compare', ...more(i) }));
  const neri = pool('pfx-neri', 6, skills);
  const gate = pool('pfx-gate', 4, skills, i => (i === 1 ? { format: 'door', choices: [{ id: 'door-w', text: 'אב', lang: 'he' }, { id: 'door-m', text: 'בג', lang: 'he' }, { id: 'door-e', text: 'גד', lang: 'he' }], acceptedAnswers: ['door-m'] } : {}));
  const badgeQs = pool('bfx', 9, after, i => {
    const family = ['fx-one', 'fx-two', 'fx-three'][i % 3];
    if (i === 3) return { taskFamily: family, format: 'match', choices: undefined, acceptedAnswers: undefined, pairs: [{ left: 'אב', right: 'fxgroup one' }, { left: 'בג', right: 'fxgroup two' }, { left: 'גד', right: 'fxgroup one' }] };
    if (i === 4) return { taskFamily: family, format: 'tokens', choices: undefined, acceptedAnswers: undefined, tokenOptions: [{ id: 't0', text: 'א' }, { id: 't1', text: 'ב' }, { id: 't2', text: 'ג' }], acceptedSequences: [['t0', 't1']] };
    if (i === 5) return { taskFamily: family, format: 'type', compare: 'pointed', choices: undefined, acceptedAnswers: ['אָב'], recognitionChoices: [{ id: 'c0', text: 'אָב', lang: 'he' }, { id: 'c1', text: 'אֵב', lang: 'he' }], recognitionAccepted: ['c0'] };
    return { taskFamily: family };
  });
  const passageId = `pfx-${regionId}`;
  const reading = pool('rfx', 4, after);
  const stages = [
    { id: 'learn', text: `Fixture: learn from the mentor in ${regionId}.`, kind: 'lesson', targetIds: [lessonIds[0]] },
    { id: 'first', text: `Fixture: capture a word in ${regionId}.`, kind: 'capture', targetIds: [], requiredCount: 1 },
    { id: 'learn2', text: `Fixture: second lesson in ${regionId}.`, kind: 'lesson', targetIds: [lessonIds[1]] },
    { id: 'three', text: `Fixture: capture three words in ${regionId}.`, kind: 'capture', targetIds: [], requiredCount: 3 },
    { id: 'rival', text: `Fixture: duel the rival in ${regionId}.`, kind: 'duel', targetIds: [`${regionId}:rival`] },
    { id: 'gate', text: `Fixture: solve the gate in ${regionId}.`, kind: 'puzzle', targetIds: [`${regionId}:gate`] },
    { id: 'read', text: `Fixture: read the lectern in ${regionId}.`, kind: 'reading', targetIds: [passageId] },
    { id: 'badge', text: `Fixture: earn the badge in ${regionId}.`, kind: 'duel', targetIds: [`bfx-${regionId}`] },
    { id: 'exit', text: `Fixture: take the exit of ${regionId}.`, kind: 'exit', targetIds: [`${regionId}:exit`] },
  ];
  return {
    lessons,
    words: built.map(b => b.word),
    attestations: built.flatMap(b => b.attest),
    questions: [guided, ...built.flatMap(b => b.questions), ...neri, ...gate, ...badgeQs, ...reading],
    region: {
      id: regionId, order, title: `Fixture Region ${order}`, theme: `Fixture theme ${order}.`, rossChapters: [order], alignment: 'fixture',
      requiresBadges: [previousBadge], lessonIds, wordIds: built.map(b => b.word.id), seedWordId: built[0].word.id, questId: `qfx-${regionId}`,
      badge: { id: `bfx-${regionId}`, title: `Fixture Seal ${order}`, questionIds: badgeQs.map(q => q.id), requiredCorrect: 4, requiredTaskFamilies: ['fx-one', 'fx-two', 'fx-three'], requiresSkills: skills, requiresCaptures: 3 },
      puzzleQuestionIds: { neri: neri.map(q => q.id), gate: gate.map(q => q.id) },
    },
    quest: { id: `qfx-${regionId}`, regionId, title: `Fixture quest ${order}`, stages, reward: 'Fixture reward.', sourceIds: SRC },
    passage: { id: passageId, reference: 'Fix.1.1', sourceId: SRC[0], sourceText: point('אבג'), display: point('אבג'), translation: 'Fixture translation.', tokens: [{ id: 'fxp1', hebrew: point('אבג'), lemma: '1', morph: 'fx', gloss: 'fixture' }], notes: 'Fixture note.', questionIds: reading.map(q => q.id), requires: skills },
  };
}

// The real first region alone, whatever else data/ holds, so these tests stay true after content lands.
const r1Data = () => ({
  words: raw('words').filter(w => w.regionIds[0] === 'r1'), questions: raw('questions').filter(q => q.regionId === 'r1'),
  lessons: raw('lessons').filter(l => l.regionId === 'r1'), regions: raw('regions').filter(r => r.id === 'r1'),
  quests: raw('quests').filter(q => q.regionId === 'r1'), passages: raw('passages').filter(p => p.id === 'p-gen-44-19'),
  sources: raw('sources'), attestations: raw('attestations'),
});
export const openingOnly = () => buildContent(r1Data());

export function campaignFixture() {
  const data = r1Data();
  data.attestations.push({ tokenId: 'fxlesson', reference: 'Fix.1.1', surface: point('אבג'), lemma: '1', morph: 'fx' });
  let badge = data.regions[0].badge.id;
  FIXTURE_REGIONS.forEach((id, i) => {
    const built = region(id, i + 2, badge);
    data.words.push(...built.words);
    data.questions.push(...built.questions.map(q => JSON.parse(JSON.stringify(q))));
    data.lessons.push(...built.lessons);
    data.regions.push(built.region);
    data.quests.push(built.quest);
    data.passages.push(built.passage);
    data.attestations.push(...built.attestations);
    badge = built.region.badge.id;
  });
  return buildContent(data);
}
