import { uid, PALETTE, exportJSON, importJSON, freshState, salaryFor, setSalary, removeSalaryChange } from './store.js';
import { categorize, learn, normalize } from './categorizer.js';
import { parseAmount, parseQuick, parseStatement } from './parser.js';
import { inPeriod, isCurrent, periodLabel, periodName, shiftPeriod, daysElapsed, totalDays } from './period.js';
import { money, moneyShort, amountInput, toDateInput, fromDateInput, dayLabel, shortDate, timeLabel } from './format.js';
import { h, esc, openSheet, toast, confirmButton, ICON } from './ui.js';
import { catIcon, ICON_KEYS } from './icons.js';
import { compress, putReceipt, getReceipt, deleteReceipt, showReceipt } from './receipts.js';

const byId = (list, id) => list.find((x) => x.id === id);

const fmtMonthYear = new Intl.DateTimeFormat('tr-TR', { month: 'long', year: 'numeric' });
/** '2027-01' → 'Ocak 2027 dönemi' */
function monthLabel(key) {
  const [y, m] = key.split('-').map(Number);
  const t = fmtMonthYear.format(new Date(y, m - 1, 1));
  return t.charAt(0).toLocaleUpperCase('tr-TR') + t.slice(1) + ' dönemi';
}

function catChips(categories, selectedId, { auto = false } = {}) {
  return categories
    .map(
      (c) => `<button type="button" class="chip ${c.id === selectedId ? 'on' : ''} ${c.id === selectedId && auto ? 'auto' : ''}"
        data-id="${c.id}" style="--c:${c.color}" aria-pressed="${c.id === selectedId}">
        ${catIcon(c.icon)}${esc(c.name)}</button>`
    )
    .join('');
}

function defaultDateFor(period) {
  const now = new Date();
  if (inPeriod(now, period)) return now;
  return new Date(period.end.getTime() - 43200000);
}

function expenseRow(e, cat) {
  return `<button type="button" class="row" data-exp="${e.id}">
    <span class="row-icon" style="--c:${cat?.color || '#8E8E93'}">${catIcon(cat?.icon || 'dots')}</span>
    <span class="row-main"><b>${esc(e.title)}</b><small>${esc(cat?.name || '')} · ${esc(shortDate(e.date))} ${esc(timeLabel(e.date))}${e.receipt ? ' · fişli' : ''}</small></span>
    <span class="row-amt">${esc(money(e.amount))}</span>
  </button>`;
}

/** Fiş seçme alanı: { el, get(), set(dataUrl|null) } */
function receiptField({ onPick, onRemove } = {}) {
  const el = h(`<div class="receipt-field">
      <button type="button" class="receipt-thumb" hidden aria-label="Fişi büyüt"><img alt=""></button>
      <label class="secondary receipt-pick">${ICON.camera}<span>Fiş fotoğrafı ekle</span><input type="file" accept="image/*" hidden></label>
      <button type="button" class="link receipt-remove" hidden>Fişi kaldır</button>
    </div>`);
  let current = null;
  const thumb = el.querySelector('.receipt-thumb');
  const set = (url) => {
    current = url;
    thumb.hidden = !url;
    if (url) thumb.querySelector('img').src = url;
    el.querySelector('.receipt-pick span').textContent = url ? 'Fişi değiştir' : 'Fiş fotoğrafı ekle';
    el.querySelector('.receipt-remove').hidden = !url;
  };
  thumb.addEventListener('click', () => current && showReceipt(current));
  el.querySelector('input').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const span = el.querySelector('.receipt-pick span');
    span.textContent = 'Hazırlanıyor…';
    try {
      const url = await compress(file);
      set(url);
      onPick?.(url);
    } catch (err) {
      set(current);
      toast(err.message || 'Fotoğraf eklenemedi', 'bad');
    }
  });
  el.querySelector('.receipt-remove').addEventListener('click', () => {
    set(null);
    onRemove?.();
  });
  return { el, get: () => current, set };
}

function incomeRow(i) {
  return `<button type="button" class="row income" data-inc="${i.id}">
    <span class="row-icon" style="--c:var(--good)">${catIcon('wallet')}</span>
    <span class="row-main"><b>${esc(i.title)}</b><small>Gelir · ${esc(shortDate(i.date))} ${esc(timeLabel(i.date))}</small></span>
    <span class="row-amt plus">+${esc(money(i.amount))}</span>
  </button>`;
}

function fixedRow(f) {
  return `<button type="button" class="row" data-fixed="${f.id}">
    <span class="row-main"><b>${esc(f.title)}</b><small>her dönem</small></span>
    <span class="row-amt">${esc(money(f.amount))}</span>${ICON.chevron}
  </button>`;
}

// =====================================================================
// Hızlı ekle
// =====================================================================

