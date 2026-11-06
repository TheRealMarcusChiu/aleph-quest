import test from 'node:test';
import assert from 'node:assert/strict';
import { checkAnswer, initialResponseMode, sacredDisplay, comparisonKey } from '../src/answers.js';

const match = { format: 'match', pairs: [{ left: 'א', right: 'one' }, { left: 'ב', right: 'two' }, { left: 'ג', right: 'one' }] };

test('match: the authored pairs are the key, compared by what each left side was given', () => {
  assert.equal(checkAnswer(match, ['one', 'two', 'one']).correct, true);
  assert.equal(checkAnswer(match, ['two', 'one', 'one']).correct, false);
  assert.equal(checkAnswer(match, ['one', 'two']).correct, false, 'a partial answer is wrong');
  assert.equal(checkAnswer(match, 'one').correct, false, 'bad shapes are wrong, not thrown');
  assert.equal(checkAnswer(match, null).correct, false);
});

test('match: explicitly curated alternative assignments count, and nothing else does', () => {
  const q = { ...match, acceptedAnswers: [['one', 'one', 'two']] };
  assert.equal(checkAnswer(q, ['one', 'one', 'two']).correct, true);
  assert.equal(checkAnswer(q, ['one', 'two', 'one']).correct, true);
  assert.equal(checkAnswer(q, ['two', 'two', 'two']).correct, false);
});

test('match: a recognition alternative is checked against its own key', () => {
  const q = { ...match, recognitionChoices: [{ id: 'c0', text: 'x' }, { id: 'c1', text: 'y' }], recognitionAccepted: ['c0'] };
  assert.equal(checkAnswer(q, 'c0', 'recognition').correct, true);
  assert.equal(checkAnswer(q, 'c1', 'recognition').correct, false);
});

test('the response mode a question opens in fits its format and the player preference', () => {
  const type = { format: 'type' };
  assert.equal(initialResponseMode(type, 'typing'), 'typing');
  assert.equal(initialResponseMode(type, 'recognition'), 'recognition');
  assert.equal(initialResponseMode({ format: 'choice' }, 'typing'), 'recognition');
  assert.equal(initialResponseMode({ format: 'tokens' }, 'typing'), 'recognition');
  assert.equal(initialResponseMode(match, 'recognition'), 'typing', 'pairing has no shortcut unless one is authored');
  assert.equal(initialResponseMode({ ...match, recognitionChoices: [] }, 'recognition'), 'recognition');
  assert.equal(initialResponseMode({ ...match, recognitionChoices: [] }, 'typing'), 'typing');
});

test('task-aware comparison still keeps shin and sin apart, and vowels when asked', () => {
  const q = { format: 'type', compare: 'pointed', acceptedAnswers: ['שָׂם'] };
  assert.equal(checkAnswer(q, 'שָׂם').correct, true);
  assert.equal(checkAnswer(q, 'שָׁם').correct, false, 'shin is not sin');
  assert.equal(checkAnswer(q, 'שֵׂם').correct, false, 'another vowel is wrong');
  assert.notEqual(comparisonKey('שׁ', 'pointed'), comparisonKey('שׂ', 'pointed'));
});

test('sacred name display: written is untouched; the substitute keeps prefixes and points elsewhere', () => {
  const name = 'יְהוָה';
  assert.equal(sacredDisplay(`אֵל ${name}`, 'written'), `אֵל ${name}`);
  assert.equal(sacredDisplay(name, 'substitute'), 'ה׳');
  assert.equal(sacredDisplay('יהוה', 'substitute'), 'ה׳');
  assert.equal(sacredDisplay('לַיהוָה', 'substitute'), 'לַה׳');
  assert.equal(sacredDisplay('וְלַיהוָה', 'substitute'), 'וְלַה׳', 'stacked prefixes are kept too');
  assert.equal(sacredDisplay('אֵל', 'substitute'), 'אֵל');
  assert.equal(sacredDisplay('יְהוּדָה', 'substitute'), 'יְהוּדָה', 'a word that only starts the same is not the name');
});
