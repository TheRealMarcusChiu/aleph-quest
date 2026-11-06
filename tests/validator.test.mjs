import test from 'node:test';
import assert from 'node:assert/strict';
import { content } from '../src/content.js';
import { validateContent } from '../scripts/validate-content.mjs';
import { openingOnly } from './fixtures/campaign-fixture.mjs';

// Copies the real data, breaks one thing, and rebuilds the indexes.
function broken(mutate) {
  const copy = structuredClone({
    words: content.words, questions: content.questions, lessons: content.lessons, regions: content.regions,
    quests: content.quests, passages: content.passages, sources: content.sources, attestations: content.attestations,
  });
  mutate(copy);
  return copy;
}
const q = (data, id) => data.questions.find(item => item.id === id);
const w = (data, id) => data.words.find(item => item.id === id);
const failsWith = (mutate, pattern) => {
  const errors = validateContent(broken(mutate), 'opening');
  assert.ok(errors.some(e => pattern.test(e)), `expected ${pattern}, got: ${errors.join(' | ') || 'no errors'}`);
};

test('the shipped opening content passes every opening rule', () => {
  assert.deepEqual(validateContent(content, 'opening'), []);
});

test('the full phase reports the campaign floor it has not reached', () => {
  const r1 = openingOnly();
  const errors = validateContent(r1, 'full');
  assert.ok(errors.some(e => /150/.test(e)));
  assert.ok(errors.some(e => /600/.test(e)));
  assert.ok(errors.some(e => /8 regions/.test(e)));
});

test('answer keys are checked against the word itself', () => {
  failsWith(d => { const item = q(d, 'H0001-first-letter'); item.choices[0].text = 'ב'; item.choices[1].text = 'א'; }, /first letter/);
  failsWith(d => { q(d, 'H0001-last-letter').acceptedAnswers = ['c1']; }, /last letter/);
  failsWith(d => { q(d, 'H4428-mirror').acceptedAnswers = ['c2']; }, /spelling/);
  failsWith(d => { q(d, 'H4428-write').acceptedAnswers = ['מלכ']; }, /spelling/);
  failsWith(d => { q(d, 'H0517-final-partner').acceptedAnswers = ['c1']; }, /final/);
  failsWith(d => { q(d, 'H0001-gloss').acceptedAnswers = ['c1']; }, /meaning/);
});

test('every playable question has a legal, unambiguous answer', () => {
  failsWith(d => { q(d, 'H0001-gloss').acceptedAnswers = ['c9']; }, /answer/);
  failsWith(d => { q(d, 'H0001-gloss').choices[1].text = 'father'; }, /duplicate/);
  failsWith(d => { q(d, 'H0802-gloss').choices[1].text = 'wife'; }, /valid sense/);
  failsWith(d => { q(d, 'H0001-write').recognitionAccepted = ['c9']; }, /recognition/);
  failsWith(d => { q(d, 'g-letters-2').acceptedSequences = [['t9']]; }, /sequence/);
  failsWith(d => { q(d, 'H0001-gloss').explanation = ''; }, /explanation/);
});

test('capture needs three distinct families, and enough fresh stems to retry', () => {
  failsWith(d => { d.questions = d.questions.filter(item => !(item.wordId === 'H0001' && item.taskFamily === 'inscribe-spelling')); }, /H0001.*inscribe-spelling/);
  failsWith(d => { d.questions = d.questions.filter(item => item.id !== 'H0001-last-letter'); }, /H0001.*fresh/);
  failsWith(d => { q(d, 'H0001-last-letter').semanticStemId = 'H0001-first-letter'; }, /stem/);
});

test('references must resolve', () => {
  failsWith(d => { q(d, 'H0001-gloss').wordId = 'H9999'; }, /H9999/);
  failsWith(d => { q(d, 'H0001-gloss').sourceIds = ['nope']; }, /nope/);
  failsWith(d => { q(d, 'H0001-gloss').requires = ['vowels']; }, /vowels/);
  failsWith(d => { d.regions[0].badge.questionIds.push('b-missing'); }, /b-missing/);
  failsWith(d => { d.regions[0].requiresBadges = ['b-unknown']; }, /b-unknown/);
  failsWith(d => { d.lessons[0].guidedQuestionIds = ['g-missing']; }, /g-missing/);
  failsWith(d => { d.quests[0].stages[0].targetIds = ['l-missing']; }, /l-missing/);
});

test('words must match their source tokens', () => {
  failsWith(d => { w(d, 'H0001').example.tokenId = 'zzzzz'; }, /zzzzz/);
  failsWith(d => { w(d, 'H0001').example.tokenId = '01Z7W'; }, /lemma/);
  failsWith(d => { w(d, 'H0001').example.hebrew = 'אֵם כָּל־חָי'; }, /example/);
  failsWith(d => { w(d, 'H0001').relatedForms[0].hebrew = 'אָבִי'; }, /related/);
  failsWith(d => { w(d, 'H0001').relatedForms[0].relationship = 'cousin'; }, /relationship/);
  failsWith(d => { w(d, 'H0001').consonants = 'בא'; }, /consonants/);
});

test('a root is a hand-checked letters-only string, or null', () => {
  failsWith(d => { w(d, 'H4428').root = 'מֶלֶךְ'; }, /root/);
  failsWith(d => { w(d, 'H4428').rootNote = undefined; }, /root/);
});

test('the Hebrew in lessons and trial items must exist in the source', () => {
  failsWith(d => { d.lessons[0].workedExamples[0].hebrew = 'אָב'; }, /worked example/);
  failsWith(d => { q(d, 'b-final-1').displayHebrew = 'מֶלֶךְ'; }, /b-final-1/);
});

test('the badge trial must use examples different from the lessons and vocabulary', () => {
  failsWith(d => { q(d, 'b-final-1').displayHebrew = 'דֶּרֶךְ'; q(d, 'b-final-1').tokenId = '01zva'; }, /worked example/);
  failsWith(d => { d.regions[0].badge.requiredTaskFamilies.push('no-such-family'); }, /no-such-family/);
});

test('finals are spelled by the rule in every letters-only form', () => {
  failsWith(d => { w(d, 'H4428').consonants = 'מלכ'; }, /final/);
});

test('every region must be reachable through its badge prerequisites', () => {
  failsWith(d => { d.regions[0].requiresBadges = [d.regions[0].badge.id]; }, /reachable/);
});
