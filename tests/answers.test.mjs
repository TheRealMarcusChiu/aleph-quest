import test from 'node:test';
import assert from 'node:assert/strict';
import { comparisonKey, checkAnswer, deleteLast } from '../src/answers.js';

test('pointed keys ignore mark order and cantillation but keep vowels, dagesh and shin/sin', () => {
  // Same marks typed in two orders are one word.
  assert.equal(comparisonKey('בֵּן', 'pointed'), comparisonKey('בֵּן', 'pointed'));
  // Accent and meteg are not assessed.
  assert.equal(comparisonKey('אָ֖ב', 'pointed'), comparisonKey('אָב', 'pointed'));
  assert.equal(comparisonKey('אָֽח', 'pointed'), comparisonKey('אָח', 'pointed'));
  // Vowels stay distinct.
  assert.notEqual(comparisonKey('אָב', 'pointed'), comparisonKey('אַב', 'pointed'));
  // Shin and sin stay distinct.
  assert.notEqual(comparisonKey('שׁ', 'pointed'), comparisonKey('שׂ', 'pointed'));
  // Dagesh stays.
  assert.notEqual(comparisonKey('בּ', 'pointed'), comparisonKey('ב', 'pointed'));
  // Qamats and qamats qatan are different signs.
  assert.notEqual(comparisonKey('חָ', 'pointed'), comparisonKey('חׇ', 'pointed'));
});

test('consonant keys drop pointing only, and never merge final and medial forms', () => {
  assert.equal(comparisonKey('אֶרֶץ', 'consonants'), 'ארץ');
  assert.notEqual(comparisonKey('ארצ', 'consonants'), comparisonKey('ארץ', 'consonants'));
  assert.equal(comparisonKey('‏אב‎ ', 'consonants'), 'אב');
});

test('no key reverses logical order', () => {
  assert.notEqual(comparisonKey('בא', 'consonants'), comparisonKey('אב', 'consonants'));
});

test('source display strings are never changed by comparison', () => {
  const source = 'אָ֖ב';
  comparisonKey(source, 'pointed');
  assert.equal(source, 'אָ֖ב');
});

test('gloss keys forgive case, articles and punctuation', () => {
  assert.equal(comparisonKey('  The Father! ', 'gloss'), 'father');
  assert.equal(comparisonKey('a  king', 'gloss'), 'king');
});

const typed = { format: 'type', compare: 'consonants', acceptedAnswers: ['ארץ'], recognitionChoices: [{ id: 'c0' }, { id: 'c1' }], recognitionAccepted: ['c0'] };

test('typed consonant answers accept pointed input, reject the wrong final form and say why', () => {
  assert.equal(checkAnswer(typed, 'אֶרֶץ').correct, true);
  const near = checkAnswer(typed, 'ארצ');
  assert.equal(near.correct, false);
  assert.equal(near.nearMiss, 'final-form');
});

test('a pointed task rejects the same letters with the wrong vowel and reports a pointing near miss', () => {
  const q = { format: 'type', compare: 'pointed', acceptedAnswers: ['אָב'] };
  assert.equal(checkAnswer(q, 'אָב').correct, true);
  const r = checkAnswer(q, 'אַב');
  assert.equal(r.correct, false);
  assert.equal(r.nearMiss, 'pointing');
});

test('curated gloss aliases pass and others do not', () => {
  const q = { format: 'type', compare: 'gloss', acceptedAnswers: ['scroll', 'book'] };
  assert.equal(checkAnswer(q, 'A Book.').correct, true);
  assert.equal(checkAnswer(q, 'king').correct, false);
});

test('choice, door, recognition fallback and token order are checked by id', () => {
  assert.equal(checkAnswer({ format: 'choice', acceptedAnswers: ['c0'] }, 'c0').correct, true);
  assert.equal(checkAnswer({ format: 'choice', acceptedAnswers: ['c0'] }, 'c1').correct, false);
  assert.equal(checkAnswer({ format: 'door', acceptedAnswers: ['door-m'] }, 'door-m').correct, true);
  assert.equal(checkAnswer(typed, 'c0', 'recognition').correct, true);
  assert.equal(checkAnswer(typed, 'c1', 'recognition').correct, false);
  const q = { format: 'tokens', acceptedSequences: [['t0', 't1', 't2']] };
  assert.equal(checkAnswer(q, ['t0', 't1', 't2']).correct, true);
  assert.equal(checkAnswer(q, ['t2', 't1', 't0']).correct, false);
  assert.equal(checkAnswer(q, ['t0', 't1']).correct, false);
});

test('the keyboard delete key removes one code point and clears a whole mark before its letter', () => {
  assert.equal(deleteLast('אָב'), 'אָ');
  assert.equal(deleteLast('אָ'), 'א');
  assert.equal(deleteLast(''), '');
});
