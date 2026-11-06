// Regressions for the independent findings against 9adbfcc. They bind each repaired claim to its record and the
// pinned source. They don't certify the unreviewed questions or the rest of the corpus.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { content } from '../../src/content.js';
import { checkAnswer } from '../../src/answers.js';
import { loadCorpus, loadStrong, pointedKey, researchAvailable } from '../../scripts/content-source.mjs';

const { questions, lessons, regions, words } = content;
const q = id => content.questionById.get(id);
const lesson = id => content.lessonById.get(id);
const word = id => content.wordById.get(id);
const corpus = researchAvailable() ? loadCorpus() : null;
const strong = researchAvailable() ? loadStrong() : null;
const skip = corpus ? false : 'pinned research XML not present';
const inventory = JSON.parse(readFileSync(new URL('../../docs/CONTENT-REVIEW-ledger/lexeme-inventory.json', import.meta.url), 'utf8'));

test('H0430: agreement with God is normal, not universal, and the plural form and gods stay', { skip }, () => {
  const w = word('H0430');
  assert.doesNotMatch(w.notes, /but it takes a singular verb/);
  assert.match(w.notes, /normally/);
  assert.match(w.notes, /Genesis 20:13/);
  assert.equal(w.features.number, 'plural in form');
  assert.ok(w.meanings.includes('gods'));
  assert.equal(checkAnswer(q('H0430-type-gloss'), 'gods').correct, true);
  assert.doesNotMatch(q('g-context-reading').explanation, /takes a singular verb\./);
  assert.match(q('g-context-reading').explanation, /here/);
  // The controls that make the universal wrong: plural verbs in clauses with this noun.
  assert.equal(corpus.byId.get('018xD').morph, 'HVhp3cp');
  assert.equal(corpus.byId.get('01Wov').reference, corpus.byId.get('018xD').reference);
  assert.equal(corpus.byId.get('01CFi').morph, 'HVNp3cp');
  assert.equal(corpus.byId.get('01s23').reference, corpus.byId.get('01CFi').reference);
});

test('Inventory: the third-person pronouns are one unit, and first person is not subtracted twice', { skip }, () => {
  const cards = [...inventory.units.flatMap(u => u.cards), ...inventory.singles];
  assert.deepEqual([...cards].sort(), words.map(w => w.id).sort());
  assert.equal(new Set(cards).size, cards.length);
  const third = inventory.units.find(u => u.id === 'third-person-pronoun');
  assert.deepEqual([...third.cards].sort(), ['H1931', 'H1992']);
  assert.match(strong.get('H1992').source, /masculine plural from/);
  assert.deepEqual([...inventory.units.find(u => u.id === 'first-person-singular-pronoun').cards].sort(), ['H0589', 'H0595']);
  assert.equal(inventory.units.filter(u => u.cards.some(c => ['H0589', 'H0595'].includes(c))).length, 1);
  assert.ok(word('H1931') && word('H1992'), 'both cards stay');
  assert.equal(inventory.units.length + inventory.singles.length, 150);
  assert.equal(words.length, 154);
});

