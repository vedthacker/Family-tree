import { esc, h, lifeSpan, safeSrc, toast } from './util.js';

const GENDERS = [['', '—'], ['M', 'Male'], ['F', 'Female'], ['O', 'Other']];

/** Slide-in drawer: read-only profile for visitors, full editor for the admin. */
export class Panel {
  constructor(root, store, tree, { uploadPhoto }) {
    this.root = root; this.store = store; this.tree = tree; this.uploadPhoto = uploadPhoto;
    this.pid = null; this.editing = false;
    root.addEventListener('click', (e) => {
      if (e.target.closest('[data-close]')) this.close();
      const chip = e.target.closest('[data-goto]');
      if (chip) this.open(chip.dataset.goto, true);
    });
    store.addEventListener('change', (ev) => {
      if (!this.pid) return;
      if (ev.detail.source === 'panel') { this.#syncHeading(); return; }
      this.render();
    });
  }

  setEditing(on) { this.editing = on; if (this.pid) this.render(); }
  get isOpen() { return !!this.pid; }

  open(pid, focus = false) {
    const f = this.store.findPerson(pid); if (!f) return;
    this.pid = pid;
    this.tree.select(pid);
    this.root.classList.add('open'); this.tree.panelOpen = true;
    this.render();
    if (focus) this.tree.focus(f.unit.id);
  }
  close() {
    this.pid = null; this.tree.select(null); this.tree.panelOpen = false;
    this.root.classList.remove('open');
  }

  #syncHeading() {
    const f = this.store.findPerson(this.pid); if (!f) return;
    const t = this.root.querySelector('[data-live="title"]');
    if (t) t.textContent = f.person.name || 'Unnamed';
    const l = this.root.querySelector('[data-live="life"]');
    if (l) l.textContent = lifeSpan(f.person);
  }

  render() {
    const f = this.store.findPerson(this.pid);
    if (!f) { this.close(); return; }
    this.root.replaceChildren(this.editing ? this.#editor(f) : this.#profile(f));
    this.root.scrollTop = 0;
  }

  // ---------- relatives ----------
  #relatives(f) {
    const { person, unit, parent } = f;
    const chips = (title, people) => people.length && h('div', { class: 'rel' }, h('h4', {}, title),
      h('div', { class: 'chips' }, people.map((p) => h('button', { class: 'chip', 'data-goto': p.id }, p.name || 'Unnamed'))));
    const spouse = unit.people.filter((p) => p.id !== person.id);
    const isBlood = unit.people[0].id === person.id;
    const parents = isBlood && parent ? parent.people : [];
    const kids = unit.children.map((c) => c.people[0]);
    const sibs = isBlood ? (this.store.find(unit.id).list.filter((u) => u.id !== unit.id).map((u) => u.people[0])) : [];
    return h('div', { class: 'rels' },
      chips('Parents', parents), chips(spouse.length ? 'Spouse' : '', spouse), chips('Siblings', sibs), chips('Children', kids));
  }

