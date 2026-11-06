// The full-campaign rules, run on the labeled synthetic fixture plus one break at a time.
// Passing here proves the validator's rules work. It says nothing about the real content.
import test from 'node:test';
import assert from 'node:assert/strict';
import { campaignFixture } from './fixtures/campaign-fixture.mjs';
import { content } from '../src/content.js';
import { validateContent } from '../scripts/validate-content.mjs';

const plain = c => structuredClone({ words: c.words, questions: c.questions, lessons: c.lessons, regions: c.regions, quests: c.quests, passages: c.passages, sources: c.sources, attestations: c.attestations });
const fixture = () => plain(campaignFixture());
const q = (d, id) => d.questions.find(item => item.id === id);
const region = (d, id) => d.regions.find(item => item.id === id);
const fails = (mutate, pattern) => {
  const data = fixture();
  mutate(data);
  const errors = validateContent(data, 'full');
  assert.ok(errors.some(e => pattern.test(e)), `expected ${pattern}, got: ${errors.slice(0, 6).join(' | ') || 'no errors'}`);
};

test('the complete fixture has no findings under the full rules', () => {
  assert.deepEqual(validateContent(fixture(), 'full'), []);
});

test('real r1 data still passes its opening rules, and only misses the campaign floor', () => {
  assert.deepEqual(validateContent(content, 'opening'), []);
  const errors = validateContent(content, 'full');
  assert.ok(errors.length);
  assert.ok(errors.every(e => /^campaign /.test(e)), `only floor findings: ${errors.filter(e => !/^campaign /.test(e)).slice(0, 5).join(' | ')}`);
});

test('campaign floor: counts, distinct lexemes, and exactly r1..r8 in order', () => {
  fails(d => { d.words.splice(10, 1); }, /150 words/);
  fails(d => { d.questions = d.questions.slice(0, 500); }, /600 questions/);
  fails(d => { d.regions.pop(); }, /8 regions/);
  fails(d => { [d.regions[1], d.regions[2]] = [d.regions[2], d.regions[1]]; }, /r1\.\.r8|order/);
  fails(d => { d.regions[3].id = 'r9'; }, /r1\.\.r8|r9/);
  fails(d => { d.words[20].strongId = d.words[21].strongId; d.words[20].consonants = d.words[21].consonants; d.words[20].hebrew = d.words[21].hebrew; }, /same lexeme|distinct/);
  fails(d => { d.words.at(-1).id = d.words.at(-2).id; }, /duplicate word/);
  fails(d => { d.questions.at(-1).id = d.questions.at(-2).id; }, /duplicate question/);
  fails(d => { region(d, 'r3').badge.id = region(d, 'r2').badge.id; }, /duplicate badge/);
});

test('reachability is per region: a question or word can\'t lean on a later region\'s lesson', () => {
  fails(d => { d.words.find(w => w.id === 'FX200').requires.push('fx-r5-a'); }, /FX200.*r5|FX200.*taught/);
  fails(d => { q(d, 'FX200-first-letter').requires.push('fx-r6-a'); }, /FX200-first-letter.*taught/);
  fails(d => { q(d, 'bfx-r2-0').requires.push('fx-r3-a'); }, /bfx-r2-0.*taught/);
  fails(d => { region(d, 'r2').badge.requiresSkills.push('fx-r3-a'); }, /r2.*badge.*fx-r3-a/);
  fails(d => { region(d, 'r2').seedWordId = 'FX203'; }, /r2.*seed/);
  fails(d => { d.passages.find(p => p.id === 'pfx-r2').requires.push('fx-r3-a'); }, /pfx-r2.*taught/);
});

test('every word can really be captured, with a retry, on the skills taught by its own region', () => {
  const data = fixture();
  assert.ok(data.words.length >= 150);
  fails(d => {
    for (const item of d.questions.filter(x => x.wordId === 'FX201' && x.taskFamily === 'read-letter')) item.requires = [...item.requires, 'fx-r4-a'];
  }, /FX201.*read-letter/);
  fails(d => {
    d.questions.find(x => x.id === 'FX201-last-letter').requires = [...q(d, 'FX201-last-letter').requires, 'fx-r4-a'];
  }, /FX201.*read-letter.*retry/);
  fails(d => { region(d, 'r2').wordIds = region(d, 'r2').wordIds.filter(id => id !== 'FX204'); }, /FX204.*no region|FX204.*region/);
  fails(d => { d.words.find(w => w.id === 'FX204').regionIds = ['r5']; }, /FX204/);
});

