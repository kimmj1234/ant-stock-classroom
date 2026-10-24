'use strict';
// ===== 고화질 그래픽 (선택 사항) =====
// pixel.js와 같은 지도·좌표(FURN, OUT_FURN, WALLS …)를 부드러운 도형·그라데이션·그림자로 4배 해상도에 그립니다.
// 충돌·상호작용은 pixel.js 그대로라, 그래픽만 바뀝니다. 상단 '그래픽' 메뉴에서 언제든 픽셀로 돌아갈 수 있습니다.
const HD = 4;                       // 방 1칸 = 고화질 캔버스 4px
const INK = 'rgba(43, 29, 20, .9)'; // 윤곽선

// ===== 그리기 도구 =====
function rr(ctx, x, y, w, h, r, fill, stroke, lw = 0.5) {
  ctx.beginPath(); ctx.roundRect(x, y, w, h, r);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
}
function vg(ctx, y0, y1, ...cols) { const g = ctx.createLinearGradient(0, y0, 0, y1); cols.forEach((c, i) => g.addColorStop(i / (cols.length - 1), c)); return g; }
function hg(ctx, x0, x1, ...cols) { const g = ctx.createLinearGradient(x0, 0, x1, 0); cols.forEach((c, i) => g.addColorStop(i / (cols.length - 1), c)); return g; }
function rg(ctx, x, y, r, inner, outer) { const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, inner); g.addColorStop(1, outer); return g; }
function oval(ctx, x, y, rx, ry, fill, stroke, lw = 0.5) {
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
}
const shadow = (ctx, x, y, rx, ry, a = 0.22) => oval(ctx, x, y, rx, ry, `rgba(50, 30, 12, ${a})`);
function line(ctx, pts, color, lw = 0.5) {
  ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke();
}
function text(ctx, s, x, y, size, color, weight = 700) {
  ctx.font = `${weight} ${size}px "Malgun Gothic", "Apple SD Gothic Neo", sans-serif`;
  ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(s, x, y);
}
const WOOD = c => (c === 'dark' ? ['#7a4a26', '#5a331b'] : ['#b07a46', '#8b5a2b']);

// ===== 집 안 바닥·벽 =====
function hdFloor(ctx) {
  const tones = ['#e3c99c', '#dcc092', '#e8d0a6'];
  for (let y = FLOOR_TOP, row = 0; y < ROOM_H; y += 8, row++) {
    for (let x = row % 2 ? -12 : 0, k = row; x < ROOM_W; x += 24, k++) {
      ctx.fillStyle = tones[k % 3]; ctx.fillRect(x, y, 24, 8);
      ctx.fillStyle = 'rgba(120, 80, 40, .2)'; ctx.fillRect(x, y, 0.3, 8);
    }
    ctx.fillStyle = 'rgba(120, 80, 40, .22)'; ctx.fillRect(0, y, ROOM_W, 0.3);
  }
}
function hdWalls(ctx) {
  ctx.fillStyle = vg(ctx, 0, FLOOR_TOP, '#a5553a', '#c26c45'); ctx.fillRect(0, 0, 116, FLOOR_TOP);
  for (let y = 0, r = 0; y < FLOOR_TOP - 4; y += 5, r++) {
    ctx.fillStyle = 'rgba(80, 35, 20, .35)'; ctx.fillRect(0, y, 116, 0.4);
    for (let x = r % 2 ? 6 : 0; x < 116; x += 12) ctx.fillRect(x, y, 0.4, 5);
  }
  ctx.fillStyle = vg(ctx, 0, FLOOR_TOP, '#f5e9c9', '#e6d3a6'); ctx.fillRect(124, 0, 88, FLOOR_TOP);
  for (let x = 127; x < 212; x += 6) { ctx.fillStyle = 'rgba(190, 160, 100, .25)'; ctx.fillRect(x, 0, 1.5, FLOOR_TOP - 4); }
  ctx.fillStyle = vg(ctx, 0, FLOOR_TOP, '#dcecd4', '#c6dbbd'); ctx.fillRect(220, 0, 100, FLOOR_TOP);
  for (let x = 223; x < 320; x += 6) { ctx.fillStyle = 'rgba(130, 170, 120, .25)'; ctx.fillRect(x, 0, 1.5, FLOOR_TOP - 4); }
  ctx.fillStyle = vg(ctx, FLOOR_TOP - 4, FLOOR_TOP, '#a8763f', '#6b4226'); ctx.fillRect(0, FLOOR_TOP - 4, ROOM_W, 4);
  ctx.fillStyle = vg(ctx, FLOOR_TOP, FLOOR_TOP + 7, 'rgba(70, 40, 15, .28)', 'rgba(70, 40, 15, 0)'); ctx.fillRect(0, FLOOR_TOP, ROOM_W, 7);
  for (const w of WALLS) {
    rr(ctx, w.x, w.y, w.w, w.h, 0.8, w.w > w.h ? vg(ctx, w.y, w.y + w.h, '#a8763f', '#6b4226') : hg(ctx, w.x, w.x + w.w, '#6b4226', '#a8763f', '#6b4226'));
  }
}

