// Generates public/data/family.json — a SAMPLE tree shaped like the photo wall.
// Replace the placeholder names from the secret admin page.
import fs from 'node:fs';
let n = 0;
const P = (name, gender, extra = {}) => ({ id: `p${++n}`, name, nick: '', gender, born: '', died: '', place: '', about: '', photo: '', ...extra });
const U = (people, children = []) => ({ id: `u${n}-${Math.random().toString(36).slice(2, 6)}`, people, children });

const roots = [
  U([P('Grandfather (maternal side)', 'M'), P('Grandmother (maternal side)', 'F')], [
    U([P('Daughter 1', 'F'), P('Son-in-law 1', 'M')], [U([P('Grandchild 1', 'M')]), U([P('Grandchild 2', 'F')])]),
    U([P('Son 2', 'M'), P('Daughter-in-law 2', 'F')], [U([P('Grandchild 3', 'F')])]),
    U([P('Daughter 3', 'F'), P('Son-in-law 3', 'M')], []),
  ]),
  U([P('Dada', 'M', { nick: 'Patriarch', about: 'Replace this sample text with the real story: where he was born, his work, the village he came from, the stories the family tells about him.' }), P('Dadi', 'F', { nick: 'Matriarch' })], [
    U([P('Son 1', 'M'), P('Daughter-in-law 1', 'F')], [U([P('Grandchild 4', 'M')]), U([P('Grandchild 5', 'F')])]),
    U([P('Daughter 2', 'F'), P('Son-in-law 2', 'M')], [U([P('Grandchild 6', 'M')]), U([P('Grandchild 7', 'F')])]),
    U([P('Son 3', 'M'), P('Daughter-in-law 3', 'F')], [U([P('Grandchild 8', 'M')], [U([P('Great-grandchild 1', 'F')])])]),
    U([P('Daughter 4', 'F'), P('Son-in-law 4', 'M')], [U([P('Grandchild 9', 'F')])]),
    U([P('Son 5', 'M'), P('Daughter-in-law 5', 'F')], [U([P('Grandchild 10', 'M')]), U([P('Grandchild 11', 'F')])]),
  ]),
];
// make every id unique & stable
let k = 0; (function fix(list) { for (const u of list) { u.id = `u${++k}`; fix(u.children); } })(roots);

const data = {
  meta: {
    title: 'Our Family Tree',
    tagline: 'Every thread on this wall is a story. Here is where ours begins.',
    nuk: '', gotra: '', kuldevi: '', gam: '', community: 'Lohana (Raghuvanshi)', location: '',
    updated: '',
  },
  roots,
};
fs.writeFileSync(new URL('../public/data/family.json', import.meta.url), JSON.stringify(data, null, 2));
console.log('seed written:', n, 'people');
