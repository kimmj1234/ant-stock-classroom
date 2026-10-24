'use strict';
// ===== 나의 두번째 인생 서버: 파일 제공 + 계정(로그인) =====
// 실행: node server.js → http://localhost:5000
// 메인 페이지, 로그인, 게임 화면(도시) 파일 제공. (예전 주식 게임은 52단계에서 지움 — Git 기록에 남아 있음)
// 계정·로그인 유지 정보는 data/ 에 저장되어 서버를 다시 켜도 이어집니다.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = 5000, HOST = '127.0.0.1';
const MAX_ACCOUNTS = 200;
const DATA_DIR = path.join(__dirname, 'data');
const ACCOUNTS_FILE = path.join(DATA_DIR, 'accounts.json');   // 닉네임·(비밀번호면) 소금·해시 / (구글이면) 구글 고유 번호
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');   // 로그인 쿠키 토큰의 해시 → 계정 (토큰 원문은 저장하지 않음)
const FILES = {
  '/': 'home.html', '/site.css': 'site.css', '/site.js': 'site.js', '/wordmark.css': 'wordmark.css',
  '/logo.svg': 'assets/logo.svg',                 // 브라우저 탭 아이콘: 픽셀 하트 두 개
  '/play': 'play.html', '/game.js': 'game.js', '/sprites.js': 'sprites.js', '/town.js': 'town.js',     // 게임 화면 (로그인한 사람만, 안 했으면 화면이 메인으로 보냄)
};
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml' };

const readJSONFile = file => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } };
function writeJSONFile(file, data) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(file + '.tmp', JSON.stringify(data));
  fs.renameSync(file + '.tmp', file);   // 쓰는 도중 꺼져도 파일이 반쯤 깨지지 않게
}