// ===== 집 안 가구 =====
const HD_IN = {
  rug(ctx, f) {
    rr(ctx, f.x, f.y, f.w, f.h, 3, '#c9ad74');
    rr(ctx, f.x + 2, f.y + 2, f.w - 4, f.h - 4, 2, vg(ctx, f.y, f.y + f.h, '#dcc58f', '#d0b67d'));
    ctx.setLineDash([2, 1.5]); rr(ctx, f.x + 4.5, f.y + 4.5, f.w - 9, f.h - 9, 1.5, null, '#a88f55', 0.5); ctx.setLineDash([]);
    oval(ctx, f.x + f.w / 2, f.y + f.h / 2, f.w / 6, f.h / 6, null, 'rgba(160, 130, 70, .6)', 0.5);
  },
  bookshelf(ctx, f) {
    shadow(ctx, f.x + f.w / 2, f.y + f.h, f.w / 2 + 2, 2);
    rr(ctx, f.x, f.y, f.w, f.h, 1.5, vg(ctx, f.y, f.y + f.h, '#a06a3a', '#7a4a26'), INK);
    rr(ctx, f.x + 2, f.y + 2, f.w - 4, f.h - 4, 1, '#5a331b');
    const colors = ['#d9534f', '#3b82f6', '#22a35a', '#f2c230', '#8a76b8', '#e08a3c', '#2fa5a0'];
    for (let s = 0; s < 3; s++) {
      const base = f.y + 12 + s * 11;
      rr(ctx, f.x + 1.5, base, f.w - 3, 1.6, 0.4, '#b07a46');
      for (let bx = f.x + 3, i = s * 5; bx < f.x + f.w - 4; bx += 3.6, i++) {
        const bh = 6.5 + (i * 7) % 3, c = colors[i % colors.length];
        rr(ctx, bx, base - bh, 3, bh, 0.6, vg(ctx, base - bh, base, c, c), 'rgba(0, 0, 0, .25)', 0.25);
        ctx.fillStyle = 'rgba(255, 255, 255, .5)'; ctx.fillRect(bx + 0.6, base - bh + 1.2, 1.8, 0.5);
      }
    }
  },
  clock(ctx, f, v) {
    const cx = f.x + 8, cy = f.y + 8;
    oval(ctx, cx + 0.6, cy + 0.8, 7.6, 7.6, 'rgba(0, 0, 0, .2)');
    oval(ctx, cx, cy, 7.6, 7.6, hg(ctx, f.x, f.x + 16, '#8b5a2b', '#c08a52'), INK);
    oval(ctx, cx, cy, 6.2, 6.2, rg(ctx, cx - 2, cy - 2, 8, '#ffffff', '#ece6d8'));
    for (let k = 0; k < 12; k++) {
      const a = k / 12 * Math.PI * 2, r0 = k % 3 ? 5.2 : 4.6;
      line(ctx, [[cx + Math.sin(a) * r0, cy - Math.cos(a) * r0], [cx + Math.sin(a) * 5.8, cy - Math.cos(a) * 5.8]], k % 3 ? '#9a9a9a' : '#c0392b', k % 3 ? 0.3 : 0.6);
    }
    const ha = ((v.clock / 60) % 12) / 12 * Math.PI * 2, ma = (v.clock % 60) / 60 * Math.PI * 2;
    line(ctx, [[cx, cy], [cx + Math.sin(ha) * 3.4, cy - Math.cos(ha) * 3.4]], '#2b1d14', 0.8);
    line(ctx, [[cx, cy], [cx + Math.sin(ma) * 5, cy - Math.cos(ma) * 5]], '#2f6fe0', 0.5);
    oval(ctx, cx, cy, 0.7, 0.7, '#c0392b');
  },
  doormat(ctx, f) {
    rr(ctx, f.x, f.y, f.w, f.h, 1.5, '#7a4a26');
    rr(ctx, f.x + 1.5, f.y + 1.5, f.w - 3, f.h - 3, 1, vg(ctx, f.y, f.y + f.h, '#b58552', '#9c6a3f'));
    ctx.beginPath(); ctx.moveTo(f.x + f.w / 2 - 3, f.y + 3); ctx.lineTo(f.x + f.w / 2 + 3, f.y + 3); ctx.lineTo(f.x + f.w / 2, f.y + 7); ctx.closePath();
    ctx.fillStyle = '#ffd23f'; ctx.fill();
  },
  window: hdWindow,
  plant: hdPlant,
  desk(ctx, f, v) {
    shadow(ctx, f.x + f.w / 2, f.y + f.h, f.w / 2 + 2, 2.5);
    rr(ctx, f.x + 2, f.y + 9, 2.6, f.h - 9, 0.6, '#5a331b'); rr(ctx, f.x + f.w - 4.6, f.y + 9, 2.6, f.h - 9, 0.6, '#5a331b');
    rr(ctx, f.x, f.y + 4, f.w, 7, 1.2, vg(ctx, f.y + 4, f.y + 11, '#c08a52', '#8b5a2b'), INK);
    rr(ctx, f.x + 1, f.y + 4.6, f.w - 2, 1, 0.5, 'rgba(255, 255, 255, .25)');
    const mx = f.x + 13, my = f.y - 13;
    rr(ctx, mx + 8.5, my + 14.5, 5, 3, 0.6, '#9aa3b5');
    rr(ctx, mx, my, 24, 16, 1.5, vg(ctx, my, my + 16, '#3a3f4b', '#1b1d24'), INK);
    rr(ctx, mx + 1.5, my + 1.5, 21, 12, 0.8, vg(ctx, my, my + 14, '#0f2a4a', '#0a1a33'));
    const h = v.hist.slice(-20);
    if (h.length > 1) {
      const lo = Math.min(...h), sp = Math.max(...h) - lo || 1, up = h[h.length - 1] >= h[0];
      line(ctx, h.map((p, i) => [mx + 2.5 + i * (19 / (h.length - 1)), my + 12 - (p - lo) / sp * 9]), up ? '#ff6b6b' : '#6ba8ff', 0.6);
    }
    oval(ctx, mx + 12, my + 7, 13, 9, 'rgba(120, 180, 255, .06)');
    rr(ctx, mx + 2, f.y + 5.6, 18, 3, 0.8, '#3a3f4b'); for (let i = 0; i < 6; i++) rr(ctx, mx + 3 + i * 2.8, f.y + 6.3, 2, 0.8, 0.2, '#6b7280');
    rr(ctx, f.x + 40, f.y + 2.5, 5, 5.5, 1, vg(ctx, f.y, f.y + 8, '#ffffff', '#d9dde6'), INK, 0.3);
    oval(ctx, f.x + 42.5, f.y + 3, 2, 0.8, '#6b3f22');
  },
  catbed(ctx, f) {
    shadow(ctx, f.x + f.w / 2, f.y + f.h - 1, f.w / 2 + 1, 2.5);
    oval(ctx, f.x + f.w / 2, f.y + f.h / 2 + 3, f.w / 2, f.h / 2 - 2, vg(ctx, f.y, f.y + f.h, '#d9b47c', '#a8814c'), INK);
    oval(ctx, f.x + f.w / 2, f.y + f.h / 2 + 3, f.w / 2 - 3, f.h / 2 - 4.5, '#efdcb6');
    const cx = f.x + f.w / 2, cy = f.y + f.h / 2 + 2;
    line(ctx, [[cx - 6, cy + 3], [cx - 9, cy + 1], [cx - 8, cy - 2]], '#7a5a40', 1.4);
    oval(ctx, cx - 1, cy + 2, 6.5, 3.6, vg(ctx, cy - 2, cy + 6, '#f6eee0', '#e2d4bc'));
    oval(ctx, cx + 5, cy, 3.6, 3.2, '#7a5a40');
    [[cx + 2.6, cy - 2.2], [cx + 6.6, cy - 2.4]].forEach(([x, y]) => { ctx.beginPath(); ctx.moveTo(x - 1.2, y + 1); ctx.lineTo(x, y - 1.6); ctx.lineTo(x + 1.2, y + 1); ctx.fillStyle = '#5a3b2a'; ctx.fill(); });
    line(ctx, [[cx + 3.4, cy + 0.2], [cx + 4.4, cy + 0.6]], '#2b1d14', 0.35); line(ctx, [[cx + 5.8, cy + 0.6], [cx + 6.8, cy + 0.2]], '#2b1d14', 0.35);
  },
  pad(ctx, f, v) {
    const c = BODY[f.color].r;
    rr(ctx, f.x, f.y, f.w, f.h, 2, '#6b4226');
    rr(ctx, f.x + 1.5, f.y + 1.5, f.w - 3, f.h - 3, 1.5, vg(ctx, f.y, f.y + f.h, c, c), 'rgba(0, 0, 0, .25)', 0.3);
    rr(ctx, f.x + 2.5, f.y + 2.5, f.w - 5, 2, 1, 'rgba(255, 255, 255, .4)');
    if (v.myColor === f.color) rr(ctx, f.x - 0.8, f.y - 0.8, f.w + 1.6, f.h + 1.6, 2.5, null, '#ffd23f', 0.9);
  },
  chalkboard(ctx, f) {
    rr(ctx, f.x, f.y, f.w, f.h, 1.2, vg(ctx, f.y, f.y + f.h, '#c08a52', '#8b5a2b'), INK);
    rr(ctx, f.x + 2, f.y + 2, f.w - 4, f.h - 5, 0.6, vg(ctx, f.y, f.y + f.h, '#2f6a44', '#24533a'));
    for (let i = 0; i < 4; i++) line(ctx, [[f.x + 5, f.y + 6 + i * 4], [f.x + 7 + (i * 9) % 14 + 4, f.y + 6 + i * 4]], 'rgba(235, 245, 235, .75)', 0.5);
    rr(ctx, f.x + 2, f.y + f.h - 3, f.w - 4, 1.4, 0.4, '#7a4a26'); rr(ctx, f.x + f.w - 9, f.y + f.h - 3.6, 3, 0.9, 0.3, '#ffffff');
  },
  tv(ctx, f, v) {
    shadow(ctx, f.x + f.w / 2, f.y + f.h, f.w / 2 + 1, 2);
    rr(ctx, f.x, f.y + f.h - 10, f.w, 10, 1.2, vg(ctx, f.y + f.h - 10, f.y + f.h, '#a06a3a', '#7a4a26'), INK);
    rr(ctx, f.x + 2, f.y + f.h - 6, f.w / 2 - 3, 4, 0.6, 'rgba(0, 0, 0, .18)'); rr(ctx, f.x + f.w / 2 + 1, f.y + f.h - 6, f.w / 2 - 3, 4, 0.6, 'rgba(0, 0, 0, .18)');
    rr(ctx, f.x + 2, f.y, f.w - 4, f.h - 10, 1.8, vg(ctx, f.y, f.y + f.h - 10, '#3a3f4b', '#1b1d24'), INK);
    rr(ctx, f.x + 4, f.y + 2, f.w - 8, f.h - 14, 1, vg(ctx, f.y, f.y + f.h - 12, '#2a5a9a', '#173765'));
    rr(ctx, f.x + 4, f.y + f.h - 16, f.w - 8, 3, 0, '#d9534f');
    line(ctx, [[f.x + 7, f.y + 5.5], [f.x + 17, f.y + 5.5]], '#ffffff', 0.7); line(ctx, [[f.x + 7, f.y + 8.5], [f.x + 23, f.y + 8.5]], 'rgba(255, 255, 255, .8)', 0.6);
    line(ctx, [[f.x + 7, f.y + 11.5], [f.x + 19, f.y + 11.5]], '#9ec5ff', 0.6);
    rr(ctx, f.x + 4, f.y + 2, f.w - 8, 3, 1, 'rgba(255, 255, 255, .08)');
    if (v.unread) {
      const bx = f.x + f.w - 9, by = f.y - 11 - (v.blink ? 1 : 0);
      ctx.save(); ctx.shadowColor = 'rgba(224, 62, 62, .6)'; ctx.shadowBlur = 3;
      rr(ctx, bx, by, 9, 9, 2.5, '#ffffff', '#d9534f', 0.6); ctx.restore();
      text(ctx, '!', bx + 4.5, by + 4.8, 7, '#d9534f', 900);
    }
  },
  table(ctx, f) {
    shadow(ctx, f.x + f.w / 2, f.y + f.h, f.w / 2 + 1, 2);
    rr(ctx, f.x + 2, f.y + 7, 2, f.h - 7, 0.5, '#5a331b'); rr(ctx, f.x + f.w - 4, f.y + 7, 2, f.h - 7, 0.5, '#5a331b');
    rr(ctx, f.x, f.y, f.w, 8.5, 1.5, vg(ctx, f.y, f.y + 8.5, '#c08a52', '#8b5a2b'), INK);
    rr(ctx, f.x + 5, f.y + 1.8, 5, 5, 1, vg(ctx, f.y, f.y + 7, '#ffffff', '#d9dde6'), INK, 0.3); oval(ctx, f.x + 7.5, f.y + 2.6, 1.8, 0.7, '#6b3f22');
    ctx.save(); ctx.translate(f.x + 20, f.y + 4.5); ctx.rotate(-0.12); rr(ctx, -4.5, -2.5, 9, 5, 0.4, '#fffbea', 'rgba(0, 0, 0, .3)', 0.25);
    line(ctx, [[-3, -1], [3, -1]], '#9aa3b5', 0.3); line(ctx, [[-3, 0.6], [2, 0.6]], '#9aa3b5', 0.3); ctx.restore();
  },
  armchair(ctx, f) {
    shadow(ctx, f.x + f.w / 2, f.y + f.h, f.w / 2 + 1, 2);
    rr(ctx, f.x, f.y, f.w, f.h, 3, vg(ctx, f.y, f.y + f.h, '#e6d6b2', '#c9b68c'), INK);
    rr(ctx, f.x + 3, f.y + 3, f.w - 6, f.h - 7, 2, vg(ctx, f.y, f.y + f.h, '#fbf2dc', '#eadcbc'));
    rr(ctx, f.x + 3.5, f.y + 3.5, f.w - 7, 2, 1, 'rgba(255, 255, 255, .6)');
  },
  cabinet(ctx, f) {
    shadow(ctx, f.x + f.w / 2, f.y + f.h, f.w / 2 + 1, 2);
    rr(ctx, f.x, f.y, f.w, f.h, 1.5, hg(ctx, f.x, f.x + f.w, '#8a93a5', '#b9c1cf', '#8a93a5'), INK);
    for (let i = 0; i < 3; i++) {
      const dy = f.y + 3 + i * 10;
      rr(ctx, f.x + 2.5, dy, f.w - 5, 8.5, 1, vg(ctx, dy, dy + 8.5, '#d4dae4', '#aab3c3'), 'rgba(0, 0, 0, .3)', 0.3);
      rr(ctx, f.x + f.w / 2 - 3.5, dy + 3.6, 7, 1.4, 0.7, '#4b5563');
      rr(ctx, f.x + 5, dy + 1.5, 6, 2.2, 0.3, '#ffffff');
    }
  },
  bed(ctx, f) {
    shadow(ctx, f.x + f.w / 2, f.y + f.h, f.w / 2 + 2, 2.5);
    rr(ctx, f.x, f.y, f.w, f.h, 2.5, vg(ctx, f.y, f.y + f.h, '#a06a3a', '#7a4a26'), INK);
    rr(ctx, f.x + 2.5, f.y + 4, f.w - 5, f.h - 6, 2, '#f7f2e6');
    rr(ctx, f.x + 5, f.y + 5.5, f.w - 10, 9, 3, vg(ctx, f.y + 5, f.y + 15, '#ffffff', '#dfe3ea'), 'rgba(0, 0, 0, .2)', 0.3);
    rr(ctx, f.x + 2.5, f.y + 17, f.w - 5, f.h - 19, 2, vg(ctx, f.y + 17, f.y + f.h, '#7aa7d9', '#4f7fbf'));
    rr(ctx, f.x + 2.5, f.y + 17, f.w - 5, 3, 1.5, 'rgba(255, 255, 255, .35)');
    for (let i = 0; i < 3; i++) line(ctx, [[f.x + 6, f.y + 26 + i * 10], [f.x + f.w / 2, f.y + 27.5 + i * 10], [f.x + f.w - 6, f.y + 26 + i * 10]], 'rgba(30, 60, 110, .25)', 0.5);
  },
  lamp(ctx, f) {
    shadow(ctx, f.x + f.w / 2, f.y + f.h, f.w / 2 + 1, 1.6);
    rr(ctx, f.x, f.y + 6, f.w, f.h - 6, 1.2, vg(ctx, f.y + 6, f.y + f.h, '#a06a3a', '#7a4a26'), INK);
    rr(ctx, f.x + 6, f.y + 1, 2, 6, 0.4, '#5a331b');
    oval(ctx, f.x + 7, f.y - 1, 8, 6, 'rgba(255, 220, 120, .18)');
    ctx.beginPath(); ctx.moveTo(f.x + 3, f.y + 2); ctx.lineTo(f.x + 11, f.y + 2); ctx.lineTo(f.x + 9.5, f.y - 4); ctx.lineTo(f.x + 4.5, f.y - 4); ctx.closePath();
    ctx.fillStyle = vg(ctx, f.y - 4, f.y + 2, '#fff3c4', '#f2d27a'); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 0.4; ctx.stroke();
  },
};

