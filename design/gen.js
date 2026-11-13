// ta-fishing のアイテム画像（SVG）を作る。node gen.js <出力フォルダ>
'use strict';
const fs = require('fs');
const path = require('path');
const OUT = process.argv[2] || path.join(__dirname, 'svg');
fs.mkdirSync(OUT, { recursive: true });

const GRADES = {
  common: '#a7b0ba',
  uncommon: '#52b878',
  rare: '#3f8cff',
  epic: '#a86bf5',
  legendary: '#f4b52e',
};

const lerp = (a, b, t) => a + (b - a) * t;
const f1 = (v) => (Math.round(v * 10) / 10).toString();
const pt = (p) => f1(p[0]) + ',' + f1(p[1]);
const poly = (pts) => pts.map((p, i) => (i ? 'L' : 'M') + pt(p)).join('');
function bez(p0, p1, p2, p3, n = 40) {
  const r = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    r.push([
      u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
    ]);
  }
  return r;
}
function yAt(pts, x) {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (pts[i][0] >= x) {
      const a = pts[i - 1], b = pts[i];
      return lerp(a[1], b[1], (x - a[0]) / ((b[0] - a[0]) || 1));
    }
  }
  return pts[pts.length - 1][1];
}
function prof(arr, t) {
  const n = arr.length - 1;
  const f = Math.min(Math.max(t, 0), 1) * n;
  const i = Math.min(Math.floor(f), n - 1);
  const w = (1 - Math.cos(Math.PI * (f - i))) / 2;
  return lerp(arr[i], arr[i + 1], w);
}
// 決まった並びの乱数（絵が毎回同じになるように）
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}
function mix(h1, h2, t) {
  const a = parseInt(h1.slice(1), 16), b = parseInt(h2.slice(1), 16);
  const c = [16, 8, 0].map((s) => Math.round(lerp((a >> s) & 255, (b >> s) & 255, t)));
  return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
}

const INK = 'rgba(10,16,22,0.62)';

