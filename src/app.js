// Connects input, the game loop, saving and the screens. Pure rules live in engine/learning/storage.
import { content } from './content.js';
import { newGame, tryMove, interact, objective, promptFor } from './engine.js';
import { MAPS } from './world.js';
import { drawWorld } from './render.js';
import { createUI, el } from './ui.js';
import { play } from './audio.js';
import {
  browserStorage, listSlots, loadSlot, saveSlot, deleteSlot, exportText, parseImport, lastSlotKey, MAX_SAVE_BYTES,
} from './storage.js';

const KEY_DIRS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', W: 'up', s: 'down', S: 'down', a: 'left', A: 'left', d: 'right', D: 'right' };
const STEP_MS = 150;
const FRAME_MS = 480;
const ATTRIBUTION = [
  'Original work of the Open Scriptures Hebrew Bible available at https://github.com/openscriptures/morphhb',
  'Open Scriptures Hebrew Bible Project: lemma, morphology, and digital Hebrew lexicon data licensed under Creative Commons Attribution 4.0 International, https://creativecommons.org/licenses/by/4.0/. Westminster Leningrad Codex biblical text is public domain.',
  'Changes for Aleph Quest: selected passages and vocabulary; converted XML to application records; removed source segmentation separators in reading text; display without cantillation, meteg or paseq; original pedagogical glosses and explanations added. No endorsement implied.',
  'Digital Strong\'s Hebrew dictionary headwords: https://github.com/openscriptures/HebrewLexicon, CC BY 4.0.',
  'Noto Serif Hebrew, copyright 2022 The Noto Project Authors, SIL Open Font License 1.1.',
];

