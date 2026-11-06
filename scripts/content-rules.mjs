// Content-lane rules. The shared validator owner can import keyRules for the new word templates;
// the morphology map is how tests/content proves a token doesn't leak grammar not yet taught.
import { comparisonKey } from '../src/answers.js';

const answerOf = q => (q.choices ?? q.recognitionChoices).find(c => (q.acceptedAnswers ?? q.recognitionAccepted).includes(c.id))?.text;

// Each rule returns an error string or null. Added to the eight templates in docs/SCHEMA.md.
export const keyRules = {
  'tpl-read-sound': (q, word) => (answerOf(q) === word.transliteration ? null : `${q.id}: answer is not the word's sound guide`),
  'tpl-read-pointed': (q, word) => {
    if (answerOf(q) !== word.hebrew) return `${q.id}: answer is not the word's pointed form`;
    const keys = q.choices.map(c => comparisonKey(c.text, 'pointed'));
    if (new Set(keys).size !== keys.length) return `${q.id}: two options have identical pointing`;
    if (q.choices.some(c => comparisonKey(c.text, 'consonants') !== word.consonants)) return `${q.id}: an option changes the letters, not the pointing`;
    return null;
  },
};

// Reading rules a pointed form needs, each taught by a named r2 lesson. Morphology can't show these:
// shewa (l-shewa); a dagesh or a silent final he (l-dagesh); a composite shewa or silent alef (l-gutturals).
export function readingDemands(hebrew) {
  const needed = new Set();
  const text = hebrew.normalize('NFD');
  if (/ְ/.test(text)) needed.add('shewa');
  if (/[ֱֲֳ]/.test(text)) needed.add('gutturals');
  // A dot in vav with no vowel of its own is shureq, a vowel sign taught with the vowels.
  for (const [, letter, marks] of text.matchAll(/([א-ת])([֑-ׇ]*)/g)) if (marks.includes('ּ') && letter !== 'ו') needed.add('dagesh');
  if (/ה(?![֑-ׇ])(?:\s|$)/.test(text)) needed.add('dagesh');
  if (/(?<!^)א(?![֑-ׇ])/.test(text)) needed.add('gutturals');
  // Furtive patah, read before its final guttural, is first shown with the participle.
  if (/(?:[וי][ֹּ]?|[ֵֹ])[֑-ׇ]*[חע][֑-ׇ]*ַ[֑-ׇ]*$/.test(text)) needed.add('participle');
  return [...needed];
}

// Skills a question really has by holding its listed ones: each lesson's own prerequisites come with it.
export function readingClosure(skills, lessons) {
  const have = new Set(skills);
  for (let grew = true; grew;) {
    grew = false;
    for (const l of lessons) {
      if (!l.teaches.some(s => have.has(s))) continue;
      for (const s of [...l.requires, ...l.teaches]) if (!have.has(s)) { have.add(s); grew = true; }
    }
  }
  return have;
}

// OSHB also tags חוה forms v (hishtaphel-type); they are taught with the Hithpael lesson.
const STEM_SKILL = { N: 'niphal', p: 'piel', P: 'pual', t: 'hithpael', v: 'hithpael', h: 'hiphil', H: 'hophal' };
const ASPECT_SKILL = {
  p: 'perfect', q: 'narrative', i: 'imperfect', w: 'narrative', h: 'volitives', j: 'volitives', v: 'volitives',
  r: 'participle', s: 'passive-participle', a: 'inf-absolute', c: 'inf-construct',
};

// Skills a learner needs before a token with this OSHB morphology may be shown in a task.
export function skillsForMorph(morph) {
  const needed = new Set();
  const parts = morph.replace(/^H/, '').split('/');
  let host = null;
  for (const part of parts) {
    if (part[0] === 'V') {
      host = 'verb';
      if (STEM_SKILL[part[1]]) needed.add(STEM_SKILL[part[1]]);
      if (ASPECT_SKILL[part[2]]) needed.add(ASPECT_SKILL[part[2]]);
    } else if (part[0] === 'N' || part[0] === 'A') host = 'noun';
    else if (part[0] === 'R') host = 'prep';
    else if (part[0] === 'S') {
      if (host === 'verb') needed.add('verbal-suffixes');
      else if (host === 'prep') needed.add('prep-suffixes');
      else if (host === 'noun') needed.add('noun-suffixes');
    }
  }
  return [...needed];
}
