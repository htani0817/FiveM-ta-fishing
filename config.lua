-- ta-fishing 設定ファイル（client / server の両方から読み込まれる）
Config = {}

-- デバッグログ（true にすると client / server で詳細ログを出す）
Config.Debug = false

-- ================== アイテム ==================

Config.RodItem = 'fishing_rod'   -- 釣り竿（使うと釣りを始める。減らない）
Config.BaitItem = 'fishing_bait' -- 釣り餌（1回投げるごとに1個減る）

-- ================== 漁師 NPC ==================

Config.Npc = {
    model = `s_m_y_dockwork_01`,
    place = 'デル・ペロ桟橋', -- 漁師の画面に出す場所の名前
    -- デル・ペロ桟橋の海鮮料理店の前。z は地面に合わせ直すので目安でよい（実機で位置を確かめる）
    coords = vec4(-1816.6, -1193.3, 14.3, 330.0),
    scenario = 'WORLD_HUMAN_STAND_IMPATIENT',
    spawnDistance = 80.0,  -- この距離に近づいたら NPC を出す
    useDistance = 5.0,     -- 売却をサーバーで受け付ける距離（メートル）
    blip = { sprite = 68, color = 3, scale = 0.8, label = '漁師' },
}

-- 漁師の店（ox_inventory のショップ。値段は円）
Config.Shop = {
    id = 'ta_fishing',
    label = '漁師の店',
    useBank = true, -- 銀行払い（このサーバーの ox_inventory 改修 useBank を使う。改修が無い環境では現金払いになる）
    items = {
        { name = 'fishing_rod', price = 15000 },
        { name = 'fishing_bait', price = 40 },
    },
}

-- 売上の受け取り先（'cash' か 'bank'）
Config.SellAccount = 'cash'

-- ================== 釣りの動作 ==================

-- 竿を投げる先を探す距離（前方、メートル）。近い順ではなく、この順に水面を探す
Config.CastDistances = { 8.0, 12.0, 5.0, 16.0 }
-- 足元から水面までの高さの上限（メートル。桟橋や崖の上から釣れる高さ）
Config.MaxDrop = 25.0
-- 水面の高さがこれより上なら淡水（湖・川・貯水池）、下なら海として扱う
Config.FreshwaterMinZ = 3.0

-- アタリまでの待ち時間（ミリ秒）。1回の釣りが約40秒になる長さ（収入の目安は README）
Config.WaitMs = { min = 15000, max = 35000 }
-- アタリのあと、引き上げの結果を受け付ける時間（ミリ秒。糸の張りのミニゲームの時間を含む）
Config.ReelTimeoutMs = 30000

-- 糸の張りのミニゲーム（左クリック長押しで巻く。張りが100で糸が切れ、寄せが0で逃げられる）
-- 魚ごとの強さは Config.Grades の reel で決める
Config.Reel = {
    timeLimitMs = 25000, -- これを過ぎると逃げられる（ReelTimeoutMs より短くする）
    minMs = 2500,        -- サーバーが受け付ける最短の引き上げ時間（改ざん対策）
    startProgress = 20,  -- 寄せの初期値（0〜100。100で釣り上げ）
    holdTension = 62,    -- 巻いている間に張りが近づく値（魚が落ち着いているとき）
    restTension = 18,    -- 離している間に張りが近づく値
    response = 1.6,      -- 張りが目標の値に近づく速さ（1秒あたりの割合）
    dangerFrom = 85,     -- 画面で赤く示す張り
    warnMs = 600,        -- 魚が暴れる前の合図の長さ（この間に指を離せば間に合う）
    slipCalm = 4,        -- 離している間に寄せが減る速さ（落ち着いているとき、1秒あたり）
    slipRun = 3,         -- 暴れている間に寄せが減る速さ
    runReel = 0.25,      -- 暴れている間に巻いたときの寄せの伸び（ふだんの何倍か）
}
-- 続けて投げられる間隔の下限（ミリ秒）
Config.CastCooldownMs = 1500
-- 1人あたり、1時間に釣れる数の上限（改ざん対策。超えたら付与を止めてログに残す）
Config.HourlyCap = 150
-- 釣れたあと、餌があれば自動で投げ直す
Config.AutoRecast = true
-- 釣果（逃げられたときも）をガイドに出しておく時間（ミリ秒）
Config.ResultShowMs = 2500

-- 画面（NUI）の大きさ。縦1080pxの画面での倍率で、ほかの解像度では画面の高さに合わせて自動で拡大・縮小する
Config.UiScale = {
    guide = 1.3,  -- 釣りの最中のガイド
    dialog = 1.0, -- 漁師の画面
}

-- 天候（Renewed-Weathersync の GlobalState.weather.weather）
Config.Weather = {
    waitMultiplier = { RAIN = 0.75, CLEARING = 0.9 }, -- 待ち時間の倍率
    blocked = { THUNDER = true },                     -- 釣りができない天候
}

-- 夜（GlobalState.isNight）はグレードの重みを掛ける
Config.NightBonus = { rare = 1.2, epic = 1.3, legendary = 1.5 }

-- アニメと竿の prop
Config.Anim = {
    dict = 'amb@world_human_stand_fishing@idle_a',
    clip = 'idle_c',
    rod = `prop_fishing_rod_01`,
    bone = 18905, -- 左手
    offset = vec3(0.1, 0.05, 0.0),
    rotation = vec3(80.0, 120.0, 160.0),
}

-- ================== レベル ==================

