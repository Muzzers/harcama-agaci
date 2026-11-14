// Maaş dönemi hesapları. Dönem maaş gününde başlar, bir sonraki maaş gününden
// bir gün önce biter (ör. 15 Kasım – 14 Aralık).

const DAY = 86400000;

const daysIn = (y, m) => new Date(y, m + 1, 0).getDate();
const paydayIn = (y, m, payday) => Math.min(payday, daysIn(y, m));

export function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Verilen tarihin içinde bulunduğu maaş dönemi. */
export function periodFor(date, payday = 15) {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = d.getMonth();
  let start = new Date(y, m, paydayIn(y, m, payday));
  if (d < start) start = new Date(y, m - 1, paydayIn(y, m - 1, payday));
  return periodStarting(start.getFullYear(), start.getMonth(), payday);
}

function periodStarting(y, m, payday) {
  const start = new Date(y, m, paydayIn(y, m, payday));
  const ny = m === 11 ? y + 1 : y;
  const nm = (m + 1) % 12;
  const end = new Date(ny, nm, paydayIn(ny, nm, payday)); // hariç
  return {
    start,
    end,
    key: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`,
  };
}

export function shiftPeriod(period, n, payday = 15) {
  const s = period.start;
  const d = new Date(s.getFullYear(), s.getMonth() + n, 1);
  return periodStarting(d.getFullYear(), d.getMonth(), payday);
}

export function inPeriod(dateLike, period) {
  const t = new Date(dateLike);
  return t >= period.start && t < period.end;
}

export function isCurrent(period, now = new Date()) {
  return now >= period.start && now < period.end;
}

/** Dönemdeki toplam gün sayısı. */
export function totalDays(period) {
  return Math.round((startOfDay(period.end) - startOfDay(period.start)) / DAY);
}

/** Bugün dahil kalan gün (maaş gününe kadar). */
export function daysLeft(period, now = new Date()) {
  if (now >= period.end) return 0;
  if (now < period.start) return totalDays(period);
  return Math.round((startOfDay(period.end) - startOfDay(now)) / DAY);
}

/** Bugün hariç geçen gün. */
export function daysElapsed(period, now = new Date()) {
  return totalDays(period) - daysLeft(period, now);
}

const fmtShort = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short' });
const fmtMonth = new Intl.DateTimeFormat('tr-TR', { month: 'long' });

export function periodLabel(period) {
  const last = new Date(period.end.getTime() - DAY / 2);
  return `${fmtShort.format(period.start)} – ${fmtShort.format(last)}`;
}

export function periodName(period) {
  const name = fmtMonth.format(period.start);
  return name.charAt(0).toLocaleUpperCase('tr-TR') + name.slice(1) + ' maaşı';
}
