import { characters, splitText, displayDuration } from './core.js';
import { initAozora } from './aozora.js';
import { createFullTextView } from './full-text.js';
import { createStableHistory } from './stable-history.js';

const $ = (id) => document.getElementById(id);
const sample = [
  'ある制度の導入後に生産性が向上したとしても、その時間的な前後関係だけを根拠に、制度が改善をもたらしたと結論づけることはできない。同じ時期に進んだ技術革新や、制度の導入を選択した組織に固有の性質が、観察された変化を説明している可能性もあるからだ。',
  'ここで問われるのは、制度が実際に導入された状況と、導入されなかったならば成立していたはずの状況との差である。しかし、同一の組織について、この二つの状況を同時に観察することはできない。したがって、因果関係の推定には、比較対象がどのような条件のもとで代替的な役割を果たしうるのか、という仮定の吟味が不可欠になる。',
  '仮に、測定可能な指標について両者がよく似ていたとしても、意思決定の慣行や構成員の期待といった、数値として捉えにくい要因まで等しいとは限らない。比較の精緻さを高める作業と、比較そのものを成立させる前提を疑う作業とは、相互に補完しながらも、論理的には区別されなければならない。',
  'さらに、平均的な効果が正であるという判断は、その利益がすべての構成員に均等に配分されることを意味しない。総体としての効率性を評価する問いと、利益および負担の配分を正当化する問いを混同すれば、分析が精密になるほど、かえって議論の核心が見えにくくなることさえある。',
  '必要なのは、結論の明快さを急ぐことではなく、何が観察され、何が仮定され、どこから価値判断が介在しているのかを、一つずつ区別する姿勢である。知識の確かさは、断言の強さよりも、その断言が成立する条件をどれだけ明示できるかによって評価されるべきだろう。',
].join('\n\n');
let source = '';
let chunks = [];
let index = 0;
let playing = false;
let finished = false;
let timer;
let mode = 'rapid';
let fullTextDirty = true;
const fullTextView = createFullTextView($('full-text'));
const historyView = createStableHistory($('past-text'));
const library = initAozora((book) => {
  $('text').value = book.text;
  countText();
  prepare(book.text);
  const title = document.createElement('span');
  title.textContent = `${book.title}${book.subtitle ? ' ' + book.subtitle : ''} / ${book.authors.join(' / ')}`;
  const link = document.createElement('a');
  link.href = book.cardUrl;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = '青空文庫・図書カード ↗';
  $('reading-source').replaceChildren(title, link);
  $('reading-source').hidden = false;
  if (book.images) $('message').textContent += ' 一部の挿図・外字は説明文で表示しています。原文もご確認ください。';
});

function clearSource() {
  $('reading-source').hidden = true;
  $('reading-source').replaceChildren();
}

function fitWord() {
  if (mode === 'full') return;
  const word = $('word');
  word.style.fontSize = '';
  const available = $('reading-window').clientWidth * 0.72;
  const fontSize = parseFloat(getComputedStyle(word).fontSize);
  if (word.scrollWidth > available) word.style.fontSize = `${fontSize * available / word.scrollWidth}px`;
}

function commitPosition(position) {
  $('word').textContent = chunks[position] || 'ここから、読む。';
  fitWord();
  if (mode === 'rapid') historyView.render(chunks, position);
  $('counter').textContent = `${chunks.length ? position + 1 : 0} / ${chunks.length}`;
  $('progress-bar').style.width = `${chunks.length ? (finished ? 100 : position / chunks.length * 100) : 0}%`;
  if (mode === 'full') fullTextView.highlight(position);
}

function render() {
  $('play').textContent = playing ? '一時停止 Ⅱ' : finished ? 'もう一度読む ↺' : '再生する ▶';
  $('state').textContent = mode === 'full' ? '全文表示中' : playing ? '読んでいます' : finished ? '読み終わりました' : '一時停止中';
  $('play').disabled = chunks.length === 0;
  $('previous').disabled = !chunks.length || index === 0;
  $('next').disabled = !chunks.length || index === chunks.length - 1;
  $('restart').disabled = !chunks.length;
  $('full-current').disabled = !chunks.length;
  if (mode === 'full') {
    if (fullTextDirty) {
      fullTextView.build(source, chunks);
      fullTextDirty = false;
    }
  }
  commitPosition(index);
  schedule();
}

