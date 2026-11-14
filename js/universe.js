// Merkezden dağılan baloncuk evreni.
// Merkez = maaştan kalan para, Yörünge 1 = kategoriler, Yörünge 2 = tekil harcamalar.
// Her baloncuk yaylarla yerine çekilir, birbirine çarpar; sürükleyince lastik gibi esner.

import { moneyShort, moneyInt } from './format.js';
import { esc } from './ui.js';
import { catIcon } from './icons.js';

const TAU = Math.PI * 2;
const MAX_CHILDREN = 8;
const SVG_NS = 'http://www.w3.org/2000/svg';
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rubber = (x, d) => Math.sign(x) * d * (1 - 1 / ((Math.abs(x) * 0.55) / d + 1));

function ring(p, cls = '') {
  const v = clamp(p, 0, 1) * 100;
  return `<svg class="ring ${cls}" viewBox="0 0 100 100" aria-hidden="true">
    <circle class="track" cx="50" cy="50" r="45"/>
    ${v > 0.5 ? `<circle class="prog" cx="50" cy="50" r="45" pathLength="100" stroke-dasharray="${v.toFixed(1)} 100"/>` : ''}
  </svg>`;
}

export class Universe {
  constructor(stage, handlers) {
    this.stage = stage;
    this.handlers = handlers;
    this.viewport = stage.querySelector('.viewport');
    this.world = stage.querySelector('.world');
    this.svg = stage.querySelector('.tethers');
    this.nodes = new Map();
    this.expanded = true;
    this.zoom = 1;
    this.fit = 1;
    this.panX = 0;
    this.panY = 0;
    this.w = stage.clientWidth || 375;
    this.h = stage.clientHeight || 600;
    this.raf = 0;
    this.calm = 0;
    this.pointers = new Map();
    this.gesture = null;
    this.pinch = null;
    this.lastBgTap = 0;
    this.model = null;
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

    new ResizeObserver(() => {
      const w = stage.clientWidth;
      const h = stage.clientHeight;
      if (w && h && (w !== this.w || h !== this.h)) {
        this.w = w;
        this.h = h;
        if (this.model) this.layout();
      }
    }).observe(stage);

    this.bindPointers();
  }

  setData(model) {
    this.model = model;
    this.layout();
  }

  setExpanded(v) {
    this.expanded = v;
    this.stage.classList.toggle('collapsed', !v);
    this.kick();
  }

  highlight(expenseId) {
    const n = this.nodes.get('e:' + expenseId);
    if (!n) return;
    n.el.classList.remove('fresh');
    void n.el.offsetWidth;
    n.el.classList.add('fresh');
    setTimeout(() => n.el.classList.remove('fresh'), 2800);
  }

  resetView(animate = true) {
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
    this.applyView(animate);
  }

  // ---------- Yerleşim ----------

