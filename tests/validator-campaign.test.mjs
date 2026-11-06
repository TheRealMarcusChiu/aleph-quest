// The full-campaign rules, run on the labeled synthetic fixture plus one break at a time.
// Passing here proves the validator's rules work. It says nothing about the real content.
import test from 'node:test';
import assert from 'node:assert/strict';
import { campaignFixture, openingOnly } from './fixtures/campaign-fixture.mjs';
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

test('the real first region alone passes its opening rules, and only misses the campaign floor', () => {
  const r1 = plain(openingOnly());
  assert.deepEqual(validateContent(r1, 'opening'), []);
  const errors = validateContent(r1, 'full');
  assert.ok(errors.length);
  assert.ok(errors.every(e => /^campaign /.test(e)), `only floor findings: ${errors.filter(e => !/^campaign /.test(e)).slice(0, 5).join(' | ')}`);
});

test('the data actually shipped has no findings beyond any campaign floor it has not reached yet', () => {
  assert.deepEqual(validateContent(content, 'opening'), []);
  const errors = validateContent(content, 'full');
  assert.ok(errors.every(e => /^campaign /.test(e)), errors.slice(0, 5).join(' | '));
  if (content.regions.length === 8) assert.deepEqual(errors, []);
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

test('a guided question stays guided: no word credit, and no independent pool can ask it', () => {
  fails(d => { q(d, 'gfx-r2').wordId = 'FX200'; }, /lfx-r2-a.*gfx-r2.*word/);
  fails(d => { region(d, 'r2').puzzleQuestionIds.gate.push('gfx-r2'); }, /gfx-r2.*guided.*pool/);
  fails(d => { region(d, 'r2').badge.questionIds.push('gfx-r2'); }, /gfx-r2.*guided.*pool/);
  fails(d => { d.passages.find(p => p.id === 'pfx-r2').questionIds.push('gfx-r2'); }, /gfx-r2.*guided.*pool/);
});

test('guided practice can use the lesson it follows, and nothing later', () => {
  fails(d => { d.lessons.find(l => l.id === 'lfx-r2-b').guidedQuestionIds = ['pfx-gate-r3-0']; }, /lfx-r2-b.*guided.*fx-r3/);
  fails(d => { q(d, 'gfx-r2').requires = ['fx-r2-b']; }, /lfx-r2-a.*guided.*fx-r2-b/);
  const own = fixture();
  q(own, 'gfx-r2').requires = ['fx-r2-a'];
  assert.deepEqual(validateContent(own, 'full'), [], 'guided work follows the explanation and worked example');
  // That allowance is for guided work only: an independent question needing the next lesson still has to wait for it.
  fails(d => { q(d, 'pfx-neri-r2-0').requires = ['fx-r3-a']; }, /pfx-neri-r2-0.*fx-r3-a/);
});

test('one quest stage can hold sequential lessons, but not a loop or a later stage\'s skill', () => {
  const stages = d => d.quests.find(x => x.id === 'qfx-r2').stages;
  const together = d => {
    stages(d)[0].targetIds.push('lfx-r2-b');
    stages(d).splice(stages(d).findIndex(st => st.id === 'learn2'), 1);
  };
  const grouped = fixture();
  together(grouped);
  // The seed and first capture stage may not then lean on B, which is all still available by that stage.
  assert.deepEqual(validateContent(grouped, 'full'), []);
  const backwards = fixture();
  together(backwards);
  stages(backwards)[0].targetIds.reverse();
  assert.deepEqual(validateContent(backwards, 'full'), [], 'listed order inside a stage does not matter, as the mentor picks what is ready');
  fails(d => {
    together(d);
    d.lessons.find(l => l.id === 'lfx-r2-a').requires = ['fx-r2-b'];
  }, /qfx-r2.*lfx-r2-a.*fx-r2-b/);
  fails(d => {
    d.lessons.find(l => l.id === 'lfx-r2-a').requires = ['fx-r2-b'];
  }, /qfx-r2.*lfx-r2-a.*fx-r2-b/);
});

test('tpl-read-sound: the answer is the word\'s own sound guide, on the word\'s own pointed form', () => {
  const sound = d => {
    const item = q(d, 'FX200-last-letter');
    const word = d.words.find(w => w.id === 'FX200');
    Object.assign(item, { templateId: 'tpl-read-sound', displayHebrew: word.hebrew, choices: [{ id: 'c0', text: word.transliteration }, { id: 'c1', text: 'fxsay-other' }], acceptedAnswers: ['c0'] });
    return item;
  };
  const good = fixture();
  sound(good);
  assert.deepEqual(validateContent(good, 'full'), []);
  fails(d => { sound(d).acceptedAnswers = ['c1']; }, /FX200-last-letter.*sound guide/);
  fails(d => { delete sound(d).displayHebrew; }, /FX200-last-letter.*must show/);
  fails(d => { sound(d).displayHebrew = d.words.find(w => w.id === 'FX201').hebrew; }, /FX200-last-letter.*must show/);
  fails(d => { sound(d).choices = [{ id: 'c0', text: d.words.find(w => w.id === 'FX200').transliteration }]; }, /FX200-last-letter.*distractor/);
  fails(d => { const item = sound(d); item.choices[1].text = item.choices[0].text; }, /FX200-last-letter.*duplicate/);
  fails(d => { const item = sound(d); Object.assign(item, { format: 'type', compare: 'gloss', acceptedAnswers: ['x'], choices: undefined, recognitionChoices: [{ id: 'c0', text: 'a' }, { id: 'c1', text: 'b' }], recognitionAccepted: ['c0'] }); }, /FX200-last-letter.*choice/);
});

test('tpl-read-pointed: the answer is the word\'s pointing, and every option differs only in its pointing', () => {
  const pointedQ = d => {
    const item = q(d, 'FX200-last-letter');
    const word = d.words.find(w => w.id === 'FX200');
    const other = [...word.consonants].map(c => `${c}ֵ`).join('');
    Object.assign(item, { templateId: 'tpl-read-pointed', displayHebrew: undefined, choices: [{ id: 'c0', text: word.hebrew, lang: 'he' }, { id: 'c1', text: other, lang: 'he' }], acceptedAnswers: ['c0'] });
    return item;
  };
  const good = fixture();
  pointedQ(good);
  assert.deepEqual(validateContent(good, 'full'), []);
  fails(d => { pointedQ(d).acceptedAnswers = ['c1']; }, /FX200-last-letter.*pointed form/);
  fails(d => { pointedQ(d).choices[1].text = 'בבב'; }, /FX200-last-letter.*letters/);
  fails(d => {
    const item = pointedQ(d);
    // The same marks in another order are one pointing, whatever the raw strings say.
    item.choices[1].text = `${item.choices[0].text}֑`;
  }, /FX200-last-letter.*identical pointing/);
});

test('key{tokenId,morph} is checked against the attestation and the question\'s own token', () => {
  const keyed = d => {
    const item = q(d, 'pfx-neri-r2-0');
    d.attestations.push({ tokenId: 'fxkey', reference: 'Fix.1.1', surface: 'הַ/מָּיִם', lemma: 'd/4325', morph: 'HTd/Ncmpa' });
    Object.assign(item, { tokenId: 'fxkey', displayHebrew: 'הַמָּיִם', key: { tokenId: 'fxkey', morph: 'Td/Ncmpa' } });
    return item;
  };
  const good = fixture();
  keyed(good);
  assert.deepEqual(validateContent(good, 'full'), []);
  const prefix = fixture();
  keyed(prefix).key.morph = 'Ncmpa';
  assert.deepEqual(validateContent(prefix, 'full'), [], 'a whole-segment start is a real claim');
  const partial = fixture();
  keyed(partial).key.morph = 'Td/Nc';
  assert.deepEqual(validateContent(partial, 'full'), [], 'so is a narrower claim, from a segment start');
  fails(d => { keyed(d).key.morph = 'Vqp3ms'; }, /pfx-neri-r2-0.*key.*Vqp3ms/);
  fails(d => { keyed(d).key.morph = 'cmpa'; }, /pfx-neri-r2-0.*key.*cmpa/);
  fails(d => { keyed(d).key.tokenId = 'nope'; }, /pfx-neri-r2-0.*key.*nope/);
  fails(d => {
    const item = keyed(d);
    d.attestations.push({ tokenId: 'fxother', reference: 'Fix.1.1', surface: 'אָב', lemma: '1', morph: 'HTd/Ncmpa' });
    item.key.tokenId = 'fxother';
  }, /pfx-neri-r2-0.*key.*fxother.*question/);
  fails(d => { delete keyed(d).key.morph; }, /pfx-neri-r2-0.*key needs/);
  fails(d => { delete keyed(d).key.tokenId; }, /pfx-neri-r2-0.*key/);
  fails(d => { keyed(d).key.sense = 'x'; }, /pfx-neri-r2-0.*sense/);
  // A morph claim about a word's own question must cite that word's token, and still prove its answer.
  fails(d => {
    d.attestations.push({ tokenId: 'fxkey', reference: 'Fix.1.1', surface: 'אָב', lemma: '1', morph: 'HNcmsa' });
    q(d, 'FX200-analyze').key = { answer: 'masculine', tokenId: 'fxkey', morph: 'Ncmsa' };
  }, /FX200-analyze.*key.*fxkey.*FX200/);
  fails(d => {
    q(d, 'FX200-analyze').key = { tokenId: 'fx200a', morph: 'fx' };
  }, /FX200-analyze.*key needs an answer/);
});

test('question.tokenIds must be real tokens of one verse that spell what the question shows', () => {
  const spanned = d => {
    d.attestations.push({ tokenId: 'fxs1', reference: 'Fix.2.1', surface: 'אָ֖ב', lemma: '1', morph: 'HNcmsa' }, { tokenId: 'fxs2', reference: 'Fix.2.1', surface: 'אָח', lemma: '251', morph: 'HNcmsa' });
    return Object.assign(q(d, 'pfx-neri-r2-0'), { tokenIds: ['fxs1', 'fxs2'], displayHebrew: 'אָב אָח' });
  };
  const good = fixture();
  spanned(good);
  assert.deepEqual(validateContent(good, 'full'), []);
  fails(d => { spanned(d).tokenIds.push('nope'); }, /pfx-neri-r2-0.*nope/);
  fails(d => { spanned(d).displayHebrew = 'אָב'; }, /pfx-neri-r2-0.*tokens read/);
  fails(d => { spanned(d).tokenId = 'fxs1'; }, /pfx-neri-r2-0.*tokenId or tokenIds/);
  fails(d => { spanned(d); d.attestations.at(-1).reference = 'Fix.3.1'; }, /pfx-neri-r2-0.*one verse/);
});

// One real pattern from the corpus: a preposition with a suffix, where "with you" is correct and isn't the gloss.
function contextEvidence(d, { answer = 'with you', morph = 'HR/Sp2ms', surface = 'אִתְּךָ', prompt = `God speaks ${surface} here. Which meaning fits?` } = {}) {
  const word = d.words.find(w => w.id === 'FX200');
  word.gloss = 'with';
  word.meanings = ['with', 'beside'];
  for (const item of d.questions.filter(x => x.wordId === 'FX200' && x.taskFamily === 'understand-meaning')) {
    if (item.format === 'type') item.acceptedAnswers = ['with'];
    for (const c of item.choices ?? item.recognitionChoices) if (c.id === 'c0') c.text = 'with';
  }
  d.attestations.push({ tokenId: 'fxctx', reference: 'Fix.4.1', surface, lemma: word.strongId.slice(1), morph });
  return Object.assign(q(d, 'FX200-gloss'), {
    templateId: 'tpl-context-choice', prompt, displayHebrew: undefined,
    choices: [{ id: 'c0', text: answer }, { id: 'c1', text: 'over you' }, { id: 'c2', text: 'fxother' }],
    contextKey: { tokenId: 'fxctx', form: surface, morph: morph.replace(/^H/, ''), answer, basis: 'Fixture basis.' },
  });
}

test('contextual answers: "with you" passes on checked evidence, and each part of that evidence is enforced', () => {
  const good = fixture();
  contextEvidence(good);
  assert.deepEqual(validateContent(good, 'full'), []);
  const sister = fixture();
  contextEvidence(sister, { answer: 'my with', morph: 'HNcfsc/Sp1cs' });
  assert.deepEqual(validateContent(sister, 'full'), [], 'a first-person suffix fits my');

  // No key at all: a phrase containing the gloss is still not a listed sense.
  fails(d => { delete contextEvidence(d).contextKey; }, /FX200-gloss.*meaning/);
  fails(d => { contextEvidence(d).contextKey.answer = 'over you'; }, /FX200-gloss.*contextKey answer/);
  fails(d => { delete contextEvidence(d).contextKey.basis; }, /FX200-gloss.*contextKey needs basis/);
  fails(d => { contextEvidence(d).contextKey.extra = 1; }, /FX200-gloss.*contextKey field extra/);
  fails(d => { contextEvidence(d, { answer: 'against you' }); }, /FX200-gloss.*sense/);
  fails(d => { delete contextEvidence(d).contextKey.tokenId; }, /FX200-gloss.*token/);
  fails(d => { delete contextEvidence(d).contextKey.morph; }, /FX200-gloss.*morph/);
  fails(d => { contextEvidence(d).contextKey.morph = 'Vqp3ms'; }, /FX200-gloss.*contextKey.*Vqp3ms/);
  // A morph claim is the token's whole tail, so a loose piece of it proves nothing.
  fails(d => { contextEvidence(d).contextKey.morph = 'Sp2'; }, /FX200-gloss.*contextKey.*Sp2/);
  fails(d => { contextEvidence(d).contextKey.morph = 'R'; }, /FX200-gloss.*contextKey.*morph/);
  // The token must be this word, shown in this prompt, and its suffix must agree with the English.
  fails(d => { contextEvidence(d); d.attestations.at(-1).lemma = '999'; }, /FX200-gloss.*contextKey.*fxctx.*FX200/);
  fails(d => { contextEvidence(d).contextKey.form = 'אָב'; }, /FX200-gloss.*contextKey form/);
  fails(d => { contextEvidence(d).prompt = 'No Hebrew here. Which meaning fits?'; }, /FX200-gloss.*prompt/);
  // Evidence only belongs on a contextual question.
  fails(d => { const item = contextEvidence(d); item.templateId = 'tpl-gloss-choice'; }, /FX200-gloss.*contextKey/);
  fails(d => { contextEvidence(d, { answer: 'with him' }); }, /FX200-gloss.*suffix/);
  fails(d => { contextEvidence(d, { answer: 'with', morph: 'HNcfsc/Sp1cs' }); d.words.find(w => w.id === 'FX200').meanings = ['beside']; d.words.find(w => w.id === 'FX200').gloss = 'beside'; }, /FX200-gloss/);
  fails(d => { contextEvidence(d, { answer: 'with her', morph: 'HR/Sp2ms' }); }, /FX200-gloss.*suffix/);
  // A phrase with no pronoun in the source can't pick one up by authoring.
  const plain = fixture();
  contextEvidence(plain, { answer: 'be, here "was"', morph: 'HVqp3fs', surface: 'הָיְתָה' });
  const errors = validateContent(plain, 'full');
  assert.ok(errors.some(e => /FX200-gloss.*sense/.test(e)), errors.join());
});

test('a listed sense needs no key, including one of several plain words in a single meaning', () => {
  const data = fixture();
  const word = data.words.find(w => w.id === 'FX200');
  word.meanings = ['fxgloss 200', 'who, which, that', 'other, by extension'];
  q(data, 'FX200-gloss').templateId = 'tpl-context-choice';
  q(data, 'FX200-gloss').choices[0].text = 'who or which';
  assert.deepEqual(validateContent(data, 'full'), []);
  fails(d => {
    d.words.find(w => w.id === 'FX200').meanings = ['fxgloss 200', 'other, by extension'];
    q(d, 'FX200-gloss').templateId = 'tpl-context-choice';
    q(d, 'FX200-gloss').choices[0].text = 'by extension';
  }, /FX200-gloss.*meaning/);
});

test('the opening floor counts region one, so it still means something once the campaign lands', () => {
  assert.deepEqual(validateContent(plain(openingOnly()), 'opening'), []);
  assert.deepEqual(validateContent(fixture(), 'opening'), [], 'a full campaign with a real first region passes');
  const data = fixture();
  region(data, 'r1').wordIds = region(data, 'r1').wordIds.slice(0, 5);
  assert.ok(validateContent(data, 'opening').some(e => /opening needs 8 to 10/.test(e)));
});

test('seals must have a word class in reach, so abilities are never impossible', () => {
  fails(d => { for (const w of d.words) w.pos = 'noun'; }, /r6.*deed|ward/);
});
