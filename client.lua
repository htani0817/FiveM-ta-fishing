-- ta-fishing クライアント側
-- 水辺を探す、アニメと竿、釣りの最中のガイドと糸の張りのミニゲーム（NUI）、漁師 NPC と漁師の画面（NUI）を受け持つ

local fishing = false   -- 釣りの最中か
local cancelled = false -- やめるが押されたか
local rodObj = nil
local reelResult = nil  -- ミニゲームの結果（NUI から届く）
local dialogOpen = false

local IMAGE_BASE = 'nui://ox_inventory/web/images/'

-- title を省くと「釣り」
local function notify(msg, kind, time, title)
    exports['okokNotify']:Alert(title or '釣り', msg, time or 5000, kind or 'info')
end

local function nui(action, data)
    data = data or {}
    data.action = action
    data.scale = Config.UiScale -- 画面の大きさ（毎回送るので、config を変えて restart すれば反映される）
    SendNUIMessage(data)
end

-- ================== 水辺を探す ==================

-- 前方の水面を探す。見つかれば水面の座標を返す
local function findWater()
    local ped = cache.ped
    local c = GetEntityCoords(ped)
    local fwd = GetEntityForwardVector(ped)
    for _, dist in ipairs(Config.CastDistances) do
        local x, y = c.x + fwd.x * dist, c.y + fwd.y * dist
        local hit, pos = TestProbeAgainstWater(x, y, c.z + 1.5, x, y, c.z - Config.MaxDrop)
        if hit and pos then
            return pos
        end
    end
    return nil
end

-- ================== アニメと竿 ==================

local function attachRod()
    local ped = cache.ped
    lib.requestModel(Config.Anim.rod)
    local c = GetEntityCoords(ped)
    rodObj = CreateObject(Config.Anim.rod, c.x, c.y, c.z + 0.2, true, true, false)
    SetModelAsNoLongerNeeded(Config.Anim.rod)
    local o, r = Config.Anim.offset, Config.Anim.rotation
    AttachEntityToEntity(rodObj, ped, GetPedBoneIndex(ped, Config.Anim.bone), o.x, o.y, o.z, r.x, r.y, r.z, true, true, false, true, 1, true)
end

local function playIdle()
    lib.requestAnimDict(Config.Anim.dict)
    TaskPlayAnim(cache.ped, Config.Anim.dict, Config.Anim.clip, 8.0, -8.0, -1, 1, 0, false, false, false)
end

local function cleanup()
    local ped = cache.ped
    ClearPedTasks(ped)
    if rodObj and DoesEntityExist(rodObj) then
        DeleteEntity(rodObj)
    end
    rodObj = nil
    RemoveAnimDict(Config.Anim.dict)
end

-- 釣りの最中に続けてよいか（死亡・乗車・泳ぎ・ラグドールでやめる）
local function canContinue()
    local ped = cache.ped
    return not cancelled
        and not IsEntityDead(ped)
        and not IsPedInAnyVehicle(ped, false)
        and not IsPedSwimming(ped)
        and not IsPedRagdoll(ped)
        and not IsPedFalling(ped)
end

-- 釣りの最中は移動と攻撃を止め、X でやめられるようにする
-- 左クリック（攻撃）とスペース（ジャンプ）は止めたうえで、ミニゲームの「巻く」に使う
local function controlLoop()
    CreateThread(function()
        while fishing do
            DisableControlAction(0, 30, true)  -- 左右移動
            DisableControlAction(0, 31, true)  -- 前後移動
            DisableControlAction(0, 21, true)  -- ダッシュ
            DisableControlAction(0, 22, true)  -- ジャンプ
            DisableControlAction(0, 24, true)  -- 攻撃
            DisableControlAction(0, 25, true)  -- 照準
            DisableControlAction(0, 44, true)  -- カバー
            DisableControlAction(0, 140, true) -- 近接攻撃
            DisableControlAction(0, 141, true)
            DisableControlAction(0, 142, true)
            if IsControlJustPressed(0, 73) then -- X
                cancelled = true
            end
            Wait(0)
        end
    end)
end

-- 待つ。途中でやめたら false
local function waitFor(ms)
    local untilAt = GetGameTimer() + ms
    while GetGameTimer() < untilAt do
        if not canContinue() then return false end
        Wait(100)
    end
    return true
end

-- ================== 糸の張りのミニゲーム ==================

RegisterNUICallback('reelDone', function(data, cb)
    reelResult = type(data) == 'table' and data or { result = 'escape' }
    cb({})
end)