  layout() {
    const m = this.model;
    const S = Math.min(this.w, this.h);
    const seen = new Set();

    const coreD = clamp(S * 0.38, 124, 184);
    const core = this.upsert('core', 'core', null);
    this.setSize(core, coreD);
    core.ax = 0;
    core.ay = 0;
    core.el.classList.toggle('neg', m.core.hasSalary && m.core.remaining < 0);
    core.el.setAttribute('aria-label', m.core.hasSalary ? `Kalan ${moneyShort(m.core.remaining)}` : `Harcanan ${moneyShort(m.core.spent)}`);
    this.setHTML(core, this.coreHTML(m.core));
    seen.add('core');

    const cats = m.categories;
    const n = cats.length;
    const maxT = Math.max(1, ...cats.map((c) => c.total));
    const maxA = Math.max(1, ...cats.flatMap((c) => c.expenses.slice(0, MAX_CHILDREN).map((e) => e.amount)));
    const catD = (c) => (c.total > 0 ? 56 + 34 * Math.sqrt(c.total / maxT) : 44);
    const expD = (a) => 28 + 26 * Math.sqrt(a / maxA);
    const maxCatD = Math.max(44, ...cats.map(catD));

    const spacingR = n > 1 ? (maxCatD + 12) / (2 * Math.sin(Math.PI / n)) : 0;
    const R1 = Math.max(coreD / 2 + 20 + maxCatD / 2, spacingR);
    const aspect = clamp(this.h / this.w, 1, 1.5);

    let extX = coreD / 2;
    let extY = coreD / 2;
    const grow = (x, y, r) => {
      extX = Math.max(extX, Math.abs(x) + r);
      extY = Math.max(extY, Math.abs(y) + r);
    };

    cats.forEach((c, i) => {
      const theta = -Math.PI / 2 + (i * TAU) / n;
      const ax = Math.cos(theta) * R1;
      const ay = Math.sin(theta) * R1 * aspect;
      const key = 'c:' + c.id;
      const node = this.upsert(key, 'cat', core);
      const d = catD(c);
      this.setSize(node, d);
      node.ax = ax;
      node.ay = ay;
      node.el.style.setProperty('--c', c.color);
      if (node.line) node.line.style.stroke = c.color;
      const p = c.limit > 0 ? c.total / c.limit : 0;
      node.el.classList.toggle('over', c.limit > 0 && c.total > c.limit);
      node.el.classList.toggle('near', p >= 0.8 && p <= 1);
      node.el.classList.toggle('empty', c.total === 0);
      node.el.setAttribute('aria-label', `${c.name}: ${moneyShort(c.total)}${c.limit ? ` / ${moneyShort(c.limit)}` : ''}`);
      this.setHTML(node, this.catHTML(c, p, d));
      seen.add(key);
      grow(ax, ay, d / 2);

      // Yörünge 2: kategoriden dışarı doğru yay şeklinde
      const shown = c.expenses.slice(0, MAX_CHILDREN);
      const overflow = c.expenses.length - shown.length;
      const items = shown.map((e) => ({ key: 'e:' + e.id, type: 'exp', d: expD(e.amount), data: e }));
      if (overflow > 0) items.push({ key: 'o:' + c.id, type: 'more', d: 30, data: { count: overflow } });
      if (!items.length) return;

      const out = Math.atan2(ay, ax);
      const avgD = items.reduce((s, it) => s + it.d, 0) / items.length;
      const zig = items.length > 4;
      const base = d / 2 + 10 + avgD / 2;
      const step = (avgD + 6) / base;
      const spread = Math.min(step * (items.length - 1) * (zig ? 0.55 : 1), TAU * 0.6);

      items.forEach((it, j) => {
        const t = items.length === 1 ? 0 : j / (items.length - 1) - 0.5;
        const a = out + t * spread;
        const dist = d / 2 + 10 + it.d / 2 + (zig && j % 2 ? avgD * 0.92 : 0);
        const child = this.upsert(it.key, it.type, node);
        this.setSize(child, it.d);
        child.ox = Math.cos(a) * dist;
        child.oy = Math.sin(a) * dist;
        child.el.style.setProperty('--c', c.color);
        if (child.line) child.line.style.stroke = c.color;
        if (it.type === 'exp') {
          child.el.classList.toggle('big', it.d >= 46);
          child.el.setAttribute('aria-label', `${it.data.title}: ${moneyShort(it.data.amount)}`);
          this.setHTML(child, `<span class="exp-amt">${esc(moneyShort(it.data.amount))}</span><span class="exp-title">${esc(it.data.title)}</span>`);
        } else {
          child.el.setAttribute('aria-label', `${it.data.count} harcama daha`);
          this.setHTML(child, `<span>+${it.data.count}</span>`);
        }
        seen.add(it.key);
        grow(ax + child.ox, ay + child.oy, it.d / 2);
      });
    });

    for (const node of this.nodes.values()) if (!seen.has(node.key)) this.kill(node);

    this.fit = Math.min(1.1, (this.w / 2 - 8) / extX, (this.h / 2 - 8) / extY);
    this.applyView();
    this.render(); // ilk kare beklenmeden konumlar yerinde olsun
    this.kick();
  }

  coreHTML(c) {
    if (!c.hasSalary) {
      return `${ring(0)}<div class="core-label">Harcanan</div>
        <div class="core-amount">${esc(moneyInt(c.spent))}</div>
        <div class="core-sub">Maaşını ayarla</div>`;
    }
    const p = c.free > 0 ? c.spent / c.free : 1;
    return `${ring(p)}<div class="core-label">${c.remaining < 0 ? 'Aşım' : 'Kalan'}</div>
      <div class="core-amount">${esc(moneyInt(Math.abs(c.remaining)))}</div>
      <div class="core-sub">${esc(moneyInt(c.spent))} / ${esc(moneyInt(c.free))}</div>`;
  }

