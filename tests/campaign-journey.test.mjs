// Drives the real UI code under jsdom, with key presses and clicks only and no state edits.
// LIMITS: r2..r8 here are the labeled synthetic fixture, so this proves the game code carries
// data of the shared-contract shape from start to finish. It is NOT proof of the real campaign,
// which stays blocked on content integration. Pixels, fonts and real touch still need a browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { campaignFixture, openingOnly } from './fixtures/campaign-fixture.mjs';
import { MAPS, OBJECTS, REGION_MAPS, ENCOUNTER_TILES } from '../src/world.js';
import { currentStage, destination, tileAt, isDone, newGame, markLessonDone } from '../src/engine.js';
import { DAY, startEncounter, completeStudy, openQuestion, submit, CAPTURE_FAMILIES, statusOf, addToParty } from '../src/learning.js';
import { startBadgeRun, openBadgeQuestion, submitBadgeAnswer } from '../src/checkpoints.js';
import { parseImport, slotKey, saveSlot, exportText } from '../src/storage.js';
import { startApp } from '../src/app.js';

const content = campaignFixture();
const realContent = openingOnly();
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8').replace(/<script[^>]*><\/script>|<link[^>]*>/g, '');
const fakeContext = new Proxy({}, { get: () => () => {}, set: () => true });
const T0 = Date.UTC(2027, 0, 4, 12);

// Every single write the game makes must be something the importer accepts.
function checkedStorage(data, initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    writes: 0,
    map,
    getItem: k => map.get(k) ?? null,
    setItem(k, v) {
      if (k.includes(':slot:')) {
        this.writes += 1;
        const back = parseImport(v, data);
        assert.equal(back.ok, true, `autosave ${this.writes} must reload: ${back.errors?.join(' | ')}`);
      }
      map.set(k, String(v));
    },
    removeItem: k => map.delete(k),
  };
}

function boot({ storage = checkedStorage(content), seed = 11, clock = { t: T0 }, data = content } = {}) {
  const dom = new JSDOM(html, { url: 'http://localhost/', pretendToBeVisual: true });
  const { window } = dom;
  Object.assign(globalThis, { window, document: window.document, Element: window.Element });
  window.HTMLDialogElement.prototype.showModal = function showModal() { this.open = true; };
  window.HTMLDialogElement.prototype.close = function closeDialog() { this.open = false; };
  window.HTMLCanvasElement.prototype.getContext = () => fakeContext;
  const app = startApp({ storage, seed, now: () => clock.t, reducedMotion: true, content: data });
  const $ = selector => window.document.querySelector(selector);
  // jsdom turns a throw in a handler into a window event, so without this a crash could pass as a quiet no-op.
  const crashes = [];
  window.addEventListener('error', event => crashes.push(event.message));
  const click = selector => {
    const node = $(selector);
    assert.ok(node, `missing ${selector}: ${$('#modal').textContent.slice(0, 200)}`);
    assert.notEqual(node.getAttribute('aria-disabled'), 'true', `${selector} is disabled`);
    node.click();
    assert.deepEqual(crashes, [], `clicking ${selector}`);
  };
  const press = key => {
    window.document.getElementById('game-canvas').dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true }));
    app.tick(0);
    window.dispatchEvent(new window.KeyboardEvent('keyup', { key }));
    assert.deepEqual(crashes, [], `pressing ${key}`);
  };
  const escape = () => $('#modal').dispatchEvent(new window.Event('cancel', { cancelable: true }));
  return { app, $, click, press, escape, window, storage, clock, data, state: () => app.getState() };
}

const KEYS = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };
const VECTORS = [['up', 0, -1], ['down', 0, 1], ['left', -1, 0], ['right', 1, 0]];

function route(state, goal) {
  const queue = [[state.map, state.x, state.y]];
  const from = new Map([[`${state.map}:${state.x},${state.y}`, null]]);
  while (queue.length) {
    const [map, x, y] = queue.shift();
    if (map === goal.map && x === goal.x && y === goal.y) {
      const dirs = [];
      for (let key = `${map}:${x},${y}`; from.get(key); key = from.get(key).prev) dirs.unshift(from.get(key).dir);
      return dirs;
    }
    for (const [dir, dx, dy] of VECTORS) {
      const dest = destination(state, map, x + dx, y + dy);
      if (!dest) continue;
      const key = `${dest.map}:${dest.x},${dest.y}`;
      if (!from.has(key)) { from.set(key, { prev: `${map}:${x},${y}`, dir }); queue.push([dest.map, dest.x, dest.y]); }
    }
  }
  return null;
}

function walkTo(g, goal) {
  for (let guard = 0; guard < 600; guard++) {
    const s = g.state();
    if (s.map === goal.map && s.x === goal.x && s.y === goal.y) return;
    const dirs = route(s, goal);
    assert.ok(dirs, `no route from ${s.map}:${s.x},${s.y} to ${JSON.stringify(goal)}`);
    g.press(KEYS[dirs[0]]);
    if (g.$('#modal').open) solveScreens(g);
  }
  assert.fail('walk did not finish');
}

function answer(g, question) {
  if (question.format === 'tokens') {
    for (const id of question.acceptedSequences[0]) g.click(`[data-token="${id}"]`);
    g.click('#btn-check');
  } else if (g.$('[data-pair]')) {
    question.pairs.forEach((pair, i) => g.$(`[data-pair="${i}"] [data-right="${CSS_ESCAPE(pair.right)}"]`).click());
    g.click('#btn-check');
  } else if (g.$('#answer-input')) {
    g.$('#answer-input').value = question.acceptedAnswers[0];
    g.click('#btn-check');
  } else {
    g.click(`[data-choice="${(question.format === 'type' ? question.recognitionAccepted : question.acceptedAnswers ?? question.recognitionAccepted)[0]}"]`);
  }
}
const CSS_ESCAPE = text => text;

function finishLesson(g) {
  for (let guard = 0; guard < 40; guard++) {
    if (g.$('#btn-next')) { g.click('#btn-next'); continue; }
    if (g.$('#feedback-verdict')) { g.click('#btn-continue'); continue; }
    const asked = g.$('#question-prompt')?.textContent;
    if (asked) {
      const q = g.data.questions.find(item => item.prompt === asked);
      answer(g, q);
      continue;
    }
    return;
  }
  assert.fail('lesson did not finish');
}

// Works through whatever screen is open by answering honestly, until the game returns to the world.
function solveScreens(g) {
  for (let guard = 0; guard < 80 && g.$('#modal').open; guard++) {
    const s = g.state();
    if (s.encounter) {
      if (s.encounter.current) { answer(g, g.data.questionById.get(s.encounter.current.questionId)); continue; }
      if (g.$('#btn-card-done')) { g.click('#btn-card-done'); continue; }
      if (g.$('#feedback-verdict') || g.$('#capture-title')) { g.click('#btn-continue'); continue; }
      if (g.$('#btn-next') || g.$('#question-prompt')) { finishLesson(g); continue; }
      if (s.words[s.encounter.wordId].studiedAt == null) { g.click('#cmd-study'); continue; }
      if (s.encounter.kind !== 'capture') { g.click('#cmd-retreat'); continue; }
      const open = ['read', 'understand', 'inscribe'].find(id => g.$(`#cmd-${id}`).getAttribute('aria-disabled') !== 'true');
      if (!open) { g.click('#cmd-retreat'); continue; }
      g.click(`#cmd-${open}`);
      continue;
    }
    if (g.$('#btn-continue')) { g.click('#btn-continue'); continue; }
    return;
  }
}

function approach(g, id) {
  const object = OBJECTS.find(o => o.id === id);
  const s = g.state();
  const x = object.movedTo && isDone(s, object.movedTo.flag) ? object.movedTo.x : object.x;
  const y = object.movedTo && isDone(s, object.movedTo.flag) ? object.movedTo.y : object.y;
  for (const [dir, dx, dy] of VECTORS) {
    const spot = { map: object.map, x: x - dx, y: y - dy };
    if (!destination(s, spot.map, spot.x, spot.y) || MAPS[spot.map].warps?.[`${spot.x},${spot.y}`] || !route(s, spot)) continue;
    walkTo(g, spot);
    g.press(KEYS[dir]);
    g.press('Enter');
    return;
  }
  assert.fail(`no way to reach ${id}`);
}

