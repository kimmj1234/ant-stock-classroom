'use strict';
// 메뉴바 오른쪽: 로그인 안 했으면 "로그인"(게임 입장 창으로), 했으면 "로그아웃"
// 로그인은 HttpOnly 쿠키라 페이지에서 직접 볼 수 없어서, 서버에 내 정보(/api/me)를 물어봄

// 로고와 같은 픽셀 그림 아이콘 (D = 문, A = 화살표). 한 칸 = 3px
const ICONS = {
  login: [   // 문 안으로 들어가는 화살표
    '.....DDDD',
    '..A..D..D',
    '...A.D..D',
    'AAAAAAA.D',
    '...A.D..D',
    '..A..D..D',
    '.....DDDD',
  ],
  logout: [  // 문 밖으로 나가는 화살표
    'DDDD.....',
    'D..D..A..',
    'D..D...A.',
    'D.AAAAAAA',
    'D..D...A.',
    'D..D..A..',
    'DDDD.....',
  ],
};
const COLOR = { D: '#000', A: '#e8454b' };
const pixelIcon = rows => `<svg viewBox="0 0 ${rows[0].length} ${rows.length}" width="${rows[0].length * 3}" height="${rows.length * 3}" shape-rendering="crispEdges" aria-hidden="true">${
  rows.flatMap((row, y) => [...row].map((c, x) => (COLOR[c] ? `<rect x="${x}" y="${y}" width="1" height="1" fill="${COLOR[c]}"/>` : ''))).join('')}</svg>`;

const link = document.getElementById('account');
const api = async name => (await fetch('/api/' + name, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).json();
function show(loggedIn) {
  link.innerHTML = pixelIcon(ICONS[loggedIn ? 'logout' : 'login']) + `<span>${loggedIn ? '로그아웃' : '로그인'}</span>`;
  link.href = loggedIn ? '#' : '/play';
  link.onclick = loggedIn ? async e => { e.preventDefault(); await api('logout').catch(() => {}); show(false); } : null;
  link.hidden = false;
}
api('me').then(d => show(!!d.ok)).catch(() => show(false));   // 서버에 못 닿으면 로그인 안 한 것으로
