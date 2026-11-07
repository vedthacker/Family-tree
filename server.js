// Vansh Vruksh — tiny zero-dependency server.
//  • serves the site from /public
//  • GET  /api/tree     → the live family tree (public, read-only)
//  • POST /api/login    → exchange the admin password for a signed, expiring token
//  • PUT  /api/tree     → save the tree            (admin token required)
//  • POST /api/upload   → upload a resized photo   (admin token required)
//
// Admin password: set ADMIN_PASSWORD, otherwise one is generated on first run
// and stored in data/.admin-password (printed once in the console).

import http from 'node:http';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));
const PUBLIC_DIR = path.join(__dirname, 'public');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const BACKUPS_DIR = path.join(DATA_DIR, 'backups');
const TREE_FILE = path.join(DATA_DIR, 'family.json');
const SEED_FILE = path.join(PUBLIC_DIR, 'data', 'family.json');
const TRUST_PROXY = process.env.TRUST_PROXY === '1';
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_TREE_BYTES = 8 * 1024 * 1024;
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

for (const d of [DATA_DIR, UPLOADS_DIR, BACKUPS_DIR]) fs.mkdirSync(d, { recursive: true });

// ---------- secrets ----------
function readOrCreate(file, make) {
  try { return fs.readFileSync(file, 'utf8').trim(); } catch {}
  const v = make();
  fs.writeFileSync(file, v + '\n', { mode: 0o600 });
  return v;
}
const SESSION_SECRET = process.env.SESSION_SECRET ||
  readOrCreate(path.join(DATA_DIR, '.session-secret'), () => crypto.randomBytes(32).toString('hex'));

let generatedPassword = false;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || readOrCreate(path.join(DATA_DIR, '.admin-password'), () => {
  generatedPassword = true;
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  return Array.from(crypto.randomBytes(14), (b) => alphabet[b % alphabet.length]).join('');
});

const sha = (s) => crypto.createHash('sha256').update(s).digest();
const safeEqual = (a, b) => crypto.timingSafeEqual(sha(String(a)), sha(String(b)));
const sign = (payload) => crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');
const issueToken = () => { const exp = String(Date.now() + TOKEN_TTL_MS); return `${exp}.${sign(exp)}`; };
function verifyToken(token) {
  const [exp, sig] = String(token || '').split('.');
  if (!exp || !sig || !/^\d+$/.test(exp) || Number(exp) < Date.now()) return false;
  const good = sign(exp);
  return sig.length === good.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good));
}
const isAdmin = (req) => verifyToken((req.headers.authorization || '').replace(/^Bearer\s+/i, ''));