function fish(s) {
  const id = s.id;
  const L = s.L, top = s.top, bot = s.bottom, ped = s.ped;
  const ny = s.noseY || 0;
  const nose = [0, ny];
  const xp = L * s.peak, xb = L * (s.bellyPeak ?? s.peak);
  const sx = L * (s.snoutX ?? 0.03);
  const T1 = [nose, [sx, ny - top * s.snout], [xp - L * 0.2, -top], [xp, -top]];
  const T2 = [[xp, -top], [xp + L * 0.22, -top], [L * 0.82, -ped - (top - ped) * 0.14], [L, -ped]];
  const B1 = [nose, [sx, ny + bot * s.snout], [xb - L * 0.2, bot], [xb, bot]];
  const B2 = [[xb, bot], [xb + L * 0.22, bot], [L * 0.82, ped + (bot - ped) * 0.14], [L, ped]];
  const topPts = bez(...T1).concat(bez(...T2).slice(1));
  const botPts = bez(...B1).concat(bez(...B2).slice(1));
  const yT = (x) => yAt(topPts, x), yB = (x) => yAt(botPts, x);
  const bodyD =
    `M${pt(nose)}C${pt(T1[1])} ${pt(T1[2])} ${pt(T1[3])}C${pt(T2[1])} ${pt(T2[2])} ${pt(T2[3])}` +
    `L${pt([L + 8, -ped])}L${pt([L + 8, ped])}L${pt(B2[3])}C${pt(B2[2])} ${pt(B2[1])} ${pt(B2[0])}` +
    `C${pt(B1[2])} ${pt(B1[1])} ${pt(B1[0])}Z`;

  const defs = [];
  const back = [];   // 体の後ろ（背びれ・尾びれ）
  const over = [];   // 体の上（模様、クリップ付き）
  const front = [];  // 体の手前（胸びれ・目）
  const R = rng(s.seed || 7);

  // ---- 尾びれ ----
  const tl = s.tl, sp = s.span, nt = s.notch, c = s.concave ?? 0.1, tip = s.tip ?? 1;
  const TT = [L + tl * tip, -sp], TB = [L + tl * tip, sp], TN = [L + tl * nt, 0];
  const S1 = [L - 16, -ped * 0.8], S2 = [L - 16, ped * 0.8];
  const up1 = [[L + tl * 0.3, -ped - (sp - ped) * 0.12], [L + tl * 0.7 * tip, -sp * 0.82]];
  const eU = [[lerp(TT[0], TN[0], 0.33) - c * tl, lerp(TT[1], TN[1], 0.33)], [lerp(TT[0], TN[0], 0.7) - c * tl, lerp(TT[1], TN[1], 0.7)]];
  const eL = eU.map((p) => [p[0], -p[1]]).reverse();
  const tailD = `M${pt(S1)}C${pt(up1[0])} ${pt(up1[1])} ${pt(TT)}C${pt(eU[0])} ${pt(eU[1])} ${pt(TN)}` +
    `C${pt(eL[0])} ${pt(eL[1])} ${pt(TB)}C${pt([up1[1][0], -up1[1][1]])} ${pt([up1[0][0], -up1[0][1]])} ${pt(S2)}Z`;
  const edge = bez(TT, eU[0], eU[1], TN, 12).concat(bez(TN, eL[0], eL[1], TB, 12).slice(1));
  defs.push(`<linearGradient id="${id}-tg" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${s.tailColor || s.fin}" stop-opacity="1"/><stop offset="1" stop-color="${mix(s.tailColor || s.fin, '#ffffff', 0.25)}" stop-opacity="0.82"/></linearGradient>`);
  defs.push(`<clipPath id="${id}-tc"><path d="${tailD}"/></clipPath>`);
  let tailRays = '';
  edge.forEach((e, i) => {
    if (i % 2) return;
    const yb = lerp(-ped * 0.7, ped * 0.7, i / (edge.length - 1));
    tailRays += `M${pt([L - 4, yb])}L${pt([lerp(L, e[0], 0.96), e[1] * 0.97])}`;
  });
  back.push(`<path d="${tailD}" fill="url(#${id}-tg)" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>`);
  back.push(`<path d="${tailRays}" stroke="${hexA(s.ray || '#1a1a1a', 0.22)}" stroke-width="1.3" fill="none" clip-path="url(#${id}-tc)"/>`);
  if (s.tailSpots) {
    let d = '';
    for (let i = 0; i < s.tailSpots; i++) {
      const x = L + R() * tl, y = (R() - 0.5) * sp * 1.8, r = 2 + R() * 2.6;
      d += `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(r)}"/>`;
    }
    back.push(`<g fill="${s.spotColor || '#1b1b1b'}" opacity="0.8" clip-path="url(#${id}-tc)">${d}</g>`);
  }

  // ---- 背びれ・しりびれ ----
  let fi = 0;
  function fin(f) {
    const on = f.on === 'bottom' ? 1 : -1;
    const N = 36, base = [], outer = [];
    const rake = f.rake ?? 0.35;
    for (let i = 0; i <= N; i++) {
      const t = i / N, u = lerp(f.a, f.b, t), x = u * L;
      const yb = on < 0 ? yT(x) : yB(x);
      base.push([x, yb - on * 9]);
      let h = prof(f.h, t);
      if (f.spines) {
        const ph = t * f.spines;
        h *= 0.7 + 0.3 * Math.abs(Math.cos(Math.PI * ph));
      }
      outer.push([x + rake * h, yb + on * h]);
    }
    const d = poly(base) + outer.slice().reverse().map((p) => 'L' + pt(p)).join('') + 'Z';
    const gid = `${id}-fg${fi++}`;
    const col = f.color || s.fin;
    defs.push(`<linearGradient id="${gid}" x1="0" y1="${on < 0 ? 1 : 0}" x2="0" y2="${on < 0 ? 0 : 1}"><stop offset="0.25" stop-color="${col}"/><stop offset="1" stop-color="${mix(col, '#ffffff', 0.3)}" stop-opacity="${f.edgeOpacity ?? 0.8}"/></linearGradient>`);
    back.push(`<path d="${d}" fill="url(#${gid})" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>`);
    if (f.noRays) return;
    const nr = f.spines ? f.spines : Math.max(3, Math.round(((f.b - f.a) * L) / 7));
    let rd = '';
    for (let j = 0; j <= nr; j++) {
      const t = j / nr, u = lerp(f.a, f.b, t), x = u * L;
      const yb = on < 0 ? yT(x) : yB(x);
      const h = prof(f.h, t);
      if (h < 3) continue;
      rd += `M${pt([x, yb])}L${pt([x + rake * h, yb + on * h])}`;
    }
    back.push(`<path d="${rd}" stroke="${f.spines ? hexA('#101010', 0.5) : hexA('#101010', 0.22)}" stroke-width="${f.spines ? 1.8 : 1.2}" stroke-linecap="round" fill="none"/>`);
  }
  (s.fins || []).forEach(fin);

  // 小離鰭（マグロ・サバ）
  (s.finlets || []).forEach((fl) => {
    const on = fl.on === 'bottom' ? 1 : -1;
    let d = '';
    for (let i = 0; i < fl.n; i++) {
      const u = lerp(fl.a, fl.b, i / (fl.n - 1)), x = u * L;
      const yb = on < 0 ? yT(x) : yB(x);
      const w = L * 0.022, h = fl.h * (1 - i * 0.04);
      d += `M${pt([x - w * 0.5, yb - on * 6])}L${pt([x + w * 0.6, yb - on * 6])}L${pt([x + w * 1.1, yb + on * h])}Z`;
    }
    back.push(`<path d="${d}" fill="${fl.color}" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>`);
  });

  // ---- 体 ----
  defs.push(`<clipPath id="${id}-bc"><path d="${bodyD}"/></clipPath>`);
  defs.push(`<linearGradient id="${id}-bg" gradientUnits="userSpaceOnUse" x1="0" y1="${-top}" x2="0" y2="${bot}">` +
    `<stop offset="0" stop-color="${s.back}"/><stop offset="${s.midAt ?? 0.42}" stop-color="${s.mid}"/>` +
    `<stop offset="${s.bellyAt ?? 0.72}" stop-color="${s.belly}"/><stop offset="1" stop-color="${mix(s.belly, s.mid, 0.35)}"/></linearGradient>`);
  defs.push(`<radialGradient id="${id}-hl" cx="0.3" cy="0.25" r="0.6"><stop offset="0" stop-color="#ffffff" stop-opacity="${s.gloss ?? 0.42}"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient>`);

  // 鱗
  if (s.scales) {
    const sc = s.scales.size, hh = sc * 0.78;
    defs.push(`<pattern id="${id}-sp" patternUnits="userSpaceOnUse" width="${sc}" height="${f1(hh)}">` +
      `<path d="M0,0Q${f1(sc * 0.55)},${f1(hh / 2)} 0,${f1(hh)}M${f1(sc / 2)},${f1(-hh / 2)}Q${f1(sc * 1.05)},0 ${f1(sc / 2)},${f1(hh / 2)}Q${f1(sc * 1.05)},${f1(hh)} ${f1(sc / 2)},${f1(hh * 1.5)}" fill="none" stroke="rgba(0,0,0,0.55)" stroke-width="${f1(sc * 0.07)}"/>` +
      `<path d="M2,0Q${f1(sc * 0.55 + 2)},${f1(hh / 2)} 2,${f1(hh)}M${f1(sc / 2 + 2)},${f1(-hh / 2)}Q${f1(sc * 1.05 + 2)},0 ${f1(sc / 2 + 2)},${f1(hh / 2)}Q${f1(sc * 1.05 + 2)},${f1(hh)} ${f1(sc / 2 + 2)},${f1(hh * 1.5)}" fill="none" stroke="rgba(255,255,255,0.7)" stroke-width="${f1(sc * 0.05)}"/></pattern>`);
    over.push(`<rect x="${f1(L * (s.scales.from ?? 0.2))}" y="${-top - 10}" width="${L + 20}" height="${top + bot + 20}" fill="url(#${id}-sp)" opacity="${s.scales.opacity}"/>`);
  }

  // 模様
  const latV = s.latV ?? 0.4;
  const latY = (x) => lerp(yT(x), yB(x), latV);
  const pat = s.pattern || {};
  if (pat.waves) { // サバの虫食い模様
    let d = '';
    for (let i = 0; i < pat.waves; i++) {
      const x0 = L * (0.2 + i * 0.058);
      const pts = [];
      for (let k = 0; k <= 10; k++) {
        const x = x0 + Math.sin(k * 1.3 + i) * 5 + k * 1.6;
        const y = lerp(yT(x) - 4, latY(x) + 2, k / 10);
        pts.push([x, y]);
      }
      d += poly(pts);
    }
    over.push(`<path d="${d}" stroke="${pat.color}" stroke-width="3.6" stroke-linecap="round" fill="none" opacity="0.85"/>`);
  }
  if (pat.bars) {
    let d = '';
    pat.bars.forEach((u) => {
      const x = L * u;
      d += `<rect x="${f1(x)}" y="${-top}" width="${f1(L * (pat.barW || 0.045))}" height="${top + bot}" rx="4"/>`;
    });
    over.push(`<g fill="${pat.color}" opacity="${pat.opacity ?? 0.18}">${d}</g>`);
  }
  if (pat.row) { // 横一列の点（イワシ）
    let d = '';
    for (let i = 0; i < pat.row.n; i++) {
      const x = L * lerp(pat.row.a, pat.row.b, i / (pat.row.n - 1));
      const y = lerp(yT(x), yB(x), pat.row.v);
      d += `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(pat.row.r * (1 - i * 0.04))}"/>`;
    }
    over.push(`<g fill="${pat.row.color}" opacity="0.85">${d}</g>`);
  }
  if (pat.band) { // 体側の帯（ニジマス）
    const pts = [];
    for (let u = 0.12; u <= 1.0; u += 0.02) pts.push([u * L, lerp(yT(u * L), yB(u * L), pat.band.v)]);
    defs.push(`<filter id="${id}-bb" x="-10%" y="-50%" width="120%" height="200%"><feGaussianBlur stdDeviation="${pat.band.blur || 4}"/></filter>`);
    over.push(`<path d="${poly(pts)}" stroke="${pat.band.color}" stroke-width="${pat.band.w}" stroke-linecap="round" fill="none" opacity="${pat.band.opacity}" filter="url(#${id}-bb)"/>`);
  }
  if (pat.blotch) { // 斑の帯（ブラックバス）
    let d = '';
    for (let i = 0; i < pat.blotch.n; i++) {
      const u = lerp(0.2, 0.98, i / (pat.blotch.n - 1)), x = u * L;
      const y = latY(x) + (R() - 0.5) * 6;
      d += `<ellipse cx="${f1(x)}" cy="${f1(y)}" rx="${f1(9 + R() * 7)}" ry="${f1(7 + R() * 6)}" transform="rotate(${f1(R() * 60 - 30)} ${f1(x)} ${f1(y)})"/>`;
    }
    defs.push(`<filter id="${id}-bl"><feGaussianBlur stdDeviation="1.6"/></filter>`);
    over.push(`<g fill="${pat.blotch.color}" opacity="0.6" filter="url(#${id}-bl)">${d}</g>`);
  }
  if (pat.mottle) { // まだら（カサゴ・ヒラメ）
    let d = '';
    pat.mottle.forEach((m) => {
      for (let i = 0; i < m.n; i++) {
        const x = R() * L * 1.02, y = lerp(-top, bot, R());
        const rx = m.r[0] + R() * (m.r[1] - m.r[0]);
        d += `<ellipse cx="${f1(x)}" cy="${f1(y)}" rx="${f1(rx)}" ry="${f1(rx * (0.55 + R() * 0.5))}" fill="${m.color}" opacity="${m.opacity}" transform="rotate(${f1(R() * 180)} ${f1(x)} ${f1(y)})"/>`;
      }
    });
    defs.push(`<filter id="${id}-mo"><feGaussianBlur stdDeviation="${pat.mottleBlur ?? 1.2}"/></filter>`);
    over.push(`<g filter="url(#${id}-mo)">${d}</g>`);
  }
  if (pat.spots) { // 黒い点（ニジマス・イトウ）
    let d = '';
    for (let i = 0; i < pat.spots.n; i++) {
      const x = L * lerp(pat.spots.a ?? 0.05, 1.0, R());
      const v = lerp(0.02, pat.spots.v ?? 0.5, R());
      const y = lerp(yT(x), yB(x), v);
      const r = pat.spots.r[0] + R() * (pat.spots.r[1] - pat.spots.r[0]);
      if (pat.spots.cross) {
        d += `<path d="M${pt([x - r, y - r * 0.4])}L${pt([x + r, y + r * 0.4])}M${pt([x - r * 0.4, y + r])}L${pt([x + r * 0.4, y - r])}" stroke="${pat.spots.color}" stroke-width="${f1(r * 0.7)}" stroke-linecap="round"/>`;
      } else {
        d += `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(r)}"/>`;
      }
    }
    over.push(`<g fill="${pat.spots.color}" opacity="0.85">${d}</g>`);
  }
  if (pat.stripe) { // 体の中ほどの光る帯（マグロ）
    const pts = [];
    for (let u = 0.2; u <= 1.0; u += 0.02) pts.push([u * L, lerp(yT(u * L), yB(u * L), pat.stripe.v)]);
    over.push(`<path d="${poly(pts)}" stroke="${pat.stripe.color}" stroke-width="${pat.stripe.w}" fill="none" opacity="${pat.stripe.opacity}" stroke-linecap="round"/>`);
  }

  // 陰影
  defs.push(`<filter id="${id}-ib" x="-20%" y="-30%" width="140%" height="160%"><feGaussianBlur stdDeviation="7"/></filter>`);
  over.push(`<path d="${bodyD}" fill="none" stroke="${s.edge || '#000000'}" stroke-width="22" opacity="${s.edgeOpacity ?? 0.32}" filter="url(#${id}-ib)"/>`);
  over.push(`<ellipse cx="${f1(L * 0.42)}" cy="${f1(-top * 0.38)}" rx="${f1(L * 0.42)}" ry="${f1(top * 0.5)}" fill="url(#${id}-hl)"/>`);
  over.push(`<ellipse cx="${f1(L * 0.45)}" cy="${f1(bot * 0.48)}" rx="${f1(L * 0.32)}" ry="${f1(bot * 0.22)}" fill="#ffffff" opacity="${s.bellyShine ?? 0.16}" filter="url(#${id}-ib)"/>`);

  // 側線
  if (!s.noLateral) {
    const pts = [];
    for (let u = s.gillU + 0.03; u <= 1.0; u += 0.02) pts.push([u * L, latY(u * L)]);
    over.push(`<path d="${poly(pts)}" stroke="rgba(0,0,0,0.3)" stroke-width="2" fill="none"/>`);
    over.push(`<path d="${poly(pts.map((p) => [p[0], p[1] + 2]))}" stroke="rgba(255,255,255,0.28)" stroke-width="1.4" fill="none"/>`);
    if (s.scutes) { // アジのぜいご
      let d = '';
      for (let u = s.scutes; u <= 0.99; u += 0.016) {
        const x = u * L, y = latY(x);
        const h = 3 + (u - s.scutes) * 9;
        d += `M${pt([x, y - h])}Q${pt([x + 4, y])} ${pt([x, y + h])}`;
      }
      over.push(`<path d="${d}" stroke="rgba(30,30,20,0.42)" stroke-width="1.4" fill="none"/>`);
    }
  }

  // えら
  const gx = L * s.gillU;
  const gD = `M${pt([gx + L * 0.01, yT(gx) + top * 0.2])}C${pt([gx + L * 0.055, -top * 0.05])} ${pt([gx + L * 0.045, bot * 0.35])} ${pt([gx - L * 0.02, yB(gx) - bot * 0.1])}`;
  over.push(`<path d="${gD}" stroke="rgba(0,0,0,0.38)" stroke-width="3" fill="none" stroke-linecap="round"/>`);
  over.push(`<path d="${gD}" stroke="rgba(255,255,255,0.35)" stroke-width="1.6" fill="none" transform="translate(3 0)" stroke-linecap="round"/>`);
  if (s.gillSpot) over.push(`<ellipse cx="${f1(gx + L * 0.03)}" cy="${f1(yT(gx) + top * 0.3)}" rx="6" ry="4" fill="#111" opacity="0.7"/>`);

  // 頭のとげ（カサゴ）
  if (s.headSpines) {
    let d = '';
    for (let u = 0.06; u <= 0.2; u += 0.035) {
      const x = u * L, y = yT(x);
      d += `M${pt([x - 4, y + 3])}L${pt([x + 3, y - 9])}L${pt([x + 5, y + 3])}Z`;
    }
    back.push(`<path d="${d}" fill="${s.fin}" stroke="${INK}" stroke-width="1.4" stroke-linejoin="round"/>`);
  }

  // 口
  const mU = s.mouthU ?? 0.07;
  const mY = ny + (s.mouthY ?? 3);
  front.push(`<path d="M${pt([1.5, mY])}Q${pt([L * mU * 0.6, mY + (s.mouthDrop ?? 4) * 0.4])} ${pt([L * mU, mY + (s.mouthDrop ?? 4)])}" stroke="rgba(10,10,10,0.6)" stroke-width="2.6" fill="none" stroke-linecap="round"/>`);
  if (s.lip) front.push(`<path d="M${pt([2, mY + 2])}Q${pt([L * mU * 0.5, mY + 10])} ${pt([L * mU, mY + (s.mouthDrop ?? 4) + 2])}" stroke="rgba(255,255,255,0.3)" stroke-width="1.6" fill="none"/>`);

  // ひげ（コイ）
  if (s.barbels) {
    front.push(`<path d="M${pt([L * 0.035, mY + 3])}q-4,10 -14,18M${pt([L * 0.06, mY + 5])}q-2,7 -7,11" stroke="${s.barbels}" stroke-width="3.2" fill="none" stroke-linecap="round"/>`);
  }

  // 胸びれ・腹びれ
  function petal(p, anchorY) {
    const A = [L * p.u, anchorY];
    const ang = (p.ang * Math.PI) / 180;
    const dir = [Math.cos(ang), Math.sin(ang)], per = [-dir[1], dir[0]];
    const len = L * p.len, w = p.w;
    const tipP = [A[0] + dir[0] * len, A[1] + dir[1] * len];
    const m = [A[0] + dir[0] * len * 0.55, A[1] + dir[1] * len * 0.55];
    const c1 = [m[0] + per[0] * w, m[1] + per[1] * w];
    const c2 = [m[0] - per[0] * w * 0.45, m[1] - per[1] * w * 0.45];
    const d = `M${pt(A)}Q${pt(c1)} ${pt(tipP)}Q${pt(c2)} ${pt(A)}Z`;
    const gid = `${id}-pg${fi++}`;
    const col = p.color || s.fin;
    defs.push(`<linearGradient id="${gid}" gradientUnits="userSpaceOnUse" x1="${f1(A[0])}" y1="${f1(A[1])}" x2="${f1(tipP[0])}" y2="${f1(tipP[1])}"><stop offset="0" stop-color="${col}"/><stop offset="1" stop-color="${mix(col, '#ffffff', 0.3)}" stop-opacity="0.78"/></linearGradient>`);
    let rd = '';
    for (let k = 0; k < 6; k++) {
      const t = k / 5;
      const e = [lerp(c2[0], c1[0], t) * 0.35 + tipP[0] * 0.65, lerp(c2[1], c1[1], t) * 0.35 + tipP[1] * 0.65];
      rd += `M${pt(A)}L${pt(e)}`;
    }
    front.push(`<path d="${d}" fill="url(#${gid})" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/>`);
    front.push(`<path d="${rd}" stroke="rgba(0,0,0,0.2)" stroke-width="1.1" fill="none"/>`);
  }
  if (s.pelvic) back.push('<!--pelvic-->'), petalBack(s.pelvic);
  function petalBack(p) {
    const x = L * p.u;
    const tmp = front.length;
    petal(p, yB(x) - 6);
    // 腹びれは体の後ろに描く
    back.push(...front.splice(tmp));
  }
  if (s.pec) {
    const x = L * s.pec.u;
    petal(s.pec, lerp(yT(x), yB(x), s.pec.v ?? 0.62));
  }

  // 目
  (s.eyes || [{ u: s.eyeU ?? 0.1, v: s.eyeV ?? 0.42 }]).forEach((e) => {
    const x = L * e.u, y = lerp(yT(x), ny, e.v);
    const r = s.eyeR;
    defs.push(`<radialGradient id="${id}-ir${x | 0}" cx="0.5" cy="0.6" r="0.6"><stop offset="0" stop-color="${mix(s.iris, '#ffffff', 0.35)}"/><stop offset="1" stop-color="${mix(s.iris, '#000000', 0.25)}"/></radialGradient>`);
    front.push(`<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(r + 2.5)}" fill="rgba(0,0,0,0.28)"/>`);
    front.push(`<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(r)}" fill="url(#${id}-ir${x | 0})" stroke="rgba(10,10,10,0.7)" stroke-width="1.6"/>`);
    front.push(`<circle cx="${f1(x + r * 0.05)}" cy="${f1(y + r * 0.05)}" r="${f1(r * 0.7)}" fill="#0b0b0d"/>`);
    front.push(`<circle cx="${f1(x - r * 0.28)}" cy="${f1(y - r * 0.3)}" r="${f1(r * 0.24)}" fill="#ffffff" opacity="0.92"/>`);
    front.push(`<circle cx="${f1(x + r * 0.25)}" cy="${f1(y + r * 0.28)}" r="${f1(r * 0.1)}" fill="#ffffff" opacity="0.6"/>`);
  });

  // 体の描画
  const bodySvg = `<path d="${bodyD}" fill="url(#${id}-bg)"/>` +
    `<g clip-path="url(#${id}-bc)">${over.join('')}</g>` +
    `<path d="${bodyD}" fill="none" stroke="${INK}" stroke-width="2.8" stroke-linejoin="round"/>`;

  // 枠に収める
  const finTop = Math.max(0, ...(s.fins || []).filter((f) => f.on !== 'bottom').map((f) => Math.max(...f.h)));
  const finBot = Math.max(0, ...(s.fins || []).filter((f) => f.on === 'bottom').map((f) => Math.max(...f.h)), s.pelvic ? L * s.pelvic.len * 0.8 : 0);
  const minX = -4, maxX = L + tl * Math.max(tip, nt, 1);
  const minY = Math.min(-top - finTop, -sp), maxY = Math.max(bot + finBot, sp);
  const w = maxX - minX, h = maxY - minY;
  const sc = Math.min(462 / w, 340 / h);
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const tf = `translate(250 244) rotate(${s.tilt ?? -9}) scale(${f1(sc * 100) / 100}) translate(${f1(-cx)} ${f1(-cy)})`;

  return wrap(id, s.grade, defs.join(''), `<g transform="${tf}" filter="url(#ds)">${back.join('')}${bodySvg}${front.join('')}</g>`);
}

