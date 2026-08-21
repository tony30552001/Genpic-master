-- Admin console list performance: indexes matching the actual filters and sort keys
--
-- 管理中心的生成紀錄 / 風格庫清單使用 tenant_id（可選 user_id）過濾並依時間排序，
-- 原本只有單欄索引，Postgres 必須讀取整個租戶的資料列再排序。

CREATE INDEX IF NOT EXISTS history_tenant_created_idx
  ON history (tenant_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS history_tenant_user_created_idx
  ON history (tenant_id, user_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS styles_tenant_updated_idx
  ON styles (tenant_id, updated_at DESC, created_at DESC, id DESC);

-- 刪除風格時會先清空 history.style_id，沒有索引會造成整表掃描。
CREATE INDEX IF NOT EXISTS history_style_idx
  ON history (style_id)
  WHERE style_id IS NOT NULL;

-- 上述複合索引已完全涵蓋這些前綴索引。
DROP INDEX IF EXISTS history_tenant_idx;
DROP INDEX IF EXISTS history_user_idx;
DROP INDEX IF EXISTS styles_tenant_idx;
