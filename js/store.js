// Veriler telefonun kendisinde (localStorage) saklanır. Sunucu yok, ücret yok.
// Ayarlar > Yedek ile JSON dosyası olarak dışa/içe aktarılabilir.

import { iconKey } from './icons.js';

const BASE_KEY = 'harcama-agaci:v1';
const BASE_FROM = '0000-00';

// ---------- Maaş geçmişi ----------
// settings.salaryHistory: [{ from: 'YYYY-MM' (dönem anahtarı), amount }]
// Bir dönemin maaşı, o döneme kadar yapılan son değişikliktir.

export function salaryFor(s, periodKey) {
  let amount = 0;
  for (const h of s.settings.salaryHistory || []) if (h.from <= periodKey) amount = h.amount;
  return amount;
}

/** Maaşı bu dönemden itibaren değiştirir. Hiç maaş girilmemişse tüm dönemlere uygular. */
export function setSalary(s, periodKey, amount) {
  const hist = s.settings.salaryHistory || [];
  if (!hist.some((h) => h.amount > 0)) {
    s.settings.salaryHistory = [{ from: BASE_FROM, amount }];
  } else {
    const at = hist.find((h) => h.from === periodKey);
    if (at) at.amount = amount;
    else hist.push({ from: periodKey, amount });
    hist.sort((a, b) => a.from.localeCompare(b.from));
    // Aynı tutarı tekrar eden ardışık kayıtları sadeleştir
    s.settings.salaryHistory = hist.filter((h, i) => i === 0 || h.amount !== hist[i - 1].amount);
  }
  s.settings.salary = salaryFor(s, '9999-99');
}

export function removeSalaryChange(s, from) {
  if (from === BASE_FROM) return;
  s.settings.salaryHistory = (s.settings.salaryHistory || []).filter((h) => h.from !== from);
  s.settings.salary = salaryFor(s, '9999-99');
}
let KEY = BASE_KEY;

/** Hesaba geçince telefondaki kopya o hesaba özel anahtarda tutulur. */
export function useAccount(uid) {
  KEY = uid ? `${BASE_KEY}:${uid}` : BASE_KEY;
}

