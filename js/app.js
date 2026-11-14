import { salaryFor, load, save, requestPersistence, useAccount, loadGuest, clearGuest, hasLocal, rememberUser, lastUser, normalizeState, freshState } from './store.js';
import * as cloud from './cloud.js';
import { showLogin, showLoading, hideAuth } from './auth.js';
import { periodFor, shiftPeriod, inPeriod, isCurrent, daysLeft, daysElapsed, totalDays, periodLabel, periodName } from './period.js';
import { money, moneyShort, moneyInt } from './format.js';
import { Universe } from './universe.js';
import { toast, trackKeyboard } from './ui.js';
import { openAddSheet, openExpenseSheet, openIncomeSheet, openCategorySheet, openSettingsSheet, openListSheet, openOnboarding, openBudgetSheet, openSummarySheet } from './sheets.js';

let state = load();
let viewPeriod = periodFor(new Date(), state.settings.payday);
const listeners = new Set();
let account = null; // { uid, name }
let stopRemote = null;
let syncState = 'idle'; // idle | saving | saved | error | offline
let started = false;

// ---------- Hesaplar ----------

export function sortedCategories(s = state) {
  return [...s.categories].sort((a, b) => a.order - b.order);
}

function buildModel(s, period) {
  const expenses = s.expenses.filter((e) => inPeriod(e.date, period));
  const salary = salaryFor(s, period.key);
  const fixedTotal = s.fixed.reduce((sum, f) => sum + (Number(f.amount) || 0), 0);
  const incomeTotal = (s.incomes || []).filter((i) => inPeriod(i.date, period)).reduce((sum, i) => sum + i.amount, 0);
  const free = salary + incomeTotal - fixedTotal;
  const spent = expenses.reduce((sum, e) => sum + e.amount, 0);

  const categories = sortedCategories(s).map((c) => {
    const list = expenses.filter((e) => e.categoryId === c.id).sort((a, b) => b.amount - a.amount);
    return { ...c, total: list.reduce((sum, e) => sum + e.amount, 0), expenses: list };
  });

  return {
    core: { current: isCurrent(period), hasSalary: salary + incomeTotal > 0, salary, incomeTotal, fixedTotal, free, spent, remaining: free - spent },
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
    persist();
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
    persist();
    viewPeriod = periodFor(new Date(), state.settings.payday);
    render();
  },
  refreshPeriod() {
    viewPeriod = periodFor(isCurrent(viewPeriod) ? new Date() : viewPeriod.start, state.settings.payday);
  },
  get account() {
    return account;
  },
  get syncState() {
    return syncState;
  },
  async signOut() {
    await cloud.flush(onSynced);
    await cloud.signOut();
  },
  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  open: {
    add: (opts) => openAddSheet(ctx, opts),
    expense: (id) => openExpenseSheet(ctx, id),
    income: (id) => openIncomeSheet(ctx, id),
    category: (id) => openCategorySheet(ctx, id),
    settings: () => openSettingsSheet(ctx),
    list: () => openListSheet(ctx),
    budget: () => openBudgetSheet(ctx),
    summary: () => openSummarySheet(ctx),
  },
};

// ---------- Kaydetme ve bulut eşitleme ----------

function persist() {
  state.updatedAt = Date.now();
  if (!save(state)) toast('Kaydedilemedi — depolama dolu olabilir.', 'bad');
  if (account) {
    syncState = 'saving';
    cloud.saveRemote(account.uid, state, onSynced);
  }
}

let lastSyncError = 0;
function onSynced(err) {
  if (!err) {
    syncState = 'saved';
  } else {
    syncState = navigator.onLine === false || err.code === 'unavailable' ? 'offline' : 'error';
    if (syncState === 'error' && Date.now() - lastSyncError > 60000) {
      lastSyncError = Date.now();
      toast(`Buluta kaydedilemedi: ${cloud.errorText(err)}`, 'bad');
    }
  }
  for (const fn of listeners) fn();
}