function setMode(nextMode) {
  if (mode === nextMode) return;
  stop();
  mode = nextMode;
  $('rapid-view').hidden = mode !== 'rapid';
  $('full-view').hidden = mode !== 'full';
  $('mode-rapid').setAttribute('aria-pressed', String(mode === 'rapid'));
  $('mode-full').setAttribute('aria-pressed', String(mode === 'full'));
  render();
  if (mode === 'full') fullTextView.scrollToCurrent();
}

function stop() {
  clearTimeout(timer);
  playing = false;
}

function schedule() {
  clearTimeout(timer);
  if (!playing || mode !== 'rapid') return;
  timer = setTimeout(() => {
    if (index === chunks.length - 1) {
      stop();
      finished = true;
      render();
      return;
    }
    index++;
    render();
  }, displayDuration(chunks[index], Number($('speed').value), $('pause').checked));
}

function toggle() {
  if (!chunks.length || mode !== 'rapid') return;
  if (playing) stop();
  else {
    if (finished) index = 0;
    finished = false;
    playing = true;
  }
  render();
}

function move(to) {
  stop();
  finished = false;
  index = Math.max(0, Math.min(to, chunks.length - 1));
  render();
}

function prepare(text) {
  stop();
  source = text;
  chunks = splitText(source, Number($('size').value));
  fullTextDirty = true;
  index = 0;
  finished = false;
  render();
  if (mode === 'full') fullTextView.scrollToCurrent();
  $('state').textContent = chunks.length ? (mode === 'full' ? '全文表示中' : '準備できました') : '文章をセットしてください';
  $('message').textContent = chunks.length ? `${chunks.length} 個の区切りをセットしました。入力した文章はブラウザ内で処理されます。` : '読む文章を入力してください。';
}

function countText() {
  $('text-count').textContent = `${characters($('text').value).length.toLocaleString()} 文字`;
}

$('play').addEventListener('click', toggle);
$('mode-rapid').addEventListener('click', () => setMode('rapid'));
$('mode-full').addEventListener('click', () => setMode('full'));
$('full-current').addEventListener('click', () => fullTextView.scrollToCurrent());
$('previous').addEventListener('click', () => move(index - 1));
$('next').addEventListener('click', () => move(index + 1));
$('restart').addEventListener('click', () => move(0));
$('apply').addEventListener('click', () => {
  library.cancelLoad();
  if ($('text').value !== source) clearSource();
  prepare($('text').value);
});
$('text').addEventListener('input', () => {
  library.cancelLoad();
  countText();
  $('message').textContent = '「この文章をセット」でリーダーに反映します。';
});
$('sample').addEventListener('click', () => {
  library.cancelLoad();
  clearSource();
  $('text').value = sample;
  countText();
  prepare(sample);
});
$('speed').addEventListener('input', () => {
  $('speed-value').innerHTML = `${Number($('speed').value)} <small>文字 / 分</small>`;
  schedule();
});
$('size').addEventListener('input', () => {
  $('size-value').innerHTML = `${Number($('size').value)} <small>文字目安</small>`;
  prepare(source);
});
$('pause').addEventListener('change', schedule);
document.addEventListener('keydown', (event) => {
  if (mode === 'full') return;
  if (event.target.closest('input, textarea, select, button, a, [contenteditable]') || event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
  if (['Space', 'ArrowLeft', 'ArrowRight'].includes(event.code)) {
    event.preventDefault();
    if (event.code === 'Space') toggle();
    else move(index + (event.code === 'ArrowLeft' ? -1 : 1));
  }
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && playing) { stop(); render(); }
});
window.addEventListener('resize', () => render());
$('text').value = sample;
countText();
prepare(sample);