test('gate, rival and badge pools have headroom at the point the quest reaches them', () => {
  fails(d => { region(d, 'r2').puzzleQuestionIds.gate = region(d, 'r2').puzzleQuestionIds.gate.slice(0, 1); }, /r2.*gate.*retry/);
  fails(d => { region(d, 'r2').puzzleQuestionIds.neri = region(d, 'r2').puzzleQuestionIds.neri.slice(0, 2); }, /r2.*neri.*retry/);
  fails(d => { delete region(d, 'r2').puzzleQuestionIds.neri; }, /r2.*neri/);
  // A question in the pool that needs a lesson taught after that stage cannot be asked there.
  fails(d => {
    const q2 = d.questions.find(x => x.id === 'pfx-gate-r3-0');
    for (const id of region(d, 'r3').puzzleQuestionIds.gate) q(d, id).requires = [...q(d, id).requires, 'fx-r4-a'];
    assert.ok(q2);
  }, /r3.*gate.*retry|taught/);
  fails(d => { region(d, 'r2').badge.questionIds = region(d, 'r2').badge.questionIds.slice(0, 4); }, /r2.*spare/);
  fails(d => { const { badge } = region(d, 'r2'); badge.requiredTaskFamilies = ['fx-one', 'fx-two', 'fx-three', 'nope']; }, /nope/);
  fails(d => { region(d, 'r2').badge.requiresCaptures = 25; }, /r2.*captures/);
});

test('quests use the documented shape, and every target can be reached in stage order', () => {
  fails(d => { d.quests[1].stages[4].targetIds = ['r3:rival']; }, /qfx-r2.*r3:rival/);
  fails(d => { d.quests[1].stages[4].targetIds = ['r2:nope']; }, /qfx-r2.*r2:nope/);
  fails(d => { d.quests[1].stages[1].targetIds = ['H9999']; }, /qfx-r2.*H9999/);
  fails(d => { d.quests[1].stages[1].requiredCount = 500; }, /qfx-r2.*captures/);
  fails(d => { d.quests[1].stages[6].targetIds = ['nope']; }, /qfx-r2.*nope/);
  fails(d => { d.quests[1].stages[0].kind = 'mystery'; }, /qfx-r2.*mystery/);
  fails(d => { region(d, 'r2').questId = 'q-nope'; }, /r2.*q-nope/);
  fails(d => { d.quests[1].stages.pop(); }, /qfx-r2.*exit/);
  fails(d => { d.quests[1].stages[0].targetIds = ['lfx-r5-a']; }, /qfx-r2.*lfx-r5-a/);
});

test('match questions are checked by their pairs; a broken board fails', () => {
  const id = 'bfx-r2-3';
  fails(d => { q(d, id).pairs = [{ left: 'א', right: 'x' }]; }, new RegExp(`${id}.*pairs`));
  fails(d => { q(d, id).pairs[1].left = q(d, id).pairs[0].left; }, new RegExp(`${id}.*left`));
  fails(d => { q(d, id).pairs.forEach(p => { p.right = 'same'; }); }, new RegExp(`${id}.*right`));
  fails(d => { q(d, id).pairs[0].right = ''; }, new RegExp(`${id}.*pairs`));
  fails(d => { q(d, id).acceptedAnswers = [['only one']]; }, new RegExp(`${id}.*alternative`));
  fails(d => { q(d, id).recognitionChoices = [{ id: 'c0', text: 'x' }]; q(d, id).recognitionAccepted = ['c0']; }, new RegExp(`${id}.*distractor`));
});

