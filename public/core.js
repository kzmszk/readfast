const graphemes = new Intl.Segmenter('ja', { granularity: 'grapheme' });
const words = new Intl.Segmenter('ja', { granularity: 'word' });

export function characters(text) {
  return Array.from(graphemes.segment(text), ({ segment }) => segment);
}

// Respect word boundaries where possible, but always bound the visible length.
export function splitText(text, limit = 10) {
  if (!Number.isInteger(limit) || limit < 1) throw new RangeError('Invalid chunk size');
  const chunks = [];
  let current = '';
  const flush = () => {
    if (current.trim()) chunks.push(current.trim());
    current = '';
  };
  for (const line of text.replace(/\r\n?/g, '\n').split('\n')) {
    for (const { segment } of words.segment(line.replace(/[\t ]+/g, ' '))) {
      const units = characters(segment);
      if (characters(current).length + units.length > limit) flush();
      for (const unit of units) {
        if (!current && /^\s$/u.test(unit)) continue;
        if (characters(current).length === limit) flush();
        current += unit;
      }
      if (/[。！？!?]$/u.test(segment)) flush();
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
