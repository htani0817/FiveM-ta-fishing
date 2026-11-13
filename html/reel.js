// 糸の張りのミニゲームの計算（画面の描画とは分けてある。node のテストからも使う）
// 押している間は巻き、張りが holdTension に近づく。魚が暴れている間は pull が足される
// 張りが100で糸が切れ、寄せが0で逃げられ、寄せが100で釣り上げ
(function (root) {
    'use strict';

    function between(range, rng) {
        return range[0] + (range[1] - range[0]) * rng();
    }

    function create(p, rng) {
        rng = rng || Math.random;
        return {
            p: p,
            rng: rng,
            t: 0,                         // 経過（秒）
            tension: p.restTension,
            progress: p.startProgress,
            phase: 'calm',                // calm（落ち着いている）/ warn（暴れる合図）/ run（暴れている）
            left: between(p.every, rng),  // 今の段階の残り（秒）
            result: null,                 // win / break / escape / timeout
        };
    }

    function nextPhase(s) {
        const p = s.p;
        if (s.phase === 'calm') {
            s.phase = 'warn';
            s.left = p.warnMs / 1000;
        } else if (s.phase === 'warn') {
            s.phase = 'run';
            s.left = between(p.runFor, s.rng);
        } else {
            s.phase = 'calm';
            s.left = between(p.every, s.rng);
        }
    }

    // dt は秒。pressed は巻いているか
    function step(s, dt, pressed) {
        if (s.result) return s;
        const p = s.p;
        s.t += dt;
        s.left -= dt;
        while (s.left <= 0) {
            const over = -s.left;
            nextPhase(s);
            s.left -= over;
        }

        const run = s.phase === 'run';
        const target = pressed
            ? p.holdTension + (run ? p.pull : 0)
            : p.restTension + (run ? p.pull * 0.5 : 0);
        s.tension += (target - s.tension) * Math.min(1, p.response * dt);

        if (pressed) {
            s.progress += p.speed * (run ? p.runReel : 1) * dt;
        } else {
            s.progress -= (run ? p.slipRun : p.slipCalm) * dt;
        }

        if (s.tension >= 100) {
            s.tension = 100;
            s.result = 'break';
        } else if (s.progress >= 100) {
            s.progress = 100;
            s.result = 'win';
        } else if (s.progress <= 0) {
            s.progress = 0;
            s.result = 'escape';
        } else if (s.t * 1000 >= p.timeLimitMs) {
            s.result = 'timeout';
        }
        return s;
    }

    const api = { create: create, step: step };
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    } else {
        root.TaReel = api;
    }
})(this);