// グレードのしるし（右下の宝石）と、エピック以上の後光
function wrap(id, grade, defs, content) {
  const g = GRADES[grade];
  let aura = '';
  if (grade === 'epic' || grade === 'legendary') {
    const a = grade === 'legendary' ? 0.55 : 0.4;
    aura = `<radialGradient id="aura" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="${g}" stop-opacity="${a}"/><stop offset="0.55" stop-color="${g}" stop-opacity="${a * 0.35}"/><stop offset="1" stop-color="${g}" stop-opacity="0"/></radialGradient>`;
  }
  const sparkle = (x, y, r, o) => `<path d="M${x},${y - r}Q${x + r * 0.18},${y - r * 0.18} ${x + r},${y}Q${x + r * 0.18},${y + r * 0.18} ${x},${y + r}Q${x - r * 0.18},${y + r * 0.18} ${x - r},${y}Q${x - r * 0.18},${y - r * 0.18} ${x},${y - r}Z" fill="#fff8dc" opacity="${o}"/>`;
  const gem = grade ? gemSvg(452, 452, g, grade) : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">` +
    `<defs><filter id="ds" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="7" stdDeviation="7" flood-color="#05090d" flood-opacity="0.5"/></filter>${aura}${defs}</defs>` +
    (aura ? `<ellipse cx="256" cy="250" rx="250" ry="200" fill="url(#aura)"/>` : '') +
    content +
    (grade === 'legendary' ? sparkle(96, 120, 22, 0.95) + sparkle(420, 150, 14, 0.85) + sparkle(130, 400, 12, 0.8) : '') +
    (grade === 'epic' ? sparkle(104, 126, 14, 0.7) + sparkle(410, 160, 10, 0.6) : '') +
    gem + `</svg>`;
}
function gemSvg(x, y, color, grade) {
  const r = 36;
  const n = { common: 1, uncommon: 2, rare: 3, epic: 4, legendary: 5 }[grade];
  // ひし形の宝石。中に段階の数だけ点
  const dk = mix(color, '#000000', 0.45), lt = mix(color, '#ffffff', 0.55);
  return `<g><path d="M${x},${y - r}L${x + r},${y}L${x},${y + r}L${x - r},${y}Z" fill="${color}" stroke="#0d1218" stroke-width="4" stroke-linejoin="round"/>` +
    `<path d="M${x},${y - r}L${x + r},${y}L${x},${y}Z" fill="${lt}" opacity="0.75"/>` +
    `<path d="M${x},${y + r}L${x - r},${y}L${x},${y}Z" fill="${dk}" opacity="0.6"/>` +
    `<path d="M${x - r},${y}L${x},${y - r}L${x},${y}Z" fill="#ffffff" opacity="0.28"/></g>`;
}

