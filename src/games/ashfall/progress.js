// Optional cabinet storage must never prevent a local run.
export function readStorage(storage, key, fallback) {
  try { return storage?.get(key, fallback) ?? fallback; } catch { return fallback; }
}
export function writeStorage(storage, key, value) {
  try { storage?.set(key, value); } catch { /* Local play remains available. */ }
}
export function loadProgress(storage) {
  const value = readStorage(storage, 'ashfall-progress-v2', null);
  const cleared = value?.version === 2 && Array.isArray(value.cleared) ? value.cleared.filter(id => [1, 2, 3].includes(id)) : [];
  if (readStorage(storage, 'ashfall-level2', false) === true) cleared.push(1);
  return new Set(cleared);
}
export function loadBest(storage, startId) {
  const value = readStorage(storage, 'ashfall-bests-v2', {})?.[startId];
  return Number.isFinite(value) && value >= 0 ? value : 0;
}
export function saveBest(storage, startId, score) {
  const bests = Object.fromEntries([1, 2, 3].map(id => [id, loadBest(storage, id)]));
  bests[startId] = Math.max(bests[startId], score);
  writeStorage(storage, 'ashfall-bests-v2', bests);
  return bests[startId];
}
