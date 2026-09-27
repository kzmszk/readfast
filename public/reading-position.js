// Context always ends immediately before the focused phrase, regardless of
// viewport width or how much of the scrolling line is still visible.
export function pastContext(chunks, index, count = 24) {
  return chunks.slice(Math.max(0, index - count), index);
}

// Commit the highlight and its context together, after movement has finished.
// Rapid navigation can cancel a pending movement; only the newest may commit.
export function createPositionCoordinator(commit, onSettled) {
  let generation = 0;
  let pending = null;
  return {
    get moving() { return pending !== null; },
    async moveTo(index, animation = null) {
      const version = ++generation;
      pending?.cancel();
      pending = animation;
      if (animation) {
        try { await animation.finished; }
        catch { return; }
      }
      if (version !== generation) return;
      pending = null;
      commit(index);
      onSettled();
    },
  };
}
