# Vansh Vruksh — our digital family tree

A heritage-themed, animated family tree for a Gujarati / Kutchi Lohana (Raghuvanshi) family.
The page flows **About → Research → Tree**, and the tree is styled after the photo-and-thread wall:
polaroid prints hanging from binder clips, joined by glowing red yarn.

* **Visitors** – no account needed. Pan, zoom, search, hover to light the thread back to the oldest ancestors, tap anyone to read their story.
* **Admin** – a hidden page behind a password. Edit names, stories and photos; add siblings (left / right), children and spouses; drag-and-drop to rearrange; undo/redo; export.

No build step, no dependencies — just Node 18+ (or any static host, see below).

## Run it

```bash
npm start                      # http://localhost:3000
# or choose the admin password yourself:
ADMIN_PASSWORD='something-long' npm start
```

If you don't set `ADMIN_PASSWORD`, a random one is generated on first run, printed once in the console and saved to `data/.admin-password`.

### The secret admin page

There is no visible link. Open any of:

* `https://your-site/admin`
* `https://your-site/#admin`
* press **Ctrl/⌘ + Shift + A**
* triple-click the lotus at the very bottom of the page

Enter the password → an admin bar appears and the tree becomes editable. Changes **auto-save** and everyone sees them on their next visit.
The password is checked on the server; saving and photo upload need a signed 12-hour token, login is rate-limited (5 wrong tries → 15-minute lock), and every incoming tree is validated and sanitised. Each save also keeps a timestamped backup in `data/backups/` (last 40).

### Editing the tree

| Do this | How |
|---|---|
| Edit a person | Click their card → editor panel (name, nickname, gender, dates, birthplace/Gam, story, photo) |
| Add sibling left / right | Hover a card → **+** on its left or right edge |
| Add child | Hover a card → **↓ child** at the bottom |
| Add spouse / swap order / delete branch | Icons above the card (the **left** person is treated as the bloodline) |
| Move a branch | Drag a card onto another: **centre** = becomes its child, **left/right edge** = sibling before/after |
| Set a photo | Click *Upload photo*, or drop an image file straight onto a card (auto-cropped and resized) |
| Undo / redo | Admin bar, or Ctrl/⌘+Z · Ctrl/⌘+Shift+Z |
| Family card (Nuk, Gotra, Kuldevi, Gam…) | Admin bar → **Family details** |
| Export | **Export / Import** → backup `.json`, flat nodes `.json`, spreadsheet `.csv`, **GEDCOM** (Gramps, Ancestry, FamilySearch…) |

The flat / CSV export follows the schema from the research prompt (node ID, name, gender, generation, dates, birthplace, gotra/nuk/kuldevi, spouse, parent IDs, children IDs, notes).

## Research prompt

Open the **Research** section: fill in what you know and the full genealogist prompt is built live (Copy / Download).
*Fill from my family tree* pastes your generations in automatically. A blank copy lives in [`research-prompt.md`](research-prompt.md) (`npm run prompt` regenerates it).
The prompt tells the AI to label every claim *documented / tradition / speculation* and **never to invent names, dates or villages**. Please keep that rule — AI assistants will otherwise confidently make up genealogies.

> The About section describes the broadly shared Lohana account and is tagged *Tradition* / *Widely documented* / *To confirm*.
> Nothing about **your** Nuk, Gotra, Kuldevi or village is filled in: those come from your Barot, elders and records (see the Archive Hunt checklist).

## Deploying

**Option A — GitHub Pages (free, view-only site for the family).** `.github/workflows/pages.yml` publishes `public/` automatically on every push. One-time: repo **Settings → Pages → Source: GitHub Actions**. Edits are made in static mode (see below) and published by committing the exported JSON.

**Option B — Render (family views, only you can edit and save online).** Create a *Blueprint* from this repo (`render.yaml`), enter your `ADMIN_PASSWORD` when asked. A persistent disk (paid plan) keeps the tree and photos.

The site needs a tiny always-on Node process so that only the admin can save.

* **Render / Railway / Fly.io / any VPS**: start command `node server.js`; set `ADMIN_PASSWORD`; attach a **persistent disk/volume** and point `DATA_DIR` at it (the tree, photos and backups live there). Behind a proxy set `TRUST_PROXY=1`. Serve over HTTPS.
* **Static hosting only (e.g. GitHub Pages)**: publish the `public/` folder. The site detects there is no API and runs in *static mode*: the admin password gate is just a convenience and edits are saved as a draft **in that browser only**; use **Export → backup .json**, copy it over `public/data/family.json` and commit to publish. (Default static password `family-admin` — change the hash in `public/js/config.js`.)

| Env var | Purpose | Default |
|---|---|---|
| `ADMIN_PASSWORD` | Admin password | generated, stored in `data/.admin-password` |
| `SESSION_SECRET` | Signs admin tokens | generated, stored in `data/.session-secret` |
| `PORT` | HTTP port | `3000` |
| `DATA_DIR` | Live tree, uploads, backups | `./data` |
| `TRUST_PROXY` | `1` to trust `X-Forwarded-For` (rate limiting) | off |

## Project layout

```
server.js              zero-dependency server: static files + /api (tree, login, upload)
public/index.html      page (sections, dialogs, admin bar)
public/css/styles.css  heritage theme + tree styling
public/js/app.js       page orchestration (stats, prompt builder, checklist, atmosphere)
public/js/tree.js      layout, animated threads, pan/zoom, drag & drop
public/js/store.js     data model, undo/redo, persistence, JSON/CSV/GEDCOM export
public/js/panel.js     profile / editor drawer
public/js/admin.js     login, admin bar, photo resize/upload, import/export
public/js/prompt.js    research-prompt template
public/js/content.js   archive checklist, interview questions, lineage cards
public/data/family.json  SAMPLE tree (placeholder names) — replace via the admin page
scripts/               regenerate the sample tree / prompt file
```

Data model: a forest of **family units**; each unit is one person or a couple (`people[0]` = bloodline, `people[1]` = spouse) and has `children` (more units). Because it is a plain JSON file it is easy to back up and version.
