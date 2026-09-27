import test from 'node:test';
import assert from 'node:assert/strict';
import { characters, splitText, displayDuration } from '../public/core.js';

test('Japanese text is preserved and every chunk respects its limit', () => {
  const text = '今日はいい天気です。ゆっくり散歩しましょう！';
  for (const size of [4, 10, 16]) {
    const chunks = splitText(text, size);
    assert.equal(chunks.join(''), text);
    assert.ok(chunks.every((chunk) => characters(chunk).length <= size));
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
  assert.ok(splitText(text, 4).every((chunk) => chunk.length <= 4));
  assert.deepEqual(splitText('Hello world', 16), ['Hello world']);
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
