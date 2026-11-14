// Küçük arayüz yardımcıları: HTML kaçışı, alt sayfa (bottom sheet), bildirim.

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

export function h(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export const ICON = {
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>',
  trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg>',
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  chevron: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18l6-6-6-6"/></svg>',
  camera: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 8a2 2 0 0 1 2-2h2l2-2.5h6L17 6h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><circle cx="12" cy="13" r="3.5"/></svg>',
  search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
};

// iOS klavyesi açılınca alt sayfayı klavyenin üstüne taşı.
export function trackKeyboard() {
  const vv = window.visualViewport;
  if (!vv) return;
  const update = () => {
    const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    document.documentElement.style.setProperty('--kb', `${kb > 60 ? kb : 0}px`);
  };
  vv.addEventListener('resize', update);
  vv.addEventListener('scroll', update);
  update();
}

let sheetDepth = 0;

/**
 * Alt sayfa açar. body: Element. Döndürür: { close, el, body }.
 * Aşağı çekerek, arka plana dokunarak veya Esc ile kapanır.
 */
export function openSheet({ title, body, onClose, className = '' }) {
  const root = document.getElementById('sheet-root');
  const wrap = h(`
    <div class="sheet-wrap">
      <div class="backdrop"></div>
      <section class="sheet ${className}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
        <div class="sheet-grip"><span></span></div>
        <header class="sheet-head">
          <h2>${esc(title)}</h2>
          <button class="icon-btn small close" type="button" aria-label="Kapat">${ICON.close}</button>
        </header>
        <div class="sheet-body"></div>
      </section>
    </div>`);
  const sheet = wrap.querySelector('.sheet');
  const bodyEl = wrap.querySelector('.sheet-body');
  bodyEl.append(body);
  wrap.style.zIndex = String(50 + sheetDepth++);
  root.append(wrap);
  // Bir kare bekle ki geçiş animasyonu çalışsın
  requestAnimationFrame(() => requestAnimationFrame(() => wrap.classList.add('open')));

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    sheetDepth = Math.max(0, sheetDepth - 1);
    if (document.activeElement && wrap.contains(document.activeElement)) document.activeElement.blur();
    wrap.classList.remove('open');
    sheet.style.transform = '';
    setTimeout(() => wrap.remove(), 380);
    document.removeEventListener('keydown', onKey);
    onClose?.();
  };
  const onKey = (e) => {
    if (e.key === 'Escape' && wrap === root.lastElementChild) close();
  };
  document.addEventListener('keydown', onKey);
  wrap.querySelector('.backdrop').addEventListener('click', close);
  wrap.querySelector('.close').addEventListener('click', close);

  // Aşağı çekip kapatma
  let drag = null;
  const head = [wrap.querySelector('.sheet-grip'), wrap.querySelector('.sheet-head')];
  for (const el of head) {
    el.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return;
      drag = { y0: e.clientY, dy: 0, t0: performance.now(), id: e.pointerId };
      el.setPointerCapture(e.pointerId);
      sheet.classList.add('dragging');
    });
    el.addEventListener('pointermove', (e) => {
      if (!drag || drag.id !== e.pointerId) return;
      drag.dy = Math.max(0, e.clientY - drag.y0);
      sheet.style.transform = `translateY(${drag.dy}px)`;
    });
    const up = () => {
      if (!drag) return;
      const v = drag.dy / Math.max(1, performance.now() - drag.t0);
      sheet.classList.remove('dragging');
      if (drag.dy > 110 || v > 0.6) close();
      else sheet.style.transform = '';
      drag = null;
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  }

  return { close, el: wrap, body: bodyEl };
}

let toastTimer = 0;
export function toast(msg, kind = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.className = `toast ${kind}`), 2600);
}

/** İki aşamalı onay: ilk dokunuşta "Emin misin?" der. */
export function confirmButton(btn, label, action) {
  let armed = false;
  let timer = 0;
  const original = btn.innerHTML;
  btn.addEventListener('click', () => {
    if (!armed) {
      armed = true;
      btn.classList.add('armed');
      btn.textContent = label;
      timer = setTimeout(() => {
        armed = false;
        btn.classList.remove('armed');
        btn.innerHTML = original;
      }, 3000);
      return;
    }
    clearTimeout(timer);
    action();
  });
}
