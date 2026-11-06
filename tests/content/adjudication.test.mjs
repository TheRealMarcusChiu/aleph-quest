// Coverage of the all-record semantic pass in docs/CONTENT-REVIEW-ledger/a-*.json. This binds the verdicts to
// the shipped records, so nothing can go unlisted or stale. It can't show that any verdict is right.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { content } from '../../src/content.js';

const dir = new URL('../../docs/CONTENT-REVIEW-ledger/', import.meta.url);
const files = readdirSync(dir).filter(f => /^a-.*\.json$/.test(f)).sort().map(f => JSON.parse(readFileSync(new URL(f, dir), 'utf8')));
const groups = files.flatMap(f => f.groups);
const VERDICTS = new Set(['accept', 'corrected', 'open']);
const INSPECTED = new Set(['record+card', 'record+xml', 'record+verse-from-memory']);
const verdicts = kind => groups.filter(g => g.kind === kind).flatMap(g => g.ids);
const digest = records => createHash('sha256').update(JSON.stringify(records)).digest('hex');

test('every question and word has exactly one verdict, and no verdict is left over', () => {
  for (const [kind, known] of [['question', content.questions], ['word', content.words]]) {
    const ids = verdicts(kind);
    assert.equal(new Set(ids).size, ids.length, `${kind}: duplicate verdict`);
    const have = new Set(ids);
    assert.deepEqual(known.map(r => r.id).filter(id => !have.has(id)), [], `${kind}: no verdict`);
    const real = new Set(known.map(r => r.id));
    assert.deepEqual(ids.filter(id => !real.has(id)), [], `${kind}: stale verdict`);
  }
});

test('a verdict says what was inspected, and anything short of acceptance says why', () => {
  for (const g of groups) {
    assert.ok(VERDICTS.has(g.verdict), g.verdict);
    assert.ok(INSPECTED.has(g.inspected), g.inspected);
    if (g.verdict !== 'accept') assert.ok(g.why?.length > 20, `${g.ids[0]}: needs a reason`);
  }
});

test('the coverage table in CONTENT-REVIEW.md gives the real counts', () => {
  const doc = readFileSync(new URL('../../docs/CONTENT-REVIEW.md', import.meta.url), 'utf8');
  const stated = {};
  for (const [, kind, verdict, inspected, count] of doc.matchAll(/^\| (question|word) \| (accept|corrected|open) \| (record\+[a-z-]+) \| (\d+) \|$/gm)) stated[`${kind} ${verdict} ${inspected}`] = Number(count);
  const real = {};
  for (const g of groups) { const key = `${g.kind} ${g.verdict} ${g.inspected}`; real[key] = (real[key] ?? 0) + g.ids.length; }
  assert.deepEqual(stated, real);
});

// Verdicts were given to these exact records, feedback included. A later edit must be adjudicated again.
test('the adjudicated records are the shipped records', () => {
  const pinned = JSON.parse(readFileSync(new URL('a-pinned.txt', dir), 'utf8'));
  assert.deepEqual({ questions: digest(content.questions), words: digest(content.words), lessons: digest(content.lessons) }, pinned);
});
