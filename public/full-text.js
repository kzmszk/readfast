// SplitText only normalizes whitespace. Map its phrases back to the original
// UTF-16 positions so the ordinary reading view preserves all source spacing.
export function chunkRanges(source, chunks) {
  const positions = [];
  for (let i = 0; i < source.length; i++) {
    if (!/\s/u.test(source[i])) positions.push(i);
  }
  let cursor = 0;
  return chunks.map((chunk) => {
    const length = chunk.replace(/\s/gu, '').length;
    const start = positions[cursor];
    cursor += length;
    return { start, end: positions[cursor - 1] + 1 };
  });
}

export function createFullTextView(container) {
  let passages = [];
  let active;
  return {
    build(source, chunks) {
      const content = document.createDocumentFragment();
      let cursor = 0;
      passages = chunkRanges(source, chunks).map(({ start, end }) => {
        content.append(document.createTextNode(source.slice(cursor, start)));
        const span = document.createElement('span');
        span.textContent = source.slice(start, end);
        content.append(span);
        cursor = end;
        return span;
      });
      content.append(document.createTextNode(source.slice(cursor)));
      container.replaceChildren(content);
      active = null;
    },
    highlight(index) {
      active?.classList.remove('current-passage');
      active?.removeAttribute('aria-current');
      active = passages[index];
      active?.classList.add('current-passage');
      active?.setAttribute('aria-current', 'location');
    },
    scrollToCurrent() {
      if (!active) { container.scrollTop = 0; return; }
      container.scrollTop += active.getBoundingClientRect().top
        - container.getBoundingClientRect().top - container.clientHeight * 0.35;
    },
  };
}
