
// Backend health circuit breaker with TTL
const KEY = 'backend_down_until';
const TTL_MS = 60000; // 60s window without network requests

function now() { return Date.now(); }

function shouldSkipNetwork() {
  try {
    const until = parseInt(sessionStorage.getItem(KEY) || '0', 10);
    return now() < until;
  } catch { return false; }
}

function markFailure() {
  try { sessionStorage.setItem(KEY, String(now() + TTL_MS)); } catch {}
}

function clearFailure() {
  try { sessionStorage.removeItem(KEY); } catch {}
}

async function probe() {
  // Try a cheap endpoint that requires auth; fall back to /api/tags
  const endpoints = ['/api/users/me', '/api/tags'];
  for (const url of endpoints) {
    try {
      const res = await fetch(url, { method: 'GET', cache: 'no-store' });
      if (res && res.ok) { clearFailure(); return true; }
    } catch (_) {}
  }
  markFailure();
  return false;
}

export default { shouldSkipNetwork, markFailure, clearFailure, probe };
