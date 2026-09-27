import test from 'node:test';
import assert from 'node:assert/strict';
import { splitText } from '../public/core.js';
import { chunkRanges } from '../public/full-text.js';

test('full text positions retain original whitespace, paragraphs, and repeated phrases', () => {
  const source = '　同じ文章。\r\n\r\n同じ文章。\n  English\t  words with  spaces.\n終わり。';
  const chunks = splitText(source, 6);
  const ranges = chunkRanges(source, chunks);
  let cursor = 0;
  const rebuilt = ranges.map(({ start, end }, i) => {
    assert.ok(start >= cursor);
    assert.equal(source.slice(start, end).replace(/\s/gu, ''), chunks[i].replace(/\s/gu, ''));
    const part = source.slice(cursor, start) + source.slice(start, end);
    cursor = end;
    return part;
  }).join('') + source.slice(cursor);
  assert.equal(rebuilt, source);
  assert.notEqual(ranges[0].start, ranges[1].start);
});

test('full text ranges use UTF-16 offsets without truncating emoji or combining characters', () => {
  const source = '👩‍💻が𠮷野で読む。がんばる。\n👩‍💻が𠮷野で読む。';
  const chunks = splitText(source, 4);
  const ranges = chunkRanges(source, chunks);
  assert.deepEqual(ranges.map(({ start, end }) => source.slice(start, end)), chunks);
});

test('blank text has no highlighted range; markup remains literal source text', () => {
  assert.deepEqual(chunkRanges(' \n\t', []), []);
  const source = '<script>alert("text")</script> は文字列。';
  const chunks = splitText(source);
  assert.deepEqual(chunkRanges(source, chunks).map(({ start, end }) => source.slice(start, end)), chunks);
});