export function openAddSheet(ctx, { categoryId = null, mode = 'expense' } = {}) {
  const cats = ctx.categories();
  let manualId = categoryId;
  let kind = mode;

  const recent = [];
  const seen = new Set();
  for (const e of [...ctx.state.expenses].sort((a, b) => new Date(b.date) - new Date(a.date))) {
    const k = normalize(e.title);
    if (seen.has(k)) continue;
    seen.add(k);
    recent.push(e);
    if (recent.length >= 6) break;
  }

  const body = h(`
    <form class="form" autocomplete="off" novalidate>
      <div class="seg" role="tablist" aria-label="Tür">
        <button type="button" role="tab" data-kind="expense">Harcama</button>
        <button type="button" role="tab" data-kind="income">Gelir</button>
      </div>
      <label class="field hero">
        <span class="sr">Ne aldın?</span>
        <input name="title" placeholder="Starbucks 150" enterkeyhint="next" autocapitalize="words" spellcheck="false">
      </label>
      <div class="field-row">
        <label class="field money-field">
          <span class="prefix">₺</span>
          <input name="amount" inputmode="decimal" placeholder="Tutar" enterkeyhint="done">
        </label>
        <label class="field date-field">
          <input name="date" type="date">
        </label>
      </div>
      <p class="detected" aria-live="polite"></p>

      <div class="exp-only">
      <div class="label-row"><span>Kategori</span><span class="badge"></span></div>
      <div class="chips cats">${catChips(cats, null)}</div>

      <div class="receipt-slot"></div>

      ${recent.length ? `<div class="label-row"><span>Son eklenenler</span></div>
      <div class="chips recent">${recent
        .map((e) => `<button type="button" class="chip ghost" data-recent="${e.id}">${esc(e.title)} <small>${esc(moneyShort(e.amount))}</small></button>`)
        .join('')}</div>` : ''}
      </div>

      <button class="primary" type="submit" disabled>Ekle</button>
    </form>`);

  const $ = (s) => body.querySelector(s);
  const titleIn = $('[name=title]');
  const amtIn = $('[name=amount]');
  const dateIn = $('[name=date]');
  const submit = $('button[type=submit]');
  dateIn.value = toDateInput(defaultDateFor(ctx.period()));
  const receipt = receiptField();
  $('.receipt-slot').append(receipt.el);

  const read = () => {
    const q = parseQuick(titleIn.value);
    const typed = amtIn.value.trim();
    const amount = typed ? parseAmount(typed) : q.amount;
    const title = !typed && q.amount != null ? q.title : titleIn.value.trim();
    const suggested = title ? categorize(title, cats) : null;
    const chosen = manualId ? byId(cats, manualId) : suggested;
    return { q, typed, amount, title, suggested, chosen };
  };

  const refresh = () => {
    const r = read();
    const income = kind === 'income';
    body.classList.toggle('is-income', income);
    for (const b of body.querySelectorAll('.seg button')) {
      b.classList.toggle('on', b.dataset.kind === kind);
      b.setAttribute('aria-selected', b.dataset.kind === kind);
    }
    titleIn.placeholder = income ? 'İkramiye 5000' : 'Starbucks 150';
    for (const chip of body.querySelectorAll('.cats .chip')) {
      const on = r.chosen?.id === chip.dataset.id;
      chip.classList.toggle('on', on);
      chip.classList.toggle('auto', on && !manualId);
      chip.setAttribute('aria-pressed', on);
    }
    $('.badge').textContent = manualId ? 'elle seçildi · hatırlanacak' : r.chosen ? 'otomatik' : '';
    $('.badge').classList.toggle('learn', !!manualId);
    $('.detected').innerHTML =
      !r.typed && r.q.amount != null && r.title
        ? `<b>${esc(r.title)}</b> · ${esc(money(r.q.amount))}`
        : r.typed && r.amount == null
          ? '<span class="err">Tutar anlaşılmadı</span>'
          : '';
    const ok = !!r.title && r.amount > 0;
    submit.disabled = !ok;
    submit.textContent = ok ? `${income ? 'Gelir ekle' : 'Ekle'} · ${money(r.amount)}` : income ? 'Gelir ekle' : 'Ekle';
  };

  titleIn.addEventListener('input', refresh);
  amtIn.addEventListener('input', refresh);
  $('.seg').addEventListener('click', (e) => {
    const b = e.target.closest('[data-kind]');
    if (!b) return;
    kind = b.dataset.kind;
    refresh();
    titleIn.focus();
  });
  titleIn.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (read().amount > 0) body.requestSubmit();
      else amtIn.focus();
    }
  });

  $('.cats').addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    const current = read().chosen?.id;
    manualId = manualId === chip.dataset.id || (!manualId && current === chip.dataset.id) ? null : chip.dataset.id;
    refresh();
  });

  $('.recent')?.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-recent]');
    if (!chip) return;
    const src = byId(ctx.state.expenses, chip.dataset.recent);
    titleIn.value = src.title;
    amtIn.value = amountInput(src.amount);
    manualId = src.categoryId && src.categoryId !== categorize(src.title, cats)?.id ? src.categoryId : manualId;
    refresh();
    amtIn.focus();
    amtIn.select();
  });

  body.addEventListener('submit', (e) => {
    e.preventDefault();
    const r = read();
    if (!r.title || !(r.amount > 0)) return;
    const date = fromDateInput(dateIn.value);
    if (kind === 'income') {
      ctx.commit((s) => (s.incomes = s.incomes || []).push({ id: uid(), title: r.title, amount: r.amount, date: date.toISOString() }), { focusDate: date });
      sheet.close();
      toast(`Gelir eklendi · +${money(r.amount)}`);
      return;
    }
    const cat = r.chosen;
    const p0 = ctx.period();
    const before = cat && inPeriod(date, p0) ? ctx.state.expenses.filter((e) => e.categoryId === cat.id && inPeriod(e.date, p0)).reduce((s, e) => s + e.amount, 0) : null;
    const shouldLearn = manualId && cat && r.suggested?.id !== cat.id;
    const photo = receipt.get();
    const exp = { id: uid(), title: r.title, amount: r.amount, date: date.toISOString(), categoryId: cat?.id || null, ...(photo ? { receipt: true } : {}) };
    if (photo) putReceipt(exp.id, photo, ctx.account).catch(() => toast('Fiş buluta yüklenemedi; telefonda saklandı', 'bad'));

    ctx.commit(
      (s) => {
        s.expenses.push(exp);
        if (shouldLearn) learn(r.title, byId(s.categories, cat.id), s.categories);
      },
      { highlight: exp.id, focusDate: date }
    );
    sheet.close();

    const after = before == null ? null : before + r.amount;
    if (cat && cat.limit > 0 && after != null && after > cat.limit && before <= cat.limit) {
      toast(`${cat.name} limiti aşıldı (${moneyShort(after)} / ${moneyShort(cat.limit)})`, 'bad');
    } else {
      toast(`${r.title} → ${cat?.name || 'eklendi'}`);
    }
  });

  const sheet = openSheet({ title: 'Hızlı Ekle', body });
  refresh();
  titleIn.focus();
  return sheet;
}


// =====================================================================
// Harcama düzenle
// =====================================================================

export function openExpenseSheet(ctx, id) {
  const exp = byId(ctx.state.expenses, id);
  if (!exp) return;
  const cats = ctx.categories();
  let catId = exp.categoryId;

  const body = h(`
    <form class="form" autocomplete="off" novalidate>
      <label class="field"><span class="lbl">İsim</span><input name="title" value="${esc(exp.title)}" autocapitalize="words"></label>
      <div class="field-row">
        <label class="field money-field"><span class="prefix">₺</span><input name="amount" inputmode="decimal" value="${esc(amountInput(exp.amount))}"></label>
        <label class="field date-field"><input name="date" type="date" value="${toDateInput(exp.date)}"></label>
      </div>
      <div class="label-row"><span>Kategori</span><span class="badge"></span></div>
      <div class="chips cats">${catChips(cats, catId)}</div>
      <div class="receipt-slot"></div>
      <button class="primary" type="submit">Kaydet</button>
      <button class="danger-btn" type="button">${ICON.trash}<span>Harcamayı sil</span></button>
    </form>`);

  const $ = (s) => body.querySelector(s);
  const receipt = receiptField({
    onPick: async (url) => {
      try {
        await putReceipt(id, url, ctx.account);
        toast('Fiş eklendi');
      } catch {
        toast('Fiş buluta yüklenemedi; telefonda saklandı', 'bad');
      }
      ctx.commit((s) => {
        const t = byId(s.expenses, id);
        if (t) t.receipt = true;
      });
    },
    onRemove: () => {
      deleteReceipt(id, ctx.account);
      ctx.commit((s) => {
        const t = byId(s.expenses, id);
        if (t) delete t.receipt;
      });
      toast('Fiş kaldırıldı');
    },
  });
  $('.receipt-slot').append(receipt.el);
  if (exp.receipt) {
    getReceipt(id, ctx.account).then((url) => url && receipt.set(url));
  }
  $('.cats').addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    catId = chip.dataset.id;
    for (const c of body.querySelectorAll('.cats .chip')) c.classList.toggle('on', c.dataset.id === catId);
    $('.badge').textContent = catId !== exp.categoryId ? 'bu isim hatırlanacak' : '';
    $('.badge').classList.toggle('learn', catId !== exp.categoryId);
  });

  body.addEventListener('submit', (e) => {
    e.preventDefault();
    const title = $('[name=title]').value.trim() || exp.title;
    const amount = parseAmount($('[name=amount]').value);
    if (!(amount > 0)) {
      toast('Tutar anlaşılmadı', 'bad');
      return;
    }
    const date = fromDateInput($('[name=date]').value, exp.date);
    const changedCat = catId !== exp.categoryId;
    ctx.commit(
      (s) => {
        const target = byId(s.expenses, id);
        if (!target) return;
        Object.assign(target, { title, amount, date: date.toISOString(), categoryId: catId });
        if (changedCat) learn(title, byId(s.categories, catId), s.categories);
      },
      { highlight: id, focusDate: date }
    );
    sheet.close();
    toast('Kaydedildi');
  });

  confirmButton($('.danger-btn'), 'Silmek için tekrar dokun', () => {
    if (exp.receipt) deleteReceipt(id, ctx.account);
    ctx.commit((s) => {
      s.expenses = s.expenses.filter((x) => x.id !== id);
    });
    sheet.close();
    toast('Harcama silindi');
  });

  const sheet = openSheet({ title: 'Harcama', body });
  return sheet;
}

