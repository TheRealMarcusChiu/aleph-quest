// Semantic DOM for everything Hebrew: dialogue, lessons, encounters, Worddex and menus.
// All text goes through textContent. Hebrew stays in logical order and whole words are never split.
import { content } from './content.js';
import { checkAnswer, deleteLast } from './answers.js';
import { drawWordSprite } from './render.js';
import { markLessonDone, setFlag, nextRandom, BADGE_ID, capturedCount } from './engine.js';
import {
  startEncounter, commandStates, completeStudy, openQuestion, startReview, useHint, setCurrentResponseMode,
  submit, retreat, statusOf, addToParty, removeFromParty, PARTY_LIMIT,
} from './learning.js';
import { currentPuzzle, answerPuzzle, startBadgeRun, openBadgeQuestion, submitBadgeAnswer, useBadgeHint, setBadgeResponseMode, badgeProgress } from './checkpoints.js';
import { DOOR_NAMES } from './world.js';

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
const COMMAND_LABELS = { read: 'Read', understand: 'Understand', inscribe: 'Inscribe' };
const FAMILY_LABELS = { 'read-letter': 'Read', 'understand-meaning': 'Understand', 'inscribe-spelling': 'Inscribe' };
const STATUS_HELP = {
  Seen: 'You have met this word.',
  Studied: 'You have read its card.',
  Captured: 'You showed it three different ways. A later review will test whether it stuck.',
  Practiced: 'You recalled it on a later review.',
  Mastered: 'You recalled it on four separate days, in varied ways. This is provisional and later reviews still count.',
};
const HEBREW_RUN = /[֐-׿]+(?:[ ־][֐-׿]+)*/g;

export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'onclick') node.addEventListener('click', value);
    else if (value !== undefined && value !== null && value !== false) node.setAttribute(key, value === true ? '' : value);
  }
  node.append(...children.filter(Boolean));
  return node;
}

const he = (text, cls = 'he') => el('bdi', { lang: 'he', dir: 'rtl', class: cls, text });

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

