// Curriculum-level proof over the authored data: counts, keys, prerequisite closure and pools.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { content } from '../../src/content.js';
import { comparisonKey } from '../../src/answers.js';
import { keyRules, skillsForMorph } from '../../scripts/content-rules.mjs';
import { pointedKey } from '../../scripts/content-source.mjs';
import { validateContent } from '../../scripts/validate-content.mjs';

const { words, questions, lessons, regions, quests, passages, attestations } = content;
const tokens = new Map(attestations.map(a => [a.tokenId, a]));
const FAMILIES = ['read-letter', 'understand-meaning', 'inscribe-spelling'];
const OLD_TEMPLATES = new Set(['tpl-first-letter', 'tpl-last-letter', 'tpl-final-partner', 'tpl-gloss-choice', 'tpl-context-choice', 'tpl-gloss-type', 'tpl-inscribe-type', 'tpl-inscribe-mirror']);
const ROSS = { r1: [1], r2: [2, 3, 4, 5, 6], r3: [7, 8, 9], r4: [10, 11, 12], r5: [13, 14, 15], r6: [16, 17, 18, 19, 20, 21, 22, 23, 24, 25], r7: [26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37], r8: [18, 21] };
const HEBREW_RUN = /[א-ת][֑-ׇא-ת׳״]*/g;

// Skills available by the time a region is finished, and when it is entered.
const skillsThrough = new Map();
{
  const known = new Set();
  for (const r of regions) {
    for (const id of r.lessonIds) for (const s of content.lessonById.get(id).teaches) known.add(s);
    skillsThrough.set(r.id, new Set(known));
  }
}
const lessonOrder = new Map(regions.flatMap(r => r.lessonIds).map((id, i) => [id, i]));