async function onAuth(user) {
  if (!user) {
    account = null;
    stopRemote?.();
    stopRemote = null;
    rememberUser(null);
    useAccount(null);
    for (const w of document.querySelectorAll('.sheet-wrap')) w.remove();
    showLogin();
    return;
  }
  if (account?.uid === user.uid && started) {
    hideAuth();
    return;
  }

  account = { uid: user.uid, name: cloud.displayName(user) };
  rememberUser(account);
  useAccount(user.uid);

  const local = hasLocal() ? load() : null;
  let remote = null;
  let reachable = true;
  try {
    remote = await cloud.loadRemote(user.uid);
  } catch (err) {
    reachable = false;
    syncState = 'offline';
    if (err?.code === 'permission-denied') toast(cloud.errorText(err), 'bad');
  }

  let next;
  let upload = false;
  if (remote && (!local || remote.updatedAt >= (local.updatedAt || 0))) {
    next = normalizeState({ ...remote.state, updatedAt: remote.updatedAt }) || freshState();
  } else if (local) {
    next = local;
    upload = reachable;
  } else {
    const guest = reachable && !remote ? loadGuest() : null;
    next = guest || freshState();
    upload = reachable;
    if (guest) {
      clearGuest();
      setTimeout(() => toast('Telefondaki verilerin hesabına taşındı'), 600);
    }
  }
  state = next;
  save(state);
  if (upload) {
    syncState = 'saving';
    cloud.saveRemote(account.uid, state, onSynced);
  } else if (reachable) {
    syncState = 'saved';
  }

  viewPeriod = periodFor(new Date(), state.settings.payday);
  hideAuth();
  start();
  render();

  stopRemote?.();
  try {
    stopRemote = await cloud.watchRemote(user.uid, (r) => {
      if (r.updatedAt <= (state.updatedAt || 0)) return;
      const incoming = normalizeState({ ...r.state, updatedAt: r.updatedAt });
      if (!incoming) return;
      state = incoming;
      save(state);
      syncState = 'saved';
      render();
    });
  } catch {
    /* çevrimdışı; bağlanınca sayfa yenilendiğinde tekrar denenir */
  }
}

// ---------- Ekran ----------

const stage = document.getElementById('stage');
const universe = new Universe(stage, {
  onTapCore: () => ctx.open.budget(),
  onLongPressCore: () => universe.setExpanded(!universe.expanded),
  onTapCategory: (id) => ctx.open.category(id),
  onTapExpense: (id) => ctx.open.expense(id),
});

const $ = (id) => document.getElementById(id);

/** Tema ve yazı boyutu ayarlarını sayfaya uygular. */
function applyLook() {
  const root = document.documentElement;
  const theme = state.settings.theme || 'auto';
  if (theme === 'auto') delete root.dataset.theme;
  else root.dataset.theme = theme;
  const fs = Number(state.settings.fontScale) || 1;
  root.style.fontSize = `${16 * fs}px`;
  root.style.setProperty('--fs', String(fs));
  const dark = theme === 'dark' || (theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  for (const m of document.querySelectorAll('meta[name=theme-color]')) m.content = dark ? '#0a0b1c' : '#eef0fa';
}

function render() {
  applyLook();
  const model = buildModel(state, viewPeriod);
  universe.setData(model);

  const current = isCurrent(viewPeriod);
  $('period-title').textContent = periodLabel(viewPeriod);
  $('period-sub').textContent = `${current ? periodName(viewPeriod) : `${periodName(viewPeriod)} · geçmiş`} · özet ›`;
  $('next-period').disabled = current || viewPeriod.start > new Date();

  const hint = $('stage-hint');
  hint.hidden = model.count > 0;
  hint.textContent = current ? 'İlk harcamanı eklemek için + düğmesine dokun. “Starbucks 150” yazman yeterli.' : 'Bu dönemde harcama yok.';

  for (const fn of listeners) fn();
}

// ---------- Olaylar ----------

$('btn-add').addEventListener('click', () => ctx.open.add());
$('btn-settings').addEventListener('click', () => ctx.open.settings());
$('btn-list').addEventListener('click', () => ctx.open.list());
$('period-label').addEventListener('click', () => ctx.open.summary());
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

function start() {
  if (started) {
    if (!state.settings.onboarded) setTimeout(() => openOnboarding(ctx), 350);
    return;
  }
  started = true;
  render();
  if (!state.settings.onboarded) setTimeout(() => openOnboarding(ctx), 350);
}

trackKeyboard();
requestPersistence();

if (!cloud.cloudEnabled()) {
  start();
} else {
  // Daha önce giriş yapıldıysa telefondaki kopyayla hemen aç, bulut arkadan gelsin.
  const last = lastUser();
  if (last?.uid) {
    account = last;
    useAccount(last.uid);
    state = load();
    viewPeriod = periodFor(new Date(), state.settings.payday);
    start();
  } else {
    showLoading();
  }
  cloud.watchAuth(onAuth, () => {
    syncState = 'offline';
    if (!last?.uid) showLogin({ notice: 'İnternet bağlantısı yok. Giriş yapmak için bağlan.' });
  });
  window.addEventListener('online', () => cloud.flush(onSynced));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') cloud.flush(onSynced);
  });
}

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