const S = {};
const add = (o) => (S[o.id] = o);

// ===== コモン =====
add({ id: 'fish_aji', grade: 'common', seed: 11, L: 300, top: 60, bottom: 56, peak: 0.38, ped: 8, snout: 0.55,
  tl: 96, span: 70, notch: 0.46, concave: 0.05,
  back: '#2f6a66', mid: '#9cb8ae', belly: '#eef3ef', fin: '#c8b04a', tailColor: '#b9a443', iris: '#d9d4c0',
  scales: { size: 13, opacity: 0.1 }, gillU: 0.24, gillSpot: true, scutes: 0.48, latV: 0.42,
  eyeR: 13, eyeU: 0.1, mouthU: 0.08,
  fins: [
    { on: 'top', a: 0.3, b: 0.47, h: [2, 30, 34, 22, 8], spines: 8 },
    { on: 'top', a: 0.5, b: 0.88, h: [20, 17, 12, 8, 4] },
    { on: 'bottom', a: 0.56, b: 0.88, h: [16, 13, 9, 6, 3] },
  ],
  pec: { u: 0.27, v: 0.58, ang: 18, len: 0.24, w: 9 }, pelvic: { u: 0.33, ang: 62, len: 0.09, w: 6 } });

add({ id: 'fish_iwashi', grade: 'common', seed: 21, L: 320, top: 46, bottom: 52, peak: 0.45, bellyPeak: 0.42, ped: 8, snout: 0.5,
  tl: 90, span: 60, notch: 0.46, concave: 0.05,
  back: '#1f4f8a', mid: '#8fb3d6', belly: '#f4f7fb', fin: '#b9c7d6', iris: '#e3e6ea', midAt: 0.36,
  scales: { size: 12, opacity: 0.12 }, gillU: 0.22, latV: 0.4,
  pattern: { row: { a: 0.27, b: 0.62, n: 7, v: 0.38, r: 5.2, color: '#0f1d2f' } },
  eyeR: 13, eyeU: 0.09, mouthU: 0.09,
  fins: [
    { on: 'top', a: 0.4, b: 0.55, h: [2, 26, 22, 14, 4] },
    { on: 'bottom', a: 0.8, b: 0.92, h: [9, 7, 4] },
  ],
  pec: { u: 0.25, v: 0.7, ang: 22, len: 0.12, w: 6 }, pelvic: { u: 0.47, ang: 60, len: 0.07, w: 5 } });

