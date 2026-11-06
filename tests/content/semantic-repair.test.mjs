// Regressions for the independent word and question/lesson findings against bad6e81. They bind each repaired
// claim to its record and the pinned source. They don't certify the unchanged corpus.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { content } from '../../src/content.js';
import { checkAnswer, comparisonKey } from '../../src/answers.js';
import { loadCorpus, loadStrong, pointedKey, researchAvailable } from '../../scripts/content-source.mjs';

const { questions, lessons, regions, words } = content;
const q = id => content.questionById.get(id);
const lesson = id => content.lessonById.get(id);
const word = id => content.wordById.get(id);
const corpus = researchAvailable() ? loadCorpus() : null;
const strong = researchAvailable() ? loadStrong() : null;
const skip = corpus ? false : 'pinned research XML not present';
const order = regions.flatMap(r => r.lessonIds).map(lesson);
const taught = id => order.findIndex(l => l.id === id);
// Lessons finished at the point a question's own skills first all hold, in the campaign's order.
const prefix = (x, all = order) => {
  const have = new Set();
  const done = [];
  for (const l of all) {
    if (x.requires.every(s => have.has(s))) break;
    done.push(l);
    for (const s of l.teaches) have.add(s);
  }
  return done;
};

test('Q01: a letters-only recognition option never has the answer\'s own letters', () => {
  const wrong = [];
  for (const x of questions.filter(item => item.templateId === 'tpl-inscribe-type')) {
    const key = comparisonKey(x.acceptedAnswers[0], 'consonants');
    for (const c of x.recognitionChoices) if (!x.recognitionAccepted.includes(c.id) && comparisonKey(c.text, 'consonants') === key) wrong.push(`${x.id}: ${c.text}`);
  }
  assert.deepEqual(wrong, []);
  assert.equal(checkAnswer(q('H8033-write'), 'שם').correct, true);
  assert.equal(checkAnswer(q('H8033-write'), 'שמ').correct, false);
});

test('Q02: the זֹאת item asks for the demonstrative, and doesn\'t say English can\'t use she', () => {
  const x = q('H2063-in-context');
  assert.match(x.prompt, /demonstrative/i);
  assert.equal(x.choices.find(c => x.acceptedAnswers.includes(c.id)).text, 'this');
  assert.doesNotMatch(x.explanation, /would be הִוא instead/);
  assert.match(x.explanation, /English can/);
});

test('Q03: the מָלֵא item names the card\'s primary citation and doesn\'t call מָלָא malformed', () => {
  const x = q('H4390-pointed');
  assert.match(x.prompt, /primary citation/i);
  assert.match(x.prompt, /card/i);
  assert.match(x.explanation, /מָלָא/);
  assert.match(x.explanation, /dictionary/i);
  assert.ok(x.choices.some(c => pointedKey(c.text) === pointedKey('מִלֵּא')));
  assert.equal(x.acceptedAnswers[0], 'c0');
});

test('Q04: a spelling task with a real variant asks for the card\'s spelling', () => {
  for (const [id, primary] of [['H1419-write', 'גדול'], ['H6963-write', 'קול'], ['H3605-write', 'כל'], ['H0113-write', 'אדון'], ['H4725-write', 'מקום'], ['H3974-write', 'מאור']]) {
    const x = q(id);
    assert.match(x.prompt, /word card/, id);
    assert.equal(checkAnswer(x, primary).correct, true, id);
  }
  assert.doesNotMatch(q('H3605-write').prompt, /full/);
  assert.match(q('H7969-write').prompt, /full spelling/);
  assert.match(q('H2472-write').prompt, /full spelling/);
});

test('L01: the yod of רָאִיתִי is taught as writing the vowel, not as a sounded glide', () => {
  const note = lesson('l-iii-he').workedExamples.find(x => x.tokenId === '01wVm').note;
  assert.doesNotMatch(note, /glide/);
  assert.match(note, /hireq/);
  assert.match(note, /no y sound/);
});

test('L02: a construct form is linked, not said to be without stress', () => {
  const text = lesson('l-construct').explanation;
  assert.doesNotMatch(text, /loses its stress/);
  assert.match(text, /closely linked/);
  assert.match(text, /can keep its own stress/);
});

test('L03: אַל covers wishes, and לֹא with an imperfect is named for firm bans', () => {
  const text = lesson('l-volitives').explanation;
  assert.doesNotMatch(text, /use אַל, not לֹא/);
  assert.match(text, /לֹא with an imperfect/);
  assert.match(text, /אַל/);
});

