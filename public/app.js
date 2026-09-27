import { characters, splitText, displayDuration } from './core.js';

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
let settlesAt = 0;
let readingElements = [];
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

function buildTrack() {
  readingElements = (chunks.length ? chunks : ['ここから、読む。']).map((text) => {
    const span = document.createElement('span');
    span.className = 'reading-chunk';
    span.textContent = text;
    return span;
  });
  $('reading-track').replaceChildren(...readingElements);
  fitTrack();
}

function fitTrack() {
  const available = $('reading-window').clientWidth * 0.72;
  const fontSize = parseFloat(getComputedStyle($('reading-track')).fontSize);
  for (const span of readingElements) span.style.fontSize = '';
  const widths = readingElements.map((span) => span.scrollWidth);
  readingElements.forEach((span, i) => {
    if (widths[i] > available) span.style.fontSize = `${fontSize * available / widths[i]}px`;
  });
}

function positionTrack(animate) {
  const current = readingElements[index];
  if (!current) return;
  readingElements.forEach((span, i) => {
    span.classList.toggle('is-current', i === index);
    span.classList.toggle('is-past', i < index);
    if (i === index) {
      span.id = 'word';
      span.setAttribute('aria-label', '表示中の文章');
      span.removeAttribute('aria-hidden');
    } else {
      span.removeAttribute('id');
      span.removeAttribute('aria-label');
      span.setAttribute('aria-hidden', 'true');
    }
  });
  const track = $('reading-track');
  const duration = animate && !reducedMotion.matches ? Number($('motion').value) : 0;
  // Keep the active phrase centered, with past and upcoming text on the same
  // baseline. The DOM stays in place; only the line's translation changes.
  const center = current.offsetLeft + current.offsetWidth / 2;
  track.style.transitionDuration = `${duration}ms`;
  track.style.transform = `translate(${-center}px, -50%)`;
  settlesAt = performance.now() + duration;

  // Earlier phrases that have completely left the line remain just above it.
  // Avoid duplicating text still visible on the left of the active phrase.
  const leftEdge = center - $('reading-window').clientWidth / 2;
  let pastEnd = 0;
  while (pastEnd < index && readingElements[pastEnd].offsetLeft + readingElements[pastEnd].offsetWidth <= leftEdge) pastEnd++;
  const past = $('past-text');
  past.textContent = chunks.slice(Math.max(0, pastEnd - 24), pastEnd).join(' ');
  past.scrollTop = past.scrollHeight;
}

function render(animate = false) {
  $('counter').textContent = `${chunks.length ? index + 1 : 0} / ${chunks.length}`;
  $('progress-bar').style.width = `${chunks.length ? (finished ? 100 : index / chunks.length * 100) : 0}%`;
  $('play').textContent = playing ? '一時停止 Ⅱ' : finished ? 'もう一度読む ↺' : '再生する ▶';
  $('state').textContent = playing ? '読んでいます' : finished ? '読み終わりました' : '一時停止中';
  $('play').disabled = chunks.length === 0;
  $('previous').disabled = !chunks.length || index === 0;
  $('next').disabled = !chunks.length || index === chunks.length - 1;
  $('restart').disabled = !chunks.length;
  positionTrack(animate);
}

function stop() {
  clearTimeout(timer);
  playing = false;
}

function schedule() {
  clearTimeout(timer);
  if (!playing) return;
  timer = setTimeout(() => {
    if (index === chunks.length - 1) {
      stop();
      finished = true;
      render();
      return;
    }
    index++;
    render(true);
    schedule();
  }, Math.max(0, settlesAt - performance.now()) + displayDuration(chunks[index], Number($('speed').value), $('pause').checked));
}

function toggle() {
  if (!chunks.length) return;
  if (playing) stop();
  else {
    if (finished) index = 0;
    finished = false;
    playing = true;
  }
  render();
  schedule();
}

function move(to, animate = true) {
  stop();
  finished = false;
  const previous = index;
  index = Math.max(0, Math.min(to, chunks.length - 1));
  render(animate && index !== previous);
}

function prepare(text) {
  stop();
  source = text;
  chunks = splitText(source, Number($('size').value));
  index = 0;
  finished = false;
  buildTrack();
  render();
  $('state').textContent = chunks.length ? '準備できました' : '文章をセットしてください';
  $('message').textContent = chunks.length ? `${chunks.length} 個の区切りをセットしました。入力した文章はブラウザ内で処理されます。` : '読む文章を入力してください。';
}

function countText() {
  $('text-count').textContent = `${characters($('text').value).length.toLocaleString()} 文字`;
}

$('play').addEventListener('click', toggle);
$('previous').addEventListener('click', () => move(index - 1));
$('next').addEventListener('click', () => move(index + 1));
$('restart').addEventListener('click', () => move(0, false));
$('apply').addEventListener('click', () => prepare($('text').value));
$('text').addEventListener('input', () => {
  countText();
  $('message').textContent = '「この文章をセット」でリーダーに反映します。';
});
$('sample').addEventListener('click', () => {
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
$('motion').addEventListener('change', () => { render(); schedule(); });
document.addEventListener('keydown', (event) => {
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
window.addEventListener('resize', () => { fitTrack(); render(); schedule(); });
reducedMotion.addEventListener('change', () => { render(); schedule(); });
$('text').value = sample;
countText();
prepare(sample);
