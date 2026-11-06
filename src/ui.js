// Semantic DOM for everything Hebrew: dialogue, lessons, encounters, Worddex and menus.
// All text goes through textContent. Hebrew stays in logical order and whole words are never split.
import { checkAnswer, comparisonKey, deleteLast, sacredDisplay } from './answers.js';
import { drawWordSprite } from './render.js';
import { markLessonDone, setFlag, nextRandom, capturedCount, regionUnlocked, currentStage } from './engine.js';
import {
  startEncounter, commandStates, completeStudy, openQuestion, startReview, useHint, setCurrentResponseMode,
  submit, retreat, statusOf, addToParty, removeFromParty, PARTY_LIMIT, reviewEligible, knowledgeRank, abilityOf, unlockedExamples,
  nextRelatedForm, answerRelatedForm, wardCandidates, noteLookup, helpFromLookup,
} from './learning.js';
import {
  currentPuzzle, answerPuzzle, startBadgeRun, openBadgeQuestion, submitBadgeAnswer, useBadgeHint, setBadgeResponseMode, badgeProgress,
  openGate, useGateHint, setGateResponseMode, submitGate, gateProgress, gatePool, claimSecret, restoreArchive, completeReadingWithoutQuestions,
} from './checkpoints.js';
import { DOOR_NAMES, MAPS, OBJECTS } from './world.js';

const ALPHABET = [
  ['א', 'alef'], ['ב', 'bet'], ['ג', 'gimel'], ['ד', 'dalet'], ['ה', 'he'], ['ו', 'vav'], ['ז', 'zayin'], ['ח', 'het'], ['ט', 'tet'], ['י', 'yod'], ['כ', 'kaf'],
  ['ל', 'lamed'], ['מ', 'mem'], ['נ', 'nun'], ['ס', 'samekh'], ['ע', 'ayin'], ['פ', 'pe'], ['צ', 'tsade'], ['ק', 'qof'], ['ר', 'resh'], ['ש', 'shin'], ['ת', 'tav'],
];
const FINALS = [['כ', 'ך', 'kaf'], ['מ', 'ם', 'mem'], ['נ', 'ן', 'nun'], ['פ', 'ף', 'pe'], ['צ', 'ץ', 'tsade']];
const KEYBOARD_LETTERS = 'אבגדהוזחטיכךלמםנןסעפףצץקרשת';
const KEYBOARD_POINTS = [
  ['ְ', 'shewa'], ['ֱ', 'hataf segol'], ['ֲ', 'hataf patah'], ['ֳ', 'hataf qamats'], ['ִ', 'hiriq'], ['ֵ', 'tsere'], ['ֶ', 'segol'], ['ַ', 'patah'],
  ['ָ', 'qamats'], ['ׇ', 'qamats qatan'], ['ֹ', 'holam'], ['ֻ', 'qubuts'], ['ּ', 'dagesh or mappiq'], ['ׁ', 'shin dot'], ['ׂ', 'sin dot'],
];
const COMMAND_LABELS = { read: 'Read', understand: 'Understand', inscribe: 'Inscribe', analyze: 'Analyze', build: 'Build' };
const FAMILY_LABELS = { 'read-letter': 'Read', 'understand-meaning': 'Understand', 'inscribe-spelling': 'Inscribe' };
const STATUS_HELP = {
  Seen: 'You have met this word.',
  Studied: 'You have read its card.',
  Captured: 'You showed it three different ways. A later review will test whether it stuck.',
  Practiced: 'You recalled it on a later review.',
  Mastered: 'You recalled it on four separate days, in varied ways. This is provisional and later reviews still count.',
};
const STATUS_ORDER = ['Seen', 'Studied', 'Captured', 'Practiced', 'Mastered'];
const RANK_NAMES = { 0: 'Not captured', 1: 'Known', 2: 'Familiar', 3: 'Deep' };
const ABILITY_NAMES = { name: 'Naming: this word can answer seals that want a name', deed: 'Deed: this word can answer seals that want an action', link: 'Linking: this word can answer seals that want a joining word' };
const RELATIONSHIPS = [['inflection', 'The same word, inflected'], ['derivation', 'A related word, derived'], ['separate-lexeme', 'A separate dictionary word']];
const HEBREW_RUN = /[֐-׿]+(?:[ ־][֐-׿]+)*/g;
const HAS_HEBREW = /[֐-׿]/;
const SACRED_NOTE = 'Display preference: the divine name is shown here as ה׳. The source text is unchanged, and this quotation is altered only on your screen. Change this in the Menu.';

export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'onclick') node.addEventListener('click', value);
    else if (key === 'oninput') node.addEventListener('input', value);
    else if (key === 'onchange') node.addEventListener('change', value);
    else if (value !== undefined && value !== null && value !== false) node.setAttribute(key, value === true ? '' : value);
  }
  node.append(...children.filter(Boolean));
  return node;
}

let sacredPreference = () => 'written';
let sacredAltered = false;

// Every Hebrew string on screen passes here, so the name preference holds everywhere and is always disclosed.
function he(text, cls = 'he') {
  const shown = sacredDisplay(text, sacredPreference());
  if (shown !== text) sacredAltered = true;
  return el('bdi', { lang: 'he', dir: 'rtl', class: cls, text: shown });
}

// English with embedded Hebrew: each Hebrew run gets its own bidi isolate and reading size.
function mixed(text, tag = 'p', props = {}) {
  const node = el(tag, props);
  let last = 0;
  for (const match of text.matchAll(HEBREW_RUN)) {
    node.append(text.slice(last, match.index), he(match[0], 'he he-inline'));
    last = match.index + match[0].length;
  }
  node.append(text.slice(last));
  return node;
}

const button = (label, onclick, props = {}) => el('button', { type: 'button', text: label, onclick, ...props });