// 창문: 오늘 날씨·밤
function hdWindow(ctx, f, v) {
  rr(ctx, f.x, f.y, f.w, f.h, 1.2, vg(ctx, f.y, f.y + f.h, '#d19a5e', '#9c6a3f'), INK);
  const ix = f.x + 2, iy = f.y + 2, iw = f.w - 4, ih = f.h - 4, w = v.weather;
  const sky = v.flash ? ['#c0392b', '#e06650'] : v.night ? ['#0f1633', '#2a3266'] : SKY[w] || SKY.sunny;
  ctx.save(); ctx.beginPath(); ctx.rect(ix, iy, iw, ih); ctx.clip();
  ctx.fillStyle = vg(ctx, iy, iy + ih, sky[0], sky[1]); ctx.fillRect(ix, iy, iw, ih);
  if (v.night) { oval(ctx, ix + iw - 6, iy + 5, 2.6, 2.6, '#f5f0d0'); oval(ctx, ix + iw - 5, iy + 4.4, 2.2, 2.2, sky[0]); [[4, 3], [10, 7], [16, 4]].forEach(([x, y]) => oval(ctx, ix + x, iy + y, 0.4, 0.4, '#ffffff')); }
  else if (w === 'sunny' || w === 'heat' || w === 'cold') {
    const sx = ix + 5 + (v.day * 3) % (iw - 10), r = w === 'heat' ? 3.6 : 3;
    oval(ctx, sx, iy + 5, r * 2.2, r * 2.2, rg(ctx, sx, iy + 5, r * 2.2, 'rgba(255, 230, 120, .6)', 'rgba(255, 230, 120, 0)'));
    oval(ctx, sx, iy + 5, r, r, w === 'heat' ? '#ff7a1a' : '#ffd23f');
  }
  if (['cloudy', 'rain', 'downpour', 'typhoon', 'snow'].includes(w)) {
    const cc = w === 'typhoon' || w === 'downpour' ? '#4a5260' : '#f2f5f8';
    [[6, 5, 4], [10, 4, 4.5], [14, 5.5, 3.5], [24, 7, 3.4], [27, 6, 3]].forEach(([x, y, r]) => oval(ctx, ix + x, iy + y, r, r * 0.8, cc));
  }
  const fall = { rain: ['rgba(200, 225, 255, .8)', 3], downpour: ['rgba(170, 205, 255, .9)', 2], typhoon: ['rgba(170, 205, 255, .9)', 1.6], snow: ['#ffffff', 3.5], cold: ['#ffffff', 5], dust: ['rgba(168, 146, 92, .7)', 2.5] }[w];
  if (fall) {
    for (let x = 0; x < iw; x += fall[1]) {
      const y = (x * 7 + v.anim * (w === 'typhoon' ? 2 : 1)) % ih;
      if (w === 'snow' || w === 'cold' || w === 'dust') oval(ctx, ix + x, iy + y, 0.5, 0.5, fall[0]);
      else line(ctx, [[ix + x, iy + y], [ix + x - (w === 'typhoon' ? 2 : 0.6), iy + y + 2.4]], fall[0], 0.35);
    }
  }
  rr(ctx, ix, iy, iw, ih / 3, 0, 'rgba(255, 255, 255, .12)');
  ctx.restore();
  ctx.fillStyle = '#b07a46'; ctx.fillRect(f.x + f.w / 2 - 0.8, f.y + 1, 1.6, f.h - 2); ctx.fillRect(f.x + 1, f.y + f.h / 2 - 0.8, f.w - 2, 1.6);
  rr(ctx, f.x - 1, f.y + f.h - 1, f.w + 2, 2, 0.6, '#8b5a2b');
}
function hdPlant(ctx, f) {
  const cx = f.x + f.w / 2;
  shadow(ctx, cx, f.y + f.h, f.w / 2 + 1, 1.8);
  ctx.beginPath(); ctx.moveTo(f.x + 2, f.y + f.h - 8); ctx.lineTo(f.x + f.w - 2, f.y + f.h - 8); ctx.lineTo(f.x + f.w - 3.5, f.y + f.h); ctx.lineTo(f.x + 3.5, f.y + f.h); ctx.closePath();
  ctx.fillStyle = hg(ctx, f.x, f.x + f.w, '#a8532c', '#d9784a', '#a8532c'); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 0.4; ctx.stroke();
  rr(ctx, f.x + 1.5, f.y + f.h - 9, f.w - 3, 2, 0.6, '#b85f35');
  const leaves = [[-4, 5, -0.6, '#2f6b2a'], [4, 5, 0.6, '#2f6b2a'], [-2.5, 2, -0.3, '#4f9a3f'], [2.5, 2.4, 0.35, '#4f9a3f'], [0, 0.5, 0, '#62b14f'], [-5.5, 8, -1, '#3f8f3a'], [5.5, 8, 1, '#3f8f3a']];
  for (const [dx, dy, rot, c] of leaves) {
    ctx.save(); ctx.translate(cx + dx, f.y + dy + 2); ctx.rotate(rot);
    oval(ctx, 0, 0, 2, 4.6, c); line(ctx, [[0, -3.8], [0, 3.8]], 'rgba(255, 255, 255, .25)', 0.25); ctx.restore();
  }
}

