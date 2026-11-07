// Research prompt builder — pure module (no DOM) so scripts/build-prompt.mjs can reuse it.

export const PROMPT_FIELDS = [
  { key: 'nuk', label: 'Primary surname / Nuk', ph: 'e.g. Khant / Khaant', hint: 'The clan name as spoken in the family — list spelling variants too.' },
  { key: 'community', label: 'Broad community', ph: 'e.g. Kutchi Lohana / Halari Lohana / Gujarati Lohana' },
  { key: 'gam', label: 'Ancestral origin / native village (Gam)', ph: 'e.g. Mandvi, Kutch — or leave blank if unknown' },
  { key: 'kuldevi', label: 'Kuldevi / Kuldevta', ph: 'Leave blank if unknown — the AI will suggest possibilities' },
  { key: 'patriarch', label: 'Known patriarch / Generation 1', ph: 'Name, approximate era / year' },
  { key: 'generations', label: 'Successive generations', ph: 'Great-grandfather → Grandfather → Father → Siblings', area: true },
  { key: 'location', label: 'Current location', ph: 'e.g. Gandhidham / Mumbai / Diaspora' },
];

const v = (x, fallback) => (String(x ?? '').trim() || fallback);

export function buildPrompt(f = {}) {
  const nuk = v(f.nuk, '[Khant / Khaant — replace with your Nuk]');
  const nukShort = String(f.nuk || '').trim() ? f.nuk.trim() : '[Nuk]';
  return `Role: You are an expert genealogist, cultural anthropologist, and data architect specializing in Indian community lineages, specifically the Gujarati/Kutchi Lohana (Raghuvanshi) heritage.

Objective: Conduct an exhaustive, high-depth ethnographic and genealogical analysis for our family branch to prepare data for a digital genealogical tree.

Family Starting Data:
- Primary Surname / Nuk: ${nuk}
- Broad Community: ${v(f.community, 'Kutchi Lohana / Halari Lohana / Gujarati Lohana (please tell me which is most likely)')}
- Ancestral Origin / Native Village (Gam): ${v(f.gam, 'Unknown — please suggest likely villages/towns in Kutch or Saurashtra for this Nuk')}
- Kuldevi (Family Goddess) / Kuldevta: ${v(f.kuldevi, 'Unknown, please suggest possibilities')}
- Known Patriarch / Generation 1: ${v(f.patriarch, 'Unknown')}
- Successive Generations: ${v(f.generations, 'Unknown')}
- Current Location: ${v(f.location, 'Unknown')}

Please structure your response into the following clear sections:

1. ETYMOLOGY & ANCESTRAL LINEAGE (DEEP DIVE):
   - Historical origin and linguistic root of the Nuk "${nukShort}" (and its spelling variants).
   - Probable ancestor, title, profession, or geographic location that originated this specific Nuk.
   - Traditional Gotra, Veda, and Shakha associated with this lineage in Lohana community records (Barot/Vahivancha records).
   - Revered deities: Probable Kuldevi (Goddess), Ishta Devta, and regional shrines/temples (Sthanak) linked to this Nuk.

2. MIGRATION TIMELINE:
   - Reconstruct the historical trajectory of our specific group:
     * Phase 1: Northwestern frontier (Lohargadh/Punjab).
     * Phase 2: Sindh (trading hubs/Indus river belt).
     * Phase 3: Settlement in Kutch/Saurashtra (identify historical settlements).
     * Phase 4: Modern movements (internal migration or overseas diaspora).

3. DIGITAL GENEALOGICAL DATA STRUCTURE:
   - Provide a normalized data schema (ready to convert to JSON/CSV or import into family tree tools like Gramps/GEDCOM).
   - Format each family node with:
     * Node ID & Full Name (including middle/father's name & alias)
     * Gender & Generation Level
     * Vital dates (Birth/Death/Approximate Era)
     * Birthplace / Ancestral Gam
     * Gotra / Nuk / Kuldevi
     * Spouse (including maternal maiden surname/Mosal)
     * Parent IDs & Children IDs
     * Biographical notes (occupation, migration story, notable deeds)

4. ARCHIVAL "HUNT" & PRIMARY SOURCE CHECKLIST:
   - Where can we physically or digitally cross-verify undocumented generations?
   - Guidance on locating our traditional family Barot (Vahivancha/Bhat) and community records (Lohana Mahajan registers, regional community directories/Vasti Patrak).
   - What specific interview questions should we ask elderly living relatives to fill in missing gaps before finalizing the digital tree?

Ground rules for your answer (please follow strictly):
- Label every claim as one of: [DOCUMENTED] (name the source), [COMMUNITY TRADITION] (oral/popular accounts), or [SPECULATION] (your inference). Never present a tradition as proven fact.
- Do NOT invent names, dates, villages or records for our family. Where something is unknown, write "UNKNOWN — verify with: …" and say who/where to ask.
- If sources or traditions conflict (e.g. different Gotra or Kuldevi lists), show the competing versions rather than picking one silently.
- Give several plausible spellings/transliterations of every name (Gujarati, Sindhi/Lahnda, English) since records vary.
- Finish with a short list of the 10 most valuable next actions, ranked by effort vs. payoff.
`;
}

/** Build the "Successive generations" text from the live tree, e.g. "Dada & Dadi → Son 1 & Spouse → …". */
export function generationsFromTree(roots, maxLines = 12) {
  const name = (u) => u.people.map((p) => p.name || 'Unnamed').join(' & ');
  const lines = [];
  const walk = (list, depth) => {
    for (const u of list) {
      if (lines.length >= maxLines) return;
      lines.push(`${'  '.repeat(depth)}${depth ? '└ ' : ''}Gen ${depth + 1}: ${name(u)}${u.people[0].born ? ` (b. ${u.people[0].born})` : ''}`);
      walk(u.children, depth + 1);
    }
  };
  walk(roots, 0);
  return lines.join('\n');
}