test('H6212: a new family with a documented citation, real tokens and no invented root', { skip }, () => {
  const w = word('H6212');
  assert.ok(w);
  assert.ok(inventory.singles.includes('H6212'));
  assert.equal(w.strongId, 'H6212');
  // Not already a card under any other number, and not a form of one.
  assert.equal(words.filter(x => x.consonants === 'עשב').length, 1);
  assert.equal(w.root, null);
  assert.equal(w.rootNote, undefined);
  assert.equal(w.pos, 'noun');
  assert.equal(w.features.gender, 'masculine');
  assert.equal(strong.get('H6212').pos, 'n-m');
  assert.equal(w.transliteration, 'E-sev');
  // Strong has segol first, and all seven Genesis tokens have tsere. The card says so.
  assert.equal(pointedKey(w.hebrew), pointedKey('עֵשֶׂב'));
  assert.equal(pointedKey(strong.get('H6212').headword), pointedKey('עֶשֶׂב'));
  assert.match(w.citationNote, /segol/);
  assert.match(w.citationNote, /tsere/);
  for (const id of ['01GYe', '01aMT', '01KPU', '01S38', '01YBx', '01MRd', '01bd9']) {
    assert.equal(corpus.byId.get(id).lemma, '6212', id);
    assert.equal(pointedKey(corpus.byId.get(id).surface), pointedKey(w.hebrew), id);
  }
  assert.equal(w.example.tokenId, '01KPU');
  assert.equal(corpus.byId.get('01KPU').morph, 'HNcmsa');
  assert.equal(w.relatedForms[0].tokenId, '01MRd');
  assert.equal(corpus.byId.get('01MRd').morph, 'HNcmsc');
  assert.equal(w.relatedForms[0].features.state, 'construct');
  assert.deepEqual(w.regionIds, ['r3']);
  const r3 = regions.find(r => r.id === 'r3');
  assert.ok(r3.wordIds.includes('H6212'));
  const known = new Set(regions.slice(0, 3).flatMap(r => r.lessonIds).flatMap(l => lesson(l).teaches));
  for (const family of ['read-letter', 'understand-meaning', 'inscribe-spelling']) {
    assert.ok(questions.filter(x => x.wordId === 'H6212' && x.taskFamily === family && x.requires.every(s => known.has(s))).length >= 2, family);
  }
  assert.ok(!q('H6212-in-context').choices.some(c => !q('H6212-in-context').acceptedAnswers.includes(c.id) && /plant|grass|herb/i.test(c.text)), 'a real sense can\'t be a wrong option');
  assert.equal(checkAnswer(q('H6212-write'), 'עשב').correct, true);
});

test('b-order-1 names the common noun of its token, not the name Adam', { skip }, () => {
  const x = q('b-order-1');
  assert.doesNotMatch(x.prompt, /Adam/);
  assert.match(x.prompt, /man or human/);
  assert.match(x.prompt, /without its article/);
  const up = corpus.byId.get(x.tokenId);
  assert.equal(x.tokenId, '01WVH');
  assert.equal(up.lemma, 'd/120');
  assert.equal(up.morph, 'HTd/Ncmsa');
  assert.equal(x.regionId, 'r1');
  assert.deepEqual(x.requires, ['alphabet', 'rtl', 'final-forms']);
  assert.deepEqual(x.acceptedSequences, [['t0', 't1', 't2']]);
});

// Worked and guided preparation for a final-guttural reading question, judged on the actual records.
const furtivePrepared = l => {
  const worked = l.workedExamples.some(x => /furtive/.test(x.note));
  const guided = l.guidedQuestionIds.map(q).some(g => /[א-ת]ַ$/u.test(g.displayHebrew.normalize('NFD')) && /furtive/.test(g.explanation) && g.acceptedAnswers.some(a => /before the ayin/.test(g.choices.find(c => c.id === a).text)));
  return worked && guided;
};

test('a-ptc-1: furtive patah is worked and guided in its lesson, on another token', { skip }, () => {
  const l = lesson('l-participle');
  assert.equal(furtivePrepared(l), true);
  assert.equal(furtivePrepared({ ...l, guidedQuestionIds: ['g-participle'] }), false, 'removing the guided item must fail');
  assert.equal(furtivePrepared({ ...l, workedExamples: l.workedExamples.filter(x => !/furtive/.test(x.note)) }), false, 'removing the worked note must fail');
  const g = q('g-participle-2');
  assert.deepEqual(l.guidedQuestionIds, ['g-participle', 'g-participle-2']);
  assert.equal(g.tokenId, '01ki2');
  assert.notEqual(g.tokenId, q('a-ptc-1').tokenId);
  const up = corpus.byId.get('01ki2');
  assert.equal(up.reference, 'Gen.1.29');
  assert.equal(up.morph, 'HVqrmsa');
  assert.equal(pointedKey(up.surface), pointedKey(g.displayHebrew));
  assert.deepEqual(g.requires, q('g-participle').requires);
  assert.equal(g.templateId, q('g-participle').templateId);
  // The independent item keeps its correct token and morphology.
  assert.equal(q('a-ptc-1').tokenId, '014vF');
  assert.equal(corpus.byId.get('014vF').morph, 'HVqrmsa');
});

