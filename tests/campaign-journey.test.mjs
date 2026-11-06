// Drives the real UI code under jsdom, with key presses and clicks only and no state edits.
// LIMITS: r2..r8 here are the labeled synthetic fixture, so this proves the game code carries
// data of the shared-contract shape from start to finish. It is NOT proof of the real campaign,
// which stays blocked on content integration. Pixels, fonts and real touch still need a browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { campaignFixture } from './fixtures/campaign-fixture.mjs';
import { content as realContent } from '../src/content.js';
import { MAPS, OBJECTS, REGION_MAPS, ENCOUNTER_TILES } from '../src/world.js';
import { currentStage, destination, tileAt, isDone, newGame, markLessonDone } from '../src/engine.js';
import { DAY, startEncounter, completeStudy, openQuestion, submit, CAPTURE_FAMILIES, statusOf, addToParty } from '../src/learning.js';
import { startBadgeRun, openBadgeQuestion, submitBadgeAnswer } from '../src/checkpoints.js';
import { parseImport, slotKey, saveSlot } from '../src/storage.js';
import { startApp } from '../src/app.js';

const content = campaignFixture();
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

  // Practice from the Worddex: two different tasks grow the word.
  addToParty(g.state(), id);
  g.click('#btn-worddex');
  g.click(`[data-word="${id}"]`);
  assert.match(g.$('#entry-rank').textContent, /Known/);
  for (const command of ['analyze', 'build']) {
    g.click('#btn-practice');
    g.click(`#cmd-${command}`);
    answer(g, content.questionById.get(g.state().encounter.current.questionId));
    g.click('#btn-continue');
    g.click('#cmd-retreat');
    g.click('#btn-worddex');
    g.click(`[data-word="${id}"]`);
  }
  assert.match(g.$('#entry-rank').textContent, /Familiar/);
  assert.match(g.$('#entry-rank').textContent, /doesn't change the word|the word itself/i);
  assert.ok(g.$('#entry-unlocked li'), 'the grown word opens more attested lines');
  g.click('#btn-back');
  g.click('#btn-back');

  g.press('Enter');
  g.click('#btn-continue');
  g.click(`[data-ward-word="${id}"]`);
  answer(g, content.questionById.get(g.state().attempt.questionId));
  assert.match(g.$('#feedback-verdict').textContent, /Correct/);
  solveScreens(g);
  assert.deepEqual(Object.keys(g.state().gates).includes('r2:ward'), true);
  assert.ok(route(g.state(), { map: REGION_MAPS.r2.cave, ...MAPS[REGION_MAPS.r2.cave].shortcutFront }), 'the shortcut is open');

  approach(g, 'r2-secret');
  assert.match(g.$('#dialogue-text').textContent, /archive/);
  solveScreens(g);
  assert.ok(isDone(g.state(), 'r2:secret'));
});

test('looking a word up while a seal is asking about it counts as help: the answer opens nothing', () => {
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
  g.click('#btn-back');
  g.click('#btn-worddex');
  g.click('[data-word="FX201"]');
  assert.equal(g.state().attempt.hintsUsed, 0, 'another word is fine');
  g.click('#btn-back');
  g.click(`[data-word="${id}"]`);
  assert.equal(g.state().attempt.hintsUsed, 1);
  assert.match(g.$('#entry-peek').textContent, /won't count/);
  g.click('#btn-back');
  g.click('#btn-back');
  g.press('Enter');
  g.click('#btn-continue');
  g.click(`[data-ward-word="${id}"]`);
  answer(g, content.questionById.get(g.state().attempt.questionId));
  assert.match(g.$('#feedback-verdict').textContent, /with help/);
  assert.equal(isDone(g.state(), 'r2:ward'), false);
});

test('review feedback offers a fresh attempt as remediation, or leaving, and keeps the schedule honest', () => {
  const s = r2State();
  const clock = { t: T0 + DAY + 1 };
  const g = bootAt(s, clock);
  const id = r2Word(0);
  g.click('#btn-worddex');
  g.click(`[data-word="${id}"]`);
  g.click('#btn-review-now');
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
  s.badges['bfx-r2'] = { at: T0, questionIds: data.regionById.get('r2').badge.questionIds.slice(0, 4) };
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
