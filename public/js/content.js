// Static research content: archival checklist + elder-interview questions.

export const CHECKLIST = [
  { id: 'c1', t: 'Record the eldest relatives (audio/video) using the interview questions →', tip: 'Start with anyone over 70 — ask permission, keep each recording under an hour, and note the date and who was present.' },
  { id: 'c2', t: 'Find out who your family’s Barot (Vahivancha / Bhat) is', tip: 'Ask elders: “Who writes our vahi?” Lohana families traditionally have a hereditary Barot who visits for weddings and deaths and updates a genealogy register. Your village or Mahajan office can often name the Barot for your Nuk.' },
  { id: 'c3', t: 'Visit / write to the local Lohana Mahajan and Mahajanwadi', tip: 'Community halls in Kutch, Saurashtra and Mumbai hold member registers, donation ledgers, and old Vasti Patrak (community directories). Ask to see volumes from the 1950s–1990s.' },
  { id: 'c4', t: 'Collect home documents: school-leaving certificates, ration cards, passports, deeds', tip: 'A single school-leaving certificate gives father’s name, Nuk spelling, birthplace and date. Photograph both sides of everything.' },
  { id: 'c5', t: 'Gather wedding cards (lagna patrika), death notices (uthamna) & condolence books', tip: 'These list whole branches — maternal uncles (Mosal), in-laws and villages — often in one page.' },
  { id: 'c6', t: 'Check pilgrimage priests’ registers (Haridwar, Dwarka, Prayagraj, Gaya)', tip: 'Tirth purohits / pandas keep family vahis for pilgrims. Take a cousin’s or elder’s name and native village — they may find your lineage by village + Nuk.' },
  { id: 'c7', t: 'Search land & civic records', tip: 'Gujarat’s AnyROR portal (7/12 & 8-A land records), municipal birth/death registers, and village panchayat records name earlier owners and heirs.' },
  { id: 'c8', t: 'Read the colonial-era gazetteers & ethnographies', tip: 'Bombay Gazetteer (Cutch, Palanpur & Mahi Kantha; Kathiawar) and R. E. Enthoven’s “Tribes and Castes of the Bombay Presidency” describe the Lohana community — free on archive.org.' },
  { id: 'c9', t: 'Search FamilySearch, Geni, MyHeritage & community WhatsApp / Facebook groups', tip: 'Post your Nuk + native Gam; distant cousins often hold the missing page of the family album.' },
  { id: 'c10', t: 'Cross-check Kuldevi & Gotra with at least two elders / the Barot', tip: 'Traditions vary between branches — record every version and who told it, then reconcile.' },
  { id: 'c11', t: 'Photograph the old photos — and write names on the back (in pencil)', tip: 'Scan at 600 dpi if you can. Ask elders to name every face before it is too late.' },
  { id: 'c12', t: 'Enter everything in the tree and mark each item: verified / tradition / guess', tip: 'Use the “Their story” box to cite the source (“told by Hansa-ben, 2026”).' },
];

export const INTERVIEWS = [
  { g: 'Names & identity', q: [
    'What is our Nuk and how is it spelled/pronounced in Gujarati? Are there other versions you have heard (e.g. Khant / Khaant)?',
    'Does our family have a Gotra, and who told you? Do you know our Veda or Shakha?',
    'What were your parents’ and grandparents’ full names, including their fathers’ names and any nicknames (bapuji, ba, bhai, ben)?',
    'Which family was your mother from — what was her maiden Nuk and her village (Mosal)?',
  ] },
  { g: 'Place & migration', q: [
    'Which village or town did our family come from (Gam)? Do you remember the name of the street, wada or neighbourhood?',
    'Did the family ever speak of coming from Sindh or beyond? Who moved first, when and why — drought, trade, partition, a quarrel?',
    'Who was the first person to leave for Mumbai / Africa / the UK / elsewhere — and what do you remember of their journey?',
    'What languages were spoken at home (Kutchi, Gujarati, Sindhi, Swahili)? Any words that only our family uses?',
  ] },
  { g: 'Faith & ritual', q: [
    'Who is our Kuldevi / Kuldevta? Where is the main shrine and when did the family last visit? Is there a family ritual there (jaadar, bhadarvi, mundan)?',
    'Do we have an Ishta Devta, a family temple or a samadhi? Do we follow Jalaram Bapa, Jhulelal, Swaminarayan, or another tradition?',
    'What ceremonies are unique to us — a special sweet, a taboo, a fast, a song at weddings?',
  ] },
  { g: 'Records & stories', q: [
    'Who is our Barot? Where does he/she live and when did the Barot last write in our family’s book?',
    'What did our ancestors do for a living — trader, shopkeeper, farmer, clerk, shipping agent? Did they own a shop or a boat?',
    'What is the oldest family story you know — about a flood, an earthquake (1819 or 1956 Anjar?), a famine, or a famous relative?',
    'Do you have any old letters, ledgers, photographs, jewellery inscriptions or documents? May we photograph them?',
    'Who else should we talk to — which cousins or elders hold different parts of the story?',
  ] },
];

export const LINEAGE_CARDS = [
  { icon: 'nuk', title: 'The Nuk', sub: 'Clan name', know: 'Lohana families belong to hereditary clans called Nuk (also spelled Nukh), traditionally exogamous — marriages are arranged outside one’s own Nuk. Nuks often come from an ancestor’s name, title, trade or village.', find: 'Meaning and spelling variants of your Nuk, the founding ancestor or place, and the earliest Gam where it appears.', ask: 'Barot / Vahivancha · Lohana Mahajan registers · eldest members of the Nuk' },
  { icon: 'gotra', title: 'Gotra · Veda · Shakha', sub: 'Ritual descent', know: 'Brahmanical Gotra is used in Lohana rites such as weddings and shraddha. Different Lohana branches record different Gotras, so published lists disagree.', find: 'The Gotra pronounced by your family priest (Gor) at weddings and shraddha, plus Veda/Shakha if recorded.', ask: 'Family priest (Gor) · wedding vidhi notes · Barot books' },
  { icon: 'devi', title: 'Kuldevi', sub: 'Family goddess', know: 'The Kuldevi is inherited through the paternal line and normally means one specific shrine. Names often heard in Lohana families include Ashapura Mata, Randal Mata, Ambaji, Momai Mata and Hinglaj Mata — this is a list of possibilities, not a prediction for your family.', find: 'The exact deity, shrine (sthanak), and the ritual the family performs there (jaadar, bhadarvi, mundan, naivedya).', ask: 'Father’s side elders · temple pujaris at the suspected shrine · Barot' },
  { icon: 'isht', title: 'Ishta Devta & Sthanak', sub: 'Revered saints and shrines', know: 'Beyond the Kuldevi, Lohana families widely revere Pujya Jalaram Bapa (Virpur, 1799–1881) and, among Sindh-rooted families, Jhulelal / Uderolal. Many also follow Swaminarayan or Vaishnava traditions.', find: 'Which of these your family actually follows, any family temples, and annual pilgrimages.', ask: 'Elders · Mahajan temple trusts · community Sthanak registers' },
];