add({ id: 'fish_funa', grade: 'common', seed: 31, L: 290, top: 88, bottom: 70, peak: 0.38, ped: 22, snout: 0.45,
  tl: 82, span: 66, notch: 0.78, concave: 0.04,
  back: '#3f3d22', mid: '#857443', belly: '#d8c89c', fin: '#5f5132', iris: '#c9a24a', midAt: 0.48,
  scales: { size: 24, opacity: 0.3, from: 0.18 }, gillU: 0.22, latV: 0.46,
  eyeR: 13, eyeU: 0.1, mouthU: 0.05, mouthDrop: 2,
  fins: [
    { on: 'top', a: 0.35, b: 0.8, h: [2, 36, 30, 24, 18, 10], rake: 0.3 },
    { on: 'bottom', a: 0.72, b: 0.86, h: [26, 22, 8] },
  ],
  pec: { u: 0.25, v: 0.78, ang: 30, len: 0.14, w: 8 }, pelvic: { u: 0.48, ang: 55, len: 0.12, w: 8 } });

// ===== アンコモン =====
add({ id: 'fish_saba', grade: 'uncommon', seed: 41, L: 320, top: 54, bottom: 54, peak: 0.42, ped: 7, snout: 0.6,
  tl: 100, span: 72, notch: 0.46, concave: 0.06,
  back: '#1c5c68', mid: '#78a7ae', belly: '#eef2f3', fin: '#7c8d94', iris: '#e2e5e8', midAt: 0.4,
  scales: { size: 10, opacity: 0.06 }, gillU: 0.22, latV: 0.42,
  pattern: { waves: 14, color: '#0b2730' },
  eyeR: 13, eyeU: 0.09, mouthU: 0.09,
  fins: [
    { on: 'top', a: 0.26, b: 0.4, h: [2, 28, 24, 10, 2], spines: 7 },
    { on: 'top', a: 0.52, b: 0.63, h: [16, 12, 5] },
    { on: 'bottom', a: 0.55, b: 0.66, h: [12, 9, 4] },
  ],
  finlets: [{ on: 'top', a: 0.68, b: 0.94, n: 5, h: 9, color: '#8b9aa0' }, { on: 'bottom', a: 0.69, b: 0.94, n: 5, h: 9, color: '#8b9aa0' }],
  pec: { u: 0.24, v: 0.52, ang: 14, len: 0.13, w: 6 }, pelvic: { u: 0.3, ang: 60, len: 0.07, w: 5 } });