function reedSpots(g) {
  const s = g.state();
  const { map } = s;
  const spots = [];
  MAPS[map].rows.forEach((row, y) => [...row].forEach((tile, x) => {
    if (ENCOUNTER_TILES.has(tile) && route(s, { map, x, y })) spots.push({ map, x, y });
  }));
  assert.ok(spots.length >= 2, `${map} has walkable encounter ground`);
  return spots;
}

function walkReedsUntil(g, done) {
  const spots = reedSpots(g);
  for (let guard = 0; guard < 500 && !done(); guard++) walkTo(g, spots[guard % 2 === 0 ? 0 : spots.length - 1]);
  assert.ok(done(), 'walking the encounter ground reached the goal');
}

const startNew = g => {
  g.click('#slot-1');
  g.click('#btn-continue');
  g.click('#btn-continue');
};

function exitRegion(g, regionId) {
  const set = REGION_MAPS[regionId];
  const spot = MAPS[set.outdoor].exitFront;
  walkTo(g, { map: set.outdoor, ...spot });
  const [dir] = VECTORS.find(([, dx, dy]) => tileAt(set.outdoor, spot.x + dx, spot.y + dy) === 'X');
  g.press(KEYS[dir]);
  assert.ok(g.$('#dialogue-text'), `${regionId}: the exit says something`);
  solveScreens(g);
  return dir;
}

function solveGate(g, key) {
  for (let guard = 0; guard < 30 && !isDone(g.state(), key); guard++) {
    if (g.state().attempt) { answer(g, g.data.questionById.get(g.state().attempt.questionId)); continue; }
    if (g.$('#feedback-verdict') || g.$('#btn-continue')) { g.click('#btn-continue'); continue; }
    if (g.$('#btn-next')) { g.click('#btn-next'); continue; }
    assert.fail(`stuck on ${key}: ${g.$('#modal').textContent.slice(0, 200)}`);
  }
  assert.ok(isDone(g.state(), key), key);
  solveScreens(g);
}

function playStage(g, region, stage) {
  const id = region.id;
  if (stage.kind === 'lesson') {
    approach(g, `${id}-mentor`);
    assert.match(g.$('.speaker').textContent, new RegExp(`Mentor ${id}`));
    g.click('#btn-continue');
    finishLesson(g);
    solveScreens(g);
  } else if (stage.kind === 'capture') {
    walkTo(g, { map: REGION_MAPS[id].outdoor, x: MAPS[REGION_MAPS[id].outdoor].arrive.x, y: MAPS[REGION_MAPS[id].outdoor].arrive.y });
    walkReedsUntil(g, () => currentStage(g.state(), content, region.questId) !== stage);
  } else if (stage.targetIds[0] === `${id}:rival`) {
    approach(g, `${id}-rival`);
    g.click('#btn-continue');
    solveGate(g, `${id}:rival`);
  } else if (stage.targetIds[0] === `${id}:gate`) {
    approach(g, `${id}-lock`);
    g.click('#btn-continue');
    solveGate(g, `${id}:gate`);
  } else if (stage.kind === 'reading') {
    approach(g, `${id}-lectern`);
    g.click('#btn-continue');
    assert.ok(g.$('#reading-text bdi[lang="he"]'), 'the text is shown first');
    assert.equal(g.$('#passage-translation'), null, 'no translation before the reading questions');
    g.click('#btn-next');
    solveGate(g, `read:${stage.targetIds[0]}`);
  } else if (stage.kind === 'duel') {
    approach(g, `${id}-keeper`);
    g.click('#btn-continue');
    for (let guard = 0; guard < 25 && !g.$('#badge-title'); guard++) {
      answer(g, g.data.questionById.get(g.state().badgeRun.current.questionId));
      g.click('#btn-continue');
    }
    assert.ok(g.$('#badge-title'));
    assert.match(g.$('#badge-title').textContent, /Fixture Seal/);
    solveScreens(g);
  } else if (stage.kind === 'exit') {
    exitRegion(g, id);
  } else {
    assert.fail(`unplayed stage ${stage.id}`);
  }
}

function playR1(g) {
  // The real, accepted first region, through the same generic harness.
  const quest = 'q-grove';
  for (let guard = 0; guard < 20; guard++) {
    const stage = currentStage(g.state(), content, quest);
    if (!stage) return;
    const s = g.state();
    if (stage.id === 'find-tamar' || stage.id === 'finals') {
      approach(g, 'tamar');
      g.click('#btn-continue');
      if (stage.id === 'find-tamar') g.click('#btn-continue');
      finishLesson(g);
      solveScreens(g);
    } else if (stage.kind === 'capture') {
      walkTo(g, { map: 'grove', x: 28, y: 20 });
      g.press('ArrowRight');
      if (g.$('#modal').open) solveScreens(g);
      walkReedsUntil(g, () => currentStage(g.state(), content, quest) !== stage);
    } else if (stage.id === 'neri') {
      approach(g, 'neri');
      g.click('#btn-continue');
      answer(g, g.data.questionById.get(s.puzzleIndex && g.data.regionById.get('r1').puzzleQuestionIds.neri[g.state().puzzleIndex.neri]));
      solveScreens(g);
    } else if (stage.id === 'gate') {
      const q = g.data.questionById.get(g.data.regionById.get('r1').puzzleQuestionIds.gate[g.state().puzzleIndex.gate]);
      const doorX = { 'door-w': 15, 'door-m': 17, 'door-e': 19 }[q.acceptedAnswers[0]];
      walkTo(g, { map: 'grove', x: doorX, y: 10 });
      g.press('ArrowUp');
      g.press('Enter');
      g.click('#btn-push');
      solveScreens(g);
    } else if (stage.id === 'badge') {
      approach(g, 'ilana');
      g.click('#btn-continue');
      for (let i = 0; i < 12 && !g.$('#badge-title'); i++) {
        answer(g, g.data.questionById.get(g.state().badgeRun.current.questionId));
        g.click('#btn-continue');
      }
      solveScreens(g);
    } else if (stage.id === 'exit') {
      exitRegion(g, 'r1');
    }
  }
}

test('FIXTURE campaign: real r1 and synthetic r2..r8 play through to the ending and the garden, by input alone', { timeout: 300000 }, () => {
  let g = boot();
  startNew(g);
  playR1(g);
  assert.ok(g.state().badges['b-reed-seal']);
  assert.equal(g.state().flags.exitOpened, true);

  for (const region of content.regions.slice(1)) {
    // Each region is reached on foot by walking through the previous one's exit.
    const previous = content.regions[content.regions.indexOf(region) - 1].id;
    const set = REGION_MAPS[previous];
    const spot = MAPS[set.outdoor].exitFront;
    walkTo(g, { map: set.outdoor, ...spot });
    const [dir] = VECTORS.find(([, dx, dy]) => tileAt(set.outdoor, spot.x + dx, spot.y + dy) === 'X');
    g.press(KEYS[dir]);
    assert.equal(g.state().map, REGION_MAPS[region.id].outdoor, `walked into ${region.id}`);
    assert.match(g.$('#dialogue-text').textContent, new RegExp(region.theme));
    solveScreens(g);
    assert.equal(g.$('#place').textContent, region.title);

    for (let guard = 0; guard < 15; guard++) {
      const stage = currentStage(g.state(), content, region.questId);
      if (!stage) break;
      assert.equal(g.$('#objective').textContent, stage.text);
      playStage(g, region, stage);
    }
    assert.equal(currentStage(g.state(), content, region.questId), null, `${region.id} quest finishes`);

    // A full reload at each region boundary restores exactly the same game.
    const saved = structuredClone(g.state());
    const reloaded = boot({ storage: g.storage, clock: g.clock });
    reloaded.click('#slot-1');
    assert.deepEqual(reloaded.state(), saved, `${region.id} reload`);
    g = reloaded;
  }

  // Into the archive, then the ending.
  const front = MAPS.ruins.exitFront;
  walkTo(g, { map: 'ruins', ...front });
  g.press('ArrowUp');
  assert.equal(g.state().map, 'archive');
  solveScreens(g);
  assert.match(g.$('#objective').textContent, /reading desk/);
  assert.equal(route(g.state(), { map: 'garden', x: 11, y: 13 }), null, 'the garden stays shut before the ending');
  approach(g, 'restoration');
  g.click('#btn-continue');
  assert.match(g.$('#ending-title').textContent, /archive/i);
  assert.match(g.$('#modal').textContent, /8 of 8/);
  assert.doesNotMatch(g.$('#modal').textContent, /fluent|master(ed)? hebrew/i, 'the ending makes no claim of fluency');
  for (let guard = 0; guard < 6 && g.$('#modal').open; guard++) g.click('#btn-continue');
  assert.ok(g.state().endingAt);
  assert.match(g.$('#objective').textContent, /Review Garden/);

  // Postgame: the garden door, its keeper and its beds.
  walkTo(g, { map: 'garden', x: 11, y: 13 });
  assert.equal(g.$('#place').textContent, 'The Review Garden');
  approach(g, 'gardener');
  assert.match(g.$('#dialogue-text').textContent, /tending/);
  solveScreens(g);

  // A day later the beds bring back words that are due, and a review counts.
  g.clock.t += DAY + 1;
  const reviewsBefore = Object.values(g.state().words).reduce((sum, r) => sum + r.reviewTotal, 0);
  const spots = reedSpots(g);
  for (let guard = 0; guard < 500; guard++) {
    walkTo(g, spots[guard % 2 === 0 ? 0 : spots.length - 1]);
    if (Object.values(g.state().words).reduce((sum, r) => sum + r.reviewTotal, 0) > reviewsBefore) break;
  }
  assert.ok(Object.values(g.state().words).reduce((sum, r) => sum + r.reviewTotal, 0) > reviewsBefore, 'a garden review was finalized');
  assert.ok(Object.values(g.state().words).some(r => statusOf(r) === 'Practiced'));

  // The finished game saves and reloads exactly, and no word was ever granted.
  const saved = structuredClone(g.state());
  const again = boot({ storage: g.storage, clock: g.clock });
  assert.match(again.$('#slots').textContent, /8 seals earned/);
  again.click('#slot-1');
  assert.deepEqual(again.state(), saved);
  assert.ok(g.storage.writes > 200, `${g.storage.writes} autosaves were each proven readable`);
});

