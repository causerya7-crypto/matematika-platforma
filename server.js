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
const MAX_VIDEO = 300 * 1024 * 1024; // 300 MB

fs.mkdirSync(UPLOADS, { recursive: true });

let db = { users: [], tests: [], results: [] };
if (fs.existsSync(DATA)) db = JSON.parse(fs.readFileSync(DATA, 'utf8'));
const save = () => fs.writeFileSync(DATA, JSON.stringify(db, null, 2));

const sessions = new Map(); // token -> {name, role}

const hash = (pass, salt) => crypto.scryptSync(pass, salt, 32).toString('hex');
const norm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
const uid = () => crypto.randomBytes(6).toString('hex');

process.on('unhandledRejection', (e) => console.error('Xatolik:', e));

function send(res, code, obj) {
  if (res.writableEnded || res.destroyed) return;
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

// Katta faylni (video) to'g'ridan-to'g'ri diskka yozish
function receiveFile(req, ext) {
  return new Promise((resolve, reject) => {
    const file = uid() + ext;
    const full = path.join(UPLOADS, file);
    const out = fs.createWriteStream(full);
    let size = 0;
    let failed = false;
    const fail = (msg) => {
      if (failed) return;
      failed = true;
      out.destroy();
      fs.unlink(full, () => {});
      reject(new Error(msg));
    };
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_VIDEO) { fail('Video juda katta (300 MB gacha)'); req.destroy(); }
    });
    req.on('error', () => fail('Yuklash uzildi'));
    req.on('aborted', () => fail('Yuklash bekor qilindi'));
    out.on('error', () => fail("Faylni saqlab bo'lmadi"));
    out.on('finish', () => {
      if (failed) return;
      if (size === 0) return fail("Fayl bo'sh");
      resolve(file);
    });
    req.pipe(out);
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

function removeFile(file) {
  if (!file) return;
  try { fs.unlinkSync(path.join(UPLOADS, path.basename(file))); } catch (e) {}
}

function removeVideo(q) {
  if (q.video && q.video.kind === 'file') removeFile(q.video.file);
  q.video = null;
}

// Videoni foydalanuvchiga ko'rsatish uchun shaklga keltirish
function videoInfo(q) {
  const v = q.video;
  if (!v) return null;
  if (v.kind === 'file') return { kind: 'file', url: '/uploads/' + v.file };
  const u = v.url;
  const yt = /(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/))([\w-]{11})/.exec(u);
  if (yt) return { kind: 'embed', url: 'https://www.youtube.com/embed/' + yt[1] };
  if (/\.(mp4|webm|ogg)(\?.*)?$/i.test(u)) return { kind: 'file', url: u };
  return { kind: 'link', url: u };
}

const MIME = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.ogg': 'video/ogg', '.mov': 'video/quicktime'
};
const VIDEO_TYPES = { 'video/mp4': '.mp4', 'video/webm': '.webm', 'video/ogg': '.ogg', 'video/quicktime': '.mov' };

// Fayl berish (video oldinga-orqaga surilishi uchun Range qo'llab-quvvatlanadi)
function serveFile(req, res, f) {
  let st;
  try { st = fs.statSync(f); } catch (e) { res.writeHead(404); return res.end(); }
  const type = MIME[path.extname(f)] || 'application/octet-stream';
  const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
  if (m && (m[1] !== '' || m[2] !== '')) {
    let start, end;
    if (m[1] === '') { start = Math.max(0, st.size - parseInt(m[2], 10)); end = st.size - 1; }
    else {
      start = parseInt(m[1], 10);
      end = m[2] === '' ? st.size - 1 : Math.min(parseInt(m[2], 10), st.size - 1);
    }
    if (start > end || start >= st.size) {
      res.writeHead(416, { 'Content-Range': 'bytes */' + st.size });
      return res.end();
    }
    res.writeHead(206, {
      'Content-Type': type,
      'Content-Range': `bytes ${start}-${end}/${st.size}`,
      'Content-Length': end - start + 1,
      'Accept-Ranges': 'bytes'
    });
    return fs.createReadStream(f, { start, end }).pipe(res);
  }
  res.writeHead(200, { 'Content-Type': type, 'Content-Length': st.size, 'Accept-Ranges': 'bytes' });
  fs.createReadStream(f).pipe(res);
}

