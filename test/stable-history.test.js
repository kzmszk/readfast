import test from 'node:test';
import assert from 'node:assert/strict';
import { createHistoryLayout } from '../public/stable-history.js';

test('history appends on the right and only scrolls whole completed lines upward', () => {
  const layout = createHistoryLayout(['abc', 'de', 'fgh', 'ij', 'kl'], text => text.length <= 7);
  assert.deepEqual(layout.at(0), ['', '']);
  assert.deepEqual(layout.at(1), ['', 'abc']);
  assert.deepEqual(layout.at(2), ['', 'abc de']);
  assert.deepEqual(layout.at(3), ['abc de ', 'fgh']);
  assert.deepEqual(layout.at(4), ['abc de ', 'fgh ij']);
  assert.deepEqual(layout.at(5), ['fgh ij ', 'kl']);
});

test('backtracking and jumping preserve the exact earlier layout', () => {
  const chunks = Array.from({ length: 80 }, (_, i) => `文章${i}。`);
  const fits = text => text.length <= 17;
  const layout = createHistoryLayout(chunks, fits);
  const earlier = layout.at(31);
  const later = layout.at(78);
  assert.deepEqual(layout.at(31), earlier);
  assert.deepEqual(layout.at(78), later);
  assert.deepEqual(layout.at(0), ['', '']);
  assert.deepEqual(createHistoryLayout(chunks, fits).at(78), later);
});

test('appending after 24 chunks never shifts existing text horizontally', () => {
  const chunks = Array.from({ length: 50 }, () => 'あ');
  const layout = createHistoryLayout(chunks, text => text.length <= 100);
  const before = layout.at(24);
  const after = layout.at(25);
  assert.equal(after[0], before[0]);
  assert.equal(after[1], before[1] + ' あ');
});

test('long phrases wrap across multiple fixed lines without splitting graphemes', () => {
  const layout = createHistoryLayout(['👩‍💻が𠮷野'], text => [...new Intl.Segmenter('ja', { granularity: 'grapheme' }).segment(text)].length <= 2);
  assert.deepEqual(layout.at(1), ['👩‍💻が', '𠮷野']);
});

test('history includes only completed chunks and can recompute for a new width', () => {
  const chunks = ['abc', 'def', 'ghi'];
  assert.deepEqual(createHistoryLayout(chunks, text => text.length <= 20).at(2), ['', 'abc def']);
  assert.deepEqual(createHistoryLayout(chunks, text => text.length <= 4).at(2), ['abc ', 'def']);
  assert.deepEqual(createHistoryLayout([], () => true).at(10), ['', '']);
});
