import { characters, splitText, displayDuration } from './core.js';

const $ = (id) => document.getElementById(id);
const sample = '読むことは、ことばと出会うこと。\nいつもは視線を動かして追いかける文章を、ここでは同じ場所に少しずつ表示します。\nはじめはゆっくり。慣れてきたら、少しだけスピードを上げてみましょう。\n大切なのは、速さだけではありません。意味を受け取りながら、自分に合うリズムを見つけてください。';
let source = '';
let chunks = [];
let index = 0;
let playing = false;
let finished = false;
let timer;

function fitWord() {
  const word = $('word');
  word.style.fontSize = '';
  const width = $('word').parentElement.clientWidth - 40;
  if (word.scrollWidth > width) {
    const current = parseFloat(getComputedStyle(word).fontSize);
    word.style.fontSize = `${current * width / word.scrollWidth}px`;
  }
}

function render() {
  $('word').textContent = chunks[index] || 'ここから、読む。';
  $('counter').textContent = `${chunks.length ? index + 1 : 0} / ${chunks.length}`;
  $('progress-bar').style.width = `${chunks.length ? (finished ? 100 : index / chunks.length * 100) : 0}%`;
  $('play').textContent = playing ? '一時停止 Ⅱ' : finished ? 'もう一度読む ↺' : '再生する ▶';
  $('state').textContent = playing ? '読んでいます' : finished ? '読み終わりました' : '一時停止中';
  $('play').disabled = chunks.length === 0;
  $('previous').disabled = !chunks.length || index === 0;
  $('next').disabled = !chunks.length || index === chunks.length - 1;
  $('restart').disabled = !chunks.length;
  fitWord();
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
    render();
    schedule();
  }, displayDuration(chunks[index], Number($('speed').value), $('pause').checked));
}

function toggle() {
  if (!chunks.length) return;
  if (playing) stop();
  else {
    if (finished) index = 0;
    finished = false;
    playing = true;
    schedule();
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
  index = 0;
  finished = false;
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
$('restart').addEventListener('click', () => move(0));
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
  $('size-value').innerHTML = `${Number($('size').value)} <small>文字まで</small>`;
  prepare(source);
});
$('pause').addEventListener('change', schedule);
document.addEventListener('keydown', (event) => {
  if (event.target.closest('input, textarea, button, a, [contenteditable]') || event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
  if (['Space', 'ArrowLeft', 'ArrowRight'].includes(event.code)) {
    event.preventDefault();
    if (event.code === 'Space') toggle();
    else move(index + (event.code === 'ArrowLeft' ? -1 : 1));
  }
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && playing) { stop(); render(); }
});
window.addEventListener('resize', fitWord);
$('text').value = sample;
countText();
prepare(sample);
