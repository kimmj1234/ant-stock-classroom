'use strict';
// 나라 지도: 실제 한국(남한) 지형을 경도·위도로 적어 두고 픽셀 지도로 그림. 지금 도시(대전)는 나라 가운데
// 앞으로 지역(서울·부산·바다 등)을 하나씩 만들면 CITIES의 open을 true로 바꿈
const KOREA = (() => {
  // 지도 범위(경도 125.6~132.0, 위도 33.0~38.7). 1픽셀 = 경도 0.05° × 위도 0.04° (위도 쪽을 늘려 실제 모양과 비슷하게)
  const LON0 = 125.6, LAT1 = 38.7, DX = 0.05, DY = 0.04;
  const W = Math.round((132.0 - LON0) / DX), H = Math.round((LAT1 - 33.0) / DY);
  const px = ([lon, lat]) => [(lon - LON0) / DX, (LAT1 - lat) / DY];
  // 남한 해안선 (서해 강화 근처에서 시작 → 휴전선 → 동해안 → 남해안 → 서해안)
  const MAIN = [
    [126.15, 37.75], [126.7, 37.95], [127.1, 38.3], [127.6, 38.3], [128.1, 38.3], [128.35, 38.6],
    [128.6, 38.2], [128.9, 37.75], [129.1, 37.5], [129.25, 37.3], [129.4, 36.95], [129.4, 36.4], [129.4, 36.05], [129.57, 36.08], [129.45, 35.8], [129.4, 35.5], [129.25, 35.3], [129.1, 35.08],
    [128.9, 35.05], [128.75, 35.1], [128.55, 35.0], [128.4, 34.85], [128.1, 34.9], [127.9, 34.95], [127.75, 34.7], [127.6, 34.85], [127.45, 34.6], [127.3, 34.45], [127.1, 34.6], [126.9, 34.4], [126.65, 34.45], [126.5, 34.3],
    [126.4, 34.55], [126.35, 34.8], [126.45, 35.05], [126.4, 35.35], [126.55, 35.6], [126.7, 35.95], [126.5, 36.15], [126.55, 36.45], [126.25, 36.6], [126.15, 36.85], [126.45, 36.95], [126.85, 36.95], [126.8, 37.1], [126.65, 37.25], [126.6, 37.45], [126.55, 37.6],
  ];
  // 휴전선 북쪽(갈 수 없는 곳, 흐리게)
  const NORTH = [[125.6, 38.7], [128.3, 38.7], [128.35, 38.6], [128.1, 38.3], [127.6, 38.3], [127.1, 38.3], [126.7, 37.95], [126.15, 37.75], [125.9, 37.8], [125.6, 37.9]];
  // 섬: [경도, 위도, 가로 반지름°, 세로 반지름°, 이름]
  const ISLANDS = [[126.55, 33.38, 0.4, 0.17, '제주도'], [130.87, 37.5, 0.07, 0.05, '울릉도'], [131.87, 37.24, 0.03, 0.03, '독도'],
    [128.62, 34.87, 0.1, 0.09], [127.9, 34.8, 0.08, 0.07], [126.25, 34.45, 0.1, 0.07], [126.45, 37.7, 0.08, 0.06], [126.3, 36.55, 0.05, 0.12]];
  // 산줄기(태백·소백): 땅보다 진한 초록
  const RIDGES = [[[128.45, 38.25], [128.75, 37.6], [129.0, 37.1], [128.9, 36.6], [128.6, 36.0]], [[128.5, 36.9], [128.0, 36.5], [127.75, 35.9], [127.6, 35.4]]];
  // 도시: [이름, 경도, 위도, 갈 수 있는지, 이름표 자리(없으면 위 · b 아래 · l 왼쪽 · r 오른쪽 — 가까운 도시끼리 안 겹치게)]
  const CITIES = [['서울', 126.98, 37.57], ['인천', 126.70, 37.46, false, 'l'], ['수원', 127.01, 37.27, false, 'b'], ['춘천', 127.73, 37.88], ['강릉', 128.88, 37.75],
    ['청주', 127.49, 36.64], ['세종', 127.29, 36.48, false, 'l'], ['대전', 127.38, 36.35, true, 'b'], ['안동', 128.73, 36.57], ['전주', 127.15, 35.82],
    ['대구', 128.60, 35.87], ['포항', 129.34, 36.02], ['울산', 129.31, 35.54], ['광주', 126.85, 35.16], ['창원', 128.68, 35.23, false, 'b'],
    ['부산', 129.08, 35.18, false, 'r'], ['목포', 126.39, 34.81], ['여수', 127.66, 34.76], ['제주', 126.53, 33.50]];
  const SEAS = [['서해', 125.95, 35.9], ['동해', 130.3, 36.6], ['남해', 127.9, 34.1]];

  const hash = (x, y) => { const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return n - Math.floor(n); };
  // 픽셀 지도(가로 W × 세로 H) 한 번만 그림: 바다 · 땅(무늬) · 산줄기 · 해안선 · 휴전선 북쪽은 흐린 회색
  const tiles = (() => {
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    const mask = (draw) => {   // 모양을 그려서 픽셀마다 켜짐/꺼짐으로 (흐린 테두리 없이)
      g.clearRect(0, 0, W, H); g.fillStyle = '#000'; g.beginPath(); draw(); g.fill();
      const d = g.getImageData(0, 0, W, H).data, m = new Uint8Array(W * H);
      for (let i = 0; i < m.length; i++) m[i] = d[i * 4 + 3] >= 128;
      return m;
    };
    const poly = pts => () => pts.forEach((p, i) => { const [x, y] = px(p); i ? g.lineTo(x, y) : g.moveTo(x, y); });
    const land = mask(() => { poly(MAIN)(); g.closePath(); for (const [lon, lat, rx, ry] of ISLANDS) { const [x, y] = px([lon, lat]); g.moveTo(x + rx / DX, y); g.ellipse(x, y, Math.max(0.8, rx / DX), Math.max(0.8, ry / DY), 0, 0, Math.PI * 2); } });
    const north = mask(poly(NORTH));
    g.clearRect(0, 0, W, H); g.lineWidth = 2.2; g.strokeStyle = '#000';
    for (const r of RIDGES) { g.beginPath(); poly(r)(); g.stroke(); }
    const rd = g.getImageData(0, 0, W, H).data;
    const img = g.createImageData(W, H), o = img.data;
    const put = (i, hex) => { o[i * 4] = parseInt(hex.slice(1, 3), 16); o[i * 4 + 1] = parseInt(hex.slice(3, 5), 16); o[i * 4 + 2] = parseInt(hex.slice(5, 7), 16); o[i * 4 + 3] = 255; };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, on = (xx, yy) => xx >= 0 && yy >= 0 && xx < W && yy < H && land[yy * W + xx];
      if (land[i]) {
        const coast = !on(x - 1, y) || !on(x + 1, y) || !on(x, y - 1) || !on(x, y + 1);
        put(i, coast ? '#3f7a3a' : rd[i * 4 + 3] > 100 ? (hash(x, y) < 0.5 ? '#4f8f45' : '#5a9a4e') : hash(x, y) < 0.12 ? '#8cc56e' : '#79b85f');
      } else if (north[i]) put(i, (x + y) % 2 ? '#c9c6bd' : '#bdbab1');
      else put(i, hash(x, y) < 0.04 ? '#7fb6e6' : '#5f9ed8');
    }
    g.putImageData(img, 0, 0);
    return c;
  })();

  // 지도 그리기: canvas에 픽셀 지도를 k배로 키워 그리고, 큰 지도면 도시·바다 이름도. 지금 있는 곳(here)은 빨간 점이 깜빡임
  function draw(canvas, { k, labels, here = '대전', now = performance.now() }) {
    const dpr = devicePixelRatio || 1, cw = W * k, ch = H * k;
    if (canvas.width !== Math.round(cw * dpr)) { canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr); canvas.style.width = cw + 'px'; canvas.style.height = ch + 'px'; }
    const g = canvas.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.imageSmoothingEnabled = false;
    g.drawImage(tiles, 0, 0, cw, ch);
    // 휴전선
    g.strokeStyle = '#c0392b'; g.lineWidth = Math.max(1, k * 0.6); g.setLineDash([k * 2, k * 1.5]); g.beginPath();
    NORTH.slice(2, 8).forEach((p, i) => { const [x, y] = px(p); i ? g.lineTo(x * k, y * k) : g.moveTo(x * k, y * k); }); g.stroke(); g.setLineDash([]);
    const font = s => `${s}px 'Galmuri11 Bold', Galmuri11, monospace`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    if (labels) {
      g.font = font(Math.round(k * 4)); g.fillStyle = 'rgba(255,255,255,.75)';
      for (const [n, lon, lat] of SEAS) { const [x, y] = px([lon, lat]); g.fillText(n, x * k, y * k); }
      g.font = font(Math.round(k * 2.4)); g.fillStyle = '#ffffff';
      for (const [lon, lat, , ry, n] of ISLANDS) if (n && n !== '제주도') { const [x, y] = px([lon, lat]); g.fillText(n, x * k, (y + ry / DY + 3) * k); }
    }
    for (const [n, lon, lat, open, side] of CITIES) {
      const [x, y] = px([lon, lat]), isHere = n === here;
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
  return { W, H, CITIES, draw };
})();
