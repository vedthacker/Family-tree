import { STATIC_PASSWORD_SHA256, STATIC_SALT } from './config.js';
import { $, download, toast } from './util.js';
import { countUnits } from './panel.js';

const TOKEN_KEY = 'vansh-admin-token';

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Resize to a square-ish JPEG so the tree stays light. */
export async function resizeImage(file, size = 560) {
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) throw new Error('That file could not be read as an image');
  const side = Math.min(bmp.width, bmp.height);
  const sx = (bmp.width - side) / 2, sy = Math.max(0, (bmp.height - side) / 2 - side * 0.06); // slight upward bias keeps faces in frame
  const out = Math.min(size, side);
  const c = Object.assign(document.createElement('canvas'), { width: out, height: out });
  c.getContext('2d').drawImage(bmp, sx, sy, side, side, 0, 0, out, out);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Image conversion failed'))), 'image/jpeg', 0.86));
}

const blobToDataURL = (blob) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); });

export class Admin {
  constructor({ store, tree, panel }) {
    this.store = store; this.tree = tree; this.panel = panel;
    this.active = false;
    this.bar = $('#adminBar'); this.loginDlg = $('#loginDlg'); this.detailsDlg = $('#detailsDlg');
    this.#wire();
    // Resume an unexpired session in this tab
    const t = sessionStorage.getItem(TOKEN_KEY);
    if (t && store.mode === 'server') this.#enable(t, true);
    else if (t && store.mode === 'static') this.#enable('static', true);
  }

  // ---------- secret entrances ----------
  openLogin() {
    if (this.active) { this.bar.scrollIntoView?.({ block: 'nearest' }); return; }
    this.loginDlg.showModal();
    $('#pw').value = ''; $('#loginErr').textContent = '';
    setTimeout(() => $('#pw').focus(), 50);
  }

