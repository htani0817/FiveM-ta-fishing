-- ta-fishing サーバー側
-- 抽選・アイテムの付与・売却・相場・記録はすべてここで決める。client は演出とスキルチェックだけを受け持つ

local Sessions = {}    -- [src] = 釣りの最中の情報（1回投げるごとに作る）
local LastCast = {}    -- [src] = 最後に投げた時刻
local Profiles = {}    -- [citizenid] = { name, exp, caught, legendary, species = { [item] = 数 } }
local HourlyLog = {}   -- [citizenid] = 直近1時間に釣った時刻の一覧
local Market = {}      -- [item] = { price, prev }
local RankingCache = { at = 0, data = nil }

local function notify(src, msg, kind, time)
    TriggerClientEvent('okokNotify:Alert', src, '釣り', msg, time or 5000, kind or 'info')
end

local function getPlayer(src)
    return exports.qbx_core:GetPlayer(src)
end

local function pedCoords(src)
    local ped = GetPlayerPed(tostring(src))
    if not ped or ped == 0 then return nil end
    return GetEntityCoords(ped)
end

-- ================== データベース ==================

-- 旧名 tani-fishing の記録を引き継ぐ。新しいテーブルが空で、古いテーブルがある時だけ写す（古いテーブルは消さずに残す）
local function migrateFromTaniFishing()
    local old = MySQL.query.await("SHOW TABLES LIKE 'tani_fishing_players'")
    if not old or #old == 0 then return end
    if (MySQL.scalar.await('SELECT COUNT(*) FROM ta_fishing_players') or 0) > 0 then return end
    local moved = MySQL.update.await([[
        INSERT INTO ta_fishing_players (citizenid, name, exp, level, caught, legendary, species)
        SELECT citizenid, name, exp, level, caught, legendary, species FROM tani_fishing_players
    ]]) or 0
    if moved > 0 then
        print(('[ta-fishing] 旧 tani-fishing の記録を %d 人分引き継ぎました（tani_fishing_players は残しています）'):format(moved))
    end
end

