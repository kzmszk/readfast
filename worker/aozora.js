import { Parser } from 'htmlparser2';

export function officialUrl(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.host !== 'www.aozora.gr.jp'
      || url.username || url.password || url.search || url.hash
      || !/^\/cards\/\d+\/(?:files\/[\w.-]+\.html?|card\d+\.html)$/.test(url.pathname)) {
    throw new Error('青空文庫内の対応する本文がありません。図書カードをご確認ください。');
  }
  url.protocol = 'https:';
  return url.href;
}

export function normalize(value) {
  return value.normalize('NFKC').toLowerCase().replace(/\s/gu, '')
    .replace(/[ァ-ヶ]/gu, character => String.fromCharCode(character.charCodeAt(0) - 0x60));
}

export function publicBook({ encoding, _search, ...book }) { return book; }

export function searchCatalog(books, query, orthography, requestedPage) {
  const terms = query.trim().split(/\s+/u).filter(Boolean).map(normalize);
  const matches = books.filter(book => (!orthography || book.orthography === orthography)
    && terms.every(term => book._search.includes(term)));
  const pages = Math.max(1, Math.ceil(matches.length / 20));
  const page = Math.min(Math.max(requestedPage, 1), pages);
  return { books: matches.slice((page - 1) * 20, page * 20).map(publicBook),
    total: matches.length, page, pages, stale: false };
}

export function extractText(html) {
  const stack = [];
  const parts = [];
  let found = false;
  let images = 0;
  const parser = new Parser({
    onopentag(tag, attrs) {
      const parent = stack.at(-1);
      const classes = (attrs.class || '').split(/\s+/u);
      const active = parent?.active || classes.includes('main_text');
      const skip = parent?.skip || ['rt', 'rp', 'script', 'style'].includes(tag) || classes.includes('notes');
      stack.push({ tag, active, skip });
      if (!active || skip) return;
      found = true;
      if (['br', 'p', 'div'].includes(tag)) parts.push('\n');
      else if (tag === 'img') {
        const alt = attrs.alt || '';
        const code = alt.match(/U\+([0-9a-f]{4,6})/i);
        if (code && parseInt(code[1], 16) <= 0x10ffff) parts.push(String.fromCodePoint(parseInt(code[1], 16)));
        else { parts.push(alt || '［挿図］'); images++; }
      }
    },
    onclosetag(tag) {
      const current = stack.pop();
      if (current?.active && !current.skip && ['p', 'div'].includes(tag)) parts.push('\n');
    },
    ontext(text) {
      const current = stack.at(-1);
      if (current?.active && !current.skip) parts.push(text);
    },
  }, { decodeEntities: true, recognizeSelfClosing: true });
  parser.end(html);
  const text = parts.join('').replace(/\r\n?/g, '\n').replace(/\n[ \t　]*\n(?:[ \t　]*\n)*/g, '\n\n').trim();
  if (!found || !text) throw new Error('この作品の本文を抽出できませんでした。図書カードから原文をご確認ください。');
  return { text, images };
}

export async function fetchBook(book, fetcher = fetch) {
  let url = officialUrl(book.url);
  const signal = AbortSignal.timeout(25000);
  for (let redirects = 0; redirects < 4; redirects++) {
    const response = await fetcher(url, {
      redirect: 'manual', signal,
      headers: { 'User-Agent': 'readfast/0.1 (personal Aozora reader)' },
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      await response.body?.cancel();
      const location = response.headers.get('location');
      if (!location) throw new Error('本文の転送先が見つかりませんでした。');
      url = officialUrl(new URL(location, url).href);
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error('青空文庫から本文を取得できませんでした。時間をおいて再試行してください。');
    }
    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 12_000_000) {
        await reader.cancel();
        throw new Error('作品のファイルが大きすぎるため読み込めませんでした。');
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const decoder = new TextDecoder(/utf/i.test(book.encoding) ? 'utf-8' : 'shift_jis', { fatal: true });
    return { ...publicBook(book), ...extractText(decoder.decode(bytes)) };
  }
  throw new Error('本文の転送が多すぎるため読み込めませんでした。');
}
