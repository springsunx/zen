import localesEn from './locales.en.json';
import localesZhCN from './locales.zh-CN.json';
const locales = {
  'en': localesEn,
  'zh-CN': localesZhCN
};

let current = 'en';
let pref = 'auto';
function normalize(l) {
  if (!l) return 'en';
  const low = l.toLowerCase();
  return low.startsWith('zh') ? 'zh-CN' : 'en';
}

// Initialize language at module load so first render uses the right locale
try {
  const saved = localStorage.getItem('lang') || 'auto';
  pref = saved;
  current = saved === 'auto' ? normalize(navigator.language) : normalize(saved);
} catch {
  pref = 'auto';
  current = normalize(navigator.language);
}

export function setLang(lang) {
  // lang can be 'auto', 'zh-CN', 'en'
  pref = lang === 'auto' ? 'auto' : normalize(lang);
  try { localStorage.setItem('lang', pref); } catch {}
  current = pref === 'auto' ? normalize(navigator.language) : pref;
  try { window.dispatchEvent(new CustomEvent('i18n:change', { detail: { lang: current } })); } catch {}
}
export function getLang() { return current; }
export function getPrefLang() {
  try { return localStorage.getItem('lang') || 'auto'; } catch { return 'auto'; }
}
export function t(key, params) {
  const dict = locales[current] || {};
  let val = dict[key];
  if (val == null) { val = (locales['en']||{})[key]; }
  if (val == null) return key;
  if (!params) return val;
  return val.replace(/\{(\w+)\}/g, (_, k) => params[k] ?? '');
}
// Kept for compatibility; no-op now
export function initI18n() {
  // Already initialized at module load
}
