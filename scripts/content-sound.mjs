// The sound-guide convention as code, so a guide is checked against its pointing and not against itself.
// Modern classroom reading, not a claim about ancient speech: alef and ayin are silent, tet=t, qof=q,
// het and soft kaf=kh, tsade=ts, soft bet=v, soft pe=f, soft gimel, dalet and tav stay g, d, t.
const CONSONANT = { ב: 'v', ג: 'g', ד: 'd', ה: 'h', ז: 'z', ח: 'kh', ט: 't', י: 'y', כ: 'kh', ך: 'kh', ל: 'l', מ: 'm', ם: 'm', נ: 'n', ן: 'n', ס: 's', פ: 'f', ף: 'f', צ: 'ts', ץ: 'ts', ק: 'q', ר: 'r', ת: 't', ו: 'v' };
const HARD = { ב: 'b', כ: 'k', ך: 'k', פ: 'p', ף: 'p' };
const VOWEL = { 'ַ': 'a', 'ָ': 'a|o', 'ֲ': 'a', 'ֶ': 'e', 'ֵ': 'e', 'ֱ': 'e', 'ִ': 'i', 'ֹ': 'o', 'ֳ': 'o', 'ֻ': 'u' };

// Returns a regular expression for the guide this pointing allows, with hyphens and capitals removed.
export function soundPattern(hebrew) {
  const units = [...hebrew.normalize('NFD').matchAll(/([א-ת])([ְ-ׇ]*)/g)].map(m => ({ letter: m[1], marks: m[2] }));
  let out = '';
  units.forEach(({ letter, marks }, i) => {
    const next = units[i + 1];
    const vowel = [...marks].map(c => VOWEL[c]).find(Boolean);
    const dot = marks.includes('ּ');
    const last = i === units.length - 1;
    if (letter === 'ו' && dot && !vowel) { out += 'u'; return; } // shureq
    if (letter === 'ו' && marks.includes('ֹ')) { out += 'o'; return; } // holam-vav
    let sound = letter === 'ש' ? (marks.includes('ׂ') ? 's' : 'sh') : letter === 'א' || letter === 'ע' ? '' : (dot && HARD[letter]) || CONSONANT[letter];
    if (letter === 'ה' && last && !marks.length) sound = 'h?'; // final vowel letter: h is the guide's optional spelling
    if (letter === 'י' && !marks.length) sound = 'y?'; // mater, or the y of ay/ey glides
    if ('אע'.includes(letter) && !marks.length) sound = '';
    const shewa = marks.includes('ְ') ? 'e?' : '';
    const doubled = dot && !HARD[letter] && letter !== 'ה' ? `(?:${sound})?` : '';
    // Furtive patah is read before its final guttural.
    if (last && 'חעה'.includes(letter) && marks.includes('ַ')) { out += `a?${letter === 'ה' ? 'h' : sound}a?`; return; }
    out += doubled + sound + shewa + (vowel ? `(?:${vowel})` : '');
    if (!vowel && !shewa && !next) out += '';
  });
  return new RegExp(`^${out}$`);
}

export const plainGuide = guide => guide.toLowerCase().replace(/[-'\s]/g, '');

// Is the stress final, or earlier? Comparable across guides that count syllables differently.
export const guideStress = guide => {
  const parts = guide.split('-');
  if (parts.length === 1) return 'one';
  return parts.at(-1) === parts.at(-1).toUpperCase() && /[A-Z]/.test(parts.at(-1)) ? 'final' : 'earlier';
};
export const strongStress = pron => {
  const parts = pron.split('-');
  if (parts.length === 1) return 'one';
  return parts.at(-1).includes("'") ? 'final' : 'earlier';
};
