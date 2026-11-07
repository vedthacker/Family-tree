import { Store } from './store.js';
import { TreeView } from './tree.js';
import { Panel } from './panel.js';
import { Admin } from './admin.js';
import { PROMPT_FIELDS, buildPrompt, generationsFromTree } from './prompt.js';
import { CHECKLIST, INTERVIEWS, LINEAGE_CARDS } from './content.js';
import { $, $$, h, esc, debounce, toast, copyText, download, reducedMotion } from './util.js';

const store = new Store();
await store.load();

// ======================================================================= tree + admin
const tree = new TreeView(store, { viewport: $('#viewport'), stage: $('#stage'), svg: $('#threads') });
let admin;
const panel = new Panel($('#panel'), store, tree, { uploadPhoto: (f) => admin.uploadPhoto(f) });
admin = new Admin({ store, tree, panel });

tree.addEventListener('pick', (e) => panel.open(e.detail.pid, true));
tree.addEventListener('blank', () => panel.close());
tree.addEventListener('photodrop', async (e) => {
  try {
    toast('Preparing photo…');
    const url = await admin.uploadPhoto(e.detail.file);
    store.updatePerson(e.detail.pid, { photo: url }, `ph:${e.detail.pid}`);
    if (panel.pid === e.detail.pid) panel.render();
    toast('Photo updated', 'ok');
  } catch (err) { toast(err.message || 'Photo failed', 'err'); }
});
tree.addEventListener('moved', () => toast('Branch moved', 'ok'));
tree.addEventListener('action', (e) => {
  if (!store.editing) return;
  const { act, unitId } = e.detail;
  const f = store.find(unitId); if (!f) return;
  if (act === 'sib-l' || act === 'sib-r') { const u = store.addSibling(unitId, act === 'sib-l' ? 'left' : 'right'); admin.reveal(u.id, u.people[0].id); }
  else if (act === 'child') { const u = store.addChild(unitId); admin.reveal(u.id, u.people[0].id); }
  else if (act === 'spouse') {
    const sp = store.addSpouse(unitId);
    if (sp) requestAnimationFrame(() => { panel.open(sp.id); setTimeout(() => $('#f-name')?.select(), 400); });
    else toast('This family unit already has two people');
  } else if (act === 'swap') store.swap(unitId);
  else if (act === 'del') {
    const n = (function c(l) { return l.reduce((s, u) => s + 1 + c(u.children), 0); })(f.unit.children);
    const who = f.unit.people.map((p) => p.name || 'Unnamed').join(' & ');
    if (!confirm(`Delete ${who}${n ? ` and ${n} descendant branch${n > 1 ? 'es' : ''}` : ''}? (Undo is available.)`)) return;
    if (panel.pid && f.unit.people.some((p) => p.id === panel.pid)) panel.close();
    store.deleteUnit(unitId);
  }
});

$('#zoomIn').addEventListener('click', () => tree.zoomBy(1.25));
$('#zoomOut').addEventListener('click', () => tree.zoomBy(0.8));
$('#zoomFit').addEventListener('click', () => tree.fit());
$('#fullscreen').addEventListener('click', () => { const s = $('#treeShell'); document.fullscreenElement ? document.exitFullscreen() : s.requestFullscreen?.(); });
document.addEventListener('fullscreenchange', () => setTimeout(() => tree.fit(), 150));
addEventListener('resize', debounce(() => { if (!tree.userMoved) tree.fit(false); }, 200));
addEventListener('keydown', (e) => { if (e.key === 'Escape' && panel.isOpen && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) panel.close(); });

$('#search').addEventListener('input', debounce((e) => {
  const hit = tree.setFilter(e.target.value);
  if (hit) tree.focus(hit.id, 0.8);
}, 250));
$('#emptyAdd').addEventListener('click', () => { if (store.editing) { const u = store.addRoot(); admin.reveal(u.id, u.people[0].id); } else admin.openLogin(); });

