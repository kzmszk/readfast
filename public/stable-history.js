const graphemes = new Intl.Segmenter('ja', { granularity: 'grapheme' });

// Freeze each line as it fills. Appending text must never rewrap earlier text.
// Cache the two visible lines at each reading position for exact backtracking.
export function createHistoryLayout(chunks, fits) {
  const snapshots = [['', '']];
  let previous = '';
  let current = '';
  let consumed = 0;
  return {
    at(position) {
      const end = Math.max(0, Math.min(position, chunks.length));
      while (consumed < end) {
        const addition = `${consumed ? ' ' : ''}${chunks[consumed]}`;
        for (const { segment } of graphemes.segment(addition)) {
          if (current && !fits(current + segment)) {
            previous = current;
            current = '';
          }
          if (current || segment !== ' ') current += segment;
        }
        snapshots.push([previous, current]);
        consumed++;
      }
      return snapshots[end].slice();
    },
  };
}

export function createStableHistory(container) {
  const rows = [document.createElement('div'), document.createElement('div')];
  rows.forEach(row => { row.className = 'history-line'; });
  container.replaceChildren(...rows);
  const context = document.createElement('canvas').getContext('2d');
  let lastChunks;
  let lastMetrics;
  let layout;
  return {
    render(chunks, position) {
      const width = container.clientWidth;
      if (!width) return;
      const style = getComputedStyle(container);
      const font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      const metrics = `${width}|${font}`;
      if (chunks !== lastChunks || metrics !== lastMetrics) {
        context.font = font;
        context.fontKerning = 'none';
        layout = createHistoryLayout(chunks, text => context.measureText(text).width <= width);
        lastChunks = chunks;
        lastMetrics = metrics;
      }
      layout.at(position).forEach((text, i) => {
        if (rows[i].textContent !== text) rows[i].textContent = text;
      });
    },
  };
}
