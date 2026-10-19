// Oddiy test sayti serveri (qo'shimcha kutubxonalar kerak emas)
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const DATA = path.join(__dirname, 'data.json');
const UPLOADS = path.join(__dirname, 'uploads');
const ADMIN_NAME = 'serik';
const ADMIN_PASS = 'serik';
const MAX_CHOICE = 35; // 1..35 - variantli, 36..45 - ochiq javobli
const MAX_Q = 45;

fs.mkdirSync(UPLOADS, { recursive: true });

let db = { users: [], tests: [], results: [] };
if (fs.existsSync(DATA)) db = JSON.parse(fs.readFileSync(DATA, 'utf8'));
const save = () => fs.writeFileSync(DATA, JSON.stringify(db, null, 2));

const sessions = new Map(); // token -> {name, role}

const hash = (pass, salt) => crypto.scryptSync(pass, salt, 32).toString('hex');
const norm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
const uid = () => crypto.randomBytes(6).toString('hex');

function send(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > 15 * 1024 * 1024) { reject(new Error('Fayl juda katta')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {}); }
      catch (e) { reject(new Error("Noto'g'ri so'rov")); }
    });
  });
}

function saveImage(dataUrl) {
  const m = /^data:image\/(png|jpeg|jpg|gif|webp);base64,(.+)$/.exec(dataUrl || '');
  if (!m) throw new Error("Rasm formati noto'g'ri");
  const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
  const file = uid() + '.' + ext;
  fs.writeFileSync(path.join(UPLOADS, file), Buffer.from(m[2], 'base64'));
  return file;
}

function removeImage(file) {
  if (!file) return;
  try { fs.unlinkSync(path.join(UPLOADS, file)); } catch (e) {}
}

const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp' };