test('L04: background goes with a new clause opening on a non-verb, not with any waw on a noun', () => {
  const dis = lesson('l-disjunctive');
  const chain = lesson('l-clause-chains');
  for (const text of [dis.explanation, chain.explanation, dis.workedExamples.find(x => x.tokenId === '01LN3').note, chain.workedExamples.find(x => x.tokenId === '01LN3').note, q('g-disjunctive').prompt, q('gen-1-2-a').choices[0].text]) assert.match(text, /clause/i, text);
  assert.doesNotMatch(dis.explanation, /When waw attaches to a word/);
  assert.doesNotMatch(chain.explanation, /A waw on a non-verb stops/);
  assert.match(chain.explanation, /וְאֵת/);
  // The control: waw inside a clause only joins two objects.
  assert.equal(q('b-r8-chain-1').choices.find(c => q('b-r8-chain-1').acceptedAnswers.includes(c.id)).text, 'No: it joins two objects of one verb');
});

// The interrogative marker is only taught with l-statives, so no earlier task may lean on it.
test('P01: nothing leans on the question marker before its lesson, and יֵשׁ with לְ is worked first', { skip }, () => {
  const at = taught('l-statives');
  const wrong = [];
  for (const x of questions) for (const id of x.tokenIds ?? (x.tokenId ? [x.tokenId] : [])) {
    if (/^HTi\//.test(corpus.byId.get(id)?.morph ?? '') && prefix(x).length <= at) wrong.push(`${x.id}: ${id}`);
  }
  assert.deepEqual(wrong, []);
  const x = q('a-exist-1');
  assert.deepEqual(x.tokenIds, ['01XzD', '01s5t']);
  assert.equal(corpus.byId.get('01XzD').lemma, '3426');
  const done = prefix(x);
  assert.ok(done.includes(lesson('l-existence')));
  assert.ok(lesson('l-existence').workedExamples.some(e => e.tokenId === '01kWG' && /לְ/.test(e.note) && /who has/.test(e.note)));
  assert.ok(lesson('l-existence').guidedQuestionIds.includes('g-existence'));
  assert.deepEqual(r5Holds(x), true);
});
function r5Holds(x) {
  const r5 = regions.find(r => r.id === 'r5');
  return x.regionId === 'r5' && x.requires.every(s => regions.slice(0, 5).flatMap(r => r.lessonIds).flatMap(id => lesson(id).teaches).includes(s)) && r5.lessonIds.includes('l-existence');
}

const prepares = (form, all) => {
  const worked = all.some(l => l.workedExamples.some(x => pointedKey(x.hebrew) === pointedKey(form) && /from it/.test(x.note)));
  const guided = all.some(l => l.guidedQuestionIds.map(q).some(g => g.displayHebrew && pointedKey(g.displayHebrew) === pointedKey(form) && g.choices.find(c => g.acceptedAnswers.includes(c.id)).text === 'from it'));
  return { worked, guided };
};
const r5Lessons = regions.slice(0, 5).flatMap(r => r.lessonIds).map(lesson);

test('P02: מִמֶּנּוּ is worked and guided before the r5 trial asks for it', { skip }, () => {
  assert.deepEqual(prepares('מִמֶּנּוּ', r5Lessons), { worked: true, guided: true });
  const stripped = r5Lessons.map(l => (l.id === 'l-prep-suffix' ? { ...l, workedExamples: l.workedExamples.filter(x => pointedKey(x.hebrew) !== pointedKey('מִמֶּנּוּ')), guidedQuestionIds: l.guidedQuestionIds.filter(id => id === 'g-prep-suffix') } : l));
  assert.deepEqual(prepares('מִמֶּנּוּ', stripped), { worked: false, guided: false });
  assert.match(lesson('l-prep-suffix').explanation, /מִמֶּנּוּ/);
  // The source tag is kept as it is, and the contextual answer stays.
  assert.equal(corpus.byId.get('01PuA').morph, 'HR/Sp1cp');
  assert.equal(q('b-r5-prep-3').choices.find(c => q('b-r5-prep-3').acceptedAnswers.includes(c.id)).text, 'from it');
});

test('F01: the Piel of רָחַף is the verse\'s form, not the dictionary headword\'s', { skip }, () => {
  assert.match(word('H7363').features.stem, /Piel in the verse/);
  assert.match(corpus.byId.get('01yNB').morph, /^HVp/);
});

test('F02: the שָׁכַב card separates the form from its sexual and almost contexts', { skip }, () => {
  const w = word('H7901');
  assert.notEqual(w.example.translation, 'he lay down');
  assert.match(w.example.translation, /nearly/);
  assert.match(w.notes, /isolated/i);
  assert.match(w.notes, /כִּמְעַט/);
  assert.match(w.relatedForms[0].gloss, /with/);
  assert.equal(corpus.byId.get('01sDb').morph, 'HVqp3ms');
});

test('F03: the proximal demonstratives are one paradigm, and -teen is a combining form', { skip }, () => {
  for (const id of ['H2088', 'H2063', 'H0428']) {
    const w = word(id);
    assert.match(w.notes, /same demonstrative paradigm/, id);
    for (const f of w.relatedForms) {
      assert.notEqual(f.relationship, 'separate-lexeme', id);
      assert.equal(f.features.paradigm, 'proximal demonstrative', id);
    }
  }
  const teen = word('H6235').relatedForms[0];
  assert.notEqual(teen.relationship, 'separate-lexeme');
  assert.match(teen.features.form, /combining form/);
  assert.match(teen.gloss, /twelve/);
  assert.match(strong.get('H2063').source, /irregular feminine/);
});

test('F03: the deduplicated inventory holds at least 150 lexemes, and counts each card once', { skip }, () => {
  const inventory = JSON.parse(readFileSync(new URL('../../docs/CONTENT-REVIEW-ledger/lexeme-inventory.json', import.meta.url), 'utf8'));
  const listed = [...inventory.units.flatMap(u => u.cards), ...inventory.singles];
  assert.equal(new Set(listed).size, listed.length, 'a card is counted twice');
  assert.deepEqual([...listed].sort(), words.map(w => w.id).sort());
  assert.ok(inventory.units.length + inventory.singles.length >= 150, `${inventory.units.length + inventory.singles.length} lexemes`);
  assert.deepEqual(inventory.units.find(u => u.id === 'proximal-demonstrative').cards.sort(), ['H0428', 'H2063', 'H2088']);
  assert.ok(inventory.units.some(u => u.cards.includes('H0589') && u.cards.includes('H0595')));
  assert.equal(words.filter(w => ['H3820', 'H3824'].includes(w.id)).length, 1, 'the heart family counts once');
});

test('F04: the suffixed lord example is unmistakably human, and Sarah\'s line stays', { skip }, () => {
  const w = word('H0113');
  assert.ok(!w.relatedForms.some(f => f.tokenId === '01sDg'), 'Gen.18.3 can also be read as H136');
  const f = w.relatedForms[0];
  assert.equal(f.tokenId, '013uB');
  assert.equal(corpus.byId.get('013uB').reference, 'Gen.23.6');
  assert.equal(w.example.tokenId, '01v6K');
});

test('F06: the נָשָׂא example translates only the token it shows', () => {
  const w = word('H5375');
  assert.equal(w.example.tokenId, '01C5b');
  assert.doesNotMatch(w.example.translation, /great/);
  assert.match(w.example.translation, /bearing/);
  assert.doesNotMatch(q('H5375-type-gloss').explanation, /punishment/);
});

test('F07: the common noun אָדָם names the separate proper-name entry', () => {
  const w = word('H0120');
  assert.ok(!w.meanings.some(m => /Adam/.test(m)));
  assert.match(w.notes, /H121/);
  const x = q('H0120-type-gloss');
  assert.match(x.explanation, /H121/);
  assert.equal(checkAnswer(x, 'adam').correct, true);
  assert.equal(checkAnswer(x, 'human being').correct, true);
});

test('New lexemes are source-bound, have three families with retries, and open in their region', { skip }, () => {
  const expected = { H7965: ['r3', '01WBR', 'Gen.26.31', 'b/7965'], H3824: ['r5', '01XQZ', 'Gen.20.5', '3824'], H0068: ['r3', '01qTN', 'Gen.11.3', 'l/68'] };
  for (const [id, [region, token, reference, lemma]] of Object.entries(expected)) {
    const w = word(id);
    assert.ok(w, id);
    assert.deepEqual(w.regionIds, [region]);
    assert.equal(w.example.tokenId, token);
    const up = corpus.byId.get(token);
    assert.equal(up.reference, reference);
    assert.equal(up.lemma, lemma);
    const known = new Set(regions.slice(0, Number(region[1])).flatMap(r => r.lessonIds).flatMap(l => lesson(l).teaches));
    for (const family of ['read-letter', 'understand-meaning', 'inscribe-spelling']) {
      assert.ok(questions.filter(x => x.wordId === id && x.taskFamily === family && x.requires.every(s => known.has(s))).length >= 2, `${id}: ${family}`);
    }
  }
  assert.equal(corpus.byId.get('01zuP').lemma, '3820 a');
  assert.match(strong.get('H3820').source, /a form of/);
  assert.ok(word('H3824').relatedForms.some(f => f.tokenId === '01zuP' && f.relationship === 'derivation'));
  assert.ok(questions.length >= 600);
});