add({ id: 'fish_kasago', grade: 'uncommon', seed: 51, L: 280, top: 80, bottom: 64, peak: 0.3, bellyPeak: 0.35, ped: 20, snout: 0.32, noseY: 6,
  tl: 70, span: 52, notch: 1.0, tip: 0.8, concave: -0.18,
  back: '#7e1f12', mid: '#cf5330', belly: '#f2b289', fin: '#c4442a', iris: '#e9c27a', midAt: 0.45,
  gillU: 0.3, latV: 0.36, headSpines: true, gloss: 0.32,
  pattern: { mottle: [{ n: 26, r: [6, 15], color: '#5a0f08', opacity: 0.55 }, { n: 22, r: [3, 7], color: '#ffd9b8', opacity: 0.45 }] },
  eyeR: 17, eyeU: 0.13, eyeV: 0.62, mouthU: 0.1, mouthDrop: 7, lip: true,
  fins: [
    { on: 'top', a: 0.2, b: 0.62, h: [4, 46, 50, 44, 36, 28], spines: 12, rake: 0.25 },
    { on: 'top', a: 0.62, b: 0.86, h: [34, 38, 30, 12] },
    { on: 'bottom', a: 0.64, b: 0.83, h: [30, 28, 12], spines: 3 },
  ],
  tailSpots: 10, spotColor: '#6a140b',
  pec: { u: 0.3, v: 0.55, ang: 28, len: 0.3, w: 22 }, pelvic: { u: 0.36, ang: 58, len: 0.13, w: 8 } });

add({ id: 'fish_bass', grade: 'uncommon', seed: 61, L: 310, top: 70, bottom: 62, peak: 0.42, ped: 16, snout: 0.5,
  tl: 72, span: 58, notch: 0.95, concave: 0.03,
  back: '#34521f', mid: '#8aa054', belly: '#e9ecd2', fin: '#64773d', iris: '#c8862f', midAt: 0.46,
  scales: { size: 14, opacity: 0.14 }, gillU: 0.27, latV: 0.45,
  pattern: { blotch: { n: 14, color: '#1d300f' } },
  eyeR: 13, eyeU: 0.12, eyeV: 0.48, mouthU: 0.2, mouthDrop: 9, lip: true,
  fins: [
    { on: 'top', a: 0.3, b: 0.56, h: [3, 34, 36, 28, 14], spines: 9 },
    { on: 'top', a: 0.56, b: 0.8, h: [16, 30, 28, 20, 8] },
    { on: 'bottom', a: 0.64, b: 0.82, h: [24, 22, 14, 5] },
  ],
  pec: { u: 0.3, v: 0.6, ang: 22, len: 0.14, w: 8 }, pelvic: { u: 0.38, ang: 58, len: 0.12, w: 7 } });

// ===== レア =====
add({ id: 'fish_kurodai', grade: 'rare', seed: 71, L: 280, top: 94, bottom: 70, peak: 0.36, bellyPeak: 0.4, ped: 13, snout: 0.38, noseY: 10,
  tl: 90, span: 74, notch: 0.5, concave: 0.06,
  back: '#2f363d', mid: '#87909a', belly: '#dfe3e6', fin: '#353c43', iris: '#b9c0c6', midAt: 0.46,
  scales: { size: 15, opacity: 0.18 }, gillU: 0.27, latV: 0.32,
  pattern: { bars: [0.32, 0.43, 0.54, 0.65, 0.76], color: '#12171c', opacity: 0.16, barW: 0.05 },
  eyeR: 13, eyeU: 0.14, eyeV: 0.52, mouthU: 0.07, mouthDrop: 3,
  fins: [
    { on: 'top', a: 0.3, b: 0.68, h: [3, 40, 40, 34, 28, 20], spines: 11 },
    { on: 'top', a: 0.68, b: 0.86, h: [22, 20, 12] },
    { on: 'bottom', a: 0.66, b: 0.85, h: [24, 22, 10], spines: 3 },
  ],
  pec: { u: 0.29, v: 0.6, ang: 16, len: 0.3, w: 9 }, pelvic: { u: 0.36, ang: 60, len: 0.12, w: 7, color: '#22282e' } });

add({ id: 'fish_suzuki', grade: 'rare', seed: 81, L: 340, top: 56, bottom: 50, peak: 0.45, ped: 12, snout: 0.58,
  tl: 88, span: 62, notch: 0.6, concave: 0.1,
  back: '#334458', mid: '#a1adb9', belly: '#f2f4f6', fin: '#6b7784', iris: '#dfe3e7', midAt: 0.38,
  scales: { size: 12, opacity: 0.12 }, gillU: 0.25, latV: 0.36,
  eyeR: 12, eyeU: 0.1, eyeV: 0.45, mouthU: 0.15, mouthDrop: 6, lip: true,
  fins: [
    { on: 'top', a: 0.3, b: 0.48, h: [3, 34, 32, 22, 6], spines: 9 },
    { on: 'top', a: 0.52, b: 0.7, h: [22, 20, 16, 8] },
    { on: 'bottom', a: 0.63, b: 0.8, h: [18, 16, 8], spines: 3 },
  ],
  pec: { u: 0.27, v: 0.6, ang: 18, len: 0.13, w: 7 }, pelvic: { u: 0.33, ang: 60, len: 0.09, w: 6 } });

add({ id: 'fish_nijimasu', grade: 'rare', seed: 91, L: 320, top: 60, bottom: 54, peak: 0.45, ped: 14, snout: 0.5,
  tl: 78, span: 60, notch: 0.92, concave: 0.03,
  back: '#4b5d32', mid: '#bdb47b', belly: '#f5ecdc', fin: '#8f8c5c', iris: '#d8d6cc', midAt: 0.42,
  scales: { size: 8, opacity: 0.06 }, gillU: 0.23, latV: 0.46,
  pattern: { band: { v: 0.47, color: '#e2546f', w: 26, opacity: 0.75, blur: 5 }, spots: { n: 70, v: 0.55, r: [1.8, 3.6], color: '#1c1a12' } },
  tailSpots: 26, spotColor: '#1c1a12',
  eyeR: 12, eyeU: 0.1, eyeV: 0.45, mouthU: 0.11, mouthDrop: 5,
  fins: [
    { on: 'top', a: 0.4, b: 0.56, h: [2, 30, 28, 16, 4] },
    { on: 'top', a: 0.8, b: 0.86, h: [1, 9, 7, 1], noRays: true },
    { on: 'bottom', a: 0.7, b: 0.82, h: [22, 18, 6] },
  ],
  pec: { u: 0.25, v: 0.7, ang: 24, len: 0.13, w: 7 }, pelvic: { u: 0.5, ang: 58, len: 0.1, w: 6 } });