// ===== 집 밖 =====
function hdOutsideBase(ctx, v) {
  const sky = skyOf(v.clock);
  ctx.fillStyle = vg(ctx, 0, 26, sky[0], sky[1]); ctx.fillRect(0, 0, ROOM_W, 26);
  for (let x = -4, k = 0; x < ROOM_W + 8; x += 9, k++) oval(ctx, x, 30 + (k % 2) * 1.5, 7, 7, k % 2 ? '#3f8f3a' : '#2f7a2c');
  ctx.fillStyle = vg(ctx, 40, ROOM_H, '#82c55e', '#6aaf4c'); ctx.fillRect(0, 36, ROOM_W, ROOM_H - 36);
  for (let i = 0; i < 70; i++) {
    const x = (i * 53) % ROOM_W, y = 44 + (i * 37) % (ROOM_H - 46);
    line(ctx, [[x, y + 2], [x - 0.6, y]], 'rgba(40, 110, 40, .45)', 0.35); line(ctx, [[x + 1, y + 2], [x + 1.4, y - 0.4]], 'rgba(40, 110, 40, .45)', 0.35);
  }
  rr(ctx, 0, 92, ROOM_W, 16, 0, vg(ctx, 92, 108, '#dcd5c3', '#c9c1ab'));
  for (let x = 0; x < ROOM_W; x += 16) { ctx.fillStyle = 'rgba(120, 110, 90, .35)'; ctx.fillRect(x, 92, 0.4, 16); }
  ctx.fillStyle = 'rgba(120, 110, 90, .35)'; ctx.fillRect(0, 100, ROOM_W, 0.4);
  for (let y = 42, k = 0; y < ROOM_H; y += 8, k++) {
    rr(ctx, HOUSE_DOOR[0] + 0.5, y, (HOUSE_DOOR[1] - HOUSE_DOOR[0]) / 2 - 1, 7.2, 1.2, k % 2 ? '#cfc8b4' : '#c4bca6', 'rgba(0, 0, 0, .12)', 0.25);
    rr(ctx, HOUSE_DOOR[0] + (HOUSE_DOOR[1] - HOUSE_DOOR[0]) / 2 + 0.5, y, (HOUSE_DOOR[1] - HOUSE_DOOR[0]) / 2 - 1, 7.2, 1.2, k % 2 ? '#c4bca6' : '#cfc8b4', 'rgba(0, 0, 0, .12)', 0.25);
  }
}
const HD_OUT = {
  house(ctx, f, v) {
    shadow(ctx, f.x + f.w / 2, f.y + f.h + 1, f.w / 2 + 4, 3, 0.25);
    ctx.fillStyle = vg(ctx, f.y, f.y + f.h, '#b45f3a', '#9a4e30'); ctx.fillRect(f.x, f.y + 6, f.w, f.h - 6);
    for (let y = f.y + 8, r = 0; y < f.y + f.h; y += 4.5, r++) {
      ctx.fillStyle = 'rgba(70, 30, 18, .35)'; ctx.fillRect(f.x, y, f.w, 0.35);
      for (let x = f.x + (r % 2 ? 5 : 0); x < f.x + f.w; x += 10) ctx.fillRect(x, y, 0.35, 4.5);
    }
    ctx.beginPath(); ctx.moveTo(f.x - 6, f.y + 10); ctx.lineTo(f.x + 8, f.y - 2); ctx.lineTo(f.x + f.w - 8, f.y - 2); ctx.lineTo(f.x + f.w + 6, f.y + 10); ctx.closePath();
    ctx.fillStyle = vg(ctx, f.y - 2, f.y + 10, '#6b2f22', '#8a3b2a'); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 0.5; ctx.stroke();
    for (let x = f.x; x < f.x + f.w; x += 5) line(ctx, [[x, f.y + 1], [x - 1, f.y + 9]], 'rgba(0, 0, 0, .18)', 0.35);
    const glow = darkness(v.clock) ? '#ffe08a' : '#fff6d6';
    [f.x + 12, f.x + f.w - 30].forEach(x => {
      rr(ctx, x, f.y + 14, 18, 14, 1, '#c08a52', INK);
      rr(ctx, x + 1.5, f.y + 15.5, 15, 11, 0.6, vg(ctx, f.y + 15, f.y + 27, glow, darkness(v.clock) ? '#f2b84b' : '#cfe6f5'));
      ctx.fillStyle = '#c08a52'; ctx.fillRect(x + 8.2, f.y + 15, 1.6, 12); ctx.fillRect(x + 1, f.y + 20.3, 16, 1.4);
      rr(ctx, x - 1, f.y + 27.5, 20, 1.8, 0.5, '#7a4a26');
    });
    const dx = HOUSE_DOOR[0], dw = HOUSE_DOOR[1] - HOUSE_DOOR[0];
    rr(ctx, dx - 1.5, f.y + 20.5, dw + 3, 24, 1.5, '#7a4a26');
    rr(ctx, dx, f.y + 22, dw, 22, 1, vg(ctx, f.y + 22, f.y + 44, '#8b5a2b', '#5a331b'), INK);
    rr(ctx, dx + 3, f.y + 25, dw / 2 - 4.5, 7, 0.6, 'rgba(0, 0, 0, .18)'); rr(ctx, dx + dw / 2 + 1.5, f.y + 25, dw / 2 - 4.5, 7, 0.6, 'rgba(0, 0, 0, .18)');
    oval(ctx, dx + dw - 4, f.y + 34, 1, 1, '#f2c230');
    rr(ctx, dx - 3, f.y + 43, dw + 6, 2.4, 0.6, '#9a958a');
  },
  store(ctx, f, v) {
    shadow(ctx, f.x + f.w / 2, f.y + f.h + 1, f.w / 2 + 2, 3, 0.25);
    rr(ctx, f.x, f.y, f.w, f.h, 1.5, vg(ctx, f.y, f.y + f.h, '#fbfbf7', '#e2e2da'), INK);
    rr(ctx, f.x, f.y, f.w, 11, 1.5, vg(ctx, f.y, f.y + 11, '#2fb168', '#20844b'), INK);
    text(ctx, '24', f.x + 9, f.y + 5.8, 7.5, '#ffffff', 900); text(ctx, '개미 편의점', f.x + f.w / 2 + 6, f.y + 5.8, 5, '#ffffff', 800);
    for (let i = 0; i < 11; i++) rr(ctx, f.x + i * 8, f.y + 11, 8, 3.5, 0, i % 2 ? '#f08a24' : '#ffffff');
    [f.x + 5, f.x + f.w - 32].forEach(x => {
      rr(ctx, x, f.y + 18, 27, 21, 0.8, vg(ctx, f.y + 18, f.y + 39, darkness(v.clock) ? '#fff2b0' : '#cbe9fb', darkness(v.clock) ? '#f2d27a' : '#9fd3f0'), INK);
      for (let s = 0; s < 2; s++) { rr(ctx, x + 2, f.y + 26 + s * 7, 23, 0.8, 0, '#9aa3b5'); for (let i = 0; i < 5; i++) rr(ctx, x + 3 + i * 4.6, f.y + 22.6 + s * 7, 3, 3.4, 0.4, ['#d9534f', '#f2c230', '#3b82f6', '#22a35a', '#f08a24'][(i + s) % 5]); }
      rr(ctx, x + 1, f.y + 19, 25, 3, 0.5, 'rgba(255, 255, 255, .35)');
    });
    rr(ctx, f.x + f.w / 2 - 9, f.y + 28, 18, f.h - 28, 0.6, vg(ctx, f.y + 28, f.y + f.h, '#d5eefc', '#9fd3f0'), INK);
    line(ctx, [[f.x + f.w / 2, f.y + 28], [f.x + f.w / 2, f.y + f.h]], INK, 0.4);
  },
  bank(ctx, f, v) {
    shadow(ctx, f.x + f.w / 2, f.y + f.h + 1, f.w / 2 + 2, 3, 0.25);
    rr(ctx, f.x, f.y + 8, f.w, f.h - 8, 1, vg(ctx, f.y, f.y + f.h, '#ece6d6', '#cfc7b2'), INK);
    ctx.beginPath(); ctx.moveTo(f.x - 3, f.y + 10); ctx.lineTo(f.x + f.w / 2, f.y - 3); ctx.lineTo(f.x + f.w + 3, f.y + 10); ctx.closePath();
    ctx.fillStyle = vg(ctx, f.y - 3, f.y + 10, '#b5ad98', '#958d78'); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 0.5; ctx.stroke();
    oval(ctx, f.x + f.w / 2, f.y + 4.5, 3.6, 3.6, rg(ctx, f.x + f.w / 2 - 1, f.y + 3.5, 4, '#ffe58a', '#d9a520'), INK, 0.35);
    text(ctx, '₩', f.x + f.w / 2, f.y + 4.7, 4.2, '#7a5a10', 900);
    text(ctx, '개미은행', f.x + f.w / 2, f.y + 13.5, 5, '#5a5444', 800);
    for (let i = 0; i < 4; i++) {
      const cx = f.x + 10 + i * 22;
      rr(ctx, cx - 3.5, f.y + 17, 7, f.h - 21, 0.8, hg(ctx, cx - 3.5, cx + 3.5, '#d9d2bf', '#ffffff', '#cfc7b2'));
      rr(ctx, cx - 4.5, f.y + 16, 9, 1.8, 0.4, '#bdb5a0'); rr(ctx, cx - 4.5, f.y + f.h - 5, 9, 1.8, 0.4, '#bdb5a0');
    }
    rr(ctx, f.x + f.w / 2 - 8, f.y + 28, 16, f.h - 30, 1, vg(ctx, f.y + 28, f.y + f.h, '#5a4a38', '#3a2f24'), INK);
    if (darkness(v.clock)) rr(ctx, f.x + f.w / 2 - 6, f.y + 30, 12, 6, 0.6, 'rgba(255, 220, 120, .35)');
    rr(ctx, f.x - 2, f.y + f.h - 3, f.w + 4, 3, 0.6, '#a39b86');
  },
  tree(ctx, f) {
    shadow(ctx, f.x + f.w / 2, f.y + f.h, f.w / 2 + 3, 2.6, 0.25);
    rr(ctx, f.x + f.w / 2 - 1.8, f.y + 10, 3.6, f.h - 10, 1, hg(ctx, f.x + f.w / 2 - 2, f.x + f.w / 2 + 2, '#5a3b22', '#8a5a34'));
    [[0, 6, 7, '#2f7a2c'], [-4, 8, 5, '#3a8a34'], [4, 8, 5, '#3a8a34'], [0, 3, 5.5, '#4f9a3f'], [-2, 2, 2.6, '#6fbf55']].forEach(([dx, dy, r, c]) => oval(ctx, f.x + f.w / 2 + dx, f.y + dy, r, r * 0.9, c));
  },
  bench(ctx, f) {
    shadow(ctx, f.x + f.w / 2, f.y + f.h, f.w / 2 + 1, 1.6);
    rr(ctx, f.x + 2, f.y + 5, 1.4, 5, 0.4, '#3a3f4b'); rr(ctx, f.x + f.w - 3.4, f.y + 5, 1.4, 5, 0.4, '#3a3f4b');
    for (let i = 0; i < 3; i++) rr(ctx, f.x, f.y + i * 2.4, f.w, 2, 0.8, vg(ctx, f.y + i * 2.4, f.y + i * 2.4 + 2, '#c08a52', '#8b5a2b'), 'rgba(0, 0, 0, .3)', 0.25);
  },
  lamp(ctx, f, v) {
    const on = darkness(v.clock);
    shadow(ctx, f.x + 2, f.y + f.h, 3, 1);
    rr(ctx, f.x + 1, f.y + 4, 2, f.h - 4, 0.6, hg(ctx, f.x + 1, f.x + 3, '#2b2f38', '#5a6070'));
    rr(ctx, f.x - 1.5, f.y - 0.5, 7, 5, 1.5, on ? '#ffe9a0' : '#c9ced8', INK, 0.4);
    if (on) oval(ctx, f.x + 2, f.y + 2, 9, 9, rg(ctx, f.x + 2, f.y + 2, 9, 'rgba(255, 230, 150, .55)', 'rgba(255, 230, 150, 0)'));
  },
  billboard(ctx, f) {
    shadow(ctx, f.x + f.w / 2, f.y + f.h, f.w / 2, 2.4, 0.25);
    [f.x + 14, f.x + f.w - 18].forEach(x => rr(ctx, x, f.y + 46, 4, f.h - 46, 0.8, hg(ctx, x, x + 4, '#2b2f38', '#5a6070')));
    rr(ctx, f.x, f.y, f.w, 52, 2, vg(ctx, f.y, f.y + 52, '#3a3f4b', '#1f2229'), INK, 0.6);
    rr(ctx, f.screen.x, f.screen.y, f.screen.w, f.screen.h, 1, '#05080f');
    rr(ctx, f.x + 3, f.y + 1, f.w - 6, 1, 0.5, '#ffd23f');
  },
};

