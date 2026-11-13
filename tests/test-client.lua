-- client.lua と server.lua を同じ疑似環境で動かし、釣り〜メニューを通しで確かめる
local pass, fail = 0, 0
local function ok(cond, msg)
  if cond then pass = pass + 1 else fail = fail + 1; print('NG: ' .. msg) end
end

local V = {}
V.__index = function(t, k) if k == 'xyz' then return vec3(t.x, t.y, t.z) end end
V.__sub = function(a, b) return vec3(a.x - b.x, a.y - b.y, (a.z or 0) - (b.z or 0)) end
V.__len = function(a) return math.sqrt(a.x * a.x + a.y * a.y + (a.z or 0) ^ 2) end
function vec2(x, y) return setmetatable({ x = x, y = y, z = 0 }, V) end
function vec3(x, y, z) return setmetatable({ x = x, y = y, z = z }, V) end
function vec4(x, y, z, w) return setmetatable({ x = x, y = y, z = z, w = w }, V) end
json = {
  encode = function(t) local p = {} for k, v in pairs(t) do p[#p + 1] = ('"%s":%s'):format(k, v) end return '{' .. table.concat(p, ',') .. '}' end,
  decode = function(s) local t = {} for k, v in s:gmatch('"([^"]+)":(%d+)') do t[k] = tonumber(v) end return t end,
}

-- ---- スケジューラ ----
local clock = 1000
function GetGameTimer() return clock end
local threads = {}
function CreateThread(fn)
  local co = coroutine.create(fn)
  threads[#threads + 1] = co
  local r, e = coroutine.resume(co)
  if not r then error(e) end
end
function Wait() if coroutine.isyieldable() then coroutine.yield() end end
local function tick(ms)
  clock = clock + (ms or 100)
  if __tickHook then __tickHook() end
  for i = #threads, 1, -1 do
    local co = threads[i]
    if coroutine.status(co) == 'suspended' then
      local r, e = coroutine.resume(co)
      if not r then error(e) end
    end
    if coroutine.status(co) == 'dead' then table.remove(threads, i) end
  end
end
local function run(ms) for _ = 1, ms // 100 do tick(100) end end

-- ---- 共通の疑似 ----
GlobalState = { weather = { weather = 'CLEAR' } }
local handlers = {}
function AddEventHandler(n, fn) handlers[n] = handlers[n] or {}; table.insert(handlers[n], fn) end
function TriggerEvent(n, ...) for _, fn in ipairs(handlers[n] or {}) do fn(...) end end
local notes = {}
function TriggerClientEvent(name, target, title, msg) notes[#notes + 1] = msg end
local commands = {}
function RegisterCommand(n, fn) commands[n] = fn end
function GetPlayerName() return 'x' end
function GetCurrentResourceName() return 'ta-fishing' end

local me = vec3(0, 0, 10)
function GetPlayerPed() return 1 end
function GetEntityCoords() return me end
function GetEntityForwardVector() return vec3(0, 1, 0) end
local waterHit = true
function TestProbeAgainstWater(x, y, z1, x2, y2, z2) if waterHit then return true, vec3(x, y, 1.0) end return false, nil end
local xPressed = false
function IsControlJustPressed(_, c) if c == 73 and xPressed then xPressed = false; return true end return false end
local inVeh = false
function IsPedInAnyVehicle() return inVeh end
function IsEntityDead() return false end
function IsPedSwimming() return false end
function IsPedRagdoll() return false end
function IsPedFalling() return false end
function DoesEntityExist(e) return e ~= nil end
local deleted = 0
function DeleteEntity() deleted = deleted + 1 end
function GetGroundZFor_3dCoord(x, y, z) return true, z - 1 end
local pedsMade = 0
function CreatePed() pedsMade = pedsMade + 1; return 100 end
function CreateObject() return 200 end
-- 残りのネイティブは何もしない
setmetatable(_G, { __index = function(_, k)
  if type(k) == 'string' and k:match('^%u') then return function() return 0 end end
end })

-- ---- サーバー側の疑似 ----
local inv = { fishing_rod = 1, fishing_bait = 5 }
local money = { cash = 0, bank = 0 }
local player = { PlayerData = { source = 1, citizenid = 'CID1', charinfo = { firstname = '太郎', lastname = '釣田' } } }
local shopOpened, targetOpts, alerts = nil, nil, {}
exports = {
  qbx_core = { GetPlayer = function() return player end, AddMoney = function(_, s, k, a) money[k] = money[k] + a return true end },
  ox_inventory = {
    Search = function(_, s, m, item) return inv[item] or 0 end,
    RemoveItem = function(_, s, item, n) if (inv[item] or 0) < n then return false end inv[item] = inv[item] - n return true end,
    AddItem = function(_, s, item, n) inv[item] = (inv[item] or 0) + n return true end,
    CanCarryItem = function() return true end,
    RegisterShop = function() end,
    openInventory = function(_, kind, data) shopOpened = data.type end,
  },
  ox_target = { addLocalEntity = function(_, e, o) targetOpts = o end, removeLocalEntity = function() targetOpts = nil end },
  okokNotify = { Alert = function(_, t, msg, time, kind) alerts[#alerts + 1] = { msg = msg, kind = kind } end },
}
local db = {}
MySQL = { query = {}, single = {} }
function MySQL.query.await(sql, p)
  if sql:find('CREATE') then return true end
  local rows = {} for _, r in pairs(db) do rows[#rows + 1] = r end
  return rows
end
function MySQL.single.await(_, p) return db[p[1]] end
function MySQL.prepare(_, p) db[p[1]] = { name = p[2], exp = p[3], level = p[4], caught = p[5], legendary = p[6], species = p[7] } end

-- ---- ox_lib（サーバーとクライアントを直結） ----
local callbacks = {}
local points = {}
cache = { ped = 1 }
lib = {
  waitFor = function(fn) local v = fn() assert(v, "waitFor") return v end,
  callback = {
    register = function(n, fn) callbacks[n] = fn end,
    await = function(n, _, ...) return callbacks[n](1, ...) end,
  },
  requestModel = function() end, requestAnimDict = function() end,
  points = { new = function(p) points[#points + 1] = p end },
}

-- ---- NUI ----
-- reelOutcome: ミニゲームの結果（win / break / escape）。reelDelay ミリ秒後に NUI から返す
local nuiMsgs, nuiCbs, focus = {}, {}, false
local reelOutcome, reelDelay, reelAt = 'win', 3000, nil
function SendNUIMessage(m)
  nuiMsgs[#nuiMsgs + 1] = m
  if m.action == 'reel' then reelAt = clock end
  if m.action == 'reelStop' then reelAt = nil end
end
function RegisterNUICallback(name, fn) nuiCbs[name] = fn end
function SetNuiFocus(a) focus = a end
function SetTimeout(ms, fn)
  CreateThread(function()
    local t = clock + ms
    while clock < t do Wait() end
    fn()
  end)
end
__tickHook = function()
  if reelAt and clock >= reelAt + reelDelay then
    reelAt = nil
    nuiCbs.reelDone({ result = reelOutcome, ms = reelDelay }, function() end)
  end
end
-- NUI のコールバックを呼んで、返り値を受け取る
local function nuiCall(name, data)
  local out
  CreateThread(function() nuiCbs[name](data, function(r) out = r end) end)
  return out
end

local function load_(name)
  local src = SOURCES[name]:gsub('`[%w_]+`', '0')
  assert(load(src, '@' .. name))()
end
load_('config.lua'); load_('shared.lua')
Config.Npc.coords = vec4(0.0, 3.0, 10.0, 0.0)
load_('server.lua'); load_('client.lua')

local function lastAlert() return alerts[#alerts] and alerts[#alerts].msg or '' end
local function find(list, pat) for _, a in ipairs(list) do if a.msg:find(pat) then return true end end return false end
local function lastNui(action)
  for i = #nuiMsgs, 1, -1 do if nuiMsgs[i].action == action then return nuiMsgs[i] end end
end
local function lastAction() return nuiMsgs[#nuiMsgs] and nuiMsgs[#nuiMsgs].action end
local function countNui(pred) local n = 0 for _, m in ipairs(nuiMsgs) do if pred(m) then n = n + 1 end end return n end

-- ===== NPC =====
ok(#points == 1, 'NPC の出現地点を登録')
points[1].onEnter()
ok(pedsMade == 1 and targetOpts and targetOpts[1].label == '漁師と話す', 'NPC と ox_target')

-- ===== 釣り =====
TriggerEvent('ta-fishing:useRod')
ok(lastNui('guide') and lastNui('guide').state == 'ready', '竿を構えたガイド')
run(1300)
local g = lastNui('guide')
ok(g and g.state == 'wait' and g.habitat == 'sea' and g.bait == 4, 'アタリ待ちのガイド（海・餌の残り）')
ok(inv.fishing_bait == 4, '投げると餌が減る')
run(Config.WaitMs.max + 500)
local rm = lastNui('reel')
ok(rm and rm.params and rm.params.pull and rm.distance > 0, 'アタリでミニゲームが始まる')
run(reelDelay + 500)
local fishCount = 0
for k, v in pairs(inv) do if k:find('^fish_') then fishCount = fishCount + v end end
ok(fishCount >= 1, '1匹釣れる')
local res = lastNui('result')
ok(res and res.caught and res.fish.image:find('nui://ox_inventory', 1, true) and res.fish.color, '釣果をガイドに出す')

-- 自動で投げ直して餌が無くなるまで続く
run((Config.WaitMs.max + reelDelay + Config.ResultShowMs + 2000) * 5)
fishCount = 0
for k, v in pairs(inv) do if k:find('^fish_') then fishCount = fishCount + v end end
ok(inv.fishing_bait == 0 and fishCount == 5, '餌5個で5匹（' .. fishCount .. '）')
ok(find(alerts, '餌がなくなった'), '餌切れの通知')
ok(lastNui('result').next == false, '最後の釣果ではやめるキーを出さない')
run(Config.ResultShowMs + 500)
ok(lastAction() == 'hideGuide', '最後の釣果を見せてからガイドを消す')

-- 途中でやめる
inv.fishing_bait = 3
TriggerEvent('ta-fishing:useRod')
run(3000)
xPressed = true
run(500)
ok(lastAlert():find('竿をしまった') and lastAction() == 'hideGuide', 'X でやめるとガイドが消える')
ok(inv.fishing_bait == 2, 'やめた回の餌は戻らない')
run(Config.WaitMs.max)
ok(inv.fishing_bait == 2, 'やめたあとは投げない')

-- 待ち時間は乱数なので、時間を決め打ちせず、条件がそろうまで進める
local function runUntil(pred, maxMs)
  for _ = 1, (maxMs or 120000) // 100 do
    if pred() then return true end
    tick(100)
  end
  return pred()
end

-- ミニゲームの途中でやめる
TriggerEvent('ta-fishing:useRod')
ok(runUntil(function() return reelAt ~= nil end), 'ミニゲームの途中')
xPressed = true
run(300)
ok(lastNui('reelStop') and reelAt == nil and lastAction() == 'hideGuide', 'ミニゲームの途中でもやめられる')
run(2000)

-- 糸が切れる
reelOutcome = 'break'
inv.fishing_bait = 2
local nResults = countNui(function(m) return m.action == 'result' end)
TriggerEvent('ta-fishing:useRod')
ok(runUntil(function() return countNui(function(m) return m.action == 'result' end) > nResults end), '結果が出る')
local lost = lastNui('result')
ok(lost and not lost.caught and lost.reason:find('糸が切れて'), '糸が切れたらガイドで伝える')
reelOutcome = 'win'
xPressed = true
run(1000)
ok(runUntil(function() return lastAction() == 'hideGuide' end, 10000), '糸が切れたあともやめられる')

-- 水辺が無い
waterHit = false
TriggerEvent('ta-fishing:useRod')
run(200)
ok(lastAlert():find('水辺がありません'), '水辺が無いと始めない')
waterHit = true

-- 乗車中
inVeh = true
TriggerEvent('ta-fishing:useRod')
run(200)
ok(lastAlert():find('釣りができません'), '乗車中は始めない')
inVeh = false

-- ===== 漁師の画面 =====
for k in pairs(inv) do if k:find('^fish_') then inv[k] = 0 end end
inv.fish_aji, inv.fish_saba = 4, 2
CreateThread(targetOpts[1].onSelect)
local op = lastNui('open')
ok(op and op.canTrade == true and op.tab == 'sell' and focus == true, '漁師と話すと画面が開く')
ok(op.data and #op.data.fish == #Config.Fish and op.data.imageBase:find('nui://', 1, true), '画面のデータ')
local aji
for _, f in ipairs(op.data.fish) do if f.item == 'fish_aji' then aji = f end end
ok(aji and aji.count == 4 and aji.price > 0, '手持ちと相場')

-- 1種類だけ数を指定して売る
local r1 = nuiCall('sell', { item = 'fish_aji', count = 1 })
ok(r1 and r1.ok and r1.sold == 1 and inv.fish_aji == 3 and money.cash > 0, '1匹だけ売れる')
ok(r1.data and r1.data.fish, '売ったあとのデータを返す')
-- 全部売る
local r2 = nuiCall('sell', { all = true })
ok(r2 and r2.ok and r2.sold == 5 and inv.fish_aji == 0 and inv.fish_saba == 0, '全部売れる')
local r3 = nuiCall('sell', { all = true })
ok(r3 and not r3.ok and r3.reason, '魚が無いと売れない')

-- 道具を買う
nuiCall('openShop', {})
ok(shopOpened == 'ta_fishing' and focus == false, '店を開くと画面を閉じる')

-- 閉じる
CreateThread(targetOpts[1].onSelect)
nuiCall('close', {})
ok(focus == false, '閉じるとフォーカスを返す')

-- コマンドからは見るだけ
commands.fishstats()
op = lastNui('open')
ok(op.tab == 'record' and op.canTrade == false, '/fishstats は記録を見るだけ')
nuiCall('close', {})
commands.fishrank()
op = lastNui('open')
ok(op.tab == 'ranking' and op.canTrade == false and op.data.ranking.byExp[1].name == '太郎 釣田', '/fishrank')
nuiCall('close', {})

-- 釣りの最中は開かない
local before = countNui(function(m) return m.action == 'open' end)
inv.fishing_bait = 1
TriggerEvent('ta-fishing:useRod')
run(1300)
commands.fishstats()
ok(countNui(function(m) return m.action == 'open' end) == before, '釣りの最中は画面を開かない')
xPressed = true
run(500)

-- 遠くから売ろうとする
me = vec3(0, 50, 10)
local far = callbacks['ta-fishing:sell'](1, nil)
ok(not far.ok, '遠くからは売れない')

-- 停止
TriggerEvent('onResourceStop', 'ta-fishing')
ok(targetOpts == nil, '停止で NPC を消す')

print(('結果: %d 件成功 / %d 件失敗'):format(pass, fail))
if fail > 0 then error('テスト失敗') end
