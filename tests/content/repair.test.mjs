// Regressions for the independent SPEC findings on bafe008: actual reading prerequisites, the final
// gate's semantics, fresh Genesis retries, contextual key evidence and bound Hebrew provenance.
import test from 'node:test';
import assert from 'node:assert/strict';
import { content } from '../../src/content.js';
import { readingDemands, readingClosure } from '../../scripts/content-rules.mjs';
import { pointedKey, loadCorpus, researchAvailable } from '../../scripts/content-source.mjs';

const { words, questions, regions, passages, attestations, quests } = content;
const q = id => content.questionById.get(id);
const tokens = new Map(attestations.map(a => [a.tokenId, a]));
const eligible = (question, skills) => question.requires.every(s => skills.has(s));
const compact = text => pointedKey(text).replace(/[\s־׀׃]/g, '');
const corpus = researchAvailable() ? loadCorpus() : null;
const skip = corpus ? false : 'pinned research XML not present';

const SEED = new Set(['alphabet', 'rtl', 'final-forms', 'word-meaning']);
const afterVowels = new Set([...SEED, 'vowels', 'syllables']);
const afterShewa = new Set([...afterVowels, 'shewa', 'prepositions']);
const afterDagesh = new Set([...afterShewa, 'accents', 'dagesh']);
const afterGutturals = new Set([...afterDagesh, 'article', 'gutturals']);
const FAMILIES = ['read-letter', 'understand-meaning', 'inscribe-spelling'];
const capturable = (id, skills) => FAMILIES.every(f => questions.some(x => x.wordId === id && x.taskFamily === f && eligible(x, skills)));

test('C1: a reading question lists every reading rule its word actually needs', () => {
  const wrong = [];
  for (const x of questions.filter(item => ['tpl-read-sound', 'tpl-read-pointed'].includes(item.templateId))) {
    const word = content.wordById.get(x.wordId);
    const have = readingClosure(x.requires, content.lessons);
    for (const s of readingDemands(word.hebrew)) if (!have.has(s)) wrong.push(`${x.id}: reads ${word.hebrew}, which needs ${s}`);
  }
  assert.deepEqual(wrong, []);
});

test('C1: what vowels alone cannot read stays closed, and opens after its worked example', () => {
  for (const id of ['H3915-sound', 'H3915-pointed', 'H1242-sound', 'H1242-pointed', 'H1004-sound', 'H1004-pointed', 'H1870-sound', 'H1697-sound', 'H3605-sound']) {
    assert.equal(eligible(q(id), afterVowels), false, `${id} is open with vowels only`);
    assert.equal(eligible(q(id), afterGutturals), true, `${id} never opens`);
  }
  // Shewa alone doesn't open a dagesh word, and each rule opens its own words.
  assert.equal(eligible(q('H1242-sound'), afterShewa), false, 'BO-qer needs the dagesh rule');
  assert.equal(eligible(q('H1242-sound'), afterDagesh), true);
  assert.equal(eligible(q('H1004-sound'), afterDagesh), true);
  assert.equal(eligible(q('H7218-sound'), afterDagesh), false, 'silent alef is taught with the gutturals');
  assert.equal(eligible(q('H7218-sound'), afterGutturals), true);
});

test('C1: words needing later reading rules wait, and the seed and plain words stay capturable', () => {
  const r2 = content.regionById.get('r2');
  assert.equal(capturable(r2.seedWordId, afterVowels), true, 'seed starved');
  assert.equal(capturable('H3915', afterVowels), false);
  assert.equal(capturable('H1242', afterVowels), false);
  const plain = r2.wordIds.filter(id => capturable(id, afterVowels));
  const quest = quests.find(item => item.id === r2.questId);
  assert.ok(plain.length >= quest.stages.find(s => s.id === 'r2-first').requiredCount, 'first capture stage starves');
  assert.equal(r2.wordIds.filter(id => capturable(id, afterGutturals)).length, r2.wordIds.length, 'a region word never opens');
  assert.ok(r2.wordIds.filter(id => capturable(id, afterGutturals)).length >= quest.stages.find(s => s.id === 'r2-six').requiredCount);
  for (const r of regions.slice(1)) {
    const before = new Set(regions.slice(0, regions.indexOf(r)).flatMap(p => p.lessonIds).flatMap(l => content.lessonById.get(l).teaches));
    for (const s of content.lessonById.get(r.lessonIds[0]).teaches) before.add(s);
    before.add('word-meaning');
    assert.equal(capturable(r.seedWordId, before), true, `${r.id} seed starved after its first lesson`);
  }
});

test('C2: the final gate asks for the narrative form and doesn\'t deny a finite perfect', () => {
  const gate = q('p-r8-gate-3');
  assert.match(gate.prompt, /narrative|sequence/i);
  const text = gate.choices.find(c => gate.acceptedAnswers.includes(c.id)).text;
  assert.equal(text, 'וַיְהִי');
  assert.match(gate.explanation, /perfect/i, 'must say what הָיָה is');
  assert.doesNotMatch(gate.explanation, /is the dictionary form/);
});

test('C2: no feedback dismisses a verb as merely its dictionary form', () => {
  const wrong = questions.filter(x => /[א-ת֑-ׇ]+ is (just |only |merely )?the (dictionary|citation) form\b/i.test(x.explanation) && !/perfect/i.test(x.explanation));
  assert.deepEqual(wrong.map(x => `${x.id}: ${x.explanation}`), []);
});

