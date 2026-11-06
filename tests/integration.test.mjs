// Contracts between the reviewed content and the game code, checked on the REAL shipped data.
// These are module-level and jsdom checks. They do not replace a real browser campaign.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { content, buildContent } from '../src/content.js';
import { checkAnswer } from '../src/answers.js';
import { newGame, markLessonDone, chooseEncounter, setFlag, currentStage } from '../src/engine.js';
import { startEncounter, completeStudy, openQuestion, submit, retreat, statusOf, nextRelatedForm, answerRelatedForm, CAPTURE_FAMILIES } from '../src/learning.js';
import { OBJECTS, REGION_MAPS, MAPS, ENCOUNTER_TILES } from '../src/world.js';
import { parseImport, exportText, saveSlot, loadSlot } from '../src/storage.js';
import { validateContent } from '../scripts/validate-content.mjs';
import { startApp } from '../src/app.js';

const NOW = 1_800_000_000_000;
const plain = () => structuredClone({ words: content.words, questions: content.questions, lessons: content.lessons, regions: content.regions, quests: content.quests, passages: content.passages, sources: content.sources, attestations: content.attestations });
const q = (data, id) => data.questions.find(item => item.id === id);
const fails = (mutate, pattern) => {
  const data = plain();
  mutate(data);
  const errors = validateContent(data, 'full');
  assert.ok(errors.some(e => pattern.test(e)), `expected ${pattern}, got: ${errors.slice(0, 5).join(' | ') || 'no errors'}`);
};

const rightAnswer = question => {
  if (question.format === 'tokens') return question.acceptedSequences[0];
  if (question.format === 'match') return question.pairs.map(pair => pair.right);
  return question.acceptedAnswers[0];
};
const wrongAnswer = question => {
  if (question.format === 'tokens') return [];
  if (question.format === 'type') return 'not this at all';
  return question.choices.find(c => !question.acceptedAnswers.includes(c.id)).id;
};

// Lessons finished in campaign order, so a word only sees what its own region has really taught.
function stateThrough(regionId) {
  const s = newGame(NOW, 3);
  for (const region of content.regions) {
    for (const id of region.lessonIds) markLessonDone(s, content, id, NOW);
    if (region.id === regionId) break;
  }
  return s;
}

