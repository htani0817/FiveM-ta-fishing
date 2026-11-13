// 糸の張りのミニゲームの釣り合いを確かめる。node tests/test-reel.js <リソースのフォルダ>
// config.lua を fengari で読み、html/reel.js を自動プレイヤーで動かす
const fs = require('fs');
const path = require('path');
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = require('fengari');

const dir = process.argv[2] || '.';
const Reel = require(path.resolve(dir, 'html/reel.js'));

// ---- config.lua を読んで JSON にする ----
const L = lauxlib.luaL_newstate();
lualib.luaL_openlibs(L);
const prelude = `
function vec3(x, y, z) return { x = x, y = y, z = z } end
function vec4(x, y, z, w) return { x = x, y = y, z = z, w = w } end
local function enc(v)
  local t = type(v)
  if t == 'number' then return tostring(v) end
  if t == 'string' then return string.format('%q', v) end
  if t == 'boolean' then return tostring(v) end
  if t ~= 'table' then return 'null' end
  if #v > 0 then
    local p = {} for _, x in ipairs(v) do p[#p + 1] = enc(x) end
    return '[' .. table.concat(p, ',') .. ']'
  end
  local p = {} for k, x in pairs(v) do if type(x) ~= 'function' then p[#p + 1] = string.format('%q', tostring(k)) .. ':' .. enc(x) end end
  return '{' .. table.concat(p, ',') .. '}'
end
_ENC = enc
`;
const src = fs.readFileSync(path.join(dir, 'config.lua'), 'utf8').replace(/`[A-Za-z0-9_]+`/g, '0');
for (const chunk of [prelude, src, 'return _ENC({ Reel = Config.Reel, Grades = Config.Grades, Order = Config.GradeOrder })']) {
  if (lauxlib.luaL_dostring(L, to_luastring(chunk)) !== lua.LUA_OK) {
    throw new Error(to_jsstring(lua.lua_tostring(L, -1)));
  }
}
const C = JSON.parse(to_jsstring(lua.lua_tostring(L, -1)));

// ---- 乱数（毎回同じ結果になるように） ----
function rngFrom(seed) {
  let x = seed >>> 0 || 1;
  return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return ((x >>> 0) % 100000) / 100000; };
}

function params(grade, eased) {
  const g = C.Grades[grade];
  return Object.assign({}, C.Reel, g.reel, eased ? (g.eased || {}) : {});
}

// 自動プレイヤー。reaction は段階が変わってから気づくまでの秒数
const bots = {
  skilled: { reaction: 0.25 },
  slow: { reaction: 0.5 },
  late: { reaction: 0.9 }, // 合図を見落とす人（参考の数字。判定には使わない）
  greedy: 'hold',
  idle: 'none',
};

function play(p, bot, seed) {
  const s = Reel.create(p, rngFrom(seed));
  const dt = 1 / 60;
  let seen = s.phase, changedAt = 0, last = s.phase;
  while (!s.result) {
    let pressed;
    if (bot === 'hold') pressed = true;
    else if (bot === 'none') pressed = false;
    else {
      if (s.phase !== last) { last = s.phase; changedAt = s.t; }
      if (s.t - changedAt >= bot.reaction) seen = s.phase;
      pressed = seen === 'calm';
    }
    Reel.step(s, dt, pressed);
  }
  return s;
}

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) pass++; else { fail++; console.log('NG: ' + msg); } }

const N = 200;
for (const grade of C.Order) {
  for (const eased of [false, true]) {
    if (eased && !C.Grades[grade].eased) continue;
    const p = params(grade, eased);
    const line = [];
    const rates = {};
    for (const [name, bot] of Object.entries(bots)) {
      const count = { win: 0, break: 0, escape: 0, timeout: 0 };
      let time = 0;
      for (let i = 1; i <= N; i++) {
        const s = play(p, bot, i * 7919 + grade.length);
        count[s.result]++;
        if (s.result === 'win') time += s.t;
      }
      rates[name] = count;
      const avg = count.win ? (time / count.win).toFixed(1) + '秒' : '-';
      line.push(`${name} 成功${Math.round(count.win / N * 100)}% 切れ${Math.round(count.break / N * 100)}% 平均${avg}`);
    }
    console.log(`${grade}${eased ? '（軽減）' : ''}: ${line.join(' / ')}`);
    ok(rates.skilled.win / N >= 0.9, `${grade}${eased ? ' 軽減' : ''}: 上手な人なら9割以上釣れる`);
    ok(rates.idle.escape === N, `${grade}: 何もしなければ逃げられる`);
    // コモンは巻き続けても釣れてよい。アンコモンは入門なので半分ほど、レア以上は巻き続けるとほぼ切れる
    const need = { uncommon: 0.3, rare: 0.7, epic: 0.7, legendary: 0.7 }[grade];
    if (need) ok(rates.greedy.break / N >= (eased ? need - 0.2 : need), `${grade}${eased ? ' 軽減' : ''}: 巻き続けると糸が切れる`);  }
}

// 軽減すると楽になる（遅い人の成功率が下がらない）
for (const grade of C.Order) {
  if (!C.Grades[grade].eased) continue;
  const rate = (eased) => { let w = 0; for (let i = 1; i <= N; i++) if (play(params(grade, eased), bots.slow, i * 31 + 5).result === 'win') w++; return w; };
  ok(rate(true) >= rate(false), `${grade}: 軽減で楽になる`);
}

console.log(`結果: ${pass} 件成功 / ${fail} 件失敗`);
if (fail) process.exit(1);