// ======================================================================= live bits driven by the data
const counters = new WeakMap();
function countTo(el, to) {
  const from = counters.get(el) ?? 0; counters.set(el, to);
  if (reducedMotion() || from === to) { el.textContent = to; return; }
  const t0 = performance.now();
  (function tick(now) { const t = Math.min(1, (now - t0) / 900); el.textContent = Math.round(from + (to - from) * (1 - (1 - t) ** 3)); if (t < 1) requestAnimationFrame(tick); })(t0);
}
function refreshMeta() {
  const m = store.data.meta;
  $('#heroTitle').textContent = m.title || 'Our Family Tree';
  document.title = `${m.title || 'Our Family Tree'} · Vansh Vruksh`;
  $('#heroTagline').textContent = m.tagline || '';
  $$('[data-meta]').forEach((el) => {
    const v = (m[el.dataset.meta] || '').trim();
    el.textContent = v || 'To be confirmed';
    el.classList.toggle('tbc', !v);
  });
}
function refreshStats() {
  const s = store.stats();
  countTo($('#statPeople'), s.people); countTo($('#statGen'), s.generations); countTo($('#statCouples'), s.couples);
  $('#empty').hidden = s.units > 0;
}
store.addEventListener('change', () => { refreshMeta(); refreshStats(); });
refreshMeta(); refreshStats(); tree.render();
if (store.usingDraft) {
  const b = $('#draftNote'); b.hidden = false;
  $('#draftDiscard').addEventListener('click', () => { if (confirm('Discard your local draft and reload the published tree?')) { store.discardDraft(); location.reload(); } });
}

// ======================================================================= static sections
$('#lineageCards').append(...LINEAGE_CARDS.map((c) => h('article', { class: 'lcard reveal' },
  h('div', { class: 'ico', html: `<svg viewBox="0 0 48 48"><use href="#i-${c.icon}"/></svg>` }),
  h('h3', {}, c.title), h('p', { class: 'sub' }, c.sub),
  h('p', {}, h('b', {}, 'What’s known: '), c.know),
  h('p', {}, h('b', {}, 'To find out: '), c.find),
  h('p', { class: 'ask' }, h('b', {}, 'Ask: '), c.ask))));

// ---- checklist (progress saved in this browser)
const CK = 'vansh-checklist-v1';
let done = new Set(); try { done = new Set(JSON.parse(localStorage.getItem(CK) || '[]')); } catch {}
const ckBox = $('#checklist');
function paintProgress() {
  const pct = Math.round((done.size / CHECKLIST.length) * 100);
  $('#ckBar').style.width = `${pct}%`; $('#ckPct').textContent = `${done.size} / ${CHECKLIST.length} done`;
}
CHECKLIST.forEach((it) => {
  const cb = h('input', { type: 'checkbox', id: it.id }); cb.checked = done.has(it.id);
  cb.addEventListener('change', () => { cb.checked ? done.add(it.id) : done.delete(it.id); try { localStorage.setItem(CK, JSON.stringify([...done])); } catch {} paintProgress(); });
  ckBox.append(h('li', { class: 'reveal' }, h('label', { for: it.id }, cb, h('span', { class: 'tick' }), h('span', { class: 'txt' }, h('b', {}, it.t), h('small', {}, it.tip)))));
});
paintProgress();

// ---- interview questions
const qBox = $('#interviews');
INTERVIEWS.forEach((grp, i) => qBox.append(h('details', { class: 'qgrp reveal', open: i === 0 }, h('summary', {}, grp.g, h('span', {}, `${grp.q.length}`)), h('ol', {}, grp.q.map((q) => h('li', {}, q))))));
$('#copyQs').addEventListener('click', async () => {
  const text = INTERVIEWS.map((g) => `${g.g.toUpperCase()}\n${g.q.map((q, i) => `${i + 1}. ${q}`).join('\n')}`).join('\n\n');
  toast((await copyText(text)) ? 'Questions copied — print or share them' : 'Copy failed', 'ok');
});

