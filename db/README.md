# Database Schema

This folder contains PostgreSQL migration scripts for Phase 2.

## Connection

Set `DATABASE_URL` in your Functions settings (local or Azure). Example:

```text
postgresql://<user>:<password>@<host>:5432/<db>?sslmode=require
```

## Apply (manual)

1. Connect to the PostgreSQL Flexible Server.
2. Run the migration scripts in order.

Example:

```sql
\i db/migrations/001_init.sql
\i db/migrations/002_add_history_fields.sql
```

Notes:
- The schema uses `pgvector` and expects the `vector` extension.
- Tenant isolation is modeled via `tenant_id` on all tables.
