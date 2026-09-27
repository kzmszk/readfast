const $ = (id) => document.getElementById(id);

async function request(path, signal) {
  const response = await fetch(path, { signal });
  if (!response.headers.get('content-type')?.includes('application/json')) {
    throw new Error('青空文庫機能を利用するには、npm start で起動した画面を開いてください。');
  }
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || '読み込みに失敗しました。もう一度お試しください。');
  return data;
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  node.className = className;
  if (text) node.textContent = text;
  return node;
}

export function initAozora(onLoad) {
  let searchController;
  let loadController;
  let page = 1;
  let pages = 1;
  let initialized = false;
  let query = '';
  let orthography = '';

  function cancelLoad() {
    if (!loadController) return;
    loadController.abort();
    loadController = null;
    $('library-load-status').textContent = '作品の読み込みを取り消しました。';
  }

  async function load(book) {
    cancelLoad();
    const controller = loadController = new AbortController();
    $('library-load-status').textContent = `『${book.title}』の本文を読み込んでいます…`;
    try {
      const data = await request(`/api/aozora/books/${book.id}`, controller.signal);
      if (controller !== loadController) return;
      onLoad(data);
      $('library-load-status').textContent = `『${book.title}』をセットしました。リーダーの再生ボタンから読めます。`;
      $('play').focus({ preventScroll: true });
      document.querySelector('.reader').scrollIntoView({ behavior: 'instant', block: 'start' });
    } catch (error) {
      if (error.name !== 'AbortError' && controller === loadController) {
        $('library-load-status').textContent = `『${book.title}』：${error.message}「読む」で再試行できます。`;
      }
    } finally {
      if (controller === loadController) loadController = null;
    }
  }

  function showBooks(books) {
    const items = books.map((book) => {
      const item = element('li', 'book-row');
      const info = element('div', 'book-info');
      info.append(element('h3', 'book-title', book.title));
      if (book.subtitle) info.append(element('p', 'book-subtitle', book.subtitle));
      info.append(element('p', 'book-meta', `${book.authors.join(' / ')} · ${book.orthography}`));
      const actions = element('div', 'book-actions');
      const card = element('a', 'book-card', '図書カード ↗');
      card.href = book.cardUrl;
      card.target = '_blank';
      card.rel = 'noopener noreferrer';
      card.setAttribute('aria-label', `${book.title}の図書カード`);
      const read = element('button', 'secondary', '読む →');
      read.type = 'button';
      read.setAttribute('aria-label', `${book.title}（${book.orthography}）を読む`);
      read.addEventListener('click', () => load(book));
      actions.append(read, card);
      item.append(info, actions);
      return item;
    });
    $('library-results').replaceChildren(...items);
    $('library-results').scrollTop = 0;
  }

  async function search(nextPage = 1, newQuery = false) {
    searchController?.abort();
    const controller = searchController = new AbortController();
    if (newQuery) {
      query = $('library-query').value.trim();
      orthography = $('library-orthography').value;
    }
    $('library-status').textContent = '青空文庫の目録を読み込んでいます…';
    $('library-results').setAttribute('aria-busy', 'true');
    $('library-prev').disabled = $('library-next').disabled = true;
    $('library-retry').hidden = true;
    try {
      const params = new URLSearchParams({ q: query, orthography, page: nextPage });
      const data = await request(`/api/aozora/search?${params}`, controller.signal);
      if (controller !== searchController) return;
      initialized = true;
      page = data.page;
      pages = data.pages;
      showBooks(data.books);
      $('library-status').textContent = data.total
        ? `${data.total.toLocaleString()} 作品${data.stale ? ' · 保存済みの目録を表示中' : ''}`
        : '該当する作品がありません。著者名や題名を短くして試してください。';
      $('library-page').textContent = `${page} / ${pages} ページ`;
      $('library-prev').disabled = page <= 1;
      $('library-next').disabled = page >= pages;
    } catch (error) {
      if (error.name !== 'AbortError' && controller === searchController) {
        showBooks([]);
        $('library-page').textContent = '';
        $('library-status').textContent = error.message;
        $('library-retry').hidden = false;
      }
    } finally {
      if (controller === searchController) $('library-results').setAttribute('aria-busy', 'false');
    }
  }

  $('library').addEventListener('toggle', () => {
    if ($('library').open && !initialized) search(1, true);
  });
  $('library-search').addEventListener('submit', (event) => {
    event.preventDefault();
    search(1, true);
  });
  $('library-orthography').addEventListener('change', () => search(1, true));
  $('library-prev').addEventListener('click', () => search(page - 1));
  $('library-next').addEventListener('click', () => search(page + 1));
  $('library-retry').addEventListener('click', () => search(1, true));
  for (const button of document.querySelectorAll('[data-author]')) {
    button.addEventListener('click', () => {
      $('library-query').value = button.dataset.author;
      search(1, true);
    });
  }
  return { cancelLoad };
}