// =====================================================================
// Gelir düzenle
// =====================================================================

export function openIncomeSheet(ctx, id) {
  const inc = byId(ctx.state.incomes || [], id);
  if (!inc) return;
  const body = h(`
    <form class="form" autocomplete="off" novalidate>
      <label class="field"><span class="lbl">Açıklama</span><input name="title" value="${esc(inc.title)}" autocapitalize="words"></label>
      <div class="field-row">
        <label class="field money-field"><span class="prefix">₺</span><input name="amount" inputmode="decimal" value="${esc(amountInput(inc.amount))}"></label>
        <label class="field date-field"><input name="date" type="date" value="${toDateInput(inc.date)}"></label>
      </div>
      <p class="hint">Gelirler, tarihinin düştüğü dönemin serbest parasına eklenir.</p>
      <button class="primary" type="submit">Kaydet</button>
      <button class="danger-btn" type="button">${ICON.trash}<span>Geliri sil</span></button>
    </form>`);
  const $ = (s) => body.querySelector(s);
  body.addEventListener('submit', (e) => {
    e.preventDefault();
    const amount = parseAmount($('[name=amount]').value);
    if (!(amount > 0)) {
      toast('Tutar anlaşılmadı', 'bad');
      return;
    }
    const title = $('[name=title]').value.trim() || inc.title;
    const date = fromDateInput($('[name=date]').value, inc.date);
    ctx.commit((s) => Object.assign(byId(s.incomes, id) || {}, { title, amount, date: date.toISOString() }), { focusDate: date });
    sheet.close();
    toast('Kaydedildi');
  });
  confirmButton($('.danger-btn'), 'Silmek için tekrar dokun', () => {
    ctx.commit((s) => (s.incomes = s.incomes.filter((x) => x.id !== id)));
    sheet.close();
    toast('Gelir silindi');
  });
  const sheet = openSheet({ title: 'Gelir', body });
  return sheet;
}

// =====================================================================
// Sabit gider düzenle
// =====================================================================

export function openFixedSheet(ctx, id) {
  const f = byId(ctx.state.fixed, id);
  if (!f) return;
  const body = h(`
    <form class="form" autocomplete="off" novalidate>
      <label class="field"><span class="lbl">Ad</span><input name="title" value="${esc(f.title)}" autocapitalize="words"></label>
      <label class="field money-field"><span class="lbl">Aylık tutar</span><span class="prefix">₺</span><input name="amount" inputmode="decimal" value="${esc(amountInput(f.amount))}"></label>
      <p class="hint">Sabit giderler her dönem maaştan düşülür. Değişiklik geçmiş dönemlere de yansır.</p>
      <button class="primary" type="submit">Kaydet</button>
      <button class="danger-btn" type="button">${ICON.trash}<span>Sabit gideri sil</span></button>
    </form>`);
  const $ = (s) => body.querySelector(s);
  body.addEventListener('submit', (e) => {
    e.preventDefault();
    const amount = parseAmount($('[name=amount]').value);
    if (!(amount > 0)) {
      toast('Tutar anlaşılmadı', 'bad');
      return;
    }
    const title = $('[name=title]').value.trim() || f.title;
    ctx.commit((s) => Object.assign(byId(s.fixed, id) || {}, { title, amount }));
    sheet.close();
    toast('Kaydedildi');
  });
  confirmButton($('.danger-btn'), 'Silmek için tekrar dokun', () => {
    ctx.commit((s) => (s.fixed = s.fixed.filter((x) => x.id !== id)));
    sheet.close();
    toast('Sabit gider silindi');
  });
  const sheet = openSheet({ title: 'Sabit gider', body });
  return sheet;
}

// =====================================================================
// Kategori detayı
// =====================================================================

