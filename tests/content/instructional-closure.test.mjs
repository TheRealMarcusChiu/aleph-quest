// Each declared operation an independent question scores needs its own worked example and guided application,
// in order, before that question opens. Labels and ids don't count: a guide has to show the operation on a real
// token and key it. This binds the 11 operations the grammar audit named. It doesn't certify the rest.
import test from 'node:test';
import assert from 'node:assert/strict';
import { content } from '../../src/content.js';
import { checkAnswer } from '../../src/answers.js';
import { loadCorpus, pointedKey, researchAvailable } from '../../scripts/content-source.mjs';

const { regions } = content;
const q = id => content.questionById.get(id);
const lesson = id => content.lessonById.get(id);
const corpus = researchAvailable() ? loadCorpus() : null;
const skip = corpus ? false : 'pinned research XML not present';
const order = regions.flatMap(r => r.lessonIds).map(lesson);
const answerText = x => x.choices.find(c => c.id === x.acceptedAnswers[0]).text;

// worked: what a worked note says. key: what the guided answer applies. contrast: the wrong operation a choice offers.
const operations = [
  { name: 'verbless statement', lesson: 'l-nominal', old: 'g-nominal', guide: 'g-nominal-2', skill: 'nominal-clauses', tokens: ['015L1', '01nY7'], form: 'טוֹב הָעֵץ', morph: /Aamsa/, worked: /no verb/i, key: /supplies/, contrast: /means was/, independent: ['a-nominal-1', 'b-r3-adj-3', 'p-r3-neri-3'] },
  { name: 'segholate noun pattern', lesson: 'l-min', old: 'g-min', guide: 'g-min-2', skill: 'noun-patterns', tokens: ['012Ss'], form: 'לֶחֶם', morph: /Nc/, worked: /segholate/, key: /segholate/, contrast: /last syllable/, independent: ['a-segholate-1'] },
  { name: 'comparative min', lesson: 'l-adjectives', old: 'g-adjectives', guide: 'g-adjectives-2', skill: 'comparison', tokens: ['01uZ7'], form: 'גָדוֹל', morph: /Aamsa/, worked: /comparison/, key: /greater than/, contrast: /because of/, independent: ['a-compare-1'] },
  { name: 'demonstrative gender', lesson: 'l-pronouns', old: 'g-pronouns', guide: 'g-pronouns-2', skill: 'demonstratives', tokens: ['01u4V'], form: 'הַזֹּאת', morph: /Pdxfs/, worked: /feminine/, key: /feminine this/, contrast: /personal/, independent: ['a-demo-1'] },
  { name: 'III-alef vowel', lesson: 'l-existence', old: 'g-existence', guide: 'g-existence-2', skill: 'iii-aleph', tokens: ['01Nvk'], form: 'בָּרָא', morph: /Vqp3ms/, worked: /ends in alef/, key: /silent alef/, contrast: /plural/, independent: ['a-iii-aleph-1', 'b-r5-exist-3', 'p-r5-gate-2'] },
  { name: 'relative link', lesson: 'l-existence', old: 'g-existence', guide: 'g-existence-3', skill: 'relative', tokens: ['01sC3'], form: 'אֲשֶׁר', morph: /Tr/, worked: /links/, key: /links a clause/, contrast: /asks/, independent: ['a-relative-1', 'b-r5-exist-2'] },
  { name: 'directive he', lesson: 'l-imperfect', old: 'g-imperfect', guide: 'g-imperfect-2', skill: 'directive-he', tokens: ['01S4Y'], form: 'הַשָּׁמַיְמָה', morph: /\/Sd$/, worked: /direction/, key: /Direction/, contrast: /prefix/, independent: ['a-directive-1'] },
  { name: 'what versus who', lesson: 'l-statives', old: 'g-statives', guide: 'g-statives-2', skill: 'questions', tokens: ['01gjk'], form: 'מַה', morph: /Ti$/, worked: /what/, key: /what/, contrast: /who/, independent: ['a-stat-1'] },
  { name: 'infinitive absolute emphasis', lesson: 'l-infinitive', old: 'g-infinitive', guide: 'g-infinitive-2', skill: 'inf-absolute', tokens: ['01nSW'], form: 'יָדֹעַ', morph: /Vqa/, worked: /emphasis/, key: /stresses/, contrast: /purpose/, independent: ['a-infabs-1', 'b-r6-inf-1'] },
  { name: 'Pual passive by OSHB label', lesson: 'l-piel', old: 'g-piel', guide: 'g-piel-2', skill: 'pual', tokens: ['01zZV'], form: 'יֻלַּד', morph: /VPp3ms/, worked: /Pual/, key: /^Pual/, contrast: /^Piel/, independent: ['a-pual-1', 'b-r7-stem-1', 'b-r7-parse-2'] },
  { name: 'Hophal prefix vowel', lesson: 'l-hiphil', old: 'g-hiphil', guide: 'g-hiphil-2', skill: 'hophal', tokens: ['01p3s'], form: 'הוּרַד', morph: /VHp3ms/, worked: /Hophal/, key: /^Hophal/, contrast: /^Hiphil/, independent: ['a-hophal-1', 'b-r7-stem-4'] },
];

