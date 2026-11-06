// Every shipped Hebrew string that claims a source is checked against the pinned upstream XML.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { content } from '../../src/content.js';
import { loadCorpus, loadStrong, researchAvailable, pointedKey } from '../../scripts/content-source.mjs';

const skip = researchAvailable() ? false : 'pinned research XML not present in /tmp/aleph-quest-research/data';
const corpus = researchAvailable() ? loadCorpus() : null;
const strong = researchAvailable() ? loadStrong() : null;
const tokens = new Map(content.attestations.map(a => [a.tokenId, a]));
const baseline = file => JSON.parse(execFileSync('git', ['show', `52502cedb3dfd6ed4462718d98048579c5b57932:data/${file}.json`], { encoding: 'utf8', maxBuffer: 2 ** 26 }));
const compact = text => pointedKey(text).replace(/[\s־׀׃]/g, '').replace(/פ$|ס$/, m => m);
// A verse span: contiguous tokens whose joined keys equal the text, ignoring maqqef and spaces.
function spanIn(reference, text) {
  const words = corpus.verses.get(reference)?.filter(i => i.kind === 'w') ?? [];
  const wanted = compact(text);
  for (let i = 0; i < words.length; i += 1) {
    let joined = '';
    for (let j = i; j < words.length && joined.length < wanted.length; j += 1) {
      joined += compact(words[j].surface);
      if (joined === wanted) return words.slice(i, j + 1);
    }
  }
  return null;
}

test('every attestation is byte-exact against the pinned XML, in source mark order', { skip }, () => {
  const wrong = [];
  for (const a of content.attestations) {
    const up = corpus.byId.get(a.tokenId);
    if (!up) { wrong.push(`${a.tokenId}: not in source`); continue; }
    for (const field of ['surface', 'reference', 'lemma', 'morph']) {
      if (a[field] !== up[field]) wrong.push(`${a.tokenId} ${field}: shipped ${a[field]} upstream ${up[field]} ${[...up[field]].map(c => c.codePointAt(0).toString(16)).join(' ')}`);
    }
  }
  assert.deepEqual(wrong, []);
});

test('attestation ids are unique', () => {
  assert.equal(tokens.size, content.attestations.length);
});

test('every passage has immutable source text and exact tokens', { skip }, () => {
  const wrong = [];
  for (const p of content.passages) {
    const items = corpus.verses.get(p.reference);
    if (!items) { wrong.push(`${p.id}: no verse ${p.reference}`); continue; }
    for (const t of p.tokens) {
      const up = corpus.byId.get(t.id);
      if (!up || up.reference !== p.reference) wrong.push(`${p.id}: token ${t.id} is not in ${p.reference}`);
      else for (const [mine, theirs] of [[t.hebrew, up.surface], [t.lemma, up.lemma], [t.morph, up.morph]]) if (mine !== theirs) wrong.push(`${p.id} ${t.id}: ${mine} != ${theirs}`);
    }
    if (p.span === 'verse') {
      const raw = items.map(i => (i.kind === 'w' ? i.surface : i.text));
      const full = items.reduce((text, item, i) => text + ((i === 0 || item.type === 'x-maqqef' || item.type === 'x-sof-pasuq' || items[i - 1].type === 'x-maqqef') ? '' : ' ') + raw[i], '');
      if (p.sourceText !== full) wrong.push(`${p.id}: sourceText is not the whole verse in source order. upstream: ${full}`);
      if (p.tokens.length !== items.filter(i => i.kind === 'w').length) wrong.push(`${p.id}: tokens do not cover the verse`);
    } else {
      const surfaces = p.tokens.map(t => corpus.byId.get(t.id)?.surface ?? '?');
      const stripped = p.sourceText.replace(/[\s־]/g, '');
      if (stripped !== surfaces.join('').replace(/[\s־]/g, '')) wrong.push(`${p.id}: sourceText is not its tokens. upstream: ${surfaces.join(' ')}`);
    }
    // Same key the shared validator uses, so a display that passes here passes there.
    if (pointedKey(p.sourceText) !== pointedKey(p.display)) wrong.push(`${p.id}: display does not match its source apart from accents and meteg`);
  }
  assert.deepEqual(wrong, []);
});