test('the real campaign floors hold: 8 regions in order, at least 150 words and 600 questions, and every validator rule', () => {
  assert.deepEqual(validateContent(content, 'full'), []);
  assert.deepEqual(validateContent(content, 'opening'), []);
  assert.deepEqual(content.regions.map(r => r.id), ['r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'r8']);
  assert.ok(content.words.length >= 150);
  assert.ok(content.questions.length >= 600);
});

test('the floors still reject real data with a piece missing', () => {
  fails(d => { d.regions.pop(); }, /8 regions/);
  fails(d => { d.words.splice(4, 5); }, /150 words/);
  fails(d => { d.questions = d.questions.slice(0, 500); }, /600 questions/);
  const opening = plain();
  opening.regions[0].wordIds = opening.regions[0].wordIds.slice(0, 4);
  assert.ok(validateContent(opening, 'opening').some(e => /opening needs 8 to 10/.test(e)));
});

test('contextKey: every real contextual answer stays whole, and is proved against its source token', () => {
  const keyed = content.questions.filter(item => item.contextKey);
  assert.equal(keyed.length, 9);
  for (const item of keyed) {
    const answer = item.choices.find(c => item.acceptedAnswers.includes(c.id)).text;
    assert.equal(item.contextKey.answer, answer, `${item.id} keeps its full contextual English`);
  }
  assert.equal(q(content, 'H0854-in-context').contextKey.answer, 'with you');
  assert.equal(q(content, 'H0269-in-context').contextKey.answer, 'my sister');
});

test('contextKey: mutating real records is rejected, field by field', () => {
  const sister = 'H0269-in-context';
  fails(d => { delete q(d, sister).contextKey; }, /H0269-in-context.*meaning/);
  fails(d => { q(d, sister).contextKey.tokenId = 'zzzzz'; }, /H0269-in-context.*zzzzz|H0269-in-context.*token/);
  fails(d => { q(d, sister).contextKey.tokenId = q(d, 'H0854-in-context').contextKey.tokenId; }, /H0269-in-context.*contextKey.*lemma/);
  fails(d => { q(d, sister).contextKey.morph = 'Vqp3ms'; }, /H0269-in-context.*contextKey.*Vqp3ms/);
  fails(d => { q(d, sister).contextKey.morph = 'Sp1cs'.slice(0, 3); }, /H0269-in-context.*contextKey.*morph/);
  fails(d => { q(d, sister).contextKey.answer = 'my mother'; }, /H0269-in-context.*contextKey answer/);
  fails(d => { q(d, sister).contextKey.form = 'אָב'; }, /H0269-in-context.*contextKey form/);
  fails(d => { q(d, sister).contextKey.basis = ''; }, /H0269-in-context.*contextKey needs basis/);
  fails(d => { q(d, sister).contextKey.trustMe = true; }, /H0269-in-context.*contextKey field trustMe/);
  // The accepted option moves, so English that drops the suffix or swaps it can't pass.
  fails(d => { const item = q(d, sister); item.choices[0].text = 'his sister'; item.contextKey.answer = 'his sister'; }, /H0269-in-context.*suffix/);
  fails(d => { const item = q(d, sister); item.choices[0].text = 'my lord'; item.contextKey.answer = 'my lord'; }, /H0269-in-context.*sense/);
  fails(d => { q(d, sister).prompt = 'Abram asks Sarai to lie. Which meaning fits?'; }, /H0269-in-context.*prompt/);
  fails(d => { q(d, sister).templateId = 'tpl-gloss-choice'; }, /H0269-in-context/);
});

test('the two reading templates reject wrong keys on real records, and accept the real ones', () => {
  const sound = content.questions.find(item => item.templateId === 'tpl-read-sound');
  const pointed = content.questions.find(item => item.templateId === 'tpl-read-pointed');
  assert.ok(sound && pointed);
  const wrongOf = item => item.choices.find(c => !item.acceptedAnswers.includes(c.id)).id;
  fails(d => { q(d, sound.id).acceptedAnswers = [wrongOf(sound)]; }, new RegExp(`${sound.id}.*sound guide`));
  fails(d => { q(d, sound.id).displayHebrew = 'אָב'; }, new RegExp(`${sound.id}.*must show`));
  fails(d => { q(d, pointed.id).acceptedAnswers = [wrongOf(pointed)]; }, new RegExp(`${pointed.id}.*pointed form`));
  fails(d => { q(d, pointed.id).choices[1].text = 'אָב'; }, new RegExp(`${pointed.id}.*letters`));
  // An unknown template is never waved through just because it carries metadata.
  fails(d => { const item = q(d, sound.id); item.templateId = 'tpl-made-up'; delete item.key; }, new RegExp(`${sound.id}.*no answer-key rule`));
});

test('guided questions are never word evidence, and no independent pool asks them', () => {
  const guided = new Set(content.lessons.flatMap(l => l.guidedQuestionIds));
  assert.ok(guided.size >= 43);
  for (const id of guided) assert.equal(content.questionById.get(id).wordId, null, `${id} carries no word`);
  const independent = new Set([
    ...content.regions.flatMap(r => [...Object.values(r.puzzleQuestionIds).flat(), ...r.badge.questionIds]),
    ...content.passages.flatMap(p => p.questionIds),
  ]);
  for (const id of guided) assert.equal(independent.has(id), false, `${id} is guided only`);
});

test('every real word is eligible by the end of its own region, and no earlier', () => {
  const stuck = [];
  for (const region of content.regions) {
    const skills = stateThrough(region.id).skills;
    for (const id of region.wordIds) {
      const word = content.wordById.get(id);
      if (!word.requires.every(skill => skills[skill])) stuck.push(`${id} in ${region.id}`);
      for (const family of CAPTURE_FAMILIES) {
        const pool = content.questions.filter(item => item.wordId === id && item.taskFamily === family && item.requires.every(skill => skills[skill]));
        if (pool.length < 2) stuck.push(`${id} ${family}: ${pool.length} answerable in ${region.id}`);
        if (new Set(pool.map(item => item.semanticStemId)).size !== pool.length) stuck.push(`${id} ${family}: shared stem`);
      }
    }
  }
  assert.deepEqual(stuck, []);
  const homes = new Set(content.regions.flatMap(r => r.wordIds));
  assert.deepEqual(content.words.filter(w => !homes.has(w.id)).map(w => w.id), []);
});

test('encounters reach every word of a region and nothing beyond what it has taught', () => {
  for (const region of content.regions) {
    const s = stateThrough(region.id);
    Object.assign(s, { rng: 1 });
    setFlag(s, 'seedDone');
    // The region's first encounter is its seed word, and a player then leaves or captures it.
    startEncounter(s, content, region.seedWordId, 'capture', NOW);
    retreat(s, content, NOW);
    const seen = new Set();
    for (let i = 0; i < 6000 && seen.size < region.wordIds.length; i++) seen.add(chooseEncounter(s, content, region.id, NOW).wordId);
    assert.deepEqual(region.wordIds.filter(id => !seen.has(id)), [], `${region.id}: words the reeds never offer`);
    for (const id of seen) assert.ok(content.wordById.get(id).requires.every(skill => s.skills[skill]), `${id} leaked into ${region.id}`);
  }
});

test('every real word captures through production calls: a miss, a fresh retry, a leave and a return, always saved and reloaded', () => {
  const problems = [];
  for (const region of content.regions) {
    const s = stateThrough(region.id);
    for (const id of region.wordIds) {
      startEncounter(s, content, id, 'capture', NOW);
      completeStudy(s, id, NOW);
      const missed = openQuestion(s, content, CAPTURE_FAMILIES[0], NOW);
      if (!missed) { problems.push(`${id}: no first question`); continue; }
      const miss = submit(s, content, wrongAnswer(missed), NOW);
      if (miss.correct || !miss.explanation) problems.push(`${id}: a wrong answer was not explained`);
      retreat(s, content, NOW);
      startEncounter(s, content, id, 'capture', NOW);
      for (const family of CAPTURE_FAMILIES) {
        const question = openQuestion(s, content, family, NOW);
        if (!question) { problems.push(`${id}: no ${family} question after a miss`); break; }
        if (family === CAPTURE_FAMILIES[0] && question.semanticStemId === missed.semanticStemId) problems.push(`${id}: repeated the exposed stem`);
        const answer = question.format === 'type' && s.encounter.current.responseMode === 'recognition' ? question.recognitionAccepted[0] : rightAnswer(question);
        if (!submit(s, content, answer, NOW).independent) problems.push(`${question.id}: its own key was not independent credit`);
      }
      if (s.words[id].capturedAt == null) problems.push(`${id}: not captured`);
      if (!['Captured', 'Practiced'].includes(statusOf(s.words[id]))) problems.push(`${id}: status ${statusOf(s.words[id])}`);
    }
    const back = parseImport(exportText(s, NOW), content);
    if (!back.ok) problems.push(`${region.id}: save refused: ${back.errors.slice(0, 3).join(' | ')}`);
    else assert.deepEqual(back.state, s);
  }
  assert.deepEqual(problems, []);
});

test('every real key is accepted by the checker the player actually uses', () => {
  const wrong = [];
  for (const item of content.questions) {
    if (item.format === 'match') {
      if (!checkAnswer(item, item.pairs.map(pair => pair.right), 'typing').correct) wrong.push(item.id);
    } else if (item.format === 'type') {
      for (const answer of item.acceptedAnswers) if (!checkAnswer(item, answer, 'typing').correct) wrong.push(`${item.id} typed ${answer}`);
      if (!checkAnswer(item, item.recognitionAccepted[0], 'recognition').correct) wrong.push(`${item.id} recognition`);
    } else if (!checkAnswer(item, rightAnswer(item), 'recognition').correct) wrong.push(item.id);
  }
  assert.deepEqual(wrong, []);
});

test('every real quest target has a place in the world', () => {
  const missing = [];
  for (const region of content.regions) {
    const quest = content.questById.get(region.questId);
    const maps = REGION_MAPS[region.id];
    if (!maps) { missing.push(`${region.id}: no maps`); continue; }
    const outdoor = MAPS[maps.outdoor];
    if (!outdoor.rows.some(row => [...row].some(tile => ENCOUNTER_TILES.has(tile)))) missing.push(`${region.id}: nowhere to meet words`);
    if (region.id === 'r1') continue;
    const has = key => OBJECTS.some(o => o.id === key);
    for (const stage of quest.stages) {
      if (stage.kind === 'lesson' && !has(`${region.id}-mentor`)) missing.push(`${region.id}: no mentor`);
      if (stage.kind === 'duel' && !has(`${region.id}-keeper`)) missing.push(`${region.id}: no keeper`);
      if (stage.kind === 'reading' && !has(`${region.id}-lectern`)) missing.push(`${region.id}: no lectern`);
      if (stage.kind === 'puzzle') for (const target of stage.targetIds) {
        const [, group] = target.split(':');
        if (group === 'rival' && !has(`${region.id}-rival`)) missing.push(`${region.id}: no rival`);
        if (group === 'gate' && !has(`${region.id}-lock`)) missing.push(`${region.id}: no lock`);
      }
    }
    if (!outdoor.exitFront) missing.push(`${region.id}: no exit`);
  }
  assert.deepEqual(missing, []);
  assert.notEqual(currentStage(newGame(NOW, 1), content, 'q-grove'), null);
});

function bootReal() {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8').replace(/<script[^>]*><\/script>|<link[^>]*>/g, '');
  const { window } = new JSDOM(html, { url: 'http://localhost/', pretendToBeVisual: true });
  Object.assign(globalThis, { window, document: window.document, Element: window.Element });
  window.HTMLDialogElement.prototype.showModal = function showModal() { this.open = true; };
  window.HTMLDialogElement.prototype.close = function closeDialog() { this.open = false; };
  window.HTMLCanvasElement.prototype.getContext = () => new Proxy({}, { get: () => () => {}, set: () => true });
  const app = startApp({ storage: null, seed: 1, now: () => NOW, reducedMotion: true, content });
  window.document.querySelector('#slot-1').click();
  return { app, window };
}

function captureFully(s, id) {
  startEncounter(s, content, id, 'capture', NOW);
  completeStudy(s, id, NOW);
  for (const family of CAPTURE_FAMILIES) {
    const question = openQuestion(s, content, family, NOW);
    const answer = question.format === 'type' && s.encounter.current.responseMode === 'recognition' ? question.recognitionAccepted[0] : rightAnswer(question);
    submit(s, content, answer, NOW);
  }
}

test('a paradigm link is named as a paradigm: tracing it teaches that, and the three kept relationships stay as they were', () => {
  const s = stateThrough('r4');
  captureFully(s, 'H2088');
  const form = nextRelatedForm(s, content, 'H2088');
  assert.equal(form.hebrew, 'זֹאת');
  assert.equal(form.relationship, 'derivation', 'the reviewed record is unchanged');

  const wrong = answerRelatedForm(s, content, 'H2088', form.tokenId, 'derivation', NOW);
  assert.equal(wrong.correct, false, 'זֹאת is not a word built from זֶה');
  assert.match(wrong.explanation, /proximal demonstrative paradigm/);
  assert.doesNotMatch(wrong.explanation, /built from/);
  s.interactions += 5;
  assert.equal(answerRelatedForm(s, content, 'H2088', form.tokenId, 'paradigm', NOW).correct, true);

  // A plain derivation with no paradigm keeps its own answer.
  const scroll = stateThrough('r1');
  captureFully(scroll, 'H5612');
  const derived = nextRelatedForm(scroll, content, 'H5612');
  assert.equal(answerRelatedForm(scroll, content, 'H5612', derived.tokenId, 'paradigm', NOW).correct, false);
  scroll.interactions += 5;
  assert.equal(answerRelatedForm(scroll, content, 'H5612', derived.tokenId, 'derivation', NOW).correct, true);
});

test('the Worddex and the trace screen show the paradigm, and no lexeme count changes', () => {
  const { app, window } = bootReal();
  const $ = selector => window.document.querySelector(selector);
  const s = app.getState();
  for (const region of content.regions) {
    for (const id of region.lessonIds) markLessonDone(s, content, id, NOW);
    if (region.id === 'r4') break;
  }
  captureFully(s, 'H2088');
  app.ui.worddex();
  $('[data-word="H2088"]').click();
  assert.match($('#entry-forms').textContent, /proximal demonstrative paradigm/);
  assert.doesNotMatch($('#entry-forms').textContent, /derivation/);
  $('#btn-trace-form').click();
  assert.ok($('[data-relationship="paradigm"]'), 'the honest answer is on offer');
  $('[data-relationship="paradigm"]').click();
  assert.match($('#feedback-verdict').textContent, /Correct/);
  assert.equal(content.words.filter(w => w.relatedForms.some(f => f.features?.paradigm)).length, 3);
});

test('real mixed Hebrew and English guide labels render through the shared isolating renderer', () => {
  const { app, window } = bootReal();
  const lesson = content.lessons.find(l => l.guidedQuestionIds.includes('g-context-reading'));
  assert.ok(lesson, 'the reviewed guide is on a lesson');
  const s = app.getState();
  for (const region of content.regions) {
    for (const id of region.lessonIds) if (id !== lesson.id) markLessonDone(s, content, id, NOW);
    if (region.lessonIds.includes(lesson.id)) break;
  }
  app.ui.lesson(lesson.id, () => {});
  for (let guard = 0; guard < 20 && window.document.querySelector('#btn-next'); guard++) window.document.querySelector('#btn-next').click();
  for (let guard = 0; guard < 20; guard++) {
    if (window.document.querySelector('#question-prompt')?.textContent === content.questionById.get('g-context-reading').prompt) break;
    const asked = content.questions.find(item => item.prompt === window.document.querySelector('#question-prompt')?.textContent);
    assert.ok(asked, 'a guide is on screen');
    window.document.querySelector(`[data-choice="${asked.acceptedAnswers[0]}"]`).click();
    window.document.querySelector('#btn-continue').click();
  }
  const guide = content.questionById.get('g-context-reading');
  const labelled = guide.choices.filter(c => /[֐-׿]/.test(c.text) && /[A-Za-z]/.test(c.text));
  assert.ok(labelled.length >= 2, 'this guide really has mixed labels');
  for (const choice of labelled) {
    const node = window.document.querySelector(`[data-choice="${choice.id}"]`);
    const isolate = node.querySelector('bdi[lang="he"][dir="rtl"]');
    assert.ok(isolate, `${choice.text} isolates its Hebrew`);
    assert.doesNotMatch(isolate.textContent, /[A-Za-z]/);
    assert.match(node.textContent, /[A-Za-z]/);
  }
});

test('a save of the real corpus still fits and stays quick to check', () => {
  const s = stateThrough('r8');
  for (const id of content.regions.flatMap(r => r.wordIds)) {
    startEncounter(s, content, id, 'capture', NOW);
    completeStudy(s, id, NOW);
    for (const family of CAPTURE_FAMILIES) {
      const question = openQuestion(s, content, family, NOW);
      const answer = question.format === 'type' && s.encounter.current.responseMode === 'recognition' ? question.recognitionAccepted[0] : rightAnswer(question);
      submit(s, content, answer, NOW);
    }
  }
  assert.equal(Object.values(s.words).filter(r => r.capturedAt != null).length, content.words.length);
  const data = new Map();
  const store = { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)), removeItem: k => data.delete(k) };
  assert.equal(saveSlot(store, 1, s, content).ok, true);
  const started = performance.now();
  assert.equal(loadSlot(store, 1, content).status, 'ok');
  assert.ok(performance.now() - started < 100, `reading the save took ${performance.now() - started} ms`);
  assert.ok(buildContent(plain()).wordById.size === content.words.length);
});