test('Reading retries: every Genesis verse outlasts a miss with fresh, source-bound questions', { skip }, () => {
  for (const p of passages.filter(item => /^p-gen-1-/.test(item.id))) {
    const open = p.questionIds.map(q);
    assert.ok(open.length >= 4, `${p.id} has ${open.length} questions, and a miss must leave two fresh ones`);
    assert.equal(new Set(open.map(x => x.semanticStemId)).size, open.length);
    assert.equal(new Set(open.map(x => x.displayHebrew ?? x.prompt)).size, open.length, `${p.id} repeats a stem`);
    for (const x of open) {
      assert.ok(x.tokenIds?.length, `${x.id} needs source tokens`);
      for (const id of x.tokenIds) assert.equal(corpus.byId.get(id)?.reference, p.reference, `${x.id} leaves ${p.reference}`);
      assert.ok(p.tokens.some(t => x.tokenIds.includes(t.id)));
    }
  }
  const reading = content.regionById.get('r8').puzzleQuestionIds.reading;
  for (const p of passages.filter(item => /^p-gen-1-/.test(item.id))) for (const id of p.questionIds) assert.ok(reading.includes(id), `${id} is not in the reading pool`);
});

// The shared rule: an answer is a listed sense, or a list of senses. Inflected and contextual phrases aren't, so they carry evidence.
test('Context answers outside the citation senses carry source-backed evidence', { skip }, () => {
  const wrong = [];
  for (const x of questions.filter(item => item.templateId === 'tpl-context-choice')) {
    const word = content.wordById.get(x.wordId);
    const answer = x.choices.find(c => x.acceptedAnswers.includes(c.id)).text;
    const senses = new Set([word.gloss, ...word.meanings, ...word.meanings.map(m => m.split(',')[0].trim())]);
    if (senses.has(answer) || answer.split(/\s+or\s+/).every(part => senses.has(part))) { if (x.contextKey) wrong.push(`${x.id}: evidence is not needed`); continue; }
    const key = x.contextKey;
    if (!key) { wrong.push(`${x.id}: "${answer}" is not a sense of ${word.id}, and there is no contextKey`); continue; }
    const token = corpus.byId.get(key.tokenId);
    if (!token) { wrong.push(`${x.id}: unknown token ${key.tokenId}`); continue; }
    if (key.answer !== answer) wrong.push(`${x.id}: contextKey.answer differs from the accepted answer`);
    if (!token.lemma.split('/').some(part => part.split(' ')[0] === String(Number(word.strongId.slice(1))))) wrong.push(`${x.id}: token ${key.tokenId} has lemma ${token.lemma}, not ${word.strongId}`);
    if (!token.morph.includes(key.morph)) wrong.push(`${x.id}: morph ${key.morph} is not in ${token.morph}`);
    if (!key.basis) wrong.push(`${x.id}: contextKey needs a basis`);
    if (!x.prompt.includes(key.form) || compact(token.surface) !== compact(key.form)) wrong.push(`${x.id}: contextKey.form ${key.form} must be the prompt's token ${token.surface}`);
  }
  assert.deepEqual(wrong, []);
});

test('Multiword Hebrew tasks are bound to their whole source span', { skip }, () => {
  const wrong = [];
  for (const x of questions.filter(item => item.format === 'tokens' && item.tokenOptions.some(t => /[א-ת]{2}/.test(t.text)))) {
    const ids = x.tokenIds ?? (x.tokenId ? [x.tokenId] : []);
    const hebrew = x.tokenOptions.filter(t => /[א-ת]/.test(t.text));
    if (hebrew.every(t => [...compact(t.text)].filter(c => /[א-ת]/.test(c)).length === 1)) continue; // letter tiles of one word
    const shown = compact(ids.map(id => corpus.byId.get(id)?.surface ?? '?').join(''));
    for (const seq of x.acceptedSequences) if (compact(seq.map(id => x.tokenOptions.find(t => t.id === id).text).join('')) !== shown) wrong.push(`${x.id}: sequence is not its source span ${ids}`);
    if (!x.sourceIds.includes('wlc-oshb')) wrong.push(`${x.id}: cites no source`);
  }
  assert.deepEqual(wrong, []);
});

test('Every token-bound question and badge span names real, adjacent source tokens', { skip }, () => {
  const wrong = [];
  for (const x of questions.filter(item => item.tokenIds)) {
    const first = corpus.byId.get(x.tokenIds[0]);
    const verse = corpus.verses.get(first.reference).filter(i => i.kind === 'w').map(i => i.tokenId);
    const at = verse.indexOf(x.tokenIds[0]);
    if (x.tokenIds.some((id, i) => verse[at + i] !== id)) wrong.push(`${x.id}: span is not contiguous`);
    if (x.displayHebrew && compact(x.tokenIds.map(id => corpus.byId.get(id).surface).join('')) !== compact(x.displayHebrew)) wrong.push(`${x.id}: display differs from its span`);
    for (const id of x.tokenIds) if (!tokens.has(id)) wrong.push(`${x.id}: ${id} is not shipped as an attestation`);
  }
  assert.deepEqual(wrong, []);
  assert.deepEqual(words.filter(w => !w.requires.length).map(w => w.id), []);
});