// ===== 사람 캐릭터 =====
function lighten(hex, k) {
  const n = parseInt(hex.slice(1), 16), c = [n >> 16, (n >> 8) & 255, n & 255].map(x => Math.round(x + (255 - x) * k));
  return `rgb(${c.join(',')})`;
}
function darken(hex, k) {
  const n = parseInt(hex.slice(1), 16), c = [n >> 16, (n >> 8) & 255, n & 255].map(x => Math.round(x * (1 - k)));
  return `rgb(${c.join(',')})`;
}
const SKIN = '#f3cba5', HAIR = '#4a2f1c', PANTS = '#2b2f38';
// 고화질 캐릭터 그림 (assets/person-색.png, 재킷 색만 다른 5장). 불러오기 전에는 아래 도형 캐릭터로 그림
const PERSON_IMG = {};
for (const c of ['red', 'blue', 'yellow', 'white', 'black']) { const im = new Image(); im.src = `assets/person-${c}.png`; PERSON_IMG[c] = im; }
const PERSON_H = 24;   // 방 칸 기준 키
const MOOD_ICON = { happy: ['♪', '#e0a800'], sad: ['💧', '#3b82f6'], shock: ['❗', '#d9534f'], sleep: ['Z', '#6f6aa8'] };
function hdPerson(ctx, a) {
  const im = PERSON_IMG[a.color] || PERSON_IMG.red;
  if (!im.complete || !im.naturalWidth) return hdPersonShapes(ctx, a);
  const h = PERSON_H * (a.bob ? 0.97 : 1), w = PERSON_H * im.naturalWidth / im.naturalHeight * (a.bob ? 1.03 : 1);
  shadow(ctx, a.x, a.y - 0.4, w * 0.5, 1.5, 0.3);   // 그림 아래 끝 = 발끝, 가운데 = 몸 가운데
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(im, a.x - w / 2, a.y - h - (a.bob ? 0.6 : 0), w, h);
  const icon = MOOD_ICON[a.mood];
  if (icon) {
    const bx = a.x + w * 0.62, by = a.y - PERSON_H + 3;
    rr(ctx, bx - 2.6, by - 2.6, 5.2, 5.2, 2, 'rgba(255, 255, 255, .92)', 'rgba(43, 29, 20, .6)', 0.3);
    text(ctx, icon[0], bx, by + 0.2, 3.6, icon[1], 900);
  }
}
// a: { x, y(발 위치), mood, bob(걷는 중 한 걸음), color(재킷 색) }
function hdPersonShapes(ctx, a) {
  const x = a.x, y = a.y, coat = (BODY[a.color] || BODY.red).r, ty = y - (a.bob ? 0.5 : 0);
  shadow(ctx, x, y - 0.3, 5, 1.5, 0.28);
  // 다리·구두 (걸을 때 번갈아 들림)
  const lift = a.bob ? 0.9 : 0;
  rr(ctx, x - 2.5, y - 5.6 - lift, 2.1, 5 , 0.8, PANTS); rr(ctx, x + 0.4, y - 5.6, 2.1, 5, 0.8, PANTS);
  oval(ctx, x - 1.7, y - 0.7 - lift, 1.7, 0.85, '#16161c'); oval(ctx, x + 1.7, y - 0.7, 1.7, 0.85, '#16161c');
  // 팔 (재킷 뒤)
  rr(ctx, x - 5.4, ty - 11.2, 2, 6.2, 1, darken(coat, 0.18), INK, 0.3); rr(ctx, x + 3.4, ty - 11.2, 2, 6.2, 1, darken(coat, 0.18), INK, 0.3);
  oval(ctx, x - 4.4, ty - 4.7, 0.95, 0.95, SKIN, INK, 0.25); oval(ctx, x + 4.4, ty - 4.7, 0.95, 0.95, SKIN, INK, 0.25);
  // 재킷·셔츠·넥타이
  rr(ctx, x - 4.1, ty - 12, 8.2, 7.4, 2, vg(ctx, ty - 12, ty - 4.6, lighten(coat, 0.18), darken(coat, 0.12)), INK, 0.4);
  ctx.beginPath(); ctx.moveTo(x - 1.6, ty - 12); ctx.lineTo(x + 1.6, ty - 12); ctx.lineTo(x, ty - 8.6); ctx.closePath(); ctx.fillStyle = '#ffffff'; ctx.fill();
  ctx.beginPath(); ctx.moveTo(x - 0.55, ty - 11.6); ctx.lineTo(x + 0.55, ty - 11.6); ctx.lineTo(x + 0.75, ty - 7.6); ctx.lineTo(x, ty - 6.8); ctx.lineTo(x - 0.75, ty - 7.6); ctx.closePath();
  ctx.fillStyle = a.color === 'red' ? '#2f4f8f' : '#d9534f'; ctx.fill();
  line(ctx, [[x - 1.6, ty - 12], [x - 0.6, ty - 9.6]], darken(coat, 0.35), 0.3); line(ctx, [[x + 1.6, ty - 12], [x + 0.6, ty - 9.6]], darken(coat, 0.35), 0.3);
  // 목·머리·귀
  rr(ctx, x - 1, ty - 13.4, 2, 1.8, 0.4, darken(SKIN, 0.08));
  const hx = x, hy = ty - 16.6;
  oval(ctx, hx - 4.1, hy + 0.4, 0.8, 1.1, SKIN, INK, 0.3); oval(ctx, hx + 4.1, hy + 0.4, 0.8, 1.1, SKIN, INK, 0.3);
  oval(ctx, hx, hy, 4, 4.3, rg(ctx, hx - 1.4, hy - 1.4, 5.5, lighten(SKIN, 0.35), SKIN), INK, 0.4);
  // 머리카락 (위쪽 반원 + 앞머리)
  ctx.beginPath();
  ctx.ellipse(hx, hy - 0.6, 4.4, 3.9, 0, Math.PI, Math.PI * 2);
  ctx.lineTo(hx + 4.4, hy + 0.6);
  ctx.quadraticCurveTo(hx + 3.2, hy - 1.4, hx + 1, hy - 1.6);
  ctx.quadraticCurveTo(hx - 1.6, hy - 1.2, hx - 2.6, hy - 2.2);
  ctx.quadraticCurveTo(hx - 3.6, hy - 0.8, hx - 4.4, hy + 0.6);
  ctx.closePath();
  ctx.fillStyle = vg(ctx, hy - 4.5, hy + 0.6, lighten(HAIR, 0.15), HAIR); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 0.4; ctx.stroke();
  line(ctx, [[hx - 2, hy - 3.6], [hx + 0.6, hy - 4]], 'rgba(255, 255, 255, .25)', 0.4);
  // 표정
  const m = a.mood, ey = hy + 0.6, eye = ex => {
    if (m === 'happy') return line(ctx, [[ex - 0.8, ey + 0.2], [ex, ey - 0.6], [ex + 0.8, ey + 0.2]], '#1b1b2f', 0.45);
    if (m === 'sleep') return line(ctx, [[ex - 0.8, ey], [ex + 0.8, ey]], '#1b1b2f', 0.45);
    const r = m === 'shock' ? 1 : 0.75;
    oval(ctx, ex, ey, r, r * 1.15, '#ffffff', '#1b1b2f', 0.25);
    oval(ctx, ex + 0.1, ey + 0.1, m === 'shock' ? 0.35 : 0.5, m === 'shock' ? 0.35 : 0.6, '#2b1d14');
    oval(ctx, ex + 0.3, ey - 0.3, 0.18, 0.18, '#ffffff');
  };
  eye(hx - 1.6); eye(hx + 1.6);
  line(ctx, [[hx - 2.4, ey - 1.5], [hx - 1, ey - 1.7]], HAIR, 0.35); line(ctx, [[hx + 1, ey - 1.7], [hx + 2.4, ey - 1.5]], HAIR, 0.35);
  const my = hy + 2.6;
  if (m === 'happy') {
    oval(ctx, hx - 2.6, my - 0.6, 0.8, 0.45, 'rgba(255, 120, 140, .5)'); oval(ctx, hx + 2.6, my - 0.6, 0.8, 0.45, 'rgba(255, 120, 140, .5)');
    ctx.beginPath(); ctx.arc(hx, my - 0.6, 1.1, 0.15 * Math.PI, 0.85 * Math.PI); ctx.strokeStyle = '#8a3a2a'; ctx.lineWidth = 0.4; ctx.stroke();
  } else if (m === 'sad') {
    ctx.beginPath(); ctx.arc(hx, my + 0.8, 1, 1.15 * Math.PI, 1.85 * Math.PI); ctx.strokeStyle = '#8a3a2a'; ctx.lineWidth = 0.4; ctx.stroke();
    oval(ctx, hx - 1.9, ey + 1.4, 0.35, 0.6, '#6bb6ff');
  } else if (m === 'shock') oval(ctx, hx, my, 0.6, 0.8, '#8a3a2a');
  else line(ctx, [[hx - 0.7, my], [hx + 0.7, my]], '#8a3a2a', 0.4);
}

