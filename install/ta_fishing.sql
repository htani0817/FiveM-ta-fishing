-- ta-fishing の記録テーブル
-- リソースの起動時に CREATE TABLE IF NOT EXISTS で自動作成するので、手で流す必要は普段は無い
-- 起動時の自動作成を使わない運用のときだけ、これを手で適用する

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