export function openCategorySheet(ctx, id) {
  const body = h(`<div class="cat-sheet"></div>`);
  let sheet;

  const draw = () => {
    const cat = byId(ctx.state.categories, id);
    if (!cat) {
      sheet?.close();
      return;
    }
    const period = ctx.period();
    const list = ctx.state.expenses.filter((e) => e.categoryId === id && inPeriod(e.date, period)).sort((a, b) => new Date(b.date) - new Date(a.date));
    const total = list.reduce((s, e) => s + e.amount, 0);
    const allSpent = ctx.state.expenses.filter((e) => inPeriod(e.date, period)).reduce((s, e) => s + e.amount, 0);
    const p = cat.limit > 0 ? total / cat.limit : 0;
    const lstate = cat.limit <= 0 ? '' : p > 1 ? 'bad' : p >= 0.8 ? 'warn' : 'good';
    const status = cat.limit <= 0 ? '' : p > 1 ? `Limit ${money(total - cat.limit)} aşıldı` : `Limite ${money(cat.limit - total)} kaldı`;

    body.innerHTML = `
      <div class="cat-hero" style="--c:${cat.color}">
        <span class="cat-hero-icon">${catIcon(cat.icon)}</span>
        <div>
          <div class="cat-hero-total">${esc(money(total))}</div>
          <div class="cat-hero-sub">${esc(periodLabel(period))}${allSpent > 0 ? ` · harcamanın %${Math.round((total / allSpent) * 100)}'i` : ''}</div>
        </div>
      </div>

      ${cat.limit > 0 ? `<div class="meter ${lstate}"><i style="width:${Math.min(100, p * 100).toFixed(1)}%"></i></div>
      <p class="status ${lstate}">${esc(status)}</p>` : ''}
      <label class="field money-field limit-top"><span class="lbl">Aylık limit</span><span class="prefix">₺</span><input name="limit" inputmode="decimal" value="${esc(amountInput(cat.limit))}" placeholder="Limit yok" enterkeyhint="done"></label>

      <button class="secondary add-here" type="button">${ICON.plus}<span>${esc(cat.name)} harcaması ekle</span></button>

      <div class="label-row"><span>Bu dönem · ${list.length} harcama</span></div>
      <div class="list">${list.length ? list.map((e) => expenseRow(e, cat)).join('') : '<p class="empty">Bu dönemde harcama yok.</p>'}</div>

      <details class="edit">
        <summary>Kategoriyi düzenle</summary>
        <div class="form">
          <label class="field"><span class="lbl">Ad</span><input name="name" value="${esc(cat.name)}"></label>
          <div class="icon-grid">${ICON_KEYS.map((k) => `<button type="button" class="icon-pick ${k === cat.icon ? 'on' : ''}" data-icon="${k}" style="--c:${cat.color}" aria-label="Simge ${k}">${catIcon(k)}</button>`).join('')}</div>
          <div class="swatches">${PALETTE.map((c) => `<button type="button" class="swatch ${c === cat.color ? 'on' : ''}" data-color="${c}" style="--c:${c}" aria-label="Renk ${c}"></button>`).join('')}</div>
          <div class="label-row"><span>Anahtar kelimeler</span><span class="hint">otomatik gruplama</span></div>
          <div class="chips kw">${(cat.keywords || []).map((k, i) => `<span class="chip kw-chip">${esc(k)}<button type="button" data-kw="${i}" aria-label="${esc(k)} kaldır">×</button></span>`).join('') || '<span class="hint">Henüz kelime yok</span>'}</div>
          <form class="kw-add"><input name="kw" placeholder="Kelime ekle (örn. kahve)" autocapitalize="none"><button type="submit" class="secondary small">Ekle</button></form>
          ${cat.fallback ? '' : `<button class="danger-btn delete-cat" type="button">${ICON.trash}<span>Kategoriyi sil</span></button>`}
        </div>
      </details>`;

    const $ = (s) => body.querySelector(s);
    $('.add-here').addEventListener('click', () => ctx.open.add({ categoryId: id }));
    $('.list').addEventListener('click', (e) => {
      const row = e.target.closest('[data-exp]');
      if (row) ctx.open.expense(row.dataset.exp);
    });

    const upd = (fn) => ctx.commit((s) => fn(byId(s.categories, id), s));
    $('[name=limit]').addEventListener('change', (e) => {
      upd((c) => (c.limit = parseAmount(e.target.value) || 0));
      toast('Limit kaydedildi');
    });
    $('[name=limit]').addEventListener('keydown', (e) => e.key === 'Enter' && e.target.blur());
    $('.icon-grid').addEventListener('click', (e) => {
      const b = e.target.closest('[data-icon]');
      if (b) upd((c) => (c.icon = b.dataset.icon));
    });
    $('[name=name]').addEventListener('change', (e) => upd((c) => (c.name = e.target.value.trim() || c.name)));
    $('.swatches').addEventListener('click', (e) => {
      const b = e.target.closest('.swatch');
      if (b) upd((c) => (c.color = b.dataset.color));
    });
    $('.kw').addEventListener('click', (e) => {
      const b = e.target.closest('[data-kw]');
      if (b) upd((c) => c.keywords.splice(Number(b.dataset.kw), 1));
    });
    $('.kw-add').addEventListener('submit', (e) => {
      e.preventDefault();
      const v = e.target.kw.value.trim();
      if (v) upd((c) => !c.keywords.some((k) => normalize(k) === normalize(v)) && c.keywords.push(v));
    });
    const del = $('.delete-cat');
    if (del) {
      confirmButton(del, 'Harcamalar “Diğer”e taşınacak — emin misin?', () => {
        ctx.commit((s) => {
          const fb = s.categories.find((c) => c.fallback);
          for (const e of s.expenses) if (e.categoryId === id) e.categoryId = fb.id;
          s.categories = s.categories.filter((c) => c.id !== id);
        });
        sheet.close();
        toast('Kategori silindi');
      });
    }
  };

  const openEdit = () => body.querySelector('details.edit')?.open;
  const unsubscribe = ctx.subscribe(() => {
    const wasOpen = openEdit();
    const focused = document.activeElement?.name;
    draw();
    if (wasOpen) body.querySelector('details.edit').open = true;
    if (focused === 'kw') body.querySelector('[name=kw]')?.focus();
  });
  draw();
  const cat = byId(ctx.state.categories, id);
  sheet = openSheet({ title: cat ? cat.name : 'Kategori', body, onClose: unsubscribe });
  return sheet;
}

// =====================================================================
// Dönem listesi
// =====================================================================

export function openListSheet(ctx) {
  const body = h(`
    <div>
      <label class="field search">${ICON.search}<input type="search" placeholder="Ara" autocapitalize="none"></label>
      <div class="summary"></div>
      <button class="secondary wide add-income" type="button">${ICON.plus}<span>Gelir ekle</span></button>
      <div class="list grouped"></div>
    </div>`);
  const input = body.querySelector('input');
  const listEl = body.querySelector('.list');

  const draw = () => {
    const period = ctx.period();
    const cats = ctx.state.categories;
    const q = normalize(input.value);
    const exps = ctx.state.expenses
      .filter((e) => inPeriod(e.date, period))
      .filter((e) => !q || normalize(e.title).includes(q) || normalize(byId(cats, e.categoryId)?.name).includes(q))
      .map((e) => ({ ...e, kind: 'exp' }));
    const incs = (ctx.state.incomes || [])
      .filter((i) => inPeriod(i.date, period))
      .filter((i) => !q || normalize(i.title).includes(q) || 'gelir'.includes(q))
      .map((i) => ({ ...i, kind: 'inc' }));
    const items = [...exps, ...incs].sort((a, b) => new Date(b.date) - new Date(a.date));
    const total = exps.reduce((s, e) => s + e.amount, 0);
    const incTotal = incs.reduce((s, i) => s + i.amount, 0);
    body.querySelector('.summary').innerHTML = `<span>${periodLabel(period)}</span><b>${esc(money(total))}</b><span>${exps.length} harcama${incs.length ? ` · <em class="plus">+${esc(money(incTotal))} gelir</em>` : ''}</span>`;

    if (!items.length) {
      listEl.innerHTML = `<p class="empty">${q ? 'Sonuç yok.' : 'Bu dönemde hareket yok.'}</p>`;
      return;
    }
    const groups = new Map();
    for (const e of items) {
      const k = toDateInput(e.date);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(e);
    }
    listEl.innerHTML = [...groups.values()]
      .map(
        (g) => `<div class="day"><div class="day-head"><span>${esc(dayLabel(g[0].date))}</span><span>${esc(money(g.filter((x) => x.kind === 'exp').reduce((s, e) => s + e.amount, 0)))}</span></div>
        ${g.map((e) => (e.kind === 'inc' ? incomeRow(e) : expenseRow(e, byId(cats, e.categoryId)))).join('')}</div>`
      )
      .join('');
  };

  input.addEventListener('input', draw);
  listEl.addEventListener('click', (e) => {
    const row = e.target.closest('[data-exp]');
    if (row) ctx.open.expense(row.dataset.exp);
    const inc = e.target.closest('[data-inc]');
    if (inc) ctx.open.income(inc.dataset.inc);
  });
  body.querySelector('.add-income').addEventListener('click', () => ctx.open.add({ mode: 'income' }));
  const unsubscribe = ctx.subscribe(draw);
  draw();
  return openSheet({ title: 'Hareketler', body, onClose: unsubscribe, className: 'tall' });
}

// =====================================================================
// Bütçe (merkez daire): gelir, sabit gider, kalan
// =====================================================================

export function openBudgetSheet(ctx) {
  const body = h(`
    <div class="budget">
      <div class="budget-hero"></div>
      <section class="group">
        <h3>Gelir</h3>
        <label class="field money-field"><span class="lbl salary-lbl">Aylık net maaş</span><span class="prefix">₺</span>
          <input name="salary" inputmode="decimal" placeholder="0" enterkeyhint="done"></label>
        <div class="salary-history"></div>
        <div class="list incomes"></div>
        <button class="secondary wide add-inc" type="button">${ICON.plus}<span>Ek gelir ekle</span></button>
      </section>
      <section class="group">
        <h3>Sabit giderler <span class="hint">her dönem düşülür</span></h3>
        <div class="fixed"></div>
      </section>
      <p class="hint center">İpucu: ortadaki daireye basılı tutarak baloncukları gizleyip gösterebilirsin.</p>
    </div>`);
  const $ = (s) => body.querySelector(s);
  const salaryIn = $('[name=salary]');

  const draw = () => {
    const m = ctx.model();
    const c = m.core;
    const p = ctx.period();
    const incs = (ctx.state.incomes || []).filter((i) => inPeriod(i.date, p)).sort((a, b) => new Date(b.date) - new Date(a.date));
    $('.budget-hero').innerHTML = `
      <div class="bh-label">${c.remaining < 0 ? 'Bütçe aşıldı' : 'Kalan'} · ${esc(periodLabel(p))}</div>
      <div class="bh-amount ${c.remaining < 0 ? 'neg' : ''}">${esc(money(Math.abs(c.remaining)))}</div>
      <div class="bh-lines">
        <span>Maaş</span><b>${esc(money(c.salary))}</b>
        ${c.incomeTotal ? `<span>Ek gelir</span><b class="plus">+${esc(money(c.incomeTotal))}</b>` : ''}
        <span>Sabit giderler</span><b>${c.fixedTotal ? '−' : ''}${esc(money(c.fixedTotal))}</b>
        <span>Harcamalar</span><b>${c.spent ? '−' : ''}${esc(money(c.spent))}</b>
      </div>`;
    if (document.activeElement !== salaryIn) salaryIn.value = amountInput(c.salary);
    const hist = ctx.state.settings.salaryHistory || [];
    const changed = hist.filter((x) => x.amount > 0).length > 1 || hist.some((x) => x.from !== '0000-00');
    $('.salary-lbl').textContent = changed ? `Aylık net maaş · ${periodName(p)} dönemi` : 'Aylık net maaş';
    $('.salary-history').innerHTML = changed
      ? `<div class="hist">${hist
          .map(
            (x) => `<div class="hist-row ${x.from <= p.key && !hist.some((y) => y.from > x.from && y.from <= p.key) ? 'on' : ''}">
              <span>${x.from === '0000-00' ? 'İlk maaş' : `${esc(monthLabel(x.from))} itibarıyla`}</span><b>${esc(money(x.amount))}</b>
              ${x.from === '0000-00' ? '' : `<button type="button" class="icon-btn small" data-hist="${x.from}" aria-label="Bu değişikliği sil">${ICON.close}</button>`}
            </div>`
          )
          .join('')}</div>`
      : '<p class="hint">Maaşın değişirse (zam gibi) buraya yeni tutarı yaz; değişiklik bu dönemden itibaren geçerli olur, eski dönemler etkilenmez.</p>';
    $('.incomes').innerHTML = incs.length ? incs.map(incomeRow).join('') : '<p class="empty small">Bu dönemde ek gelir yok (ikramiye, ek ders, iade…).</p>';
  };

  salaryIn.addEventListener('change', () => {
    const v = parseAmount(salaryIn.value) || 0;
    const p = ctx.period();
    const hadSalary = (ctx.state.settings.salaryHistory || []).some((x) => x.amount > 0);
    if (v === salaryFor(ctx.state, p.key)) return;
    ctx.commit((s) => setSalary(s, p.key, v));
    toast(hadSalary ? `Maaş ${periodName(p)} döneminden itibaren ${money(v)}` : 'Maaş kaydedildi');
  });
  salaryIn.addEventListener('keydown', (e) => e.key === 'Enter' && salaryIn.blur());
  $('.incomes').addEventListener('click', (e) => {
    const r = e.target.closest('[data-inc]');
    if (r) ctx.open.income(r.dataset.inc);
  });
  $('.add-inc').addEventListener('click', () => ctx.open.add({ mode: 'income' }));
  $('.salary-history').addEventListener('click', (e) => {
    const b = e.target.closest('[data-hist]');
    if (b) ctx.commit((s) => removeSalaryChange(s, b.dataset.hist));
  });
  const drawFixed = fixedEditor(ctx, $('.fixed'));

  const unsubscribe = ctx.subscribe(() => {
    draw();
    drawFixed();
  });
  draw();
  return openSheet({ title: 'Bütçe', body, onClose: unsubscribe, className: 'tall' });
}

// =====================================================================
// Dönem özeti
// =====================================================================

function periodStats(ctx, p) {
  const st = ctx.state;
  const exps = st.expenses.filter((e) => inPeriod(e.date, p));
  const incs = (st.incomes || []).filter((i) => inPeriod(i.date, p));
  const salary = salaryFor(st, p.key);
  const extra = incs.reduce((s, i) => s + i.amount, 0);
  const fixed = st.fixed.reduce((s, f) => s + f.amount, 0);
  const spent = exps.reduce((s, e) => s + e.amount, 0);
  return { exps, incs, salary, extra, fixed, spent, income: salary + extra, out: fixed + spent, left: salary + extra - fixed - spent };
}

export function openSummarySheet(ctx) {
  const body = h(`<div class="summary-sheet"></div>`);

  const draw = () => {
    const p = ctx.period();
    const now = periodStats(ctx, p);
    const prev = periodStats(ctx, shiftPeriod(p, -1, ctx.state.settings.payday));
    const current = isCurrent(p);
    const days = current ? Math.max(1, daysElapsed(p) + 1) : totalDays(p);
    const cats = ctx
      .categories()
      .map((c) => ({ c, total: now.exps.filter((e) => e.categoryId === c.id).reduce((s, e) => s + e.amount, 0), n: now.exps.filter((e) => e.categoryId === c.id).length }))
      .filter((x) => x.total > 0)
      .sort((a, b) => b.total - a.total);
    const top = [...now.exps].sort((a, b) => b.amount - a.amount).slice(0, 5);
    const diff = now.spent - prev.spent;

    const line = (label, value, cls = '') => `<div class="sum-line ${cls}"><span>${label}</span><b>${value}</b></div>`;
    const compare = prev.spent > 0
      ? diff === 0
        ? 'Geçen dönemle aynı harcadın.'
        : `Geçen döneme göre <b>${esc(money(Math.abs(diff)))} ${diff < 0 ? 'daha az' : 'daha fazla'}</b> harcadın${current ? ' (şu ana kadar)' : ''}.`
      : '';

    body.innerHTML = `
      <p class="sum-period">${esc(periodLabel(p))} · ${current ? 'devam ediyor' : 'kapandı'}</p>

      <section class="sum-card">
        ${line('Maaş', esc(money(now.salary)))}
        ${now.extra ? line(`Ek gelir (${now.incs.length})`, `+${esc(money(now.extra))}`, 'plus') : ''}
        ${line('Toplam gelir', esc(money(now.income)), 'total')}
        ${line('Sabit giderler', esc(money(now.fixed)))}
        ${line(`Harcamalar (${now.exps.length})`, esc(money(now.spent)))}
        ${line('Toplam gider', esc(money(now.out)), 'total')}
        ${line(current ? 'Şu an kalan' : now.left >= 0 ? 'Dönem sonunda artan' : 'Dönem sonunda açık', esc(money(Math.abs(now.left))), `result ${now.left < 0 ? 'neg' : 'pos'}`)}
      </section>

      <section class="sum-facts">
        <p>Günde ortalama <b>${esc(money(Math.round(now.spent / days)))}</b> harcadın${current ? ` (${days} gün)` : ''}.</p>
        ${compare ? `<p>${compare}</p>` : ''}
        ${cats[0] ? `<p>En çok <b>${esc(cats[0].c.name)}</b> kategorisine gitti (${esc(money(cats[0].total))}).</p>` : ''}
      </section>

      ${cats.length ? `<div class="label-row"><span>Kategorilere göre</span></div>
      <div class="list">${cats
        .map(
          (x) => `<button type="button" class="row" data-cat="${x.c.id}">
            <span class="row-icon" style="--c:${x.c.color}">${catIcon(x.c.icon)}</span>
            <span class="row-main"><b>${esc(x.c.name)}</b><small>${x.n} harcama · %${Math.round((x.total / now.spent) * 100)}</small></span>
            <span class="row-amt">${esc(money(x.total))}</span>
          </button>`
        )
        .join('')}</div>` : '<p class="empty">Bu dönemde harcama yok.</p>'}

      ${top.length ? `<div class="label-row"><span>En büyük harcamalar</span></div>
      <div class="list">${top.map((e) => expenseRow(e, byId(ctx.state.categories, e.categoryId))).join('')}</div>` : ''}`;
  };

  body.addEventListener('click', (e) => {
    const c = e.target.closest('[data-cat]');
    if (c) ctx.open.category(c.dataset.cat);
    const x = e.target.closest('[data-exp]');
    if (x) ctx.open.expense(x.dataset.exp);
  });
  const unsubscribe = ctx.subscribe(draw);
  draw();
  return openSheet({ title: 'Dönem özeti', body, onClose: unsubscribe, className: 'tall' });
}

// =====================================================================
// Ayarlar
// =====================================================================

function fixedEditor(ctx, container) {
  const draw = () => {
    const fixed = ctx.state.fixed;
    const total = fixed.reduce((s, f) => s + f.amount, 0);
    container.innerHTML = `
      <div class="list compact">
        ${fixed.map(fixedRow).join('') || '<p class="empty small">Kira, fatura, kredi taksiti gibi her ay ödediğin şeyler.</p>'}
      </div>
      <form class="inline-add">
        <input name="title" placeholder="Kira 12000" autocapitalize="words">
        <button class="secondary small" type="submit">Ekle</button>
      </form>
      ${fixed.length ? `<p class="hint right">Toplam sabit: <b>${esc(money(total))}</b></p>` : ''}`;
  };
  container.addEventListener('click', (e) => {
    const b = e.target.closest('[data-fixed]');
    if (b) openFixedSheet(ctx, b.dataset.fixed);
  });
  container.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = parseQuick(e.target.title.value);
    if (!q.title || !(q.amount > 0)) {
      toast('Örnek: “Kira 12000”', 'bad');
      return;
    }
    ctx.commit((s) => s.fixed.push({ id: uid(), title: q.title, amount: q.amount }));
    container.querySelector('[name=title]')?.focus();
  });
  draw();
  return draw;
}

export function openSettingsSheet(ctx) {
  const s0 = ctx.state.settings;
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const body = h(`
    <div class="settings">
      ${ctx.account ? `<section class="group account">
        <h3>Hesap</h3>
        <div class="acct">
          <span class="acct-avatar">${esc(ctx.account.name.charAt(0).toLocaleUpperCase('tr-TR'))}</span>
          <span class="row-main"><b>${esc(ctx.account.name)}</b><small class="sync"></small></span>
        </div>
        <button class="secondary wide signout" type="button">Çıkış yap</button>
      </section>` : ''}
      <section class="group">
        <h3>Maaş</h3>
        <div class="field-row">
          <button type="button" class="field salary-btn"><span class="lbl">Aylık net maaş</span><b class="salary-val"></b></button>
          <label class="field day-field"><span class="lbl">Maaş günü</span>
            <select name="payday">${Array.from({ length: 28 }, (_, i) => `<option value="${i + 1}" ${i + 1 === s0.payday ? 'selected' : ''}>${i + 1}</option>`).join('')}</select></label>
        </div>
        <div class="free-box"></div>
      </section>

      <section class="group">
        <h3>Sabit giderler <span class="hint">her dönem maaştan düşülür</span></h3>
        <div class="fixed"></div>
      </section>

      <section class="group look">
        <h3>Görünüm</h3>
        <div class="opt-row"><span>Tema</span>
          <div class="seg three" data-opt="theme">
            <button type="button" data-v="auto">Otomatik</button><button type="button" data-v="light">Açık</button><button type="button" data-v="dark">Koyu</button>
          </div></div>
        <div class="opt-row"><span>Yazı boyutu</span>
          <div class="seg" data-opt="fontScale">
            <button type="button" data-v="1">Normal</button><button type="button" data-v="1.15">Büyük</button>
          </div></div>
      </section>

      <section class="group">
        <h3>Kategoriler ve aylık limitler <span class="hint">her maaş gününde sıfırlanır</span></h3>
        <div class="list cats-list"></div>
        <form class="inline-add new-cat">
          <input name="name" placeholder="Yeni kategori (örn. Evcil hayvan)">
          <button class="secondary small" type="submit">Ekle</button>
        </form>
      </section>

      <section class="group">
        <h3>Banka hareketleri</h3>
        <button class="secondary wide import" type="button">Hesap özeti yapıştır</button>
        <p class="hint">Banka uygulamasından hareketleri kopyala, buraya yapıştır; satırları otomatik ayırıp kategorilere dağıtırım.</p>
      </section>

      <section class="group">
        <h3>Yedek</h3>
        <div class="btn-row">
          <button class="secondary export" type="button">Yedeği kaydet</button>
          <label class="secondary file-btn">Yedekten yükle<input type="file" accept="application/json,.json" hidden></label>
        </div>
        <p class="hint">${ctx.account ? 'Veriler hesabında saklanıyor; yedek yine de iyi bir güvencedir.' : 'Veriler sadece bu telefonda saklanır. Ayda bir yedek almanı öneririm.'}</p>
        <button class="danger-btn reset" type="button">${ICON.trash}<span>${ctx.account ? 'Tüm verileri sil (buluttakiler dahil)' : 'Tüm verileri sil'}</span></button>
      </section>

      ${standalone ? '' : `<section class="group tip">
        <h3>Ana ekrana ekle</h3>
        <p>Safari'de <b>Paylaş</b> → <b>Ana Ekrana Ekle</b>'ye dokun. Uygulama gibi tam ekran açılır ve verilerin kalıcı olur.</p>
      </section>`}
    </div>`);

  const $ = (s) => body.querySelector(s);

  const drawFree = () => {
    const st = ctx.state;
    const fixed = st.fixed.reduce((s, f) => s + f.amount, 0);
    const p = ctx.period();
    const salary = salaryFor(st, p.key);
    $('.salary-val').textContent = salary ? money(salary) : 'Gir ›';
    const extra = (st.incomes || []).filter((i) => inPeriod(i.date, p)).reduce((s, i) => s + i.amount, 0);
    $('.free-box').innerHTML = salary
      ? `<span>Maaş ${esc(money(salary))}</span>${extra ? `<span>+ Ek gelir ${esc(money(extra))}</span>` : ''}<span>− Sabit ${esc(money(fixed))}</span><b>= Serbest ${esc(money(salary + extra - fixed))}</b>`
      : '<span class="hint">Maaşını girince “kalan para” ve “günlük harcayabileceğin” hesaplanır.</span>';
  };

  const spentIn = (catId) => {
    const p = ctx.period();
    return ctx.state.expenses.filter((e) => e.categoryId === catId && inPeriod(e.date, p)).reduce((s, e) => s + e.amount, 0);
  };
  const drawCats = () => {
    const cats = ctx.categories();
    $('.cats-list').innerHTML = cats
      .map(
        (c) => {
          const spent = spentIn(c.id);
          const over = c.limit > 0 && spent > c.limit;
          return `<div class="row cat-row">
          <button type="button" class="cat-open" data-cat="${c.id}">
            <span class="row-icon" style="--c:${c.color}">${catIcon(c.icon)}</span>
            <span class="row-main"><b>${esc(c.name)}</b><small class="${over ? 'over' : ''}">bu dönem ${esc(money(spent))}</small></span>
          </button>
          <label class="limit-input"><input data-limit="${c.id}" inputmode="decimal" value="${esc(amountInput(c.limit))}" placeholder="limit yok" aria-label="${esc(c.name)} aylık limiti" enterkeyhint="done"><span>₺</span></label>
        </div>`;
        }
      )
      .join('');
  };

  $('.salary-btn').addEventListener('click', () => ctx.open.budget());
  const drawLook = () => {
    const st = ctx.state.settings;
    for (const seg of body.querySelectorAll('.look .seg')) {
      const cur = String(seg.dataset.opt === 'theme' ? st.theme || 'auto' : Number(st.fontScale) || 1);
      for (const b of seg.querySelectorAll('button')) b.classList.toggle('on', b.dataset.v === cur);
    }
  };
  $('.look').addEventListener('click', (e) => {
    const b = e.target.closest('[data-v]');
    if (!b) return;
    const opt = b.closest('[data-opt]').dataset.opt;
    ctx.commit((s) => (s.settings[opt] = opt === 'fontScale' ? Number(b.dataset.v) : b.dataset.v));
  });
  drawLook();
  $('.cats-list').addEventListener('change', (e) => {
    const cid = e.target.dataset.limit;
    if (!cid) return;
    const v = e.target.value.trim();
    const limit = v ? parseAmount(v) : 0;
    if (v && limit == null) {
      toast('Tutar anlaşılmadı', 'bad');
      return;
    }
    ctx.commit((s) => (byId(s.categories, cid).limit = limit || 0));
    toast(limit ? 'Limit kaydedildi' : 'Limit kaldırıldı');
  });
  $('.cats-list').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.dataset.limit) e.target.blur();
  });
  $('[name=payday]').addEventListener('change', (e) =>
    ctx.commit((s) => {
      s.settings.payday = Number(e.target.value) || 15;
      ctx.refreshPeriod();
    })
  );
  const drawFixed = fixedEditor(ctx, $('.fixed'));

  $('.cats-list').addEventListener('click', (e) => {
    const row = e.target.closest('[data-cat]');
    if (row) ctx.open.category(row.dataset.cat);
  });
  $('.new-cat').addEventListener('submit', (e) => {
    e.preventDefault();
    let v = e.target.name.value.trim();
    if (!v) return;
    const icon = 'tag';
    const name = v.replace(/\p{Extended_Pictographic}|\uFE0F|\u200D/gu, '').trim() || 'Kategori';
    if (ctx.state.categories.some((c) => normalize(c.name) === normalize(name))) {
      toast('Bu isimde bir kategori var', 'bad');
      return;
    }
    const used = new Set(ctx.state.categories.map((c) => c.color));
    const color = PALETTE.find((c) => !used.has(c)) || PALETTE[ctx.state.categories.length % PALETTE.length];
    const id = uid();
    ctx.commit((s) => {
      const fb = s.categories.find((c) => c.fallback);
      const order = fb ? fb.order : s.categories.length;
      if (fb) fb.order = order + 1;
      s.categories.push({ id, name, icon, color, limit: 0, keywords: [normalize(name)], order, fallback: false });
    });
    e.target.reset();
    ctx.open.category(id);
  });

  $('.import').addEventListener('click', () => openImportSheet(ctx));

  $('.export').addEventListener('click', async () => {
    const text = exportJSON(ctx.state);
    const name = `harcama-agaci-yedek-${toDateInput(new Date())}.json`;
    const file = new File([text], name, { type: 'application/json' });
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Harcama Ağacı yedeği' });
        return;
      }
    } catch (err) {
      if (err?.name === 'AbortError') return;
    }
    const url = URL.createObjectURL(file);
    const a = Object.assign(document.createElement('a'), { href: url, download: name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  });

  $('.file-btn input').addEventListener('change', async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const next = importJSON(await f.text());
      ctx.replace(next);
      toast(`Yedek yüklendi · ${next.expenses.length} harcama`);
      sheet.close();
    } catch (err) {
      toast(err.message || 'Dosya okunamadı', 'bad');
    }
    e.target.value = '';
  });

  confirmButton($('.reset'), 'Her şey silinecek — emin misin?', () => {
    ctx.replace(freshState());
    sheet.close();
    toast('Tüm veriler silindi');
    setTimeout(() => openOnboarding(ctx), 400);
  });

  const SYNC = { saved: 'Bulutta kayıtlı', saving: 'Kaydediliyor…', offline: 'Çevrimdışı · bağlanınca eşitlenecek', error: 'Eşitleme hatası — tekrar denenecek', idle: 'Bulut hesabı' };
  const drawSync = () => {
    const el = $('.sync');
    if (!el) return;
    el.textContent = SYNC[ctx.syncState] || SYNC.idle;
    el.dataset.state = ctx.syncState;
  };
  $('.signout')?.addEventListener('click', async (e) => {
    e.currentTarget.disabled = true;
    e.currentTarget.textContent = 'Çıkış yapılıyor…';
    sheet.close();
    try {
      await ctx.signOut();
    } catch (err) {
      toast('Çıkış yapılamadı', 'bad');
    }
  });

  const unsubscribe = ctx.subscribe(() => {
    drawFree();
    drawFixed();
    drawCats();
    drawSync();
    drawLook();
  });
  drawFree();
  drawCats();
  drawSync();
  const sheet = openSheet({ title: 'Ayarlar', body, onClose: unsubscribe, className: 'tall' });
  return sheet;
}

// =====================================================================
// Hesap özeti içe aktar
// =====================================================================

export function openImportSheet(ctx) {
  const cats = ctx.categories();
  let rows = [];

  const body = h(`
    <div class="form">
      <label class="field area"><textarea rows="6" placeholder="Banka uygulamasından hesap hareketlerini kopyalayıp buraya yapıştır.&#10;&#10;Örn:&#10;14.11.2026 STARBUCKS KADIKOY 165,00 TL&#10;13.11.2026 MIGROS 1.480,50 TL"></textarea></label>
      <button class="secondary wide parse" type="button">Satırları çözümle</button>
      <div class="preview"></div>
    </div>`);
  const $ = (s) => body.querySelector(s);

  const exists = (r) =>
    (r.income ? ctx.state.incomes || [] : ctx.state.expenses).some((e) => Math.abs(e.amount - r.amount) < 0.01 && toDateInput(e.date) === toDateInput(r.date) && normalize(e.title) === normalize(r.title));

  const drawPreview = () => {
    if (!rows.length) {
      $('.preview').innerHTML = '<p class="empty">Tutar içeren satır bulunamadı.</p>';
      return;
    }
    const on = rows.filter((r) => r.on);
    const nExp = on.filter((r) => !r.income).length;
    const nInc = on.length - nExp;
    const n = on.length;
    const label = [nExp ? `${nExp} harcama` : '', nInc ? `${nInc} gelir` : ''].filter(Boolean).join(' + ');
    $('.preview').innerHTML = `
      <div class="label-row"><span>${rows.length} satır bulundu</span><span class="hint">işaretlileri ekle</span></div>
      <div class="list import-list">
        ${rows
          .map(
            (r, i) => `<div class="row import-row ${r.on ? '' : 'off'}">
              <input type="checkbox" data-i="${i}" ${r.on ? 'checked' : ''} aria-label="${esc(r.title)} ekle">
              <span class="row-main"><b>${esc(r.title)}</b>
                <small>${esc(shortDate(r.date))}${r.income ? ' · gelir olarak eklenir' : ''}${r.dup ? ' · zaten ekli' : ''}</small></span>
              <span class="row-side">
                <span class="row-amt">${esc(money(r.amount))}</span>
                ${r.income ? '<span class="tag-income">gelir</span>' : `<select data-cat="${i}" aria-label="Kategori">${cats.map((c) => `<option value="${c.id}" ${c.id === r.categoryId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>`}
              </span>
            </div>`
          )
          .join('')}
      </div>
      <button class="primary go" type="button" ${n ? '' : 'disabled'}>${n ? `${label} ekle` : 'Seçili satır yok'}</button>`;
  };

  $('.parse').addEventListener('click', () => {
    rows = parseStatement($('textarea').value).map((r) => {
      const dup = exists(r);
      return { ...r, dup, on: !r.income && !dup, categoryId: categorize(r.title, cats)?.id };
    });
    drawPreview();
  });

  $('.preview').addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.i != null) rows[t.dataset.i].on = t.checked;
    if (t.dataset.cat != null) rows[t.dataset.cat].categoryId = t.value;
    drawPreview();
  });

  $('.preview').addEventListener('click', (e) => {
    if (!e.target.closest('.go')) return;
    const chosen = rows.filter((r) => r.on);
    if (!chosen.length) return;
    let lastDate = null;
    ctx.commit(
      (s) => {
        for (const r of chosen) {
          if (r.income) {
            (s.incomes = s.incomes || []).push({ id: uid(), title: r.title, amount: r.amount, date: new Date(r.date).toISOString() });
            continue;
          }
          const suggested = categorize(r.title, s.categories);
          if (suggested?.id !== r.categoryId) learn(r.title, byId(s.categories, r.categoryId), s.categories);
          s.expenses.push({ id: uid(), title: r.title, amount: r.amount, date: new Date(r.date).toISOString(), categoryId: r.categoryId });
        }
        for (const r of chosen) if (!lastDate || r.date > lastDate) lastDate = r.date;
      },
      { focusDate: lastDate }
    );
    toast(`${chosen.length} hareket eklendi`);
    sheet.close();
  });

  const sheet = openSheet({ title: 'Hesap Özeti İçe Aktar', body, className: 'tall' });
  return sheet;
}