  async #login(password) {
    if (this.store.mode === 'server') {
      const r = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Login failed');
      return j.token;
    }
    if ((await sha256(STATIC_SALT + password)) !== STATIC_PASSWORD_SHA256) { await new Promise((r) => setTimeout(r, 500)); throw new Error('Wrong password'); }
    return 'static';
  }

  #enable(token, silent = false) {
    this.active = true;
    sessionStorage.setItem(TOKEN_KEY, token);
    this.store.setEditing(true, token);
    this.tree.setEditing(true); this.panel.setEditing(true);
    document.body.classList.add('admin');
    this.bar.hidden = false;
    $('#modeNote').textContent = this.store.mode === 'server'
      ? 'Changes save automatically and everyone sees them.'
      : 'Static mode: changes are saved in THIS browser only — use Export → JSON to publish.';
    this.#syncButtons();
    if (!silent) { toast('Admin mode on — click any card to edit, drag cards to rearrange.'); this.store.setStatus('saved'); }
    $('#tree').scrollIntoView({ behavior: 'smooth' });
  }

  async logout() {
    if (this.store.mode === 'static' || this.store.status === 'dirty') await this.store.save();
    this.active = false;
    sessionStorage.removeItem(TOKEN_KEY);
    this.store.setEditing(false);
    this.tree.setEditing(false); this.panel.setEditing(false);
    document.body.classList.remove('admin');
    this.bar.hidden = true;
    if (/admin/.test(location.hash + location.pathname)) history.replaceState(null, '', location.pathname.replace(/\/admin\/?$/, '/') + '#tree');
    toast('Logged out');
  }

  // ---------- photo helper (used by panel & drag-drop) ----------
  async uploadPhoto(file) {
    const blob = await resizeImage(file);
    if (this.store.mode === 'server') {
      const r = await fetch('/api/upload', { method: 'POST', headers: { 'Content-Type': blob.type, Authorization: `Bearer ${this.store.token}` }, body: blob });
      const j = await r.json().catch(() => ({}));
      if (r.status === 401) { this.store.setStatus('auth', 'Session expired'); throw new Error('Session expired — log in again'); }
      if (!r.ok) throw new Error(j.error || 'Upload failed');
      return j.url;
    }
    return blobToDataURL(blob); // static mode: embed in the JSON
  }

  // ---------- UI ----------
  #wire() {
    $('#loginForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = e.submitter; btn.disabled = true; $('#loginErr').textContent = '';
      try { const token = await this.#login($('#pw').value); this.loginDlg.close(); this.#enable(token); }
      catch (err) { $('#loginErr').textContent = err.message; }
      finally { btn.disabled = false; }
    });
    $('#loginCancel').addEventListener('click', () => { this.loginDlg.close(); if (location.hash === '#admin') history.replaceState(null, '', location.pathname); });

    // Secret entrances: /admin, #admin, Ctrl/Cmd+Shift+A, or triple-click the footer emblem
    const check = () => { if (/\/admin\/?$/.test(location.pathname) || location.hash === '#admin') this.openLogin(); };
    addEventListener('hashchange', check); check();
    addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'a') { e.preventDefault(); this.openLogin(); } });
    $('#secretEmblem')?.addEventListener('click', (e) => { if (e.detail >= 3) this.openLogin(); });

    $('#btnUndo').addEventListener('click', () => this.store.undo());
    $('#btnRedo').addEventListener('click', () => this.store.redo());
    $('#btnAddRoot').addEventListener('click', () => { const u = this.store.addRoot(); this.#reveal(u.id, u.people[0].id); });
    $('#btnLogout').addEventListener('click', () => this.logout());
    $('#btnDetails').addEventListener('click', () => this.openDetails());
    $('#btnDetails2').addEventListener('click', () => this.openDetails());
    addEventListener('keydown', (e) => {
      if (!this.active || !(e.ctrlKey || e.metaKey) || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) return;
      if (e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? this.store.redo() : this.store.undo(); }
      if (e.key.toLowerCase() === 'y') { e.preventDefault(); this.store.redo(); }
    });

    $('#exportJson').addEventListener('click', () => download('family-tree.json', JSON.stringify(this.store.data, null, 2), 'application/json'));
    $('#exportFlat').addEventListener('click', () => download('family-nodes.json', JSON.stringify(this.store.flatten(), null, 2), 'application/json'));
    $('#exportCsv').addEventListener('click', () => download('family-nodes.csv', this.store.toCSV(), 'text/csv'));
    $('#exportGed').addEventListener('click', () => download('family-tree.ged', this.store.toGEDCOM(), 'text/plain'));
    $('#importJson').addEventListener('change', async (e) => {
      const f = e.target.files[0]; e.target.value = ''; if (!f) return;
      try {
        const data = JSON.parse(await f.text());
        if (!Array.isArray(data.roots)) throw new Error('This file is not a Vansh Vruksh tree export');
        if (!confirm(`Replace the current tree with the imported one (${countUnits(data.roots)} family units)? You can undo this.`)) return;
        this.store.replaceAll(data); this.tree.fit(); toast('Tree imported');
      } catch (err) { toast(err.message || 'Import failed', 'err'); }
    });

    // save-status pill
    const pill = $('#saveState');
    this.store.addEventListener('status', (e) => {
      const { status, msg } = e.detail;
      const text = { dirty: 'Unsaved changes…', saving: 'Saving…', saved: 'All changes saved', local: 'Saved in this browser', error: msg || 'Save failed', auth: msg }[status];
      pill.textContent = text || ''; pill.dataset.s = status;
      if (status === 'auth') { this.logout(); setTimeout(() => this.openLogin(), 400); }
    });
    const syncUndo = () => this.#syncButtons();
    this.store.addEventListener('change', syncUndo);
    addEventListener('beforeunload', (e) => { if (this.active && ['dirty', 'saving', 'error'].includes(this.store.status)) { e.preventDefault(); e.returnValue = ''; } });

    // family details dialog
    $('#detailsForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      this.store.updateMeta(Object.fromEntries([...fd.entries()].map(([k, v]) => [k, String(v).trim()])));
      this.detailsDlg.close();
    });
    $('#detailsCancel').addEventListener('click', () => this.detailsDlg.close());
  }

  #syncButtons() { $('#btnUndo').disabled = !this.store.canUndo; $('#btnRedo').disabled = !this.store.canRedo; }

  openDetails() {
    const m = this.store.data.meta; const f = $('#detailsForm');
    for (const el of f.elements) if (el.name) el.value = m[el.name] || '';
    this.detailsDlg.showModal();
  }

  /** After creating a node: pan to it and open its editor. */
  #reveal(unitId, pid) {
    requestAnimationFrame(() => { this.panel.open(pid); this.tree.focus(unitId, Math.max(0.85, this.tree.view.k)); setTimeout(() => $('#f-name')?.select(), 400); });
  }
  reveal(unitId, pid) { this.#reveal(unitId, pid); }
}
