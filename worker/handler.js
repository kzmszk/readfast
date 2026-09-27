import { fetchBook, searchCatalog } from './aozora.js';

const json = (data, status = 200, cache = 'no-store') => Response.json(data, {
  status, headers: { 'Cache-Control': cache, 'X-Content-Type-Options': 'nosniff' },
});

export function createWorker(catalog, fetcher = fetch) {
  const byId = new Map(catalog.books.map(book => [book.id, book]));
  return {
    async fetch(request, env, ctx) {
      const url = new URL(request.url);
      if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
      if (request.method !== 'GET') return json({ error: 'GETでアクセスしてください。' }, 405);
      try {
        if (url.pathname === '/api/aozora/search') {
          const page = url.searchParams.get('page') || '1';
          if (!/^\d{1,6}$/.test(page)) return json({ error: 'ページ番号が正しくありません。' }, 400);
          return json({ ...searchCatalog(catalog.books, (url.searchParams.get('q') || '').slice(0, 200),
            url.searchParams.get('orthography') || '', Number(page)), catalogUpdatedAt: catalog.updatedAt });
        }
        const match = url.pathname.match(/^\/api\/aozora\/books\/(\d{1,6})$/);
        if (!match) return json({ error: '指定された機能はありません。' }, 404);
        const book = byId.get(String(Number(match[1])));
        if (!book) return json({ error: '目録に作品が見つかりません。' }, 404);
        const cache = globalThis.caches?.default;
        const key = new Request(`${url.origin}/api/aozora/books/${book.id}?catalog=${catalog.updatedAt}`);
        const cached = await cache?.match(key);
        if (cached) return cached;
        const response = json(await fetchBook(book, fetcher), 200, 'public, max-age=86400');
        if (cache) ctx.waitUntil(cache.put(key, response.clone()).catch(() => {}));
        return response;
      } catch (error) {
        // Only expose our known errors; platform/network failures have a stable message.
        const message = /[\u3040-\u30ff]/.test(error.message) ? error.message
          : '青空文庫の本文を読み込めませんでした。時間をおいて、もう一度お試しください。';
        return json({ error: message }, 502);
      }
    },
  };
}
