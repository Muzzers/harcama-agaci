// Tutar ve metin ayrıştırma ("Starbucks 150", "1.250,50 TL", hesap özeti satırları).

const CURRENCY = /^(tl|try|₺|lira)$/i;

/** "150", "1.250,50", "1250.5", "150tl", "₺99" → sayı. Geçersizse null. */
export function parseAmount(raw) {
  if (raw == null) return null;
  let s = String(raw).trim().toLocaleLowerCase('tr-TR').replace(/₺|try|tl/g, '').replace(/\s+/g, '');
  s = s.replace(/^[+-]/, '');
  if (!s || !/^[0-9.,]+$/.test(s) || !/[0-9]/.test(s)) return null;

  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  let n;
  if (lastDot >= 0 && lastComma >= 0) {
    // Hangisi sondaysa ondalık ayırıcı odur.
    n = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (lastComma >= 0) {
    // Türkçe: tek virgül ondalıktır; birden fazlaysa binlik.
    n = s.split(',').length === 2 ? s.replace(',', '.') : s.replace(/,/g, '');
  } else if (lastDot >= 0) {
    const parts = s.split('.');
    // "1.500" veya "1.250.000" binlik; "12.5" ondalık.
    n = parts.length > 2 || parts[parts.length - 1].length === 3 ? s.replace(/\./g, '') : s;
  } else {
    n = s;
  }
  const v = Number(n);
  return Number.isFinite(v) && v > 0 ? Math.round(v * 100) / 100 : null;
}

/** "Starbucks 150" → { title: "Starbucks", amount: 150 }. Tutar başta da olabilir. */
export function parseQuick(input) {
  const raw = String(input ?? '').trim();
  let tokens = raw.split(/\s+/).filter(Boolean);
  while (tokens.length && CURRENCY.test(tokens[tokens.length - 1])) tokens.pop();

  if (tokens.length >= 2) {
    const last = parseAmount(tokens[tokens.length - 1]);
    if (last != null) return { title: tokens.slice(0, -1).join(' '), amount: last };
    const first = parseAmount(tokens[0]);
    if (first != null) {
      let rest = tokens.slice(1);
      while (rest.length && CURRENCY.test(rest[0])) rest = rest.slice(1);
      if (rest.length) return { title: rest.join(' '), amount: first };
    }
  }
  return { title: raw, amount: null };
}

const INCOME_WORDS = /\b(maaş|maas|gelen|iade|faiz|ödeme alındı|para yatır|eft gelen|havale gelen)\b/i;

// Banka metinleri genelde ASCII büyük harf kullanır (MIGROS = Migros), o yüzden
// "I" → "i" küçültülür; baş harfler Türkçe kuralla büyütülür (istanbul → İstanbul).
function titleCase(s) {
  return s
    .replace(/İ/g, 'i')
    .toLowerCase()
    .normalize('NFC')
    .replace(/(^|\s)(\S)/g, (_, sp, ch) => sp + ch.toLocaleUpperCase('tr-TR'));
}

/**
 * Banka uygulamasından kopyalanan hesap özeti metnini satır satır çözer.
 * Her satırda bir tutar arar; tarih (gg.aa.yyyy) varsa onu kullanır.
 */
export function parseStatement(text, now = new Date()) {
  const rows = [];
  const lines = String(text ?? '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  for (const line of lines) {
    let rest = ` ${line} `;
    let date = null;

    const dm = rest.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{4}|\d{2})(?!\d)/);
    if (dm) {
      const d = +dm[1];
      const m = +dm[2];
      let y = +dm[3];
      if (y < 100) y += 2000;
      if (d >= 1 && d <= 31 && m >= 1 && m <= 12) {
        date = new Date(y, m - 1, d, 12);
        rest = rest.replace(dm[0], ' ');
      }
    }
    rest = rest.replace(/\b\d{1,2}:\d{2}(:\d{2})?\b/g, ' ');

    // Tutar adayları: "1.250,50 TL", "-150,00", "99 TL", "₺45"
    const re = /(^|\s)([+-]?)\s?₺?\s?(\d{1,3}(?:[.\s]\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)\s*(tl|try|₺)?(?=\s|$)/gi;
    const candidates = [];
    let mm;
    while ((mm = re.exec(rest))) {
      const amount = parseAmount(mm[3].replace(/\s/g, '.'));
      if (amount == null) continue;
      const decimal = /[.,]\d{1,2}$/.test(mm[3]);
      candidates.push({ amount, sign: mm[2], hasCur: !!mm[4], decimal, text: mm[0] });
    }
    if (!candidates.length) continue;

    // Para birimi yazan ya da kuruşlu olanı tercih et; yoksa ilk sayı.
    const pick = candidates.find((c) => c.hasCur) || candidates.find((c) => c.decimal) || candidates[0];
    rest = rest.replace(pick.text, ' ');
    for (const c of candidates) if (c !== pick) rest = rest.replace(c.text, ' ');

    let title = rest.replace(/[|;*_]+/g, ' ').replace(/\s[-–]\s/g, ' ').replace(/\s+/g, ' ').trim();
    if (!title || !/\p{L}/u.test(title)) title = 'Harcama';
    if (title === title.toLocaleUpperCase('tr-TR')) title = titleCase(title);
    if (title.length > 48) title = title.slice(0, 48).trim() + '…';

    const income = pick.sign === '+' || INCOME_WORDS.test(line);
    rows.push({ title, amount: pick.amount, date: date || now, income, line });
  }
  return rows;
}