/** Hesapsız dönemden kalan veri (ilk girişte hesaba taşınır). */
export function loadGuest() {
  try {
    const raw = localStorage.getItem(BASE_KEY);
    return raw ? migrate(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function clearGuest() {
  try {
    localStorage.removeItem(BASE_KEY);
  } catch {
    /* yok say */
  }
}

/** Bu hesabın telefonda kayıtlı kopyası var mı? */
export function hasLocal() {
  try {
    return localStorage.getItem(KEY) != null;
  } catch {
    return false;
  }
}

const LAST_USER = 'harcama-agaci:last-user';
export function rememberUser(u) {
  try {
    if (u) localStorage.setItem(LAST_USER, JSON.stringify(u));
    else localStorage.removeItem(LAST_USER);
  } catch {
    /* yok say */
  }
}
export function lastUser() {
  try {
    return JSON.parse(localStorage.getItem(LAST_USER) || 'null');
  } catch {
    return null;
  }
}

export const PALETTE = ['#30D158', '#FF9F0A', '#0A84FF', '#FFD60A', '#FF375F', '#BF5AF2', '#64D2FF', '#FF6B3D', '#5E5CE6', '#AC8E68', '#8E8E93'];

export const DEFAULT_CATEGORIES = [
  {
    name: 'Market', icon: 'cart', color: '#30D158', limit: 6000,
    keywords: ['market', 'migros', 'a101', 'bim', 'şok', 'carrefour', 'macrocenter', 'metro market', 'hakmar', 'onur market', 'file market', 'bakkal', 'manav', 'kasap', 'fırın', 'ekmek', 'süt', 'getir büyük', 'kırtasiye'],
  },
  {
    name: 'Yeme-İçme', icon: 'coffee', color: '#FF9F0A', limit: 2500,
    keywords: ['starbucks', 'kahve', 'cafe', 'kafe', 'restoran', 'lokanta', 'burger', 'pizza', 'döner', 'kebap', 'lahmacun', 'simit', 'pastane', 'yemeksepeti', 'getir', 'trendyol yemek', 'mcdonalds', 'kfc', 'popeyes', 'dominos', 'little caesars', 'mado', 'kahve dünyası', 'espresso', 'çay', 'tost', 'köfte', 'yemek', 'öğle', 'kantin'],
  },
  {
    name: 'Ulaşım', icon: 'bus', color: '#0A84FF', limit: 2000,
    keywords: ['taksi', 'uber', 'bitaksi', 'martı', 'benzin', 'mazot', 'akaryakıt', 'shell', 'opet', 'bp', 'petrol ofisi', 'totalenergies', 'otopark', 'metro', 'istanbulkart', 'ankarakart', 'kentkart', 'izmirim', 'otobüs', 'dolmuş', 'minibüs', 'marmaray', 'tren', 'tcdd', 'thy', 'pegasus', 'ajet', 'uçak', 'hgs', 'ogs', 'köprü', 'otoyol', 'araç bakım', 'lastik'],
  },
  {
    name: 'Faturalar', icon: 'bolt', color: '#FFD60A', limit: 3000,
    keywords: ['fatura', 'elektrik', 'su faturası', 'doğalgaz', 'igdaş', 'başkentgaz', 'enerjisa', 'ck enerji', 'turkcell', 'vodafone', 'türk telekom', 'türknet', 'superonline', 'internet', 'aidat', 'kira', 'iski', 'aski', 'izsu'],
  },
  {
    name: 'Alışveriş', icon: 'bag', color: '#FF375F', limit: 2500,
    keywords: ['trendyol', 'hepsiburada', 'amazon', 'n11', 'zara', 'lcw', 'lc waikiki', 'h&m', 'koton', 'defacto', 'mavi', 'boyner', 'flo', 'teknosa', 'mediamarkt', 'vatan', 'ikea', 'english home', 'watsons', 'gratis', 'rossmann', 'kıyafet', 'ayakkabı'],
  },
  {
    name: 'Eğlence', icon: 'film', color: '#BF5AF2', limit: 1500,
    keywords: ['sinema', 'netflix', 'spotify', 'youtube', 'disney', 'exxen', 'blutv', 'amazon prime', 'steam', 'playstation', 'xbox', 'konser', 'biletix', 'passo', 'tiyatro', 'oyun', 'bowling', 'kitap', 'dergi'],
  },
  {
    name: 'Diğer', icon: 'dots', color: '#8E8E93', limit: 1000, keywords: [], fallback: true,
  },
];

export function uid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

export function freshState() {
  return {
    version: 1,
    settings: { salary: 0, salaryHistory: [{ from: BASE_FROM, amount: 0 }], payday: 15, onboarded: false, removedHealth: true },
    categories: DEFAULT_CATEGORIES.map((c, i) => ({ id: uid(), order: i, fallback: false, ...c, keywords: [...c.keywords] })),
    fixed: [],
    expenses: [],
    incomes: [],
    updatedAt: 0,
  };
}

function migrate(s) {
  if (!s || typeof s !== 'object' || !Array.isArray(s.categories) || !s.categories.length) return null;
  const out = {
    version: 1,
    settings: { salary: 0, payday: 15, onboarded: true, ...(s.settings || {}) },
    categories: s.categories.map((c, i) => ({
      id: c.id || uid(),
      name: String(c.name || 'Kategori'),
      icon: iconKey(c.icon),
      color: c.color || '#8E8E93',
      limit: Number(c.limit) || 0,
      keywords: Array.isArray(c.keywords) ? c.keywords.map(String) : [],
      order: Number.isFinite(c.order) ? c.order : i,
      fallback: !!c.fallback,
    })),
    fixed: Array.isArray(s.fixed) ? s.fixed.filter((f) => f && f.title).map((f) => ({ id: f.id || uid(), title: String(f.title), amount: Number(f.amount) || 0 })) : [],
    expenses: Array.isArray(s.expenses)
      ? s.expenses
          .filter((e) => e && Number(e.amount) > 0 && !isNaN(new Date(e.date)))
          .map((e) => ({ id: e.id || uid(), title: String(e.title || 'Harcama'), amount: Number(e.amount), date: new Date(e.date).toISOString(), categoryId: e.categoryId || null, ...(e.receipt ? { receipt: true } : {}) }))
      : [],
  };
  out.incomes = Array.isArray(s.incomes)
    ? s.incomes
        .filter((i) => i && Number(i.amount) > 0 && !isNaN(new Date(i.date)))
        .map((i) => ({ id: i.id || uid(), title: String(i.title || 'Gelir'), amount: Number(i.amount), date: new Date(i.date).toISOString() }))
    : [];
  if (!out.categories.some((c) => c.fallback)) {
    out.categories.push({ id: uid(), name: 'Diğer', icon: 'dots', color: '#8E8E93', limit: 0, keywords: [], order: out.categories.length, fallback: true });
  }
  // Tek seferlik: kullanılmayan varsayılan "Sağlık" kategorisini kaldır.
  if (!out.settings.removedHealth) {
    const health = out.categories.find((c) => c.name === 'Sağlık' && !c.fallback);
    if (health && !out.expenses.some((e) => e.categoryId === health.id)) {
      out.categories = out.categories.filter((c) => c !== health);
    }
    out.settings.removedHealth = true;
  }
  out.updatedAt = Number(s.updatedAt) || 0;
  const hist = Array.isArray(out.settings.salaryHistory) ? out.settings.salaryHistory : [];
  out.settings.salaryHistory = hist.length
    ? hist.filter((x) => x && typeof x.from === 'string').map((x) => ({ from: x.from, amount: Number(x.amount) || 0 })).sort((a, b) => a.from.localeCompare(b.from))
    : [{ from: BASE_FROM, amount: Number(out.settings.salary) || 0 }];
  if (!out.settings.salaryHistory.length) out.settings.salaryHistory = [{ from: BASE_FROM, amount: 0 }];
  const ids = new Set(out.categories.map((c) => c.id));
  const fb = out.categories.find((c) => c.fallback).id;
  for (const e of out.expenses) if (!ids.has(e.categoryId)) e.categoryId = fb;
  return out;
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = migrate(JSON.parse(raw));
      if (s) return s;
    }
  } catch {
    /* bozuk veri → temiz başla */
  }
  return freshState();
}

export function save(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function exportJSON(state) {
  return JSON.stringify({ app: 'harcama-agaci', exportedAt: new Date().toISOString(), ...state }, null, 2);
}

export function normalizeState(obj) {
  return migrate(obj);
}

export function importJSON(text) {
  const parsed = JSON.parse(text);
  const s = migrate(parsed);
  if (!s) throw new Error('Bu dosya Harcama Ağacı yedeği gibi görünmüyor.');
  s.settings.onboarded = true;
  return s;
}

/** Tarayıcıdan verileri silmemesini iste (Ana Ekran uygulamasında zaten kalıcı). */
export function requestPersistence() {
  try {
    navigator.storage?.persist?.();
  } catch {
    /* yok say */
  }
}