// ---- research prompt builder
const PK = 'vansh-prompt-v1';
let saved = {}; try { saved = JSON.parse(localStorage.getItem(PK) || '{}'); } catch {}
const pform = $('#promptForm'); const pout = $('#promptOut');
const inputs = {};
for (const f of PROMPT_FIELDS) {
  const el = h(f.area ? 'textarea' : 'input', { id: `pf-${f.key}`, placeholder: f.ph, ...(f.area ? { rows: 3 } : { type: 'text' }) });
  el.value = saved[f.key] ?? store.data.meta[f.key] ?? '';
  el.addEventListener('input', paintPrompt);
  inputs[f.key] = el;
  pform.append(h('label', { class: 'field' }, h('span', {}, f.label), el, f.hint && h('small', {}, f.hint)));
}
function promptValues() { return Object.fromEntries(Object.entries(inputs).map(([k, el]) => [k, el.value])); }
function paintPrompt() {
  const vals = promptValues();
  try { localStorage.setItem(PK, JSON.stringify(vals)); } catch {}
  pout.textContent = buildPrompt(vals);
  const filled = Object.values(vals).filter((v) => v.trim()).length;
  $('#promptFill').textContent = `${filled} / ${PROMPT_FIELDS.length} fields filled`;
}
paintPrompt();
$('#copyPrompt').addEventListener('click', async () => toast((await copyText(pout.textContent)) ? 'Prompt copied — paste it into your AI assistant' : 'Copy failed', 'ok'));
$('#dlPrompt').addEventListener('click', () => download('ancestry-research-prompt.md', `# Ancestry research prompt\n\n\`\`\`text\n${pout.textContent}\`\`\`\n`, 'text/markdown'));
$('#fillFromTree').addEventListener('click', () => {
  inputs.generations.value = generationsFromTree(store.data.roots);
  const m = store.data.meta; for (const k of ['nuk', 'community', 'gam', 'kuldevi', 'location']) if (m[k] && !inputs[k].value) inputs[k].value = m[k];
  paintPrompt(); toast('Filled from your family tree', 'ok');
});
$('#resetPrompt').addEventListener('click', () => { Object.values(inputs).forEach((el) => (el.value = '')); paintPrompt(); });
$('#saveToTree').addEventListener('click', () => {
  if (!store.editing) { toast('Only the admin can save these details to the site'); return; }
  const v = promptValues(); store.updateMeta({ nuk: v.nuk, community: v.community, gam: v.gam, kuldevi: v.kuldevi, location: v.location });
  toast('Saved to the family card', 'ok');
});

// ======================================================================= atmosphere
// scroll reveal
const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
$$('.reveal').forEach((el, i) => { el.style.setProperty('--i', i % 6); io.observe(el); });

// nav highlight + shrink
const links = $$('.topnav a[href^="#"]');
const secs = links.map((a) => $(a.getAttribute('href'))).filter(Boolean);
const spy = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) links.forEach((a) => a.classList.toggle('on', a.getAttribute('href') === `#${e.target.id}`)); }), { rootMargin: '-45% 0px -50% 0px' });
secs.forEach((s) => spy.observe(s));
addEventListener('scroll', () => $('.topnav').classList.toggle('solid', scrollY > 40), { passive: true });

// journey line draws as you scroll
const tl = $('#timeline');
function paintTimeline() {
  const r = tl.getBoundingClientRect(); const vh = innerHeight;
  const p = Math.max(0, Math.min(1, (vh * 0.7 - r.top) / (r.height + vh * 0.1)));
  tl.style.setProperty('--p', p.toFixed(3));
}
addEventListener('scroll', paintTimeline, { passive: true }); paintTimeline();

// drifting embers
(function embers() {
  const c = $('#embers'); if (!c || reducedMotion()) return;
  const ctx = c.getContext('2d'); let W, H, ps = [];
  const resize = () => { W = c.width = innerWidth; H = c.height = innerHeight; ps = Array.from({ length: Math.round(Math.min(70, W / 22)) }, () => spawn(true)); };
  const spawn = (any) => ({ x: Math.random() * W, y: any ? Math.random() * H : H + 10, r: 0.6 + Math.random() * 2.2, vy: 0.15 + Math.random() * 0.55, vx: (Math.random() - 0.5) * 0.3, ph: Math.random() * 6.28, hue: 28 + Math.random() * 22 });
  resize(); addEventListener('resize', debounce(resize, 200));
  let run = true; document.addEventListener('visibilitychange', () => { run = !document.hidden; if (run) loop(); });
  function loop() {
    if (!run) return;
    ctx.clearRect(0, 0, W, H);
    for (const p of ps) {
      p.y -= p.vy; p.x += p.vx + Math.sin(p.ph += 0.01) * 0.25;
      if (p.y < -10) Object.assign(p, spawn(false));
      const a = 0.25 + 0.35 * Math.sin(p.ph * 2); const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 6);
      g.addColorStop(0, `hsla(${p.hue},95%,65%,${a})`); g.addColorStop(1, `hsla(${p.hue},95%,55%,0)`);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 6, 0, 6.283); ctx.fill();
    }
    requestAnimationFrame(loop);
  }
  loop();
})();

// hero mandala follows the pointer slightly
const mand = $('#mandala');
addEventListener('pointermove', (e) => { if (scrollY < innerHeight && !reducedMotion()) mand.style.translate = `${(e.clientX / innerWidth - 0.5) * -22}px ${(e.clientY / innerHeight - 0.5) * -22}px`; }, { passive: true });
