// What a lesson really teaches, as opposed to the skill label it grants. These bind worked examples and
// feedback to the shown form, so a false note or an untaught sign fails. They don't certify the teaching.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { content } from '../../src/content.js';
import { checkAnswer } from '../../src/answers.js';
import { loadCorpus, researchAvailable } from '../../scripts/content-source.mjs';

const { lessons, questions } = content;
const q = id => content.questionById.get(id);
const lesson = id => content.lessonById.get(id);
const corpus = researchAvailable() ? loadCorpus() : null;
const skip = corpus ? false : 'pinned research XML not present';
const dir = new URL('../../docs/CONTENT-REVIEW-ledger/', import.meta.url);
const rows = new Map(readdirSync(dir).filter(f => f.startsWith('q-')).flatMap(f => readFileSync(new URL(f, dir), 'utf8').split('\n').filter(Boolean).map(line => { const r = JSON.parse(line); return [r.id, r]; })));

const SIGNS = { 'ַ': 'patah', 'ָ': 'qamats', 'ִ': 'hireq', 'ֵ': 'tsere', 'ֶ': 'segol', 'ֹ': 'holam', 'ֻ': 'qibbuts', 'ְ': 'shewa', 'ֲ': 'hataf patah', 'ֱ': 'hataf segol', 'ֳ': 'hataf qamats' };
const SHUREQ = /ו(?:[֑-ׇ]*ּ)(?![ְ-ֻ])/;
const signsIn = text => {
  const nfd = text.normalize('NFD');
  const found = new Set([...nfd].flatMap(c => (SIGNS[c] ? [SIGNS[c]] : [])));
  if (SHUREQ.test(nfd)) found.add('shureq');
  return found;
};
// A sign counts as taught only when a worked example both shows it and names it in its note.
const taughtSigns = l => new Set(l.workedExamples.flatMap(x => [...signsIn(x.hebrew)].filter(s => x.note.toLowerCase().includes(s))));

const afterVowels = new Set(['alphabet', 'rtl', 'final-forms', 'word-meaning', 'vowels', 'syllables']);
const laterGuided = new Set(lessons.filter(l => l.id !== 'l-vowels').flatMap(l => l.guidedQuestionIds));
const openAfterVowels = questions.filter(x => x.regionId === 'r2' && x.requires.every(s => afterVowels.has(s)) && x.command === 'read' && !laterGuided.has(x.id));

test('R1: every sign an open reading question shows was worked through first', () => {
  const taught = taughtSigns(lesson('l-vowels'));
  const wrong = [];
  assert.ok(openAfterVowels.some(x => x.id === 'H4325-sound'), 'plain words must stay open after the lesson');
  for (const x of openAfterVowels) {
    const shown = [x.displayHebrew ?? '', ...(x.choices ?? []).filter(c => c.lang === 'he').map(c => c.text)].join(' ');
    for (const s of signsIn(shown)) if (!taught.has(s)) wrong.push(`${x.id}: shows ${s}, which l-vowels hasn't worked`);
  }
  assert.deepEqual(wrong, []);
});

test('R1: the teaching check fails when the teaching is missing', () => {
  const l = lesson('l-vowels');
  const without = { ...l, workedExamples: l.workedExamples.filter(x => !signsIn(x.hebrew).has('hireq')) };
  assert.equal(taughtSigns(without).has('hireq'), false);
  assert.equal(taughtSigns(l).has('hireq'), true);
});

test('R1: stress and the guide\'s spelling are taught before they are tested', () => {
  const l = lesson('l-vowels');
  assert.match(l.explanation, /capital/i, 'sound options use capitals for stress');
  for (const needed of [/qof/i, /\bkh\b/, /tsade/i, /sin/i, /shin/i, /alef/i, /ayin/i]) assert.match(l.explanation, needed);
  assert.ok(l.workedExamples.some(x => /capital/i.test(x.note) && /[A-Z]{2}/.test(x.note)), 'a worked example must read a capitalized guide');
  assert.ok(openAfterVowels.some(x => x.choices?.some(c => /[A-Z]/.test(c.text))), 'capitals do appear in open questions');
  const guided = l.guidedQuestionIds.map(q);
  assert.ok(guided.length >= 3, 'guided practice has to cover vowels and stress');
  assert.ok(guided.some(x => /stress|capital/i.test(x.prompt)), 'no guided stress item');
  assert.ok(guided.some(x => x.displayHebrew && signsIn(x.displayHebrew).has('hireq')), 'no guided hireq item');
  for (const x of guided) assert.ok(x.requires.every(s => ['alphabet', 'rtl'].includes(s)), `${x.id} must be open during its lesson`);
});

test('R1: later reading and form rules used in tasks are stated in their lessons', () => {
  const stated = [
    ['l-gutturals', /hataf segol/i], ['l-gutturals', /silent/i], ['l-dagesh', /final he is silent/i],
    ['l-narrative', /וָאֹכֵל|prefix alef/], ['l-hiphil', /מַ/], ['l-piel', /מְ/], ['l-existence', /אֵין/],
    ['l-noun-suffix', /נַפְשִׁי/], ['l-noun-suffix', /אָחִיו|extra yod/], ['l-nouns', /collective/i],
    ['l-piel', /Qal passive/],
  ];
  assert.deepEqual(stated.filter(([id, re]) => !re.test(lesson(id).explanation)).map(([id, re]) => `${id}: ${re}`), []);
});