function grade(test, answers) {
  let score = 0, max = 0;
  for (const q of test.questions) {
    const a = answers[q.num];
    const points = Number.isFinite(Number(q.points)) && Number(q.points) >= 0 ? Number(q.points) : (q.num <= MAX_CHOICE ? 1 : 2);
    max += points;
    if (q.num <= MAX_CHOICE) {
      if (a && a === q.correct) score += points;
    } else {
      const each = points / 2;
      if (a && norm(a.a) && norm(a.a) === norm(q.correct.a)) score += each;
      if (a && norm(a.b) && norm(a.b) === norm(q.correct.b)) score += each;
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
      return serveFile(req, res, path.join(UPLOADS, path.basename(p)));
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
      if (!isAdmin) return send(res, 403, { error: "Ruxsat yo'q" });
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
          .map((q) => (isAdmin
            ? { num: q.num, image: q.image, correct: q.correct, points: Number.isFinite(Number(q.points)) ? Number(q.points) : (q.num <= MAX_CHOICE ? 1 : 2), video: videoInfo(q) }
            : { num: q.num, image: q.image, points: Number.isFinite(Number(q.points)) ? Number(q.points) : (q.num <= MAX_CHOICE ? 1 : 2) }));
        return send(res, 200, { id: t.id, title: t.title, questions: qs });
      }
      if (req.method === 'DELETE') {
        if (!isAdmin) return send(res, 403, { error: "Ruxsat yo'q" });
        t.questions.forEach((q) => { removeFile(q.image); removeVideo(q); });
        db.tests = db.tests.filter((x) => x !== t);
        save();
        return send(res, 200, { ok: true });
      }
    }

    // Javobni darrov tekshirish (video ham javobdan keyin beriladi)
    m = /^\/api\/tests\/([a-f0-9]+)\/check$/.exec(p);
    if (m && req.method === 'POST') {
      const t = db.tests.find((t) => t.id === m[1]);
      if (!t) return send(res, 404, { error: 'Test topilmadi' });
      const { num, answer } = await readBody(req);
      const q = t.questions.find((q) => q.num === parseInt(num, 10));
      if (!q) return send(res, 404, { error: 'Savol topilmadi' });
      if (q.num <= MAX_CHOICE) {
        return send(res, 200, { correct: answer === q.correct, right: q.correct, video: videoInfo(q) });
      }
      const a = (answer && answer.a) || '';
      const b = (answer && answer.b) || '';
      const pa = !!norm(a) && norm(a) === norm(q.correct.a);
      const pb = !!norm(b) && norm(b) === norm(q.correct.b);
      return send(res, 200, { correct: pa && pb, parts: { a: pa, b: pb }, right: q.correct, video: videoInfo(q) });
    }

    // Yechim videosi: fayl yuklash / o'chirish
    m = /^\/api\/tests\/([a-f0-9]+)\/questions\/(\d+)\/video$/.exec(p);
    if (m) {
      if (!isAdmin) return send(res, 403, { error: "Ruxsat yo'q" });
      const t = db.tests.find((t) => t.id === m[1]);
      const q = t && t.questions.find((q) => q.num === parseInt(m[2], 10));
      if (!q) return send(res, 404, { error: 'Savol topilmadi (avval savolni saqlang)' });
      if (req.method === 'POST') {
        const type = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
        const ext = VIDEO_TYPES[type];
        if (!ext) { req.resume(); return send(res, 400, { error: 'Video formati mos emas (mp4, webm, ogg, mov)' }); }
        if (parseInt(req.headers['content-length'] || '0', 10) > MAX_VIDEO) {
          req.resume();
          return send(res, 413, { error: 'Video juda katta (300 MB gacha)' });
        }
        const file = await receiveFile(req, ext);
        removeVideo(q);
        q.video = { kind: 'file', file };
        save();
        return send(res, 200, { ok: true });
      }
      if (req.method === 'DELETE') {
        removeVideo(q);
        save();
        return send(res, 200, { ok: true });
      }
    }

    // Yechim videosi: havola (YouTube va boshqalar)
    m = /^\/api\/tests\/([a-f0-9]+)\/questions\/(\d+)\/video-url$/.exec(p);
    if (m && req.method === 'POST') {
      if (!isAdmin) return send(res, 403, { error: "Ruxsat yo'q" });
      const t = db.tests.find((t) => t.id === m[1]);
      const q = t && t.questions.find((q) => q.num === parseInt(m[2], 10));
      if (!q) return send(res, 404, { error: 'Savol topilmadi (avval savolni saqlang)' });
      const { url: link } = await readBody(req);
      const u = String(link || '').trim();
      if (!/^https?:\/\/\S+$/i.test(u)) return send(res, 400, { error: "Havola http:// yoki https:// bilan boshlanishi kerak" });
      removeVideo(q);
      q.video = { kind: 'url', url: u };
      save();
      return send(res, 200, { ok: true });
    }

    m = /^\/api\/tests\/([a-f0-9]+)\/questions(?:\/(\d+))?$/.exec(p);
    if (m) {
      if (!isAdmin) return send(res, 403, { error: "Ruxsat yo'q" });
      const t = db.tests.find((t) => t.id === m[1]);
      if (!t) return send(res, 404, { error: 'Test topilmadi' });
      if (req.method === 'POST') {
        const body = await readBody(req);
        const num = parseInt(body.num, 10);
        if (!(num >= 1 && num <= MAX_Q)) return send(res, 400, { error: "Savol raqami 1 dan 45 gacha bo'lishi kerak" });
        let correct;
        if (num <= MAX_CHOICE) {
          if (!['A', 'B', 'C', 'D'].includes(body.correct)) return send(res, 400, { error: "To'g'ri variantni tanlang" });
          correct = body.correct;
        } else {
          const a = String((body.correct && body.correct.a) || '').trim();
          const b = String((body.correct && body.correct.b) || '').trim();
          if (!a || !b) return send(res, 400, { error: 'a va b javoblarini kiriting' });
          correct = { a, b };
        }
        const old = t.questions.find((q) => q.num === num);
        const rawPoints = body.points === undefined ? (old && old.points !== undefined ? old.points : (num <= MAX_CHOICE ? 1 : 2)) : Number(body.points);
        if (!Number.isFinite(rawPoints) || rawPoints < 0 || rawPoints > 1000) return send(res, 400, { error: "Ball 0 dan 1000 gacha bo\'lishi kerak" });
        let image = old ? old.image : null;
        if (body.image) { removeFile(image); image = saveImage(body.image); }
        if (!image) return send(res, 400, { error: 'Rasm yuklang' });
        t.questions = t.questions.filter((q) => q.num !== num);
        t.questions.push({ num, image, correct, points: rawPoints, video: old ? old.video || null : null });
        save();
        return send(res, 200, { ok: true });
      }
      if (req.method === 'DELETE' && m[2]) {
        const num = parseInt(m[2], 10);
        const q = t.questions.find((q) => q.num === num);
        if (q) { removeFile(q.image); removeVideo(q); }
        t.questions = t.questions.filter((q) => q.num !== num);
        save();
        return send(res, 200, { ok: true });
      }
    }

    m = /^\/api\/tests\/([a-f0-9]+)\/questions\/(\d+)\/points$/.exec(p);
    if (m && req.method === 'POST') {
      if (!isAdmin) return send(res, 403, { error: "Ruxsat yo'q" });
      const t = db.tests.find((x) => x.id === m[1]);
      const q = t && t.questions.find((x) => x.num === parseInt(m[2], 10));
      if (!q) return send(res, 404, { error: 'Savol topilmadi' });
      const body = await readBody(req);
      const points = Number(body.points);
      if (!Number.isFinite(points) || points < 0 || points > 1000) return send(res, 400, { error: "Ball 0 dan 1000 gacha bo\'lishi kerak" });
      q.points = points;
      save();
      return send(res, 200, { ok: true, points });
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