// ===== エピック =====
add({ id: 'fish_hirame', grade: 'epic', seed: 101, L: 300, top: 92, bottom: 92, peak: 0.42, ped: 18, snout: 0.5, noseY: -6,
  tl: 58, span: 50, notch: 1.0, tip: 0.75, concave: -0.2, tilt: -6,
  back: '#5b452c', mid: '#735a3c', belly: '#6a5236', fin: '#6a5236', iris: '#d9c49a', midAt: 0.5, bellyAt: 0.9,
  gillU: 0.26, latV: 0.5, gloss: 0.26, bellyShine: 0.05, edgeOpacity: 0.4,
  pattern: { mottle: [{ n: 34, r: [6, 13], color: '#2f2214', opacity: 0.55 }, { n: 30, r: [4, 9], color: '#d8c39a', opacity: 0.45 }], mottleBlur: 1.5 },
  eyes: [{ u: 0.13, v: 0.25 }, { u: 0.2, v: 0.55 }], eyeR: 11, mouthU: 0.14, mouthDrop: 10, lip: true,
  fins: [
    { on: 'top', a: 0.1, b: 0.94, h: [6, 22, 26, 24, 16, 6], rake: 0.4 },
    { on: 'bottom', a: 0.24, b: 0.94, h: [6, 22, 24, 20, 12, 4], rake: 0.4 },
  ],
  tailSpots: 8, spotColor: '#2f2214',
  pec: { u: 0.28, v: 0.45, ang: 20, len: 0.1, w: 6 } });

add({ id: 'fish_itou', grade: 'epic', seed: 111, L: 360, top: 52, bottom: 48, peak: 0.48, ped: 14, snout: 0.5, snoutX: 0.05,
  tl: 78, span: 56, notch: 0.85, concave: 0.05,
  back: '#4d3326', mid: '#a0664b', belly: '#ead7c3', fin: '#7d3b2b', tailColor: '#8a3a2a', iris: '#d8c9b0', midAt: 0.48,
  scales: { size: 7, opacity: 0.05 }, gillU: 0.21, latV: 0.45,
  pattern: { band: { v: 0.62, color: '#c0453a', w: 30, opacity: 0.45, blur: 9 }, spots: { n: 55, a: 0.02, v: 0.45, r: [2.4, 3.8], color: '#1d130e', cross: true } },
  eyeR: 10, eyeU: 0.09, eyeV: 0.4, mouthU: 0.13, mouthDrop: 5,
  fins: [
    { on: 'top', a: 0.42, b: 0.56, h: [2, 28, 26, 14, 3] },
    { on: 'top', a: 0.8, b: 0.85, h: [1, 9, 7, 1], noRays: true },
    { on: 'bottom', a: 0.72, b: 0.84, h: [20, 16, 6] },
  ],
  pec: { u: 0.23, v: 0.72, ang: 24, len: 0.12, w: 7 }, pelvic: { u: 0.5, ang: 58, len: 0.09, w: 6 } });

// ===== レジェンド =====
add({ id: 'fish_maguro', grade: 'legendary', seed: 121, L: 330, top: 74, bottom: 70, peak: 0.42, ped: 6, snout: 0.45, snoutX: 0.05,
  tl: 100, span: 96, notch: 0.5, concave: 0.1, tip: 0.95,
  back: '#0f1f3b', mid: '#4d6a8e', belly: '#e7edf3', fin: '#1e2c46', iris: '#cfd6de', midAt: 0.4, bellyAt: 0.68,
  gillU: 0.25, latV: 0.4, gloss: 0.5,
  pattern: { stripe: { v: 0.45, color: '#9fc4e8', w: 8, opacity: 0.35 } },
  eyeR: 13, eyeU: 0.1, eyeV: 0.4, mouthU: 0.08, mouthDrop: 4,
  fins: [
    { on: 'top', a: 0.3, b: 0.45, h: [2, 30, 22, 8], spines: 8 },
    { on: 'top', a: 0.52, b: 0.62, h: [36, 24, 6], rake: 0.7 },
    { on: 'bottom', a: 0.55, b: 0.65, h: [32, 22, 6], rake: 0.7 },
  ],
  finlets: [{ on: 'top', a: 0.67, b: 0.96, n: 8, h: 10, color: '#f0c843' }, { on: 'bottom', a: 0.68, b: 0.96, n: 7, h: 10, color: '#f0c843' }],
  pec: { u: 0.26, v: 0.48, ang: 12, len: 0.2, w: 6 }, pelvic: { u: 0.3, ang: 60, len: 0.07, w: 5 } });

add({ id: 'fish_kingoi', grade: 'legendary', seed: 131, L: 300, top: 76, bottom: 66, peak: 0.4, ped: 22, snout: 0.45,
  tl: 100, span: 74, notch: 0.68, concave: 0.06,
  back: '#c47b07', mid: '#f3c23a', belly: '#fff3bf', fin: '#efaa28', tailColor: '#f2b232', iris: '#f7e3a1', midAt: 0.45,
  scales: { size: 26, opacity: 0.42, from: 0.18 }, gillU: 0.23, latV: 0.45, gloss: 0.6, edge: '#7a4300', edgeOpacity: 0.4,
  eyeR: 12, eyeU: 0.1, eyeV: 0.45, mouthU: 0.05, mouthDrop: 2, barbels: '#b8770f',
  fins: [
    { on: 'top', a: 0.36, b: 0.8, h: [2, 36, 32, 26, 18, 10], rake: 0.3, color: '#f0b030' },
    { on: 'bottom', a: 0.72, b: 0.86, h: [26, 22, 8], color: '#f0b030' },
  ],
  pec: { u: 0.24, v: 0.8, ang: 32, len: 0.16, w: 10, color: '#f6c24a' }, pelvic: { u: 0.48, ang: 55, len: 0.13, w: 8, color: '#f6c24a' } });

for (const s of Object.values(S)) {
  fs.writeFileSync(path.join(OUT, s.id + '.svg'), fish(s));
}

