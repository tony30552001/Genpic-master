# Database Schema

This folder contains PostgreSQL migration scripts for Phase 2.

## Connection

Set `DATABASE_URL` in your Functions settings (local or Azure). Example:

```text
postgresql://<user>:<password>@<host>:5432/<db>?sslmode=require
```

## Apply

`api/scripts/migrate.cjs` reads `DATABASE_URL`（`DATABASE_SSL=true` 時啟用 SSL）。

```powershell
# 全部依序執行
npm --prefix api run migrate

# 只執行指定檔案（部署新功能時常用）
node api/scripts/migrate.cjs 012_deck_job_events.sql
```

所有 migration 都應可重複執行（`IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS`）。

Notes:
- The schema uses `pgvector` and expects the `vector` extension.
- Tenant isolation is modeled via `tenant_id` on all tables.