CreateThread(function()
    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS `ta_fishing_players` (
            `citizenid` VARCHAR(50) NOT NULL,
            `name` VARCHAR(100) NOT NULL DEFAULT '',
            `exp` INT UNSIGNED NOT NULL DEFAULT 0,
            `level` SMALLINT UNSIGNED NOT NULL DEFAULT 1,
            `caught` INT UNSIGNED NOT NULL DEFAULT 0,
            `legendary` INT UNSIGNED NOT NULL DEFAULT 0,
            `species` LONGTEXT NULL,
            `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (`citizenid`),
            KEY `idx_exp` (`exp`),
            KEY `idx_caught` (`caught`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ]])
    migrateFromTaniFishing()
end)

local function charName(player)
    local info = player.PlayerData.charinfo or {}
    local name = ((info.firstname or '') .. ' ' .. (info.lastname or '')):gsub('^%s+', ''):gsub('%s+$', '')
    if name == '' then name = GetPlayerName(player.PlayerData.source) or '名無し' end
    return name
end

local function loadProfile(player)
    local cid = player.PlayerData.citizenid
    local profile = Profiles[cid]
    if profile then
        profile.name = charName(player)
        return profile
    end
    local row = MySQL.single.await('SELECT `exp`, `caught`, `legendary`, `species` FROM `ta_fishing_players` WHERE `citizenid` = ?', { cid })
    profile = {
        name = charName(player),
        exp = row and row.exp or 0,
        caught = row and row.caught or 0,
        legendary = row and row.legendary or 0,
        species = (row and row.species and json.decode(row.species)) or {},
    }
    Profiles[cid] = profile
    return profile
end

local function saveProfile(cid, profile)
    local level = Fishing.levelFromExp(profile.exp)
    MySQL.prepare([[
        INSERT INTO `ta_fishing_players` (`citizenid`, `name`, `exp`, `level`, `caught`, `legendary`, `species`)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE `name` = VALUES(`name`), `exp` = VALUES(`exp`), `level` = VALUES(`level`),
            `caught` = VALUES(`caught`), `legendary` = VALUES(`legendary`), `species` = VALUES(`species`)
    ]], { cid, profile.name, profile.exp, level, profile.caught, profile.legendary, json.encode(profile.species) })
    RankingCache.at = 0
end

-- ================== 相場 ==================

local function mid(fish) return (fish.price.min + fish.price.max) / 2 end

local function publishMarket()
    local out = {}
    for item, m in pairs(Market) do
        local trend = 0
        if m.price > m.prev + 0.5 then trend = 1 elseif m.price < m.prev - 0.5 then trend = -1 end
        -- diff は前回の更新からの差（円）。売られて下がった分も含む
        out[item] = { price = math.floor(m.price), trend = trend, diff = math.floor(m.price) - math.floor(m.prev) }
    end
    GlobalState.taFishingMarket = out
end

local function tickMarket()
    for _, fish in ipairs(Config.Fish) do
        local m = Market[fish.item]
        local center = mid(fish)
        if not m then
            m = { price = math.random(fish.price.min, fish.price.max) + 0.0 }
            m.prev = m.price
            Market[fish.item] = m
        else
            m.prev = m.price
            local swing = center * Config.Market.swing * (math.random() * 2 - 1)
            m.price = m.price + (center - m.price) * Config.Market.revert + swing
        end
        m.price = math.max(fish.price.min, math.min(fish.price.max, m.price))
    end
    publishMarket()
end

local MarketNextAt = 0 -- 次に相場を動かす時刻（os.time）。漁師の画面の「次の更新まで」に使う

CreateThread(function()
    math.randomseed(os.time())
    tickMarket()
    while true do
        MarketNextAt = os.time() + Config.Market.intervalMinutes * 60
        Wait(Config.Market.intervalMinutes * 60000)
        tickMarket()
        Fishing.debug('相場を更新した')
    end
end)

-- ================== 抽選 ==================

local function weatherNow()
    local w = GlobalState.weather
    return type(w) == 'table' and w.weather or nil
end

local function gradeWeight(key, level)
    local g = Config.Grades[key]
    if level < (g.minLevel or 1) then return 0 end
    local w = g.weight * (1 + (g.perLevel or 0) * (level - 1))
    if GlobalState.isNight and Config.NightBonus[key] then
        w = w * Config.NightBonus[key]
    end
    return w
end

local function fishPool(grade, habitat)
    local pool = {}
    for _, fish in ipairs(Config.Fish) do
        if fish.grade == grade and (fish.habitat == 'any' or fish.habitat == habitat) then
            pool[#pool + 1] = fish
        end
    end
    return pool
end

local function rollFish(level, habitat)
    local candidates, total = {}, 0
    for _, key in ipairs(Config.GradeOrder) do
        local w = gradeWeight(key, level)
        if w > 0 and #fishPool(key, habitat) > 0 then
            candidates[#candidates + 1] = { key = key, w = w }
            total = total + w
        end
    end
    if total <= 0 then return nil end
    local r, grade = math.random() * total, candidates[#candidates].key
    for _, c in ipairs(candidates) do
        r = r - c.w
        if r <= 0 then grade = c.key break end
    end
    local pool = fishPool(grade, habitat)
    return pool[math.random(#pool)]
end

-- 糸の張りのミニゲームに渡す値。共通の Config.Reel に、グレードの強さ（レベルが高ければ eased）を重ねる
local function reelFor(grade, level)
    local g = Config.Grades[grade]
    local p = {}
    for k, v in pairs(Config.Reel) do p[k] = v end
    for k, v in pairs(g.reel) do p[k] = v end
    if g.easeLevel and g.eased and level >= g.easeLevel then
        for k, v in pairs(g.eased) do p[k] = v end
    end
    return p
end

-- 1時間あたりの上限
local function underHourlyCap(cid)
    local now, list, kept = os.time(), HourlyLog[cid] or {}, {}
    for _, t in ipairs(list) do
        if now - t < 3600 then kept[#kept + 1] = t end
    end
    HourlyLog[cid] = kept
    return #kept < Config.HourlyCap
end

-- ================== 釣り ==================

local function isNumber(v) return type(v) == 'number' and v == v and v > -1e6 and v < 1e6 end

lib.callback.register('ta-fishing:cast', function(src, water)
    local player = getPlayer(src)
    if not player then return { ok = false } end
    if Sessions[src] then return { ok = false, reason = 'すでに竿を投げています' } end

    local now = GetGameTimer()
    if LastCast[src] and now - LastCast[src] < Config.CastCooldownMs then
        return { ok = false, reason = '少し待ってから投げてください' }
    end

    if type(water) ~= 'table' or not (isNumber(water.x) and isNumber(water.y) and isNumber(water.z)) then
        return { ok = false }
    end
    local habitat = water.z > Config.FreshwaterMinZ and 'fresh' or 'sea'

    local coords = pedCoords(src)
    if not coords then return { ok = false } end
    local maxDist = 0
    for _, d in ipairs(Config.CastDistances) do maxDist = math.max(maxDist, d) end
    local flat = #(vec2(coords.x, coords.y) - vec2(water.x, water.y))
    if flat > maxDist + 4.0 or water.z > coords.z + 2.0 or water.z < coords.z - Config.MaxDrop - 3.0 then
        Fishing.debug(('水面の位置がおかしい src=%s dist=%.1f'):format(src, flat))
        return { ok = false, reason = '近くに水辺がありません' }
    end

    local weather = weatherNow()
    if weather and Config.Weather.blocked[weather] then
        return { ok = false, reason = '雷が鳴っていて危ないので、竿をしまった' }
    end

    if exports.ox_inventory:Search(src, 'count', Config.RodItem) < 1 then
        return { ok = false, reason = '釣り竿を持っていません' }
    end

    local cid = player.PlayerData.citizenid
    if not underHourlyCap(cid) then
        print(('[ta-fishing] 1時間の上限に達した citizenid=%s src=%s'):format(cid, src))
        return { ok = false, reason = 'この1時間で釣りすぎて、魚が警戒している。少し時間をおこう。' }
    end

    local profile = loadProfile(player)
    local level = Fishing.levelFromExp(profile.exp)
    local fish = rollFish(level, habitat)
    if not fish then return { ok = false, reason = 'ここでは何も釣れそうにない' } end

    if not exports.ox_inventory:RemoveItem(src, Config.BaitItem, 1) then
        return { ok = false, reason = '餌がありません。漁師から買えます。', noBait = true }
    end

    local wait = math.random(Config.WaitMs.min, Config.WaitMs.max)
    wait = math.floor(wait * ((weather and Config.Weather.waitMultiplier[weather]) or 1.0))

    LastCast[src] = now
    Sessions[src] = { fish = fish, startedAt = now, wait = wait, coords = coords, cid = cid, level = level }
    Fishing.debug(('cast src=%s %s wait=%d habitat=%s'):format(src, fish.item, wait, habitat))

    return {
        ok = true,
        wait = wait,
        reel = reelFor(fish.grade, level),
        strong = Fishing.GradeRank[fish.grade] >= 4, -- 大物の気配（エピック以上）
        habitat = habitat,
        bait = exports.ox_inventory:Search(src, 'count', Config.BaitItem) or 0,
    }
end)

lib.callback.register('ta-fishing:cancel', function(src)
    Sessions[src] = nil
    return true
end)

-- success は糸の張りのミニゲームで釣り上げたか。cause は失敗の理由（break / escape / timeout）
lib.callback.register('ta-fishing:reel', function(src, success, cause)
    local s = Sessions[src]
    if not s then return { ok = false } end
    Sessions[src] = nil

    local elapsed = GetGameTimer() - s.startedAt
    if elapsed < s.wait - 500 then
        print(('[ta-fishing] アタリの前に引き上げた src=%s elapsed=%d wait=%d'):format(src, elapsed, s.wait))
        return { ok = false }
    end
    if elapsed > s.wait + Config.ReelTimeoutMs then
        return { ok = true, caught = false, reason = '時間がかかりすぎて逃げられた' }
    end
    -- ミニゲームは最短でも数秒かかる。早すぎる成功は改ざんとして扱う
    if success == true and elapsed < s.wait + Config.Reel.minMs - 500 then
        print(('[ta-fishing] 引き上げが早すぎる src=%s reel=%d'):format(src, elapsed - s.wait))
        return { ok = true, caught = false, reason = ('%sに逃げられた'):format(s.fish.label) }
    end
    local coords = pedCoords(src)
    if not coords or #(coords - s.coords) > 3.0 then
        return { ok = true, caught = false, reason = '動いたので魚に逃げられた' }
    end
    if success ~= true then
        local reason = ('%sに逃げられた'):format(s.fish.label)
        if cause == 'break' then
            reason = ('糸が切れて、%sに逃げられた'):format(s.fish.label)
        elseif cause == 'timeout' then
            reason = ('時間がかかりすぎて、%sに逃げられた'):format(s.fish.label)
        end
        return { ok = true, caught = false, reason = reason }
    end

    local player = getPlayer(src)
    if not player or player.PlayerData.citizenid ~= s.cid then return { ok = false } end

    if not exports.ox_inventory:CanCarryItem(src, s.fish.item, 1) then
        return { ok = true, caught = false, reason = '持ち物がいっぱいで、魚を逃がした' }
    end
    if not exports.ox_inventory:AddItem(src, s.fish.item, 1) then
        return { ok = true, caught = false, reason = '魚を受け取れなかった' }
    end

    HourlyLog[s.cid] = HourlyLog[s.cid] or {}
    table.insert(HourlyLog[s.cid], os.time())

    local profile = loadProfile(player)
    local grade = Config.Grades[s.fish.grade]
    local before = Fishing.levelFromExp(profile.exp)
    profile.exp = profile.exp + grade.exp
    profile.caught = profile.caught + 1
    profile.species[s.fish.item] = (profile.species[s.fish.item] or 0) + 1
    if s.fish.grade == 'legendary' then profile.legendary = profile.legendary + 1 end
    saveProfile(s.cid, profile)

    local level, into, need = Fishing.levelFromExp(profile.exp)

    if s.fish.grade == 'legendary' then
        -- レジェンドは全員に知らせる
        TriggerClientEvent('okokNotify:Alert', -1, 'レジェンド', ('%s さんが%sを釣り上げた'):format(profile.name, s.fish.label), 8000, 'success')
    end

    return {
        ok = true,
        caught = true,
        fish = { item = s.fish.item, label = s.fish.label, grade = s.fish.grade, gradeLabel = grade.label, color = grade.color },
        exp = grade.exp,
        level = level,
        into = into,
        need = need,
        leveledUp = level > before,
    }
end)

AddEventHandler('playerDropped', function()
    Sessions[source] = nil
    LastCast[source] = nil
end)

-- ================== 漁師（ショップ・売却） ==================

CreateThread(function()
    local inventory = {}
    for i, it in ipairs(Config.Shop.items) do
        inventory[i] = { name = it.name, price = it.price }
    end
    -- ox_inventory は起動直後だと export がまだ登録されていないことがあるので、最大30秒待つ
    local ready = pcall(lib.waitFor, function()
        if pcall(function() return exports.ox_inventory.RegisterShop end) then return true end
    end, 'ox_inventory の RegisterShop が30秒以内に使えるようになりませんでした', 30000)
    if not ready then
        print('^1[ta-fishing] ox_inventory の RegisterShop が使えないため、漁師の店を登録できませんでした^0')
        return
    end
    exports.ox_inventory:RegisterShop(Config.Shop.id, {
        name = Config.Shop.label,
        inventory = inventory,
        useBank = Config.Shop.useBank,
    })
end)

local function nearNpc(src)
    local coords = pedCoords(src)
    if not coords then return false end
    return #(coords - Config.Npc.coords.xyz) <= Config.Npc.useDistance + 3.0
end

local function marketPrice(item)
    local m = Market[item]
    return m and math.floor(m.price) or 0
end

-- 売る。item が nil なら手持ちの魚を全部売る
local function sellOne(src, fish, count)
    local have = exports.ox_inventory:Search(src, 'count', fish.item) or 0
    count = math.min(count, have)
    if count < 1 then return 0, 0 end
    local m = Market[fish.item]
    local total, price = 0, m.price
    for _ = 1, count do
        total = total + math.floor(price)
        price = math.max(fish.price.min, price * (1 - Config.Market.saleImpact))
    end
    if not exports.ox_inventory:RemoveItem(src, fish.item, count) then return 0, 0 end
    m.price = price
    return count, total
end

lib.callback.register('ta-fishing:sell', function(src, item, count)
    if not getPlayer(src) then return { ok = false } end
    if not nearNpc(src) then return { ok = false, reason = '漁師から離れすぎています' } end

    local targets = {}
    if item == nil then
        for _, fish in ipairs(Config.Fish) do targets[#targets + 1] = { fish = fish, count = math.huge } end
    else
        local fish = Fishing.FishByItem[item]
        count = math.floor(tonumber(count) or 0)
        if not fish or count < 1 then return { ok = false } end
        targets[1] = { fish = fish, count = count }
    end

    local sold, total = 0, 0
    for _, t in ipairs(targets) do
        local n, money = sellOne(src, t.fish, t.count)
        sold, total = sold + n, total + money
    end
    if sold < 1 then return { ok = false, reason = '売れる魚がありません' } end

    exports.qbx_core:AddMoney(src, Config.SellAccount, total, 'ta-fishing-sell')
    publishMarket()
    return { ok = true, sold = sold, total = total }
end)

-- ================== 記録・ランキング ==================

local function statsFor(src)
    local player = getPlayer(src)
    if not player then return nil end
    local profile = loadProfile(player)
    local level, into, need = Fishing.levelFromExp(profile.exp)
    return {
        name = profile.name,
        level = level, into = into, need = need,
        exp = profile.exp, caught = profile.caught, legendary = profile.legendary,
        species = profile.species,
    }
end

local function rankingData()
    local now = os.time()
    if RankingCache.data and now - RankingCache.at < Config.Ranking.cacheSeconds then
        return RankingCache.data
    end
    local size = Config.Ranking.size
    local byExp = MySQL.query.await('SELECT `name`, `exp`, `level`, `caught` FROM `ta_fishing_players` ORDER BY `exp` DESC, `caught` DESC LIMIT ?', { size }) or {}
    local byCaught = MySQL.query.await('SELECT `name`, `exp`, `level`, `caught` FROM `ta_fishing_players` ORDER BY `caught` DESC, `exp` DESC LIMIT ?', { size }) or {}
    RankingCache.data = { byExp = byExp, byCaught = byCaught }
    RankingCache.at = now
    return RankingCache.data
end

lib.callback.register('ta-fishing:stats', function(src) return statsFor(src) end)
lib.callback.register('ta-fishing:ranking', function() return rankingData() end)

-- 漁師の画面（NUI）に出すものを1回で返す。相場・手持ちの数・自分の記録・ランキング
lib.callback.register('ta-fishing:board', function(src)
    local stats = statsFor(src)
    if not stats then return nil end
    local grades = {}
    for key, g in pairs(Config.Grades) do grades[key] = { label = g.label, color = g.color } end
    local fish = {}
    for _, f in ipairs(Config.Fish) do
        local m = Market[f.item]
        fish[#fish + 1] = {
            item = f.item, label = f.label, grade = f.grade, habitat = f.habitat,
            min = f.price.min, max = f.price.max,
            price = marketPrice(f.item),
            diff = m and (math.floor(m.price) - math.floor(m.prev)) or 0,
            count = exports.ox_inventory:Search(src, 'count', f.item) or 0,
        }
    end
    return {
        npc = { name = Config.Npc.blip and Config.Npc.blip.label or '漁師', place = Config.Npc.place or '' },
        grades = grades,
        gradeOrder = Config.GradeOrder,
        interval = Config.Market.intervalMinutes,
        nextIn = math.max(0, MarketNextAt - os.time()),
        rankingSize = Config.Ranking.size,
        fish = fish,
        stats = stats,
        ranking = rankingData(),
    }
end)