function hdCoins(ctx, coins, blink) {
  for (const c of coins) {
    shadow(ctx, c.x, c.y + 0.5, 3, 0.9, 0.25);
    oval(ctx, c.x, c.y - 3, 3, 3, rg(ctx, c.x - 1, c.y - 4, 3.6, '#fff1a8', '#d9a520'), '#8a6510', 0.4);
    text(ctx, '₩', c.x, c.y - 2.9, 3.4, '#8a6510', 900);
    if (blink) { line(ctx, [[c.x + 3.2, c.y - 7], [c.x + 3.2, c.y - 5]], '#ffffff', 0.35); line(ctx, [[c.x + 2.2, c.y - 6], [c.x + 4.2, c.y - 6]], '#ffffff', 0.35); }
  }
}
function hdHighlight(ctx, f, up) {
  ctx.save(); ctx.shadowColor = 'rgba(255, 210, 63, .9)'; ctx.shadowBlur = 4;
  rr(ctx, f.x - 1.5, f.y - 1.5, f.w + 3, f.h + 3, 2.5, null, '#ffd23f', 0.8); ctx.restore();
  const cx = f.x + f.w / 2, ay = Math.max(2, f.y - 7) - (up ? 1 : 0);
  ctx.beginPath(); ctx.moveTo(cx - 2.6, ay); ctx.lineTo(cx + 2.6, ay); ctx.lineTo(cx, ay + 3); ctx.closePath();
  ctx.fillStyle = '#ffd23f'; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 0.35; ctx.stroke();
}