// ===== 계정 =====
const accounts = readJSONFile(ACCOUNTS_FILE) || {};   // 닉네임 key(소문자) → { name, salt, hash } 또는 { name, google }
const nameKey = n => n.normalize('NFC').toLowerCase();
const hashPw = (pw, salt) => crypto.scryptSync(pw, salt, 32).toString('hex');
function checkPw(pw, acc) {
  const a = Buffer.from(hashPw(pw, acc.salt), 'hex'), b = Buffer.from(acc.hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
const cleanName = s => (typeof s === 'string' ? s.normalize('NFC').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 10) : '');

// ===== 새 닉네임 규칙 (계정을 새로 만들 때) =====
// 대부분의 게임처럼: 한글(완성된 글자)·영어만, 띄어쓰기 없이 2~10글자, 대소문자 무시 중복 불가, 욕설·비하·성적 단어와 운영진 사칭 불가
const NAME_MIN = 2, NAME_MAX = 10;
const BAD_WORDS = [
  // 한국어 욕설·비하·성적 표현 (변형 일부 포함)
  '시발', '씨발', '씨빨', '씨바', '쉬발', '씨팔', '시팔', '개새', '개색', '개세끼', '새끼', '색기', '병신', '븅신', '빙신', '좆', '존나', '졸라', '지랄',
  '미친', '미췬', '닥쳐', '꺼져', '엠창', '애미', '애비', '니미', '느금', '느그', '창녀', '창놈', '걸레', '보지', '자지', '섹스', '성교', '야동', '강간', '자위',
  '한남', '김치녀', '된장녀', '일베', '메갈', '틀딱', '급식충', '맘충', '똘추', '찐따', '병자', '장애인', '정신병', '쓰레기', '개같', '개놈', '개년', '년아',
  // 영어 욕설·비하·성적 표현
  'fuck', 'fuk', 'shit', 'bitch', 'asshole', 'bastard', 'dick', 'pussy', 'cunt', 'slut', 'whore', 'nigger', 'nigga', 'faggot', 'retard', 'porn', 'sex', 'rape', 'nazi', 'hitler',
];
// 운영진 사칭: 들어 있기만 해도 안 됨 / 짧은 영어(gm·dev·mod)는 그 자체일 때만 (gmork·devon 같은 이름은 허용)
const RESERVED_PART = ['운영자', '운영진', '관리자', '개발자', '공식', '시스템', '어드민', '지엠', '매니저', 'admin', 'moderator', 'operator', 'official', 'system', 'manager', 'staff'];
const RESERVED_EXACT = ['gm', 'dev', 'mod'];
function nameProblem(raw) {
  if (typeof raw !== 'string' || !raw.length) return '닉네임을 입력해 주세요.';
  const name = raw.normalize('NFC');
  if (/\s/.test(name)) return '띄어쓰기는 쓸 수 없어요.';
  if (!/^[가-힣A-Za-z]+$/.test(name)) return '한글(완성된 글자)과 영어만 쓸 수 있어요. 숫자·특수문자·자음/모음만 따로는 안 돼요.';
  if ([...name].length < NAME_MIN || [...name].length > NAME_MAX) return `닉네임은 ${NAME_MIN}~${NAME_MAX}글자로 정해 주세요.`;
  const low = name.toLowerCase();
  if (RESERVED_EXACT.includes(low) || RESERVED_PART.some(w => low.includes(w))) return '운영자·관리자처럼 오해를 줄 수 있는 이름은 쓸 수 없어요.';
  if (BAD_WORDS.some(w => low.includes(w))) return '사용할 수 없는 단어가 들어 있어요.';
  if (accounts[nameKey(name)]) return '이미 있는 닉네임이에요.';
  return null;
}

// ===== 로그인 유지 (쿠키 토큰) =====
const tokenHash = t => crypto.createHash('sha256').update(String(t)).digest('hex');
const sessions = new Map(Object.entries(readJSONFile(SESSIONS_FILE) || {}).filter(([h, key]) => /^[0-9a-f]{64}$/.test(h) && accounts[key]));   // 토큰 해시 → 계정 key
const saveSessions = () => writeJSONFile(SESSIONS_FILE, Object.fromEntries(sessions));
function startSession(key) {
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(tokenHash(token), key);
  saveSessions();
  return token;
}
const failures = new Map();  // 닉네임 → { n, until } 비밀번호 연속 실패 잠금

// ===== 닉네임 + 비밀번호: 처음이면 계정 생성(닉네임 규칙 검사), 있으면 비밀번호 확인 =====
function login(b) {
  const name = cleanName(b.name), pw = typeof b.password === 'string' ? b.password : '';
  if (!name) return { ok: false, msg: '닉네임을 입력해 주세요.' };
  if (pw.length < 4 || pw.length > 30) return { ok: false, msg: '비밀번호는 4~30자로 입력하세요.' };
  const key = nameKey(name), f = failures.get(key);
  if (f && f.until > Date.now()) return { ok: false, msg: `비밀번호를 여러 번 틀렸어요. ${Math.ceil((f.until - Date.now()) / 1000)}초 뒤에 다시 시도하세요.` };
  let acc = accounts[key], created = false;
  if (acc && !acc.hash) return { ok: false, msg: '구글 계정으로 만든 닉네임이에요. "Google로 로그인"을 눌러 주세요.' };
  if (acc) {
    if (!checkPw(pw, acc)) {
      const n = (f?.n || 0) + 1;
      failures.set(key, { n, until: n >= 5 ? Date.now() + 30000 : 0 });
      return { ok: false, msg: '이미 있는 닉네임이에요. 비밀번호가 맞지 않습니다.' };
    }
  } else {
    const bad = nameProblem(typeof b.name === 'string' ? b.name.trim() : '');   // 새 계정만 닉네임 규칙 검사 (앞뒤 공백은 실수로 보고 뗌)
    if (bad) return { ok: false, msg: bad };
    if (Object.keys(accounts).length >= MAX_ACCOUNTS) return { ok: false, msg: '계정이 너무 많아 새로 만들 수 없어요.' };
    const salt = crypto.randomBytes(16).toString('hex');
    acc = accounts[key] = { name, salt, hash: hashPw(pw, salt) };
    writeJSONFile(ACCOUNTS_FILE, accounts);
    created = true;
  }
  failures.delete(key);
  return { ok: true, token: startSession(key), created, msg: created ? `'${acc.name}' 계정을 새로 만들었어요.` : `'${acc.name}'(으)로 로그인했어요.` };
}

// ===== 구글 계정 로그인 (Google Identity Services) =====
// 화면의 "Google로 로그인" 버튼 → 구글이 서명한 확인증(ID 토큰) → 여기서 구글에 진짜인지 물어봄.
// 계정에는 비밀번호 대신 구글 계정 고유 번호(sub)만 저장. 처음 온 구글 계정은 닉네임을 정해야 들어옴.
// 클라이언트 ID는 공개 값(웹페이지에 그대로 들어감). 보안 비밀(secret)은 이 방식에서 쓰지 않음
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '943771274143-m1i8fsum0lko2tnf7010ld0b8uin6agg.apps.googleusercontent.com';
const pendingGoogle = new Map();   // 임시 번호 → { sub, until }: 처음 온 구글 계정이 닉네임을 정하는 10분 동안만
async function verifyGoogle(credential) {
  if (typeof credential !== 'string' || credential.length > 4096) return null;
  try {
    // 확인증은 주소(URL)에 넣지 않고 본문으로 보냄
    const r = await fetch('https://oauth2.googleapis.com/tokeninfo', { method: 'POST', body: new URLSearchParams({ id_token: credential }) });
    if (!r.ok) return null;
    const t = await r.json();
    const ok = t.aud === GOOGLE_CLIENT_ID                                     // 우리 앱용으로 발급됐는지
      && (t.iss === 'accounts.google.com' || t.iss === 'https://accounts.google.com')   // 구글이 발급했는지
      && Number(t.exp) * 1000 > Date.now()                                    // 기간이 지나지 않았는지
      && (t.email_verified === 'true' || t.email_verified === true)           // 이메일 인증된 계정인지
      && typeof t.sub === 'string' && t.sub;
    return ok ? t.sub : null;
  } catch { return null; }
}
const findGoogle = sub => Object.keys(accounts).find(k => accounts[k].google === sub);
async function googleLogin(b) {
  const sub = await verifyGoogle(b.credential);
  if (!sub) return { ok: false, msg: '구글 로그인을 확인하지 못했어요. 다시 시도해 주세요.' };
  const key = findGoogle(sub);
  if (key) return { ok: true, token: startSession(key), msg: `'${accounts[key].name}'(으)로 로그인했어요.` };
  for (const [id, pg] of pendingGoogle) if (pg.until < Date.now()) pendingGoogle.delete(id);
  const pending = crypto.randomBytes(16).toString('hex');
  pendingGoogle.set(pending, { sub, until: Date.now() + 10 * 60 * 1000 });
  return { ok: false, needName: true, pending, msg: '처음 오셨네요! 사용할 닉네임을 정해 주세요.' };
}
function googleName(b) {
  const pg = pendingGoogle.get(b.pending);
  if (!pg || pg.until < Date.now()) return { ok: false, msg: '시간이 지났어요. "Google로 로그인"을 다시 눌러 주세요.' };
  const bad = nameProblem(b.name);
  if (bad) return { ok: false, msg: bad };
  const name = b.name.normalize('NFC'), key = nameKey(name);
  if (Object.keys(accounts).length >= MAX_ACCOUNTS) return { ok: false, msg: '계정이 너무 많아 새로 만들 수 없어요.' };
  pendingGoogle.delete(b.pending);
  const had = findGoogle(pg.sub);   // 같은 구글 계정으로 두 번 눌렀으면 먼저 만든 계정으로
  if (had) return { ok: true, token: startSession(had), msg: `'${accounts[had].name}'(으)로 로그인했어요.` };
  accounts[key] = { name, google: pg.sub };
  writeJSONFile(ACCOUNTS_FILE, accounts);
  return { ok: true, token: startSession(key), created: true, msg: `'${name}' 계정을 새로 만들었어요.` };
}
const nameCheck = b => { const bad = nameProblem(b.name); return bad ? { ok: false, msg: bad } : { ok: true, msg: '사용할 수 있는 닉네임이에요.' }; };   // 입력하는 동안 화면이 물어봄
const AUTH = { login, google: googleLogin, googleName, nameCheck };   // 로그인 전에 부르는 API

// ===== HTTP =====
function readBody(req) {
  return new Promise(resolve => {
    let body = '';
    req.on('data', c => { body += c; if (body.length > 8192) { resolve(null); req.destroy(); } });
    req.on('end', () => { try { resolve(JSON.parse(body || '{}')); } catch { resolve(null); } });
  });
}
function json(res, code, data, headers = {}) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(data));
}
// 로그인 토큰은 HttpOnly 쿠키로만 주고받음 (화면·주소·페이지 저장소에 남지 않음)
const COOKIE = 'antTok';
const tokenOf = req => (req.headers.cookie || '').split(';').map(c => c.trim().split('=')).find(([k]) => k === COOKIE)?.[1] || '';
// 터널(https)로 들어온 요청이면 Secure를 붙여 https에서만 쿠키가 오가게 함
const setCookie = (token, req) => ({ 'Set-Cookie': `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${token ? 2592000 : 0}${req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : ''}` });

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  // 화면이 처음에 필요한 설정 (구글 로그인 버튼에 넣을 클라이언트 ID: 공개 값)
  if (req.method === 'GET' && url.pathname === '/api/config') return json(res, 200, { googleClientId: GOOGLE_CLIENT_ID });

  if (req.method === 'POST' && url.pathname.startsWith('/api/')) {
    const name = url.pathname.slice(5), b = await readBody(req);
    if (!b) return json(res, 400, { ok: false, msg: '잘못된 요청이에요.' });
    if (AUTH[name]) {
      const { token, ...rest } = await AUTH[name](b);
      return json(res, 200, rest, token ? setCookie(token, req) : {});
    }
    if (name === 'logout') { sessions.delete(tokenHash(tokenOf(req))); saveSessions(); return json(res, 200, { ok: true }, setCookie('', req)); }
    if (name === 'me') {
      // 로그인 전은 정상 상황이라 200 + auth:false (브라우저 콘솔에 빨간 오류가 남지 않게)
      const key = sessions.get(tokenHash(tokenOf(req)));
      return json(res, 200, key && accounts[key] ? { ok: true, me: { name: accounts[key].name } } : { ok: false, auth: false, msg: '로그인이 필요해요.' });
    }
    return json(res, 400, { ok: false, msg: '잘못된 요청이에요.' });
  }

  if (req.method === 'GET' && FILES[url.pathname]) {
    const file = FILES[url.pathname];
    return fs.readFile(path.join(__dirname, file), (err, data) => {
      if (err) { res.writeHead(500); return res.end(); }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)], 'Cache-Control': 'no-store' });
      res.end(data);
    });
  }
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('없는 주소입니다.');
}).listen(PORT, HOST, () => console.log(`나의 두번째 인생: http://localhost:${PORT}`));