// ctx: { modal, getState, now, persist, sound, onClosed, refreshHud, menu }
export function createUI(ctx) {
  const { modal } = ctx;
  let escape = null;

  function show(nodes, { kind = 'panel', onEscape = null, focus = null } = {}) {
    escape = onEscape;
    modal.className = kind;
    modal.replaceChildren(...nodes.filter(Boolean));
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
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key) || event.target === modal || event.target.matches('input, textarea')) return;
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

  function questionView(question, { state, onSubmit, onHint, onBack, responseMode = 'recognition', onRecognition, label }) {
    const area = [];
    if (label) area.push(el('p', { class: 'step-label', text: label }));
    area.push(mixed(question.prompt, 'p', { id: 'question-prompt' }));
    if (question.displayHebrew) area.push(el('div', { class: 'word-plate plain' }, he(question.displayHebrew, 'he he-large')));

    const usesChoices = question.format === 'choice' || (question.format === 'type' && responseMode === 'recognition');
    if (usesChoices) {
      const options = shuffled(state, question.choices ?? question.recognitionChoices);
      area.push(el('div', { class: 'choices', role: 'group', 'aria-label': 'Answer choices' }, ...options.map(option => {
        const node = el('button', { type: 'button', class: option.lang === 'he' ? 'choice choice-he' : 'choice', 'data-choice': option.id, onclick: () => onSubmit(option.id) });
        node.append(option.lang === 'he' ? he(option.text) : option.text);
        return node;
      })));
    } else if (question.format === 'tokens') {
      area.push(tokenPicker(state, question, onSubmit));
    } else {
      area.push(typeEntry(question, onSubmit, onRecognition));
    }

    const tools = [];
    if (onHint) tools.push(button('Hint (this answer won\'t count)', () => {
      const hint = onHint();
      ctx.persist();
      tools.at(0).replaceWith(mixed(`Hint: ${hint}`, 'p', { id: 'hint-text', class: 'hint' }));
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
    return el('div', { class: 'tokens' }, tray, el('div', { class: 'choices', role: 'group', 'aria-label': 'Letter tiles' }, ...tiles), el('div', { class: 'tools' },
      button('Undo', () => { picked.pop(); redraw(); }, { id: 'btn-token-undo', class: 'quiet' }),
      button('Check', () => onSubmit([...picked]), { id: 'btn-check' })));
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
      el('p', { class: 'gloss', text: `"${example.translation}" (${example.reference.replaceAll('.', ' ').replace(/ (\d+) (\d+)$/, ' $1:$2').replace('Gen', 'Genesis')})` }),
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
        el('p', { class: 'step-label', text: 'Guided practice. Tamar can help, and this isn\'t scored.' }),
        ...questionView(question, {
          state,
          responseMode: question.format === 'type' ? 'typing' : 'recognition',
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

  function wordCard(wordId, { onDone, note }) {
    const word = content.wordById.get(wordId);
    const features = Object.values(word.features).join(', ');
    show([
      el('p', { class: 'step-label', text: 'Word card' }),
      el('div', { class: 'word-plate plain' }, he(word.hebrew, 'he he-large')),
      el('p', { id: 'card-gloss', class: 'gloss', text: `${word.gloss}. Said roughly "${word.transliteration}".` }),
      el('p', { text: `Letters from the right: ` }, he([...word.consonants].join(' '), 'he he-inline')),
      el('p', { class: 'small', text: `${word.pos}, ${features}. Usual meanings: ${word.meanings.join('; ')}.` }),
      el('div', { class: 'example' }, he(word.example.hebrew, 'he he-medium'), el('p', { text: `${word.example.translation} (${prettyRef(word.example.reference)})` })),
      word.notes && mixed(word.notes, 'p', { class: 'small' }),
      note && el('p', { class: 'hint', text: note }),
      el('p', { class: 'small', text: 'The sound guide is a modern reading convention, not ancient speech. Points are shown, but this region only tests letters.' }),
      button('Done', onDone, { id: 'btn-card-done', 'data-autofocus': true }),
    ], { onEscape: onDone });
  }

  const prettyRef = ref => ref.replace('Gen.', 'Genesis ').replace(/\.(\d+)$/, ':$1');

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
      const props = { id: `cmd-${id}`, 'data-command': id, class: 'command' };
      if (!command.enabled) props['aria-disabled'] = 'true';
      const node = button(label, () => { if (command.enabled) runCommand(id); }, props);
      return el('div', { class: 'command-row' }, node, command.reason && el('p', { class: 'small reason', text: command.reason }));
    };
    show([
      el('div', { class: 'encounter-head' }, wordSprite(wordId), el('div', { class: 'word-plate aura', id: 'encounter-word' }, he(word.hebrew, 'he he-large'))),
      kind === 'capture' ? meter(record) : el('p', { class: 'step-label', text: 'Practice. This won\'t change your review schedule.' }),
      el('p', { id: 'encounter-message', text: firstTime
        ? 'A word surfaced in the reeds. Choose Study to read its card, then show it three different ways to capture it.'
        : kind === 'capture' ? 'Choose how to show this word next.' : 'Practice any way you like.' }),
      el('div', { class: 'commands' },
        commandButton('read', 'Read'), commandButton('understand', 'Understand'), commandButton('inscribe', 'Inscribe'),
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
    const render = () => show(questionView(data, {
      state,
      label: isReview ? 'Review. First answer counts.' : FAMILY_LABELS[current.family],
      responseMode: current.responseMode,
      onSubmit: response => {
        const result = submit(state, content, response, ctx.now());
        if (result.captured) return captured(state.words, result);
        return feedback(result, () => { if (state.encounter) encounter(); else close(); }, isReview ? [reviewNote(result, data)] : []);
      },
      onHint: () => useHint(state, content),
      onBack: isReview ? null : commandMenu,
      onRecognition: () => { setCurrentResponseMode(state, 'recognition'); render(); },
    }), { onEscape: isReview ? retreatNow : commandMenu });
    render();
  }

  function reviewNote(result, data) {
    const record = ctx.getState().words[data.wordId];
    const when = formatDate(record.dueAt);
    return el('p', { id: 'review-note', class: 'small', text: result.independent
      ? `Logged. Next review on or after ${when}.`
      : `This word stays in your collection. Next review on or after ${when}.` });
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
    show(questionView(data, {
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
    return dialogue('Riddle stone', [`${data.prompt} Walk to a door and press A to read the word carved on it.`]);
  }

  function door(doorId) {
    const state = ctx.getState();
    const data = currentPuzzle(state, content, 'gate');
    const carved = data.choices.find(c => c.id === doorId);
    show([
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

  function badge() {
    const state = ctx.getState();
    const run = startBadgeRun(state, content, 'r1', ctx.now());
    if (!run.ok) return dialogue('Ilana', [run.reason]);
    return badgeQuestion();
  }

  function badgeQuestion() {
    const state = ctx.getState();
    const data = openBadgeQuestion(state, content, ctx.now());
    if (!data) return dialogue('Ilana', ['You have seen all my questions for today. Walk the grove, read something else, and come back. I keep your correct answers.']);
    const { correct, required } = badgeProgress(state, content);
    const render = () => show(questionView(data, {
      state,
      label: `Ilana's trial: ${correct} of ${required} so far`,
      responseMode: state.badgeRun.current.responseMode,
      onSubmit: response => {
        const result = submitBadgeAnswer(state, content, response, ctx.now());
        feedback(result, () => { if (result.awarded) badgeAwarded(); else badgeQuestion(); });
      },
      onHint: () => useBadgeHint(state, content),
      onRecognition: () => { setBadgeResponseMode(state, 'recognition'); render(); },
      onBack: close,
    }), { onEscape: close });
    render();
  }

  function badgeAwarded() {
    ctx.sound('capture');
    const region = content.regionById.get('r1');
    show([
      el('h2', { id: 'badge-title', text: `You earned the ${region.badge.title}` }),
      el('div', { class: 'seal', 'aria-hidden': 'true' }),
      el('p', { text: 'You read words you had never met, from the right, and you knew their final letters. Carry the seal to the arch at the north end of the grove.' }),
      el('p', { class: 'small', text: 'A badge marks an adventure step. Your words keep their own review schedule.' }),
      button('Continue', close, { id: 'btn-continue', 'data-autofocus': true }),
    ], { onEscape: close });
  }

  function passage(id) {
    const state = ctx.getState();
    const data = content.passageById.get(id);
    show([
      el('h2', { id: 'modal-title', text: 'A fragment of Genesis 44:19' }),
      el('div', { class: 'word-plate plain' }, he(data.display, 'he he-large')),
      el('p', { id: 'passage-translation', class: 'gloss', text: `"${data.translation}"` }),
      mixed(data.notes, 'p', {}),
      el('ul', { class: 'token-list' }, ...data.tokens.map(token => el('li', {}, he(token.hebrew.replaceAll('/', '').replace(/[֑-ֽ֯]/g, ''), 'he he-inline'), el('span', { text: ` ${token.gloss}` })))),
      button('Keep the fragment', () => { setFlag(state, 'fragmentFound'); close(); }, { id: 'btn-continue', 'data-autofocus': true }),
    ], { onEscape: close });
  }

  // Worddex

  function worddex(onBack = close) {
    const state = ctx.getState();
    const region = content.regionById.get('r1');
    const known = region.wordIds.filter(id => state.words[id]);
    const partySlots = Array.from({ length: PARTY_LIMIT }, (_, i) => {
      const id = state.party[i];
      if (!id) return el('li', { class: 'party-slot empty', text: 'empty' });
      return el('li', { class: 'party-slot' }, he(content.wordById.get(id).hebrew));
    });
    show([
      heading('Worddex'),
      el('p', { id: 'worddex-count', class: 'small', text: `${capturedCount(state)} captured, ${known.length} of ${region.wordIds.length} met in ${region.title}. The rest of the archive is still lost.` }),
      el('h3', { text: `Party (${state.party.length} of ${PARTY_LIMIT})` }),
      el('ol', { id: 'party-list', class: 'party' }, ...partySlots),
      known.length ? el('ul', { id: 'worddex-list', class: 'dex-list' }, ...known.map(id => {
        const word = content.wordById.get(id);
        const status = statusOf(state.words[id]);
        const row = el('button', { type: 'button', class: 'dex-row', 'data-word': id, onclick: () => worddexEntry(id, onBack) });
        row.append(he(word.hebrew), el('span', { class: 'dex-status', 'data-status': status, text: status }));
        return el('li', {}, row);
      })) : el('p', { id: 'worddex-empty', text: 'Nothing here yet. Words appear once you meet them in the reeds.' }),
      button('Back', onBack, { id: 'btn-back', class: 'quiet' }),
    ], { onEscape: onBack });
  }

  function worddexEntry(wordId, onBack) {
    const state = ctx.getState();
    const word = content.wordById.get(wordId);
    const record = state.words[wordId];
    const status = statusOf(record);
    const owned = record.capturedAt != null;
    const inParty = state.party.includes(wordId);
    const accuracy = record.firstAttempts ? `${record.firstCorrect} of ${record.firstAttempts} first answers right` : 'No answers yet';
    const partyControl = owned && button(inParty ? 'Remove from party' : 'Add to party', () => {
      if (inParty) removeFromParty(state, wordId);
      else {
        const added = addToParty(state, wordId);
        if (!added.ok) { partyMessage.textContent = added.reason; return; }
      }
      worddexEntry(wordId, onBack);
    }, { id: 'btn-party' });
    const partyMessage = el('p', { id: 'party-message', class: 'hint', role: 'status' });
    const reviewLine = owned ? `Next review: on or after ${formatDate(record.dueAt)}. Stage ${record.stage} of 5.` : 'Not captured yet, so it has no review date.';
    show([
      heading(`Worddex: ${word.gloss}`, 'entry-title'),
      el('div', { class: 'encounter-head' }, wordSprite(wordId), el('div', { class: 'word-plate plain' }, he(word.hebrew, 'he he-large'))),
      el('p', { id: 'entry-status', 'data-status': status, class: 'status-line', text: status }),
      el('p', { class: 'small', text: STATUS_HELP[status] }),
      el('dl', { class: 'facts' },
        el('dt', { text: 'Meaning' }), el('dd', { id: 'entry-gloss', text: word.meanings.join('; ') }),
        el('dt', { text: 'Sound guide' }), el('dd', { text: word.transliteration }),
        el('dt', { text: 'Dictionary form' }), el('dd', {}, he(word.hebrew, 'he he-inline'), ` (${word.strongId}), ${word.pos}, ${Object.values(word.features).join(', ')}`),
        el('dt', { text: 'Root' }), el('dd', { id: 'entry-root' }, word.root ? he(word.root, 'he he-inline') : 'Not listed. Roots appear here only when checked by hand.', word.rootNote ? ` ${word.rootNote}` : ''),
      ),
      el('div', { class: 'example' }, he(word.example.hebrew, 'he he-medium'), el('p', { text: `${word.example.translation} (${prettyRef(word.example.reference)})` })),
      el('h3', { text: 'Other forms in Genesis' }),
      el('ul', { id: 'entry-forms', class: 'token-list' }, ...word.relatedForms.map(form => el('li', {},
        he(form.hebrew, 'he he-inline'), el('span', { text: ` ${form.gloss}. ${relationshipLabel(form.relationship)} (${prettyRef(form.reference)})` })))),
      word.notes && mixed(word.notes, 'p', { class: 'small' }),
      el('h3', { text: 'Your record' }),
      el('p', { id: 'entry-review', class: 'small', text: reviewLine }),
      el('p', { id: 'entry-accuracy', class: 'small', text: `${accuracy}. Hints used: ${record.hints}. Independent reviews: ${record.evidence.length}. Party uses: ${record.xp}.` }),
      el('ol', { id: 'entry-history', class: 'history small' }, ...record.history.slice(-8).reverse().map(entry => el('li', { text: historyLine(entry) }))),
      partyMessage,
      el('div', { class: 'tools' }, partyControl, button('Back to Worddex', () => worddex(onBack), { id: 'btn-back', class: 'quiet' })),
    ], { onEscape: () => worddex(onBack) });
  }

  const relationshipLabel = r => ({ inflection: 'Same word, inflected', derivation: 'Related by derivation', 'separate-lexeme': 'A separate dictionary word' }[r]);

  function historyLine(entry) {
    const when = formatDate(entry.at);
    if (entry.type === 'seen') return `${when}: first met`;
    if (entry.type === 'studied') return `${when}: read the card`;
    if (entry.type === 'captured') return `${when}: captured`;
    if (entry.type === 'review') return `${when}: review, ${entry.independent ? 'recalled alone' : 'needed another look'}`;
    return `${when}: ${entry.correct ? (entry.independent ? 'answered right' : 'answered right with help') : 'missed'}`;
  }

  return { show, close, dialogue, lesson, encounter, question, beginEncounter, puzzle, riddle, door, badge, passage, worddex, heading, isOpen: () => modal.open };
}