// ===== 한 장면 그리기 (drawRoom과 같은 v를 받음) =====
const hdKey = f => (f.id.startsWith('pad-') ? 'pad' : f.id.replace(/\d+$/, ''));
function drawRoomHD(ctx, v) {
  ctx.setTransform(HD, 0, 0, HD, 0, 0);
  ctx.imageSmoothingEnabled = true;
  const outside = v.scene === 'outside', set = outside ? HD_OUT : HD_IN, sc = SCENES[v.scene];
  if (outside) hdOutsideBase(ctx, v); else { ctx.clearRect(0, 0, ROOM_W, ROOM_H); hdFloor(ctx); hdWalls(ctx); }
  sc.furn.filter(f => f.floor).forEach(f => set[hdKey(f)]?.(ctx, f, v));
  if (outside) hdCoins(ctx, v.coins, v.blink);
  const items = sc.furn.filter(f => !f.floor).map(f => ({ z: f.y + f.h, d: () => set[hdKey(f)]?.(ctx, f, v) }));
  for (const a of v.ants) items.push({ z: a.y, d: () => hdPerson(ctx, a) });
  items.sort((a, b) => a.z - b.z).forEach(it => it.d());
  if (v.near) hdHighlight(ctx, v.near, v.blink);
  const dk = outside ? darkness(v.clock) : 0;
  if (dk) {
    ctx.fillStyle = `rgba(10, 16, 48, ${dk})`; ctx.fillRect(0, 0, ROOM_W, ROOM_H);
    ctx.globalCompositeOperation = 'lighter';
    for (const f of OUT_FURN.filter(f => f.id.startsWith('lamp'))) oval(ctx, f.x + 2, f.y + 14, 16, 18, rg(ctx, f.x + 2, f.y + 10, 18, 'rgba(255, 220, 140, .35)', 'rgba(255, 220, 140, 0)'));
    ctx.globalCompositeOperation = 'source-over';
  }
  if (v.flash) { ctx.fillStyle = 'rgba(224, 62, 62, .18)'; ctx.fillRect(0, 0, ROOM_W, ROOM_H); }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

// ===== 고화질 아이콘: 도트 아이콘 대신 컬러 이모지를 그림으로 만들어 씀 =====
const EMOJI = {
  tech: '💻', food: '🍜', energy: '🛢️', bank: '🏦', up: '📈', cloud: '☁️', coin: '🪙', rumor: '💬', fire: '🔥', crash: '📉',
  pill: '💊', car: '🚗', bag: '💼', sun: '☀️', rain: '🌧️', snow: '❄️', storm: '⛈️', star: '⭐', doc: '📄', warn: '⚠️',
  w_heat: '🌡️', w_cold: '🥶', w_downpour: '🌧️', w_typhoon: '🌀', w_dust: '😷', news: '📰', book: '📖', ant: '🐜',
};
const emojiCache = new Map();
function emojiURL(e) {
  if (!emojiCache.has(e)) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 96;
    const ctx = cv.getContext('2d');
    ctx.font = '76px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(e, 48, 54);
    emojiCache.set(e, cv.toDataURL());
  }
  return emojiCache.get(e);
}

