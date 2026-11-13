-- client / server 共通の関数
Fishing = {}

-- 魚のアイテム名 → 設定
Fishing.FishByItem = {}
for _, fish in ipairs(Config.Fish) do
    Fishing.FishByItem[fish.item] = fish
end

-- グレード名 → 順番（1 = コモン … 5 = レジェンド）
Fishing.GradeRank = {}
for i, key in ipairs(Config.GradeOrder) do
    Fishing.GradeRank[key] = i
end

-- 累計経験値から、レベル・そのレベルで貯めた経験値・次に要る経験値を出す
function Fishing.levelFromExp(exp)
    local level = 1
    local rest = math.max(0, math.floor(tonumber(exp) or 0))
    while level < Config.Level.max do
        local need = Config.Level.need(level)
        if rest < need then
            return level, rest, need
        end
        rest = rest - need
        level = level + 1
    end
    return level, 0, 0
end

-- 1,234,567 のような3桁区切り
function Fishing.comma(n)
    local s = tostring(math.floor(tonumber(n) or 0))
    local sign, digits = s:match('^(-?)(%d+)$')
    if not digits then return s end
    return sign .. digits:reverse():gsub('(%d%d%d)', '%1,'):reverse():gsub('^,', '')
end

function Fishing.debug(...)
    if Config.Debug then
        print('[ta-fishing]', ...)
    end
end
