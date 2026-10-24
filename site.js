'use strict';
// 이 파일의 이름(ICONS 등)이 게임 그림 코드(pixel.js)와 겹치지 않도록 블록 안에 둠. 밖으로는 window.setAuth만 내놓음
{
// 메뉴바 오른쪽: 로그인 안 했으면 "로그인"(같은 페이지 위쪽 로그인 칸으로), 했으면 "로그아웃"
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
const COLOR = { D: '#8a8a8a', A: '#000' };   // 흑백: 문은 회색, 화살표는 검정
const pixelIcon = rows => `<svg viewBox="0 0 ${rows[0].length} ${rows.length}" width="${rows[0].length * 3}" height="${rows.length * 3}" shape-rendering="crispEdges" aria-hidden="true">${
  rows.flatMap((row, y) => [...row].map((c, x) => (COLOR[c] ? `<rect x="${x}" y="${y}" width="1" height="1" fill="${COLOR[c]}"/>` : ''))).join('')}</svg>`;

const link = document.getElementById('account');
const api = async name => (await fetch('/api/' + name, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).json();
// 로그인 상태가 바뀌면 메뉴를 바꾸고, 페이지(home.html)에도 'auth' 이벤트로 알려 줌 (detail = 내 정보 또는 null)
function show(me) {
  const loggedIn = !!me;
  link.innerHTML = pixelIcon(ICONS[loggedIn ? 'logout' : 'login']) + `<span>${loggedIn ? '로그아웃' : '로그인'}</span>`;
  link.href = loggedIn ? '#' : '#login';
  link.onclick = loggedIn ? async e => { e.preventDefault(); await api('logout').catch(() => {}); show(null); } : null;
  link.hidden = false;
  window.authState = { me };   // 페이지 스크립트가 나중에 붙어도 읽을 수 있게 남겨 둠(이벤트를 놓치는 경우 대비)
  document.dispatchEvent(new CustomEvent('auth', { detail: me }));
}
window.setAuth = show;   // 페이지에서 로그인에 성공하면 불러서 메뉴까지 바꿈
api('me').then(d => show(d.ok ? d.me : null)).catch(() => show(null));   // 서버에 못 닿으면 로그인 안 한 것으로
}
