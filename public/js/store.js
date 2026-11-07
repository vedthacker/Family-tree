import { uid } from './util.js';

const DRAFT_KEY = 'vansh-vruksh-draft-v1';

export const blankPerson = (o = {}) => ({ id: uid('p'), name: '', nick: '', gender: '', born: '', died: '', place: '', about: '', photo: '', ...o });
export const blankUnit = (people) => ({ id: uid('u'), people: people || [blankPerson({ name: 'New member' })], children: [] });

export class Store extends EventTarget {
  data = null;
  mode = 'static'; // 'server' | 'static'
  token = '';
  editing = false;
  usingDraft = false;
  #undo = []; #redo = []; #lastKey = ''; #lastAt = 0; #saveTimer = 0;

  async load() {
    try {
      const r = await fetch('/api/tree', { cache: 'no-store' });
      if (!r.ok) throw new Error('no api');
      this.data = await r.json();
      this.mode = 'server';
    } catch {
      const r = await fetch('data/family.json', { cache: 'no-store' });
      this.data = await r.json();
      this.mode = 'static';
      try {
        const draft = localStorage.getItem(DRAFT_KEY);
        if (draft) { this.data = JSON.parse(draft); this.usingDraft = true; }
      } catch {}
    }
    this.data.meta ||= {};
    this.data.roots ||= [];
  }

  emit(source = 'store') { this.dispatchEvent(new CustomEvent('change', { detail: { source } })); }
  setStatus(status, msg = '') { this.status = status; this.dispatchEvent(new CustomEvent('status', { detail: { status, msg } })); }