test('accepted r1 records are unchanged from the opening baseline', () => {
  for (const file of ['words', 'questions', 'lessons']) {
    const current = new Map(content[file].map(r => [r.id, r]));
    for (const record of baseline(file)) assert.deepEqual(current.get(record.id), record, `${file} ${record.id} changed`);
  }
  assert.deepEqual(content.regions[0], baseline('regions')[0]);
  assert.deepEqual(content.quests[0], baseline('quests')[0]);
  const ids = new Set(content.attestations.map(a => a.tokenId));
  for (const a of baseline('attestations')) assert.ok(ids.has(a.tokenId), `lost ${a.tokenId}`);
  const sources = new Map(content.sources.map(s => [s.id, s]));
  for (const s of baseline('sources')) assert.ok(sources.has(s.id), `lost source ${s.id}`);
});

test('every word cites a real dictionary entry and a real clause', { skip }, () => {
  const wrong = [];
  for (const w of content.words) {
    const entry = strong.get(w.strongId);
    if (!entry) { wrong.push(`${w.id}: no Strong entry`); continue; }
    if (pointedKey(entry.headword) !== pointedKey(w.hebrew) && !w.citationNote) wrong.push(`${w.id}: citation ${w.hebrew} differs from headword ${entry.headword} with no citationNote`);
    if (entry.pos?.startsWith('n-pr')) wrong.push(`${w.id}: dictionary marks this a proper name`);
    const example = tokens.get(w.example.tokenId);
    if (!example) { wrong.push(`${w.id}: example token ${w.example.tokenId} not attested`); continue; }
    const span = spanIn(example.reference, w.example.hebrew);
    if (!span) wrong.push(`${w.id}: example clause is not contiguous in ${example.reference}: ${corpus.verses.get(example.reference)?.filter(i => i.kind === 'w').map(i => i.surface).join(' ')}`);
    else if (!span.some(t => t.tokenId === w.example.tokenId)) wrong.push(`${w.id}: example clause does not contain its token`);
    for (const form of w.relatedForms) {
      const token = tokens.get(form.tokenId);
      if (!token) { wrong.push(`${w.id}: related token ${form.tokenId} not attested`); continue; }
      if (token.reference !== form.reference) wrong.push(`${w.id}: related form reference ${form.reference} is really ${token.reference}`);
    }
  }
  assert.deepEqual(wrong, []);
});

test('task Hebrew tied to source tokens is contiguous and carries the authored morphology', () => {
  const wrong = [];
  for (const q of content.questions) {
    const ids = q.tokenIds ?? (q.tokenId ? [q.tokenId] : []);
    if (q.tokenIds && q.tokenId) wrong.push(`${q.id}: use tokenId or tokenIds, not both`);
    const found = ids.map(id => tokens.get(id));
    if (found.some(t => !t)) { wrong.push(`${q.id}: unknown token in ${ids}`); continue; }
    if (q.tokenIds) {
      if (new Set(found.map(t => t.reference)).size !== 1) wrong.push(`${q.id}: tokens span more than one verse`);
      if (q.displayHebrew && compact(found.map(t => t.surface).join('')) !== compact(q.displayHebrew)) wrong.push(`${q.id}: shows "${q.displayHebrew}", tokens read "${found.map(t => t.surface).join(' ')}"`);
      if (corpus) {
        const verse = corpus.verses.get(found[0].reference).filter(i => i.kind === 'w').map(i => i.tokenId);
        const at = verse.indexOf(ids[0]);
        if (ids.some((id, i) => verse[at + i] !== id)) wrong.push(`${q.id}: tokens are not contiguous`);
      }
    }
    if (q.key) {
      const t = tokens.get(q.key.tokenId);
      if (!t) wrong.push(`${q.id}: key cites unknown token ${q.key.tokenId}`);
      else if (!t.morph.includes(q.key.morph)) wrong.push(`${q.id}: key says ${q.key.morph}, token ${t.tokenId} is ${t.morph}`);
    }
  }
  assert.deepEqual(wrong, []);
});