// Judged on records, so a guide that only carries the right id or label can't pass.
const closes = (l, op, questionOf = q) => {
  const worked = l.workedExamples.some(x => op.worked.test(`${x.translation} ${x.note}`));
  const guided = l.guidedQuestionIds.map(questionOf).some(g => {
    if (!g?.requires.includes(op.skill) || !g.choices) return false;
    const ids = g.tokenIds ?? (g.tokenId ? [g.tokenId] : []);
    if (ids.join() !== op.tokens.join()) return false;
    if (pointedKey(g.displayHebrew) !== pointedKey(op.form)) return false;
    if (!op.tokens.some(id => op.morph.test(corpus.byId.get(id).morph))) return false;
    return op.key.test(answerText(g)) && g.choices.some(c => !g.acceptedAnswers.includes(c.id) && op.contrast.test(c.text));
  });
  return worked && guided;
};

test('every named operation has its worked example and guided application', { skip }, async t => {
  for (const op of operations) {
    await t.test(op.name, () => {
      const l = lesson(op.lesson);
      assert.ok(l.guidedQuestionIds.includes(op.old), 'the old guide stays');
      assert.equal(l.guidedQuestionIds[0], op.old, 'the old guide stays first');
      assert.equal(closes(l, op), true);
      const g = q(op.guide);
      assert.equal(g.wordId, null);
      assert.equal(g.regionId, l.regionId);
      assert.deepEqual(g.requires, [op.skill]);
      assert.ok(l.teaches.includes(op.skill));
      assert.equal(checkAnswer(g, g.acceptedAnswers[0]).correct, true);
    });
  }
});

test('counterfactuals: taking the guide or the worked note away, or swapping in another guide, reopens the gap', { skip }, () => {
  for (const op of operations) {
    const l = lesson(op.lesson);
    assert.equal(closes({ ...l, guidedQuestionIds: l.guidedQuestionIds.filter(id => id !== op.guide) }, op), false, `${op.name}: no guide`);
    assert.equal(closes({ ...l, guidedQuestionIds: [op.old] }, op), false, `${op.name}: only the old guide`);
    assert.equal(closes({ ...l, workedExamples: l.workedExamples.filter(x => !op.worked.test(`${x.translation} ${x.note}`)) }, op), false, `${op.name}: no worked note`);
    // The right id and skill label on an unrelated original question still fail.
    const fake = { ...q(op.guide), tokenId: undefined, tokenIds: undefined, displayHebrew: 'אֵל', choices: [{ id: 'c0', text: 'a wrong idea' }, { id: 'c1', text: 'another' }], acceptedAnswers: ['c0'] };
    assert.equal(closes(l, op, id => (id === op.guide ? fake : q(id))), false, `${op.name}: unrelated original`);
  }
});

test('the lesson comes before every independent question, and they keep their own tokens', { skip }, () => {
  const lessonIndex = id => order.findIndex(l => l.id === id);
  for (const op of operations) {
    for (const id of op.independent) {
      const x = q(id);
      // A question opens once its skills are all taught. The lesson with this skill is at or before that point.
      const opens = Math.max(...x.requires.map(s => order.findIndex(l => l.teaches.includes(s))));
      assert.ok(lessonIndex(op.lesson) <= opens, `${id} opens before ${op.lesson}`);
      assert.ok(x.requires.includes(op.skill) || op.name === 'verbless statement', `${id}: tests ${op.skill}`);
      const own = x.tokenIds ?? (x.tokenId ? [x.tokenId] : []);
      for (const token of op.tokens) assert.ok(!own.includes(token), `${op.guide} can't borrow ${id}'s token`);
    }
    const g = q(op.guide);
    // Future-skill negative control: nothing after this lesson is needed.
    for (const s of g.requires) assert.ok(order.findIndex(l => l.teaches.includes(s)) <= lessonIndex(op.lesson));
  }
  // A future skill must be refused, so the check above has teeth.
  assert.ok(order.findIndex(l => l.teaches.includes('hophal')) > lessonIndex('l-nominal'));
});

test('guide tokens are real, in source mark order, and agree with the keyed morphology', { skip }, () => {
  for (const op of operations) for (const id of op.tokens) {
    const a = content.attestations.find(x => x.tokenId === id);
    assert.ok(a, `${id}: shipped`);
    assert.equal(a.surface, corpus.byId.get(id).surface, id);
    assert.equal(a.morph, corpus.byId.get(id).morph, id);
  }
  for (const op of operations) {
    const g = q(op.guide);
    if (g.key) assert.ok(corpus.byId.get(g.key.tokenId).morph.includes(g.key.morph), op.guide);
  }
  assert.equal(corpus.byId.get('01UEd').reference, 'Gen.3.1');
  assert.ok(lesson('l-adjectives').workedExamples.some(x => x.tokenId === '01UEd' && /than/.test(x.translation)));
  assert.ok(lesson('l-statives').workedExamples.some(x => x.tokenId === '01iQS' && /what/.test(x.translation)));
});

test('the Pual guide asks for OSHB\'s label and says the other analysis exists', () => {
  const g = q('g-piel-2');
  assert.match(g.prompt, /OSHB/);
  assert.match(g.explanation, /Qal passive/);
  assert.match(g.explanation, /OSHB/);
});

test('F2: the construct feedback says what really changes in שְׂדֵה', { skip }, () => {
  const x = q('b-r4-construct-3');
  assert.doesNotMatch(x.explanation, /Both vowels/);
  assert.match(x.explanation, /reduces to shewa/);
  assert.match(x.explanation, /tsere/);
  assert.match(x.explanation, /field of/);
  assert.equal(x.tokenId, '015MF');
  assert.equal(corpus.byId.get('015MF').morph, 'HNcmsc');
  assert.deepEqual(x.choices.map(c => c.text), ['field of', 'the field', 'fields']);
  assert.deepEqual(x.acceptedAnswers, ['c0']);
  assert.equal(x.hint, 'Singular and leaning forward.');
});