  catHTML(c, p, d) {
    return `${c.limit > 0 ? ring(p) : ''}
      <span class="cat-icon">${catIcon(c.icon)}</span>
      ${d >= 52 ? `<span class="cat-name">${esc(c.name)}</span>` : ''}
      <span class="cat-amt">${esc(c.total > 0 ? moneyShort(c.total) : '—')}</span>`;
  }

  upsert(key, type, parent) {
    let n = this.nodes.get(key);
    if (!n) {
      const el = document.createElement('div');
      el.className = `bubble ${type}`;
      el.dataset.key = key;
      el.setAttribute('role', 'button');
      el.tabIndex = 0;
      const body = document.createElement('div');
      body.className = 'bubble-body';
      el.append(body);
      el.style.setProperty('--delay', `${(-Math.random() * 7).toFixed(2)}s`);
      this.world.append(el);
      let line = null;
      if (parent) {
        line = document.createElementNS(SVG_NS, 'line');
        line.setAttribute('class', type === 'cat' ? 'tether main' : 'tether');
        this.svg.append(line);
      }
      const sx = parent ? parent.x : 0;
      const sy = parent ? parent.y : 0;
      n = { key, type, el, body, line, x: sx, y: sy, px: sx, py: sy, vx: 0, vy: 0, s: 0, ts: 1, d: 0, ax: 0, ay: 0, ox: 0, oy: 0, parent, dragging: false, dead: false, html: '', t: '' };
      this.nodes.set(key, n);
    }
    n.parent = parent;
    n.dead = false;
    n.ts = 1;
    n.el.classList.remove('dying');
    return n;
  }

  setSize(n, d) {
    if (Math.abs(n.d - d) > 0.2) {
      n.d = d;
      n.el.style.setProperty('--d', `${d.toFixed(1)}px`);
    }
  }

  setHTML(n, html) {
    if (n.html !== html) {
      n.html = html;
      n.body.innerHTML = html;
    }
  }

  kill(n) {
    if (n.dead) return;
    n.dead = true;
    n.ts = 0;
    n.el.classList.add('dying');
  }

  // ---------- Fizik ----------

  kick() {
    this.calm = 0;
    if (!this.raf) {
      this.lastT = performance.now();
      this.raf = requestAnimationFrame(this.tick);
    }
  }

  tick = (now) => {
    const dt = Math.min(0.034, Math.max(0.001, (now - this.lastT) / 1000));
    this.lastT = now;
    const sub = 2;
    let energy = 0;
    for (let i = 0; i < sub; i++) energy = this.step(dt / sub);
    this.render();

    const dragging = this.gesture?.node?.dragging;
    this.calm = energy < 2.5 && !dragging ? this.calm + 1 : 0;
    if (this.calm > 20) {
      this.raf = 0;
      return;
    }
    this.raf = requestAnimationFrame(this.tick);
  };

