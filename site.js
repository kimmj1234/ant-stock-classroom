'use strict';
// 메뉴바 오른쪽: 로그인 안 했으면 "로그인"(게임 입장 창으로), 했으면 "프로필 꾸미기"
// 로그인은 HttpOnly 쿠키라 페이지에서 직접 볼 수 없어서, 서버에 내 정보(/api/me)를 물어봄
(async () => {
  const link = document.getElementById('account');
  let me = null;
  try {
    const d = await (await fetch('/api/me', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).json();
    if (d.ok) me = d.me;
  } catch { /* 서버에 못 닿으면 로그인 안 한 것으로 */ }
  if (me) { link.textContent = '프로필 꾸미기'; link.href = '/profile'; }
  else { link.textContent = '로그인'; link.href = '/play'; }
  link.hidden = false;
})();
