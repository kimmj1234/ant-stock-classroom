'use strict';
// 나라 지도: 가상의 섬나라 "한울". 지도 칸(가로 128 × 세로 143 픽셀) 좌표로 해안선·섬·호수·산맥·도시를 적어 두고 픽셀 지도로 그림
// 지금 도시는 나라 가운데 한가람. 앞으로 지역(바다·다른 도시)을 하나씩 만들면 CITIES의 open을 true로 바꿈
const COUNTRY = (() => {
  const NAME = '한울', W = 128, H = 143;
  // 본섬 해안선 (북쪽에서 시계 방향): 서쪽에 깊은 만(은빛만), 남동쪽에 긴 곶(새벽곶)
  const MAIN = [
    [40, 10], [58, 6], [72, 12], [86, 8], [100, 16], [108, 30], [104, 42], [112, 52], [116, 66], [108, 74], [112, 86], [104, 98],
    [96, 100], [94, 110], [100, 120], [94, 128], [84, 124], [74, 114], [62, 118], [50, 112], [40, 118], [30, 108], [34, 96],
    [22, 90], [14, 78], [24, 70], [36, 72], [46, 66], [40, 54], [28, 58], [16, 50], [18, 38], [28, 30], [26, 20],
  ];
  // 섬: [x, y, 가로 반지름, 세로 반지름, 이름]
  const ISLANDS = [[20, 126, 9, 6, '노을섬'], [122, 40, 2.5, 2.5, '외솔섬'], [6, 30, 2, 3, '갈매섬'], [118, 108, 3, 2]];
  const LAKES = [[72, 58, 5, 4, '거울호']];
  // 산맥: 땅보다 진한 초록 (동쪽 구름산맥, 북쪽 바위산맥)
  const RIDGES = [[[88, 18], [96, 34], [98, 52], [100, 72], [96, 88]], [[60, 22], [52, 32], [46, 42]]];
  // 도시: [이름, x, y, 갈 수 있는지, 이름표 자리(없으면 위 · b 아래 · l 왼쪽 · r 오른쪽)]
  const CITIES = [['한가람', 64, 74, true, 'b'], ['누리벌', 58, 16, true], ['별하항', 30, 36, true], ['솔내', 90, 24], ['마루', 82, 46],
    ['은빛포', 48, 60, false, 'b'], ['바람골', 106, 60, false, 'l'], ['푸른들', 28, 84], ['단비', 82, 92, true], ['아라항', 104, 90, false, 'b'],
    ['늘봄', 56, 102], ['하늬', 40, 106, false, 'b'], ['새벽곶', 92, 120, false, 'l'], ['노을섬', 20, 126, false, 'b']];
  // 지역 특색 (나중에 경제·주가가 산업별로 이 정보를 씀)
  const INFO = {
    한가람: '수도 · 회사 본사와 금융', 누리벌: '넓은 평야 · 농업(쌀·채소)', 별하항: '북서쪽 항구 · 수산업(어업·수산시장)', 솔내: '산골 · 임업·광업',
    마루: '산 아래 연구단지 · 첨단기술·제약', 은빛포: '만 안쪽 · 양식업·조선소', 바람골: '바람 센 해안 · 풍력·에너지', 푸른들: '서쪽 들판 · 과수원·축산',
    단비: '내륙 공업도시 · 전자·화학 공장', 아라항: '동쪽 큰 무역항 · 해운·무역', 늘봄: '남쪽 · 관광·온천', 하늬: '남서쪽 해안 · 염전(소금)',
    새벽곶: '곶 끝 · 해변 휴양지·등대', 노을섬: '섬 · 섬 관광·감귤',
  };
  const SEAS = [['노을바다', 9, 108], ['해오름바다', 112, 134], ['너울바다', 52, 134], ['은빛만', 28, 66]];

  const hash = (x, y) => { const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return n - Math.floor(n); };
  // 픽셀 지도 한 번만 그림: 바다(물결 점) · 땅(무늬) · 산맥 · 해안선(진한 초록) · 호수
  const tiles = (() => {
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    const mask = draw => {   // 모양을 그려서 픽셀마다 켜짐/꺼짐으로 (흐린 테두리 없이)
      g.clearRect(0, 0, W, H); g.fillStyle = g.strokeStyle = '#000'; g.lineWidth = 2.2; g.beginPath(); draw();
      const d = g.getImageData(0, 0, W, H).data, m = new Uint8Array(W * H);
      for (let i = 0; i < m.length; i++) m[i] = d[i * 4 + 3] >= 128;
      return m;
    };
    const ovals = list => { for (const [x, y, rx, ry] of list) { g.moveTo(x + rx, y); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); } };
    const land = mask(() => { MAIN.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath(); ovals(ISLANDS); g.fill(); });
    const lake = mask(() => { ovals(LAKES); g.fill(); });
    const ridge = mask(() => { for (const r of RIDGES) { r.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); } g.stroke(); });
    const img = g.createImageData(W, H), o = img.data;
    const put = (i, hex) => { for (let k = 0; k < 3; k++) o[i * 4 + k] = parseInt(hex.slice(1 + k * 2, 3 + k * 2), 16); o[i * 4 + 3] = 255; };
    const isLand = (x, y) => x >= 0 && y >= 0 && x < W && y < H && land[y * W + x] && !lake[y * W + x];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (isLand(x, y)) {
        const coast = !isLand(x - 1, y) || !isLand(x + 1, y) || !isLand(x, y - 1) || !isLand(x, y + 1);
        put(i, coast ? '#3f7a3a' : ridge[i] ? (hash(x, y) < 0.5 ? '#4f8f45' : '#5a9a4e') : hash(x, y) < 0.12 ? '#8cc56e' : '#79b85f');
      } else if (lake[i] && land[i]) put(i, hash(x, y) < 0.08 ? '#a8d4f2' : '#7ab8e8');
      else put(i, hash(x, y) < 0.04 ? '#7fb6e6' : '#5f9ed8');
    }
    g.putImageData(img, 0, 0);
    return c;
  })();

  // 지도 그리기: 픽셀 지도를 k배로 키워 그리고, 큰 지도면 도시·바다·섬 이름도. 지금 있는 곳(here)은 빨간 점이 깜빡임
  function draw(canvas, { k, labels, here = CITIES[0][0], now = performance.now() }) {
    const dpr = devicePixelRatio || 1, cw = W * k, ch = H * k;
    if (canvas.width !== Math.round(cw * dpr)) { canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr); canvas.style.width = cw + 'px'; canvas.style.height = ch + 'px'; }
    const g = canvas.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.imageSmoothingEnabled = false;
    g.drawImage(tiles, 0, 0, cw, ch);
    const font = s => `${s}px 'Galmuri11 Bold', Galmuri11, monospace`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    if (labels) {
      g.font = font(Math.round(k * 3.6)); g.fillStyle = 'rgba(255,255,255,.75)';
      for (const [n, x, y] of SEAS) g.fillText(n, x * k, y * k);
      g.font = font(Math.round(k * 2.4)); g.fillStyle = '#ffffff';
      for (const [x, y, , ry, n] of ISLANDS) if (n && !CITIES.some(c => c[0] === n)) g.fillText(n, x * k, (y + ry + 3) * k);
      g.fillStyle = '#1e4f7a';
      for (const [x, y, , , n] of LAKES) g.fillText(n, x * k, y * k);
    }
    for (const [n, x, y, open, side] of CITIES) {
      const isHere = n === here;
      if (!labels && !isHere) continue;
      const r = (isHere ? 2.2 : 1.4) * k * (labels ? 1 : 1.6);
      if (isHere) {   // 지금 있는 곳: 퍼지는 고리
        const t = (now % 1400) / 1400;
        g.strokeStyle = `rgba(232, 69, 75, ${1 - t})`; g.lineWidth = Math.max(1.5, k * 0.5);
        g.beginPath(); g.arc(x * k, y * k, r + t * r * 2.2, 0, Math.PI * 2); g.stroke();
      }
      g.fillStyle = '#1e1b3a'; g.fillRect(x * k - r - 1, y * k - r - 1, r * 2 + 2, r * 2 + 2);
      g.fillStyle = isHere ? '#e8454b' : open ? '#ffffff' : '#a9a6b8'; g.fillRect(x * k - r, y * k - r, r * 2, r * 2);
      if (!labels) continue;
      const fs = Math.round(k * (isHere ? 3.2 : 2.6));
      g.font = font(fs);
      const w = g.measureText(n).width + fs * 0.6, gap = r + fs * 0.8;
      const tx = x * k + (side === 'l' ? -(r + w / 2 + 2) : side === 'r' ? r + w / 2 + 2 : 0), ty = y * k + (side === 'b' ? gap : side ? 0 : -gap);
      g.fillStyle = isHere ? '#e8454b' : 'rgba(30, 27, 58, .78)'; g.fillRect(tx - w / 2, ty - fs * 0.62, w, fs * 1.24);
      g.fillStyle = open || isHere ? '#ffffff' : '#d8d6e2'; g.fillText(n, tx, ty + 1);
    }
  }
  // 지도 칸 (x, y)에서 가장 가까운 도시 (r칸 안)
  const cityAt = (x, y, r = 6) => CITIES.filter(c => Math.hypot(c[1] - x, c[2] - y) < r).sort((a, b) => Math.hypot(a[1] - x, a[2] - y) - Math.hypot(b[1] - x, b[2] - y))[0] || null;
  return { NAME, W, H, CITIES, INFO, HERE: CITIES[0][0], draw, cityAt };
})();
