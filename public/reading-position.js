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