function grade(test, answers) {
  let score = 0, max = 0;
  for (const q of test.questions) {
    const a = answers[q.num];
    if (q.num <= MAX_CHOICE) {
      max += 1;
      if (a && a === q.correct) score += 1;
    } else {
      max += 2;
      if (a && norm(a.a) && norm(a.a) === norm(q.correct.a)) score += 1;
      if (a && norm(a.b) && norm(a.b) === norm(q.correct.b)) score += 1;
    }
  }
  return { score, max };
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    const p = decodeURIComponent(url.pathname);

    // Statik fayllar
    if (req.method === 'GET' && (p === '/' || p === '/index.html')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(fs.readFileSync(path.join(__dirname, 'index.html')));
    }
    if (req.method === 'GET' && p.startsWith('/uploads/')) {
      const f = path.join(UPLOADS, path.basename(p));
      if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
      return res.end(fs.readFileSync(f));
    }

    if (!p.startsWith('/api/')) { res.writeHead(404); return res.end('Topilmadi'); }

    // Kirish / ro'yxatdan o'tish
    if (p === '/api/auth' && req.method === 'POST') {
      const { mode, name, pass } = await readBody(req);
      const n = String(name || '').trim();
      const pw = String(pass || '');
      if (!n || !pw) return send(res, 400, { error: 'Ism va parolni kiriting' });
      let role = 'user';
      if (n === ADMIN_NAME && pw === ADMIN_PASS) {
        role = 'admin';
      } else if (n.toLowerCase() === ADMIN_NAME) {
        return send(res, 400, { error: "Bunday ism band yoki parol noto'g'ri" });
      } else if (mode === 'register') {
        if (db.users.find((u) => u.name.toLowerCase() === n.toLowerCase()))
          return send(res, 400, { error: 'Bu ism band' });
        const salt = uid();
        db.users.push({ name: n, salt, hash: hash(pw, salt) });
        save();
      } else {
        const u = db.users.find((u) => u.name === n);
        if (!u || u.hash !== hash(pw, u.salt)) return send(res, 400, { error: "Ism yoki parol noto'g'ri" });
      }
      const token = uid() + uid();
      sessions.set(token, { name: n, role });
      return send(res, 200, { token, name: n, role });
    }

    // Quyidagilar uchun kirish shart
    const sess = sessions.get((req.headers.authorization || '').replace('Bearer ', ''));
    if (!sess) return send(res, 401, { error: 'Qaytadan kiring' });
    const isAdmin = sess.role === 'admin';

    if (p === '/api/tests' && req.method === 'GET') {
      return send(res, 200, db.tests.map((t) => ({ id: t.id, title: t.title, count: t.questions.length })));
    }

    if (p === '/api/tests' && req.method === 'POST') {
      if (!isAdmin) return send(res, 403, { error: 'Ruxsat yo\'q' });
      const { title } = await readBody(req);
      if (!String(title || '').trim()) return send(res, 400, { error: 'Test nomini kiriting' });
      const t = { id: uid(), title: String(title).trim(), questions: [] };
      db.tests.push(t);
      save();
      return send(res, 200, { id: t.id });
    }

    let m = /^\/api\/tests\/([a-f0-9]+)$/.exec(p);
    if (m) {
      const t = db.tests.find((t) => t.id === m[1]);
      if (!t) return send(res, 404, { error: 'Test topilmadi' });
      if (req.method === 'GET') {
        const qs = t.questions
          .slice().sort((a, b) => a.num - b.num)
          .map((q) => (isAdmin ? q : { num: q.num, image: q.image }));
        return send(res, 200, { id: t.id, title: t.title, questions: qs });
      }
      if (req.method === 'DELETE') {
        if (!isAdmin) return send(res, 403, { error: "Ruxsat yo'q" });
        t.questions.forEach((q) => removeImage(q.image));
        db.tests = db.tests.filter((x) => x !== t);
        save();
        return send(res, 200, { ok: true });
      }
    }

    m = /^\/api\/tests\/([a-f0-9]+)\/questions(?:\/(\d+))?$/.exec(p);
    if (m) {
      if (!isAdmin) return send(res, 403, { error: "Ruxsat yo'q" });
      const t = db.tests.find((t) => t.id === m[1]);
      if (!t) return send(res, 404, { error: 'Test topilmadi' });
      if (req.method === 'POST') {
        const body = await readBody(req);
        const num = parseInt(body.num, 10);
        if (!(num >= 1 && num <= MAX_Q)) return send(res, 400, { error: 'Savol raqami 1 dan 45 gacha bo\'lishi kerak' });
        let correct;
        if (num <= MAX_CHOICE) {
          if (!['A', 'B', 'C', 'D'].includes(body.correct)) return send(res, 400, { error: "To'g'ri variantni tanlang" });
          correct = body.correct;
        } else {
          const a = String((body.correct && body.correct.a) || '').trim();
          const b = String((body.correct && body.correct.b) || '').trim();
          if (!a || !b) return send(res, 400, { error: "a va b javoblarini kiriting" });
          correct = { a, b };
        }
        const old = t.questions.find((q) => q.num === num);
        let image = old ? old.image : null;
        if (body.image) { removeImage(image); image = saveImage(body.image); }
        if (!image) return send(res, 400, { error: 'Rasm yuklang' });
        t.questions = t.questions.filter((q) => q.num !== num);
        t.questions.push({ num, image, correct });
        save();
        return send(res, 200, { ok: true });
      }
      if (req.method === 'DELETE' && m[2]) {
        const num = parseInt(m[2], 10);
        const q = t.questions.find((q) => q.num === num);
        if (q) removeImage(q.image);
        t.questions = t.questions.filter((q) => q.num !== num);
        save();
        return send(res, 200, { ok: true });
      }
    }

    m = /^\/api\/tests\/([a-f0-9]+)\/submit$/.exec(p);
    if (m && req.method === 'POST') {
      if (isAdmin) return send(res, 403, { error: 'Admin test topshirmaydi' });
      const t = db.tests.find((t) => t.id === m[1]);
      if (!t) return send(res, 404, { error: 'Test topilmadi' });
      const { answers } = await readBody(req);
      const r = grade(t, answers || {});
      db.results.push({ user: sess.name, testId: t.id, title: t.title, score: r.score, max: r.max, date: new Date().toISOString() });
      save();
      return send(res, 200, r);
    }

    if (p === '/api/results' && req.method === 'GET') {
      const list = isAdmin ? db.results : db.results.filter((r) => r.user === sess.name);
      return send(res, 200, list.slice().reverse());
    }

    return send(res, 404, { error: 'Topilmadi' });
  } catch (e) {
    send(res, 400, { error: e.message || 'Xatolik' });
  }
});

server.listen(PORT, () => console.log('Sayt ishga tushdi: http://localhost:' + PORT));
