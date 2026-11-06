// Drives the real DOM code through key events and clicks, under jsdom with a stubbed canvas.
// This proves the screen logic and wiring. Pixels, fonts, focus rings and real touch still need a browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { content } from '../src/content.js';
import { destination } from '../src/engine.js';
import { slotKey } from '../src/storage.js';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8').replace(/<script[^>]*><\/script>|<link[^>]*>/g, '');
const fakeContext = new Proxy({}, { get: () => () => {}, set: () => true });
const { startApp } = await import('../src/app.js').catch(() => ({}));

function memory(initial = {}) {
  const data = new Map(Object.entries(initial));
  return { data, getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)), removeItem: k => data.delete(k) };
}

function boot({ storage = memory(), seed = 42, clock = { t: 1_800_000_000_000 } } = {}) {
  const dom = new JSDOM(html, { url: 'http://localhost/', pretendToBeVisual: true });
  const { window } = dom;
  Object.assign(globalThis, { window, document: window.document, Element: window.Element });
  window.HTMLDialogElement.prototype.showModal = function showModal() { this.open = true; };
  window.HTMLDialogElement.prototype.close = function closeDialog() { this.open = false; };
  window.HTMLCanvasElement.prototype.getContext = () => fakeContext;
  const app = startApp({ storage, seed, now: () => clock.t, reducedMotion: true });
  const $ = selector => window.document.querySelector(selector);
  const click = selector => {
    const node = $(selector);
    assert.ok(node, `missing ${selector}`);
    assert.notEqual(node.getAttribute('aria-disabled'), 'true', `${selector} is disabled`);
    node.click();
  };
  const press = key => {
    window.document.getElementById('game-canvas').dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true }));
    app.tick(0);
    window.dispatchEvent(new window.KeyboardEvent('keyup', { key }));
  };
  const escape = () => $('#modal').dispatchEvent(new window.Event('cancel', { cancelable: true }));
  return { app, $, click, press, escape, window, storage, clock, state: () => app.getState() };
}

const KEYS = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };
const VECTORS = [['up', 0, -1], ['down', 0, 1], ['left', -1, 0], ['right', 1, 0]];

