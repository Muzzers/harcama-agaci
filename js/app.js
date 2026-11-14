import { load, save, requestPersistence } from './store.js';
import { periodFor, shiftPeriod, inPeriod, isCurrent, daysLeft, daysElapsed, totalDays, periodLabel, periodName } from './period.js';
import { money, moneyShort, moneyInt } from './format.js';
import { Universe } from './universe.js';
import { toast, trackKeyboard } from './ui.js';
import { openAddSheet, openExpenseSheet, openCategorySheet, openSettingsSheet, openListSheet, openOnboarding } from './sheets.js';

let state = load();
let viewPeriod = periodFor(new Date(), state.settings.payday);
const listeners = new Set();

// ---------- Hesaplar ----------

export function sortedCategories(s = state) {
  return [...s.categories].sort((a, b) => a.order - b.order);
}

function buildModel(s, period) {
  const expenses = s.expenses.filter((e) => inPeriod(e.date, period));
  const salary = Number(s.settings.salary) || 0;
  const fixedTotal = s.fixed.reduce((sum, f) => sum + (Number(f.amount) || 0), 0);
  const free = salary - fixedTotal;
  const spent = expenses.reduce((sum, e) => sum + e.amount, 0);

  const categories = sortedCategories(s).map((c) => {
    const list = expenses.filter((e) => e.categoryId === c.id).sort((a, b) => b.amount - a.amount);
    return { ...c, total: list.reduce((sum, e) => sum + e.amount, 0), expenses: list };
  });

  return {
    core: { hasSalary: salary > 0, salary, fixedTotal, free, spent, remaining: free - spent },
    categories,
    count: expenses.length,
  };
}

// ---------- Paylaşılan bağlam (alt sayfalar bunu kullanır) ----------

const ctx = {
  get state() {
    return state;
  },
  period: () => viewPeriod,
  model: () => buildModel(state, viewPeriod),
  categories: () => sortedCategories(state),
  /** Durumu değiştir, kaydet, yeniden çiz. */
  commit(mutate, { highlight, focusDate } = {}) {
    mutate(state);
    if (!save(state)) toast('Kaydedilemedi — depolama dolu olabilir.', 'bad');
    if (focusDate && !inPeriod(focusDate, viewPeriod)) viewPeriod = periodFor(focusDate, state.settings.payday);
    render();
    if (highlight) {
      if (!universe.expanded) universe.setExpanded(true);
      universe.highlight(highlight);
    }
  },
  /** Tüm durumu değiştir (yedekten yükleme / sıfırlama). */
  replace(next) {
    state = next;
    save(state);
    viewPeriod = periodFor(new Date(), state.settings.payday);
    render();
  },
  refreshPeriod() {
    viewPeriod = periodFor(isCurrent(viewPeriod) ? new Date() : viewPeriod.start, state.settings.payday);
  },
  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  open: {
    add: (opts) => openAddSheet(ctx, opts),
    expense: (id) => openExpenseSheet(ctx, id),
    category: (id) => openCategorySheet(ctx, id),
    settings: () => openSettingsSheet(ctx),
    list: () => openListSheet(ctx),
  },
};

// ---------- Ekran ----------

const stage = document.getElementById('stage');
const universe = new Universe(stage, {
  onTapCore: () => universe.setExpanded(!universe.expanded),
  onTapCategory: (id) => ctx.open.category(id),
  onTapExpense: (id) => ctx.open.expense(id),
});

const $ = (id) => document.getElementById(id);

function render() {
  const model = buildModel(state, viewPeriod);
  universe.setData(model);

  const current = isCurrent(viewPeriod);
  $('period-title').textContent = periodLabel(viewPeriod);
  $('period-sub').textContent = current ? periodName(viewPeriod) : `${periodName(viewPeriod)} · geçmiş`;
  $('next-period').disabled = current || viewPeriod.start > new Date();

  const hint = $('stage-hint');
  hint.hidden = model.count > 0;
  hint.textContent = current ? 'İlk harcamanı eklemek için + düğmesine dokun. “Starbucks 150” yazman yeterli.' : 'Bu dönemde harcama yok.';

  renderDaily(model, current);
  for (const fn of listeners) fn();
}

function renderDaily(model, current) {
  const el = $('daily');
  const { core } = model;
  el.classList.remove('good', 'warn', 'bad');

  if (!core.hasSalary) {
    el.innerHTML = `<span class="daily-main"><b>Maaşını gir</b></span>
      <span class="daily-sub">Günlük harcama limitini hesaplayayım</span>`;
    el.onclick = () => ctx.open.settings();
    return;
  }
  el.onclick = () => ctx.open.list();

  if (!current) {
    const left = core.remaining;
    el.classList.add(left >= 0 ? 'good' : 'bad');
    el.innerHTML = `<span class="daily-main"><b>${left >= 0 ? `${money(left)} arttı` : `${money(-left)} aşıldı`}</b></span>
      <span class="daily-sub">Dönem kapandı · ${moneyShort(core.spent)} harcandı</span>`;
    return;
  }

  const days = Math.max(1, daysLeft(viewPeriod));
  const perDay = core.remaining / days;
  const expected = (core.free * daysElapsed(viewPeriod)) / totalDays(viewPeriod);
  const ahead = core.spent - expected;
  const pace = core.free > 0 ? Math.min(1, Math.max(0, core.spent / core.free)) : 1;
  const time = daysElapsed(viewPeriod) / totalDays(viewPeriod);

  let status;
  if (core.remaining < 0) {
    el.classList.add('bad');
    status = `Bütçe ${moneyInt(-core.remaining)} aşıldı`;
  } else if (ahead > core.free * 0.05) {
    el.classList.add('warn');
    status = `Plandan ${moneyInt(ahead)} hızlı gidiyorsun`;
  } else {
    el.classList.add('good');
    status = ahead < 0 ? `Planın ${moneyInt(-ahead)} gerisindesin` : 'Plana uygun gidiyorsun';
  }

  el.innerHTML = `
    <span class="daily-main"><b>${core.remaining < 0 ? '0 ₺' : moneyInt(perDay)}</b><small>/ gün</small>
      <em>maaşa ${days} gün</em></span>
    <span class="daily-sub">${status}</span>
    <span class="pace" aria-hidden="true"><i style="width:${(pace * 100).toFixed(1)}%"></i><s style="left:${(time * 100).toFixed(1)}%"></s></span>`;
}

// ---------- Olaylar ----------

$('btn-add').addEventListener('click', () => ctx.open.add());
$('btn-settings').addEventListener('click', () => ctx.open.settings());
$('btn-list').addEventListener('click', () => ctx.open.list());
$('prev-period').addEventListener('click', () => {
  viewPeriod = shiftPeriod(viewPeriod, -1, state.settings.payday);
  universe.resetView(true);
  render();
});
$('next-period').addEventListener('click', () => {
  if (isCurrent(viewPeriod)) return;
  viewPeriod = shiftPeriod(viewPeriod, 1, state.settings.payday);
  universe.resetView(true);
  render();
});

// Uygulama arka plandan dönünce (ör. ertesi gün) dönemi güncelle
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    wasCurrent = isCurrent(viewPeriod);
  } else if (wasCurrent) {
    viewPeriod = periodFor(new Date(), state.settings.payday);
    render();
  }
});
let wasCurrent = true;

window.addEventListener('storage', (e) => {
  if (e.key && e.key.startsWith('harcama-agaci')) {
    state = load();
    render();
  }
});

trackKeyboard();
requestPersistence();
render();

if (!state.settings.onboarded) setTimeout(() => openOnboarding(ctx), 350);

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