// ===== 釣り竿 =====
function rod() {
  // 左下の持ち手から右上の穂先へ。リールと糸、ウキ
  const a = [118, 420], b = [430, 84];
  const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
  const P = (t, off = 0) => [lerp(a[0], b[0], t) - Math.sin(ang) * off, lerp(a[1], b[1], t) + Math.cos(ang) * off];
  const seg = (t0, t1, w0, w1) => {
    const p0 = P(t0, -w0), p1 = P(t1, -w1), p2 = P(t1, w1), p3 = P(t0, w0);
    return `M${pt(p0)}L${pt(p1)}L${pt(p2)}L${pt(p3)}Z`;
  };
  let guides = '';
  [0.4, 0.55, 0.69, 0.81, 0.91].forEach((t, i) => {
    const c = P(t, -9 + i * 1.2);
    guides += `<circle cx="${f1(c[0])}" cy="${f1(c[1])}" r="${f1(6 - i * 0.8)}" fill="none" stroke="#c9ced6" stroke-width="2.6"/>`;
  });
  const tipP = P(1, 0), reelC = P(0.2, 30);
  const lineD = `M${pt(reelC)}L${pt(P(0.4, -9))}L${pt(P(0.69, -7))}L${pt(P(0.91, -5))}L${pt(tipP)}Q${pt([470, 200])} ${pt([440, 300])}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><defs>` +
    `<filter id="ds" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="7" stdDeviation="7" flood-color="#05090d" flood-opacity="0.5"/></filter>` +
    `<linearGradient id="blank" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3a3f47"/><stop offset="0.5" stop-color="#1a2b4a"/><stop offset="1" stop-color="#0e1626"/></linearGradient>` +
    `<linearGradient id="cork" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e2b87a"/><stop offset="1" stop-color="#9c6a33"/></linearGradient>` +
    `<radialGradient id="reel" cx="0.35" cy="0.35" r="0.7"><stop offset="0" stop-color="#f1f3f6"/><stop offset="0.6" stop-color="#9aa3ae"/><stop offset="1" stop-color="#4a525c"/></radialGradient>` +
    `<linearGradient id="float" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff5a3c"/><stop offset="0.5" stop-color="#ff5a3c"/><stop offset="0.5" stop-color="#f7f7f2"/><stop offset="1" stop-color="#d9dbd6"/></linearGradient>` +
    `</defs><g filter="url(#ds)">` +
    `<path d="${lineD}" fill="none" stroke="#e8f3ff" stroke-width="1.6" opacity="0.9"/>` +
    `<path d="${seg(0.0, 1.0, 9, 2.4)}" fill="url(#blank)" stroke="rgba(8,12,18,0.7)" stroke-width="2.4" stroke-linejoin="round"/>` +
    `<path d="${seg(0.32, 0.98, 2.2, 0.7)}" fill="#ffffff" opacity="0.18"/>` +
    `<path d="${seg(-0.04, 0.24, 13, 11)}" fill="url(#cork)" stroke="rgba(8,12,18,0.7)" stroke-width="2.4" stroke-linejoin="round"/>` +
    `<path d="${[0.0, 0.05, 0.1, 0.15, 0.2].map((t) => `M${pt(P(t, -12))}L${pt(P(t, 12))}`).join('')}" stroke="rgba(90,55,20,0.45)" stroke-width="2"/>` +
    `<path d="${seg(0.24, 0.27, 11, 10)}" fill="#c9ced6" stroke="rgba(8,12,18,0.7)" stroke-width="2"/>` +
    guides +
    `<path d="M${pt(P(0.2, 8))}L${pt(reelC)}" stroke="#4a525c" stroke-width="8" stroke-linecap="round"/>` +
    `<circle cx="${f1(reelC[0])}" cy="${f1(reelC[1])}" r="40" fill="url(#reel)" stroke="rgba(8,12,18,0.75)" stroke-width="3"/>` +
    `<circle cx="${f1(reelC[0])}" cy="${f1(reelC[1])}" r="27" fill="#2b3036" stroke="#c9ced6" stroke-width="3"/>` +
    `<circle cx="${f1(reelC[0])}" cy="${f1(reelC[1])}" r="20" fill="none" stroke="#e8f3ff" stroke-width="5" opacity="0.7"/>` +
    `<path d="M${pt([reelC[0], reelC[1]])}L${pt([reelC[0] + 34, reelC[1] + 30])}" stroke="#2b3036" stroke-width="7" stroke-linecap="round"/>` +
    `<circle cx="${f1(reelC[0] + 36)}" cy="${f1(reelC[1] + 32)}" r="9" fill="#f0c843" stroke="rgba(8,12,18,0.75)" stroke-width="2.4"/>` +
    `<circle cx="${f1(reelC[0])}" cy="${f1(reelC[1])}" r="6" fill="#c9ced6"/>` +
    `<g transform="rotate(14 440 312)"><ellipse cx="440" cy="312" rx="13" ry="24" fill="url(#float)" stroke="rgba(8,12,18,0.7)" stroke-width="2.4"/><path d="M440,288L440,272" stroke="#ff5a3c" stroke-width="3.4" stroke-linecap="round"/><path d="M440,336L440,350" stroke="#3a3f47" stroke-width="2.4"/></g>` +
    `</g></svg>`;
}
fs.writeFileSync(path.join(OUT, 'fishing_rod.svg'), rod());

// ===== 釣り餌（餌箱とイソメ） =====
function bait() {
  const worm = (d, w) => `<path d="${d}" fill="none" stroke="rgba(60,10,20,0.7)" stroke-width="${w + 4}" stroke-linecap="round"/>` +
    `<path d="${d}" fill="none" stroke="url(#worm)" stroke-width="${w}" stroke-linecap="round"/>` +
    `<path d="${d}" fill="none" stroke="#ffd6dc" stroke-width="${w * 0.25}" stroke-linecap="round" opacity="0.55" transform="translate(-2 -3)"/>`;
  let rings = '';
  for (let i = 0; i < 9; i++) rings += `<path d="M${206 + i * 13},${206 - Math.sin(i * 0.8) * 26}l4,14" stroke="rgba(110,30,40,0.35)" stroke-width="2"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><defs>` +
    `<filter id="ds" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="7" stdDeviation="7" flood-color="#05090d" flood-opacity="0.5"/></filter>` +
    `<linearGradient id="box" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#1f5f8c"/><stop offset="0.35" stop-color="#3f8fc7"/><stop offset="0.7" stop-color="#2a74a8"/><stop offset="1" stop-color="#174a6e"/></linearGradient>` +
    `<radialGradient id="soil" cx="0.45" cy="0.4" r="0.7"><stop offset="0" stop-color="#7a5636"/><stop offset="1" stop-color="#3b2716"/></radialGradient>` +
    `<linearGradient id="worm" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f08a98"/><stop offset="1" stop-color="#c24a5e"/></linearGradient>` +
    `</defs><g filter="url(#ds)">` +
    // 箱
    `<path d="M126,232L150,420Q256,452 362,420L386,232Z" fill="url(#box)" stroke="rgba(8,12,18,0.75)" stroke-width="3.2" stroke-linejoin="round"/>` +
    `<path d="M140,300Q256,332 372,300" fill="none" stroke="#ffffff" stroke-width="3" opacity="0.35"/>` +
    `<rect x="196" y="318" width="120" height="66" rx="10" fill="#f6f1e4" stroke="rgba(8,12,18,0.6)" stroke-width="2.4"/>` +
    `<path d="M214,352q14,-16 28,0t28,0t28,0" fill="none" stroke="#1f5f8c" stroke-width="6" stroke-linecap="round"/>` +
    `<ellipse cx="256" cy="232" rx="130" ry="36" fill="#2a74a8" stroke="rgba(8,12,18,0.75)" stroke-width="3.2"/>` +
    `<ellipse cx="256" cy="234" rx="114" ry="27" fill="url(#soil)"/>` +
    `<g fill="#2a1a0e" opacity="0.6"><circle cx="200" cy="236" r="4"/><circle cx="300" cy="228" r="3"/><circle cx="252" cy="246" r="3.5"/><circle cx="320" cy="244" r="2.5"/></g>` +
    // イソメ
    worm('M190,236C176,180 230,150 252,182S300,232 316,170C326,132 360,130 372,156', 24) +
    rings +
    worm('M262,240C270,214 300,214 318,232', 16) +
    `</g></svg>`;
}
fs.writeFileSync(path.join(OUT, 'fishing_bait.svg'), bait());
console.log('written', Object.keys(S).length + 2);