  #photo(p, big = true) {
    const src = safeSrc(p.photo);
    return h('div', { class: `pp-photo ${big ? 'big' : ''}` }, src ? h('img', { src, alt: p.name }) : h('div', { class: 'pp-ph', html: `<span>${esc((p.name || '?').trim()[0] || '?')}</span>` }));
  }

  // ---------- visitor profile ----------
  #profile(f) {
    const { person: p } = f; const m = this.store.data.meta;
    const facts = [['Born', p.born], ['Died', p.died], ['Birthplace / Gam', p.place], ['Nuk', m.nuk], ['Kuldevi', m.kuldevi]].filter(([, v]) => v);
    return h('div', { class: 'pp' },
      h('button', { class: 'pp-x', 'data-close': '', 'aria-label': 'Close' }, '×'),
      this.#photo(p),
      h('h3', { 'data-live': 'title' }, p.name || 'Unnamed'),
      p.nick && h('p', { class: 'pp-nick' }, `“${p.nick}”`),
      h('p', { class: 'pp-life', 'data-live': 'life' }, lifeSpan(p)),
      facts.length > 0 && h('dl', { class: 'pp-facts' }, facts.map(([k, v]) => [h('dt', {}, k), h('dd', {}, v)])),
      h('div', { class: 'pp-about' }, p.about
        ? p.about.split(/\n{2,}/).map((para) => h('p', {}, para))
        : h('p', { class: 'muted' }, 'No story added yet. Ask the family elders — every detail matters.')),
      this.#relatives(f));
  }

  // ---------- admin editor ----------
  #editor(f) {
    const { person: p, unit } = f;
    const field = (label, key, { area = false, ph = '', type = 'text' } = {}) => {
      const input = h(area ? 'textarea' : 'input', { id: `f-${key}`, placeholder: ph, ...(area ? { rows: 6 } : { type, autocomplete: 'off' }) });
      input.value = p[key] || '';
      input.addEventListener('input', () => this.store.updatePerson(p.id, { [key]: input.value }));
      return h('label', { class: 'field' }, h('span', {}, label), input);
    };
    const gender = h('select', { id: 'f-gender' }, GENDERS.map(([v, l]) => h('option', { value: v, selected: p.gender === v }, l)));
    gender.addEventListener('change', () => this.store.updatePerson(p.id, { gender: gender.value }, `g:${p.id}`));

    const file = h('input', { type: 'file', accept: 'image/*', hidden: true });
    file.addEventListener('change', async () => { if (file.files[0]) await this.#setPhoto(p.id, file.files[0]); });
    const photoBox = h('div', { class: 'ed-photo' },
      this.#photo(p, false),
      h('div', { class: 'ed-photo-btns' },
        h('button', { class: 'btn small', type: 'button', onclick: () => file.click() }, p.photo ? 'Change photo' : 'Upload photo'),
        p.photo && h('button', { class: 'btn small ghost', type: 'button', onclick: () => { this.store.updatePerson(p.id, { photo: '' }, `ph:${p.id}`); this.render(); } }, 'Remove'),
        h('small', {}, 'or drop an image onto the card'),
        file));

    const siblingInfo = unit.people.length === 2 ? h('div', { class: 'ed-switch' },
      unit.people.map((q) => h('button', { class: `chip ${q.id === p.id ? 'on' : ''}`, 'data-goto': q.id }, q.name || 'Unnamed'))) : null;

    const actions = h('div', { class: 'ed-actions' },
      h('button', { class: 'btn small', onclick: () => this.#add('sib-l') }, '← Sibling'),
      h('button', { class: 'btn small', onclick: () => this.#add('sib-r') }, 'Sibling →'),
      h('button', { class: 'btn small', onclick: () => this.#add('child') }, '↓ Child'),
      unit.people.length < 2 && h('button', { class: 'btn small', onclick: () => this.#add('spouse') }, '⚭ Spouse'));

    return h('div', { class: 'pp editor' },
      h('button', { class: 'pp-x', 'data-close': '', 'aria-label': 'Close' }, '×'),
      h('p', { class: 'eyebrow' }, 'Editing'),
      h('h3', { 'data-live': 'title' }, p.name || 'Unnamed'),
      h('p', { class: 'pp-life', 'data-live': 'life' }, lifeSpan(p)),
      siblingInfo,
      photoBox,
      field('Full name (include father’s / husband’s name)', 'name', { ph: 'e.g. Ramji Hirji Thakkar' }),
      field('Alias / nickname', 'nick', { ph: 'e.g. Bapuji, Ben, Kaka' }),
      h('div', { class: 'two' }, h('label', { class: 'field' }, h('span', {}, 'Gender'), gender), field('Born (year or date)', 'born', { ph: '1948 or c. 1900s' })),
      field('Died (leave blank if living)', 'died', { ph: '2011' }),
      field('Birthplace / ancestral Gam', 'place', { ph: 'e.g. Mandvi, Kutch' }),
      field('Their story', 'about', { area: true, ph: 'Occupation, migration story, notable deeds, memories, Mosal (maternal family) …' }),
      h('p', { class: 'eyebrow' }, 'Grow the tree from here'),
      actions,
      h('button', { class: 'btn danger small', onclick: () => this.#remove(f) }, unit.people.length === 2 ? 'Remove this person' : 'Delete this branch'));
  }

  async #setPhoto(pid, file) {
    try {
      toast('Preparing photo…');
      const url = await this.uploadPhoto(file);
      this.store.updatePerson(pid, { photo: url }, `ph:${pid}`);
      this.render();
    } catch (e) { toast(e.message || 'Photo upload failed', 'err'); }
  }

  #add(act) {
    const id = this.store.findPerson(this.pid).unit.id;
    this.tree.dispatchEvent(new CustomEvent('action', { detail: { act, unitId: id } }));
  }

  #remove(f) {
    const kids = f.unit.people.length === 1 ? countUnits(f.unit.children) : 0;
    const msg = f.unit.people.length === 2
      ? `Remove ${f.person.name || 'this person'} from this couple?`
      : `Delete ${f.person.name || 'this person'}${kids ? ` and ${kids} descendant branch${kids > 1 ? 'es' : ''}` : ''}?`;
    if (!confirm(msg)) return;
    const pid = f.person.id; this.close();
    this.store.removePerson(pid);
  }
}

export const countUnits = (list) => list.reduce((n, u) => n + 1 + countUnits(u.children), 0);
