const nfMoney = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 });
const nfInt = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 });
const nfCompact = new Intl.NumberFormat('tr-TR', { notation: 'compact', maximumFractionDigits: 1 });

/** 1250.5 → "1.250,5 ₺" */
export const money = (v) => `${nfMoney.format(v || 0)} ₺`;

/** Kuruşsuz: "29.335 ₺" */
export const moneyInt = (v) => `${nfInt.format(v || 0)} ₺`;

/** Küçük baloncuklar için kısa: "1.250 ₺", "12,5 B ₺" */
export const moneyShort = (v) =>
  Math.abs(v || 0) < 10000 ? moneyInt(v) : `${nfCompact.format(v)} ₺`;

/** Input'a yazmak için: 1250.5 → "1250,5" */
export const amountInput = (v) => (v == null || v === 0 ? '' : String(v).replace('.', ','));

const fmtDay = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' });
const fmtDate = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short' });
const fmtTime = new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit' });

export const dayLabel = (d) => fmtDay.format(new Date(d));
export const shortDate = (d) => fmtDate.format(new Date(d));
/** Saati bilinmeyen (öğlen 12:00 olarak kaydedilen) harcamalarda boş döner. */
export const timeLabel = (d) => {
  const x = new Date(d);
  return x.getHours() === 12 && x.getMinutes() === 0 && x.getSeconds() === 0 ? '' : fmtTime.format(x);
};

export function toDateInput(d) {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}

/** Bugünse şu anki saat, değilse öğlen 12:00. */
export function fromDateInput(v, keepTimeOf) {
  const [y, m, d] = String(v).split('-').map(Number);
  if (!y || !m || !d) return new Date();
  const now = new Date();
  if (keepTimeOf) {
    const k = new Date(keepTimeOf);
    return new Date(y, m - 1, d, k.getHours(), k.getMinutes());
  }
  if (y === now.getFullYear() && m === now.getMonth() + 1 && d === now.getDate()) return now;
  return new Date(y, m - 1, d, 12);
}
