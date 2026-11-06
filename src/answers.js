// Task-aware answer checking. Source display strings are never normalized in place:
// OSHB warns that mark order can matter for rendering, so only comparison keys use NFC.

const BIDI_CONTROLS = /[‎‏‪-‮⁦-⁩͏]/g;
const CANTILLATION_AND_METEG = /[֑-ֽ֯]/g;
// Points, dagesh, shin/sin dots and qamats qatan. Only used when a task says pointing isn't tested.
const ALL_POINTING = /[֑-ׇֽֿׁׂׅׄ]/g;
const FINAL_TO_REGULAR = { ך: 'כ', ם: 'מ', ן: 'נ', ף: 'פ', ץ: 'צ' };

const clean = text => text.normalize('NFC').replace(BIDI_CONTROLS, '').trim().replace(/\s+/g, ' ');

export function comparisonKey(text, mode) {
  const base = clean(text);
  if (mode === 'pointed') return base.replace(CANTILLATION_AND_METEG, '');
  if (mode === 'consonants') return base.replace(ALL_POINTING, '');
  if (mode === 'gloss') {
    return base.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, '').replace(/^(a|an|the) /, '').trim().replace(/\s+/g, ' ');
  }
  throw new Error(`Unknown comparison mode: ${mode}`);
}

const regularized = text => comparisonKey(text, 'consonants').replace(/[ךםןףץ]/g, c => FINAL_TO_REGULAR[c]);

export function checkAnswer(question, response, responseMode = 'typing') {
  const { format } = question;
  if (format === 'tokens') {
    const given = Array.isArray(response) ? response.join('\n') : '';
    return { correct: question.acceptedSequences.some(seq => seq.join('\n') === given), nearMiss: null };
  }
  if (format === 'choice' || format === 'door') return { correct: question.acceptedAnswers.includes(response), nearMiss: null };
  if (format !== 'type') throw new Error(`Unknown question format: ${format}`);
  if (responseMode === 'recognition') return { correct: question.recognitionAccepted.includes(response), nearMiss: null };

  const key = comparisonKey(String(response), question.compare);
  if (question.acceptedAnswers.some(a => comparisonKey(a, question.compare) === key)) return { correct: true, nearMiss: null };
  if (question.compare === 'gloss') return { correct: false, nearMiss: null };
  const consonants = comparisonKey(String(response), 'consonants');
  if (question.acceptedAnswers.some(a => comparisonKey(a, 'consonants') === consonants)) return { correct: false, nearMiss: 'pointing' };
  if (question.acceptedAnswers.some(a => regularized(a) === regularized(String(response)))) return { correct: false, nearMiss: 'final-form' };
  return { correct: false, nearMiss: null };
}

// Removes one code point, so a mark can be fixed without retyping its letter.
export const deleteLast = text => [...text].slice(0, -1).join('');
