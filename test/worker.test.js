import test from 'node:test';
import assert from 'node:assert/strict';
import { extractText, fetchBook, normalize, officialUrl, searchCatalog } from '../worker/aozora.js';
import { createWorker } from '../worker/handler.js';

const book = { id: '1', title: '教祖の文学', subtitle: '小林秀雄論', authors: ['坂口 安吾'],
  orthography: '新字新仮名', url: 'https://www.aozora.gr.jp/cards/001095/files/1_2.html',
  cardUrl: 'https://www.aozora.gr.jp/cards/001095/card1.html', encoding: 'UTF-8',
  _search: normalize('教祖の文学 きょうそのぶんがく 小林秀雄論 坂口安吾 さかぐちあんご') };

test('Worker parser excludes ruby, notes and footer while preserving text, entities, and gaiji', () => {
  const html = '<h1>書名</h1><div class="main_text">水<ruby><rb>道橋</rb><rp>（</rp><rt>どうばし</rt><rp>）</rp></ruby>。<br />'
    + '<div>次の文。<span class="notes">［＃編集注］</span></div>&lt;文&gt;'
    + '<img alt="※［＃U+20BB7］" /><img alt="［挿絵］" />終わり。</div><div>底本：出版社</div>';
  assert.deepEqual(extractText(html), { text: '水道橋。\n\n次の文。\n<文>𠮷［挿絵］終わり。', images: 1 });
  assert.throws(() => extractText('<p>エラーページ</p>'), /抽出できません/);
});

test('Worker search normalizes kana and handles filters, multiple terms and pagination', () => {
  const books = Array.from({ length: 23 }, (_, i) => ({ ...book, id: String(i + 1) }));
  const result = searchCatalog(books, 'ｻｶｸﾞﾁ ｱﾝｺﾞ 小林', '新字新仮名', 2);
  assert.equal(result.total, 23);
  assert.equal(result.books.length, 3);
  assert.equal(result.books[0]._search, undefined);
  assert.equal(searchCatalog(books, '教祖', '旧字旧仮名', 1).total, 0);
  assert.equal(searchCatalog(books, '', '', 100).page, 2);
});

test('Worker only fetches official Aozora pages and rejects external redirect destinations', async () => {
  for (const url of ['http://127.0.0.1/private', 'file:///etc/passwd',
    'https://www.aozora.gr.jp.evil/cards/1/files/a.html',
    'https://user@www.aozora.gr.jp/cards/1/files/a.html',
    'https://www.aozora.gr.jp/cards/1/files/a.html?redirect=secret']) assert.throws(() => officialUrl(url));
  const calls = [];
  await assert.rejects(fetchBook(book, async url => {
    calls.push(url);
    return new Response('', { status: 302, headers: { location: 'http://127.0.0.1/private' } });
  }), /青空文庫内/);
  assert.equal(calls.length, 1);
});

test('Worker decodes Shift JIS and follows validated same-site redirects', async () => {
  const prefix = new TextEncoder().encode('<div class="main_text">');
  const suffix = new TextEncoder().encode('</div>');
  const bytes = new Uint8Array([...prefix, 0x93, 0xfa, 0x96, 0x7b, ...suffix]);
  let calls = 0;
  const result = await fetchBook({ ...book, encoding: 'ShiftJIS' }, async () => {
    calls++;
    return calls === 1 ? new Response('', { status: 302, headers: { location: '/cards/001095/files/1_3.html' } })
      : new Response(bytes);
  });
  assert.equal(result.text, '日本');
  assert.equal(calls, 2);
});

test('Worker bounds downloads and rejects upstream errors', async () => {
  await assert.rejects(fetchBook(book, async () => new Response('missing', { status: 404 })), /取得できません/);
  await assert.rejects(fetchBook(book, async () => new Response(new Uint8Array(12_000_001))), /大きすぎる/);
});

test('Worker routes static assets and API, with invalid requests rejected before any fetch', async () => {
  let calls = 0;
  const worker = createWorker({ books: [book], updatedAt: '2026-09-28' }, async () => {
    calls++;
    return new Response('<div class="main_text">本文。</div>');
  });
  const env = { ASSETS: { fetch: async () => new Response('static asset') } };
  const send = (path, options) => worker.fetch(new Request('https://reader.example'+path, options), env, {});
  assert.equal(await (await send('/')).text(), 'static asset');
  assert.equal((await send('/api/aozora/search?page=oops')).status, 400);
  assert.equal((await send('/api/aozora/search', { method: 'POST' })).status, 405);
  assert.equal((await send('/api/aozora/books/999')).status, 404);
  assert.equal((await send('/api/aozora/books/https://example.com')).status, 404);
  assert.equal(calls, 0);
  assert.equal((await (await send('/api/aozora/search?q=教祖')).json()).total, 1);
  assert.equal((await (await send('/api/aozora/books/1')).json()).text, '本文。');
  assert.equal(calls, 1);
});