  /** Run a mutation with undo support. Repeated edits with the same `key` within 1.5s share one undo step. */
  mutate(fn, { key = '', source = 'store' } = {}) {
    const snap = JSON.stringify(this.data);
    const now = Date.now();
    const coalesce = key && key === this.#lastKey && now - this.#lastAt < 1500;
    const result = fn();
    if (!coalesce) { this.#undo.push(snap); if (this.#undo.length > 150) this.#undo.shift(); }
    this.#redo = []; this.#lastKey = key; this.#lastAt = now;
    this.#touch(); this.emit(source);
    return result;
  }
  get canUndo() { return this.#undo.length > 0; }
  get canRedo() { return this.#redo.length > 0; }
  undo() { if (!this.#undo.length) return; this.#redo.push(JSON.stringify(this.data)); this.data = JSON.parse(this.#undo.pop()); this.#lastKey = ''; this.#touch(); this.emit('undo'); }
  redo() { if (!this.#redo.length) return; this.#undo.push(JSON.stringify(this.data)); this.data = JSON.parse(this.#redo.pop()); this.#lastKey = ''; this.#touch(); this.emit('undo'); }
  replaceAll(data) { this.mutate(() => { this.data = data; this.data.meta ||= {}; this.data.roots ||= []; }); }

  setEditing(on, token = '') { this.editing = on; this.token = on ? token : ''; if (!on) clearTimeout(this.#saveTimer); }

  #touch() {
    this.data.meta.updated = new Date().toISOString();
    if (!this.editing) return;
    this.setStatus('dirty');
    clearTimeout(this.#saveTimer);
    this.#saveTimer = setTimeout(() => this.save(), 900);
  }

  async save() {
    clearTimeout(this.#saveTimer);
    if (!this.editing) return;
    if (this.mode === 'server') {
      this.setStatus('saving');
      try {
        const r = await fetch('/api/tree', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.token}` },
          body: JSON.stringify(this.data),
        });
        if (r.status === 401) { this.setStatus('auth', 'Session expired — please log in again'); return; }
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.statusText);
        this.setStatus('saved');
      } catch (e) { this.setStatus('error', e.message); }
    } else {
      try { localStorage.setItem(DRAFT_KEY, JSON.stringify(this.data)); this.usingDraft = true; this.setStatus('local'); }
      catch { this.setStatus('error', 'Browser storage is full — export JSON to keep your work'); }
    }
  }
  discardDraft() { try { localStorage.removeItem(DRAFT_KEY); } catch {} }

  // ---------- queries ----------
  find(id) {
    const walk = (list, parent, depth) => {
      for (let i = 0; i < list.length; i++) {
        const unit = list[i];
        if (unit.id === id) return { unit, list, index: i, parent, depth };
        const r = walk(unit.children, unit, depth + 1);
        if (r) return r;
      }
      return null;
    };
    return walk(this.data.roots, null, 0);
  }
  findPerson(pid) {
    let out = null;
    const walk = (list, parent, depth) => {
      for (const unit of list) {
        const person = unit.people.find((p) => p.id === pid);
        if (person) { out = { person, unit, parent, depth }; return true; }
        if (walk(unit.children, unit, depth + 1)) return true;
      }
      return false;
    };
    walk(this.data.roots, null, 0);
    return out;
  }
  descendantIds(unitId) {
    const f = this.find(unitId); const ids = new Set();
    const walk = (u) => { ids.add(u.id); u.children.forEach(walk); };
    if (f) walk(f.unit);
    return ids;
  }
  ancestorIds(unitId) {
    const chain = []; let f = this.find(unitId);
    while (f && f.parent) { chain.push(f.parent.id); f = this.find(f.parent.id); }
    return chain;
  }
  stats() {
    let people = 0, units = 0, couples = 0, depth = 0;
    const walk = (list, d) => { for (const u of list) { units++; people += u.people.length; if (u.people.length === 2) couples++; depth = Math.max(depth, d + 1); walk(u.children, d + 1); } };
    walk(this.data.roots, 0);
    return { people, units, couples, generations: depth };
  }

  // ---------- tree operations ----------
  addSibling(id, side) {
    return this.mutate(() => { const f = this.find(id); const u = blankUnit(); f.list.splice(f.index + (side === 'right' ? 1 : 0), 0, u); return u; });
  }
  addChild(id) {
    return this.mutate(() => { const f = this.find(id); const u = blankUnit(); f.unit.children.push(u); return u; });
  }
  addRoot() {
    return this.mutate(() => { const u = blankUnit([blankPerson({ name: 'Ancestor' })]); this.data.roots.push(u); return u; });
  }
  addSpouse(id) {
    return this.mutate(() => {
      const f = this.find(id); if (f.unit.people.length >= 2) return null;
      const g = f.unit.people[0].gender;
      const sp = blankPerson({ name: 'Spouse', gender: g === 'M' ? 'F' : g === 'F' ? 'M' : '' });
      f.unit.people.push(sp); return sp;
    });
  }
  removePerson(pid) {
    const f = this.findPerson(pid); if (!f) return;
    if (f.unit.people.length === 2) this.mutate(() => { f.unit.people = f.unit.people.filter((p) => p.id !== pid); });
    else this.deleteUnit(f.unit.id);
  }
  deleteUnit(id) {
    this.mutate(() => { const f = this.find(id); if (f) f.list.splice(f.index, 1); });
  }
  swap(id) { this.mutate(() => { const f = this.find(id); if (f && f.unit.people.length === 2) f.unit.people.reverse(); }); }
  /** zone: 'before' | 'after' | 'child' */
  move(id, targetId, zone) {
    if (id === targetId || this.descendantIds(id).has(targetId)) return false;
    this.mutate(() => {
      const f = this.find(id);
      f.list.splice(f.index, 1);
      const t = this.find(targetId);
      if (zone === 'child') t.unit.children.push(f.unit);
      else t.list.splice(t.index + (zone === 'after' ? 1 : 0), 0, f.unit);
    });
    return true;
  }
  updatePerson(pid, patch, key) {
    this.mutate(() => { const f = this.findPerson(pid); if (f) Object.assign(f.person, patch); }, { key: key || `p:${pid}:${Object.keys(patch)}`, source: 'panel' });
  }
  updateMeta(patch) { this.mutate(() => Object.assign(this.data.meta, patch), { key: 'meta', source: 'meta' }); }

  // ---------- exports (matches the schema in the research prompt, section 3) ----------
  flatten() {
    const m = this.data.meta; const rows = [];
    const walk = (list, parent, depth) => {
      for (const u of list) {
        u.people.forEach((p, i) => {
          const other = u.people[1 - i];
          rows.push({
            node_id: p.id, full_name: p.name, nickname: p.nick, gender: p.gender, generation: depth + 1,
            birth: p.born, death: p.died, birthplace: p.place,
            gotra: m.gotra || '', nuk: m.nuk || '', kuldevi: m.kuldevi || '',
            spouse_id: other ? other.id : '',
            parent_ids: i === 0 && parent ? parent.people.map((x) => x.id) : [],
            children_ids: u.children.map((c) => c.people[0].id),
            notes: p.about,
          });
        });
        walk(u.children, u, depth + 1);
      }
    };
    walk(this.data.roots, null, 0);
    return rows;
  }
  toCSV() {
    const rows = this.flatten();
    const cols = Object.keys(rows[0] || { node_id: '' });
    const q = (v) => `"${(Array.isArray(v) ? v.join(';') : String(v ?? '')).replace(/"/g, '""')}"`;
    return '﻿' + [cols.join(','), ...rows.map((r) => cols.map((c) => q(r[c])).join(','))].join('\r\n');
  }
  toGEDCOM() {
    const m = this.data.meta; const out = ['0 HEAD', '1 SOUR VanshVruksh', '1 GEDC', '2 VERS 5.5.1', '2 FORM LINEAGE-LINKED', '1 CHAR UTF-8'];
    const idx = new Map(); let n = 0;
    const fams = []; // {id, unit, parentFamId}
    const famOfUnit = new Map();
    const walk = (list, parentFam) => {
      for (const u of list) {
        u.people.forEach((p) => idx.set(p.id, { n: ++n, famc: parentFam, fams: [] }));
        const fid = `F${fams.length + 1}`;
        fams.push({ id: fid, unit: u }); famOfUnit.set(u.id, fid);
        idx.get(u.people[0].id).fams.push(fid);
        if (u.people[1]) idx.get(u.people[1].id).fams.push(fid);
        walk(u.children, fid);
      }
    };
    walk(this.data.roots, null);
    const sur = m.nuk ? ` /${m.nuk}/` : '';
    const gedDate = (s) => String(s || '').trim();
    const note = (t) => String(t || '').split(/\r?\n/).flatMap((line, i) => (i === 0 ? [`1 NOTE ${line}`] : [`2 CONT ${line}`]));
    const people = []; const walkP = (list) => list.forEach((u) => { people.push(...u.people); walkP(u.children); }); walkP(this.data.roots);
    for (const p of people) {
      const e = idx.get(p.id);
      out.push(`0 @I${e.n}@ INDI`, `1 NAME ${p.name || 'Unknown'}${sur}`);
      if (p.nick) out.push(`2 NICK ${p.nick}`);
      if (['M', 'F'].includes(p.gender)) out.push(`1 SEX ${p.gender}`);
      if (p.born || p.place) { out.push('1 BIRT'); if (p.born) out.push(`2 DATE ${gedDate(p.born)}`); if (p.place) out.push(`2 PLAC ${p.place}`); }
      if (p.died) out.push('1 DEAT', `2 DATE ${gedDate(p.died)}`);
      if (p.about) out.push(...note(p.about));
      if (e.famc) out.push(`1 FAMC @${e.famc}@`);
      e.fams.forEach((f) => out.push(`1 FAMS @${f}@`));
    }
    for (const { id, unit } of fams) {
      out.push(`0 @${id}@ FAM`);
      const [a, b] = unit.people;
      const aIsWife = a.gender === 'F';
      out.push(`1 ${aIsWife ? 'WIFE' : 'HUSB'} @I${idx.get(a.id).n}@`);
      if (b) out.push(`1 ${aIsWife ? 'HUSB' : 'WIFE'} @I${idx.get(b.id).n}@`);
      unit.children.forEach((c) => out.push(`1 CHIL @I${idx.get(c.people[0].id).n}@`));
    }
    out.push('0 TRLR');
    return out.join('\r\n');
  }
}