test('a real opening save from the accepted build continues in the new UI, finishes the trial and autosaves as v2', () => {
  const text = readFileSync(new URL('./fixtures/opening-v1-partial-trial.json', import.meta.url), 'utf8');
  const storage = checkedStorage(realContent, { [slotKey(1)]: text });
  const clock = { t: 1793959950000 };
  const g = boot({ storage, data: realContent, clock });
  assert.match(g.$('#slots').textContent, /Hall of Letters, 3 words captured/);
  assert.equal(storage.getItem(slotKey(1)), text, 'showing the title writes nothing');
  g.click('#slot-1');
  assert.equal(JSON.parse(storage.getItem(slotKey(1))).version, 2);
  g.press('Enter');
  g.click('#btn-continue');
  assert.equal(g.state().badgeRun.current.questionId, 'b-spell-2', 'the same pending question resumes');
  answer(g, realContent.questionById.get('b-spell-2'));
  assert.match(g.$('#feedback-verdict').textContent, /Correct/);
  g.click('#btn-continue');
  assert.match(g.$('#badge-title').textContent, /Reed Seal/);
  g.click('#btn-continue');
  assert.match(g.$('#objective').textContent, /arch/);

  // With only the real r1 data, the arch stays honest about where the game stops.
  walkTo(g, { map: 'grove', x: 27, y: 1 });
  g.press('ArrowUp');
  assert.match(g.$('#dialogue-text').textContent, /Vowel Springs/);
  solveScreens(g);
  assert.match(g.$('#objective').textContent, /build ends here/);
  g.press('ArrowUp');
  assert.equal(g.state().map, 'grove', 'no later map opens without its data');
});

// Helpers that build a legal r2 state through production functions, for screens tested on their own.
const right = q => (q.format === 'tokens' ? q.acceptedSequences[0] : q.format === 'match' ? q.pairs.map(p => p.right) : q.acceptedAnswers[0]);
function r2State({ lessons = 2, captures = 3 } = {}) {
  const r2 = content.regionById.get('r2');
  const s = newGame(T0, 5);
  for (const id of ['l-letters', 'l-meaning', 'l-finals']) markLessonDone(s, content, id, T0);
  const capture = id => {
    startEncounter(s, content, id, 'capture', T0);
    completeStudy(s, id, T0);
    for (const family of CAPTURE_FAMILIES) submit(s, content, right(openQuestion(s, content, family, T0)), T0);
  };
  for (const w of content.regionById.get('r1').wordIds.slice(0, 3)) capture(w);
  Object.assign(s.flags, { seedDone: true, neriCleared: true, gateOpen: true, doorOpen: 'door-m' });
  startBadgeRun(s, content, 'r1', T0);
  for (let q; (q = openBadgeQuestion(s, content, T0));) if (submitBadgeAnswer(s, content, right(q), T0).awarded) break;
  s.flags.exitOpened = true;
  for (const id of r2.lessonIds.slice(0, lessons)) markLessonDone(s, content, id, T0);
  for (const w of r2.wordIds.slice(0, captures)) capture(w);
  Object.assign(s, { map: 'springs', ...MAPS.springs.arrive, dir: 'up' });
  return s;
}
const bootAt = (s, clock = { t: T0 }) => {
  const storage = checkedStorage(content);
  saveSlot(storage, 1, s, content);
  const g = boot({ storage, clock });
  g.click('#slot-1');
  return g;
};
const r2Word = i => content.regionById.get('r2').wordIds[i];

test('Analyze and Build show on the command menu only once taught, and play their own task types', () => {
  const before = r2State({ lessons: 1, captures: 0 });
  startEncounter(before, content, r2Word(0), 'capture', T0);
  let g = bootAt(before);
  g.click('#cmd-study');
  g.click('#btn-card-done');
  assert.equal(g.$('#cmd-analyze'), null);
  assert.equal(g.$('#cmd-build'), null);

  const after = r2State({ lessons: 2, captures: 1 });
  startEncounter(after, content, r2Word(0), 'practice', T0);
  g = bootAt(after);
  g.click('#cmd-analyze');
  assert.match(g.$('#question-prompt').textContent, /Fixture/);
  const q = content.questionById.get(g.state().encounter.current.questionId);
  assert.equal(q.command, 'analyze');
  g.click('[data-choice="c0"]');
  g.click('#btn-continue');
  g.click('#cmd-build');
  assert.ok(g.$('[data-token]'));
  const built = content.questionById.get(g.state().encounter.current.questionId);
  for (const id of built.acceptedSequences[0]) g.click(`[data-token="${id}"]`);
  g.click('#btn-check');
  assert.match(g.$('#feedback-verdict').textContent, /Correct/);
});

test('match questions play on real controls, by keyboard or touch, with a wrong pairing explained', () => {
  const s = r2State();
  s.gates['r2:rival'] = { at: T0, questionIds: content.regionById.get('r2').puzzleQuestionIds.neri.slice(0, 2) };
  s.gates['r2:gate'] = { at: T0, questionIds: [content.regionById.get('r2').puzzleQuestionIds.gate[0]] };
  s.gates['read:pfx-r2'] = { at: T0, questionIds: content.passageById.get('pfx-r2').questionIds.slice(0, 2) };
  Object.assign(s, { map: REGION_MAPS.r2.hall, x: 5, y: 3, dir: 'up' });
  // A saved trial paused on the match item. The importer has to accept it for this to boot.
  startBadgeRun(s, content, 'r2', T0);
  s.badgeRun.correct = ['bfx-r2-0', 'bfx-r2-1'];
  s.badgeRun.current = { questionId: 'bfx-r2-3', hintsUsed: 0, startedAt: T0, responseMode: 'typing' };
  const g = bootAt(s);
  g.press('Enter');
  g.click('#btn-continue');
  const rows = [...g.window.document.querySelectorAll('[data-pair]')];
  assert.equal(rows.length, 3);
  assert.ok(rows[0].querySelector('bdi[lang="he"]'), 'the left side is isolated Hebrew');
  assert.equal(rows[0].querySelectorAll('button').length, 2, 'each row offers the distinct right sides');
  g.click('#btn-check');
  assert.ok(g.$('#pair-note'), 'an incomplete pairing asks for the rest, with no penalty');
  const pick = (row, right) => g.$(`[data-pair="${row}"] [data-right="${right}"]`).click();
  pick(0, 'fxgroup one');
  assert.equal(g.$('[data-pair="0"] [data-right="fxgroup one"]').getAttribute('aria-pressed'), 'true');
  pick(0, 'fxgroup two');
  assert.equal(g.$('[data-pair="0"] [data-right="fxgroup one"]').getAttribute('aria-pressed'), 'false', 'a row can change its mind');
  pick(1, 'fxgroup two');
  pick(2, 'fxgroup one');
  g.click('#btn-check');
  assert.match(g.$('#feedback-verdict').textContent, /Not this time/);
  assert.ok(g.$('#feedback-text').textContent.length > 5);
});