-- 左クリックかスペースを押している間を NUI に伝え、結果が届くまで待つ
-- 戻り値: 釣り上げたか, 理由（win / break / escape / timeout / cancel）
local function reelFight(res, distance)
    reelResult = nil
    nui('reel', { params = res.reel, strong = res.strong, distance = distance })
    local down = false
    local deadline = GetGameTimer() + Config.Reel.timeLimitMs + 3000
    while not reelResult do
        if not canContinue() then
            nui('reelStop')
            return false, 'cancel'
        end
        if GetGameTimer() > deadline then
            nui('reelStop')
            return false, 'timeout'
        end
        local now = IsDisabledControlPressed(0, 24) or IsDisabledControlPressed(0, 22)
        if now ~= down then
            down = now
            nui('reelInput', { down = down })
        end
        Wait(0)
    end
    return reelResult.result == 'win', reelResult.result
end

-- ================== 釣り ==================

-- 1回分（投げる → 待つ → アタリ → 引き上げ）
-- 戻り値: 続けて投げてよいか, 結果（釣果か逃げられた）をガイドに出したか
local function fishOnce()
    local water = findWater()
    if not water then
        notify('近くに水辺がありません。水辺を向いて竿を使ってください。', 'warning')
        return false
    end

    local res = lib.callback.await('ta-fishing:cast', false, { x = water.x, y = water.y, z = water.z })
    if not res or not res.ok then
        if res and res.reason then notify(res.reason, res.noBait and 'warning' or 'error') end
        return false
    end

    nui('guide', { state = 'wait', habitat = res.habitat, bait = res.bait })

    if not waitFor(res.wait) then
        lib.callback.await('ta-fishing:cancel', false)
        return false
    end

    -- アタリ
    PlaySoundFrontend(-1, 'CHECKPOINT_PERFECT', 'HUD_MINI_GAME_SOUNDSET', true)
    ShakeGameplayCam('SMALL_EXPLOSION_SHAKE', res.strong and 0.25 or 0.1)

    local c = GetEntityCoords(cache.ped)
    local distance = math.sqrt((water.x - c.x) ^ 2 + (water.y - c.y) ^ 2)
    local success, cause = reelFight(res, distance)
    if cause == 'cancel' then
        lib.callback.await('ta-fishing:cancel', false)
        return false
    end

    local result = lib.callback.await('ta-fishing:reel', false, success, cause)
    if not result or not result.ok then
        return false
    end

    local more = Config.AutoRecast and res.bait > 0
    if res.bait <= 0 then
        notify('餌がなくなった。漁師から買えます。', 'warning')
    end
    if result.caught then
        local f = result.fish
        f.image = IMAGE_BASE .. f.item .. '.png'
        nui('result', {
            caught = true, fish = f, exp = result.exp,
            level = result.level, into = result.into, need = result.need, leveledUp = result.leveledUp,
            next = more,
        })
        if result.leveledUp then
            PlaySoundFrontend(-1, 'RANK_UP', 'HUD_AWARDS', true)
        end
    else
        PlaySoundFrontend(-1, 'LOSER', 'HUD_AWARDS', true)
        nui('result', { caught = false, reason = result.reason or '逃げられた', next = more })
    end

    return more and canContinue(), true
end

local function startFishing()
    if fishing then
        cancelled = true
        return
    end
    if dialogOpen then return end
    local ped = cache.ped
    if IsPedInAnyVehicle(ped, false) or IsPedSwimming(ped) or IsEntityDead(ped) then
        notify('今は釣りができません', 'error')
        return
    end
    if not findWater() then
        notify('近くに水辺がありません。水辺を向いて竿を使ってください。', 'warning')
        return
    end

    fishing, cancelled = true, false
    controlLoop()
    attachRod()
    playIdle()
    nui('guide', { state = 'ready' })
    Wait(1200) -- 竿を構える間

    local shownResult = false
    while true do
        local again
        again, shownResult = fishOnce()
        if not again then break end
        -- 結果を見せる間（投げ直しの間隔より短くはしない）
        if not waitFor(math.max(Config.ResultShowMs, Config.CastCooldownMs + 200)) then break end
        playIdle()
    end

    fishing = false
    cleanup()
    if cancelled then
        nui('hideGuide')
        notify('竿をしまった', 'info', 2500)
    elseif shownResult then
        -- 餌が切れて終わったときも、最後の釣果は少し見せてから消す
        SetTimeout(Config.ResultShowMs, function()
            if not fishing then nui('hideGuide') end
        end)
    else
        nui('hideGuide')
    end
