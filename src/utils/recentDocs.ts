const KEY = 'cozhocam_recent';
const MAX = 5;

export function loadRecentDocIds(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const ids = JSON.parse(raw);
    return Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function pushRecentDocId(id: string): string[] {
  const prev = loadRecentDocIds().filter(x => x !== id);
  const next = [id, ...prev].slice(0, MAX);
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}