test('a duel hint survives leaving, reloading and mode changes, and cannot clear the duel', () => {
  const s = r2State();
  let g = bootAt(s);
  approach(g, 'r2-rival');
  g.click('#btn-continue');
  const asked = g.state().attempt.questionId;
  g.click('#btn-hint');
  assert.ok(g.$('#hint-text'));
  g.click('#btn-back');
  assert.equal(g.$('#modal').open, false);
  assert.equal(g.state().attempt.hintsUsed, 1);

  const reloaded = boot({ storage: g.storage, clock: g.clock });
  reloaded.click('#slot-1');
  assert.equal(reloaded.state().attempt.hintsUsed, 1);
  reloaded.press('Enter');
  reloaded.click('#btn-continue');
  assert.ok(reloaded.$('#hint-text'), 'the hint already paid for stays visible');
  assert.equal(reloaded.$('#btn-hint'), null);
  assert.equal(reloaded.state().attempt.questionId, asked);
  answer(reloaded, content.questionById.get(asked));
  assert.match(reloaded.$('#feedback-verdict').textContent, /with help/);
  assert.equal(isDone(reloaded.state(), 'r2:rival'), false);
  reloaded.click('#btn-continue');
  assert.notEqual(reloaded.state().attempt.questionId, asked, 'a fresh question follows');
});

test('a wrong gate answer explains and offers a fresh eligible next attempt, with exhaustion recoverable', () => {
  const s = r2State();
  s.gates['r2:rival'] = { at: T0, questionIds: content.regionById.get('r2').puzzleQuestionIds.neri.slice(0, 2) };
  const g = bootAt(s);
  approach(g, 'r2-lock');
  g.click('#btn-continue');
  const seen = new Set();
  for (let guard = 0; guard < 8 && g.state().attempt; guard++) {
    seen.add(g.state().attempt.questionId);
    const q = content.questionById.get(g.state().attempt.questionId);
    if (q.format === 'door' || q.format === 'choice') g.click(`[data-choice="${q.choices.find(c => !q.acceptedAnswers.includes(c.id)).id}"]`);
    assert.match(g.$('#feedback-verdict').textContent, /Not this time/);
    g.click('#btn-continue');
  }
  assert.equal(seen.size, 4, 'every question was a new one');
  assert.match(g.$('#dialogue-text').textContent, /fresh/);
  g.click('#btn-continue');
  assert.equal(isDone(g.state(), 'r2:gate'), false);
  // Talking elsewhere counts as exploring, and the questions return.
  g.press('Enter');
  g.click('#btn-continue');
  assert.ok(g.$('#modal').open);
  solveScreens(g);
});