export function startApp({ now = () => Date.now(), storage = browserStorage(), seed, reducedMotion } = {}) {
  const canvas = document.getElementById('game-canvas');
  const modal = document.getElementById('modal');
  const objectiveLine = document.getElementById('objective');
  const promptLine = document.getElementById('prompt');
  const placeLine = document.getElementById('place');
  const warning = document.getElementById('save-warning');
  const topButtons = document.getElementById('top-buttons');
  const pad = document.getElementById('pad');
  const importFile = document.getElementById('import-file');

  const prefersReduced = reducedMotion ?? (globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
  let state = null;
  let slot = 1;
  let held = null;
  let pendingDir = null;
  let walk = null;
  let frame = 0;
  let lastFrameAt = 0;
  let afterWalk = null;
  let message = '';
  let importTarget = null;

  const sound = name => play(name, state?.settings.sound);

  function setWarning(text) {
    warning.hidden = !text;
    warning.textContent = text ?? '';
  }

  function persist() {
    if (!state) return;
    const result = saveSlot(storage, slot, state, content);
    if (result.ok) {
      setWarning(null);
      try { storage.setItem(lastSlotKey, String(slot)); } catch { /* the save itself succeeded */ }
    } else if (result.reason === 'unreadable') {
      setWarning(`Slot ${slot} holds data this game can't read, so autosave left it alone. Open Menu to export your progress.`);
    } else {
      setWarning('Progress is not being saved: this browser blocked storage. It stays in memory until you close the page. Open Menu and choose Export to keep it.');
    }
  }

  function refreshHud() {
    if (!state) return;
    placeLine.textContent = MAPS[state.map].title;
    objectiveLine.textContent = objective(state, content);
    promptLine.textContent = message || promptFor(state);
  }

  function setMessage(text) {
    message = text;
    refreshHud();
  }

  const ui = createUI({
    modal, now, persist, sound, refreshHud,
    getState: () => state,
    onClosed: () => { canvas.focus(); draw(); },
  });

  function draw() {
    if (state) drawWorld(canvas, state, { walk, frame: state.settings.calm || prefersReduced ? 0 : frame });
  }

  // Game flow

  function enterGame(chosenSlot, loaded) {
    slot = chosenSlot;
    state = loaded ?? newGame(now(), seed);
    topButtons.hidden = false;
    pad.hidden = false;
    document.body.classList.toggle('calm', state.settings.calm);
    draw();
    persist();
    refreshHud();
    ui.close();
    if (state.encounter) { ui.encounter(); return; }
    if (!loaded) {
      ui.dialogue('The archive', [
        'You are an apprentice scribe. Last night a storm tore through the archive, and its scrolls scattered across Letter Grove.',
        'Walk with the arrow keys or WASD, or the pad on a touch screen. Press Enter or Space, or A on the pad, to talk and read. Your goal is always shown below the map.',
      ]);
    }
  }

  function act() {
    if (!state || ui.isOpen() || walk) return;
    message = '';
    const result = interact(state, content, now());
    if (result.kind === 'dialogue') {
      ui.dialogue(result.speaker, result.lines, result.then ? () => follow(result.then) : undefined);
    } else if (result.kind === 'door') {
      ui.door(result.doorId);
    } else if (result.kind === 'riddle') {
      ui.riddle();
    } else if (result.kind === 'exit') {
      handleEvent(tryMove(state, 'up', content, now()).event);
    } else {
      refreshHud();
    }
  }

  function follow(then) {
    if (then.type === 'lesson') {
      const id = then.id;
      ui.lesson(id, finished => {
        if (finished === false) { ui.close(); return; }
        ui.dialogue('Tamar', [id === 'l-letters'
          ? 'Good. Now go east along the path, into the tall reeds. A word will surface. Read its card, then show me you can recognize it and write it.'
          : 'Those five shapes will turn up everywhere. Back to the reeds. New words can reach you now.']);
      });
    } else if (then.type === 'puzzle') ui.puzzle(then.group);
    else if (then.type === 'badge') ui.badge();
    else if (then.type === 'passage') ui.passage(then.id);
  }

  function handleEvent(event) {
    if (!event) return;
    if (event.type === 'encounter') {
      ui.beginEncounter(event);
    } else if (event.type === 'reeds-silent') {
      setMessage('The reeds rustle, but you can\'t read them yet. Find Tamar first.');
    } else if (event.type === 'exit-sealed') {
      ui.dialogue('The north arch', ['A seal of reeds and wax holds the arch shut. It will only open for someone carrying the Reed Seal.']);
    } else if (event.type === 'exit-open') {
      ui.dialogue('The north arch', [
        'The seal crumbles as you lift the Reed Seal. Beyond the arch the road runs down toward the Vowel Springs.',
        'This is as far as the archive has been restored. Letter Grove is finished, so your words, your Worddex and your seal are saved here.',
      ]);
    }
  }

  function stepTo(dir) {
    message = '';
    const before = { map: state.map, x: state.x, y: state.y };
    const result = tryMove(state, dir, content, now());
    if (!result.moved) {
      sound('bump');
      handleEvent(result.event);
      refreshHud();
      draw();
      return;
    }
    sound('step');
    persist();
    if (prefersReduced || state.settings.calm || result.warped || before.map !== state.map) {
      handleEvent(result.event);
    } else {
      walk = { fromX: before.x, fromY: before.y, startedAt: performance.now(), t: 0 };
      afterWalk = () => handleEvent(result.event);
    }
    refreshHud();
  }

  // The loop never runs game rules while a screen is open.
  function tick(time = performance.now()) {
    if (state && !ui.isOpen()) {
      if (walk) {
        walk.t = Math.min(1, (time - walk.startedAt) / STEP_MS);
        if (walk.t >= 1) {
          walk = null;
          const next = afterWalk;
          afterWalk = null;
          next?.();
        }
      }
      if (!walk && !ui.isOpen()) {
        const dir = pendingDir ?? held;
        pendingDir = null;
        if (dir) stepTo(dir);
      }
      if (time - lastFrameAt > FRAME_MS) { frame = (frame + 1) % 2; lastFrameAt = time; }
      draw();
    }
  }

  function loop(time) {
    tick(time);
    requestAnimationFrame(loop);
  }

  // Input

  window.addEventListener('keydown', event => {
    if (ui.isOpen() || !state || event.target.matches?.('input, textarea, select, [contenteditable]')) return;
    const dir = KEY_DIRS[event.key];
    if (dir) {
      event.preventDefault();
      if (!event.repeat) pendingDir = dir;
      held = dir;
    } else if ((event.key === 'Enter' || event.key === ' ') && !event.target.matches?.('button, a')) {
      event.preventDefault();
      act();
    } else if (event.key === 'm' || event.key === 'M') {
      menu();
    }
  });
  window.addEventListener('keyup', event => { if (KEY_DIRS[event.key] === held) held = null; });
  window.addEventListener('blur', () => { held = null; });

  for (const padButton of document.querySelectorAll('#dpad button')) {
    const dir = padButton.dataset.dir;
    padButton.addEventListener('pointerdown', event => {
      event.preventDefault();
      pendingDir = dir;
      held = dir;
    });
    for (const end of ['pointerup', 'pointercancel', 'pointerleave']) padButton.addEventListener(end, () => { if (held === dir) held = null; });
    // Keyboard activation of a pad button has no pointer events.
    padButton.addEventListener('click', event => { if (event.detail === 0) pendingDir = dir; });
  }
  document.getElementById('btn-a').addEventListener('click', act);
  document.getElementById('btn-worddex').addEventListener('click', () => { if (state && !ui.isOpen()) ui.worddex(); });
  document.getElementById('btn-menu').addEventListener('click', () => { if (state && !ui.isOpen()) menu(); });

  // Save management

  function download(text, name) {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const link = el('a', { href: url, download: name });
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  importFile.addEventListener('change', async () => {
    const file = importFile.files[0];
    importFile.value = '';
    if (!file) return;
    if (file.size > MAX_SAVE_BYTES) { importResult({ ok: false, errors: ['This file is too large to be a save.'] }); return; }
    importResult(parseImport(await file.text(), content));
  });

  function chooseImport(returnTo) {
    importTarget = returnTo;
    importFile.click();
  }

  function importResult(result) {
    const back = importTarget ?? (state ? menu : title);
    if (!result.ok) {
      ui.show([
        el('h2', { id: 'import-error-title', text: 'That save wasn\'t loaded' }),
        el('p', { id: 'import-error', text: `Your current progress is unchanged. ${result.errors[0]}` }),
        result.errors.length > 1 && el('p', { class: 'small', text: `${result.errors.length - 1} more problem(s) found.` }),
        el('button', { type: 'button', id: 'btn-continue', text: 'Back', onclick: back, 'data-autofocus': true }),
      ], { onEscape: back });
      return;
    }
    const slots = listSlots(storage, content);
    ui.show([
      el('h2', { id: 'modal-title', text: 'Load this save' }),
      el('p', { text: 'The file checks out. Choose a slot for it. Anything already in that slot is replaced.' }),
      el('div', { class: 'tools stack' }, ...slots.map(entry => el('button', {
        type: 'button', id: `import-to-${entry.slot}`, text: `Slot ${entry.slot}: ${entry.status === 'ok' ? 'replace existing save' : entry.status === 'corrupt' ? 'replace unreadable data' : 'empty'}`,
        onclick: () => {
          saveSlot(storage, entry.slot, result.state, content, { replaceUnreadable: true });
          enterGame(entry.slot, result.state);
        },
      }))),
      el('button', { type: 'button', id: 'btn-back', class: 'quiet', text: 'Cancel', onclick: back }),
    ], { onEscape: back });
  }

  function title() {
    state = null;
    held = pendingDir = walk = afterWalk = null;
    topButtons.hidden = true;
    pad.hidden = true;
    placeLine.textContent = 'Aleph Quest';
    objectiveLine.textContent = '';
    promptLine.textContent = '';
    const slots = listSlots(storage, content);
    const blocked = slots.every(entry => entry.status === 'unavailable');
    if (blocked) setWarning('This browser is blocking storage, so progress lasts only until you close the page. Export from the Menu to keep it.');
    else setWarning(null);

    const rows = slots.map(entry => {
      const label = { ok: () => `Continue slot ${entry.slot}`, empty: () => `New game in slot ${entry.slot}`, unavailable: () => `Play without saving (slot ${entry.slot})`, corrupt: () => `Slot ${entry.slot} can't be read` }[entry.status]();
      const summary = entry.status === 'ok' ? slotSummary(entry.state)
        : entry.status === 'corrupt' ? 'Its data is kept untouched until you erase it.' : null;
      const buttons = [];
      if (entry.status === 'ok' || entry.status === 'empty' || entry.status === 'unavailable') {
        buttons.push(el('button', { type: 'button', id: `slot-${entry.slot}`, class: 'slot-main', text: label, onclick: () => enterGame(entry.slot, entry.state ?? null) }));
      } else {
        buttons.push(el('p', { id: `slot-${entry.slot}`, class: 'slot-main', text: label }));
      }
      if (entry.status === 'ok') buttons.push(el('button', { type: 'button', id: `slot-export-${entry.slot}`, class: 'quiet', text: 'Export', onclick: () => download(exportText(entry.state, now()), `aleph-quest-slot-${entry.slot}.json`) }));
      if (entry.status === 'ok' || entry.status === 'corrupt') buttons.push(el('button', { type: 'button', id: `slot-erase-${entry.slot}`, class: 'quiet', text: 'Erase', onclick: () => confirmErase(entry.slot, title) }));
      return el('li', { class: 'slot', 'data-status': entry.status }, el('div', { class: 'slot-buttons' }, ...buttons), summary && el('p', { class: 'small', text: summary }));
    });
    ui.show([
      el('h1', { id: 'title', text: 'Aleph Quest' }),
      el('p', { id: 'tagline', text: 'A storm scattered the archive. Walk the grove, learn to read what hides there, and bring the words home.' }),
      el('ol', { id: 'slots', class: 'slots' }, ...rows),
      el('div', { class: 'tools' },
        el('button', { type: 'button', id: 'btn-import', class: 'quiet', text: 'Import a save', onclick: () => chooseImport(title) }),
        el('button', { type: 'button', id: 'btn-credits', class: 'quiet', text: 'Credits and licenses', onclick: () => credits(title) })),
    ], { kind: 'title', onEscape: null });
  }

  function slotSummary(saved) {
    const captured = Object.values(saved.words).filter(r => r.capturedAt != null).length;
    const seal = Object.keys(saved.badges).length ? ', Reed Seal earned' : '';
    return `${MAPS[saved.map].title}, ${captured} ${captured === 1 ? 'word' : 'words'} captured${seal}.`;
  }

  function confirmErase(target, back) {
    ui.show([
      el('h2', { id: 'modal-title', text: `Erase slot ${target}?` }),
      el('p', { text: 'This removes the save for good. Export it first if you may want it back.' }),
      el('div', { class: 'tools' },
        el('button', { type: 'button', id: 'btn-erase-confirm', class: 'danger', text: `Erase slot ${target}`, onclick: () => {
          const wasCurrent = state && slot === target;
          deleteSlot(storage, target);
          if (wasCurrent) { state = null; title(); } else back();
        } }),
        el('button', { type: 'button', id: 'btn-erase-cancel', text: 'Keep it', onclick: back, 'data-autofocus': true })),
    ], { onEscape: back });
  }

  function menu() {
    const toggle = (id, label, on, flip) => el('button', {
      type: 'button', id, role: 'switch', 'aria-checked': String(on), class: 'quiet', text: `${label}: ${on ? 'on' : 'off'}`, onclick: () => { flip(); persist(); menu(); },
    });
    const { settings } = state;
    ui.show([
      el('h2', { id: 'modal-title', text: 'Menu' }),
      el('p', { id: 'menu-slot', class: 'small', text: `Playing slot ${slot}. Progress saves automatically.` }),
      el('div', { class: 'tools stack' },
        el('button', { type: 'button', id: 'menu-worddex', text: 'Worddex', onclick: () => ui.worddex(menu) }),
        toggle('toggle-sound', 'Sound effects', settings.sound, () => { settings.sound = !settings.sound; }),
        toggle('toggle-calm', 'Calm reading', settings.calm, () => { settings.calm = !settings.calm; document.body.classList.toggle('calm', settings.calm); }),
        el('button', { type: 'button', id: 'toggle-mode', class: 'quiet', text: `Written answers: ${settings.responseMode === 'typing' ? 'type them' : 'choose from options'}`, onclick: () => {
          settings.responseMode = settings.responseMode === 'typing' ? 'recognition' : 'typing';
          persist();
          menu();
        } }),
        el('button', { type: 'button', id: 'btn-export', text: 'Export save', onclick: () => download(exportText(state, now()), `aleph-quest-slot-${slot}.json`) }),
        el('button', { type: 'button', id: 'btn-import', class: 'quiet', text: 'Import a save', onclick: () => chooseImport(menu) }),
        el('button', { type: 'button', id: 'btn-credits', class: 'quiet', text: 'Credits and licenses', onclick: () => credits(menu) }),
        el('button', { type: 'button', id: 'btn-title', class: 'quiet', text: 'Back to title', onclick: () => { persist(); title(); } }),
        el('button', { type: 'button', id: 'btn-reset', class: 'quiet', text: `Erase slot ${slot}`, onclick: () => confirmErase(slot, menu) }),
        el('button', { type: 'button', id: 'btn-close-menu', text: 'Close', onclick: ui.close, 'data-autofocus': true })),
    ], { onEscape: ui.close });
  }

  function credits(back) {
    ui.show([
      el('h2', { id: 'modal-title', text: 'Credits and licenses' }),
      ...ATTRIBUTION.map(line => el('p', { class: 'small', text: line })),
      el('p', { class: 'small' }, 'Full notices: ',
        el('a', { href: './notices/NotoSerifHebrew-OFL.txt', text: 'font license' }), ', ',
        el('a', { href: './notices/morphhb-LICENSE.md', text: 'OSHB license' }), ', ',
        el('a', { href: './notices/THIRD-PARTY-NOTICES.md', text: 'all third-party notices' }), '.'),
      el('p', { class: 'small', text: 'Lesson order follows the table of contents of Allen P. Ross, Introducing Biblical Hebrew. Explanations and questions are original. Not endorsed by the author or publisher. Source code: MIT.' }),
      el('button', { type: 'button', id: 'btn-back', text: 'Back', onclick: back, 'data-autofocus': true }),
    ], { onEscape: back });
  }

  title();
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(loop);

  return { tick, getState: () => state, ui };
}
