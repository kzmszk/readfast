import test from 'node:test';
import assert from 'node:assert/strict';
import { characters, splitText, displayDuration } from '../public/core.js';

test('Japanese text is preserved at different target lengths', () => {
  const text = '今日はいい天気です。ゆっくり散歩しましょう！';
  for (const size of [4, 10, 16]) {
    const chunks = splitText(text, size);
    assert.equal(chunks.join(''), text);
    assert.ok(chunks.every((chunk) => !/[。！].+/u.test(chunk)));
  }
});

test('emoji and combining characters are never split', () => {
  const text = '👨‍👩‍👧‍👦こんにちは🇯🇵e\u0301';
  const chunks = splitText(text, 4);
  assert.deepEqual(chunks.flatMap(characters), characters(text));
});

test('long English words, blank input and paragraph boundaries', () => {
  assert.deepEqual(splitText('  \n\t '), []);
  assert.deepEqual(splitText('前半\r\n後半', 16), ['前半', '後半']);
  const text = 'supercalifragilistic';
  assert.equal(splitText(text, 4).join(''), text);
  assert.deepEqual(splitText(text, 4), [text]);
  assert.deepEqual(splitText('Hello world', 16), ['Hello world']);
});

test('the difficult sample keeps particles and conjugated words together', () => {
  const text = 'その時間的な前後関係だけを根拠に、制度が改善をもたらしたと結論づけることはできない。';
  const chunks = splitText(text, 10);
  for (const phrase of ['時間的な', '根拠に、', 'もたらしたと', '結論づける']) {
    assert.ok(chunks.some((chunk) => chunk.includes(phrase)), `${phrase}: ${chunks.join(' / ')}`);
  }
  assert.equal(chunks.join(''), text);
  assert.ok(!chunks.some((chunk) => /^[、。]/u.test(chunk)));
});

test('a phrase may exceed the target instead of being cut mid-expression', () => {
  assert.deepEqual(splitText('向上したとしても、', 4), ['向上したとしても、']);
  const text = 'ある制度の導入後に生産性が向上したとしても、';
  assert.ok(splitText(text, 4).length > splitText(text, 16).length);
});

test('punctuation stays with the preceding phrase and creates a pause boundary', () => {
  assert.deepEqual(splitText('今日は晴れ、明日は雨。', 16), ['今日は晴れ、', '明日は雨。']);
  const text = '彼は「本当ですか？」と尋ねた。次の文です。';
  for (const size of [4, 10, 16]) {
    const chunks = splitText(text, size);
    assert.equal(chunks.join(''), text);
    assert.ok(chunks.some((chunk) => chunk.endsWith('？」')));
    assert.ok(chunks.every((chunk) => !/^[、。！？」』）]/u.test(chunk)));
    assert.ok(chunks.every((chunk) => !/[「『（]$/u.test(chunk)));
  }
});

test('timing scales with text length and speed, with optional punctuation pauses', () => {
  assert.equal(displayDuration('あいうえお', 600), 500);
  assert.equal(displayDuration('あいうえお', 1200), 250);
  assert.equal(displayDuration('文。', 600), 500);
  assert.equal(displayDuration('文。', 600, false), 200);
  assert.equal(displayDuration('文、', 600), 350);
  assert.throws(() => displayDuration('文', 0), RangeError);
  assert.throws(() => splitText('文', 0), RangeError);
});
