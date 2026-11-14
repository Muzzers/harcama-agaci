// Otomatik gruplama: başlıktaki kelimeleri kategori anahtar kelimeleriyle eşleştirir.
// En uzun (en spesifik) eşleşme kazanır. Elle düzeltilen başlıklar öğrenilir.

const MAP = { ı: 'i', ğ: 'g', ü: 'u', ş: 's', ö: 'o', ç: 'c', â: 'a', î: 'i', û: 'u' };

export function normalize(s) {
  return String(s ?? '')
    .toLocaleLowerCase('tr-TR')
    .replace(/[ığüşöçâîû]/g, (c) => MAP[c])
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9&]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function categorize(title, categories) {
  const text = normalize(title);
  if (!text) return null;
  const tokens = text.split(' ');
  const padded = ` ${text} `;
  let best = null;
  let bestLen = 0;

  for (const c of categories) {
    for (const k of c.keywords || []) {
      const nk = normalize(k);
      if (!nk) continue;
      const hit = nk.includes(' ') ? padded.includes(` ${nk}`) : tokens.some((t) => t.startsWith(nk));
      if (hit && nk.length > bestLen) {
        best = c;
        bestLen = nk.length;
      }
    }
  }
  return best || categories.find((c) => c.fallback) || null;
}

/** Bu başlığı bir dahaki sefere bu kategoriye koy. */
export function learn(title, category, categories) {
  if (!category) return;
  const key = normalize(title)
    .split(' ')
    .filter((t) => t && !/^\d+$/.test(t))
    .join(' ');
  if (key.length < 3) return;
  for (const c of categories) {
    if (c.id !== category.id) c.keywords = (c.keywords || []).filter((k) => normalize(k) !== key);
  }
  category.keywords = category.keywords || [];
  if (!category.keywords.some((k) => normalize(k) === key)) category.keywords.unshift(key);
}