test('the campaign reaches its floors with distinct lexemes and enough real questions', () => {
  assert.equal(regions.length, 8);
  assert.deepEqual(regions.map(r => r.id), ['r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'r8']);
  assert.ok(words.length >= 150, `words ${words.length}`);
  assert.equal(new Set(words.map(w => w.id)).size, words.length);
  assert.equal(new Set(words.map(w => w.strongId)).size, words.length, 'two records share a Strong number');
  // True homographs (H853/H854) stay separate lexemes, and each must name the other.
  const byCitation = new Map();
  for (const w of words) byCitation.set(pointedKey(w.hebrew), [...(byCitation.get(pointedKey(w.hebrew)) ?? []), w]);
  for (const group of byCitation.values()) if (group.length > 1) for (const w of group) assert.ok(group.some(o => o.id === w.homographOf), `${w.id} shares a citation form without naming its homograph`);
  assert.ok(questions.length >= 900, `questions ${questions.length}`);
  assert.equal(new Set(questions.map(q => q.id)).size, questions.length);
  assert.equal(new Set(questions.map(q => q.semanticStemId)).size, questions.length);
});

test('every word is complete: forms, features, sound guide and root discipline', () => {
  const wrong = [];
  for (const w of words) {
    if (!/^H\d{4}$/.test(w.id) || Number(w.id.slice(1)) !== Number(w.strongId.slice(1))) wrong.push(`${w.id}: id does not match ${w.strongId}`);
    if (comparisonKey(w.hebrew, 'consonants') !== w.consonants) wrong.push(`${w.id}: consonants`);
    if (!w.transliteration || !w.gloss || !w.meanings.length || !w.pos) wrong.push(`${w.id}: empty card field`);
    if (!Object.keys(w.features).length) wrong.push(`${w.id}: no features`);
    if (w.root !== null && (comparisonKey(w.root, 'consonants') !== w.root || !w.rootNote)) wrong.push(`${w.id}: root needs letters and a note`);
    if (w.regionIds.length !== 1 || !regions.find(r => r.id === w.regionIds[0])?.wordIds.includes(w.id)) wrong.push(`${w.id}: region mismatch`);
    // A word with no related form must say why, so an empty list can't be an oversight.
    if (!['inflection', 'derivation', 'separate-lexeme'].includes(w.relatedForms[0]?.relationship) && !w.indeclinable && !w.noOtherForm) wrong.push(`${w.id}: no related form, and neither indeclinable nor noOtherForm says why`);
    for (const f of w.relatedForms) if (!f.gloss || !f.reference) wrong.push(`${w.id}: related form needs a contextual gloss`);
    if (w.example.original !== false || !w.example.translation) wrong.push(`${w.id}: example must be an attested, translated line`);
    if (!w.sourceIds.includes('strong-digital') || !w.sourceIds.includes('wlc-oshb')) wrong.push(`${w.id}: sources`);
  }
  assert.deepEqual(wrong, []);
  for (const r of regions) {
    assert.equal(new Set(r.wordIds).size, r.wordIds.length);
    for (const id of r.wordIds) assert.deepEqual(content.wordById.get(id)?.regionIds, [r.id], `${id} region`);
  }
  assert.equal(regions.flatMap(r => r.wordIds).length, words.length, 'a word is not in any region');
});

test('every word has three capture families, retries and answer keys that hold', () => {
  const wrong = [];
  for (const w of words) {
    const own = questions.filter(q => q.wordId === w.id);
    if (own.length < 6) wrong.push(`${w.id}: ${own.length} questions`);
    for (const f of FAMILIES) if (new Set(own.filter(q => q.taskFamily === f).map(q => q.semanticStemId)).size < 2) wrong.push(`${w.id}: ${f} has no fresh retry`);
    const capture = own.filter(q => FAMILIES.includes(q.taskFamily));
    if (new Set(capture.map(q => q.templateId)).size !== capture.length) wrong.push(`${w.id}: template repeats`);
    for (const q of own) {
      if (q.regionId !== w.regionIds[0]) wrong.push(`${q.id}: region differs from its word`);
      if (keyRules[q.templateId]) { const e = keyRules[q.templateId](q, w); if (e) wrong.push(e); } else if (!OLD_TEMPLATES.has(q.templateId)) wrong.push(`${q.id}: unknown template ${q.templateId}`);
      const answer = (q.choices ?? q.recognitionChoices)?.find(c => (q.acceptedAnswers ?? []).includes(c.id) || (q.recognitionAccepted ?? []).includes(c.id))?.text;
      const rules = {
        'tpl-first-letter': () => answer === [...w.consonants][0],
        'tpl-last-letter': () => answer === [...w.consonants].at(-1),
        'tpl-inscribe-mirror': () => answer === w.consonants,
        'tpl-inscribe-type': () => answer === w.hebrew && q.acceptedAnswers.every(a => comparisonKey(a, 'consonants') === w.consonants),
        'tpl-gloss-choice': () => answer === w.gloss,
        'tpl-context-choice': () => answer?.includes(w.gloss),
        'tpl-gloss-type': () => answer === w.gloss && q.acceptedAnswers.includes(w.gloss),
      }[q.templateId];
      if (rules && !rules()) wrong.push(`${q.id}: answer key fails ${q.templateId}`);
      if (q.displayHebrew && q.command !== 'inscribe' && /tpl-read|tpl-gloss/.test(q.templateId) && pointedKey(q.displayHebrew) !== pointedKey(w.hebrew)) wrong.push(`${q.id}: shows another form`);
    }
  }
  assert.deepEqual(wrong, []);
});

test('no distractor is another valid sense, and options are unique on all tasks', () => {
  const wrong = [];
  for (const q of questions) {
    const lists = [[q.choices, q.acceptedAnswers], [q.recognitionChoices, q.recognitionAccepted]].filter(([c]) => c);
    for (const [options, accepted] of lists) {
      if (new Set(options.map(c => c.id)).size !== options.length) wrong.push(`${q.id}: duplicate option id`);
      // Stress capitals tell sound guides apart, so options compare raw unless they are Hebrew.
      if (new Set(options.map(c => (c.lang === 'he' ? comparisonKey(c.text, 'pointed') : c.text))).size !== options.length) wrong.push(`${q.id}: options collapse to the same text`);
      if (options.length < 2 || !accepted?.length || accepted.length >= options.length || !accepted.every(id => options.some(c => c.id === id))) wrong.push(`${q.id}: answers are not a proper subset`);
    }
    if (q.format === 'tokens') {
      if (!q.acceptedSequences?.length) wrong.push(`${q.id}: no sequence`);
      for (const seq of q.acceptedSequences ?? []) if (!seq.every(id => q.tokenOptions.some(t => t.id === id))) wrong.push(`${q.id}: unknown token in a sequence`);
    }
    if (q.format === 'type' && (!q.acceptedAnswers.length || !['gloss', 'consonants', 'pointed'].includes(q.compare) || !q.recognitionChoices?.length)) wrong.push(`${q.id}: type shape`);
    if (!['choice', 'door', 'type', 'tokens'].includes(q.format)) wrong.push(`${q.id}: unsupported format ${q.format}`);
    for (const field of ['prompt', 'explanation', 'hint', 'taskFamily', 'templateId', 'contextId', 'command']) if (!q[field]) wrong.push(`${q.id}: empty ${field}`);
    if (!['read', 'understand', 'analyze', 'build', 'inscribe'].includes(q.command)) wrong.push(`${q.id}: command ${q.command}`);
    if (q.wordId) {
      const w = content.wordById.get(q.wordId);
      const senses = new Set(w.meanings.flatMap(m => [m, m.split(',')[0]]).map(m => comparisonKey(m, 'gloss')));
      for (const a of q.format === 'type' && q.compare === 'gloss' ? q.acceptedAnswers : []) senses.add(comparisonKey(a, 'gloss'));
      if (q.taskFamily === 'understand-meaning') {
        const options = q.choices ?? q.recognitionChoices;
        const accepted = q.acceptedAnswers?.concat(q.recognitionAccepted ?? []);
        for (const c of options) if (!accepted.includes(c.id) && senses.has(comparisonKey(c.text, 'gloss'))) wrong.push(`${q.id}: distractor "${c.text}" is a sense of the word`);
      }
    }
  }
  assert.deepEqual(wrong, []);
});

test('curated, not renumbered: prompts and meaning distractors vary across words', () => {
  const contexts = questions.filter(q => q.templateId === 'tpl-context-choice');
  assert.equal(new Set(contexts.map(q => q.prompt)).size, contexts.length, 'two context prompts are identical');
  const sets = new Map();
  for (const q of questions.filter(q => q.taskFamily === 'understand-meaning')) {
    const key = (q.choices ?? q.recognitionChoices).map(c => c.text).sort().join('|');
    sets.set(key, (sets.get(key) ?? 0) + 1);
  }
  assert.ok(Math.max(...sets.values()) <= 3, 'one distractor set is reused too often');
  const explanations = questions.filter(q => q.templateId === 'tpl-read-sound').map(q => q.explanation);
  assert.equal(new Set(explanations).size, explanations.length, 'read explanations are copies');
  const analysis = questions.filter(q => q.wordId === null && ['analyze', 'build'].includes(q.command));
  assert.ok(analysis.length >= 150, `analyze and build tasks ${analysis.length}`);
  for (const r of regions.slice(1)) assert.ok(analysis.filter(q => q.regionId === r.id).length >= 12, `${r.id} has too few analyze/build tasks`);
});

test('skills close in order: nothing asks for grammar before its worked example', () => {
  const wrong = [];
  const taughtAt = new Map();
  for (const id of regions.flatMap(r => r.lessonIds)) for (const s of content.lessonById.get(id).teaches) if (!taughtAt.has(s)) taughtAt.set(s, id);
  for (const l of lessons) {
    if (!lessonOrder.has(l.id)) wrong.push(`${l.id}: not in a region`);
    if (!l.workedExamples.length || !l.explanation) wrong.push(`${l.id}: needs teaching and a worked example`);
    if (!l.guidedQuestionIds.length) wrong.push(`${l.id}: needs guided practice`);
    for (const s of l.requires) if (!(lessonOrder.get(taughtAt.get(s)) < lessonOrder.get(l.id))) wrong.push(`${l.id}: requires ${s} before it is taught`);
    for (const id of l.guidedQuestionIds) {
      const q = content.questionById.get(id);
      const allowed = new Set([...skillsBefore(l.id), ...l.teaches]);
      for (const s of q?.requires ?? []) if (!allowed.has(s)) wrong.push(`${id}: guided in ${l.id} but needs ${s}`);
    }
  }
  function skillsBefore(lessonId) {
    return [...taughtAt].filter(([, at]) => lessonOrder.get(at) < lessonOrder.get(lessonId)).map(([s]) => s);
  }
  for (const q of questions) {
    const allowed = skillsThrough.get(q.regionId);
    for (const s of q.requires) if (!allowed?.has(s)) wrong.push(`${q.id}: ${q.regionId} asks for ${s}, not taught yet`);
    const ids = q.tokenIds ?? (q.tokenId ? [q.tokenId] : []);
    // A form may be shown once its grammar is taught by this region, even if the task tests something else.
    for (const id of ids) for (const s of skillsForMorph(tokens.get(id)?.morph ?? '')) if (!allowed?.has(s)) wrong.push(`${q.id}: token ${id} shows ${tokens.get(id)?.morph}, needs ${s}`);
    if (q.wordId && q.templateId === 'tpl-context-choice') {
      const w = content.wordById.get(q.wordId);
      const forms = new Map([[pointedKey(w.hebrew), ''], ...w.relatedForms.map(f => [pointedKey(f.hebrew), tokens.get(f.tokenId)?.morph ?? '']), [pointedKey(tokens.get(w.example.tokenId)?.surface ?? ''), tokens.get(w.example.tokenId)?.morph ?? '']]);
      for (const run of q.prompt.match(HEBREW_RUN) ?? []) {
        if (!forms.has(pointedKey(run))) wrong.push(`${q.id}: prompt shows ${run}, which is not this word's checked form`);
        else for (const s of skillsForMorph(forms.get(pointedKey(run)))) if (!allowed?.has(s)) wrong.push(`${q.id}: prompt form needs ${s}`);
      }
    }
    if (q.wordId) for (const s of content.wordById.get(q.wordId).requires) if (!q.requires.includes(s)) wrong.push(`${q.id}: misses word skill ${s}`);
  }
  assert.deepEqual(wrong, []);
  assert.ok(lessonOrder.get(taughtAt.get('perfect')) < lessonOrder.get(taughtAt.get('construct')), 'perfect must come before construct');
  assert.equal(content.lessonById.get(taughtAt.get('narrative')).regionId, 'r6', 'narrative sequence belongs to r6');
});

test('each region can really be played: words, seeds, pools and badges are eligible', () => {
  const wrong = [];
  for (const [i, r] of regions.entries()) {
    assert.equal(r.order, i + 1);
    assert.deepEqual(r.rossChapters, ROSS[r.id], `${r.id} chapters`);
    assert.equal(r.alignment, 'verified-topic/original-grouping');
    assert.deepEqual(r.requiresBadges, i ? [regions[i - 1].badge.id] : []);
    const prior = i ? skillsThrough.get(regions[i - 1].id) : new Set();
    const known = skillsThrough.get(r.id);
    const firstLesson = new Set([...prior, ...content.lessonById.get(r.lessonIds[0]).teaches]);
    const seed = content.wordById.get(r.seedWordId);
    if (!seed || !r.wordIds.includes(r.seedWordId)) wrong.push(`${r.id}: seed not in the region`);
    if (i) {
      for (const family of FAMILIES) {
        const open = questions.filter(q => q.wordId === r.seedWordId && q.taskFamily === family && q.requires.every(s => firstLesson.has(s)));
        if (!open.length) wrong.push(`${r.id}: seed ${r.seedWordId} has no ${family} question after the first lesson`);
      }
      for (const s of seed.requires) if (!['alphabet', 'rtl'].includes(s)) wrong.push(`${r.id}: seed needs ${s}, shared rule allows only the first lesson's skills`);
    }
    for (const id of r.wordIds) {
      const w = content.wordById.get(id);
      for (const s of w.requires) if (!known.has(s)) wrong.push(`${id}: requires ${s}, not known by end of ${r.id}`);
      for (const f of FAMILIES) if (questions.filter(q => q.wordId === id && q.taskFamily === f && q.requires.every(s => known.has(s))).length < 2) wrong.push(`${id}: ${f} lacks two eligible stems in ${r.id}`);
    }
    if (!r.puzzleQuestionIds.neri?.length || !r.puzzleQuestionIds.gate?.length) wrong.push(`${r.id}: needs neri and gate pools`);
    for (const [group, ids] of Object.entries(r.puzzleQuestionIds)) {
      if (i && ids.length < 3) wrong.push(`${r.id}: ${group} has no retry headroom`);
      for (const id of ids) {
        const q = content.questionById.get(id);
        if (!q) { wrong.push(`${r.id}: unknown puzzle ${id}`); continue; }
        if (q.regionId !== r.id || q.wordId !== null) wrong.push(`${id}: puzzle must be this region's and not capture vocabulary`);
        for (const s of q.requires) if (!known.has(s)) wrong.push(`${id}: not eligible`);
      }
    }
    const trial = r.badge.questionIds.map(id => content.questionById.get(id));
    if (trial.length < r.badge.requiredCorrect + 2) wrong.push(`${r.id}: badge lacks retry headroom`);
    for (const f of r.badge.requiredTaskFamilies) if (trial.filter(q => q?.taskFamily === f).length < (i ? 2 : 1)) wrong.push(`${r.id}: family ${f} lacks a fresh retry`);
    for (const q of trial) {
      if (!q) { wrong.push(`${r.id}: unknown badge item`); continue; }
      if (q.wordId !== null || q.regionId !== r.id) wrong.push(`${q.id}: badge item scope`);
      for (const s of q.requires) if (!known.has(s) || !r.badge.requiresSkills.includes(s) && !prior.has(s)) wrong.push(`${q.id}: badge skill ${s} not enforced`);
    }
    for (const s of r.badge.requiresSkills) if (!known.has(s)) wrong.push(`${r.id}: badge requires unknown skill ${s}`);
    if (r.badge.requiresCaptures > r.wordIds.length) wrong.push(`${r.id}: requires more captures than it has words`);
    const quest = content.questById.get(r.questId);
    if (!quest || quest.regionId !== r.id) { wrong.push(`${r.id}: quest`); continue; }
    if (i) {
      const stageKinds = quest.stages.map(s => s.kind);
      for (const needed of ['lesson', 'capture', 'puzzle', 'duel', 'exit']) if (!stageKinds.includes(needed)) wrong.push(`${r.id}: quest misses ${needed}`);
      const flags = quest.stages.filter(s => s.kind === 'puzzle' || s.kind === 'exit').flatMap(s => s.targetIds);
      for (const f of ['rival', 'gate', 'exit']) if (!flags.includes(`${r.id}:${f}`)) wrong.push(`${r.id}: quest misses flag ${r.id}:${f}`);
      const taught = new Set(quest.stages.filter(s => s.kind === 'lesson').flatMap(s => s.targetIds));
      for (const id of r.lessonIds) if (!taught.has(id)) wrong.push(`${r.id}: quest skips lesson ${id}`);
      for (const stage of quest.stages.filter(s => s.kind === 'capture')) {
        if (!stage.requiredCount || stage.requiredCount > stage.targetIds.length) wrong.push(`${r.id}: capture stage count`);
        for (const id of stage.targetIds) if (!r.wordIds.includes(id)) wrong.push(`${r.id}: capture target ${id} is elsewhere`);
      }
      if (!quest.stages.find(s => s.kind === 'duel')?.targetIds.includes(r.badge.id)) wrong.push(`${r.id}: duel is not its badge`);
    }
  }
  assert.deepEqual(wrong, []);
});

test('badge trials do not reuse lesson or vocabulary tokens', () => {
  const taken = new Set([...lessons.flatMap(l => l.workedExamples.map(x => x.tokenId)), ...words.flatMap(w => [w.example.tokenId, ...w.relatedForms.map(f => f.tokenId)])]);
  const wrong = [];
  for (const r of regions) for (const id of r.badge.questionIds) {
    const q = content.questionById.get(id);
    for (const t of q.tokenIds ?? (q.tokenId ? [q.tokenId] : [])) if (taken.has(t)) wrong.push(`${id}: reuses ${t}`);
  }
  assert.deepEqual(wrong, []);
});

test('every lesson example and quest reference resolves to source', () => {
  const wrong = [];
  for (const l of lessons) for (const x of l.workedExamples) {
    const t = tokens.get(x.tokenId);
    if (!t) wrong.push(`${l.id}: token ${x.tokenId}`);
    else {
      if (!pointedKey(t.surface).includes(pointedKey(x.hebrew))) wrong.push(`${l.id}: ${x.hebrew} is not in ${t.surface}`);
      if (t.reference !== x.reference) wrong.push(`${l.id}: example reference ${x.reference} is really ${t.reference}`);
      for (const s of skillsForMorph(t.morph)) if (!new Set([...skillsThrough.get(l.regionId)]).has(s)) wrong.push(`${l.id}: example needs ${s}`);
    }
  }
  for (const quest of quests) for (const s of quest.stages) {
    if (s.kind === 'lesson') for (const id of s.targetIds) if (!content.lessonById.has(id)) wrong.push(`${quest.id}: ${id}`);
    if (s.kind === 'duel') for (const id of s.targetIds) if (!regions.some(r => r.badge.id === id)) wrong.push(`${quest.id}: ${id}`);
    if (!s.text) wrong.push(`${quest.id}: stage text`);
  }
  assert.deepEqual(wrong, []);
});

test('the final region reads licensed Genesis 1:1-5 with original readings', () => {
  const verses = ['Gen.1.1', 'Gen.1.2', 'Gen.1.3', 'Gen.1.4', 'Gen.1.5'];
  const genesis = verses.map(ref => passages.find(p => p.reference === ref));
  assert.ok(genesis.every(Boolean), 'missing a verse');
  assert.equal(genesis.reduce((n, p) => n + p.tokens.length, 0), 52, 'Genesis 1:1-5 has 52 source tokens');
  for (const p of genesis) {
    assert.equal(p.sourceId, 'wlc-oshb');
    assert.ok(p.translation && p.tokens.every(t => t.gloss), `${p.id} needs readings`);
    assert.ok(p.questionIds.length >= 2, `${p.id} needs questions`);
    for (const id of p.questionIds) {
      const q = content.questionById.get(id);
      assert.equal(q?.regionId, 'r8', `${id} region`);
    }
  }
  const r8 = content.regionById.get('r8');
  assert.ok(r8.lessonIds.length && r8.rossChapters.every(c => c === 18 || c === 21));
  assert.ok(!/final chapter|last chapter/i.test(r8.theme), 'r8 must not claim to be Ross\'s last chapter');
  const quest = content.questById.get(r8.questId);
  assert.ok(quest.stages.some(s => s.kind === 'puzzle'));
  for (const p of passages) for (const s of p.requires) assert.ok(skillsThrough.get('r8').has(s), `${p.id} requires ${s}`);
});

test('the shared validator finds nothing but the two documented new templates', () => {
  const documented = /no answer-key rule for template tpl-read-(sound|pointed)$/;
  assert.deepEqual(validateContent(content, 'full').filter(e => !documented.test(e)), []);
});

test('the review ledger covers every word and matches the data', () => {
  const ledger = readFileSync(new URL('../../docs/CONTENT-REVIEW.md', import.meta.url), 'utf8');
  const wrong = [];
  for (const w of words) {
    const t = tokens.get(w.example.tokenId);
    const row = ledger.split('\n').find(line => line.startsWith(`| ${w.id} |`));
    if (!row) { wrong.push(`${w.id}: no ledger row`); continue; }
    for (const expected of [w.strongId, t?.lemma, t?.reference, t?.morph, w.example.tokenId]) if (!row.includes(`${expected}`)) wrong.push(`${w.id}: ledger misses ${expected}`);
  }
  assert.deepEqual(wrong, []);
});
