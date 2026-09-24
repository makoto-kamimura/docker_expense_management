-- RingiWoMerge
-- スキーマ (families / users / purchase_requests / comments / activities など) は
-- API 起動時に app/backend/src/migrate.rs が冪等に作成・移行する。
-- 旧・経費精算アプリの DB も同じ処理で購入申請へ変換される。
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
