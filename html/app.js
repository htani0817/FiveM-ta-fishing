// ta-fishing の NUI。釣りの最中のガイド・糸の張りのミニゲーム・漁師の画面
'use strict';

const RES = typeof GetParentResourceName === 'function' ? GetParentResourceName() : null;
const $ = (id) => document.getElementById(id);
const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('ja-JP');

// プレイヤー名など外から来る文字は、必ずこれを通してから HTML に入れる
function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function post(name, data) {
    if (!RES) return Promise.resolve(Preview.post(name, data));
    return fetch(`https://${RES}/${name}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=UTF-8' },
        body: JSON.stringify(data || {}),
    }).then((r) => r.json()).catch(() => null);
}

const ICON = {
    minus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/></svg>',
    plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/><path d="M12 5v14"/></svg>',
};

function diffText(d) {
    d = Math.round(Number(d) || 0);
    if (d > 0) return { text: `前回比 +${fmt(d)}円`, cls: 'up' };
    if (d < 0) return { text: `前回比 -${fmt(-d)}円`, cls: 'down' };
    return { text: '前回比 ±0円', cls: '' };
}

// ================== ガイド ==================

const guide = {
    el: $('guide'),
    float: $('float'),
    title: $('g-title'),
    meta: $('g-meta'),
    side: $('g-side'),
    keys: $('g-keys'),
    reel: $('reel'),
    catch: $('catch'),
};

function setKeys(list) {
    guide.keys.textContent = '';
    for (const [key, text] of list) {
        const k = document.createElement('kbd');
        k.textContent = key;
        const t = document.createElement('span');
        t.textContent = text;
        guide.keys.append(k, t);
    }
}

function setGuide({ title, meta, side, float, run }) {
    guide.el.classList.remove('hidden');
    guide.title.textContent = title || '';
    guide.title.classList.toggle('run', !!run);
    guide.meta.textContent = meta || '';
    guide.meta.classList.toggle('hidden', !meta);
    guide.side.textContent = side || '';
    guide.float.classList.toggle('bob', float === 'bob');
    guide.float.classList.toggle('sunk', float === 'sunk');
}

const STOP_KEY = ['X', '竿をしまう'];

function showWait(msg) {
    stopReel();
    guide.reel.classList.add('hidden');
    guide.catch.classList.add('hidden');
    guide.el.querySelector('.guide-main').classList.remove('hidden');
    if (msg.state === 'ready') {
        setGuide({ title: '竿を構えている', float: 'none' });
    } else {
        const where = msg.habitat === 'fresh' ? '淡水' : '海';
        setGuide({ title: 'アタリを待っている', meta: `${where}・餌 残り ${fmt(msg.bait)}`, float: 'bob' });
    }
    setKeys([STOP_KEY]);
}

function showResult(msg) {
    stopReel();
    guide.reel.classList.add('hidden');
    if (msg.caught) {
        const f = msg.fish;
        guide.catch.classList.remove('hidden');
        $('catch-img').src = f.image;
        $('catch-name').textContent = f.label;
        $('catch-exp').textContent = `経験値 +${fmt(msg.exp)}`;
        $('catch-diamond').style.background = f.color;
        $('catch-grade').textContent = f.gradeLabel;
        const ratio = msg.need > 0 ? msg.into / msg.need : 1;
        $('catch-bar').style.transform = `scaleX(${Math.max(0, Math.min(1, ratio))})`;
        const lv = $('catch-level');
        lv.textContent = msg.leveledUp
            ? `Lv.${msg.level} に上がった`
            : (msg.need > 0 ? `Lv.${msg.level}・次まで ${fmt(msg.need - msg.into)}` : `Lv.${msg.level}・最大`);
        lv.classList.toggle('up', !!msg.leveledUp);
        setGuide({ title: '釣り上げた', float: 'none' });
        guide.el.querySelector('.guide-main').classList.add('hidden');
    } else {
        guide.catch.classList.add('hidden');
        guide.el.querySelector('.guide-main').classList.remove('hidden');
        setGuide({ title: msg.reason || '逃げられた', float: 'none' });
    }
    setKeys(msg.next === false ? [] : [STOP_KEY]);
}

function hideGuide() {
    stopReel();
    guide.el.classList.add('hidden');
    guide.el.querySelector('.guide-main').classList.remove('hidden');
}

// ================== 糸の張り ==================

let reel = null;     // { s, dist, title, started }
let reelDown = false;
let raf = null;

function startReel(msg) {
    stopReel();
    guide.el.querySelector('.guide-main').classList.remove('hidden');
    guide.catch.classList.add('hidden');
    guide.reel.classList.remove('hidden');
    const p = msg.params;
    $('gauge-danger').style.width = `${100 - p.dangerFrom}%`;
    reel = {
        s: window.TaReel.create(p),
        dist: Number(msg.distance) || 10,
        title: msg.strong ? '大物がかかった' : 'かかった',
        started: performance.now(),
    };
    reelDown = false;
    setKeys([['左クリック', '押している間 巻く'], STOP_KEY]);
    renderReel();
    let last = performance.now();
    const frame = (ts) => {
        if (!reel) return;
        const dt = Math.min(0.05, Math.max(0, (ts - last) / 1000));
        last = ts;
        window.TaReel.step(reel.s, dt, reelDown);
        renderReel();
        if (reel.s.result) {
            const result = reel.s.result;
            const ms = Math.round(performance.now() - reel.started);
            reel = null;
            raf = null;
            post('reelDone', { result: result, ms: ms });
            return;
        }
        raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
}

function stopReel() {
    if (raf) cancelAnimationFrame(raf);
    raf = null;
    reel = null;
}

function renderReel() {
    const s = reel.s;
    const p = s.p;
    const gauge = $('gauge');
    $('gauge-fill').style.transform = `scaleX(${s.tension / 100})`;
    $('gauge-value').textContent = Math.round(s.tension);
    gauge.classList.toggle('danger', s.tension >= p.dangerFrom);
    gauge.classList.toggle('run', s.phase === 'run');
    $('pull-fill').style.transform = `scaleX(${s.progress / 100})`;
    $('pull-value').textContent = `${Math.round(s.progress)}%`;

    const left = reel.dist * (1 - s.progress / 100);
    let title = reel.title;
    let meta = '押している間 巻く。離すと糸を引き戻される';
    if (s.phase === 'warn') {
        title = '魚が首を振った';
        meta = '指を離して備える';
    } else if (s.phase === 'run') {
        title = '魚が暴れている';
        meta = '離して耐える。巻くと糸が切れる';
    }
    setGuide({ title: title, meta: meta, side: `あと ${left.toFixed(1)}m`, float: 'sunk', run: s.phase === 'run' });
}

// ================== 漁師の画面 ==================

const dlg = {
    el: $('dialog'),
    data: null,
    tab: 'sell',
    canTrade: false,
    qty: {},          // 魚ごとの売る数
    confirmAll: false,
    note: null,       // フッターの一言 { text, cls }
    rankKind: 'exp',
};

function fishList() {
    return dlg.data ? dlg.data.fish : [];
}

function grade(key) {
    return (dlg.data && dlg.data.grades[key]) || { label: key, color: '#6d757d' };
}

function gradeRank(key) {
    return dlg.data ? dlg.data.gradeOrder.indexOf(key) : 0;
}

function img(item) {
    return `${dlg.data.imageBase}${item}.png`;
}

function diamond(key) {
    return `<span class="diamond" style="background:${esc(grade(key).color)}"></span>`;
}

function habitatText(h) {
    return h === 'sea' ? '海' : h === 'fresh' ? '淡水' : '海・淡水';
}

// 漁師の一言。相場の動きから決める（作り話はしない）
function speech() {
    const list = fishList().filter((f) => f.diff);
    if (!list.length) return '相場は落ち着いてる。売るならいつでもいい';
    const up = list.reduce((a, b) => (b.diff > a.diff ? b : a));
    if (up.diff > 0) return `今は${up.label}が上がってる。前回比 +${fmt(up.diff)}円だ`;
    const down = list.reduce((a, b) => (b.diff < a.diff ? b : a));
    return `${down.label}が下がってる。売るなら次の更新を待つのも手だ`;
}

function openDialog(msg) {
    dlg.data = msg.data;
    dlg.canTrade = !!msg.canTrade;
    dlg.tab = msg.tab || (dlg.canTrade ? 'sell' : 'record');
    dlg.qty = {};
    dlg.confirmAll = false;
    dlg.note = null;
    dlg.rankKind = 'exp';

    const d = dlg.data;
    $('who-name').textContent = dlg.canTrade ? d.npc.name : '釣り手帳';
    $('who-place').textContent = dlg.canTrade ? d.npc.place : '';
    $('speech').textContent = speech();
    $('speech').classList.toggle('hidden', !dlg.canTrade);
    for (const el of document.querySelectorAll('[data-tab="sell"], #nav-shop, #nav-sep')) {
        el.classList.toggle('hidden', !dlg.canTrade);
    }
    dlg.el.classList.remove('hidden');
    renderTab();
}

function closeDialog(notify) {
    if (dlg.el.classList.contains('hidden')) return;
    dlg.el.classList.add('hidden');
    if (notify) post('close');
}

function renderTab() {
    for (const b of document.querySelectorAll('.nav-item[data-tab]')) {
        b.classList.toggle('active', b.dataset.tab === dlg.tab);
    }
    const total = fishList().reduce((a, f) => a + (f.count || 0), 0);
    $('nav-count').textContent = total ? fmt(total) : '';
    const foot = $('c-foot');
    foot.classList.add('hidden');
    $('c-meta').textContent = '';
    ({ sell: renderSell, market: renderMarket, ranking: renderRanking, record: renderRecord })[dlg.tab]();
}

function byGradeThenPrice(a, b) {
    const r = gradeRank(b.grade) - gradeRank(a.grade);
    return r !== 0 ? r : b.price - a.price;
}

function renderSell() {
    $('c-title').textContent = '魚を売る';
    $('c-meta').textContent = 'まとめて売ると少しずつ安くなる';
    const have = fishList().filter((f) => f.count > 0).sort(byGradeThenPrice);
    const body = $('c-body');
    if (!have.length) {
        body.innerHTML = '<div class="empty"><div class="empty-main">売れる魚を持っていません</div><div class="empty-sub">水辺で釣った魚を、ここで今の相場で売れる</div></div>';
        renderSellFoot(0, 0);
        return;
    }
    body.innerHTML = `<div class="rows">${have.map((f) => {
        const q = Math.min(dlg.qty[f.item] || f.count, f.count);
        dlg.qty[f.item] = q;
        const d = diffText(f.diff);
        return `<div class="row sell-row">
            <img class="row-img" src="${esc(img(f.item))}" alt="">
            <div><div class="row-name">${esc(f.label)}</div><div class="row-sub">${diamond(f.grade)}${esc(grade(f.grade).label)}</div></div>
            <div class="have num right">${fmt(f.count)}匹</div>
            <div class="right"><div class="price num">${fmt(f.price)}円</div><div class="diff num ${d.cls}">${d.text}</div></div>
            <div class="stepper">
                <button type="button" class="step" data-step="-1" data-item="${esc(f.item)}" aria-label="1匹減らす">${ICON.minus}</button>
                <span class="step-value num">${fmt(q)}</span>
                <button type="button" class="step" data-step="1" data-item="${esc(f.item)}" aria-label="1匹増やす">${ICON.plus}</button>
            </div>
            <button type="button" class="btn small" data-sell="${esc(f.item)}">売る</button>
        </div>`;
    }).join('')}</div>`;
    const count = have.reduce((a, f) => a + f.count, 0);
    const estimate = have.reduce((a, f) => a + f.count * f.price, 0);
    renderSellFoot(count, estimate);
}

function renderSellFoot(count, estimate) {
    const foot = $('c-foot');
    foot.classList.remove('hidden');
    const note = dlg.note ? `<div class="foot-sub ${dlg.note.cls}">${esc(dlg.note.text)}</div>` : '';
    if (!count) {
        foot.innerHTML = `<div class="foot-text"><div class="foot-main">手持ち 0匹</div>${note}</div>`;
        return;
    }
    if (dlg.confirmAll) {
        foot.innerHTML = `<div class="foot-text"><div class="foot-main">${fmt(count)}匹を約${fmt(estimate)}円で売る</div><div class="foot-sub">売ったあとは戻せない</div></div>
            <button type="button" class="btn" data-all="cancel">やめる</button>
            <button type="button" class="btn primary" data-all="confirm">売る</button>`;
        foot.querySelector('[data-all="confirm"]').focus();
        return;
    }
    foot.innerHTML = `<div class="foot-text"><div class="foot-main">手持ち ${fmt(count)}匹・見込み 約${fmt(estimate)}円</div>${note}</div>
        <button type="button" class="btn primary" data-all="ask">全部売る</button>`;
}

function sell(item, count) {
    post('sell', item ? { item: item, count: count } : { all: true }).then((res) => {
        if (!res) return;
        if (res.data) dlg.data = res.data;
        if (res.ok) {
            const f = fishList().find((x) => x.item === item);
            const what = f ? `${f.label} ${fmt(res.sold)}匹` : `${fmt(res.sold)}匹`;
            dlg.note = { text: `${what}を ${fmt(res.total)}円で売った`, cls: 'ok' };
            if (item) delete dlg.qty[item];
        } else {
            dlg.note = { text: res.reason || '売れなかった', cls: 'ng' };
        }
        dlg.confirmAll = false;
        $('speech').textContent = speech();
        renderTab();
    });
}

function renderMarket() {
    const d = dlg.data;
    $('c-title').textContent = '今の相場';
    const mins = Math.max(1, Math.ceil((d.nextIn || 0) / 60));
    $('c-meta').textContent = `${d.interval}分ごとに更新・次の更新まで ${mins}分`;
    const groups = d.gradeOrder.slice().reverse().map((g) => {
        const rows = fishList().filter((f) => f.grade === g).sort((a, b) => b.price - a.price);
        if (!rows.length) return '';
        return `<section class="group">
            <div class="group-head">${diamond(g)}${esc(grade(g).label)}</div>
            <div class="rows">${rows.map((f) => {
                const dd = diffText(f.diff);
                const pos = f.max > f.min ? Math.max(0, Math.min(100, (f.price - f.min) / (f.max - f.min) * 100)) : 50;
                return `<div class="row market-row">
                    <img class="row-img" src="${esc(img(f.item))}" alt="">
                    <div><div class="row-name">${esc(f.label)}</div><div class="row-sub">${habitatText(f.habitat)}</div></div>
                    <div class="range" aria-label="範囲 ${fmt(f.min)}〜${fmt(f.max)}円">
                        <div class="range-track"><span class="range-dot" style="left:${pos.toFixed(1)}%"></span></div>
                        <div class="range-ends num"><span>${fmt(f.min)}</span><span>${fmt(f.max)}</span></div>
                    </div>
                    <div class="price num right">${fmt(f.price)}円</div>
                    <div class="diff num right ${dd.cls}">${dd.text.replace('前回比 ', '')}</div>
                </div>`;
            }).join('')}</div>
        </section>`;
    });
    $('c-body').innerHTML = groups.join('');
}

function renderRanking() {
    const d = dlg.data;
    $('c-title').textContent = 'ランキング';
    $('c-meta').textContent = `上位${d.rankingSize}人`;
    const rows = (dlg.rankKind === 'caught' ? d.ranking.byCaught : d.ranking.byExp) || [];
    const me = d.stats && d.stats.name;
    const seg = `<div class="seg" role="tablist">
        <button type="button" role="tab" data-rank="exp" class="${dlg.rankKind === 'exp' ? 'active' : ''}">経験値</button>
        <button type="button" role="tab" data-rank="caught" class="${dlg.rankKind === 'caught' ? 'active' : ''}">釣った数</button>
    </div>`;
    if (!rows.length) {
        $('c-body').innerHTML = `${seg}<div class="empty"><div class="empty-main">まだ記録がありません</div></div>`;
        return;
    }
    $('c-body').innerHTML = seg + `<div class="rows">${rows.map((r, i) => {
        const value = dlg.rankKind === 'caught' ? `${fmt(r.caught)}匹` : `${fmt(r.exp)} 経験値`;
        const mine = me && r.name === me;
        return `<div class="row rank-row ${mine ? 'me' : ''}">
            <div class="rank-no num ${i === 0 ? 'first' : ''}">${i + 1}</div>
            <div class="row-name">${esc(r.name)}${mine ? '<span class="me-tag">あなた</span>' : ''}</div>
            <div class="lv num">Lv.${fmt(r.level)}</div>
            <div class="price num right">${value}</div>
        </div>`;
    }).join('')}</div>`;
}

function renderRecord() {
    const d = dlg.data;
    const s = d.stats;
    $('c-title').textContent = `${s.name}の釣り記録`;
    const ratio = s.need > 0 ? s.into / s.need : 1;
    const next = s.need > 0 ? `次のレベルまで あと${fmt(s.need - s.into)}` : '最大レベル';
    const caughtKinds = fishList().filter((f) => (s.species[f.item] || 0) > 0).length;
    $('c-body').innerHTML = `<div class="record-top">
            <div class="record-level"><span class="lv-label">釣りレベル</span><span class="lv-num num">Lv.${fmt(s.level)}</span><span class="lv-next num">${next}</span></div>
            <div class="bar"><div class="bar-fill" style="transform:scaleX(${Math.max(0, Math.min(1, ratio))})"></div></div>
            <div class="figures">
                <div><div class="figure-label">釣った数</div><div class="figure-value num">${fmt(s.caught)}匹</div></div>
                <div><div class="figure-label">累計経験値</div><div class="figure-value num">${fmt(s.exp)}</div></div>
                <div><div class="figure-label">レジェンド</div><div class="figure-value num">${fmt(s.legendary)}匹</div></div>
            </div>
        </div>
        <div class="section-head"><span>図鑑</span><span class="num">${caughtKinds} / ${fishList().length}</span></div>
        <div class="dex">${fishList().map((f) => {
            const n = s.species[f.item] || 0;
            return `<div class="dex-cell ${n ? '' : 'unknown'}">
                <img src="${esc(img(f.item))}" alt="">
                <div class="dex-name">${n ? esc(f.label) : '？？？'}</div>
                <div class="dex-count num">${n ? `${fmt(n)}匹` : `${esc(grade(f.grade).label)}・${habitatText(f.habitat)}`}</div>
            </div>`;
        }).join('')}</div>`;
}

// ---- 画面の操作 ----

$('nav').addEventListener('click', (e) => {
    const b = e.target.closest('.nav-item');
    if (!b) return;
    if (b.dataset.action === 'shop') {
        closeDialog(false);
        post('openShop');
        return;
    }
    dlg.tab = b.dataset.tab;
    dlg.confirmAll = false;
    dlg.note = null;
    renderTab();
});

$('c-body').addEventListener('click', (e) => {
    const step = e.target.closest('[data-step]');
    if (step) {
        const f = fishList().find((x) => x.item === step.dataset.item);
        if (!f) return;
        const q = (dlg.qty[f.item] || f.count) + Number(step.dataset.step);
        dlg.qty[f.item] = Math.max(1, Math.min(f.count, q));
        renderTab();
        return;
    }
    const sellBtn = e.target.closest('[data-sell]');
    if (sellBtn) {
        sellBtn.disabled = true;
        sell(sellBtn.dataset.sell, dlg.qty[sellBtn.dataset.sell]);
        return;
    }
    const rank = e.target.closest('[data-rank]');
    if (rank) {
        dlg.rankKind = rank.dataset.rank;
        renderTab();
    }
});

$('c-foot').addEventListener('click', (e) => {
    const b = e.target.closest('[data-all]');
    if (!b) return;
    if (b.dataset.all === 'ask') {
        dlg.confirmAll = true;
        dlg.note = null;
        renderTab();
    } else if (b.dataset.all === 'cancel') {
        dlg.confirmAll = false;
        renderTab();
    } else {
        b.disabled = true;
        sell(null);
    }
});

document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || e.repeat || dlg.el.classList.contains('hidden')) return;
    if (dlg.confirmAll) {
        dlg.confirmAll = false;
        renderTab();
        return;
    }
    closeDialog(true);
});

// ---- 大きさ ----
// 縦1080pxの画面を基準に、画面の高さに合わせて拡大・縮小する。config の UiScale を掛ける
let uiScale = { guide: 1.3, dialog: 1.0 };
let screenHeight = null; // 見本の表示で、ゲームの画面の高さを指定するときだけ使う

function applyScale() {
    const base = Math.max(0.6, Math.min(3, (screenHeight || window.innerHeight) / 1080));
    const root = document.documentElement.style;
    root.setProperty('--guide-scale', (base * (Number(uiScale.guide) || 1)).toFixed(3));
    root.setProperty('--dialog-scale', (base * (Number(uiScale.dialog) || 1)).toFixed(3));
}

window.addEventListener('resize', applyScale);
applyScale();

// ---- Lua からの命令 ----

window.addEventListener('message', (e) => {
    const m = e.data || {};
    if (m.scale && typeof m.scale === 'object') {
        uiScale = m.scale;
        applyScale();
    }
    switch (m.action) {
        case 'guide': showWait(m); break;
        case 'reel': startReel(m); break;
        case 'reelInput': reelDown = !!m.down; break;
        case 'reelStop': stopReel(); break;
        case 'result': showResult(m); break;
        case 'hideGuide': hideGuide(); break;
        case 'open': openDialog(m); break;
        case 'close': closeDialog(false); break;
    }
});

// ================== ブラウザで開いたときの見本 ==================
// FiveM の外（ブラウザで index.html を直接開く）で、見た目を確かめるためのデータ
const Preview = {
    post(name, data) {
        if (name === 'sell') return { ok: true, sold: data.count || 12, total: 8400, data: Preview.data() };
        return {};
    },
    data() {
        const grades = {
            common: { label: 'コモン', color: '#a7b0ba' }, uncommon: { label: 'アンコモン', color: '#52b878' },
            rare: { label: 'レア', color: '#3f8cff' }, epic: { label: 'エピック', color: '#a86bf5' }, legendary: { label: 'レジェンド', color: '#f4b52e' },
        };
        const F = (item, label, g, habitat, min, max, price, diff, count) => ({ item, label, grade: g, habitat, min, max, price, diff, count });
        return {
            imageBase: '../install/images/',
            npc: { name: '漁師', place: 'デル・ペロ桟橋' },
            grades: grades,
            gradeOrder: ['common', 'uncommon', 'rare', 'epic', 'legendary'],
            interval: 20, nextIn: 734, rankingSize: 10,
            fish: [
                F('fish_aji', 'アジ', 'common', 'sea', 200, 320, 248, 12, 5), F('fish_iwashi', 'イワシ', 'common', 'sea', 150, 260, 171, -9, 3),
                F('fish_funa', 'フナ', 'common', 'fresh', 180, 300, 236, 0, 0), F('fish_saba', 'サバ', 'uncommon', 'sea', 380, 600, 562, 41, 2),
                F('fish_kasago', 'カサゴ', 'uncommon', 'sea', 500, 800, 611, -18, 0), F('fish_bass', 'ブラックバス', 'uncommon', 'fresh', 450, 700, 590, 7, 0),
                F('fish_kurodai', 'クロダイ', 'rare', 'sea', 1000, 1600, 1288, 22, 1), F('fish_suzuki', 'スズキ', 'rare', 'any', 1100, 1800, 1430, -38, 0),
                F('fish_nijimasu', 'ニジマス', 'rare', 'fresh', 900, 1500, 1012, 0, 0), F('fish_hirame', 'ヒラメ', 'epic', 'sea', 2800, 4400, 3570, 0, 1),
                F('fish_itou', 'イトウ', 'epic', 'fresh', 3200, 5000, 4120, 96, 0), F('fish_maguro', 'クロマグロ', 'legendary', 'sea', 12000, 20000, 16240, -580, 0),
                F('fish_kingoi', '黄金ゴイ', 'legendary', 'fresh', 15000, 25000, 19820, 410, 0),
            ],
            stats: { name: '太郎 釣田', level: 24, into: 312, need: 780, exp: 18240, caught: 1622, legendary: 4,
                species: { fish_aji: 512, fish_iwashi: 388, fish_funa: 140, fish_saba: 201, fish_kasago: 96, fish_bass: 77, fish_kurodai: 61, fish_suzuki: 88, fish_hirame: 31, fish_maguro: 4 } },
            ranking: {
                byExp: [['花子 浜野', 21110, 26, 1880], ['太郎 釣田', 18240, 24, 1622], ['健 岸辺', 9870, 18, 1012], ['美咲 川口', 6420, 14, 733], ['翔 港', 3010, 9, 388]]
                    .map(([name, exp, level, caught]) => ({ name, exp, level, caught })),
                byCaught: [['花子 浜野', 21110, 26, 1880], ['太郎 釣田', 18240, 24, 1622], ['健 岸辺', 9870, 18, 1012]]
                    .map(([name, exp, level, caught]) => ({ name, exp, level, caught })),
            },
        };
    },
    start() {
        const q = new URLSearchParams(location.search);
        const view = q.get('view');
        if (!view) return;
        // bg=画像のパス でゲーム画面のスクリーンショットを背景にできる。h=画面の高さ（省略時は 1080 として扱う）
        document.body.style.background = q.get('bg') ? `#4b545c url("${q.get('bg')}") center / cover no-repeat` : '#4b545c';
        screenHeight = Number(q.get('h')) || 1080;
        applyScale();
        const reelParams = { pull: 74, speed: 13, every: [2.2, 3.6], runFor: [1.2, 2.0], timeLimitMs: 25000, minMs: 2500, startProgress: 20,
            holdTension: 62, restTension: 18, response: 1.6, dangerFrom: 85, warnMs: 600, slipCalm: 4, slipRun: 3, runReel: 0.25 };
        if (view === 'wait') showWait({ state: 'wait', habitat: 'sea', bait: 12 });
        if (view === 'reel' || view === 'run') {
            startReel({ params: reelParams, strong: true, distance: 12 });
            stopReel();
            // 見本の状態まで進めて止める（run は魚が暴れている瞬間）
            reel = { s: window.TaReel.create(reelParams, () => 0.5), dist: 12, title: '大物がかかった', started: 0 };
            const s = reel.s;
            for (let i = 0; i < 400 && !(view === 'run' ? s.phase === 'run' && s.left < 0.8 : s.t > 1.6); i++) {
                window.TaReel.step(s, 1 / 60, s.phase === 'calm' || view === 'run');
            }
            renderReel();
        }
        if (view === 'caught') showResult({ caught: true, fish: { label: 'クロダイ', gradeLabel: 'レア', color: '#3f8cff', image: '../install/images/fish_kurodai.png' }, exp: 30, level: 13, into: 22, need: 450, leveledUp: true });
        if (view === 'fail') showResult({ caught: false, reason: '糸が切れて、クロマグロに逃げられた' });
        if (['sell', 'market', 'ranking', 'record', 'confirm'].includes(view)) {
            openDialog({ tab: view === 'confirm' ? 'sell' : view, canTrade: true, data: Preview.data() });
            if (view === 'confirm') { dlg.confirmAll = true; renderTab(); }
        }
    },
};

if (!RES) Preview.start();