test('new word-level templates must carry a key that checks against the word, not English guesswork', () => {
  const id = 'FX200-analyze';
  fails(d => { delete q(d, id).key; }, new RegExp(`${id}.*key|${id}.*template`));
  fails(d => { q(d, id).key.answer = 'feminine'; }, new RegExp(`${id}.*key.*answer`));
  fails(d => { q(d, id).key.features = { gender: 'feminine' }; }, new RegExp(`${id}.*key.*gender`));
  fails(d => { q(d, id).key.form = 'בבב'; }, new RegExp(`${id}.*key.*form`));
  fails(d => { q(d, id).key.relationship = 'cousin'; }, new RegExp(`${id}.*key.*relationship`));
  fails(d => { q(d, id).key.tokenId = 'nope'; }, new RegExp(`${id}.*key.*nope`));
  fails(d => { q(d, id).key.extra = 1; }, new RegExp(`${id}.*key.*extra`));
  fails(d => { q(d, 'FX200-build').key.answer = 'אאא'; }, /FX200-build.*key.*answer/);
  // A key checks the claim it makes, and doesn't require an English word to appear anywhere.
  const data = fixture();
  q(data, id).prompt = 'Which grammatical gender?';
  q(data, id).key = { answer: 'masculine', features: { gender: 'masculine' }, form: data.words.find(w => w.id === 'FX200').relatedForms[0].hebrew, relationship: 'inflection' };
  assert.deepEqual(validateContent(data, 'full'), []);
});

test('a context question may give any listed sense; substring accidents don\'t make it right', () => {
  fails(d => {
    q(d, 'FX200-gloss').templateId = 'tpl-context-choice';
    q(d, 'FX200-gloss').choices[0].text = 'not fxgloss 200 at all';
  }, /FX200-gloss.*meaning/);
  const data = fixture();
  const word = data.words.find(w => w.id === 'FX200');
  word.meanings = ['fxgloss 200', 'fxother sense'];
  q(data, 'FX200-gloss').templateId = 'tpl-context-choice';
  q(data, 'FX200-gloss').choices[0].text = 'fxother sense';
  assert.deepEqual(validateContent(data, 'full'), [], 'a second listed sense is a legitimate key in context');
});

test('type answers name their comparison, and pointed keys must really hold points', () => {
  fails(d => { q(d, 'bfx-r2-5').compare = 'fuzzy'; }, /bfx-r2-5.*compare/);
  fails(d => { q(d, 'bfx-r2-5').acceptedAnswers = ['אב']; }, /bfx-r2-5.*pointed/);
  fails(d => { q(d, 'bfx-r2-5').acceptedAnswers = ['father']; }, /bfx-r2-5.*pointed/);
});

test('every question sits in a region that exists, and passages only name real questions', () => {
  fails(d => { q(d, 'FX200-gloss').regionId = 'r99'; }, /FX200-gloss.*r99/);
  fails(d => { d.passages.find(p => p.id === 'pfx-r2').questionIds.push('nope'); }, /pfx-r2.*nope/);
  fails(d => { d.passages.find(p => p.id === 'pfx-r2').questionIds = ['bfx-r2-0']; }, /pfx-r2.*retry|pfx-r2/);
});

test('stage order can\'t ask for what only a later stage teaches, which would be a real softlock', () => {
  const needsB = d => {
    for (const w of d.words.filter(item => item.regionIds[0] === 'r2')) w.requires = [...new Set([...w.requires, 'fx-r2-b'])];
    for (const item of d.questions.filter(x => x.wordId && x.regionId === 'r2')) item.requires = [...new Set([...item.requires, 'fx-r2-b'])];
  };
  fails(d => { needsB(d); region(d, 'r2').seedWordId = 'FX200'; }, /qfx-r2.*first.*captures/);
  fails(d => {
    const stages = d.quests.find(x => x.id === 'qfx-r2').stages;
    stages.splice(0, 0, stages.splice(6, 1)[0]);
    d.passages.find(p => p.id === 'pfx-r2').requires = ['fx-r2-b'];
  }, /qfx-r2.*read.*pfx-r2/);
  fails(d => {
    const stages = d.quests.find(x => x.id === 'qfx-r2').stages;
    stages.splice(1, 0, stages.splice(7, 1)[0]);
  }, /qfx-r2.*badge/);
  fails(d => { d.lessons.find(l => l.id === 'lfx-r2-a').requires = ['fx-r2-b']; }, /lfx-r2-a.*fx-r2-b/);
});

test('guided practice can only use what its own lesson and earlier ones have taught', () => {
  fails(d => { d.lessons.find(l => l.id === 'lfx-r2-b').guidedQuestionIds = ['pfx-gate-r3-0']; }, /lfx-r2-b.*guided.*fx-r3/);
  fails(d => { q(d, 'gfx-r2').requires = ['fx-r2-b']; }, /lfx-r2-a.*guided.*fx-r2-b/);
});

test('seals must have a word class in reach, so abilities are never impossible', () => {
  fails(d => { for (const w of d.words) w.pos = 'noun'; }, /r6.*deed|ward/);
});