test('Genesis 1:5: the feedback describes this clause, and doesn\'t call the perfect forced', { skip }, () => {
  const a = q('gen-1-5-a');
  const n = q('p-r8-neri-2');
  const answer = x => x.choices.find(c => c.id === x.acceptedAnswers[0]).text;
  for (const x of [a, n]) {
    assert.doesNotMatch(`${answer(x)} ${x.explanation}`, /force|can't|must open/i);
    assert.match(`${answer(x)} ${x.explanation}`, /darkness/i);
    assert.match(x.explanation, /contrast/);
    assert.match(x.explanation, /perfect/);
  }
  assert.equal(corpus.byId.get(a.key.tokenId).morph, 'HVqp3ms');
  assert.deepEqual(a.acceptedAnswers, ['c0']);
  assert.deepEqual(n.acceptedAnswers, ['c0']);
});

test('Root notes attribute their source, not an unprovable authoring process', () => {
  const roots = { H4428: 'מלך', H5612: 'ספר', H1697: 'דבר', H2233: 'זרע' };
  for (const [id, root] of Object.entries(roots)) {
    assert.equal(word(id).root, root);
    assert.match(word(id).rootNote, /Strong derives this noun from the verb entry H\d+/);
  }
  assert.deepEqual(words.filter(w => /by hand/i.test(`${w.rootNote ?? ''} ${w.notes ?? ''}`)).map(w => w.id), []);
  assert.deepEqual(lessons.filter(l => /by hand/i.test(l.explanation)).map(l => l.id), []);
});

// id: [key, rejected form the broad prompt wrongly excluded, what the feedback has to say about that form]
const cardScoped = {
  'H0259-pointed': ['אֶחָד', 'אַחַד', /real contextual form/],
  'H5647-pointed': ['עָבַד', 'עֹבֵד', /real form of this verb/],
  'H3205-pointed': ['יָלַד', 'יֹלֵד', /participle/],
  'H6912-pointed': ['קָבַר', 'קִבֵּר', /isn't what this task asks/],
};

test('Pointing tasks with a real alternative ask for the card\'s primary citation', { skip }, () => {
  for (const [id, [key, other, note]] of Object.entries(cardScoped)) {
    const x = q(id);
    assert.match(x.prompt, /primary citation form on this game's word card/, id);
    assert.equal(x.choices.find(c => c.id === x.acceptedAnswers[0]).text, key, id);
    assert.deepEqual(x.acceptedAnswers, ['c0'], id);
    assert.equal(x.choices.find(c => c.id === 'c2').text, other, id);
    assert.equal(word(x.wordId).hebrew, key, id);
    assert.ok(x.explanation.includes(other), `${id}: names the alternative`);
    assert.match(x.explanation, note, id);
    assert.doesNotMatch(x.explanation, /impossible|not a word|invalid|never/i, id);
  }
  // The forms that make the broad prompts wrong are real tokens.
  assert.equal(corpus.byId.get('01CZt').morph, 'HAcmsa');
  assert.equal(corpus.byId.get('01Xxj').morph, 'HR/Acmsc');
  assert.equal(corpus.byId.get('01ot3').morph, 'HVqrmsc');
  assert.equal(pointedKey(corpus.byId.get('01ot3').surface), pointedKey('עֹבֵד'));
  // r4 feedback can't lean on a term the participle lesson teaches later.
  for (const id of ['H5647-pointed', 'H6912-pointed']) assert.doesNotMatch(q(id).explanation, /participle|Piel|Qal/, id);
});
