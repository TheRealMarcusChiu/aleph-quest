// The per-word and per-question audit is authored by hand in docs/CONTENT-REVIEW-ledger/. These tests
// don't certify its judgement. They bind each row to the shipped data and to the pinned sources, so a
// row can't be missing, stale, or cite something that isn't there.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { content } from '../../src/content.js';
import { readingClosure } from '../../scripts/content-rules.mjs';
import { pointedKey, loadCorpus, loadStrong, researchAvailable } from '../../scripts/content-source.mjs';
import { soundPattern, plainGuide, guideStress, strongStress } from '../../scripts/content-sound.mjs';

const dir = new URL('../../docs/CONTENT-REVIEW-ledger/', import.meta.url);
const rows = kind => readdirSync(dir).filter(f => f.startsWith(kind) && f.endsWith('.jsonl')).sort().flatMap(f => readFileSync(new URL(f, dir), 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line)));
const questionRows = rows('q-');
const wordRows = rows('w-');
const skip = researchAvailable() ? false : 'pinned research XML not present';
const corpus = researchAvailable() ? loadCorpus() : null;
const strong = researchAvailable() ? loadStrong() : null;
const tokens = new Map(content.attestations.map(a => [a.tokenId, a]));
const number = id => String(Number(id.slice(1)));
const lemmaHas = (lemma, id) => lemma.split('/').some(part => part.split(' ')[0] === number(id));
const compact = text => pointedKey(text).replace(/[\s־׀׃]/g, '');
const HEBREW_RUN = /[א-ת][֑-ׇא-ת׳״]*/g;
const optionsOf = q => (q.format === 'tokens' ? q.tokenOptions : q.format === 'type' ? q.recognitionChoices : q.choices) ?? [];
const acceptedOf = q => (q.format === 'tokens' ? new Set(q.acceptedSequences.flat()) : new Set(q.format === 'type' ? q.recognitionAccepted : q.acceptedAnswers));