Config.Level = {
    max = 30,
    -- level から level+1 に上がるのに要る経験値
    need = function(level) return 60 + 30 * level end,
}

-- ================== グレード ==================
-- weight     : レベル1での抽選の重み
-- perLevel   : 1レベル上がるごとに重みに足す割合（0.1 なら +10%）
-- minLevel   : このレベル未満では出ない
-- exp        : 1匹で入る経験値
-- reel       : 糸の張りのミニゲームでの魚の強さ
--   pull   : 暴れたときに張りへ足す値（巻き続けると holdTension + pull に近づく。100を超えると切れうる）
--   speed  : 落ち着いているときに巻くと、1秒で寄せが伸びる値
--   every  : 暴れるまでの間隔（秒、最小と最大）
--   runFor : 暴れる長さ（秒、最小と最大）
-- easeLevel / eased : このレベル以上になると、reel の値を eased で上書きして軽くする
Config.GradeOrder = { 'common', 'uncommon', 'rare', 'epic', 'legendary' }
Config.Grades = {
    common = {
        label = 'コモン', color = '#a7b0ba', weight = 70, perLevel = 0, minLevel = 1, exp = 5,
        reel = { pull = 34, speed = 14, every = { 3.0, 5.0 }, runFor = { 0.6, 1.0 } },
    },
    uncommon = {
        label = 'アンコモン', color = '#52b878', weight = 22, perLevel = 0.04, minLevel = 1, exp = 12,
        reel = { pull = 46, speed = 13, every = { 2.5, 4.5 }, runFor = { 0.8, 1.3 } },
    },
    rare = {
        label = 'レア', color = '#3f8cff', weight = 7, perLevel = 0.08, minLevel = 1, exp = 30,
        reel = { pull = 58, speed = 13, every = { 2.2, 4.0 }, runFor = { 1.0, 1.6 } },
        easeLevel = 10, eased = { pull = 52, speed = 14 },
    },
    epic = {
        label = 'エピック', color = '#a86bf5', weight = 1.0, perLevel = 0.15, minLevel = 5, exp = 80,
        reel = { pull = 66, speed = 13, every = { 2.2, 3.8 }, runFor = { 1.1, 1.8 } },
        easeLevel = 18, eased = { pull = 58, speed = 15 },
    },
    legendary = {
        label = 'レジェンド', color = '#f4b52e', weight = 0.15, perLevel = 0.25, minLevel = 10, exp = 250,
        reel = { pull = 74, speed = 13, every = { 2.2, 3.6 }, runFor = { 1.2, 2.0 } },
        easeLevel = 25, eased = { pull = 66, speed = 15 },
    },
}

-- ================== 魚 ==================
-- habitat : 'sea'（海）/ 'fresh'（淡水）/ 'any'（どちらでも）
-- price   : 相場が動く範囲（円）。この範囲の中で時間と売れ行きで変わる
Config.Fish = {
    { item = 'fish_aji',      label = 'アジ',         grade = 'common',    habitat = 'sea',   price = { min = 200,   max = 320 } },
    { item = 'fish_iwashi',   label = 'イワシ',       grade = 'common',    habitat = 'sea',   price = { min = 150,   max = 260 } },
    { item = 'fish_funa',     label = 'フナ',         grade = 'common',    habitat = 'fresh', price = { min = 180,   max = 300 } },
    { item = 'fish_saba',     label = 'サバ',         grade = 'uncommon',  habitat = 'sea',   price = { min = 380,   max = 600 } },
    { item = 'fish_kasago',   label = 'カサゴ',       grade = 'uncommon',  habitat = 'sea',   price = { min = 500,   max = 800 } },
    { item = 'fish_bass',     label = 'ブラックバス', grade = 'uncommon',  habitat = 'fresh', price = { min = 450,   max = 700 } },
    { item = 'fish_kurodai',  label = 'クロダイ',     grade = 'rare',      habitat = 'sea',   price = { min = 1000,  max = 1600 } },
    { item = 'fish_suzuki',   label = 'スズキ',       grade = 'rare',      habitat = 'any',   price = { min = 1100,  max = 1800 } },
    { item = 'fish_nijimasu', label = 'ニジマス',     grade = 'rare',      habitat = 'fresh', price = { min = 900,   max = 1500 } },
    { item = 'fish_hirame',   label = 'ヒラメ',       grade = 'epic',      habitat = 'sea',   price = { min = 2800,  max = 4400 } },
    { item = 'fish_itou',     label = 'イトウ',       grade = 'epic',      habitat = 'fresh', price = { min = 3200,  max = 5000 } },
    { item = 'fish_maguro',   label = 'クロマグロ',   grade = 'legendary', habitat = 'sea',   price = { min = 12000, max = 20000 } },
    { item = 'fish_kingoi',   label = '黄金ゴイ',     grade = 'legendary', habitat = 'fresh', price = { min = 15000, max = 25000 } },
}

-- ================== 相場 ==================
Config.Market = {
    intervalMinutes = 20, -- 相場を動かす間隔
    swing = 0.08,         -- 1回で動く幅（範囲の中央値に対する割合、±）
    revert = 0.15,        -- 1回ごとに中央値へ戻る強さ（0〜1）
    saleImpact = 0.003,   -- 1匹売るごとに下がる割合（同じ魚を大量に売ると安くなる）
}

-- ================== ランキング ==================
Config.Ranking = {
    size = 10,          -- 上位何人を出すか
    cacheSeconds = 30,  -- 集計の使い回し時間
}
