import { esc, hashStr, lifeSpan, safeSrc, roman, reducedMotion } from './util.js';

// ---- layout constants (px in "stage" space) ----
const PW = 132;        // one person card
const SG = 14;         // gap between spouses
const SIB = 40;        // gap between siblings
const ROOTG = 110;     // gap between separate root families
const LVL = 330;       // vertical distance per generation
const CARD_H = 210;    // card height (clip + photo + caption)
const GEN_X = -150;    // x of generation labels

const ICON = {
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
  rings: '<svg viewBox="0 0 24 24"><circle cx="9" cy="14" r="5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="15" cy="14" r="5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 4l1.5 2L11 4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  swap: '<svg viewBox="0 0 24 24"><path d="M7 7h12m0 0l-3-3m3 3l-3 3M17 17H5m0 0l3-3m-3 3l3 3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  down: '<svg viewBox="0 0 24 24"><path d="M12 5v12m0 0l-5-5m5 5l5-5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

function avatar(p) {
  const hue = hashStr(p.id || p.name) % 40;
  const initials = (p.name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  const g = `g${hashStr(p.id || 'x')}`;
  return `<svg class="avatar" viewBox="0 0 100 100" aria-hidden="true">
    <defs><linearGradient id="${g}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${350 + hue},62%,24%)"/><stop offset="1" stop-color="hsl(${18 + hue},75%,38%)"/></linearGradient></defs>
    <rect width="100" height="100" fill="url(#${g})"/>
    <circle cx="50" cy="50" r="38" fill="none" stroke="rgba(245,217,139,.28)" stroke-width="1.2" stroke-dasharray="2 4"/>
    <circle cx="50" cy="39" r="14" fill="rgba(251,241,220,.22)"/>
    <path d="M20 92c2-20 14-30 30-30s28 10 30 30z" fill="rgba(251,241,220,.22)"/>
    <text x="50" y="58" text-anchor="middle" font-family="Cormorant Garamond, serif" font-weight="700" font-size="30" fill="#f5d98b">${esc(initials)}</text></svg>`;
}

function personHTML(p) {
  const src = safeSrc(p.photo);
  const tilt = ((hashStr(p.id) % 7) - 3) * 0.55;
  return `<figure class="person" data-pid="${esc(p.id)}" data-g="${esc(p.gender)}" style="--tilt:${tilt}deg">
    <span class="pclip"></span>
    <div class="photo">${src ? `<img src="${esc(src)}" alt="${esc(p.name)}" draggable="false" loading="lazy">` : avatar(p)}<span class="drophint">Drop photo</span></div>
    <figcaption><b>${esc(p.name || 'Unnamed')}</b>${p.nick ? `<em>${esc(p.nick)}</em>` : ''}<small>${esc(lifeSpan(p)) || '&nbsp;'}</small></figcaption>
  </figure>`;
}

const unitSig = (u) => JSON.stringify(u.people);

export class TreeView extends EventTarget {
  constructor(store, { viewport, stage, svg }) {
    super();
    this.store = store; this.viewport = viewport; this.stage = stage; this.svg = svg;
    this.nodes = new Map();   // unitId -> {el,x,y,tx,ty,w,depth,parentId,sig}
    this.links = new Map();   // childUnitId -> {g, base, spark}
    this.genLabels = [];
    this.view = { x: 0, y: 0, k: 1 };
    this.editing = false;
    this.selectedPid = null;
    this.bounds = { w: 0, h: 0, depth: 0 };
    this.filter = '';
    this.userMoved = false;
    this._raf = 0; this._viewRaf = 0;
    this.ptrs = new Map();
    this.#bind();
    store.addEventListener('change', () => this.render());
  }

  // ------------------------------------------------------------------ layout
  #layout() {
    const lay = new Map();
    const measure = (u) => {
      const w = u.people.length * PW + (u.people.length - 1) * SG;
      let cw = 0;
      u.children.forEach((c, i) => { measure(c); cw += lay.get(c.id).sw + (i ? SIB : 0); });
      lay.set(u.id, { w, cw, sw: Math.max(w, cw) });
    };
    const targets = new Map();
    const place = (u, left, depth, parentId) => {
      const L = lay.get(u.id);
      targets.set(u.id, { x: left + (L.sw - L.w) / 2, y: depth * LVL, w: L.w, depth, parentId });
      let cx = left + (L.sw - L.cw) / 2;
      for (const c of u.children) { place(c, cx, depth + 1, u.id); cx += lay.get(c.id).sw + SIB; }
    };
    let x = 0, maxDepth = 0;
    for (const r of this.store.data.roots) { measure(r); }
    this.store.data.roots.forEach((r, i) => { place(r, x, 0, null); x += lay.get(r.id).sw + (i < this.store.data.roots.length - 1 ? ROOTG : 0); });
    for (const t of targets.values()) maxDepth = Math.max(maxDepth, t.depth);
    this.bounds = { w: x, h: maxDepth * LVL + CARD_H, depth: targets.size ? maxDepth + 1 : 0 };
    return targets;
  }

  // ------------------------------------------------------------------ render
  render() {
    const roots = this.store.data.roots;
    const targets = this.#layout();
    const units = new Map();
    (function walk(list) { for (const u of list) { units.set(u.id, u); walk(u.children); } })(roots);

    // remove deleted
    for (const [id, n] of this.nodes) {
      if (!units.has(id)) { n.el.classList.add('leaving'); setTimeout(() => n.el.remove(), 350); this.nodes.delete(id); }
    }
    for (const [id, l] of this.links) {
      if (!targets.has(id) || !targets.get(id).parentId) { l.g.remove(); this.links.delete(id); }
    }

    // create / update
    for (const [id, t] of targets) {
      const u = units.get(id);
      let n = this.nodes.get(id);
      const sig = unitSig(u);
      if (!n) {
        const el = document.createElement('div');
        el.className = 'unit enter';
        el.dataset.id = id;
        this.stage.append(el);
        const parent = t.parentId && this.nodes.get(t.parentId);
        n = { el, x: parent ? parent.x : t.x, y: parent ? parent.y : t.y - 40, sig: '' };
        this.nodes.set(id, n);
        setTimeout(() => el.classList.remove('enter'), 900);
      }
      Object.assign(n, { tx: t.x, ty: t.y, w: t.w, depth: t.depth, parentId: t.parentId });
      n.el.dataset.n = u.people.length;
      if (n.sig !== sig) {
        n.sig = sig;
        n.el.innerHTML = `<div class="persons">${u.people.map(personHTML).join('<span class="knot" title="Married"></span>')}</div>
          <div class="ctl" aria-hidden="false">
            <button class="cb add-l" data-act="sib-l" title="Add sibling on the left" aria-label="Add sibling on the left">${ICON.plus}</button>
            <button class="cb add-r" data-act="sib-r" title="Add sibling on the right" aria-label="Add sibling on the right">${ICON.plus}</button>
            <button class="cb add-c" data-act="child" title="Add a child below">${ICON.down}<span>child</span></button>
            <div class="tools">
              <button class="cb" data-act="spouse" title="Add spouse">${ICON.rings}</button>
              <button class="cb" data-act="swap" title="Swap order (left person is the bloodline)">${ICON.swap}</button>
              <button class="cb danger" data-act="del" title="Delete this branch">${ICON.trash}</button>
            </div></div>`;
      }
      if (!t.parentId) n.el.classList.add('is-root'); else n.el.classList.remove('is-root');
      n.el.style.width = `${t.w}px`;
    }

    // links
    for (const [id, t] of targets) {
      if (!t.parentId || this.links.has(id)) continue;
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.dataset.id = id;
      g.setAttribute('class', 'link');
      g.style.setProperty('--d', `${(t.depth * 0.3).toFixed(2)}s`);
      const mk = (cls) => { const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('class', cls); p.setAttribute('pathLength', '1'); g.append(p); return p; };
      const glow = mk('glow'); const base = mk('thread'); const spark = mk('spark');
      this.svg.append(g);
      this.links.set(id, { g, glow, base, spark });
    }

    // generation labels
    while (this.genLabels.length > this.bounds.depth) this.genLabels.pop().remove();
    while (this.genLabels.length < this.bounds.depth) {
      const d = document.createElement('div'); d.className = 'gen-label'; this.stage.append(d); this.genLabels.push(d);
    }
    this.genLabels.forEach((d, i) => {
      d.innerHTML = `<span class="gu">પેઢી</span><b>${roman(i)}</b>`;
      d.style.transform = `translate(${GEN_X}px, ${i * LVL + 70}px)`;
    });

    this.#applySelection();
    this.#applyFilter();
    this.#startAnim();
    this.dispatchEvent(new CustomEvent('rendered'));
    if (!this.userMoved && !this._fitted) { this._fitted = true; requestAnimationFrame(() => this.fit(false)); }
  }

  #startAnim() {
    cancelAnimationFrame(this._raf);
    const step = () => {
      let moving = false;
      const snap = reducedMotion();
      for (const n of this.nodes.values()) {
        const dx = n.tx - n.x, dy = n.ty - n.y;
        if (snap || (Math.abs(dx) < 0.25 && Math.abs(dy) < 0.25)) { n.x = n.tx; n.y = n.ty; }
        else { n.x += dx * 0.17; n.y += dy * 0.17; moving = true; }
        n.el.style.transform = `translate3d(${n.x}px, ${n.y}px, 0)`;
      }
      for (const [id, l] of this.links) {
        const c = this.nodes.get(id); const p = c && this.nodes.get(c.parentId);
        if (!c || !p) continue;
        const px = p.x + p.w / 2, py = p.y + CARD_H - 28;
        const cx = c.x + c.w / 2, cy = c.y + 6;
        const my = py + (cy - py) * 0.55;
        const d = `M${px.toFixed(1)} ${py.toFixed(1)} C${px.toFixed(1)} ${my.toFixed(1)} ${cx.toFixed(1)} ${(cy - (cy - py) * 0.45).toFixed(1)} ${cx.toFixed(1)} ${cy.toFixed(1)}`;
        l.glow.setAttribute('d', d); l.base.setAttribute('d', d); l.spark.setAttribute('d', d);
      }
      if (moving) this._raf = requestAnimationFrame(step);
    };
    this._raf = requestAnimationFrame(step);
  }

  // ------------------------------------------------------------------ selection / filter / hover
  select(pid) { this.selectedPid = pid; this.#applySelection(); }
  #applySelection() {
    this.stage.querySelectorAll('.person.selected').forEach((e) => e.classList.remove('selected'));
    this.stage.querySelectorAll('.unit.selected').forEach((e) => e.classList.remove('selected'));
    if (!this.selectedPid) return;
    const el = this.stage.querySelector(`.person[data-pid="${CSS.escape(this.selectedPid)}"]`);
    if (el) { el.classList.add('selected'); el.closest('.unit').classList.add('selected'); }
  }
  setFilter(q) { this.filter = q.trim().toLowerCase(); this.#applyFilter(); return this.firstMatch(); }
  firstMatch() {
    if (!this.filter) return null;
    let hit = null;
    (function walk(list, me) { for (const u of list) { if (!hit && u.people.some((p) => me.#matches(p))) hit = u; walk(u.children, me); } })(this.store.data.roots, this);
    return hit;
  }
  #matches(p) { return `${p.name} ${p.nick} ${p.place}`.toLowerCase().includes(this.filter); }
  #applyFilter() {
    const q = this.filter;
    this.stage.classList.toggle('filtering', !!q);
    const byId = new Map();
    (function walk(list) { for (const u of list) { byId.set(u.id, u); walk(u.children); } })(this.store.data.roots);
    for (const [id, n] of this.nodes) {
      const u = byId.get(id);
      n.el.querySelectorAll('.person').forEach((el, i) => el.classList.toggle('match', !!q && !!u && this.#matches(u.people[i])));
    }
  }
  #hover(unitId) {
    const hot = unitId ? new Set([unitId, ...this.store.ancestorIds(unitId)]) : null;
    for (const [id, l] of this.links) l.g.classList.toggle('hot', !!hot && hot.has(id));
  }

  // ------------------------------------------------------------------ edit mode
  setEditing(on) { this.editing = on; this.viewport.classList.toggle('editing', on); }

  // ------------------------------------------------------------------ view (pan / zoom)
  #applyView() {
    const { x, y, k } = this.view;
    this.stage.style.transform = `translate(${x}px, ${y}px) scale(${k})`;
    this.viewport.style.setProperty('--bx', `${x}px`);
    this.viewport.style.setProperty('--by', `${y}px`);
    this.viewport.style.setProperty('--bk', k);
    this.dispatchEvent(new CustomEvent('zoom', { detail: k }));
  }
  #tweenView(to, ms = 750) {
    cancelAnimationFrame(this._viewRaf);
    if (reducedMotion() || ms <= 0) { this.view = { ...to }; this.#applyView(); return; }
    const from = { ...this.view }; const t0 = performance.now();
    const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2);
    const tick = (now) => {
      const t = Math.min(1, (now - t0) / ms); const e = ease(t);
      this.view = { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e, k: from.k + (to.k - from.k) * e };
      this.#applyView();
      if (t < 1) this._viewRaf = requestAnimationFrame(tick);
    };
    this._viewRaf = requestAnimationFrame(tick);
  }
  fit(animate = true) {
    const vw = this.viewport.clientWidth, vh = this.viewport.clientHeight;
    const pad = vw < 700 ? 30 : 70;
    const left = GEN_X - 20, w = this.bounds.w - left, h = this.bounds.h + 40;
    if (!this.bounds.depth) { this.#tweenView({ x: vw / 2, y: vh / 2, k: 1 }, 0); return; }
    const fitK = Math.min(1.05, (vw - pad * 2) / w, (vh - pad * 2) / h);
    const minK = vw < 700 ? 0.34 : 0.18;
    if (fitK < minK) {
      // Too wide to show whole at a readable size (typical on phones): start at the first ancestors; the user pans from there.
      this.#tweenView({ k: minK, x: pad - left * minK, y: 70 }, animate ? 800 : 0);
    } else {
      this.#tweenView({ k: fitK, x: (vw - w * fitK) / 2 - left * fitK, y: (vh - h * fitK) / 2 + 10 }, animate ? 800 : 0);
    }
    this.userMoved = false;
  }
  zoomBy(f, cx, cy) {
    const vw = this.viewport.clientWidth, vh = this.viewport.clientHeight;
    cx ??= vw / 2; cy ??= vh / 2;
    const k = Math.max(0.15, Math.min(2.2, this.view.k * f)); const r = k / this.view.k;
    this.userMoved = true;
    this.#tweenView({ k, x: cx - (cx - this.view.x) * r, y: cy - (cy - this.view.y) * r }, 0);
  }
  focus(unitId, minK = 0.95) {
    const n = this.nodes.get(unitId); if (!n) return;
    const vw = this.viewport.clientWidth, vh = this.viewport.clientHeight;
    const k = Math.max(this.view.k, minK);
    const sheet = this.panelOpen && vw <= 820;            // mobile: bottom sheet covers the lower ~2/3
    const panelShift = this.panelOpen && vw > 820 ? 190 : 0; // desktop: side panel covers the right
    this.userMoved = true;
    this.#tweenView({ k, x: (vw - panelShift) / 2 - (n.tx + n.w / 2) * k, y: (sheet ? vh * 0.17 : vh / 2) - (n.ty + CARD_H / 2) * k }, 800);
  }

  // ------------------------------------------------------------------ input
  #bind() {
    const vp = this.viewport;
    vp.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = vp.getBoundingClientRect();
      this.zoomBy(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0016)), e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });

    vp.addEventListener('pointerdown', (e) => this.#down(e));
    window.addEventListener('pointermove', (e) => this.#move(e));
    window.addEventListener('pointerup', (e) => this.#up(e));
    window.addEventListener('pointercancel', (e) => this.#up(e));

    vp.addEventListener('click', (e) => {
      if (this._suppressClick) { this._suppressClick = false; return; }
      const btn = e.target.closest('[data-act]');
      const unitEl = e.target.closest('.unit');
      if (btn && unitEl) { this.dispatchEvent(new CustomEvent('action', { detail: { act: btn.dataset.act, unitId: unitEl.dataset.id } })); return; }
      const pEl = e.target.closest('.person');
      if (pEl) { this.dispatchEvent(new CustomEvent('pick', { detail: { pid: pEl.dataset.pid, unitId: unitEl.dataset.id } })); return; }
      if (!e.target.closest('.cb')) this.dispatchEvent(new CustomEvent('blank'));
    });
    vp.addEventListener('mouseover', (e) => { const u = e.target.closest('.unit'); this.#hover(u && !this.drag ? u.dataset.id : null); });
    vp.addEventListener('mouseleave', () => this.#hover(null));
    // broken images → fall back to the avatar
    vp.addEventListener('error', (e) => {
      const img = e.target; if (img.tagName !== 'IMG') return;
      const pid = img.closest('.person')?.dataset.pid; const f = pid && this.store.findPerson(pid);
      if (f) img.replaceWith(Object.assign(document.createElement('span'), { innerHTML: avatar(f.person) }).firstElementChild);
    }, true);

    // drop an image file straight onto a person card
    vp.addEventListener('dragover', (e) => {
      if (!this.editing || !e.dataTransfer?.types.includes('Files')) return;
      e.preventDefault();
      const p = e.target.closest('.person');
      this.stage.querySelectorAll('.person.drop-photo').forEach((x) => x !== p && x.classList.remove('drop-photo'));
      p?.classList.add('drop-photo');
    });
    vp.addEventListener('dragleave', (e) => { if (!vp.contains(e.relatedTarget)) this.stage.querySelectorAll('.drop-photo').forEach((x) => x.classList.remove('drop-photo')); });
    vp.addEventListener('drop', (e) => {
      this.stage.querySelectorAll('.drop-photo').forEach((x) => x.classList.remove('drop-photo'));
      if (!this.editing) return;
      const file = [...(e.dataTransfer?.files || [])].find((f) => f.type.startsWith('image/'));
      const p = e.target.closest('.person');
      if (file && p) { e.preventDefault(); this.dispatchEvent(new CustomEvent('photodrop', { detail: { pid: p.dataset.pid, file } })); }
    });
  }

  #down(e) {
    if (e.button !== undefined && e.button !== 0 && e.pointerType === 'mouse') return;
    this.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.ptrs.size === 2) { this.pinch = this.#pinchState(); this.gesture = null; return; }
    if (e.target.closest('.cb') || e.target.closest('input,textarea')) return;
    const unitEl = e.target.closest('.unit');
    if (this.editing && unitEl) this.gesture = { type: 'unit', id: unitEl.dataset.id, el: unitEl, sx: e.clientX, sy: e.clientY, started: false, pid: e.pointerId };
    else this.gesture = { type: 'pan', sx: e.clientX, sy: e.clientY, ox: this.view.x, oy: this.view.y, started: false, pid: e.pointerId };
  }
  #pinchState() {
    const [a, b] = [...this.ptrs.values()];
    return { d: Math.hypot(a.x - b.x, a.y - b.y), k: this.view.k, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
  }
  #move(e) {
    if (!this.ptrs.has(e.pointerId)) return;
    this.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.ptrs.size === 2 && this.pinch) {
      const s = this.#pinchState(); const r = this.viewport.getBoundingClientRect();
      const f = (s.d / this.pinch.d) * this.pinch.k / this.view.k;
      this.zoomBy(f, s.mx - r.left, s.my - r.top);
      this._suppressClick = true;
      return;
    }
    const g = this.gesture; if (!g || g.pid !== e.pointerId) return;
    const dx = e.clientX - g.sx, dy = e.clientY - g.sy;
    if (!g.started && Math.hypot(dx, dy) < 6) return;
    if (!g.started) {
      g.started = true;
      if (g.type === 'unit') this.#beginDrag(g, e);
      else this.viewport.classList.add('panning');
    }
    if (g.type === 'pan') {
      this.userMoved = true;
      this.view.x = g.ox + dx; this.view.y = g.oy + dy; this.#applyView();
    } else this.#dragMove(e);
  }
  #up(e) {
    this.ptrs.delete(e.pointerId);
    if (this.ptrs.size < 2) this.pinch = null;
    const g = this.gesture;
    if (!g || g.pid !== e.pointerId) return;
    this.gesture = null;
    if (g.started) { this._suppressClick = true; setTimeout(() => (this._suppressClick = false), 0); }
    this.viewport.classList.remove('panning');
    if (g.type === 'unit' && g.started) this.#endDrag(e);
  }

  // ---- drag & drop of whole family units ----
  #beginDrag(g, e) {
    const el = g.el; const r = el.getBoundingClientRect();
    const ghost = el.cloneNode(true);
    ghost.classList.add('ghost'); ghost.classList.remove('selected', 'enter');
    ghost.style.cssText = `position:fixed;left:0;top:0;width:${r.width}px;transform:translate(${r.left}px,${r.top}px) scale(1);transform-origin:0 0;pointer-events:none;z-index:9999`;
    ghost.querySelectorAll('.ctl').forEach((c) => c.remove());
    document.body.append(ghost);
    el.classList.add('dragging');
    this.viewport.classList.add('is-dragging');
    this.drag = { id: g.id, ghost, ox: g.sx - r.left, oy: g.sy - r.top, forbid: this.store.descendantIds(g.id), target: null, zone: null };
    this.#hover(null);
    this.#dragMove(e);
  }
  #dragMove(e) {
    const d = this.drag; if (!d) return;
    d.ghost.style.transform = `translate(${e.clientX - d.ox}px,${e.clientY - d.oy}px) scale(${Math.min(1, this.view.k + 0.15)}) rotate(-2deg)`;
    this.stage.querySelectorAll('.drop-before,.drop-after,.drop-child').forEach((x) => x.classList.remove('drop-before', 'drop-after', 'drop-child'));
    d.target = null; d.zone = null;
    // hit-test units under the pointer
    let hit = null;
    for (const [id, n] of this.nodes) {
      if (id === d.id) continue;
      const r = n.el.getBoundingClientRect();
      const padX = 26 * this.view.k, padY = 18 * this.view.k;
      if (e.clientX >= r.left - padX && e.clientX <= r.right + padX && e.clientY >= r.top - padY && e.clientY <= r.bottom + padY) { hit = { id, n, r }; break; }
    }
    if (hit && !d.forbid.has(hit.id)) {
      const rel = (e.clientX - hit.r.left) / hit.r.width;
      const zone = rel < 0.26 ? 'before' : rel > 0.74 ? 'after' : 'child';
      d.target = hit.id; d.zone = zone;
      hit.n.el.classList.add(`drop-${zone}`);
    } else if (hit) { hit.n.el.classList.add('drop-no'); setTimeout(() => hit.n.el.classList.remove('drop-no'), 250); }
    // edge auto-pan
    const vr = this.viewport.getBoundingClientRect(); const edge = 60;
    d.pan = { x: e.clientX < vr.left + edge ? 1 : e.clientX > vr.right - edge ? -1 : 0, y: e.clientY < vr.top + edge ? 1 : e.clientY > vr.bottom - edge ? -1 : 0 };
    if ((d.pan.x || d.pan.y) && !d.autopan) {
      d.autopan = true;
      const loop = () => { if (!this.drag) return; this.view.x += d.pan.x * 12; this.view.y += d.pan.y * 12; this.#applyView(); d.autopan = !!(d.pan.x || d.pan.y); if (d.autopan) requestAnimationFrame(loop); };
      requestAnimationFrame(loop);
    }
  }
  #endDrag() {
    const d = this.drag; if (!d) return;
    this.drag = null;
    d.ghost.remove();
    this.stage.querySelectorAll('.dragging').forEach((x) => x.classList.remove('dragging'));
    this.stage.querySelectorAll('.drop-before,.drop-after,.drop-child').forEach((x) => x.classList.remove('drop-before', 'drop-after', 'drop-child'));
    this.viewport.classList.remove('is-dragging');
    if (d.target && d.zone) {
      const ok = this.store.move(d.id, d.target, d.zone);
      if (ok) this.dispatchEvent(new CustomEvent('moved', { detail: { id: d.id, zone: d.zone } }));
    }
  }
}