test('every question has exactly one ledger row, and no row is left over', () => {
  const ids = questionRows.map(r => r.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate ledger row');
  const known = new Set(content.questions.map(q => q.id));
  assert.deepEqual(content.questions.filter(q => !ids.includes(q.id)).map(q => q.id), []);
  assert.deepEqual(ids.filter(id => !known.has(id)), []);
});

test('every row explains the answer and rejects each distractor by its own option id', () => {
  const by = new Map(questionRows.map(r => [r.id, r]));
  const wrong = [];
  for (const q of content.questions) {
    const r = by.get(q.id);
    if (!r) continue;
    if (!r.ans || r.ans.length < 3) wrong.push(`${q.id}: no answer rationale`);
    if (!Array.isArray(r.tests) || !r.tests.length) wrong.push(`${q.id}: no tested skills`);
    const accepted = acceptedOf(q);
    const expected = optionsOf(q).filter(o => !accepted.has(o.id)).map(o => o.id).sort();
    const got = Object.keys(r.rej ?? {}).sort();
    if (expected.join() !== got.join()) wrong.push(`${q.id}: rejects ${got}, distractors are ${expected}`);
    for (const [id, why] of Object.entries(r.rej ?? {})) if (!why || why.length < 3) wrong.push(`${q.id}: empty rationale for ${id}`);
  }
  assert.deepEqual(wrong, []);
});

test('tested skills are ones the question requires, or come with them', () => {
  const by = new Map(questionRows.map(r => [r.id, r]));
  const wrong = [];
  for (const q of content.questions) {
    const r = by.get(q.id);
    if (!r?.tests) continue;
    const have = readingClosure(q.requires, content.lessons);
    // Guided practice follows its own lesson's worked example, so that lesson's skills count there.
    for (const l of content.lessons.filter(item => item.guidedQuestionIds.includes(q.id))) for (const s of l.teaches) have.add(s);
    for (const s of r.tests) if (!have.has(s)) wrong.push(`${q.id}: tests ${s}, which its requires ${q.requires} don't reach`);
  }
  assert.deepEqual(wrong, []);
});

// A row's provenance kind: citation (the word card), span (tokens), attested (a form found in the corpus) or original.
test('stated provenance holds against the pinned source', { skip }, () => {
  const by = new Map(questionRows.map(r => [r.id, r]));
  const surfaces = new Set(corpus.tokens.map(t => compact(t.surface)));
  const wrong = [];
  for (const q of content.questions) {
    const r = by.get(q.id);
    if (!r) continue;
    const word = q.wordId ? content.wordById.get(q.wordId) : null;
    const ids = q.tokenIds ?? (q.tokenId ? [q.tokenId] : q.contextKey ? [q.contextKey.tokenId] : []);
    const taught = new Set(word ? [word.hebrew, word.example.hebrew, ...word.relatedForms.map(f => f.hebrew)].map(compact) : []);
    if (!['citation', 'span', 'attested', 'original'].includes(r.prov)) wrong.push(`${q.id}: unknown provenance ${r.prov}`);
    if (r.prov === 'citation' && !word) wrong.push(`${q.id}: citation with no word`);
    if (r.prov === 'span' && !ids.length) wrong.push(`${q.id}: span with no tokens`);
    if (ids.length && r.prov !== 'span') wrong.push(`${q.id}: has source tokens, so its provenance must be span`);
    if (q.displayHebrew && ids.length && !compact(ids.map(id => corpus.byId.get(id)?.surface ?? '?').join('')).includes(compact(q.displayHebrew))) wrong.push(`${q.id}: display is not in its tokens`);
    // Inline Hebrew in the prompt: a shown token, a checked word form, or a corpus form; otherwise it must be declared original.
    const declared = new Set((r.inlineOriginal ?? []).map(compact));
    for (const run of q.prompt.match(HEBREW_RUN) ?? []) {
      const key = compact(run);
      const inSpan = ids.some(id => compact(corpus.byId.get(id)?.surface ?? '').includes(key));
      if (!inSpan && !taught.has(key) && !surfaces.has(key) && !declared.has(key)) wrong.push(`${q.id}: inline ${run} has no source, and isn't declared original`);
    }
    // A cited Genesis verse has to contain the word the question is about.
    const cite = q.prompt.match(/Genesis (\d+):(\d+)(?:-(\d+))?/);
    if (word && cite && q.templateId === 'tpl-context-choice') {
      const verses = [];
      for (let v = Number(cite[2]); v <= Number(cite[3] ?? cite[2]); v += 1) verses.push(`Gen.${cite[1]}.${v}`);
      if (!verses.some(ref => corpus.verses.get(ref)?.some(i => i.kind === 'w' && lemmaHas(i.lemma, word.strongId)))) wrong.push(`${q.id}: ${verses} has no token of ${word.strongId}`);
    }
    if ((r.inlineOriginal ?? []).length && !q.sourceIds.includes('aleph-quest-original')) wrong.push(`${q.id}: declares original Hebrew but doesn't cite the original-content source`);
  }
  assert.deepEqual(wrong, []);
});

test('each sound guide fits its pointing under the documented convention', () => {
  const wrong = [];
  for (const w of content.words) {
    if (!soundPattern(w.hebrew).test(plainGuide(w.transliteration)) && !wordRows.find(r => r.id === w.id)?.soundException) wrong.push(`${w.id}: guide ${w.transliteration} doesn't fit ${w.hebrew} (${soundPattern(w.hebrew).source})`);
  }
  assert.deepEqual(wrong, []);
});

test('sound distractors really differ: another reading, or a stress the row names', () => {
  const by = new Map(questionRows.map(r => [r.id, r]));
  assert.equal(soundPattern('בֹּקֶר').test('veqer'), false, 'the pattern must reject a soft bet');
  assert.equal(soundPattern('בֹּקֶר').test('boqer'), true);
  assert.equal(soundPattern('אוֹר').test('ur'), false);
  const wrong = [];
  for (const q of content.questions.filter(x => x.templateId === 'tpl-read-sound')) {
    const word = content.wordById.get(q.wordId);
    const pattern = soundPattern(word.hebrew);
    for (const c of q.choices) {
      const accepted = q.acceptedAnswers.includes(c.id);
      if (accepted && c.text !== word.transliteration) wrong.push(`${q.id}: accepted ${c.text}, card says ${word.transliteration}`);
      if (!accepted && pattern.test(plainGuide(c.text)) && !/stress|qamats/i.test(by.get(q.id)?.rej?.[c.id] ?? '')) wrong.push(`${q.id}: distractor ${c.text} also fits the letters, and its row doesn't name the stress or qamats error`);
    }
  }
  assert.deepEqual(wrong, []);
});

test('each stress mark agrees with the dictionary, or the word row says why not', { skip }, () => {
  const by = new Map(wordRows.map(r => [r.id, r]));
  const wrong = [];
  for (const w of content.words) {
    const row = by.get(w.id);
    const mine = guideStress(w.transliteration);
    const theirs = strongStress(strong.get(w.strongId).pron ?? '');
    if (mine === 'one' || theirs === 'one') continue;
    if (mine !== theirs && !row?.stressNote) wrong.push(`${w.id}: guide ${w.transliteration} stress ${mine}, Strong ${strong.get(w.strongId).pron} ${theirs}`);
  }
  assert.deepEqual(wrong, []);
});

test('every word has a row quoting the dictionary and checking each related form', { skip }, () => {
  const by = new Map(wordRows.map(r => [r.id, r]));
  const wrong = [];
  for (const w of content.words) {
    const row = by.get(w.id);
    if (!row) { wrong.push(`${w.id}: no word row`); continue; }
    const entry = strong.get(w.strongId);
    const text = `${entry.meaning ?? ''} ${entry.usage ?? ''} ${entry.source ?? ''}`.toLowerCase();
    if (!row.strong || !text.includes(row.strong.toLowerCase())) wrong.push(`${w.id}: quote "${row.strong}" isn't in Strong: ${text}`);
    if (!row.gloss) wrong.push(`${w.id}: no gloss rationale`);
    const forms = row.forms ?? [];
    if (forms.length !== w.relatedForms.length) wrong.push(`${w.id}: ${forms.length} form rows for ${w.relatedForms.length} forms`);
    w.relatedForms.forEach((f, i) => {
      const t = corpus.byId.get(f.tokenId);
      if (!t || compact(t.surface) !== compact(f.hebrew)) wrong.push(`${w.id}: form ${f.hebrew} isn't token ${f.tokenId}`);
      if (t && f.relationship === 'inflection' && !lemmaHas(t.lemma, w.strongId)) wrong.push(`${w.id}: inflection ${f.tokenId} has lemma ${t.lemma}`);
      if (t && forms[i] !== t.morph) wrong.push(`${w.id}: form row ${forms[i]} isn't token morph ${t.morph}`);
    });
  }
  assert.deepEqual(wrong, []);
});

// A related form's stated features have to match the token's morphology code, not merely sit beside it.
test('related-form features agree with their token\'s morphology', { skip }, () => {
  const GENDER = { m: 'masculine', f: 'feminine', c: 'common' };
  const NUMBER = { s: 'singular', p: 'plural', d: 'dual' };
  const wrong = [];
  for (const w of content.words) for (const f of w.relatedForms) {
    const t = corpus.byId.get(f.tokenId);
    if (!t) continue;
    const part = t.morph.replace(/^H/, '').split('/').find(p => /^[NAPV]/.test(p)) ?? '';
    const code = part[0] === 'V' ? part.slice(3) : part.slice(2);
    const shape = part[0] === 'V' ? { person: code[0], gender: code[1], number: code[2] } : { gender: code[0], number: code[1] };
    if (f.features.number && NUMBER[shape.number] && !f.features.number.includes(NUMBER[shape.number])) wrong.push(`${w.id} ${f.tokenId}: number ${f.features.number}, token ${t.morph}`);
    if (f.features.gender && GENDER[shape.gender] && !f.features.gender.includes(GENDER[shape.gender])) wrong.push(`${w.id} ${f.tokenId}: gender ${f.features.gender}, token ${t.morph}`);
    if (f.features.form === 'with article' && !/(^|\/)(Td|Rd)/.test(t.morph.replace(/^H/, ''))) wrong.push(`${w.id} ${f.tokenId}: says article, token ${t.morph}`);
  }
  assert.deepEqual(wrong, []);
});

// The rows were written against these exact options. A changed option or key must be audited again.
const PINNED = JSON.parse(readFileSync(new URL('pinned.json', dir), 'utf8'));
test('the audited questions are the shipped questions', () => {
  const digest = {};
  for (const region of content.regions) {
    const hash = createHash('sha256');
    for (const q of content.questions.filter(x => x.regionId === region.id)) hash.update(JSON.stringify([q.id, q.prompt, q.displayHebrew ?? null, optionsOf(q), q.acceptedAnswers ?? null, q.recognitionAccepted ?? null, q.acceptedSequences ?? null, q.requires]));
    digest[region.id] = hash.digest('hex');
  }
  assert.deepEqual(digest, PINNED);
});