// ---------- brute-force guard ----------
const fails = new Map(); // ip -> {n, until}
const clientIp = (req) => (TRUST_PROXY && String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || req.socket.remoteAddress || '?';

// ---------- helpers ----------
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.md': 'text/markdown; charset=utf-8',
  '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
};
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'same-origin',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, { ...SECURITY_HEADERS, ...headers });
  res.end(body);
}
const sendJson = (res, status, obj) => send(res, status, JSON.stringify(obj), { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' });

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(Object.assign(new Error('Payload too large'), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

const PHOTO_OK = /^(\/uploads\/[\w.-]+|data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=]+|https?:\/\/[^\s"'<>]+)$/i;
const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');

/** Validate + sanitise an incoming tree. Returns a clean copy or throws. */
function cleanTree(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.roots)) throw new Error('Invalid tree: roots[] missing');
  let units = 0;
  const seen = new Set();
  const person = (p) => {
    if (!p || typeof p !== 'object') throw new Error('Invalid person');
    const photo = str(p.photo, 3_000_000);
    return {
      id: str(p.id, 40) || crypto.randomUUID().slice(0, 8),
      name: str(p.name, 120), nick: str(p.nick, 80),
      gender: ['M', 'F', 'O'].includes(p.gender) ? p.gender : '',
      born: str(p.born, 40), died: str(p.died, 40), place: str(p.place, 160),
      about: str(p.about, 6000), photo: PHOTO_OK.test(photo) ? photo : '',
    };
  };
  const unit = (u, depth) => {
    if (!u || typeof u !== 'object' || !Array.isArray(u.people) || u.people.length < 1 || u.people.length > 2) throw new Error('Invalid unit');
    if (depth > 60 || ++units > 5000) throw new Error('Tree too large');
    const id = str(u.id, 40);
    if (!id || seen.has(id)) throw new Error('Duplicate or missing unit id');
    seen.add(id);
    return { id, people: u.people.map(person), children: (Array.isArray(u.children) ? u.children : []).map((c) => unit(c, depth + 1)) };
  };
  const m = raw.meta && typeof raw.meta === 'object' ? raw.meta : {};
  const meta = {};
  for (const k of ['title', 'tagline', 'nuk', 'gotra', 'kuldevi', 'gam', 'community', 'location', 'updated']) meta[k] = str(m[k], 300);
  return { meta, roots: raw.roots.map((r) => unit(r, 0)) };
}

function saveTree(tree) {
  if (fs.existsSync(TREE_FILE)) {
    fs.copyFileSync(TREE_FILE, path.join(BACKUPS_DIR, `family-${new Date().toISOString().replace(/[:.]/g, '-')}.json`));
    const old = fs.readdirSync(BACKUPS_DIR).filter((f) => f.startsWith('family-')).sort();
    for (const f of old.slice(0, Math.max(0, old.length - 40))) fs.rmSync(path.join(BACKUPS_DIR, f), { force: true });
  }
  const tmp = TREE_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(tree));
  fs.renameSync(tmp, TREE_FILE);
}

function sniffImage(buf) {
  if (buf.length > 12 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length > 12 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.length > 12 && buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP') return 'webp';
  return null;
}

// ---------- API ----------
async function handleApi(req, res, url) {
  if (url.pathname === '/api/health') return sendJson(res, 200, { ok: true });

  if (url.pathname === '/api/tree' && req.method === 'GET') {
    const file = fs.existsSync(TREE_FILE) ? TREE_FILE : SEED_FILE;
    return send(res, 200, fs.readFileSync(file), { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' });
  }

  if (url.pathname === '/api/login' && req.method === 'POST') {
    const ip = clientIp(req);
    const rec = fails.get(ip) || { n: 0, until: 0 };
    if (rec.until > Date.now()) return sendJson(res, 429, { error: 'Too many attempts. Try again in a few minutes.' });
    let body = {};
    try { body = JSON.parse((await readBody(req, 4096)).toString() || '{}'); } catch {}
    if (typeof body.password === 'string' && safeEqual(body.password, ADMIN_PASSWORD)) {
      fails.delete(ip);
      return sendJson(res, 200, { token: issueToken(), expiresIn: TOKEN_TTL_MS });
    }
    rec.n += 1;
    if (rec.n >= 5) { rec.until = Date.now() + 15 * 60 * 1000; rec.n = 0; }
    fails.set(ip, rec);
    await new Promise((r) => setTimeout(r, 600));
    return sendJson(res, 401, { error: 'Wrong password' });
  }

  if (url.pathname === '/api/tree' && req.method === 'PUT') {
    if (!isAdmin(req)) return sendJson(res, 401, { error: 'Unauthorised' });
    try {
      const tree = cleanTree(JSON.parse((await readBody(req, MAX_TREE_BYTES)).toString()));
      saveTree(tree);
      return sendJson(res, 200, { ok: true, savedAt: new Date().toISOString() });
    } catch (e) {
      return sendJson(res, e.status || 400, { error: e.message });
    }
  }

  if (url.pathname === '/api/upload' && req.method === 'POST') {
    if (!isAdmin(req)) return sendJson(res, 401, { error: 'Unauthorised' });
    try {
      const buf = await readBody(req, MAX_UPLOAD_BYTES);
      const ext = sniffImage(buf);
      if (!ext) return sendJson(res, 415, { error: 'Only JPEG, PNG or WebP images are accepted' });
      const name = `${Date.now().toString(36)}-${crypto.randomBytes(6).toString('hex')}.${ext}`;
      fs.writeFileSync(path.join(UPLOADS_DIR, name), buf);
      return sendJson(res, 200, { url: `/uploads/${name}` });
    } catch (e) {
      return sendJson(res, e.status || 400, { error: e.message });
    }
  }

  return sendJson(res, 404, { error: 'Not found' });
}

// ---------- static files ----------
function serveFile(res, file, cache) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, 'Not found', { 'Content-Type': 'text/plain' });
    res.writeHead(200, {
      ...SECURITY_HEADERS,
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Content-Length': st.size,
      'Cache-Control': cache,
    });
    fs.createReadStream(file).pipe(res);
  });
}

function within(base, target) {
  const rel = path.relative(base, target);
  return rel && !rel.startsWith('..') && !path.isAbsolute(rel);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');

    let pathname;
    try { pathname = decodeURIComponent(url.pathname); } catch { return send(res, 400, 'Bad request'); }
    if (pathname.includes('\0')) return send(res, 400, 'Bad request');

    if (pathname.startsWith('/uploads/')) {
      const f = path.join(UPLOADS_DIR, pathname.slice('/uploads/'.length));
      return within(UPLOADS_DIR, f) ? serveFile(res, f, 'public, max-age=31536000, immutable') : send(res, 403, 'Forbidden');
    }
    if (pathname === '/admin' || pathname === '/admin/') pathname = '/index.html';
    if (pathname.endsWith('/')) pathname += 'index.html';
    const f = path.join(PUBLIC_DIR, pathname);
    if (!within(PUBLIC_DIR, f)) return send(res, 403, 'Forbidden');
    return serveFile(res, f, 'no-cache');
  } catch (e) {
    console.error(e);
    if (!res.headersSent) sendJson(res, 500, { error: 'Server error' });
  }
});

server.listen(PORT, () => {
  console.log(`\n  Vansh Vruksh running →  http://localhost:${PORT}`);
  console.log(`  Secret admin page    →  http://localhost:${PORT}/admin   (or add #admin to the URL)`);
  if (generatedPassword) {
    console.log(`\n  A new admin password was generated:  ${ADMIN_PASSWORD}`);
    console.log(`  (saved in ${path.join(DATA_DIR, '.admin-password')} — or set ADMIN_PASSWORD yourself)\n`);
  } else if (process.env.ADMIN_PASSWORD) {
    console.log('  Admin password taken from ADMIN_PASSWORD.\n');
  } else {
    console.log(`  Admin password stored in ${path.join(DATA_DIR, '.admin-password')}\n`);
  }
});
