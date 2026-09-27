import { Parser, jaModel } from './vendor/budoux.js';

const graphemes = new Intl.Segmenter('ja', { granularity: 'grapheme' });
const words = new Intl.Segmenter('ja', { granularity: 'word' });
const sentences = new Intl.Segmenter('ja', { granularity: 'sentence' });
const phrases = new Parser(jaModel);
const closing = /^[、，。！？!?.,」』）】〉》”’)\]]/u;
const opening = /[「『（【〈《“‘(\[]$/u;

export function characters(text) {
  return Array.from(graphemes.segment(text), ({ segment }) => segment);
}

function phraseParts(text) {
  const wordStarts = new Set(Array.from(words.segment(text), ({ index }) => index));
  const characterStarts = new Set(Array.from(graphemes.segment(text), ({ index }) => index));
  // Intersect phrase predictions with real word/grapheme boundaries. This avoids
  // splitting e.g. 結論づける or a surrogate pair even if the model suggests it.
  const candidates = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(text)
    ? phrases.parseBoundaries(text) : [...wordStarts];
  const result = [];
  let start = 0;
  for (const end of candidates) {
    if (end <= start || !wordStarts.has(end) || !characterStarts.has(end)) continue;
    if (closing.test(text.slice(end)) || opening.test(text.slice(0, end))) continue;
    result.push(text.slice(start, end));
    start = end;
  }
  result.push(text.slice(start));
  return result;
}

// The requested length is a target, not a hard cut through a Japanese phrase.
export function splitText(text, limit = 10) {
  if (!Number.isInteger(limit) || limit < 1) throw new RangeError('Invalid chunk size');
  const chunks = [];
  let current = '';
  const flush = () => {
    if (current.trim()) chunks.push(current.trim());
    current = '';
  };
  for (const line of text.replace(/\r\n?/g, '\n').split('\n')) {
    for (const { segment } of sentences.segment(line.replace(/[\t ]+/g, ' '))) {
      // Keep punctuation and closing quotes with the preceding phrase. Commas
      // also end a display, so its timing pause occurs at the actual reading break.
      const passages = segment.match(/.*?[、，。！？!?]+[」』）】〉》”’)\]]*|.+$/gu) || [];
      for (const passage of passages) {
        for (const phrase of phraseParts(passage)) {
          if (current.trim() && characters(current + phrase).length > limit) flush();
          current += phrase;
        }
        flush();
      }
    }
    flush();
  }
  return chunks;
}

export function displayDuration(text, cpm, punctuationPause = true) {
  if (!Number.isFinite(cpm) || cpm <= 0) throw new RangeError('Invalid speed');
  const base = Math.max(100, characters(text).length * 60000 / cpm);
  const pause = punctuationPause && /[。！？!?、，,\.][」』”’）)]*$/u.test(text)
    ? (/[。！？!?\.]/u.test(text) ? 300 : 150) : 0;
  return base + pause;
}