end

-- ox_inventory の items.lua で client = { event = 'ta-fishing:useRod' } を指定する
AddEventHandler('ta-fishing:useRod', function()
    -- ox_inventory の処理を待たせないよう、別スレッドで動かす
    CreateThread(startFishing)
end)

-- ================== 漁師の画面（NUI） ==================

local function setDialog(open)
    dialogOpen = open
    SetNuiFocus(open, open)
end

-- canTrade: 漁師の前で開いたか（売る・道具を買うを出す）。コマンドから開いたときは見るだけ
local function openDialog(tab, canTrade)
    if dialogOpen or fishing then return end
    local data = lib.callback.await('ta-fishing:board', false)
    if not data then return end
    data.imageBase = IMAGE_BASE
    setDialog(true)
    nui('open', { tab = tab, canTrade = canTrade, data = data })
end

RegisterNUICallback('close', function(_, cb)
    setDialog(false)
    cb({})
end)

RegisterNUICallback('openShop', function(_, cb)
    setDialog(false)
    cb({})
    exports.ox_inventory:openInventory('shop', { type = Config.Shop.id })
end)

-- data: { item, count } か { all = true }
RegisterNUICallback('sell', function(data, cb)
    data = type(data) == 'table' and data or {}
    local item = (not data.all) and data.item or nil
    local res = lib.callback.await('ta-fishing:sell', false, item, data.count) or { ok = false }
    local board = lib.callback.await('ta-fishing:board', false)
    if board then
        board.imageBase = IMAGE_BASE
        res.data = board
    end
    cb(res)
end)

-- どこからでも見られるコマンド（売る・道具を買うは出さない）
RegisterCommand('fishstats', function() openDialog('record', false) end, false)
RegisterCommand('fishrank', function() openDialog('ranking', false) end, false)

AddEventHandler('onResourceStop', function(name)
    if name ~= GetCurrentResourceName() then return end
    if rodObj and DoesEntityExist(rodObj) then DeleteEntity(rodObj) end
    if fishing then ClearPedTasks(cache.ped) end
    if dialogOpen then SetNuiFocus(false, false) end
end)

-- ================== 漁師 NPC ==================

local npc = nil

local function groundZ(c)
    local found, z = GetGroundZFor_3dCoord(c.x, c.y, c.z + 2.0, false)
    return found and z or c.z - 1.0
end

local function spawnNpc()
    if npc and DoesEntityExist(npc) then return end
    local c = Config.Npc.coords
    lib.requestModel(Config.Npc.model)
    npc = CreatePed(4, Config.Npc.model, c.x, c.y, groundZ(c), c.w, false, true)
    SetModelAsNoLongerNeeded(Config.Npc.model)
    SetEntityInvincible(npc, true)
    SetBlockingOfNonTemporaryEvents(npc, true)
    SetPedFleeAttributes(npc, 0, false)
    SetPedCanRagdoll(npc, false)
    FreezeEntityPosition(npc, true)
    if Config.Npc.scenario then
        TaskStartScenarioInPlace(npc, Config.Npc.scenario, 0, true)
    end
    exports.ox_target:addLocalEntity(npc, {
        {
            name = 'ta_fishing_npc',
            icon = 'fa-solid fa-fish',
            label = '漁師と話す',
            distance = 2.5,
            onSelect = function() openDialog('sell', true) end,
        },
    })
end

local function despawnNpc()
    if npc and DoesEntityExist(npc) then
        exports.ox_target:removeLocalEntity(npc, 'ta_fishing_npc')
        DeleteEntity(npc)
    end
    npc = nil
end

lib.points.new({
    coords = Config.Npc.coords.xyz,
    distance = Config.Npc.spawnDistance,
    onEnter = spawnNpc,
    onExit = despawnNpc,
})

CreateThread(function()
    local b = Config.Npc.blip
    if not b then return end
    local c = Config.Npc.coords
    local blip = AddBlipForCoord(c.x, c.y, c.z)
    SetBlipSprite(blip, b.sprite)
    SetBlipColour(blip, b.color)
    SetBlipScale(blip, b.scale)
    SetBlipAsShortRange(blip, true)
    BeginTextCommandSetBlipName('STRING')
    AddTextComponentSubstringPlayerName(b.label)
    EndTextCommandSetBlipName(blip)
end)

AddEventHandler('onResourceStop', function(name)
    if name == GetCurrentResourceName() then despawnNpc() end
end)
