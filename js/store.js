// Veriler telefonun kendisinde (localStorage) saklanır. Sunucu yok, ücret yok.
// Ayarlar > Yedek ile JSON dosyası olarak dışa/içe aktarılabilir.

import { iconKey } from './icons.js';

const KEY = 'harcama-agaci:v1';

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
    name: 'Sağlık', icon: 'heart', color: '#64D2FF', limit: 1000,
    keywords: ['eczane', 'hastane', 'doktor', 'dişçi', 'diş hekimi', 'poliklinik', 'muayene', 'ilaç', 'vitamin', 'spor salonu', 'macfit', 'gym', 'berber', 'kuaför'],
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
    settings: { salary: 0, payday: 15, onboarded: false },
    categories: DEFAULT_CATEGORIES.map((c, i) => ({ id: uid(), order: i, fallback: false, ...c, keywords: [...c.keywords] })),
    fixed: [],
    expenses: [],
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
          .map((e) => ({ id: e.id || uid(), title: String(e.title || 'Harcama'), amount: Number(e.amount), date: new Date(e.date).toISOString(), categoryId: e.categoryId || null }))
      : [],
  };
  if (!out.categories.some((c) => c.fallback)) {
    out.categories.push({ id: uid(), name: 'Diğer', icon: 'dots', color: '#8E8E93', limit: 0, keywords: [], order: out.categories.length, fallback: true });
  }
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
