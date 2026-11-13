-- ox_inventory/data/items.lua の末尾の } の前に貼る定義の控え
-- ox_inventory を差し替えると items.lua の追記は消えるので、そのときはここから貼り直す
-- 画像は install/images/ の PNG を ox_inventory/web/images/ にコピーする

    ['fishing_rod'] = {
        label = '釣り竿',
        weight = 800,
        stack = false,
        close = true,
        consume = 0,
        description = '水辺を向いて使う。餌が要る。',
        client = { event = 'ta-fishing:useRod' },
    },
    ['fishing_bait'] = { label = '釣り餌', weight = 20, description = '1回投げるごとに1個使う。' },

    -- コモン
    ['fish_aji']      = { label = 'アジ',         weight = 300,   description = 'コモン・海' },
    ['fish_iwashi']   = { label = 'イワシ',       weight = 150,   description = 'コモン・海' },
    ['fish_funa']     = { label = 'フナ',         weight = 400,   description = 'コモン・淡水' },
    -- アンコモン
    ['fish_saba']     = { label = 'サバ',         weight = 500,   description = 'アンコモン・海' },
    ['fish_kasago']   = { label = 'カサゴ',       weight = 400,   description = 'アンコモン・海' },
    ['fish_bass']     = { label = 'ブラックバス', weight = 800,   description = 'アンコモン・淡水' },
    -- レア
    ['fish_kurodai']  = { label = 'クロダイ',     weight = 1200,  description = 'レア・海' },
    ['fish_suzuki']   = { label = 'スズキ',       weight = 1800,  description = 'レア・海と淡水' },
    ['fish_nijimasu'] = { label = 'ニジマス',     weight = 900,   description = 'レア・淡水' },
    -- エピック
    ['fish_hirame']   = { label = 'ヒラメ',       weight = 2500,  description = 'エピック・海' },
    ['fish_itou']     = { label = 'イトウ',       weight = 5000,  description = 'エピック・淡水' },
    -- レジェンド
    ['fish_maguro']   = { label = 'クロマグロ',   weight = 20000, stack = false, description = 'レジェンド・海' },
    ['fish_kingoi']   = { label = '黄金ゴイ',     weight = 3000,  stack = false, description = 'レジェンド・淡水' },