// ===== 고화질 캔들 차트 (300×90 기준을 4배 해상도로) =====
function drawChartHD(cv, hist, avg, maxDay) {
  const W = 300, H = 90, S = 4;
  if (cv.width !== W * S) { cv.width = W * S; cv.height = H * S; }
  const ctx = cv.getContext('2d');
  ctx.setTransform(S, 0, 0, S, 0, 0);
  ctx.fillStyle = vg(ctx, 0, H, '#101d36', '#0a1324'); ctx.fillRect(0, 0, W, H);
  for (let gy = 10; gy < H; gy += 16) { ctx.fillStyle = 'rgba(160, 190, 255, .08)'; ctx.fillRect(0, gy, W, 0.4); }
  let min = Math.min(...hist, avg ?? Infinity), max = Math.max(...hist, avg ?? -Infinity);
  const pad = (max - min) * 0.12 || hist[hist.length - 1] * 0.05;
  min -= pad; max += pad;
  const y = v => 5 + (1 - (v - min) / (max - min)) * 80, step = 288 / maxDay, bw = Math.max(1.2, step * 0.62);
  const xs = hist.map((_, i) => 6 + i * step);
  // 종가를 잇는 은은한 선 + 아래 면
  ctx.beginPath(); hist.forEach((c, i) => (i ? ctx.lineTo(xs[i], y(c)) : ctx.moveTo(xs[i], y(c))));
  ctx.lineTo(xs[xs.length - 1], H); ctx.lineTo(xs[0], H); ctx.closePath();
  ctx.fillStyle = vg(ctx, 0, H, 'rgba(120, 170, 255, .16)', 'rgba(120, 170, 255, 0)'); ctx.fill();
  line(ctx, hist.map((c, i) => [xs[i], y(c)]), 'rgba(200, 220, 255, .35)', 0.5);
  hist.forEach((c, i) => {
    const o = i ? hist[i - 1] : c, top = y(Math.max(o, c)), bot = y(Math.min(o, c));
    rr(ctx, xs[i] - bw / 2, top, bw, Math.max(0.8, bot - top), 0.4, c > o ? '#ff5f5f' : c < o ? '#4f8fff' : '#c9d1e0');
  });
  if (avg) {
    ctx.setLineDash([3, 2]); line(ctx, [[0, y(avg)], [W, y(avg)]], '#f7a531', 0.6); ctx.setLineDash([]);
    text(ctx, '평단', W - 9, y(avg) - 3, 4, '#f7a531', 700);
  }
  const lx = xs[xs.length - 1], ly = y(hist[hist.length - 1]);
  oval(ctx, lx, ly, 2.4, 2.4, 'rgba(255, 255, 255, .2)'); oval(ctx, lx, ly, 1.2, 1.2, '#ffffff');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

// ===== 고화질 뉴스 스튜디오 (96×54 기준, 4배) =====
function drawStudioHD(cv, mood, up) {
  const W = 96, H = 54, S = 4;
  if (cv.width !== W * S) { cv.width = W * S; cv.height = H * S; }
  const ctx = cv.getContext('2d');
  ctx.setTransform(S, 0, 0, S, 0, 0);
  ctx.fillStyle = vg(ctx, 0, H, '#14366e', '#0a1a38'); ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 5; i++) { ctx.fillStyle = 'rgba(120, 180, 255, .06)'; ctx.beginPath(); ctx.moveTo(10 + i * 18, 0); ctx.lineTo(20 + i * 18, 0); ctx.lineTo(6 + i * 18, H); ctx.lineTo(-4 + i * 18, H); ctx.fill(); }
  [[2, 22, 8], [11, 18, 7], [19, 25, 9], [70, 20, 8], [79, 15, 9], [89, 23, 7]].forEach(([x, top, w]) => rr(ctx, x, top, w, H - top, 0.6, 'rgba(30, 70, 140, .55)'));
  // 오른쪽 큰 화면: 지수 흐름
  rr(ctx, 54, 5, 38, 24, 2, vg(ctx, 5, 29, '#0b1730', '#081022'), 'rgba(140, 190, 255, .45)', 0.5);
  const pts = (up ? [20, 18, 19, 15, 13, 10, 8, 6] : [7, 9, 8, 12, 14, 17, 19, 21]).map((v, i) => [57 + i * 4.6, 6 + v]);
  line(ctx, pts, up ? '#ff6b6b' : '#6ba8ff', 0.9);
  text(ctx, up ? '▲ 상승' : '▼ 하락', 73, 9.5, 3.2, up ? '#ff8a8a' : '#8ab8ff', 800);
  // 앵커 (책상 뒤라 아랫몸은 책상에 가려짐)
  const im = PERSON_IMG.blue;
  if (im.complete && im.naturalWidth) {
    const h = 44, w = h * im.naturalWidth / im.naturalHeight;
    ctx.drawImage(im, 26 - w / 2, 8, w, h);
  } else hdPersonShapes(ctx, { x: 26, y: 44, mood, color: 'blue' });
  const icon = MOOD_ICON[mood];
  if (icon) { rr(ctx, 33, 7, 6, 6, 2.4, 'rgba(255, 255, 255, .92)'); text(ctx, icon[0], 36, 10.2, 4, icon[1], 900); }
  // 책상
  rr(ctx, 4, 34, 50, 20, 2, vg(ctx, 34, 54, '#e8edf5', '#aab4c6'), 'rgba(0, 0, 0, .3)', 0.4);
  rr(ctx, 4, 34, 50, 3, 1.5, '#c0392b');
  text(ctx, 'ANT NEWS', 29, 45, 4.4, '#1f3a8a', 900);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}