// =====================================================================
// İlk kurulum
// =====================================================================

export function openOnboarding(ctx) {
  const body = h(`
    <div class="onboard">
      <div class="onboard-art" aria-hidden="true"><span></span><span></span><span></span><span></span></div>
      <p class="lead">Maaşından ne kadar kaldığını ve günde ne kadar harcayabileceğini baloncuklarla gör.</p>
      <div class="form">
        <div class="field-row">
          <label class="field money-field"><span class="lbl">Aylık net maaşın</span><span class="prefix">₺</span><input name="salary" inputmode="decimal" placeholder="Örn. 45000"></label>
          <label class="field day-field"><span class="lbl">Maaş günü</span>
            <select name="payday">${Array.from({ length: 28 }, (_, i) => `<option value="${i + 1}" ${i + 1 === 15 ? 'selected' : ''}>${i + 1}</option>`).join('')}</select></label>
        </div>
        <div class="label-row"><span>Sabit giderlerin <span class="hint">(isteğe bağlı)</span></span></div>
        <div class="fixed"></div>
        <button class="primary start" type="button">Başla</button>
        <button class="link skip" type="button">Şimdilik atla</button>
      </div>
    </div>`);
  const $ = (s) => body.querySelector(s);
  const drawFixed = fixedEditor(ctx, $('.fixed'));
  const unsubscribe = ctx.subscribe(drawFixed);

  const finish = (withValues) => {
    ctx.commit((s) => {
      if (withValues) {
        const v = parseAmount($('[name=salary]').value);
        if (v) setSalary(s, ctx.period().key, v);
        s.settings.payday = Number($('[name=payday]').value) || 15;
      }
      s.settings.onboarded = true;
      ctx.refreshPeriod();
    });
    sheet.close();
  };
  $('.start').addEventListener('click', () => finish(true));
  $('.skip').addEventListener('click', () => finish(false));

  const sheet = openSheet({
    title: 'Hoş geldin',
    body,
    onClose: () => {
      unsubscribe();
      if (!ctx.state.settings.onboarded) ctx.commit((s) => (s.settings.onboarded = true));
    },
  });
  return sheet;
}