// Letter names as feedback uses them. A claim of a dagesh in a letter has to be true of a form the same text shows.
const LETTER = { bet: 'ב', gimel: 'ג', dalet: 'ד', he: 'ה', vav: 'ו', zayin: 'ז', tet: 'ט', yod: 'י', kaf: 'כ', lamed: 'ל', mem: 'מ', nun: 'נ', pe: 'פ', tsade: 'צ', qof: 'ק', resh: 'ר', shin: 'ש', sin: 'ש', tav: 'ת' };
const dageshClaims = text => [...text.matchAll(/dagesh (?:in|on|inside) (?:the )?(?:prefix )?(bet|gimel|dalet|he|vav|zayin|tet|yod|kaf|lamed|mem|nun|pe|tsade|qof|resh|shin|sin|tav)\b/gi)].map(m => m[1].toLowerCase());
const hasDagesh = (hebrew, name) => new RegExp(`${LETTER[name]}[֑-ׇ]*ּ`).test(hebrew.normalize('NFD'));

test('R2: the immutable token keeps its dagesh in yod, not in sin', { skip }, () => {
  const { surface } = corpus.byId.get('01gSo');
  assert.ok(hasDagesh(surface, 'yod'));
  assert.equal(hasDagesh(surface, 'sin'), false);
});

test('R2: a claimed dagesh is really on that letter in the form being taught', { skip }, () => {
  const wrong = [];
  const check = (id, text, forms) => {
    const all = [...forms, ...(text.match(/[א-ת][֑-ׇא-ת]*/g) ?? [])].join(' ');
    for (const name of dageshClaims(text)) if (!hasDagesh(all, name)) wrong.push(`${id}: claims a dagesh in ${name}: ${text}`);
  };
  for (const l of lessons) for (const x of l.workedExamples) check(l.id, x.note, [x.hebrew, corpus.byId.get(x.tokenId)?.surface ?? '']);
  for (const x of questions) check(x.id, x.explanation, [x.prompt, x.displayHebrew ?? '', ...(x.choices ?? []).map(c => c.text)]);
  assert.deepEqual(wrong, []);
});

test('R2: parsing does not lean on a later lesson, and the missing nun is taught as it is', { skip }, () => {
  const parsing = lesson('l-parsing').workedExamples;
  assert.ok(!parsing.some(x => x.tokenId === '01gSo'), 'the exceptional I-nun form comes after the parsing lesson');
  const iNun = lesson('l-i-nun').workedExamples.find(x => x.tokenId === '01gSo');
  assert.match(iNun.note, /no dagesh/i);
  assert.match(iNun.note, /yod/);
  assert.doesNotMatch(q('H5375-in-context').explanation, /dagesh marks it/);
  assert.match(lesson('l-i-nun').explanation, /no dagesh|without a dagesh|can drop/i);
});

test('R3: rejecting a Qal-passive analysis takes a prompt that asks for OSHB\'s label', () => {
  const x = q('b-r7-stem-1');
  assert.match(x.prompt, /OSHB/);
  assert.equal(x.key.morph, 'VPp3ms');
  assert.equal(checkAnswer(x, 'c0').correct, true);
  assert.equal(x.choices.find(c => c.id === 'c0').text, 'Pual');
  assert.match(x.explanation, /Qal passive/);
  const row = rows.get(x.id);
  assert.match(row.rej.c2, /Qal passive/);
  assert.match(row.rej.c2, /asks for OSHB/);
});

test('R4: a typed meaning fits the shown form, not another stem of its root', () => {
  assert.equal(checkAnswer(q('H4191-type-gloss'), 'kill').correct, false);
  assert.equal(checkAnswer(q('H4191-type-gloss'), 'die').correct, true);
  assert.equal(checkAnswer(q('H0589-type-gloss'), 'me').correct, false);
  assert.equal(checkAnswer(q('H0595-type-gloss'), 'me').correct, false);
  const wrong = [];
  for (const w of content.words) {
    const typed = questions.find(x => x.wordId === w.id && x.templateId === 'tpl-gloss-type');
    // A dictionary-form task says so ("this verb's meaning"), and may cover the verb's range across stems.
    if (/this verb/i.test(typed.prompt)) continue;
    for (const m of w.meanings) {
      const [, sense, stem] = m.match(/^(.+), in the (Qal|Niphal|Piel|Pual|Hithpael|Hiphil|Hophal)$/) ?? [];
      if (sense && typed.acceptedAnswers.some(a => a.toLowerCase() === sense.toLowerCase())) wrong.push(`${typed.id}: accepts ${sense}, a ${stem} sense`);
    }
  }
  assert.deepEqual(wrong, []);
});

test('R4: a Qal sense stays accepted when the source really has it', { skip }, () => {
  // Gen.1.22 "fill the waters" and Gen.4.18 "fathered" are Qal in OSHB, so neither alias needs another stem.
  assert.match(corpus.byId.get('01RCg').morph, /^HC\/Vqv/);
  assert.equal(checkAnswer(q('H4390-type-gloss'), 'fill').correct, true);
  assert.equal(corpus.byId.get('01fQG').morph, 'HVqp3ms');
  assert.equal(checkAnswer(q('H3205-type-gloss'), 'fathered').correct, true);
  const word = id => content.words.find(w => w.id === id);
  assert.doesNotMatch(word('H4390').meanings.join(), /fill, in the Piel/);
  assert.doesNotMatch(word('H3974').notes, /not the light itself/);
  assert.doesNotMatch(q('H4994-type-gloss').explanation, /doesn't mean "now"/);
});
