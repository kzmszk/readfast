import test from 'node:test';
import assert from 'node:assert/strict';
import { pastContext, createPositionCoordinator } from '../public/reading-position.js';

function movement() {
  let finish, reject;
  const finished = new Promise((resolve, fail) => { finish = resolve; reject = fail; });
  return { finished, finish, cancel: () => reject(new Error('Cancelled')) };
}

test('history ends at the phrase immediately before the current one', () => {
  const chunks = ['制度の', '導入後に', '生産性が', '向上した。'];
  assert.deepEqual(pastContext(chunks, 0), []);
  assert.deepEqual(pastContext(chunks, 1), ['制度の']);
  assert.deepEqual(pastContext(chunks, 3), chunks.slice(0, 3));
  assert.deepEqual(pastContext(chunks, 2), chunks.slice(0, 2));
  assert.deepEqual(pastContext(chunks, 3, 2), chunks.slice(1, 3));
});

test('focus, context and dwell start commit only after motion completes', async () => {
  const commits = [];
  let dwells = 0;
  const controller = createPositionCoordinator(i => commits.push(i), () => dwells++);
  await controller.moveTo(0);
  const animation = movement();
  const completion = controller.moveTo(1, animation);
  assert.equal(controller.moving, true);
  assert.deepEqual(commits, [0]);
  assert.equal(dwells, 1);
  animation.finish();
  await completion;
  assert.deepEqual(commits, [0, 1]);
  assert.equal(dwells, 2);
  assert.equal(controller.moving, false);
});

test('rapid forward/back navigation cannot publish stale context', async () => {
  const commits = [];
  const controller = createPositionCoordinator(i => commits.push(i), () => {});
  const first = movement();
  const second = movement();
  const oldMove = controller.moveTo(4, first);
  const newMove = controller.moveTo(2, second);
  second.finish();
  await Promise.all([oldMove, newMove]);
  assert.deepEqual(commits, [2]);
});

test('reset or pause cancels motion and synchronizes immediately', async () => {
  const commits = [];
  const controller = createPositionCoordinator(i => commits.push(i), () => {});
  const animation = movement();
  const oldMove = controller.moveTo(6, animation);
  await controller.moveTo(0);
  await oldMove;
  assert.deepEqual(commits, [0]);
  assert.equal(controller.moving, false);
});

test('an already-finished old animation cannot override a newer move', async () => {
  const commits = [];
  const controller = createPositionCoordinator(i => commits.push(i), () => {});
  const oldMove = controller.moveTo(3, { finished: Promise.resolve(), cancel() {} });
  await controller.moveTo(1);
  await oldMove;
  assert.deepEqual(commits, [1]);
});