test('abilities: the seal needs a grown party word and a real answer, and it opens the cave shortcut', () => {
  const s = r2State();
  s.gates['r2:rival'] = { at: T0, questionIds: content.regionById.get('r2').puzzleQuestionIds.neri.slice(0, 2) };
  s.gates['r2:gate'] = { at: T0, questionIds: [content.regionById.get('r2').puzzleQuestionIds.gate[0]] };
  const id = r2Word(0);
  const g = bootAt(s);
  approach(g, 'r2-ward');
  g.click('#btn-continue');
  assert.match(g.$('#ward-empty').textContent, /grow/i, 'it says what to do when no word qualifies');
  g.click('#btn-back');

  // Practice from the Worddex: the entry just shown costs the first answer, then two different tasks grow the word.
  addToParty(g.state(), id);
  g.click('#btn-worddex');
  g.click(`[data-word="${id}"]`);
  assert.match(g.$('#entry-rank').textContent, /Known/);
  g.click('#btn-practice');
  for (const [command, helped] of [['read', true], ['analyze', false], ['build', false]]) {
    g.click(`#cmd-${command}`);
    answer(g, content.questionById.get(g.state().encounter.current.questionId));
    assert.match(g.$('#feedback-verdict').textContent, helped ? /with help/ : /Correct\./);
    g.click('#btn-continue');
  }
  assert.equal(g.state().words[id].xp, 2, 'the helped answer earned no XP');
  g.click('#cmd-retreat');
  g.click('#btn-worddex');
  g.click(`[data-word="${id}"]`);
  assert.match(g.$('#entry-rank').textContent, /Familiar/);
  assert.match(g.$('#entry-rank').textContent, /doesn't change the word|the word itself/i);
  assert.ok(g.$('#entry-unlocked li'), 'the grown word opens more attested lines');
  g.click('#btn-back');
  g.click('#btn-back');

  // That entry was just read, so the seal's first question can't count. A fresh one can.
  g.press('Enter');
  g.click('#btn-continue');
  g.click(`[data-ward-word="${id}"]`);
  assert.equal(g.state().attempt.hintsUsed, 1);
  answer(g, content.questionById.get(g.state().attempt.questionId));
  assert.match(g.$('#feedback-verdict').textContent, /with help/);
  assert.equal(isDone(g.state(), 'r2:ward'), false);
  g.click('#btn-continue');
  g.click(`[data-ward-word="${id}"]`);
  answer(g, content.questionById.get(g.state().attempt.questionId));
  assert.match(g.$('#feedback-verdict').textContent, /Correct\./);
  solveScreens(g);
  assert.deepEqual(Object.keys(g.state().gates).includes('r2:ward'), true);
  assert.ok(route(g.state(), { map: REGION_MAPS.r2.cave, ...MAPS[REGION_MAPS.r2.cave].shortcutFront }), 'the shortcut is open');

  approach(g, 'r2-secret');
  assert.match(g.$('#dialogue-text').textContent, /archive/);
  solveScreens(g);
  assert.ok(isDone(g.state(), 'r2:secret'));
});

test('opening the Worddex over a pending seal question: help sticks through reload and mode, and opens nothing', () => {
  const s = r2State();
  s.gates['r2:rival'] = { at: T0, questionIds: content.regionById.get('r2').puzzleQuestionIds.neri.slice(0, 2) };
  s.gates['r2:gate'] = { at: T0, questionIds: [content.regionById.get('r2').puzzleQuestionIds.gate[0]] };
  const id = r2Word(0);
  addToParty(s, id);
  for (const family of ['fx-analyze', 'fx-build']) {
    startEncounter(s, content, id, 'practice', T0);
    submit(s, content, right(openQuestion(s, content, family, T0)), T0);
    s.encounter = null;
  }
  const g = bootAt(s);
  approach(g, 'r2-ward');
  g.click('#btn-continue');
  g.click(`[data-ward-word="${id}"]`);
  assert.equal(g.state().attempt.hintsUsed, 0);
  const asked = g.state().attempt.questionId;
  g.click('#btn-back');
  g.click('#btn-worddex');
  assert.equal(g.state().attempt.hintsUsed, 1);
  assert.match(g.$('#dex-peek').textContent, /won't count/);
  g.click('#btn-back');
  const again = boot({ storage: g.storage, clock: g.clock });
  again.click('#slot-1');
  assert.equal(again.state().attempt.hintsUsed, 1, 'a reload does not forgive it');
  again.press('Enter');
  again.click('#btn-continue');
  again.click(`[data-ward-word="${id}"]`);
  assert.equal(again.state().attempt.questionId, asked, 'the same question resumes');
  answer(again, content.questionById.get(asked));
  assert.match(again.$('#feedback-verdict').textContent, /with help/);
  assert.equal(isDone(again.state(), 'r2:ward'), false);
});

test('opening the Worddex over a pending duel or trial: help sticks, no credit, and a fresh question can still clear it', () => {
  const s = r2State();
  const g = bootAt(s);
  approach(g, 'r2-rival');
  g.click('#btn-continue');
  const asked = g.state().attempt.questionId;
  g.click('#btn-back');
  g.click('#btn-worddex');
  g.click('#btn-back');
  g.press('Enter');
  g.click('#btn-continue');
  assert.equal(g.state().attempt.questionId, asked);
  assert.ok(g.$('#hint-text'), 'it is shown as the help it now is');
  answer(g, content.questionById.get(asked));
  assert.match(g.$('#feedback-verdict').textContent, /with help/);
  assert.deepEqual(g.state().gateCredit, {});
  g.click('#btn-continue');
  assert.notEqual(g.state().attempt.questionId, asked);
  solveGate(g, 'r2:rival');

  const trial = r2State();
  trial.gates['r2:rival'] = { at: T0, questionIds: content.regionById.get('r2').puzzleQuestionIds.neri.slice(0, 2) };
  trial.gates['r2:gate'] = { at: T0, questionIds: [content.regionById.get('r2').puzzleQuestionIds.gate[0]] };
  trial.gates['read:pfx-r2'] = { at: T0, questionIds: content.passageById.get('pfx-r2').questionIds.slice(0, 2) };
  Object.assign(trial, { map: REGION_MAPS.r2.hall, x: 5, y: 3, dir: 'up' });
  const t = bootAt(trial);
  t.press('Enter');
  t.click('#btn-continue');
  const pending = t.state().badgeRun.current.questionId;
  t.click('#btn-back');
  t.click('#btn-worddex');
  assert.ok(t.$('#dex-peek'));
  t.click('#btn-back');
  const reload = boot({ storage: t.storage, clock: t.clock });
  reload.click('#slot-1');
  assert.equal(reload.state().badgeRun.current.hintsUsed, 1);
  reload.press('Enter');
  reload.click('#btn-continue');
  assert.equal(reload.state().badgeRun.current.questionId, pending);
  answer(reload, content.questionById.get(pending));
  assert.match(reload.$('#feedback-verdict').textContent, /with help/);
  assert.deepEqual(reload.state().badgeRun.correct, []);
});

test('reading an entry between encounters: the next capture answer earns nothing, through retreat, reload and mode change', () => {
  const r2 = content.regionById.get('r2');
  const s = r2State({ captures: 0 });
  const id = r2.wordIds[0];
  startEncounter(s, content, id, 'capture', T0);
  completeStudy(s, id, T0);
  s.encounter = null;
  const g = bootAt(s);
  g.click('#btn-worddex');
  assert.equal(g.$(`[data-word="${id}"] .dex-gloss`).textContent, '', 'the list keeps an uncaptured word\'s meaning back');
  g.click(`[data-word="${id}"]`);
  assert.match(g.$('#entry-gloss').textContent, /fxgloss/, 'the entry is real study');
  assert.match(g.$('#entry-lookup').textContent, /won't count/);
  g.click('#btn-back');
  g.click('#btn-back');

  g.app.ui.beginEncounter({ wordId: id, kind: 'capture' });
  g.click('#cmd-retreat');
  const again = boot({ storage: g.storage, clock: g.clock });
  again.click('#slot-1');
  assert.equal(again.state().words[id].lookedUpAt, T0, 'retreat and reload keep what is owed');
  again.app.ui.beginEncounter({ wordId: id, kind: 'capture' });
  again.click('#cmd-inscribe');
  assert.equal(again.state().encounter.current.assisted, true);
  const typed = content.questionById.get(again.state().encounter.current.questionId);
  if (again.$('#btn-use-choices')) {
    again.click('#btn-use-choices');
    assert.equal(again.state().encounter.current.assisted, true, 'changing mode keeps the help');
  }
  again.click(`[data-choice="${(typed.recognitionAccepted ?? typed.acceptedAnswers)[0]}"]`);
  assert.match(again.$('#feedback-verdict').textContent, /with help/);
  assert.deepEqual(again.state().words[id].captureSteps, []);
  again.click('#btn-continue');
  again.click('#cmd-read');
  assert.equal(again.state().encounter.current.assisted, false, 'a fresh question counts again');
  answer(again, content.questionById.get(again.state().encounter.current.questionId));
  assert.equal(again.state().words[id].captureSteps.length, 1);
});

test('reading an entry just before a due review makes it an assisted review, with no evidence; a day later it is fair', () => {
  const clock = { t: T0 + DAY + 1 };
  const g = bootAt(r2State(), clock);
  const id = r2Word(0);
  g.click('#btn-worddex');
  assert.equal(g.$(`[data-word="${id}"] .dex-gloss`).textContent, '', 'a due word keeps its meaning back in the list');
  const search = g.$('#dex-search');
  search.value = content.wordById.get(id).gloss;
  search.dispatchEvent(new g.window.Event('input', { bubbles: true }));
  assert.equal(g.$(`[data-word="${id}"]`), null, 'and search does not map the meaning back to it');
  search.value = '';
  search.dispatchEvent(new g.window.Event('input', { bubbles: true }));
  g.click(`[data-word="${id}"]`);
  assert.equal(g.$('#btn-review-now'), null, 'no review straight from the page that shows the answer');
  g.click('#btn-back');
  g.click('#btn-back');
  g.app.ui.beginEncounter({ wordId: id, kind: 'review' });
  assert.equal(g.state().encounter.current.assisted, true);
  answer(g, content.questionById.get(g.state().encounter.current.questionId));
  assert.match(g.$('#feedback-verdict').textContent, /with help/);
  const record = g.state().words[id];
  assert.deepEqual([record.evidence.length, record.reviewOutcomes.at(-1)], [0, 0]);
  g.click('#btn-continue');

  const other = r2Word(1);
  g.click('#btn-worddex');
  g.click(`[data-word="${other}"]`);
  g.click('#btn-back');
  g.click('#btn-back');
  clock.t += DAY;
  g.app.ui.beginEncounter({ wordId: other, kind: 'review' });
  assert.equal(g.state().encounter.current.assisted, false, 'yesterday\'s reading is memory by now');
  answer(g, content.questionById.get(g.state().encounter.current.questionId));
  assert.equal(g.state().words[other].evidence.length, 1);
});

// LABELED FIXTURE: two synthetic words given one root, so the Same root panel has something to show.
function sameRootSetup() {
  const data = campaignFixture();
  data.wordById.get('FX205').root = data.wordById.get('FX200').root;
  data.wordById.get('FX205').rootNote = 'Fixture root.';
  return data;
}
const bootWith = (s, data, clock) => {
  const storage = checkedStorage(data);
  assert.equal(saveSlot(storage, 1, s, data).ok, true);
  const g = boot({ storage, data, clock });
  g.click('#slot-1');
  return g;
};
const openA = g => {
  g.click('#btn-worddex');
  g.click('[data-word="FX200"]');
};
const leaveDex = g => {
  g.click('#btn-back');
  g.click('#btn-back');
};

test('Same root shows an uncaptured word\'s meaning: its next answer is helped through export, reload and mode, then fresh recovery works', () => {
  const data = sameRootSetup();
  const clock = { t: T0 };
  const s = r2State({ captures: 1 });
  startEncounter(s, data, 'FX205', 'capture', T0);
  completeStudy(s, 'FX205', T0);
  s.encounter = null;
  const g = bootWith(s, data, clock);
  openA(g);
  assert.match(g.$('#entry-family').textContent, /fxgloss 205/, 'the related-word panel still teaches');
  assert.equal(g.state().attempt, null, 'no question is pending');
  assert.equal(g.state().words.FX205.lookedUpAt, T0, 'the shown word pays, not only the opened one');
  assert.equal(g.state().words.FX200.lookedUpAt, T0);
  leaveDex(g);

  const imported = parseImport(exportText(g.state(), T0), data);
  assert.equal(imported.ok, true, imported.errors?.join());
  assert.equal(imported.state.words.FX205.lookedUpAt, T0, 'an export keeps what is owed');

  const again = boot({ storage: g.storage, clock, data });
  again.click('#slot-1');
  again.click('#btn-menu');
  again.click('#toggle-mode');
  again.click('#btn-close-menu');
  assert.equal(again.state().words.FX205.lookedUpAt, T0, 'reload and a mode change keep it too');
  again.app.ui.beginEncounter({ wordId: 'FX205', kind: 'capture' });
  again.click('#cmd-retreat');
  again.app.ui.beginEncounter({ wordId: 'FX205', kind: 'capture' });
  again.click('#cmd-understand');
  assert.equal(again.state().encounter.current.assisted, true);
  const helped = again.state().encounter.current.questionId;
  answer(again, data.questionById.get(helped));
  assert.match(again.$('#feedback-verdict').textContent, /with help/);
  assert.deepEqual(again.state().words.FX205.captureSteps, []);

  again.click('#btn-continue');
  again.click('#cmd-understand');
  assert.notEqual(again.state().encounter.current.questionId, helped, 'a fresh question');
  assert.equal(again.state().encounter.current.assisted, false);
  answer(again, data.questionById.get(again.state().encounter.current.questionId));
  assert.equal(again.state().words.FX205.captureSteps.length, 1, 'legitimate recovery still earns the step');
});

test('Same root shows a due word\'s meaning: its review earns no evidence, and a later eligible review still can', () => {
  const data = sameRootSetup();
  const clock = { t: T0 + DAY + 1 };
  const s = r2State({ captures: 1 });
  startEncounter(s, data, 'FX205', 'capture', T0);
  completeStudy(s, 'FX205', T0);
  for (const family of CAPTURE_FAMILIES) submit(s, data, right(openQuestion(s, data, family, T0)), T0);
  const g = bootWith(s, data, clock);
  openA(g);
  assert.match(g.$('#entry-family').textContent, /fxgloss 205/);
  assert.equal(g.state().attempt, null);
  leaveDex(g);

  const again = boot({ storage: g.storage, clock, data });
  again.click('#slot-1');
  again.app.ui.beginEncounter({ wordId: 'FX205', kind: 'review' });
  assert.equal(again.state().encounter.current.assisted, true);
  answer(again, data.questionById.get(again.state().encounter.current.questionId));
  assert.match(again.$('#feedback-verdict').textContent, /with help/);
  const record = again.state().words.FX205;
  assert.deepEqual([record.evidence.length, record.reviewOutcomes.at(-1)], [0, 0]);
  again.click('#btn-continue');

  clock.t = again.state().words.FX205.dueAt;
  again.app.ui.beginEncounter({ wordId: 'FX205', kind: 'review' });
  assert.equal(again.state().encounter.current.assisted, false, 'the debt is paid');
  answer(again, data.questionById.get(again.state().encounter.current.questionId));
  assert.equal(again.state().words.FX205.evidence.length, 1);
});

test('reading about a word through Same root long ago is memory, the same as reading its own entry', () => {
  const data = sameRootSetup();
  const clock = { t: T0 };
  const s = r2State({ captures: 1 });
  startEncounter(s, data, 'FX205', 'capture', T0);
  completeStudy(s, 'FX205', T0);
  s.encounter = null;
  const g = bootWith(s, data, clock);
  openA(g);
  leaveDex(g);
  clock.t += DAY;
  g.app.ui.beginEncounter({ wordId: 'FX205', kind: 'capture' });
  g.click('#cmd-understand');
  assert.equal(g.state().encounter.current.assisted, false);
});

test('a word not yet studied stays out of Same root, so nothing is shown and nothing is charged', () => {
  const data = sameRootSetup();
  const s = r2State({ captures: 1 });
  startEncounter(s, data, 'FX205', 'capture', T0);
  s.encounter = null;
  const g = bootWith(s, data, { t: T0 });
  openA(g);
  assert.equal(g.$('#entry-family'), null);
  assert.equal(g.state().words.FX205.lookedUpAt, undefined);
});

test('the seal\'s word list names words in Hebrew only, so choosing one can\'t show the answer it is about to ask', () => {
  const s = r2State();
  s.gates['r2:rival'] = { at: T0, questionIds: content.regionById.get('r2').puzzleQuestionIds.neri.slice(0, 2) };
  s.gates['r2:gate'] = { at: T0, questionIds: [content.regionById.get('r2').puzzleQuestionIds.gate[0]] };
  const id = r2Word(0);
  addToParty(s, id);
  for (const family of ['fx-analyze', 'fx-build']) {
    startEncounter(s, content, id, 'practice', T0);
    submit(s, content, right(openQuestion(s, content, family, T0)), T0);
    s.encounter = null;
  }
  const g = bootAt(s);
  approach(g, 'r2-ward');
  g.click('#btn-continue');
  const row = g.$(`[data-ward-word="${id}"]`);
  assert.ok(row.querySelector('bdi[lang="he"]'));
  assert.ok(!row.textContent.includes(content.wordById.get(id).gloss));
  assert.equal(g.state().words[id].lookedUpAt, undefined);
});

// LABELED FIXTURE: the first rival question reauthored with mixed English and Hebrew labels. These are
// supported-shape UI inputs written for this test, not corpus records or campaign proof.
const MIXED_LABELS = ['אֱלֹהִים, after the verb', 'בָּרָא, the verb itself', 'יָלַד, Hiphil: and he fathered'];
function atMixedQuestion(shape, { sacredName = 'written' } = {}) {
  const data = campaignFixture();
  const question = data.questionById.get(data.regionById.get('r2').puzzleQuestionIds.neri[0]);
  delete question.choices;
  delete question.acceptedAnswers;
  Object.assign(question, shape);
  const source = structuredClone(question);
  const s = r2State();
  s.settings.sacredName = sacredName;
  const g = bootWith(s, data, { t: T0 });
  approach(g, 'r2-rival');
  g.click('#btn-continue');
  assert.equal(g.state().attempt.questionId, question.id);
  return { g, question, source };
}
const asChoices = labels => labels.map((text, i) => ({ id: `c${i}`, text }));
const bdis = node => [...node.querySelectorAll('bdi')];
// Each Hebrew run is its own isolate, and everything else stays outside it, in logical order.
function assertMixed(node, label, runs) {
  assert.equal(node.textContent, label, 'the whole label, in logical order, with marks unchanged');
  const isolates = bdis(node);
  assert.deepEqual(isolates.map(b => b.textContent), runs);
  for (const b of isolates) {
    assert.equal(b.getAttribute('lang'), 'he');
    assert.equal(b.getAttribute('dir'), 'rtl');
    assert.equal(b.className, 'he he-inline', 'local Hebrew font at reading size');
  }
  assert.equal(node.closest('[dir]')?.closest('#modal') ?? null, null, 'no blanket RTL over the English');
}

test('mixed choice labels isolate each Hebrew run and leave English, numerals and punctuation outside', () => {
  const labels = [...MIXED_LABELS, '2 words: בְּרֵאשִׁית בָּרָא (Gen. 1:1)!', 'אֱלֹהִים then בָּרָא, 3 words'];
  const { g, question, source } = atMixedQuestion({ format: 'choice', choices: asChoices(labels), acceptedAnswers: ['c0'] });
  const button = id => g.$(`[data-choice="${id}"]`);
  assertMixed(button('c0'), labels[0], ['אֱלֹהִים']);
  assertMixed(button('c1'), labels[1], ['בָּרָא']);
  assertMixed(button('c2'), labels[2], ['יָלַד']);
  assertMixed(button('c3'), labels[3], ['בְּרֵאשִׁית בָּרָא']);
  assertMixed(button('c4'), labels[4], ['אֱלֹהִים', 'בָּרָא']);
  assert.equal(button('c0').className, 'choice', 'a mixed label is not a large Hebrew choice');
  assert.deepEqual(question, source, 'source data unchanged');

  // The same id still reaches the same callback, and a wrong one is still wrong.
  button('c1').click();
  assert.match(g.$('#feedback-verdict').textContent, /Not this time/);
});

test('a mixed choice submits its id: the right answer is credited', () => {
  const { g, question } = atMixedQuestion({ format: 'choice', choices: asChoices(MIXED_LABELS), acceptedAnswers: ['c2'] });
  g.click('[data-choice="c2"]');
  assert.match(g.$('#feedback-verdict').textContent, /Correct/);
  assert.deepEqual(g.state().gateCredit['r2:rival'], [question.id]);
});

test('a type question\'s recognition fallback renders mixed labels the same way, and answers through its own key', () => {
  const { g, question, source } = atMixedQuestion({
    format: 'type', compare: 'gloss', acceptedAnswers: ['after the verb'],
    recognitionChoices: asChoices(MIXED_LABELS), recognitionAccepted: ['c0'],
  });
  assert.ok(g.$('#answer-input'), 'it opens for typing');
  g.click('#btn-use-choices');
  assert.equal(g.state().attempt.responseMode, 'recognition');
  assertMixed(g.$('[data-choice="c0"]'), MIXED_LABELS[0], ['אֱלֹהִים']);
  assertMixed(g.$('[data-choice="c2"]'), MIXED_LABELS[2], ['יָלַד']);
  assert.deepEqual(question, source);
  g.click('[data-choice="c0"]');
  assert.match(g.$('#feedback-verdict').textContent, /Correct/);
});

test('the name preference reaches mixed labels and is disclosed, with source data unchanged; written shows the source', () => {
  const name = 'יְהוָה';
  const label = `${name}, the name (v. 3): 4 letters!`;
  const shape = { format: 'choice', choices: asChoices([label, MIXED_LABELS[1]]), acceptedAnswers: ['c0'] };

  const { g, question, source } = atMixedQuestion(shape, { sacredName: 'substitute' });
  assertMixed(g.$('[data-choice="c0"]'), 'ה׳, the name (v. 3): 4 letters!', ['ה׳']);
  assert.ok(!g.$('#modal').textContent.includes(name));
  assert.match(g.$('#sacred-note').textContent, /altered only on your screen/);
  assert.deepEqual(question, source, 'the record keeps the name');
  g.click('[data-choice="c0"]');
  assert.match(g.$('#feedback-verdict').textContent, /Correct/, 'the answer is unaffected');

  const written = atMixedQuestion(shape);
  assertMixed(written.g.$('[data-choice="c0"]'), label, [name]);
  assert.equal(written.g.$('#sacred-note'), null, 'nothing altered, nothing to disclose');
});

test('pure Hebrew and plain Latin choices keep their existing look', () => {
  const { g } = atMixedQuestion({
    format: 'choice', acceptedAnswers: ['c0'],
    choices: [{ id: 'c0', text: 'אֱלֹהִים', lang: 'he' }, { id: 'c1', text: 'plain English, 2 words.' }],
  });
  const hebrew = g.$('[data-choice="c0"]');
  assert.equal(hebrew.className, 'choice choice-he');
  assert.equal(hebrew.firstElementChild.tagName, 'BDI', 'the isolate sits directly in the button');
  assert.equal(hebrew.firstElementChild.className, 'he', 'full reading size, not inline');
  assert.equal(hebrew.textContent, 'אֱלֹהִים');
  const latin = g.$('[data-choice="c1"]');
  assert.equal(latin.className, 'choice');
  assert.equal(latin.textContent, 'plain English, 2 words.');
  assert.deepEqual(bdis(latin), []);
  assert.equal(latin.querySelector('[dir]'), null);
});

test('a match board isolates Hebrew in its labels too, and still pairs by the authored text', () => {
  const pairs = [{ left: 'אֱלֹהִים', right: MIXED_LABELS[0] }, { left: 'בָּרָא, the verb', right: 'plain group' }];
  const { g } = atMixedQuestion({ format: 'match', pairs });
  const rows = [...g.window.document.querySelectorAll('[data-pair]')];
  assertMixed(rows[0].querySelector('.pair-left'), 'אֱלֹהִים', ['אֱלֹהִים']);
  assertMixed(rows[1].querySelector('.pair-left'), 'בָּרָא, the verb', ['בָּרָא']);
  const options = row => [...row.querySelectorAll('[data-right]')];
  const option = (row, right) => options(row).find(node => node.dataset.right === right);
  assertMixed(option(rows[0], MIXED_LABELS[0]), MIXED_LABELS[0], ['אֱלֹהִים']);
  assert.deepEqual(bdis(option(rows[0], 'plain group')), []);
  option(rows[0], MIXED_LABELS[0]).click();
  option(rows[1], 'plain group').click();
  g.click('#btn-check');
  assert.match(g.$('#feedback-verdict').textContent, /Correct/);
});

test('a pending encounter can\'t be asked about from the Worddex either, if it is ever reached there', () => {
  const s = r2State({ captures: 0 });
  const id = content.regionById.get('r2').wordIds[0];
  startEncounter(s, content, id, 'capture', T0);
  completeStudy(s, id, T0);
  openQuestion(s, content, 'read-letter', T0);
  const g = bootAt(s);
  g.app.ui.worddex();
  assert.equal(g.state().encounter.current.assisted, true);
  assert.ok(g.$('#dex-peek'));
});

test('review feedback offers a fresh attempt as remediation, or leaving, and keeps the schedule honest', () => {
  const s = r2State();
  const clock = { t: T0 + DAY + 1 };
  const g = bootAt(s, clock);
  const id = r2Word(0);
  g.app.ui.beginEncounter({ wordId: id, kind: 'review' });
  const asked = g.state().encounter.current.questionId;
  const q = content.questionById.get(asked);
  assert.match(g.$('#modal').textContent, /First answer counts/);
  if (q.format === 'type') g.click('#btn-use-choices');
  const wrongChoice = (q.choices ?? q.recognitionChoices).find(c => !(q.acceptedAnswers ?? []).includes(c.id) && !(q.recognitionAccepted ?? []).includes(c.id));
  if (q.format === 'tokens') { g.click('#btn-check'); } else g.click(`[data-choice="${wrongChoice.id}"]`);
  assert.match(g.$('#feedback-verdict').textContent, /Not this time/);
  assert.equal(g.state().words[id].reviewOutcomes.at(-1), 0);
  const due = g.state().words[id].dueAt;
  g.click('#btn-remediate');
  assert.equal(g.state().encounter.kind, 'practice');
  assert.ok(g.$('#cmd-read'));
  g.click('#cmd-understand');
  assert.notEqual(g.state().encounter.current.questionId, asked, 'remediation asks something fresh');
  answer(g, content.questionById.get(g.state().encounter.current.questionId));
  g.click('#btn-continue');
  assert.equal(g.state().words[id].dueAt, due, 'practice leaves the schedule alone');
  g.click('#cmd-retreat');
  assert.equal(g.$('#modal').open, false);
});

function dexState() {
  const s = r2State({ captures: 6 });
  const r3 = content.regionById.get('r3');
  // Met but never studied: a real encounter, retreated from.
  startEncounter(s, content, r3.wordIds[0], 'capture', T0);
  s.encounter = null;
  return s;
}

test('Worddex search, filters and sort narrow the list without losing the search box focus', () => {
  const g = bootAt(dexState());
  g.click('#btn-worddex');
  const shown = () => [...g.window.document.querySelectorAll('[data-word]')].map(n => n.dataset.word);
  const total = shown().length;
  assert.equal(total, 10, shown().join());
  assert.match(g.$('#worddex-count').textContent, /9 captured/);

  const search = g.$('#dex-search');
  search.focus();
  const type = text => { search.value = text; search.dispatchEvent(new g.window.Event('input', { bubbles: true })); };
  type('fxgloss 201');
  assert.deepEqual(shown(), ['FX201']);
  assert.equal(g.window.document.activeElement, search, 'typing keeps the focus');
  type(content.wordById.get('FX202').consonants);
  assert.deepEqual(shown(), ['FX202'], 'Hebrew letters match without points');
  type(content.wordById.get('FX202').hebrew);
  assert.deepEqual(shown(), ['FX202'], 'so do pointed forms');
  type('fxsay203');
  assert.deepEqual(shown(), ['FX203'], 'sound guide once studied');
  type('fxgloss 300');
  assert.deepEqual(shown(), [], 'a word met but not studied keeps its meaning hidden');
  assert.ok(g.$('#worddex-none'));
  type('');
  assert.equal(shown().length, total);

  const pick = (selector, value) => { const node = g.$(selector); node.value = value; node.dispatchEvent(new g.window.Event('change', { bubbles: true })); };
  pick('#dex-region', 'r1');
  assert.equal(shown().length, 3);
  pick('#dex-region', '');
  pick('#dex-category', 'noun');
  assert.equal(shown().length, total - 1, 'an unstudied word does not reveal its part of speech');
  pick('#dex-category', '');
  pick('#dex-status', 'Seen');
  assert.deepEqual(shown(), ['FX300']);
  pick('#dex-status', '');
  pick('#dex-root', content.wordById.get('FX200').root);
  assert.deepEqual(shown(), ['FX200', 'FX205'].filter(id => content.wordById.get(id).root === content.wordById.get('FX200').root));
  pick('#dex-root', '');

  pick('#dex-sort', 'due');
  assert.equal(shown().at(-1), 'FX300', 'a word with no review date sorts last');
  pick('#dex-sort', 'hebrew');
  const letters = shown().map(id => content.wordById.get(id).consonants);
  assert.deepEqual(letters, [...letters].sort((a, b) => a.localeCompare(b, 'he')));
  pick('#dex-sort', 'status');
  assert.equal(g.$('[data-word] .dex-status').textContent, 'Captured');

  // Favorites are saved and filterable.
  g.click('[data-word="FX201"]');
  g.click('#btn-favorite');
  assert.equal(g.state().words.FX201.favorite, true);
  assert.equal(g.$('#btn-favorite').getAttribute('aria-pressed'), 'true');
  g.click('#btn-back');
  assert.equal(g.$('#dex-search').value, '', 'the list comes back as it was left');
  assert.equal(g.$('#dex-sort').value, 'status');
  g.$('#dex-favorites').click();
  assert.deepEqual(shown(), ['FX201']);
});

test('Worddex at campaign scale: 150 words stay searchable, filterable and sorted', () => {
  const s = newGame(T0, 3);
  for (const lesson of content.lessons) markLessonDone(s, content, lesson.id, T0);
  for (const word of content.words) {
    startEncounter(s, content, word.id, 'capture', T0);
    completeStudy(s, word.id, T0);
    for (const family of CAPTURE_FAMILIES) submit(s, content, right(openQuestion(s, content, family, T0)), T0);
  }
  const g = bootAt(s);
  const started = performance.now();
  g.click('#btn-worddex');
  const shown = () => g.window.document.querySelectorAll('[data-word]').length;
  assert.equal(shown(), content.words.length);
  assert.ok(content.words.length >= 150);
  assert.match(g.$('#worddex-count').textContent, /Showing 150/);
  const pick = (selector, value) => { const node = g.$(selector); node.value = value; node.dispatchEvent(new g.window.Event('change', { bubbles: true })); };
  pick('#dex-region', 'r5');
  assert.equal(shown(), 20);
  pick('#dex-category', 'noun');
  assert.equal(shown(), 20);
  pick('#dex-region', 'r6');
  assert.equal(shown(), 0, 'filters combine');
  pick('#dex-category', '');
  pick('#dex-sort', 'hebrew');
  assert.equal(shown(), 20);
  assert.equal(g.$('#party-list').children.length, 6, 'the party stays six, whatever the collection');
  assert.ok(performance.now() - started < 3000);
});

test('a Worddex entry shows every field and source, and hides answers on a word not yet studied', () => {
  const g = bootAt(dexState());
  g.click('#btn-worddex');
  g.click('[data-word="FX300"]');
  const seen = g.$('#modal').textContent;
  const word = content.wordById.get('FX300');
  assert.ok(!seen.includes(word.gloss), 'no meaning before the card');
  assert.ok(!seen.includes(word.transliteration), 'no transliteration before the card');
  assert.ok(g.$('.word-plate bdi[lang="he"]'));
  g.click('#btn-back');

  g.click('[data-word="FX201"]');
  const entry = content.wordById.get('FX201');
  assert.match(g.$('#entry-id').textContent, /FX201/);
  assert.ok(g.$('#modal').textContent.includes(entry.transliteration));
  assert.match(g.$('#entry-gloss').textContent, /fxgloss 201/);
  assert.match(g.$('#entry-features').textContent, /masculine/);
  assert.match(g.$('#entry-locations').textContent, /Fixture Region 2/);
  assert.match(g.$('#entry-review').textContent, /Next review/);
  assert.ok(g.$('#entry-history').children.length >= 3);
  assert.ok(g.$('#entry-sources li').textContent.includes(content.sourceById.get(entry.sourceIds[0]).title));
  assert.match(g.$('#entry-forms').textContent, /inflected/);
  assert.ok(g.$('#entry-forms bdi[lang="he"]'));
});

test('tracing a related form is a real answer: right grows knowledge, wrong explains and waits', () => {
  const s = dexState();
  const g = bootAt(s);
  g.click('#btn-worddex');
  g.click('[data-word="FX201"]');
  g.click('#btn-trace-form');
  assert.ok(g.$('#form-question bdi[lang="he"]'));
  g.click('[data-relationship="derivation"]');
  assert.match(g.$('#feedback-verdict').textContent, /Not this time/);
  assert.deepEqual(g.state().words.FX201.formsKnown, []);
  g.click('#btn-continue');
  assert.equal(g.$('#btn-trace-form'), null, 'it comes back after other actions, not right away');
  g.state().interactions += 2;
  g.click('#btn-back');
  g.click('[data-word="FX201"]');
  g.click('#btn-trace-form');
  g.click('[data-relationship="inflection"]');
  assert.match(g.$('#feedback-verdict').textContent, /Correct/);
  assert.equal(g.state().words.FX201.formsKnown.length, 1);
});

test('the sacred-name preference changes the display only, and says so on the screen', () => {
  const s = r2State();
  const name = 'יְהוָה';
  const data = campaignFixture();
  data.lessons.find(l => l.id === 'l-letters').explanation += ` Example: ${name}.`;
  const storage = checkedStorage(data);
  saveSlot(storage, 1, s, data);
  const g = boot({ storage, data });
  g.click('#slot-1');
  g.click('#btn-menu');
  assert.equal(g.$('#toggle-sacred').getAttribute('aria-checked'), 'false');
  g.click('#toggle-sacred');
  assert.equal(g.state().settings.sacredName, 'substitute');
  assert.equal(g.$('#toggle-sacred').getAttribute('aria-checked'), 'true');
  g.click('#btn-close-menu');
  assert.equal(parseImport(g.storage.getItem(slotKey(1)), data).state.settings.sacredName, 'substitute');

  g.app.ui.dialogue('Test', [`A line quoting ${name} here.`]);
  assert.ok(!g.$('#dialogue-text').textContent.includes(name));
  assert.ok(g.$('#dialogue-text').textContent.includes('ה׳'));
  assert.match(g.$('#sacred-note').textContent, /altered only on your screen/);
  g.click('#btn-continue');

  g.click('#btn-menu');
  g.click('#toggle-sacred');
  g.click('#btn-close-menu');
  g.app.ui.dialogue('Test', [`A line quoting ${name} here.`]);
  assert.ok(g.$('#dialogue-text').textContent.includes(name), 'written shows the source text');
  assert.equal(g.$('#sacred-note'), null, 'and has nothing to disclose');
});

test('the journal lists every region\'s quest from data, for checking progress without leaving the game', () => {
  const g = bootAt(r2State());
  g.click('#btn-menu');
  g.click('#menu-journal');
  assert.match(g.$('#journal-list').textContent, /The scattered archive/);
  assert.match(g.$('#journal-list').textContent, /Fixture quest 2/);
  assert.match(g.$('#journal-list').textContent, /Reed Seal/);
  assert.equal(g.$('#journal-list').textContent.includes('Fixture quest 3'), false, 'regions still sealed stay hidden');
  g.escape();
  assert.ok(g.$('#btn-close-menu'));
});

test('the riddle stone does not crash on an imported save that cleared Neri without the lesson', () => {
  const s = newGame(T0, 3);
  Object.assign(s.flags, { neriCleared: true });
  const storage = checkedStorage(realContent);
  saveSlot(storage, 1, s, realContent);
  const g = boot({ storage, data: realContent });
  g.click('#slot-1');
  Object.assign(g.state(), { map: 'grove', x: 14, y: 12, dir: 'up' });
  const errors = [];
  g.window.addEventListener('error', event => errors.push(event.message));
  g.press('Enter');
  assert.deepEqual(errors, [], 'jsdom reports handler errors as window events');
  assert.equal(g.$('#modal').open, false);
});

test('an exit with no region data beyond it says so, instead of promising a road', () => {
  const data = campaignFixture();
  const partial = { ...data, regions: data.regions.slice(0, 2), regionById: new Map(data.regions.slice(0, 2).map(r => [r.id, r])) };
  const s = r2State();
  const r2 = data.regionById.get('r2');
  s.gates['r2:rival'] = { at: T0, questionIds: r2.puzzleQuestionIds.neri.slice(0, 2) };
  s.gates['r2:gate'] = { at: T0, questionIds: [r2.puzzleQuestionIds.gate[0]] };
  s.gates['read:pfx-r2'] = { at: T0, questionIds: data.passageById.get('pfx-r2').questionIds.slice(0, 2) };
  s.badges['bfx-r2'] = { at: T0, questionIds: r2.badge.questionIds.slice(0, 4) };
  Object.assign(s, { map: 'springs', ...MAPS.springs.exitFront, dir: 'up' });
  const storage = checkedStorage(partial);
  saveSlot(storage, 1, s, partial);
  const g = boot({ storage, data: partial });
  g.click('#slot-1');
  g.press('ArrowUp');
  assert.match(g.$('#dialogue-text').textContent, /not been restored|isn't restored/);
  solveScreens(g);
  g.press('ArrowUp');
  assert.equal(g.state().map, 'springs');
  assert.match(g.$('#dialogue-text').textContent, /not been restored|isn't restored/);
});

test('autosave warns and keeps playing when a save is rejected, leaving the slot alone', () => {
  const s = r2State();
  const g = bootAt(s);
  const before = g.storage.getItem(slotKey(1));
  g.state().party = ['H9999'];
  g.press('ArrowDown');
  assert.match(g.$('#save-warning').textContent, /Export/);
  assert.equal(g.$('#save-warning').hidden, false);
  assert.notEqual(g.storage.getItem(slotKey(1)), undefined);
  assert.equal(parseImport(g.storage.getItem(slotKey(1)), content).ok, true);
  assert.ok(before);
});
