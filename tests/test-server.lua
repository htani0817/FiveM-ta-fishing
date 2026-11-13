-- server.lua を FiveM の疑似環境で動かすテスト（fengari / Lua 5.3）
local pass, fail = 0, 0
local function ok(cond, msg)
  if cond then pass = pass + 1 else fail = fail + 1; print('NG: ' .. msg) end
end

-- ---- ベクトル ----
local V = {}
V.__index = function(t, k)
  if k == 'xyz' then return vec3(t.x, t.y, t.z) end
  return rawget(V, k)
end
V.__sub = function(a, b) return vec3(a.x - b.x, a.y - b.y, (a.z or 0) - (b.z or 0)) end
V.__len = function(a) return math.sqrt(a.x * a.x + a.y * a.y + (a.z or 0) * (a.z or 0)) end
function vec2(x, y) return setmetatable({ x = x, y = y, z = 0 }, V) end
function vec3(x, y, z) return setmetatable({ x = x, y = y, z = z }, V) end
function vec4(x, y, z, w) return setmetatable({ x = x, y = y, z = z, w = w }, V) end

-- ---- json（このテストで使う形だけ） ----
json = {}
function json.encode(t)
  local parts = {}
  for k, v in pairs(t) do parts[#parts + 1] = ('"%s":%s'):format(k, tostring(v)) end
  table.sort(parts)
  return '{' .. table.concat(parts, ',') .. '}'
end
function json.decode(s)
  local t = {}
  for k, v in s:gmatch('"([^"]+)":(%d+)') do t[k] = tonumber(v) end
  return t
end

-- ---- FiveM ----
local clock = 1000
function GetGameTimer() return clock end
local threads = {}
function CreateThread(fn)
  local co = coroutine.create(fn)
  local okk, err = coroutine.resume(co)
  if not okk then error(err) end
end
function Wait() if coroutine.isyieldable() then coroutine.yield() end end
local clientEvents = {}
function TriggerClientEvent(name, target, ...) clientEvents[#clientEvents + 1] = { name = name, target = target, args = { ... } } end
local handlers = {}
function AddEventHandler(name, fn) handlers[name] = fn end
function GetPlayerName() return 'Steam名' end
GlobalState = {}
source = nil

local pedPos = { [1] = vec3(0, 0, 10), [2] = vec3(-1816.6, -1193.3, 14.3) }
function GetPlayerPed(s) return tonumber(s) end
function GetEntityCoords(ped) return pedPos[ped] end

-- ---- qbx_core / ox_inventory ----
local inv = { [1] = {}, [2] = {} }
local money = { [1] = { cash = 0, bank = 0 }, [2] = { cash = 0, bank = 0 } }
local players = {
  [1] = { PlayerData = { source = 1, citizenid = 'CID1', charinfo = { firstname = '太郎', lastname = '釣田' } } },
  [2] = { PlayerData = { source = 2, citizenid = 'CID2', charinfo = { firstname = '花子', lastname = '浜辺' } } },
}
local shops = {}
local canCarry = true
exports = {
  qbx_core = {
    GetPlayer = function(_, src) return players[src] end,
    AddMoney = function(_, src, kind, amount) money[src][kind] = money[src][kind] + amount; return true end,
  },
  ox_inventory = {
    Search = function(_, src, mode, item) return inv[src][item] or 0 end,
    RemoveItem = function(_, src, item, n)
      if (inv[src][item] or 0) < n then return false end
      inv[src][item] = inv[src][item] - n; return true
    end,
    AddItem = function(_, src, item, n) inv[src][item] = (inv[src][item] or 0) + n; return true end,
    CanCarryItem = function() return canCarry end,
    RegisterShop = function(_, id, data) shops[id] = data end,
  },
}

-- ---- oxmysql ----
local db = {}
local migrated = nil
MySQL = { query = {}, single = {}, scalar = {}, update = {} }
function MySQL.query.await(sql, params)
  if sql:find('CREATE TABLE') then return true end
  if sql:find('SHOW TABLES') then return { { 'tani_fishing_players' } } end
  local rows = {}
  for _, r in pairs(db) do rows[#rows + 1] = r end
  local key = sql:find('ORDER BY `exp`') and 'exp' or 'caught'
  table.sort(rows, function(a, b) return a[key] > b[key] end)
  local out = {}
  for i = 1, math.min(params[1], #rows) do out[i] = rows[i] end
  return out
end
function MySQL.single.await(sql, params) return db[params[1]] end
function MySQL.scalar.await(sql) return 0 end
function MySQL.update.await(sql) migrated = sql return 3 end
function MySQL.prepare(sql, p)
  db[p[1]] = { name = p[2], exp = p[3], level = p[4], caught = p[5], legendary = p[6], species = p[7] }
end

-- ---- ox_lib ----
local callbacks = {}
lib = { callback = { register = function(name, fn) callbacks[name] = fn end }, waitFor = function(fn) local v = fn() assert(v, "waitFor") return v end }

-- 読み込み（runner が SOURCES に入れたソースを実行する）
local function run(name)
  local src = SOURCES[name]:gsub('`[%w_]+`', '0')
  assert(load(src, '@' .. name))()
end
run('config.lua')
run('shared.lua')
Config.HourlyCap = 100000
run('server.lua')

local cb = function(name, ...) return callbacks[name](...) end

-- ===== 旧名 tani-fishing の記録の引き継ぎ =====
ok(migrated and migrated:find('INSERT INTO ta_fishing_players', 1, true) and migrated:find('FROM tani_fishing_players', 1, true), '古いテーブルがあり新しいテーブルが空なら記録を写す')

-- ===== レベル計算 =====
local lv, into, need = Fishing.levelFromExp(0)
ok(lv == 1 and into == 0 and need == 90, 'Lv1 の必要経験値')
lv, into, need = Fishing.levelFromExp(90)
ok(lv == 2 and into == 0 and need == 120, 'Lv2 になる')
lv = Fishing.levelFromExp(10 ^ 9)
ok(lv == Config.Level.max, '最大レベルで止まる')
ok(Fishing.comma(1234567) == '1,234,567' and Fishing.comma(999) == '999' and Fishing.comma(-12000) == '-12,000', '3桁区切り')

-- ===== 相場 =====
local m = GlobalState.taFishingMarket
ok(type(m) == 'table', '相場が GlobalState に入る')
for _, fish in ipairs(Config.Fish) do
  ok(m[fish.item] and m[fish.item].price >= fish.price.min and m[fish.item].price <= fish.price.max, '相場が範囲内 ' .. fish.item)
end
ok(shops.ta_fishing and shops.ta_fishing.useBank == true and #shops.ta_fishing.inventory == 2, 'ショップを登録')

-- ===== 釣り: 失敗系 =====
local water = { x = 0, y = 8, z = 1 }
local r = cb('ta-fishing:cast', 1, water)
ok(not r.ok and r.reason:find('釣り竿'), '竿が無いと投げられない')
inv[1].fishing_rod = 1
r = cb('ta-fishing:cast', 1, water)
ok(not r.ok and r.noBait, '餌が無いと投げられない')
inv[1].fishing_bait = 100000
r = cb('ta-fishing:cast', 1, { x = 0, y = 60, z = 1 })
ok(not r.ok, '遠すぎる水面は通らない')
r = cb('ta-fishing:cast', 1, { x = 0, y = 8, z = 20 })
ok(not r.ok, '足元より上の水面は通らない')
r = cb('ta-fishing:cast', 1, { x = 'a' })
ok(not r.ok, '壊れた値は通らない')
GlobalState.weather = { weather = 'THUNDER' }
r = cb('ta-fishing:cast', 1, water)
ok(not r.ok and r.reason:find('雷'), '雷雨では釣れない')
GlobalState.weather = { weather = 'CLEAR' }
ok(inv[1].fishing_bait == 100000, '失敗したときは餌が減らない')

-- ===== 釣り: 成功 =====
r = cb('ta-fishing:cast', 1, water)
ok(r.ok and r.wait >= Config.WaitMs.min and r.wait <= Config.WaitMs.max, '投げられる・待ち時間が範囲内')
ok(r.habitat == 'sea', 'z=1 は海')
ok(inv[1].fishing_bait == 99999, '餌が1個減る')
local r2 = cb('ta-fishing:cast', 1, water)
ok(not r2.ok, '二重に投げられない')
local early = cb('ta-fishing:reel', 1, true)
ok(not early.ok, 'アタリ前の引き上げは拒否')
ok(cb('ta-fishing:reel', 1, true).ok == false, 'セッションは1回で消える')

clock = clock + 5000
r = cb('ta-fishing:cast', 1, water)
clock = clock + r.wait + Config.Reel.minMs
pedPos[1] = vec3(0, 5, 10)
local moved = cb('ta-fishing:reel', 1, true)
ok(moved.ok and not moved.caught and moved.reason:find('動いた'), '動いたら逃げられる')
pedPos[1] = vec3(0, 0, 10)

clock = clock + 5000
r = cb('ta-fishing:cast', 1, water)
clock = clock + r.wait + 100
local failed = cb('ta-fishing:reel', 1, false, 'escape')
ok(failed.ok and not failed.caught and failed.reason:find('逃げられた'), 'ミニゲーム失敗で逃げられる')

-- 投げたときにミニゲームの値と餌の残りが届く
clock = clock + 5000
r = cb('ta-fishing:cast', 1, water)
ok(r.reel and r.reel.pull and r.reel.speed and r.reel.holdTension == Config.Reel.holdTension and r.bait == inv[1].fishing_bait, 'ミニゲームの値と餌の残り')
clock = clock + r.wait + 500
local tooFast = cb('ta-fishing:reel', 1, true, 'win')
ok(tooFast.ok and not tooFast.caught, '早すぎる引き上げは釣れない')

clock = clock + 5000
r = cb('ta-fishing:cast', 1, water)
clock = clock + r.wait + 3000
local broke = cb('ta-fishing:reel', 1, false, 'break')
ok(broke.ok and not broke.caught and broke.reason:find('糸が切れて'), '糸が切れたと伝える')

clock = clock + 5000
r = cb('ta-fishing:cast', 1, water)
clock = clock + r.wait + Config.ReelTimeoutMs + 10
local late = cb('ta-fishing:reel', 1, true)
ok(late.ok and not late.caught, '時間切れで逃げられる')

clock = clock + 5000
canCarry = false
r = cb('ta-fishing:cast', 1, water)
clock = clock + r.wait + Config.Reel.minMs
local full = cb('ta-fishing:reel', 1, true)
ok(full.ok and not full.caught and full.reason:find('いっぱい'), '持てないときは渡さない')
canCarry = true

clock = clock + 5000
r = cb('ta-fishing:cast', 1, water)
clock = clock + r.wait + Config.Reel.minMs
local got = cb('ta-fishing:reel', 1, true)
ok(got.ok and got.caught and got.fish and inv[1][got.fish.item] == 1, '釣れたら魚が入る')
ok(db.CID1 and db.CID1.caught == 1 and db.CID1.exp == got.exp and db.CID1.name == '太郎 釣田', 'DB に記録')
ok(Fishing.FishByItem[got.fish.item].habitat ~= 'fresh', '海で淡水魚は釣れない')

-- ===== 抽選の分布（レベル1とレベル30） =====
local function runMany(src, n, w)
  local counts = { common = 0, uncommon = 0, rare = 0, epic = 0, legendary = 0 }
  local habitats = {}
  for _ = 1, n do
    clock = clock + 5000
    local c = cb('ta-fishing:cast', src, w)
    assert(c.ok, c.reason)
    clock = clock + c.wait + Config.Reel.minMs
    local g = cb('ta-fishing:reel', src, true)
    assert(g.caught)
    counts[g.fish.grade] = counts[g.fish.grade] + 1
    local cid = players[src].PlayerData.citizenid
    local lvBefore = Fishing.levelFromExp(db[cid].exp - g.exp)
    if lvBefore < Config.Grades[g.fish.grade].minLevel then counts.violation = (counts.violation or 0) + 1 end
    habitats[Fishing.FishByItem[g.fish.item].habitat] = true
  end
  return counts, habitats
end
for k in pairs(inv[1]) do if k:find('^fish_') then inv[1][k] = 0 end end
local c1 = runMany(1, 300, water)
ok(not c1.violation, '解放レベル未満ではエピック・レジェンドが出ない')
ok(db.CID1.level >= 5, '300匹でレベルが上がる（Lv' .. db.CID1.level .. '）')
print(('Lv1 300匹: コモン%d アンコモン%d レア%d'):format(c1.common, c1.uncommon, c1.rare))

-- 2人目をレベル30にして淡水で釣る
inv[2].fishing_rod = 1
inv[2].fishing_bait = 100000
db.CID2 = { name = '花子 浜辺', exp = 10 ^ 6, level = 30, caught = 0, legendary = 0, species = '{}' }
pedPos[2] = vec3(100, 100, 40)
for i = #clientEvents, 1, -1 do clientEvents[i] = nil end
local c30, hab = runMany(2, 4000, { x = 100, y = 108, z = 32 })
print(('Lv30 淡水 4000匹: コモン%d アンコモン%d レア%d エピック%d レジェンド%d'):format(c30.common, c30.uncommon, c30.rare, c30.epic, c30.legendary))
ok(not c30.violation, 'Lv30 の解放レベル')
ok(c30.legendary > 0 and c30.epic > 0, 'Lv30 ではエピック・レジェンドも出る')
ok(c30.rare / 4000 > c1.rare / 300, 'レベルが上がるとレアが出やすい')
ok(not hab.sea, '淡水で海の魚は釣れない')
ok(inv[2].fish_kingoi and inv[2].fish_kingoi == c30.legendary, '淡水のレジェンドは黄金ゴイ')
local bc = 0
for _, e in ipairs(clientEvents) do if e.target == -1 then bc = bc + 1 end end
ok(bc == c30.legendary, 'レジェンドは全員に通知')

-- スキルチェックの軽減
clock = clock + 5000
local sk = cb('ta-fishing:cast', 2, { x = 100, y = 108, z = 32 })
ok(sk.ok, 'Lv30 で投げられる')
cb('ta-fishing:cancel', 2)
ok(cb('ta-fishing:reel', 2, true).ok == false, 'やめたらセッションが消える')

-- ===== 売却 =====
local before = money[1].cash
local far = cb('ta-fishing:sell', 1, 'fish_aji', 1)
ok(not far.ok and far.reason:find('離れ'), '漁師から遠いと売れない')
pedPos[1] = vec3(-1816.0, -1193.0, 14.3)
local aji = inv[1].fish_aji
local p0 = GlobalState.taFishingMarket.fish_aji.price
local s1 = cb('ta-fishing:sell', 1, 'fish_aji', 999999)
ok(s1.ok and s1.sold == aji and inv[1].fish_aji == 0, '持っている数だけ売れる')
ok(money[1].cash - before == s1.total, '売上が現金に入る')
ok(s1.total <= p0 * aji and s1.total >= Config.Fish[1].price.min * aji, '売上は相場×数以下・下限以上')
ok(GlobalState.taFishingMarket.fish_aji.price < p0 or p0 == Config.Fish[1].price.min, 'たくさん売ると値が下がる')
ok(not cb('ta-fishing:sell', 1, 'fish_aji', 1).ok, '無い魚は売れない')
ok(not cb('ta-fishing:sell', 1, 'fishing_rod', 1).ok, '魚以外は売れない')
ok(not cb('ta-fishing:sell', 1, 'fish_saba', -5).ok, '負の数は売れない')
local all = cb('ta-fishing:sell', 1, nil)
local left = 0
for k, v in pairs(inv[1]) do if k:find('^fish_') then left = left + v end end
ok(all.ok and left == 0, '全部売るで魚が無くなる')
ok(inv[1].fishing_rod == 1, '全部売っても竿は残る')

-- ===== 記録・ランキング =====
local st = cb('ta-fishing:stats', 1)
ok(st.caught == 301 and st.level >= 1, '自分の記録')
local rk = cb('ta-fishing:ranking', 1)
ok(rk.byExp[1].name == '花子 浜辺' and rk.byCaught[1].name == '花子 浜辺', 'ランキングの並び')
ok(#rk.byExp == 2, 'ランキングの人数')

-- 漁師の画面のデータ
inv[1].fish_saba = 3
local bd = cb('ta-fishing:board', 1)
ok(bd and #bd.fish == #Config.Fish and bd.stats.name == '太郎 釣田' and bd.ranking.byExp[1], '漁師の画面のデータ')
local saba
for _, f in ipairs(bd.fish) do if f.item == 'fish_saba' then saba = f end end
ok(saba and saba.count == 3 and saba.price >= saba.min and saba.price <= saba.max and type(saba.diff) == 'number', '魚ごとの手持ち・相場・前回比')
ok(bd.grades.legendary.color == Config.Grades.legendary.color and bd.gradeOrder[5] == 'legendary', 'グレードの色と並び')
ok(bd.nextIn >= 0 and bd.nextIn <= Config.Market.intervalMinutes * 60, '次の更新まで')

-- ===== 相場の変動 =====
local snapshot = {}
for _ = 1, 200 do
  -- 疑似: tick を直接呼べないので、相場は範囲内に収まることだけ見る
end
for _, fish in ipairs(Config.Fish) do
  local p = GlobalState.taFishingMarket[fish.item].price
  ok(p >= fish.price.min and p <= fish.price.max, '売却後も相場は範囲内 ' .. fish.item)
end

print(('結果: %d 件成功 / %d 件失敗'):format(pass, fail))
if fail > 0 then error("テスト失敗") end