// Finds a walking route with real collision. It may cross warps, and it stops if a screen opens.
function route(state, goal) {
  const start = `${state.map}:${state.x},${state.y}`;
  const queue = [[state.map, state.x, state.y]];
  const from = new Map([[start, null]]);
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

function walkTo(g, goal, onScreen = solveEncounter) {
  for (let guard = 0; guard < 400; guard++) {
    const s = g.state();
    if (s.map === goal.map && s.x === goal.x && s.y === goal.y) return;
    const dirs = route(s, goal);
    assert.ok(dirs, `no route to ${JSON.stringify(goal)}`);
    g.press(KEYS[dirs[0]]);
    if (g.$('#modal').open) onScreen(g);
  }
  assert.fail('walk did not finish');
}

const face = (g, dir) => {
  // Bumping a solid object turns the player toward it without moving.
  g.press(KEYS[dir]);
};

function answerCurrent(g, question) {
  if (question.format === 'tokens') {
    for (const id of question.acceptedSequences[0]) g.click(`[data-token="${id}"]`);
    g.click('#btn-check');
  } else if (g.$('#answer-input')) {
    g.$('#answer-input').value = question.acceptedAnswers[0];
    g.click('#btn-check');
  } else {
    g.click(`[data-choice="${(question.acceptedAnswers ?? question.recognitionAccepted)[0]}"]`);
  }
}

function solveEncounter(g) {
  for (let guard = 0; guard < 30; guard++) {
    const s = g.state();
    if (!s.encounter) {
      if (g.$('#btn-continue')) { g.click('#btn-continue'); continue; }
      return;
    }
    if (s.encounter.current) {
      answerCurrent(g, content.questionById.get(s.encounter.current.questionId));
      continue;
    }
    if (g.$('#btn-card-done')) { g.click('#btn-card-done'); continue; }
    if (g.$('#btn-next')) { g.click('#btn-next'); continue; }
    if (g.$('[data-choice]') && !g.$('[data-command]')) {
      g.click('[data-choice="c0"]');
      continue;
    }
    if (g.$('#btn-continue')) { g.click('#btn-continue'); continue; }
    if (s.words[s.encounter.wordId].studiedAt == null) { g.click('#cmd-study'); continue; }
    if (s.encounter.kind !== 'capture') { g.click('#cmd-retreat'); return; }
    const open = ['read', 'understand', 'inscribe'].find(id => g.$(`#cmd-${id}`).getAttribute('aria-disabled') !== 'true');
    assert.ok(open, 'a capture command is available');
    g.click(`#cmd-${open}`);
  }
  assert.fail(`encounter did not resolve: ${g.$('#modal').textContent.slice(0, 300)} | ${JSON.stringify(g.state().encounter)}`);
}

const startNew = g => {
  g.click('#slot-1');
  g.click('#btn-continue');
  g.click('#btn-continue');
  assert.equal(g.$('#modal').open, false, 'opening dialogue closes');
};

function finishLesson(g) {
  for (let guard = 0; guard < 25; guard++) {
    if (g.$('#btn-next')) { g.click('#btn-next'); continue; }
    if (g.$('#feedback-verdict')) { g.click('#btn-continue'); continue; }
    if (g.$('[data-choice]')) { g.click('[data-choice="c0"]'); continue; }
    if (g.$('[data-token]')) {
      const prompt = g.$('#question-prompt').textContent;
      const q = content.questions.find(item => item.prompt === prompt);
      for (const id of q.acceptedSequences[0]) g.click(`[data-token="${id}"]`);
      g.click('#btn-check');
      continue;
    }
    return;
  }
  assert.fail('lesson did not finish');
}

const toTamar = (g, dir = 'up') => {
  walkTo(g, { map: 'scriptorium', x: 5, y: 4 });
  face(g, dir);
  g.press('Enter');
};

test('zero-Hebrew opening: new game, walk, mentor, first word, capture, Worddex, save and reload', () => {
  const g = boot();
  assert.match(g.$('#title').textContent, /Aleph Quest/);
  startNew(g);
  assert.match(g.$('#objective').textContent, /Tamar/);
  assert.equal(g.$('#place').textContent, 'Letter Grove');

  // Blocked by a tree, the player stays put.
  g.press('ArrowRight');
  const start = [g.state().x, g.state().y];
  assert.ok(start[0] === 12, 'one step along open ground');
  assert.equal(g.$('#objective').textContent.includes('Tamar'), true);

  // The reeds are silent until the lesson.
  walkTo(g, { map: 'grove', x: 28, y: 20 });
  g.press('ArrowRight');
  assert.equal(g.$('#modal').open, false);
  assert.match(g.$('#prompt').textContent, /can't read them yet/);

  // Tamar: worked example, then guided practice where a wrong answer can be retried.
  toTamar(g);
  assert.match(g.$('#dialogue-text').textContent, /storm/);
  g.click('#btn-continue');
  g.click('#btn-continue');
  assert.ok(g.$('#letter-chart'), 'the alphabet chart is on the first lesson page');
  assert.equal(g.$('#letter-chart').querySelectorAll('bdi[lang="he"]').length, 22);
  g.click('#btn-next');
  assert.match(g.$('#modal').textContent, /Worked example/);
  assert.equal(g.$('#modal bdi[lang="he"]').getAttribute('dir'), 'rtl');
  g.click('#btn-next');
  // A guided wrong answer gets a retry, not a dead end.
  g.click('[data-choice="c1"]');
  assert.match(g.$('#feedback-verdict').textContent, /Look again/);
  g.click('#btn-continue');
  finishLesson(g);
  assert.ok(g.state().skills.alphabet);
  assert.match(g.$('#dialogue-text').textContent, /reeds/);
  g.click('#btn-continue');
  assert.match(g.$('#objective').textContent, /reeds/);
  assert.equal(g.state().skills['word-meaning'], undefined);

  // First real word, seeded on the first reed step.
  walkTo(g, { map: 'grove', x: 28, y: 20 });
  g.press('ArrowRight');
  assert.equal(g.state().encounter.wordId, 'H0001');
  assert.equal(g.$('#encounter-word bdi').textContent, 'אָב');
  assert.equal(g.$('#encounter-word bdi').getAttribute('lang'), 'he');
  assert.equal(g.$('#cmd-read').getAttribute('aria-disabled'), 'true', 'Read waits for the card');
  assert.match(g.$('#cmd-understand').parentElement.textContent, /Study/);
  assert.equal(g.window.document.activeElement.id, 'cmd-study', 'focus lands on the one useful command');
  assert.equal(g.$('#mystery-meter').getAttribute('aria-label'), '0 of 3 shown');

  // Study: the card shows the gloss, then the meaning lesson unlocks Understand.
  g.click('#cmd-study');
  assert.match(g.$('#card-gloss').textContent, /father/);
  assert.match(g.$('#card-gloss').textContent, /"av"/);
  assert.equal(g.state().words.H0001.firstAttempts, 0, 'reading the card is not retrieval');
  g.click('#btn-card-done');
  finishLesson(g);
  assert.ok(g.state().skills['word-meaning']);
  assert.notEqual(g.$('#cmd-understand').getAttribute('aria-disabled'), 'true');

  // Wrong first: explanation, then a fresh stem, and the card is hidden throughout.
  g.click('#cmd-read');
  const firstStem = g.state().encounter.current.stemId;
  assert.equal(g.$('#modal').textContent.includes('father'), false, 'answer-bearing gloss is hidden');
  g.click('[data-choice="c1"]');
  assert.match(g.$('#feedback-verdict').textContent, /Not this time/);
  assert.ok(g.$('#feedback-text').textContent.length > 20);
  assert.equal(g.state().words.H0001.captureSteps.length, 0);
  g.click('#btn-continue');
  g.click('#cmd-read');
  assert.notEqual(g.state().encounter.current.stemId, firstStem, 'a new question, not the same one');
  g.click('[data-choice="c0"]');
  g.click('#btn-continue');
  assert.equal(g.$('#mystery-meter').getAttribute('aria-label'), '1 of 3 shown');
  assert.match(g.$('#cmd-read').parentElement.textContent, /Already shown/);

  g.click('#cmd-understand');
  g.click('[data-choice="c0"]');
  g.click('#btn-continue');

  // Inscribe: a different task from the others.
  g.click('#cmd-inscribe');
  assert.match(g.$('#question-prompt').textContent, /spelling/);
  g.click('[data-choice="c0"]');
  assert.match(g.$('#capture-title').textContent, /captured/);
  assert.deepEqual(g.state().party, ['H0001']);
  g.click('#btn-continue');
  assert.equal(g.$('#modal').open, false);
  assert.match(g.$('#objective').textContent, /Tamar/);
  assert.equal(g.window.document.activeElement.id, 'game-canvas', 'focus returns to the world');

  // Worddex entry with status, history and next review.
  g.click('#btn-worddex');
  assert.match(g.$('#worddex-count').textContent, /1 captured/);
  assert.equal(g.$('#party-list').children.length, 6);
  assert.equal(g.$('[data-word="H0001"] .dex-status').textContent, 'Captured');
  g.click('[data-word="H0001"]');
  assert.equal(g.$('#entry-status').textContent, 'Captured');
  assert.match(g.$('#entry-review').textContent, /Next review/);
  assert.match(g.$('#entry-root').textContent, /Not listed/);
  assert.ok(g.$('#entry-history').children.length >= 3);
  assert.match(g.$('#entry-forms').textContent, /inflected/);
  g.escape();
  assert.ok(g.$('#worddex-list'), 'Esc steps back one screen');
  g.escape();
  assert.equal(g.$('#modal').open, false);

  // Reload the page from the same storage: exactly the same progress.
  const saved = structuredClone(g.state());
  const again = boot({ storage: g.storage });
  assert.match(again.$('#slots').textContent, /Letter Grove, 1 word captured/);
  again.click('#slot-1');
  assert.equal(again.$('#modal').open, false);
  assert.deepEqual(again.state(), saved);
});

test('a save made during an encounter resumes the same question after reload', () => {
  const g = boot();
  startNew(g);
  toTamar(g);
  g.click('#btn-continue');
  g.click('#btn-continue');
  finishLesson(g);
  g.click('#btn-continue');
  walkTo(g, { map: 'grove', x: 28, y: 20 });
  g.press('ArrowRight');
  g.click('#cmd-study');
  g.click('#btn-card-done');
  finishLesson(g);
  g.click('#cmd-read');
  g.click('#btn-hint');
  assert.ok(g.$('#hint-text'));
  const stem = g.state().encounter.current.stemId;

  const again = boot({ storage: g.storage });
  again.click('#slot-1');
  assert.equal(again.state().encounter.current.stemId, stem);
  assert.equal(again.state().encounter.current.hintsUsed, 1, 'a reload does not clear the hint');
  assert.ok(again.$('[data-choice]'));
});

test('complete first region: lessons, captures, Neri, the Field Gate, a badge and the exit, with no state edits', () => {
  const g = boot({ seed: 7 });
  startNew(g);
  toTamar(g);
  g.click('#btn-continue');
  g.click('#btn-continue');
  finishLesson(g);
  g.click('#btn-continue');

  // The arch and the bridge both refuse a beginner.
  const north = g.state();
  assert.equal(route(north, { map: 'grove', x: 27, y: 1 }), null, 'north bank is out of reach');

  // First capture.
  walkTo(g, { map: 'grove', x: 28, y: 20 });
  g.press('ArrowRight');
  solveEncounter(g);
  assert.equal(g.state().party.length, 1);

  // Second lesson, the five final forms.
  toTamar(g);
  g.click('#btn-continue');
  assert.ok(g.$('#finals-chart'));
  finishLesson(g);
  g.click('#btn-continue');
  assert.ok(g.state().skills['final-forms']);

  // Neri refuses until three are captured.
  walkTo(g, { map: 'grove', x: 17, y: 15 });
  face(g, 'up');
  g.press('Enter');
  assert.match(g.$('#dialogue-text').textContent, /2 more captured words/);
  g.click('#btn-continue');

  // Reed walking until two more words are captured. Encounters come from the seeded RNG.
  for (let guard = 0; guard < 400 && Object.values(g.state().words).filter(r => r.capturedAt).length < 3; guard++) {
    walkTo(g, guard % 2 ? { map: 'grove', x: 30, y: 19 } : { map: 'grove', x: 31, y: 19 });
  }
  assert.equal(Object.values(g.state().words).filter(r => r.capturedAt).length, 3);

  // Neri: one wrong answer explains and asks something else, then one right moves Neri aside.
  walkTo(g, { map: 'grove', x: 17, y: 15 });
  face(g, 'up');
  g.press('Enter');
  g.click('#btn-continue');
  const firstAsk = g.$('#question-prompt').textContent;
  g.click('[data-choice="c1"]');
  assert.match(g.$('#feedback-verdict').textContent, /Not this time/);
  g.click('#btn-continue');
  assert.notEqual(g.$('#question-prompt').textContent, firstAsk);
  g.click('[data-choice="c0"]');
  g.click('#btn-continue');
  g.click('#btn-continue');
  assert.equal(g.state().flags.neriCleared, true);

  // Field Gate: wrong door explains and turns the stone; the right door opens.
  walkTo(g, { map: 'grove', x: 14, y: 12 });
  face(g, 'up');
  g.press('Enter');
  assert.match(g.$('#dialogue-text').textContent, /door/);
  g.click('#btn-continue');
  walkTo(g, { map: 'grove', x: 15, y: 10 });
  face(g, 'up');
  g.press('Enter');
  assert.match(g.$('#door-title').textContent, /west/);
  assert.ok(g.$('#door-word bdi[lang="he"]'));
  g.click('#btn-push');
  assert.match(g.$('#feedback-verdict').textContent, /Not this time/);
  g.click('#btn-continue');
  assert.equal(g.state().flags.gateOpen, undefined);
  // After the stone turns the riddle asks for the east door.
  walkTo(g, { map: 'grove', x: 19, y: 10 });
  face(g, 'up');
  g.press('Enter');
  assert.match(g.$('#door-riddle').textContent, /scroll/);
  g.click('#btn-push');
  assert.match(g.$('#feedback-verdict').textContent, /Correct/);
  g.click('#btn-continue');
  g.click('#btn-continue');
  assert.equal(g.state().flags.gateOpen, true);

  // The arch still refuses without the seal.
  walkTo(g, { map: 'grove', x: 27, y: 1 });
  g.press('ArrowUp');
  assert.match(g.$('#dialogue-text').textContent, /Reed Seal/);
  g.click('#btn-continue');

  // Ilana's trial on unfamiliar words.
  walkTo(g, { map: 'hall', x: 5, y: 3 });
  face(g, 'up');
  g.press('Enter');
  g.click('#btn-continue');
  for (let guard = 0; guard < 12 && !g.$('#badge-title'); guard++) {
    const run = g.state().badgeRun;
    answerCurrent(g, content.questionById.get(run.current.questionId));
    g.click('#btn-continue');
  }
  assert.match(g.$('#badge-title').textContent, /Reed Seal/);
  g.click('#btn-continue');
  assert.match(g.$('#objective').textContent, /arch/);

  // The exit opens, and the game says plainly where this build ends.
  walkTo(g, { map: 'grove', x: 27, y: 1 });
  g.press('ArrowUp');
  assert.match(g.$('#dialogue-text').textContent, /Vowel Springs/);
  g.click('#btn-continue');
  g.click('#btn-continue');
  assert.equal(g.state().flags.exitOpened, true);
  assert.match(g.$('#objective').textContent, /build ends here/);

  // Saved and reloadable at the very end.
  const again = boot({ storage: g.storage });
  assert.match(again.$('#slots').textContent, /Reed Seal earned/);
});

function atFirstWord(g) {
  startNew(g);
  toTamar(g);
  g.click('#btn-continue');
  g.click('#btn-continue');
  finishLesson(g);
  g.click('#btn-continue');
  walkTo(g, { map: 'grove', x: 28, y: 20 });
  g.press('ArrowRight');
}

test('Back and Esc leave a question for the command menu, and returning resumes it with its hint', () => {
  const g = boot();
  atFirstWord(g);
  g.click('#cmd-study');
  g.click('#btn-card-done');
  finishLesson(g);
  g.click('#cmd-read');
  const stem = g.state().encounter.current.stemId;
  g.click('#btn-hint');
  g.click('#btn-back');
  assert.ok(g.$('#cmd-read'), 'Back shows the commands');
  g.click('#cmd-read');
  assert.equal(g.state().encounter.current.stemId, stem, 'the same question returns');
  g.escape();
  assert.ok(g.$('#cmd-read'), 'Esc shows the commands too');
  g.escape();
  assert.equal(g.$('#modal').open, false, 'Esc at the commands retreats');
  assert.equal(g.state().encounter, null);
});

test('backing out of the meaning lesson costs nothing, and Study offers it again', () => {
  const g = boot();
  atFirstWord(g);
  g.click('#cmd-study');
  g.click('#btn-card-done');
  assert.ok(g.$('#btn-next'), 'the meaning lesson is open');
  g.escape();
  assert.ok(g.$('#cmd-study'), 'back at the commands');
  assert.equal(g.$('#cmd-understand').getAttribute('aria-disabled'), 'true');
  g.click('#cmd-study');
  assert.ok(g.$('#btn-next'), 'Study reopens the lesson');
  finishLesson(g);
  assert.equal(g.state().encounter.assistedNext, false, 'the next answer can still count');
});

test('the reeds offer a due review a day later, and the Worddex shows the delayed evidence', () => {
  const clock = { t: Date.UTC(2027, 0, 4, 12) };
  const g = boot({ clock, seed: 9 });
  atFirstWord(g);
  solveEncounter(g);
  assert.equal(g.state().party.length, 1);
  clock.t += 25 * 3_600_000; // synthetic clock: one day and an hour later

  let reviewed = false;
  const onScreen = screen => {
    const s = screen.state();
    if (s.encounter?.kind === 'review') {
      assert.equal(s.encounter.wordId, 'H0001');
      assert.match(screen.$('#modal').textContent, /First answer counts/);
      answerCurrent(screen, content.questionById.get(s.encounter.current.questionId));
      assert.match(screen.$('#review-note').textContent, /Next review/);
      screen.click('#btn-continue');
      reviewed = true;
    } else {
      solveEncounter(screen);
    }
  };
  for (let guard = 0; guard < 200 && !reviewed; guard++) {
    walkTo(g, guard % 2 ? { map: 'grove', x: 30, y: 19 } : { map: 'grove', x: 31, y: 19 }, onScreen);
  }
  assert.ok(reviewed, 'a review appeared in the reeds');
  g.click('#btn-worddex');
  assert.equal(g.$('[data-word="H0001"] .dex-status').textContent, 'Practiced');
});

test('the secret glade is found on foot and gives a real passage', () => {
  const g = boot();
  startNew(g);
  walkTo(g, { map: 'grove', x: 2, y: 20 });
  face(g, 'down');
  g.press('Enter');
  g.click('#btn-continue');
  assert.match(g.$('#passage-translation').textContent, /father or a brother/);
  g.click('#btn-continue');
  assert.equal(g.state().flags.fragmentFound, true);
});

test('typing: the on-screen keyboard enters logical letters, delete and clear work, and a final-form slip is explained', () => {
  const g = boot();
  startNew(g);
  toTamar(g);
  g.click('#btn-continue');
  g.click('#btn-continue');
  finishLesson(g);
  g.click('#btn-continue');
  walkTo(g, { map: 'grove', x: 28, y: 20 });
  g.press('ArrowRight');
  g.click('#cmd-study');
  g.click('#btn-card-done');
  finishLesson(g);
  // Retire the mirror stem by failing it, so the typed stem is next.
  g.click('#cmd-inscribe');
  g.click('[data-choice="c1"]');
  g.click('#btn-continue');
  g.click('#cmd-inscribe');
  const input = g.$('#answer-input');
  assert.equal(input.getAttribute('dir'), 'rtl');
  assert.equal(g.window.document.activeElement.id, 'answer-input');
  assert.ok(g.$('#hebrew-keyboard'));
  // Physical typing belongs to the field: keys there never reach the world.
  const before = [g.state().x, g.state().y];
  input.dispatchEvent(new g.window.KeyboardEvent('keydown', { key: 'a', bubbles: true }));
  g.app.tick(0);
  assert.deepEqual([g.state().x, g.state().y], before);

  g.click('[data-key="ב"]');
  g.click('[data-key="א"]');
  assert.equal(input.value, 'בא', 'stored in the order typed, never reversed');
  g.click('#key-delete');
  assert.equal(input.value, 'ב');
  g.click('#key-clear');
  assert.equal(input.value, '');
  g.click('#btn-check');
  assert.ok(g.$('#answer-input'), 'an empty answer is not submitted');

  // Recognition is always a way out, and it is recorded as recognition.
  g.click('#btn-use-choices');
  assert.equal(g.state().encounter.current.responseMode, 'recognition');
  assert.ok(g.$('[data-choice]'));
  g.click('[data-choice="c0"]');
  assert.equal(g.state().words.H0001.captureSteps[0].responseMode, 'recognition');
});

test('settings: sound starts off, calm toggles, and erasing asks first', () => {
  const g = boot();
  startNew(g);
  assert.equal(g.state().settings.sound, false);
  g.click('#btn-menu');
  assert.equal(g.$('#toggle-sound').getAttribute('aria-checked'), 'false');
  g.click('#toggle-calm');
  assert.equal(g.state().settings.calm, true);
  assert.ok(g.window.document.body.classList.contains('calm'));
  g.click('#btn-reset');
  assert.match(g.$('#modal-title').textContent, /Erase slot 1/);
  g.click('#btn-erase-cancel');
  assert.ok(g.storage.getItem(slotKey(1)), 'cancel keeps the save');
  g.click('#btn-reset');
  g.click('#btn-erase-confirm');
  assert.equal(g.storage.getItem(slotKey(1)), null);
  assert.ok(g.$('#title'), 'back at the title screen');
});

test('blocked storage warns and still lets you play and export', () => {
  const g = boot({ storage: null });
  assert.equal(g.$('#save-warning').hidden, false);
  g.click('#slot-1');
  assert.match(g.$('#save-warning').textContent, /not being saved/);
  g.click('#btn-continue');
  g.click('#btn-continue');
  g.press('ArrowDown');
  assert.equal(g.state().steps, 1);
});

test('unreadable slot data is shown, kept and only removed after confirmation', () => {
  const storage = memory({ [slotKey(2)]: '{broken' });
  const g = boot({ storage });
  assert.equal(g.$('#slot-2').tagName, 'P', 'an unreadable slot has no start button');
  assert.match(g.$('#slot-2').textContent, /can't be read/);
  g.click('#slot-1');
  assert.equal(storage.getItem(slotKey(2)), '{broken');
  const fresh = boot({ storage });
  fresh.click('#slot-erase-2');
  fresh.click('#btn-erase-confirm');
  assert.equal(storage.getItem(slotKey(2)), null);
});

test('a bad import leaves the live game untouched, and a good one offers a slot', async () => {
  const g = boot();
  startNew(g);
  g.press('ArrowDown');
  const before = structuredClone(g.state());
  const beforeText = g.storage.getItem(slotKey(1));
  const file = g.$('#import-file');
  const feed = async text => {
    Object.defineProperty(file, 'files', { value: [{ size: text.length, text: async () => text }], configurable: true });
    file.dispatchEvent(new g.window.Event('change'));
    await new Promise(resolve => setTimeout(resolve, 0));
  };
  g.click('#btn-menu');
  g.click('#btn-import');
  await feed('{"format":"alephQuest","version":1,"state":{"party":"nope"}}');
  assert.match(g.$('#import-error').textContent, /unchanged/);
  assert.deepEqual(g.state(), before);
  assert.equal(g.storage.getItem(slotKey(1)), beforeText);
  g.click('#btn-continue');
  assert.ok(g.$('#btn-export'), 'back at the menu');

  g.click('#btn-import');
  await feed(beforeText);
  g.click('#import-to-2');
  assert.deepEqual(g.state(), before);
  assert.ok(g.storage.getItem(slotKey(2)));
});