  step(dt) {
    const k = this.reduced ? 260 : 150;
    const c = this.reduced ? 32 : 17;
    const list = [...this.nodes.values()];
    let energy = 0;

    for (const n of list) {
      let tx = 0;
      let ty = 0;
      if (n.dead) {
        tx = n.parent ? n.parent.x : 0;
        ty = n.parent ? n.parent.y : 0;
      } else if (n.type === 'core' || !this.expanded) {
        tx = 0;
        ty = 0;
      } else if (n.type === 'cat') {
        tx = n.ax;
        ty = n.ay;
      } else {
        tx = n.parent.x + n.ox;
        ty = n.parent.y + n.oy;
      }
      n.tx = tx;
      n.ty = ty;
      n.px = n.x;
      n.py = n.y;
      if (!n.dragging) {
        n.vx += (k * (tx - n.x) - c * n.vx) * dt;
        n.vy += (k * (ty - n.y) - c * n.vy) * dt;
        n.x += n.vx * dt;
        n.y += n.vy * dt;
      }
      const ts = n.type === 'core' || this.expanded ? n.ts : 0.25;
      const ds = (ts - n.s) * Math.min(1, dt * 9);
      n.s += ds;
      energy = Math.max(energy, Math.abs(ds) * 400);
    }

    // Çarpışmalar (konum tabanlı, kararlı)
    if (this.expanded) {
      const live = list.filter((n) => !n.dead && n.s > 0.45);
      for (let i = 0; i < live.length; i++) {
        const a = live[i];
        for (let j = i + 1; j < live.length; j++) {
          const b = live[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const min = (a.d * a.s + b.d * b.s) / 2 + 3;
          const d2 = dx * dx + dy * dy;
          if (d2 >= min * min) continue;
          const dist = Math.sqrt(d2) || 0.01;
          const wa = this.invMass(a);
          const wb = this.invMass(b);
          const sum = wa + wb;
          if (!sum) continue;
          const push = (min - dist) * 0.5;
          const ux = dx / dist;
          const uy = dy / dist;
          a.x -= ux * push * (wa / sum);
          a.y -= uy * push * (wa / sum);
          b.x += ux * push * (wb / sum);
          b.y += uy * push * (wb / sum);
        }
      }
    }

    for (const n of list) {
      if (!n.dragging) {
        n.vx = (n.x - n.px) / dt;
        n.vy = (n.y - n.py) / dt;
      }
      energy = Math.max(energy, Math.abs(n.vx) + Math.abs(n.vy));
      if (n.dead && n.s < 0.04) {
        n.el.remove();
        n.line?.remove();
        this.nodes.delete(n.key);
      } else if (n.dead) {
        energy = Math.max(energy, 10);
      }
    }
    return energy;
  }

  invMass(n) {
    if (n.type === 'core' || n.dragging) return 0;
    return n.type === 'cat' ? 0.35 : 1;
  }

  render() {
    for (const n of this.nodes.values()) {
      const t = `translate3d(${n.x.toFixed(1)}px,${n.y.toFixed(1)}px,0) translate(-50%,-50%) scale(${n.s.toFixed(3)})`;
      if (t !== n.t) {
        n.t = t;
        n.el.style.transform = t;
      }
      if (n.line && n.parent) {
        n.line.setAttribute('x1', n.parent.x.toFixed(1));
        n.line.setAttribute('y1', n.parent.y.toFixed(1));
        n.line.setAttribute('x2', n.x.toFixed(1));
        n.line.setAttribute('y2', n.y.toFixed(1));
        n.line.style.opacity = n.dead ? 0 : Math.min(1, n.s);
      }
    }
  }

  // ---------- Görünüm (yakınlaştır / kaydır) ----------

  get scale() {
    return this.fit * this.zoom;
  }

  applyView(animate = false) {
    this.viewport.classList.toggle('animate', animate);
    this.viewport.style.transform = `translate(${(this.w / 2 + this.panX).toFixed(1)}px,${(this.h / 2 + this.panY).toFixed(1)}px) scale(${this.scale.toFixed(4)})`;
    if (animate) setTimeout(() => this.viewport.classList.remove('animate'), 450);
  }

  toWorld(cx, cy) {
    const r = this.stage.getBoundingClientRect();
    return {
      x: (cx - r.left - this.w / 2 - this.panX) / this.scale,
      y: (cy - r.top - this.h / 2 - this.panY) / this.scale,
    };
  }

  bindPointers() {
    const st = this.stage;

    st.addEventListener('pointerdown', (e) => {
      if (e.button > 0) return;
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      try {
        st.setPointerCapture(e.pointerId);
      } catch {
        /* yok say */
      }

      if (this.pointers.size === 2) {
        if (this.gesture?.node) this.gesture.node.dragging = false;
        this.gesture = null;
        const [p1, p2] = [...this.pointers.values()];
        const r = st.getBoundingClientRect();
        const mx = (p1.x + p2.x) / 2;
        const my = (p1.y + p2.y) / 2;
        this.pinch = {
          d0: Math.hypot(p1.x - p2.x, p1.y - p2.y) || 1,
          z0: this.zoom,
          world: this.toWorld(mx, my),
          rect: r,
        };
        return;
      }
      if (this.pointers.size > 2) return;

      const el = e.target.closest('.bubble');
      const node = el ? this.nodes.get(el.dataset.key) : null;
      let grabX = 0;
      let grabY = 0;
      if (node) {
        const w = this.toWorld(e.clientX, e.clientY);
        grabX = w.x - node.x;
        grabY = w.y - node.y;
      }
      this.gesture = {
        id: e.pointerId,
        x0: e.clientX,
        y0: e.clientY,
        node: node && !node.dead ? node : null,
        moved: false,
        grabX,
        grabY,
        pan0: { x: this.panX, y: this.panY },
        lastX: 0,
        lastY: 0,
        lastT: performance.now(),
      };
      if (node) node.el.classList.add('pressed');
      if (node?.type === 'core') {
        const g = this.gesture;
        g.lpTimer = setTimeout(() => {
          if (this.gesture !== g || g.moved) return;
          g.longPressed = true;
          node.el.classList.remove('pressed');
          this.handlers.onLongPressCore?.();
        }, 480);
      }
    });

    st.addEventListener('pointermove', (e) => {
      if (!this.pointers.has(e.pointerId)) return;
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (this.pinch && this.pointers.size >= 2) {
        const [p1, p2] = [...this.pointers.values()];
        const d = Math.hypot(p1.x - p2.x, p1.y - p2.y);
        this.zoom = clamp((this.pinch.z0 * d) / this.pinch.d0, 0.5, 3.5);
        const r = this.pinch.rect;
        const mx = (p1.x + p2.x) / 2 - r.left;
        const my = (p1.y + p2.y) / 2 - r.top;
        this.panX = mx - this.w / 2 - this.pinch.world.x * this.scale;
        this.panY = my - this.h / 2 - this.pinch.world.y * this.scale;
        this.applyView();
        return;
      }

      const g = this.gesture;
      if (!g || g.id !== e.pointerId) return;
      const dx = e.clientX - g.x0;
      const dy = e.clientY - g.y0;
      if (!g.moved && Math.hypot(dx, dy) > 7) {
        g.moved = true;
        clearTimeout(g.lpTimer);
        if (g.node) {
          g.node.dragging = true;
          g.node.el.classList.add('dragging');
        }
      }
      if (!g.moved) return;

      if (g.node) {
        const n = g.node;
        const w = this.toWorld(e.clientX, e.clientY);
        const wantX = w.x - g.grabX;
        const wantY = w.y - g.grabY;
        const tx = n.tx ?? n.x;
        const ty = n.ty ?? n.y;
        const limit = n.type === 'core' ? 50 : n.type === 'cat' ? 110 : 90;
        const nx = tx + rubber(wantX - tx, limit);
        const ny = ty + rubber(wantY - ty, limit);
        const now = performance.now();
        const t = Math.max(0.008, (now - g.lastT) / 1000);
        n.vx = (nx - n.x) / t;
        n.vy = (ny - n.y) / t;
        n.x = nx;
        n.y = ny;
        g.lastT = now;
        this.kick();
      } else {
        this.panX = g.pan0.x + dx;
        this.panY = g.pan0.y + dy;
        this.applyView();
      }
    });

    const end = (e) => {
      if (!this.pointers.has(e.pointerId)) return;
      this.pointers.delete(e.pointerId);
      if (this.pinch) {
        if (this.pointers.size < 2) this.pinch = null;
        this.gesture = null;
        return;
      }
      const g = this.gesture;
      if (!g || g.id !== e.pointerId) return;
      this.gesture = null;
      clearTimeout(g.lpTimer);
      if (g.longPressed) return;
      if (g.node) {
        g.node.el.classList.remove('pressed', 'dragging');
        if (g.node.dragging) {
          g.node.dragging = false;
          g.node.vx = clamp(g.node.vx, -1500, 1500);
          g.node.vy = clamp(g.node.vy, -1500, 1500);
          this.kick();
        }
      }
      if (g.moved || e.type === 'pointercancel') return;

      if (g.node) {
        this.tap(g.node);
      } else {
        const now = performance.now();
        if (now - this.lastBgTap < 320) {
          this.resetView(true);
          this.lastBgTap = 0;
        } else {
          this.lastBgTap = now;
        }
      }
    };
    st.addEventListener('pointerup', end);
    st.addEventListener('pointercancel', end);

    st.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const world = this.toWorld(e.clientX, e.clientY);
        this.zoom = clamp(this.zoom * Math.exp(-e.deltaY * 0.0015), 0.5, 3.5);
        const r = st.getBoundingClientRect();
        this.panX = e.clientX - r.left - this.w / 2 - world.x * this.scale;
        this.panY = e.clientY - r.top - this.h / 2 - world.y * this.scale;
        this.applyView();
      },
      { passive: false }
    );

    // Klavye erişimi
    st.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const el = e.target.closest?.('.bubble');
      const node = el && this.nodes.get(el.dataset.key);
      if (node) {
        e.preventDefault();
        this.tap(node);
      }
    });
  }

  tap(node) {
    const [kind, id] = node.key.split(/:(.*)/s);
    if (node.key === 'core') this.handlers.onTapCore?.();
    else if (kind === 'c') this.handlers.onTapCategory?.(id);
    else if (kind === 'e') this.handlers.onTapExpense?.(id);
    else if (kind === 'o') this.handlers.onTapCategory?.(id);
  }
}