function shuffled(state, list) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(nextRandom(state) * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const formatDate = at => new Date(at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
const prettyRef = ref => ref.replace('Gen.', 'Genesis ').replace(/\.(\d+)$/, ':$1');

// ctx: { modal, content, getState, now, persist, sound, onClosed, refreshHud, menu }
export function createUI(ctx) {
  const { modal, content } = ctx;
  let escape = null;
  sacredPreference = () => ctx.getState()?.settings.sacredName ?? 'written';

  function discloseSacred(container = modal) {
    const present = modal.querySelector('#sacred-note');
    if (sacredAltered && !present) container.append(el('p', { id: 'sacred-note', class: 'small', text: SACRED_NOTE }));
    sacredAltered = false;
  }

  function show(nodes, { kind = 'panel', onEscape = null, focus = null } = {}) {
    escape = onEscape;
    modal.className = kind;
    modal.replaceChildren(...nodes.filter(Boolean));
    discloseSacred();
    modal.setAttribute('aria-label', modal.querySelector('h1, h2')?.textContent ?? 'Aleph Quest');
    if (!modal.open) modal.showModal();
    const target = (focus && modal.querySelector(focus)) || modal.querySelector('[data-autofocus]') || modal.querySelector('button:not([aria-disabled="true"]), input');
    // Tall screens open at their top. If the first control is below the fold the panel takes focus, and Tab reaches the controls in order.
    const onScreen = target && target.getBoundingClientRect().bottom <= modal.getBoundingClientRect().bottom;
    (onScreen ? target : modal).focus({ preventScroll: true });
    modal.scrollTop = 0;
    ctx.persist();
    ctx.refreshHud();
  }

  function close() {
    escape = null;
    if (modal.open) modal.close();
    modal.replaceChildren();
    ctx.persist();
    ctx.refreshHud();
    ctx.onClosed();
  }

  modal.addEventListener('cancel', event => {
    event.preventDefault();
    if (escape) escape();
  });

  // Arrow keys move between buttons, except while typing in a field or scrolling the focused panel.
  modal.addEventListener('keydown', event => {
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key) || event.target === modal || event.target.matches('input, textarea, select')) return;
    const buttons = [...modal.querySelectorAll('button:not([aria-disabled="true"])')];
    const index = buttons.indexOf(document.activeElement);
    const forward = event.key === 'ArrowDown' || event.key === 'ArrowRight';
    const next = buttons[(index + (forward ? 1 : -1) + buttons.length) % buttons.length];
    if (next) { event.preventDefault(); next.focus(); }
  });

  const heading = (text, id = 'modal-title') => el('h2', { id, text });

  // Dialogue

  function dialogue(speaker, lines, after = close) {
    let index = 0;
    const page = () => {
      const last = index === lines.length - 1;
      show([
        el('h2', { class: 'speaker', text: speaker }),
        mixed(lines[index], 'p', { id: 'dialogue-text' }),
        el('p', { class: 'keys', text: 'Enter or Space continues. Esc skips.' }),
        button(last ? 'Continue' : 'Next', () => { if (last) after(); else { index += 1; page(); } }, { id: 'btn-continue', 'data-autofocus': true }),
      ], { kind: 'talk', onEscape: close });
    };
    page();
  }

  // Question rendering, shared by guided practice, encounters and checkpoints.

  function questionView(question, { state, onSubmit, onHint, onBack, responseMode = 'recognition', onRecognition, label, hintShown = false }) {
    const area = [];
    if (label) area.push(el('p', { class: 'step-label', text: label }));
    area.push(mixed(question.prompt, 'p', { id: 'question-prompt' }));
    if (question.displayHebrew) area.push(el('div', { class: 'word-plate plain' }, he(question.displayHebrew, 'he he-large')));

    const pairing = question.format === 'match' && responseMode !== 'recognition';
    const usesChoices = question.format === 'choice' || question.format === 'door' || ((question.format === 'type' || question.format === 'match') && responseMode === 'recognition');
    if (usesChoices) {
      const options = shuffled(state, question.choices ?? question.recognitionChoices);
      area.push(el('div', { class: 'choices', role: 'group', 'aria-label': 'Answer choices' }, ...options.map(option => {
        const node = el('button', { type: 'button', class: option.lang === 'he' ? 'choice choice-he' : 'choice', 'data-choice': option.id, onclick: () => onSubmit(option.id) });
        node.append(option.lang === 'he' ? he(option.text) : option.text);
        return node;
      })));
    } else if (question.format === 'tokens') {
      area.push(tokenPicker(state, question, onSubmit));
    } else if (pairing) {
      area.push(pairPicker(state, question, onSubmit, onRecognition));
    } else {
      area.push(typeEntry(question, onSubmit, onRecognition));
    }

    const tools = [];
    // A hint already paid for stays on screen when the attempt resumes, so it can't be bought twice or lost.
    if (hintShown) area.push(mixed(`Hint: ${question.hint}`, 'p', { id: 'hint-text', class: 'hint' }));
    else if (onHint) tools.push(button('Hint (this answer won\'t count)', () => {
      const hint = onHint();
      ctx.persist();
      tools.at(0).replaceWith(mixed(`Hint: ${hint}`, 'p', { id: 'hint-text', class: 'hint' }));
      discloseSacred();
    }, { id: 'btn-hint', class: 'quiet' }));
    if (onBack) tools.push(button('Back', onBack, { id: 'btn-back', class: 'quiet' }));
    if (tools.length) area.push(el('div', { class: 'tools' }, ...tools));
    return area;
  }

  function tokenPicker(state, question, onSubmit) {
    const picked = [];
    const tray = el('div', { id: 'token-tray', class: 'tray', lang: 'he', dir: 'rtl', 'aria-live': 'polite' });
    const textOf = id => question.tokenOptions.find(t => t.id === id).text;
    const redraw = () => tray.replaceChildren(...picked.map(id => he(textOf(id))));
    const tiles = shuffled(state, question.tokenOptions).map(token => {
      const node = el('button', { type: 'button', class: 'choice choice-he tile', 'data-token': token.id, onclick: () => { picked.push(token.id); redraw(); } });
      node.append(he(token.text));
      return node;
    });
    return el('div', { class: 'tokens' }, tray, el('div', { class: 'choices', role: 'group', 'aria-label': 'Tiles' }, ...tiles), el('div', { class: 'tools' },
      button('Undo', () => { picked.pop(); redraw(); }, { id: 'btn-token-undo', class: 'quiet' }),
      button('Check', () => onSubmit([...picked]), { id: 'btn-check' })));
  }

  // Each left side gets a row of the distinct right sides, so pairing works the same by key and by touch.
  function pairPicker(state, question, onSubmit, onRecognition) {
    const chosen = question.pairs.map(() => null);
    const rights = shuffled(state, [...new Set(question.pairs.map(pair => pair.right))]);
    const label = text => (HAS_HEBREW.test(text) ? he(text, 'he he-inline') : text);
    const note = el('p', { id: 'pair-note', class: 'hint', role: 'status', hidden: true });
    const rows = question.pairs.map((pair, row) => {
      const buttons = rights.map(right => {
        const node = el('button', { type: 'button', class: 'choice pair-choice', 'data-right': right, 'aria-pressed': 'false', onclick: () => {
          chosen[row] = right;
          for (const other of buttons) other.setAttribute('aria-pressed', String(other === node));
        } });
        node.append(label(right));
        return node;
      });
      const left = el('div', { class: 'pair-left' }, label(pair.left));
      return el('div', { class: 'pair-row', 'data-pair': row, role: 'group', 'aria-label': `Pair ${row + 1}` }, left, el('div', { class: 'pair-options' }, ...buttons));
    });
    return el('div', { class: 'pairs' }, ...rows, note, el('div', { class: 'tools' },
      button('Check', () => {
        // An unfinished board is not an answer, so it costs nothing.
        if (chosen.includes(null)) {
          note.hidden = false;
          note.textContent = 'Give every row a match, then check.';
          return;
        }
        onSubmit([...chosen]);
      }, { id: 'btn-check' }),
      onRecognition && question.recognitionChoices && button('Use choices instead', onRecognition, { id: 'btn-use-choices', class: 'quiet' })));
  }

  function typeEntry(question, onSubmit, onRecognition) {
    const hebrew = question.compare !== 'gloss';
    // On touch screens the game's own Hebrew keys replace the phone keyboard, which would cover them.
    const touch = hebrew && globalThis.matchMedia?.('(pointer: coarse)').matches;
    const input = el('input', {
      id: 'answer-input', type: 'text', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', inputmode: touch ? 'none' : undefined,
      lang: hebrew ? 'he' : 'en', dir: hebrew ? 'rtl' : 'ltr', 'aria-label': hebrew ? 'Your answer in Hebrew' : 'Your answer in English', class: hebrew ? 'he-input' : '',
      'data-autofocus': true,
    });
    const form = el('form', { class: 'entry' }, input);
    form.addEventListener('submit', event => {
      event.preventDefault();
      if (input.value.trim()) onSubmit(input.value);
    });
    if (hebrew) form.append(keyboard(input, question.compare === 'pointed'));
    form.append(el('div', { class: 'tools' },
      el('button', { type: 'submit', id: 'btn-check', text: 'Check' }),
      onRecognition && button('Use choices instead', onRecognition, { id: 'btn-use-choices', class: 'quiet' })));
    return form;
  }

  function keyboard(input, pointsOpen) {
    const insert = text => { input.value += text; input.focus({ preventScroll: true }); };
    const keys = [...KEYBOARD_LETTERS].map(letter => {
      const node = el('button', { type: 'button', class: 'key', 'data-key': letter, onclick: () => insert(letter) });
      node.append(he(letter));
      return node;
    });
    const points = KEYBOARD_POINTS.map(([mark, name]) => {
      const node = el('button', { type: 'button', class: 'key key-point', 'data-key': name, 'aria-label': name, title: name, onclick: () => insert(mark) });
      node.append(he(`◌${mark}`));
      return node;
    });
    return el('div', { id: 'hebrew-keyboard', role: 'group', 'aria-label': 'Hebrew keyboard' },
      el('div', { class: 'keys-grid', dir: 'rtl' }, ...keys),
      el('details', { ...(pointsOpen ? { open: true } : {}) }, el('summary', { text: 'Vowel points' }), el('div', { class: 'keys-grid', dir: 'rtl' }, ...points)),
      el('div', { class: 'tools' },
        button('Delete', () => { input.value = deleteLast(input.value); input.focus({ preventScroll: true }); }, { id: 'key-delete', class: 'quiet' }),
        button('Clear', () => { input.value = ''; input.focus({ preventScroll: true }); }, { id: 'key-clear', class: 'quiet' })));
  }

  function feedback(result, onContinue, extra = []) {
    const near = {
      'final-form': 'You had the right letters. Check the shape of the last one, since letters take a final form at the end of a word.',
      pointing: 'The letters are right, but the vowel points differ.',
    }[result.nearMiss];
    let verdict = result.correct ? 'Correct.' : 'Not this time.';
    if (result.correct && !result.independent) verdict = 'Correct, with help. It won\'t count toward capture, so here is what to remember.';
    ctx.sound(result.correct ? 'confirm' : 'wrong');
    show([
      el('h2', { id: 'feedback-verdict', class: result.correct ? 'verdict right' : 'verdict wrong', text: `${result.correct ? '✓' : '✕'} ${verdict}` }),
      near && el('p', { id: 'near-miss', text: near }),
      mixed(result.explanation, 'p', { id: 'feedback-text' }),
      ...extra,
      button('Continue', onContinue, { id: 'btn-continue', 'data-autofocus': true }),
    ], { onEscape: onContinue });
  }

  // Lessons

  function lesson(lessonId, after) {
    const state = ctx.getState();
    const data = content.lessonById.get(lessonId);
    const pages = [];
    pages.push(() => show([
      el('p', { class: 'mentor', text: `${data.mentor} shows you` }),
      heading(data.title),
      mixed(data.explanation, 'p', { id: 'lesson-text' }),
      data.chart === 'alphabet' && el('div', { id: 'letter-chart', class: 'chart', dir: 'rtl' }, ...ALPHABET.map(([letter, name]) => el('div', { class: 'chart-cell' }, he(letter), el('span', { text: name })))),
      data.chart === 'finals' && el('div', { id: 'finals-chart', class: 'chart', dir: 'rtl' }, ...FINALS.map(([regular, final, name]) => el('div', { class: 'chart-cell' }, he(`${regular} ${final}`), el('span', { text: name })))),
      next(),
    ], { onEscape: leave }));
    data.workedExamples.forEach((example, i) => pages.push(() => show([
      el('p', { class: 'step-label', text: data.workedExamples.length > 1 ? `Worked example ${i + 1} of ${data.workedExamples.length}` : 'Worked example' }),
      el('div', { class: 'word-plate plain' }, he(example.hebrew, 'he he-large')),
      el('p', { class: 'gloss', text: `"${example.translation}"${example.reference ? ` (${prettyRef(example.reference)})` : ''}` }),
      mixed(example.note, 'p', {}),
      next(),
    ], { onEscape: leave })));
    data.guidedQuestionIds.forEach(id => pages.push(() => guided(content.questionById.get(id))));
    let page = 0;
    function next() { return button('Next', advance, { id: 'btn-next', 'data-autofocus': true }); }
    function advance() {
      page += 1;
      if (page < pages.length) { pages[page](); return; }
      markLessonDone(state, content, lessonId, ctx.now());
      after();
    }
    function leave() { after(false); }
    function guided(question) {
      show([
        el('p', { class: 'step-label', text: data.regionId === 'r1' ? 'Guided practice. Tamar can help, and this isn\'t scored.' : 'Guided practice. Help is here, and this isn\'t scored.' }),
        ...questionView(question, {
          state,
          responseMode: question.format === 'type' || question.format === 'match' ? 'typing' : 'recognition',
          onSubmit: response => {
            const { correct } = checkAnswer(question, response);
            ctx.sound(correct ? 'confirm' : 'wrong');
            show([
              el('h2', { id: 'feedback-verdict', class: correct ? 'verdict right' : 'verdict wrong', text: correct ? '✓ That\'s it.' : '✕ Look again.' }),
              mixed(question.explanation, 'p', { id: 'feedback-text' }),
              correct ? button('Continue', advance, { id: 'btn-continue', 'data-autofocus': true }) : button('Try again', () => guided(question), { id: 'btn-continue', 'data-autofocus': true }),
            ], { onEscape: leave });
          },
          onHint: () => question.hint,
        }),
      ], { onEscape: leave });
    }
    pages[0]();
  }

  // Word card: the only place transliteration and glosses appear before an answer.

  // The sound guide for the divine name follows the same display preference as its Hebrew.
  const soundGuide = word => (sacredPreference() === 'substitute' && comparisonKey(word.hebrew, 'consonants') === 'יהוה' ? 'read by custom as a title, not sounded out' : word.transliteration);

  function wordCard(wordId, { onDone, note }) {
    const word = content.wordById.get(wordId);
    const features = Object.values(word.features).join(', ');
    const pointingNote = word.regionIds[0] === 'r1' ? ' Points are shown, but this region only tests letters.' : '';
    show([
      el('p', { class: 'step-label', text: 'Word card' }),
      el('div', { class: 'word-plate plain' }, he(word.hebrew, 'he he-large')),
      el('p', { id: 'card-gloss', class: 'gloss', text: `${word.gloss}. Said roughly "${soundGuide(word)}".` }),
      el('p', { text: `Letters from the right: ` }, he([...word.consonants].join(' '), 'he he-inline')),
      el('p', { class: 'small', text: `${word.pos}, ${features}. Usual meanings: ${word.meanings.join('; ')}.` }),
      el('div', { class: 'example' }, he(word.example.hebrew, 'he he-medium'), el('p', { text: `${word.example.translation} (${prettyRef(word.example.reference)})` })),
      word.notes && mixed(word.notes, 'p', { class: 'small' }),
      note && el('p', { class: 'hint', text: note }),
      el('p', { class: 'small', text: `The sound guide is a modern reading convention, not ancient speech.${pointingNote}` }),
      button('Done', onDone, { id: 'btn-card-done', 'data-autofocus': true }),
    ], { onEscape: onDone });
  }

  // Encounters

  function meter(record) {
    const filled = new Set(record.captureSteps.map(step => step.family));
    return el('div', { id: 'mystery-meter', class: 'meter', role: 'img', 'aria-label': `${filled.size} of 3 shown` }, ...Object.entries(FAMILY_LABELS).map(([family, label]) => el('span', {
      class: filled.has(family) ? 'pip filled' : 'pip', 'data-family': family, text: `${filled.has(family) ? '◆' : '◇'} ${label}`,
    })));
  }

  function wordSprite(wordId) {
    const canvas = el('canvas', { width: 16, height: 16, class: 'word-sprite', 'aria-hidden': 'true' });
    drawWordSprite(canvas, wordId);
    return canvas;
  }

  const commandMenu = () => encounter({ showCommands: true });

  // Reopens wherever the encounter stands. A pending question resumes unless the player backed out of it.
  function encounter({ showCommands = false } = {}) {
    const state = ctx.getState();
    const current = state.encounter;
    if (!current) { close(); return; }
    const { wordId, kind } = current;
    const word = content.wordById.get(wordId);
    const record = state.words[wordId];
    if (current.current && !showCommands) { question(); return; }
    const commands = commandStates(state, content, wordId);
    const firstTime = record.studiedAt == null;
    const commandButton = (id, label) => {
      const command = commands[id];
      if (!command) return null;
      const props = { id: `cmd-${id}`, 'data-command': id, class: 'command' };
      if (!command.enabled) props['aria-disabled'] = 'true';
      const node = button(label, () => { if (command.enabled) runCommand(id); }, props);
      return el('div', { class: 'command-row' }, node, command.reason && el('p', { class: 'small reason', text: command.reason }));
    };
    const ground = MAPS[state.map].cave ? 'in the moss' : 'in the reeds';
    show([
      el('div', { class: 'encounter-head' }, wordSprite(wordId), el('div', { class: 'word-plate aura', id: 'encounter-word' }, he(word.hebrew, 'he he-large'))),
      kind === 'capture' ? meter(record) : el('p', { class: 'step-label', text: 'Practice. This won\'t change your review schedule.' }),
      el('p', { id: 'encounter-message', text: firstTime
        ? `A word surfaced ${ground}. Choose Study to read its card, then show it three different ways to capture it.`
        : kind === 'capture' ? 'Choose how to show this word next.' : 'Practice any way you like.' }),
      (commands.analyze || commands.build) && el('p', { class: 'small', text: 'Analyze asks how a form is put together. Build asks you to assemble it. Both grow what you know, and neither is needed for capture.' }),
      el('div', { class: 'commands' },
        commandButton('read', COMMAND_LABELS.read), commandButton('understand', COMMAND_LABELS.understand), commandButton('inscribe', COMMAND_LABELS.inscribe),
        commandButton('analyze', COMMAND_LABELS.analyze), commandButton('build', COMMAND_LABELS.build),
        commandButton('study', 'Study'), commandButton('retreat', 'Retreat')),
      el('p', { class: 'keys', text: 'Arrows or Tab move. Enter chooses. Esc retreats, and your progress stays.' }),
    ], { onEscape: retreatNow, focus: firstTime ? '#cmd-study' : null });
  }

  function retreatNow() {
    retreat(ctx.getState(), content, ctx.now());
    close();
  }

  function runCommand(id) {
    const state = ctx.getState();
    if (id === 'retreat') return retreatNow();
    if (id === 'study') {
      const { wordId } = state.encounter;
      const reopened = state.words[wordId].studiedAt != null;
      const needsLesson = !state.skills['word-meaning'];
      const toLesson = () => lesson('l-meaning', commandMenu);
      // Someone who backed out of the lesson can return to it without reopening the answer-bearing card.
      if (reopened && needsLesson) return toLesson();
      completeStudy(state, wordId, ctx.now());
      return wordCard(wordId, {
        note: reopened ? 'You opened the card again, so your next answer won\'t count toward capture.' : null,
        onDone: needsLesson ? toLesson : commandMenu,
      });
    }
    const family = commandStates(state, content, state.encounter.wordId)[id].family;
    if (openQuestion(state, content, family, ctx.now())) question();
    else commandMenu();
  }

  function question() {
    const state = ctx.getState();
    const current = state.encounter.current;
    const data = content.questionById.get(current.questionId);
    const isReview = state.encounter.kind === 'review';
    const label = COMMAND_LABELS[data.command] ?? FAMILY_LABELS[current.family];
    const render = () => show(questionView(data, {
      state,
      label: isReview ? 'Review. First answer counts.' : label,
      responseMode: current.responseMode,
      hintShown: current.hintsUsed > 0,
      onSubmit: response => {
        const result = submit(state, content, response, ctx.now());
        if (result.captured) return captured(state.words, result);
        return feedback(result, () => { if (state.encounter) encounter(); else close(); }, isReview ? reviewExtras(result, data) : []);
      },
      onHint: () => useHint(state, content),
      onBack: isReview ? null : commandMenu,
      onRecognition: () => { setCurrentResponseMode(state, 'recognition'); render(); },
    }), { onEscape: isReview ? retreatNow : commandMenu });
    render();
  }

  // A missed review moves on with its schedule, and a fresh try is right here for anyone who wants it.
  function reviewExtras(result, data) {
    const record = ctx.getState().words[data.wordId];
    const when = formatDate(record.dueAt);
    return [
      el('p', { id: 'review-note', class: 'small', text: result.independent
        ? `Logged. Next review on or after ${when}.`
        : `This word stays in your collection. Next review on or after ${when}.` }),
      !result.independent && button('Practice it now with a fresh question', () => beginEncounter({ wordId: data.wordId, kind: 'practice' }), { id: 'btn-remediate', class: 'quiet' }),
    ];
  }

  function captured(_words, result) {
    const state = ctx.getState();
    const wordId = result.question.wordId;
    const word = content.wordById.get(wordId);
    const inParty = state.party.includes(wordId);
    ctx.sound('capture');
    show([
      el('h2', { id: 'capture-title', text: 'Word captured' }),
      el('div', { class: 'encounter-head' }, wordSprite(wordId), el('div', { class: 'word-plate aura' }, he(word.hebrew, 'he he-large'))),
      el('p', { text: `"${word.gloss}" is in your Worddex for good. ${inParty ? 'It joined your party.' : 'Your party is full, so it went to your collection.'}` }),
      el('p', { class: 'small', text: `You answered it three different ways. It will come up for review from ${formatDate(state.words[wordId].dueAt)}.` }),
      button('Continue', close, { id: 'btn-continue', 'data-autofocus': true }),
    ], { onEscape: close });
  }

  function beginEncounter(event) {
    const state = ctx.getState();
    if (event.kind === 'review') {
      if (!startReview(state, content, event.wordId, ctx.now())) {
        return wordCard(event.wordId, { note: 'This word is due, but no fresh question is ready for it. Reading the card is free and doesn\'t change its schedule.', onDone: close });
      }
    } else {
      startEncounter(state, content, event.wordId, event.kind, ctx.now());
    }
    ctx.sound('confirm');
    encounter();
  }

  // Checkpoints in the world

  function puzzle(group) {
    const state = ctx.getState();
    const data = currentPuzzle(state, content, group);
    if (!data) return dialogue('Neri', ['Not yet. Learn a bit more and come back.']);
    return show(questionView(data, {
      state,
      label: 'Neri\'s challenge',
      onSubmit: response => {
        const result = answerPuzzle(state, content, group, response, ctx.now());
        feedback({ ...result, independent: result.correct }, () => {
          if (result.correct) dialogue('Neri', ['Hmph. Fine, cross. Don\'t let it go to your head.']);
          else puzzle(group);
        });
      },
    }), { onEscape: close });
  }

  function riddle() {
    const state = ctx.getState();
    if (state.flags.gateOpen) return dialogue('Riddle stone', ['The stone is still. One door stands open.']);
    if (!state.flags.neriCleared) return close();
    const data = currentPuzzle(state, content, 'gate');
    if (!data) return close();
    return dialogue('Riddle stone', [`${data.prompt} Walk to a door and press A to read the word carved on it.`]);
  }

  function door(doorId) {
    const state = ctx.getState();
    const data = currentPuzzle(state, content, 'gate');
    const carved = data?.choices.find(c => c.id === doorId);
    if (!carved) return dialogue('Field Gate', ['Nothing here means anything to you yet. Learn more and try again.']);
    return show([
      el('h2', { id: 'door-title', text: `The ${DOOR_NAMES[doorId]}` }),
      mixed(data.prompt, 'p', { id: 'door-riddle' }),
      el('div', { class: 'word-plate plain', id: 'door-word' }, he(carved.text, 'he he-large')),
      el('div', { class: 'tools' },
        button('Push this door', () => {
          const result = answerPuzzle(state, content, 'gate', doorId, ctx.now());
          feedback({ ...result, independent: result.correct }, () => {
            if (result.correct) dialogue('Field Gate', ['The door swings open on oiled hinges. The way north is clear.']);
            else close();
          }, result.correct ? [] : [el('p', { class: 'small', text: 'The door stays shut and the riddle stone turns. Read the new riddle at any door.' })]);
        }, { id: 'btn-push', 'data-autofocus': true }),
        button('Step back', close, { id: 'btn-step-back', class: 'quiet' })),
    ], { onEscape: close });
  }

  const gateLabel = (state, key) => {
    if (key.startsWith('read:')) return 'Reading';
    const group = key.split(':')[1];
    if (group === 'rival') {
      const { correct, required } = gateProgress(state, content, key);
      return `Neri's duel: ${correct} of ${required} so far`;
    }
    if (group === 'ward') return 'The seal asks';
    return OBJECTS.find(o => o.key === key)?.name ?? 'An old carving';
  };

  const gateCleared = {
    rival: 'Neri steps aside. "All right. You earned that one. Don\'t let it go to your head."',
    gate: 'It gives way with a long groan. The path ahead is open.',
    ward: 'The seal cracks along an old line and falls away. There is a way through now.',
  };

  // Any later-region action. The attempt is pending in the save, so leaving costs nothing and hides nothing.
  function gate(key, { wordId, onFresh } = {}) {
    const state = ctx.getState();
    const data = openGate(state, content, key, ctx.now(), { wordId });
    if (!data) return dialogue('The way ahead', ['You have seen everything this asks for now, and each answer has been explained. Nothing fresh is left today. Go and talk to someone or walk the reeds, then come back.']);
    const again = onFresh ?? (() => gate(key));
    const render = () => show(questionView(data, {
      state,
      label: gateLabel(state, key),
      responseMode: state.attempt.responseMode,
      hintShown: state.attempt.hintsUsed > 0,
      onSubmit: response => {
        const result = submitGate(state, content, response, ctx.now());
        feedback(result, () => {
          if (!result.cleared) return again();
          if (key.startsWith('read:')) return passageReveal(key.slice(5));
          ctx.sound('capture');
          return dialogue('The way ahead', [gateCleared[key.split(':')[1]] ?? 'The carving goes quiet. Whatever it wanted, you gave it.']);
        });
      },
      onHint: () => useGateHint(state, content),
      onRecognition: () => { setGateResponseMode(state, 'recognition'); render(); },
      onBack: close,
    }), { onEscape: close });
    return render();
  }

  // Read first, answer, and only then see the translation.
  function reading(passageId) {
    const data = content.passageById.get(passageId);
    const state = ctx.getState();
    const key = `read:${passageId}`;
    const hasQuestions = gatePool(content, key).length > 0;
    show([
      el('h2', { id: 'modal-title', text: prettyRef(data.reference) }),
      el('div', { class: 'word-plate plain', id: 'reading-text' }, he(data.display, 'he he-large')),
      el('p', { text: hasQuestions ? 'Read it through from the right. The stand will ask you about it next.' : 'Read it through from the right.' }),
      button('Next', () => {
        if (hasQuestions) return gate(key);
        completeReadingWithoutQuestions(state, content, passageId, ctx.now());
        return passageReveal(passageId);
      }, { id: 'btn-next', 'data-autofocus': true }),
      button('Step back', close, { id: 'btn-back', class: 'quiet' }),
    ], { onEscape: close });
  }

  function passageReveal(id, after = close, label = 'Continue') {
    const data = content.passageById.get(id);
    show([
      el('h2', { id: 'modal-title', text: `A fragment of ${prettyRef(data.reference)}` }),
      el('div', { class: 'word-plate plain' }, he(data.display, 'he he-large')),
      el('p', { id: 'passage-translation', class: 'gloss', text: `"${data.translation}"` }),
      mixed(data.notes, 'p', {}),
      el('ul', { class: 'token-list' }, ...data.tokens.map(token => el('li', {}, he(token.hebrew.replaceAll('/', '').replace(/[֑-ֽ֯]/g, ''), 'he he-inline'), el('span', { text: ` ${token.gloss}` })))),
      button(label, after, { id: 'btn-continue', 'data-autofocus': true }),
    ], { onEscape: after });
  }

  function ward(key, ability) {
    const state = ctx.getState();
    const candidates = wardCandidates(state, content, ability);
    const again = () => ward(key, ability);
    show([
      heading('Which word answers?'),
      candidates.length
        ? el('div', { id: 'ward-list', class: 'tools stack' }, ...candidates.map(id => {
          const word = content.wordById.get(id);
          const node = button('', () => gate(key, { wordId: id, onFresh: again }), { 'data-ward-word': id, class: 'dex-row' });
          node.append(he(word.hebrew), el('span', { text: word.gloss }));
          return node;
        }))
        : el('p', { id: 'ward-empty', text: 'No word in your party can answer this yet. To grow a word, keep it in your party and use it in new ways: open it in the Worddex and choose Practice. It then has to answer one fresh question here.' }),
      button('Back', close, { id: 'btn-back', class: 'quiet' }),
    ], { onEscape: close });
  }

  function secret(key) {
    claimSecret(ctx.getState(), content, key, ctx.now());
    ctx.sound('capture');
    close();
  }

  function ending() {
    const state = ctx.getState();
    if (!restoreArchive(state, content, ctx.now()).ok) return close();
    ctx.sound('capture');
    const records = Object.values(state.words);
    const seals = content.regions.filter(region => state.badges[region.badge.id]).length;
    const found = Object.keys(state.gates).filter(key => key.endsWith(':secret')).length;
    const count = name => records.filter(r => statusOf(r) === name).length;
    const pages = [
      [
        el('h2', { id: 'ending-title', text: 'The archive is restored' }),
        el('div', { class: 'seal', 'aria-hidden': 'true' }),
        el('p', { text: `You carried ${seals} of ${content.regions.length} seals home, and every shelf the storm emptied has its scrolls back.` }),
      ],
      [
        el('h2', { id: 'modal-title', text: 'Tamar reads the last line' }),
        el('p', { text: '"You came to this door unable to read one letter. Tonight you read a whole page, and you did it without me. The archive needed its scrolls back, and it needs someone who can read them."' }),
      ],
      [
        el('h2', { id: 'modal-title', text: 'What you brought back' }),
        el('p', { id: 'ending-stats', text: `${capturedCount(state)} words in your collection. ${count('Practiced')} recalled on later reviews, ${count('Mastered')} marked mastered so far. ${found} hidden caches found.` }),
        el('p', { class: 'small', text: 'Finishing the adventure and knowing a word for the long term are different things, and only later reviews can show the second. The Review Garden behind the old door keeps every word within reach.' }),
      ],
    ];
    let index = 0;
    const page = () => show([...pages[index], button('Continue', () => {
      index += 1;
      if (index < pages.length) page();
      else close();
    }, { id: 'btn-continue', 'data-autofocus': true })], { onEscape: close });
    return page();
  }

  function badge(regionId = 'r1', speaker = 'Ilana') {
    const state = ctx.getState();
    const run = startBadgeRun(state, content, regionId, ctx.now());
    if (!run.ok) return dialogue(speaker, [run.reason]);
    return badgeQuestion(speaker);
  }

  function badgeQuestion(speaker) {
    const state = ctx.getState();
    const data = openBadgeQuestion(state, content, ctx.now());
    if (!data) return dialogue(speaker, [`You have seen all my questions for today. Walk the ${speaker === 'Ilana' ? 'grove' : 'land'}, read something else, and come back. I keep your correct answers.`]);
    const { correct, required } = badgeProgress(state, content);
    const render = () => show(questionView(data, {
      state,
      label: `${speaker}'s trial: ${correct} of ${required} so far`,
      responseMode: state.badgeRun.current.responseMode,
      hintShown: state.badgeRun.current.hintsUsed > 0,
      onSubmit: response => {
        const { regionId } = state.badgeRun;
        const result = submitBadgeAnswer(state, content, response, ctx.now());
        feedback(result, () => { if (result.awarded) badgeAwarded(regionId); else badgeQuestion(speaker); });
      },
      onHint: () => useBadgeHint(state, content),
      onRecognition: () => { setBadgeResponseMode(state, 'recognition'); render(); },
      onBack: close,
    }), { onEscape: close });
    render();
  }

  function badgeAwarded(regionId) {
    ctx.sound('capture');
    const region = content.regionById.get(regionId);
    const praise = regionId === 'r1'
      ? 'You read words you had never met, from the right, and you knew their final letters. Carry the seal to the arch at the north end of the grove.'
      : `You showed what ${region.title} had to teach, on examples you hadn't met here. Carry the seal to the way out of this region.`;
    show([
      el('h2', { id: 'badge-title', text: `You earned the ${region.badge.title}` }),
      el('div', { class: 'seal', 'aria-hidden': 'true' }),
      el('p', { text: praise }),
      el('p', { class: 'small', text: 'A badge marks an adventure step. Your words keep their own review schedule.' }),
      button('Continue', close, { id: 'btn-continue', 'data-autofocus': true }),
    ], { onEscape: close });
  }

  function passage(id) {
    const state = ctx.getState();
    passageReveal(id, () => { setFlag(state, 'fragmentFound'); close(); }, 'Keep the fragment');
  }

  // Journal: every open region's quest, read straight from data.

  function journal(onBack = close) {
    const state = ctx.getState();
    const entries = content.regions.filter(region => regionUnlocked(state, content, region.id)).map(region => {
      const quest = content.questById.get(region.questId);
      const active = quest && currentStage(state, content, quest.id);
      const stages = quest?.stages ?? [];
      const at = stages.indexOf(active);
      const earned = state.badges[region.badge.id];
      return el('li', { class: 'journal-region' },
        el('h3', { text: `${region.title}: ${quest?.title ?? ''}` }),
        el('p', { class: 'small', text: earned ? `${region.badge.title}: earned` : `${region.badge.title}: not yet` }),
        el('ol', { class: 'journal-stages' }, ...stages.map((stage, i) => el('li', { class: at === i ? 'stage-now' : '', text: `${at === -1 || i < at ? '✓' : at === i ? '▶' : '◇'} ${at === -1 || i <= at ? stage.text : 'Still ahead'}` }))));
    });
    show([
      heading('Journal'),
      state.endingAt != null && el('p', { class: 'hint', text: 'The archive stands restored. The Review Garden stays open.' }),
      el('ul', { id: 'journal-list', class: 'journal' }, ...entries),
      button('Back', onBack, { id: 'btn-back', class: 'quiet', 'data-autofocus': true }),
    ], { onEscape: onBack });
  }

  // Worddex

  const dexView = { query: '', region: '', category: '', root: '', status: '', favorites: false, sort: 'region' };
  const regionIndex = id => content.regions.findIndex(region => region.id === id);
  const knownWords = () => {
    const state = ctx.getState();
    return content.words.filter(word => state.words[word.id]);
  };

  // The list and search only give a meaning once it can't be an answer still owed: captured, and not due.
  const meaningOpen = record => record.capturedAt != null && !reviewEligible(record, ctx.now());

  function matchesQuery(word, record, query) {
    if (!query) return true;
    const asLetters = comparisonKey(query, 'consonants');
    if (HAS_HEBREW.test(query)) return word.consonants.includes(asLetters) || (record.studiedAt != null && !!word.root?.includes(asLetters));
    if (word.id.toLowerCase().includes(query)) return true;
    if (!meaningOpen(record)) return false;
    return [word.gloss, word.transliteration, ...word.meanings, word.pos].some(text => text.toLowerCase().includes(query));
  }

  function dexWords() {
    const state = ctx.getState();
    const query = dexView.query.trim().toLowerCase();
    const shown = knownWords().filter(word => {
      const record = state.words[word.id];
      if (!matchesQuery(word, record, query)) return false;
      if (dexView.region && !word.regionIds.includes(dexView.region)) return false;
      if (dexView.category && (record.studiedAt == null || word.pos !== dexView.category)) return false;
      if (dexView.root && (record.studiedAt == null || word.root !== dexView.root)) return false;
      if (dexView.status && statusOf(record) !== dexView.status) return false;
      return !dexView.favorites || record.favorite;
    });
    const by = {
      region: (a, b) => regionIndex(a.regionIds[0]) - regionIndex(b.regionIds[0]) || (a.id < b.id ? -1 : 1),
      hebrew: (a, b) => a.consonants.localeCompare(b.consonants, 'he'),
      status: (a, b) => STATUS_ORDER.indexOf(statusOf(state.words[b.id])) - STATUS_ORDER.indexOf(statusOf(state.words[a.id])) || (a.id < b.id ? -1 : 1),
      due: (a, b) => (state.words[a.id].dueAt ?? Infinity) - (state.words[b.id].dueAt ?? Infinity) || (a.id < b.id ? -1 : 1),
      recent: (a, b) => state.words[b.id].seenAt - state.words[a.id].seenAt || (a.id < b.id ? -1 : 1),
    }[dexView.sort];
    return shown.sort(by);
  }

  function dexList(onBack) {
    const state = ctx.getState();
    const words = dexWords();
    if (!words.length) {
      return knownWords().length
        ? el('p', { id: 'worddex-none', text: 'No word fits these filters.' })
        : el('p', { id: 'worddex-empty', text: 'Nothing here yet. Words appear once you meet them in the reeds.' });
    }
    return el('ul', { id: 'worddex-list', class: 'dex-list' }, ...words.map(word => {
      const record = state.words[word.id];
      const status = statusOf(record);
      const row = el('button', { type: 'button', class: 'dex-row', 'data-word': word.id, onclick: () => worddexEntry(word.id, onBack) });
      row.append(he(word.hebrew), el('span', { class: 'dex-gloss', text: `${record.favorite ? '★ ' : ''}${meaningOpen(record) ? word.gloss : ''}` }), el('span', { class: 'dex-status', 'data-status': status, text: status }));
      return el('li', {}, row);
    }));
  }

  function worddex(onBack = close) {
    const state = ctx.getState();
    const helped = helpFromLookup(state);
    const partySlots = Array.from({ length: PARTY_LIMIT }, (_, i) => {
      const id = state.party[i];
      if (!id) return el('li', { class: 'party-slot empty', text: 'empty' });
      return el('li', { class: 'party-slot' }, he(content.wordById.get(id).hebrew));
    });
    const met = knownWords();
    const studied = met.filter(word => state.words[word.id].studiedAt != null);
    const select = (id, label, key, options) => el('label', { class: 'dex-filter' }, label, el('select', {
      id, onchange: event => { dexView[key] = event.target.value; refreshList(); },
    }, ...options.map(([value, text]) => {
      const option = el('option', { value, text });
      option.selected = value === dexView[key];
      return option;
    })));
    const all = text => [['', text]];
    const count = el('p', { id: 'worddex-count', class: 'small' });
    const listHolder = el('div', { id: 'worddex-results' });
    function refreshList() {
      const list = dexList(onBack);
      listHolder.replaceChildren(list);
      discloseSacred(listHolder);
      const showing = list.querySelectorAll?.('[data-word]').length ?? 0;
      count.textContent = `${capturedCount(state)} captured, ${met.length} of ${content.words.length} met. Showing ${showing}.`;
    }
    const favorites = button(`Favorites only: ${dexView.favorites ? 'on' : 'off'}`, () => {
      dexView.favorites = !dexView.favorites;
      favorites.textContent = `Favorites only: ${dexView.favorites ? 'on' : 'off'}`;
      favorites.setAttribute('aria-pressed', String(dexView.favorites));
      refreshList();
    }, { id: 'dex-favorites', class: 'quiet', 'aria-pressed': String(dexView.favorites) });
    refreshList();
    show([
      heading('Worddex'),
      helped && el('p', { id: 'dex-peek', class: 'hint', text: 'A question is still waiting for your answer. Since you opened the Worddex, that answer won\'t count. A fresh question follows it.' }),
      count,
      el('h3', { text: `Party (${state.party.length} of ${PARTY_LIMIT})` }),
      el('ol', { id: 'party-list', class: 'party' }, ...partySlots),
      met.length > 0 && el('div', { id: 'dex-controls', class: 'dex-controls' },
        el('label', { class: 'dex-filter dex-search-label' }, 'Search', el('input', {
          id: 'dex-search', type: 'search', value: dexView.query, autocomplete: 'off', spellcheck: 'false', dir: 'auto',
          oninput: event => { dexView.query = event.target.value; refreshList(); },
        })),
        select('dex-region', 'Region', 'region', [...all('All regions'), ...content.regions.filter(region => met.some(word => word.regionIds.includes(region.id))).map(region => [region.id, region.title])]),
        select('dex-category', 'Part of speech', 'category', [...all('All'), ...[...new Set(studied.map(word => word.pos))].sort().map(pos => [pos, pos])]),
        select('dex-root', 'Root', 'root', [...all('Any root'), ...[...new Set(studied.map(word => word.root).filter(Boolean))].sort().map(root => [root, sacredDisplay(root, sacredPreference())])]),
        select('dex-status', 'Status', 'status', [...all('Any status'), ...STATUS_ORDER.map(name => [name, name])]),
        select('dex-sort', 'Sort by', 'sort', [['region', 'Region'], ['hebrew', 'Hebrew order'], ['status', 'Status'], ['due', 'Next review'], ['recent', 'Recently met']]),
        favorites),
      listHolder,
      button('Back', onBack, { id: 'btn-back', class: 'quiet' }),
    ], { onEscape: onBack, focus: '#btn-back' });
  }

  function traceForm(wordId, onDone) {
    const state = ctx.getState();
    const word = content.wordById.get(wordId);
    const form = nextRelatedForm(state, content, wordId);
    if (!form) return onDone();
    return show([
      heading('Trace a related form'),
      el('p', { text: 'You know this word:' }),
      el('div', { class: 'word-plate plain' }, he(word.hebrew, 'he he-large')),
      el('p', { text: 'How is this attested form related to it?' }),
      el('div', { id: 'form-question', class: 'word-plate plain' }, he(form.hebrew, 'he he-large')),
      el('div', { class: 'tools stack', role: 'group', 'aria-label': 'Relationship' }, ...RELATIONSHIPS.map(([value, label]) => button(label, () => {
        const result = answerRelatedForm(state, content, wordId, form.tokenId, value, ctx.now());
        feedback({ ...result, independent: result.correct }, onDone, [el('p', { class: 'small', text: 'Knowing a related form deepens what you know of this word. It does not change the word.' })]);
      }, { 'data-relationship': value, class: 'quiet' }))),
      button('Back', onDone, { id: 'btn-back', class: 'quiet' }),
    ], { onEscape: onDone });
  }

  function sourceLine(id) {
    const source = content.sourceById.get(id);
    if (!source) return null;
    const title = `${source.title}${source.license ? ` (${source.license})` : ''}`;
    return el('li', {}, /^https?:/.test(source.url ?? '') ? el('a', { href: source.url, target: '_blank', rel: 'noopener noreferrer', text: title }) : title);
  }

  function worddexEntry(wordId, onBack) {
    const state = ctx.getState();
    const word = content.wordById.get(wordId);
    const record = state.words[wordId];
    const status = statusOf(record);
    const owned = record.capturedAt != null;
    const studied = record.studiedAt != null;
    const inParty = state.party.includes(wordId);
    const back = () => worddex(onBack);
    const again = () => worddexEntry(wordId, onBack);
    const accuracy = record.firstAttempts ? `${record.firstCorrect} of ${record.firstAttempts} first answers right` : 'No answers yet';
    const partyControl = owned && button(inParty ? 'Remove from party' : 'Add to party', () => {
      if (inParty) removeFromParty(state, wordId);
      else {
        const added = addToParty(state, wordId);
        if (!added.ok) { partyMessage.textContent = added.reason; return; }
      }
      again();
    }, { id: 'btn-party' });
    const partyMessage = el('p', { id: 'party-message', class: 'hint', role: 'status' });
    const reviewLine = owned ? `Next review: on or after ${formatDate(record.dueAt)}. Stage ${record.stage} of 5.` : 'Not captured yet, so it has no review date.';
    const rank = knowledgeRank(record, word, content);
    const lines = unlockedExamples(state, content, wordId);
    const relatedWords = word.root && studied ? knownWords().filter(other => other.id !== wordId && other.root === word.root && state.words[other.id].studiedAt != null) : [];
    const featureText = Object.entries(word.features).map(([name, value]) => `${name}: ${value}`).join(', ');
    if (studied) noteLookup(record, ctx.now());
    show([
      heading(studied ? `Worddex: ${word.gloss}` : 'Worddex: a word not yet studied', 'entry-title'),
      el('div', { class: 'encounter-head' }, wordSprite(wordId), el('div', { class: 'word-plate plain' }, he(word.hebrew, 'he he-large'))),
      el('p', { id: 'entry-status', 'data-status': status, class: 'status-line', text: status }),
      el('p', { class: 'small', text: STATUS_HELP[status] }),
      el('p', { id: 'entry-id', class: 'small', text: `Entry ${word.id}. Dictionary number ${word.strongId}.` }),
      studied ? el('dl', { class: 'facts' },
        el('dt', { text: 'Meaning' }), el('dd', { id: 'entry-gloss', text: word.meanings.join('; ') }),
        el('dt', { text: 'Sound guide' }), el('dd', { text: soundGuide(word) }),
        el('dt', { text: 'Dictionary form' }), el('dd', {}, he(word.hebrew, 'he he-inline'), ` (${word.strongId}), ${word.pos}, ${Object.values(word.features).join(', ')}`),
        el('dt', { text: 'Root' }), el('dd', { id: 'entry-root' }, word.root ? he(word.root, 'he he-inline') : 'Not listed. Roots appear here only when checked by hand.', word.rootNote ? ` ${word.rootNote}` : ''),
        el('dt', { text: 'Grammar' }), el('dd', { id: 'entry-features', text: `${word.pos}${featureText ? `; ${featureText}` : ''}` }),
        el('dt', { text: 'Found in' }), el('dd', { id: 'entry-locations', text: word.regionIds.map(id => content.regionById.get(id)?.title ?? id).join(', ') }),
      ) : el('p', { id: 'entry-unstudied', text: 'Meet this word in the reeds again and choose Study to read its card. Its meaning stays hidden until then, so you still have the chance to learn it properly.' }),
      studied && el('div', { class: 'example' }, he(word.example.hebrew, 'he he-medium'), el('p', { text: `${word.example.translation} (${prettyRef(word.example.reference)})` })),
      studied && el('h3', { text: 'Other forms in the source' }),
      studied && el('ul', { id: 'entry-forms', class: 'token-list' }, ...word.relatedForms.map(form => el('li', {},
        he(form.hebrew, 'he he-inline'), el('span', { text: ` ${form.gloss}. ${relationshipLabel(form.relationship)} (${prettyRef(form.reference)})${record.formsKnown.includes(form.tokenId) ? '. Traced' : ''}` })))),
      relatedWords.length > 0 && el('h3', { text: 'Same root' }),
      relatedWords.length > 0 && el('ul', { id: 'entry-family', class: 'token-list' }, ...relatedWords.map(other => el('li', {}, he(other.hebrew, 'he he-inline'), el('span', { text: ` ${other.gloss}` })))),
      studied && word.notes && mixed(word.notes, 'p', { class: 'small' }),
      studied && el('p', { id: 'entry-lookup', class: 'small', text: 'Reading this entry helps you, so your next answer about this word won\'t count as recalled alone. Tomorrow it will.' }),
      el('h3', { text: 'Your record' }),
      owned && el('p', { id: 'entry-rank', class: 'small', text: `Knowledge: ${RANK_NAMES[rank]}. It grows when you use this word in new kinds of task and trace its forms. Knowing it better doesn't change the word itself.${rank >= 2 ? ` ${ABILITY_NAMES[abilityOf(word)]}.` : ''}` }),
      lines.length > 0 && el('h3', { text: 'More places it appears' }),
      lines.length > 0 && el('ul', { id: 'entry-unlocked', class: 'token-list' }, ...lines.map(line => el('li', {}, he(line.hebrew, 'he he-inline'), el('span', { text: ` (${prettyRef(line.reference)})` })))),
      el('p', { id: 'entry-review', class: 'small', text: reviewLine }),
      el('p', { id: 'entry-accuracy', class: 'small', text: `${accuracy}. Hints used: ${record.hints}. Independent reviews: ${record.evidence.length}. Varied party uses: ${record.xp}.` }),
      el('ol', { id: 'entry-history', class: 'history small' }, ...record.history.slice(-8).reverse().map(entry => el('li', { text: historyLine(entry) }))),
      el('h3', { text: 'Sources' }),
      el('ul', { id: 'entry-sources', class: 'small' }, ...word.sourceIds.map(sourceLine)),
      partyMessage,
      el('div', { class: 'tools' }, partyControl,
        button(record.favorite ? 'Remove favorite' : 'Add favorite', () => { record.favorite = !record.favorite; again(); }, { id: 'btn-favorite', class: 'quiet', 'aria-pressed': String(record.favorite) }),
        owned && button('Practice', () => beginEncounter({ wordId, kind: 'practice' }), { id: 'btn-practice', class: 'quiet' }),
        owned && nextRelatedForm(state, content, wordId) && button('Trace a related form', () => traceForm(wordId, again), { id: 'btn-trace-form', class: 'quiet' }),
        button('Back to Worddex', back, { id: 'btn-back', class: 'quiet' })),
    ], { onEscape: back });
  }

  const relationshipLabel = r => ({ inflection: 'Same word, inflected', derivation: 'Related by derivation', 'separate-lexeme': 'A separate dictionary word' }[r]);

  function historyLine(entry) {
    const when = formatDate(entry.at);
    if (entry.type === 'seen') return `${when}: first met`;
    if (entry.type === 'studied') return `${when}: read the card`;
    if (entry.type === 'captured') return `${when}: captured`;
    if (entry.type === 'review') return `${when}: review, ${entry.independent ? 'recalled alone' : 'needed another look'}`;
    if (entry.type === 'form') return `${when}: traced a related form, ${entry.correct ? 'right' : 'needs another look'}`;
    return `${when}: ${entry.correct ? (entry.independent ? 'answered right' : 'answered right with help') : 'missed'}`;
  }

  return { show, close, dialogue, lesson, encounter, question, beginEncounter, puzzle, riddle, door, badge, passage, worddex, heading, gate, reading, ward, secret, ending, journal, isOpen: () => modal.open };
}
